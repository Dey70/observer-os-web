/**
 * POST /api/review
 *
 * Generates a Weekly Performance Report covering all three Observer pillars:
 *
 *   Pillar 1 — Training   (running, strength, recovery)
 *   Pillar 2 — Nutrition  (calories, protein, hydration, weight)
 *   Pillar 3 — Growth     (study, deep work, projects, learning)
 *
 * This is NOT a running report. Observer is a Hybrid Athlete OS.
 */

import { NextResponse }               from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calcReadiness }              from "@/lib/utils";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL    = "openai/gpt-oss-120b";

// ── Types ──────────────────────────────────────────────────────────────────

type NutritionRow = {
  date:      string;
  meal_type: string;
  item_name: string;
  calories:  number;
  protein:   number;
  carbs:     number;
  fat:       number;
  fiber:     number;
};

type GrowthLogRow = {
  date:         string;
  category:     string;
  title:        string;
  duration_min: number;
  focus_score:  number | null;
  output_notes: string | null;
};

type SessionRow = {
  date:     string;
  type:     string;
  duration: number;
  rpe:      number;
  notes?:   string;
};

// ── Nutrition aggregator ───────────────────────────────────────────────────

function aggregateNutrition(rows: NutritionRow[]) {
  const byDate: Record<string, { calories: number; protein: number; carbs: number; fat: number; daysLogged: number }> = {};
  for (const r of rows) {
    if (!byDate[r.date]) byDate[r.date] = { calories: 0, protein: 0, carbs: 0, fat: 0, daysLogged: 1 };
    byDate[r.date].calories += r.calories;
    byDate[r.date].protein  += r.protein;
    byDate[r.date].carbs    += r.carbs;
    byDate[r.date].fat      += r.fat;
  }
  return Object.values(byDate);
}

// ── Growth aggregator ──────────────────────────────────────────────────────

