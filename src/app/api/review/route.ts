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

    const since = new Date(Date.now() - 14 * 86400000)
      .toISOString()
      .split("T")[0];
    const [
      { data: logs },
      { data: sessions },
      { data: weights },
      { data: goals },
    ] = await Promise.all([
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
      supabase
        .from("weight_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", since)
        .order("date"),
      supabase
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .eq("active", true),
    ]);

    const readinessScores = ((logs ?? []) as any[]).map(
      (l: any) =>
        calcReadiness(l.sleep_quality, l.soreness, l.fatigue, l.mood, l.energy)
          .score,
    );
    const avgReadiness = readinessScores.length
      ? readinessScores.reduce((s: number, v: number) => s + v, 0) /
        readinessScores.length
      : null;

    const prompt = `Generate a detailed weekly performance review based on this data:

CHECK-INS (${logs?.length ?? 0} entries):
${JSON.stringify(logs ?? [])}

SESSIONS (${sessions?.length ?? 0} total):
${JSON.stringify(sessions ?? [])}

WEIGHT LOGS:
${JSON.stringify(weights ?? [])}

ACTIVE GOALS:
${JSON.stringify(goals ?? [])}

COMPUTED: Average readiness score: ${avgReadiness?.toFixed(1) ?? "N/A"}/10

Write a weekly review covering:
1. **Sleep & Recovery** — actual numbers, trend, issues
2. **Training Load** — sessions completed, types, intensity breakdown
3. **Mood & Energy** — trends and their correlation with training
4. **Body Composition** — weight trend if data exists
5. **Goal Progress** — status on each active goal
6. **Next Week Recommendations** — specific, actionable, based on the data

Be direct. Use numbers. Don't soften bad news. Keep it under 400 words.`;

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 800,
        temperature: 0.6,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const data = await response.json();
    const review =
      data.choices?.[0]?.message?.content ?? "Unable to generate review.";

    return NextResponse.json({
      review,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
