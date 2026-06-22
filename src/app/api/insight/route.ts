import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ insight: null }, { status: 401 });

    const body = await req.json();
    const {
      // Basic metrics (always present when called)
      avgSleep7d,
      todaySleep,
      avgMood7d,
      avgEnergy7d,
      sessionTypes,
      todayCals,
      calTarget,
      latestWeight,
      weightChange7d,
      checkinStreak,
      thisWeekSessions,
      weeklyGoal,
      // Phase 3 metrics (optional — richer insight when available)
      readinessScore,
      readinessGrade,
      tsb,
      ctl,
      hybridScore,
      hybridLevel,
    } = body;

    if (!avgSleep7d && !thisWeekSessions && !todayCals && !readinessScore) {
      return NextResponse.json({ insight: null });
    }

    const lines = [
      `7-day averages: sleep ${avgSleep7d ?? "?"}h, mood ${avgMood7d ?? "?"}/10, energy ${avgEnergy7d ?? "?"}/10`,
      `Sessions this week: ${thisWeekSessions}/${weeklyGoal} goal (run×${sessionTypes?.run ?? 0}, lift×${sessionTypes?.lift ?? 0}, study×${sessionTypes?.study ?? 0})`,
      `Today: sleep ${todaySleep != null ? todaySleep + "h" : "not logged"}, calories ${todayCals != null ? todayCals + " kcal" : "not logged"}${calTarget ? " (target " + calTarget + ")" : ""}`,
      latestWeight
        ? `Weight: ${latestWeight} kg${weightChange7d != null ? " (" + (weightChange7d > 0 ? "+" : "") + weightChange7d + "kg vs last week)" : ""}`
        : null,
      `Check-in streak: ${checkinStreak} days`,
      // Phase 3 additions
      readinessScore != null ? `Readiness: ${readinessScore}/100 — ${readinessGrade ?? "unknown"}` : null,
      tsb != null           ? `TSB (training form): ${tsb > 0 ? "+" : ""}${tsb}` : null,
      ctl != null           ? `CTL (fitness): ${ctl}` : null,
      hybridScore != null   ? `Hybrid Athlete Score: ${hybridScore}/100 — ${hybridLevel ?? ""}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are Observer OS Coach — an elite AI performance coach. Give ONE specific, data-driven insight based on this athlete's numbers. Exactly 1–2 sentences. Lead with the key finding, reference actual numbers. No encouragement, no generic wellness language — just the insight.

${lines}`;

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:       "llama-3.3-70b-versatile",
        max_tokens:  130,
        temperature: 0.55,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return NextResponse.json({ insight: null });
    const data = await res.json();
    const insight = data.choices?.[0]?.message?.content?.trim() ?? null;
    return NextResponse.json({ insight });
  } catch {
    return NextResponse.json({ insight: null });
  }
}