function aggregateGrowth(growthLogs: GrowthLogRow[], studySessions: SessionRow[]) {
  const totalGrowthMin = growthLogs.reduce((s, r) => s + r.duration_min, 0);
  const totalStudyMin  = studySessions.reduce((s, r) => s + (r.duration ?? 0), 0);
  const totalMinutes   = totalGrowthMin + totalStudyMin;

  const byCategory: Record<string, { minutes: number; sessions: number }> = {};
  for (const r of growthLogs) {
    byCategory[r.category] ??= { minutes: 0, sessions: 0 };
    byCategory[r.category].minutes  += r.duration_min;
    byCategory[r.category].sessions += 1;
  }
  if (studySessions.length) {
    byCategory.study ??= { minutes: 0, sessions: 0 };
    byCategory.study.minutes  += totalStudyMin;
    byCategory.study.sessions += studySessions.length;
  }

  const focusScores = growthLogs.map((r) => r.focus_score).filter((s): s is number => s !== null);
  const avgFocus    = focusScores.length
    ? Math.round(focusScores.reduce((s, v) => s + v, 0) / focusScores.length * 10) / 10
    : null;

  return { totalMinutes, totalHours: +(totalMinutes / 60).toFixed(1), byCategory, avgFocus };
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: "Groq API key not configured" }, { status: 500 });
    }

    const since7  = new Date(Date.now() -  7 * 86400000).toISOString().split("T")[0];
    const since14 = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];

    // Load all pillars in parallel
    const [
      { data: logs },
      { data: allSessions },
      { data: weights },
      { data: goals },
      { data: rawNutrition },
      { data: rawGrowthLogs },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] = await Promise.all([
      supabase.from("daily_logs").select("*").eq("user_id", user.id).gte("date", since14).order("date"),
      supabase.from("sessions").select("*").eq("user_id", user.id).gte("date", since7).order("date"),
      supabase.from("weight_logs").select("date, weight").eq("user_id", user.id).gte("date", since14).order("date"),
      supabase.from("goals").select("*").eq("user_id", user.id).eq("active", true),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("nutrition_logs")
        .select("date, meal_type, item_name, calories, protein, carbs, fat, fiber")
        .eq("user_id", user.id).gte("date", since7).order("date"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("growth_logs")
        .select("date, category, title, duration_min, focus_score, output_notes")
        .eq("user_id", user.id).gte("date", since7).order("date"),
    ]);

    const sessions    = ((allSessions ?? []) as SessionRow[]);
    const runSessions = sessions.filter((s) => s.type === "run");
    const liftSessions= sessions.filter((s) => s.type === "lift");
    const studySessLegacy = sessions.filter((s) => s.type === "study");
    const growthLogs  = ((rawGrowthLogs ?? []) as GrowthLogRow[]);

    // ── Pillar 1: Training ─────────────────────────────────────────────────

    const readinessScores = ((logs ?? []) as Record<string, number>[]).map(
      (l) => calcReadiness(l.sleep_quality, l.soreness, l.fatigue, l.mood, l.energy).score,
    );
    const avgReadiness = readinessScores.length
      ? (readinessScores.reduce((s, v) => s + v, 0) / readinessScores.length).toFixed(1)
      : null;

    const recentLogs = ((logs ?? []) as Record<string, number>[]);
    const avgSleep   = recentLogs.length
      ? (recentLogs.reduce((s, l) => s + l.sleep_hours, 0) / recentLogs.length).toFixed(1)
      : null;
    const avgEnergy  = recentLogs.length
      ? (recentLogs.reduce((s, l) => s + l.energy, 0)  / recentLogs.length).toFixed(1)
      : null;
    const avgMood    = recentLogs.length
      ? (recentLogs.reduce((s, l) => s + l.mood, 0)    / recentLogs.length).toFixed(1)
      : null;

    const avgLiftRpe = liftSessions.length
      ? (liftSessions.reduce((s, r) => s + r.rpe, 0) / liftSessions.length).toFixed(1)
      : null;
    const avgRunRpe  = runSessions.length
      ? (runSessions.reduce((s, r) => s + r.rpe, 0) / runSessions.length).toFixed(1)
      : null;

    // ── Pillar 2: Nutrition ────────────────────────────────────────────────

    const nutritionDays  = aggregateNutrition((rawNutrition ?? []) as NutritionRow[]);
    const avgCalories    = nutritionDays.length
      ? Math.round(nutritionDays.reduce((s, d) => s + d.calories, 0) / nutritionDays.length)
      : null;
    const avgProtein     = nutritionDays.length
      ? Math.round(nutritionDays.reduce((s, d) => s + d.protein, 0)  / nutritionDays.length)
      : null;
    const weightEntries  = ((weights ?? []) as { date: string; weight: number }[]);
    const weightTrend    = weightEntries.length >= 2
      ? `${weightEntries[0].weight} kg → ${weightEntries[weightEntries.length - 1].weight} kg`
      : weightEntries.length === 1 ? `${weightEntries[0].weight} kg` : null;

    // ── Pillar 3: Growth ───────────────────────────────────────────────────

    const growth = aggregateGrowth(growthLogs, studySessLegacy);

    // ── Prompt ─────────────────────────────────────────────────────────────

    const prompt = `You are Observer Coach generating a Weekly Performance Report for a hybrid athlete.

Observer tracks three performance pillars: Training, Nutrition, and Growth.
This is NOT a running report. Evaluate the athlete holistically across all three pillars.

---
PILLAR 1 — TRAINING (last 7 days)

Running: ${runSessions.length} session(s)
Lifting: ${liftSessions.length} session(s), avg RPE ${avgLiftRpe ?? "N/A"}
Running avg RPE: ${avgRunRpe ?? "N/A"}

Recovery (last 14 days — ${recentLogs.length} check-ins):
  Avg readiness: ${avgReadiness ?? "N/A"}/10
  Avg sleep:     ${avgSleep ?? "N/A"}h
  Avg energy:    ${avgEnergy ?? "N/A"}/10
  Avg mood:      ${avgMood ?? "N/A"}/10

---
PILLAR 2 — NUTRITION (last 7 days, ${nutritionDays.length} days logged)

Avg daily calories: ${avgCalories ?? "Not tracked"} kcal
Avg daily protein:  ${avgProtein  ?? "Not tracked"} g
Weight trend:       ${weightTrend ?? "No weight data"}

---
PILLAR 3 — GROWTH (last 7 days)

Total focused hours: ${growth.totalHours}h across ${Object.values(growth.byCategory).reduce((s, c) => s + c.sessions, 0)} sessions
By category:
${Object.entries(growth.byCategory).map(([cat, data]) => `  ${cat}: ${(data.minutes / 60).toFixed(1)}h (${data.sessions} sessions)`).join("\n") || "  No growth sessions logged"}
Avg focus score: ${growth.avgFocus ?? "N/A"} / 10

Growth log details:
${growthLogs.length ? JSON.stringify(growthLogs.slice(0, 10)) : "No growth_logs entries — used study sessions as fallback"}

---
ACTIVE GOALS:
${JSON.stringify((goals ?? []).slice(0, 6))}

---

Generate a structured Weekly Performance Report. Use this exact format:

**TRAINING**
[2–3 sentences. Cover running sessions, strength sessions, and recovery quality. Use actual numbers. Identify the strongest and weakest training day.]

**NUTRITION**
[2–3 sentences. Cover calorie and protein adherence. Flag any underfuelling days. Note weight trend if data exists.]

**GROWTH**
[2–3 sentences. Cover total focused hours, session quality (focus score), and what was worked on. If growth is low, say so directly.]

**OVERALL ASSESSMENT**
[1–2 sentences. Honest summary of the week across all three pillars. What was the dominant limiting factor?]

**NEXT WEEK — ACTION ITEMS**
[3 specific, numbered, data-driven actions — one per pillar. No generic advice.]

Be direct. Use numbers. Under 400 words total.`;

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  800,
        temperature: 0.55,
        messages:    [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("review_groq_error", response.status, errBody);
      return NextResponse.json({ error: `Groq error ${response.status}` }, { status: 500 });
    }

    const data   = await response.json();
    const review = data.choices?.[0]?.message?.content ?? "Unable to generate review.";

    return NextResponse.json({ review, generated_at: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("review_error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
