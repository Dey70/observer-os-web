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
    } = body;

    // Need at least some data to generate a useful insight
    if (!avgSleep7d && !thisWeekSessions && !todayCals) {
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
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are Observer OS Coach — an elite AI performance coach. Give ONE specific, data-driven insight based on this athlete's numbers. Exactly 1-2 sentences. Lead with the key finding, reference actual numbers. No encouragement, no fluff — just the insight.

${lines}`;

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 120,
        temperature: 0.6,
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
