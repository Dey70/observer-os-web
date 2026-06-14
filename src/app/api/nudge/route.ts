import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calcReadiness } from "@/lib/utils";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { checkin } = body;

    const since = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .split("T")[0];
    const [{ data: recentLogs }, { data: recentSessions }] = await Promise.all([
      supabase
        .from("daily_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", since)
        .order("date"),
      supabase
        .from("sessions")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", since)
        .order("date"),
    ]);

    const readiness = calcReadiness(
      checkin.sleep_quality,
      checkin.soreness,
      checkin.fatigue,
      checkin.mood,
      checkin.energy,
    );

    const prompt = `Today's check-in:
Sleep: ${checkin.sleep_hours}hrs, quality ${checkin.sleep_quality}/10
Soreness: ${checkin.soreness}/10, Fatigue: ${checkin.fatigue}/10
Mood: ${checkin.mood}/10, Energy: ${checkin.energy}/10
Readiness score: ${readiness.score}/10 (${readiness.label})

Last 7 days context:
${JSON.stringify(recentLogs ?? [])}

Recent sessions:
${JSON.stringify(recentSessions ?? [])}

Give ONE specific, actionable coaching insight for today. Max 2 sentences. Base it on the actual numbers — reference specific data points. Be direct, not encouraging.`;

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 100,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return NextResponse.json({ nudge: null });

    const data = await response.json();
    const nudge = data.choices?.[0]?.message?.content ?? null;

    return NextResponse.json({ nudge, readiness });
  } catch (err) {
    return NextResponse.json({ nudge: null, error: String(err) });
  }
}
