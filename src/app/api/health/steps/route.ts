import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  const secret = process.env.HEALTH_SYNC_SECRET;
  if (!secret || scheme !== "Bearer" || !token) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({}, { status: 401 });
  }

  const userId = process.env.HEALTH_SYNC_USER_ID;
  if (!userId) {
    return NextResponse.json(
      { error: "HEALTH_SYNC_USER_ID is not configured" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { date, steps } = (body ?? {}) as { date?: unknown; steps?: unknown };

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date must be a string in YYYY-MM-DD format" },
      { status: 400 },
    );
  }
  if (typeof steps !== "number" || !Number.isInteger(steps) || steps < 0) {
    return NextResponse.json(
      { error: "steps must be a non-negative integer" },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("daily_steps")
    .upsert(
      { user_id: userId, date, steps, synced_at: new Date().toISOString() },
      { onConflict: "user_id,date" },
    );

  if (error) {
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, date, steps });
}
