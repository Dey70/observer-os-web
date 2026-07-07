// src/app/api/cron/nudge/route.ts
//
// Triggered every 30 minutes by a GitHub Actions scheduled workflow (see
// .github/workflows/nudge-cron.yml) — not Vercel Cron, since Vercel's
// Hobby plan limits cron jobs to once a day, which isn't useful here.
//
// Each run computes the current time in IST and checks it against a fixed
// schedule of nudge slots. At most one slot matches per run. For each
// user with a push subscription, it only actually sends a notification if
// the relevant thing (check-in, water, nutrition, session) is genuinely
// still missing for today, and it hasn't already nudged that user for
// that category today (tracked in nudge_log).
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { pickNudgeMessage, type NudgeCategory } from "@/lib/nudgeMessages";

export const dynamic = "force-dynamic";

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

const SLOT_TOLERANCE_MINUTES = 12;

const SLOTS: { hour: number; minute: number; category: NudgeCategory }[] = [
  { hour: 9, minute: 0, category: "checkin" },
  { hour: 11, minute: 30, category: "water_1" },
  { hour: 13, minute: 30, category: "nutrition_lunch" },
  { hour: 16, minute: 0, category: "water_2" },
  { hour: 18, minute: 30, category: "nutrition_dinner" },
  { hour: 20, minute: 30, category: "session" },
];

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  const secret = process.env.CRON_SECRET;
  if (!secret || scheme !== "Bearer" || !token) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function getISTParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutesSinceMidnight: parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10),
  };
}

function findMatchingSlot(minutesSinceMidnight: number) {
  return SLOTS.find(
    (slot) => Math.abs(minutesSinceMidnight - (slot.hour * 60 + slot.minute)) <= SLOT_TOLERANCE_MINUTES,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isMissing(supabase: any, category: NudgeCategory, userId: string, dateStr: string): Promise<boolean> {
  switch (category) {
    case "checkin": {
      const { data } = await supabase
        .from("daily_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("date", dateStr)
        .limit(1);
      return !data || data.length === 0;
    }
    case "session": {
      const { data } = await supabase
        .from("sessions")
        .select("id")
        .eq("user_id", userId)
        .eq("date", dateStr)
        .limit(1);
      return !data || data.length === 0;
    }
    case "nutrition_lunch":
    case "nutrition_dinner": {
      const { data } = await supabase
        .from("nutrition_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("date", dateStr)
        .limit(1);
      return !data || data.length === 0;
    }
    case "water_1":
    case "water_2": {
      const { data } = await supabase
        .from("water_logs")
        .select("amount_ml")
        .eq("user_id", userId)
        .eq("date", dateStr);
      const total = (data ?? []).reduce(
        (sum: number, row: { amount_ml: number }) => sum + row.amount_ml,
        0,
      );
      const threshold = category === "water_1" ? 500 : 1500;
      return total < threshold;
    }
  }
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({}, { status: 401 });
  }

  const { dateStr, minutesSinceMidnight } = getISTParts(new Date());
  const slot = findMatchingSlot(minutesSinceMidnight);
  if (!slot) {
    return NextResponse.json({ skipped: "no matching slot", dateStr, minutesSinceMidnight });
  }

  const supabase = createServiceRoleClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: subs } = await (supabase as any)
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth");

  if (!subs?.length) {
    return NextResponse.json({ category: slot.category, sent: 0, reason: "no subscribers" });
  }

  const userIds = [...new Set((subs as { user_id: string }[]).map((s) => s.user_id))];
  let sent = 0;

  for (const userId of userIds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: alreadySent } = await (supabase as any)
      .from("nudge_log")
      .select("id")
      .eq("user_id", userId)
      .eq("category", slot.category)
      .eq("date", dateStr)
      .limit(1);
    if (alreadySent && alreadySent.length > 0) continue;

    const missing = await isMissing(supabase, slot.category, userId, dateStr);
    if (!missing) continue;

    const message = pickNudgeMessage(slot.category);
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      tag: slot.category,
    });

    const userSubs = (subs as { user_id: string; endpoint: string; p256dh: string; auth: string }[]).filter(
      (s) => s.user_id === userId,
    );

    const results = await Promise.allSettled(
      userSubs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        ),
      ),
    );

    // Clean up subscriptions the push service says are gone (expired/unsubscribed).
    await Promise.all(
      results.map((result, i) => {
        if (result.status !== "rejected") return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statusCode = (result.reason as any)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          return supabase
            .from("push_subscriptions")
            .delete()
            .eq("user_id", userId)
            .eq("endpoint", userSubs[i].endpoint);
        }
        return null;
      }),
    );

    if (results.some((r) => r.status === "fulfilled")) {
      sent += 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("nudge_log")
        .insert({ user_id: userId, category: slot.category, date: dateStr });
    }
  }

  return NextResponse.json({ category: slot.category, sent, users: userIds.length });
}
