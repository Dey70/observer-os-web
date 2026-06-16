// src/app/api/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calcReadiness } from "@/lib/utils";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

type NutritionLogRow = {
  date: string;
  meal_type: string;
  item_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

type DayNutrition = {
  date: string;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  by_meal: Record<
    string,
    { calories: number; protein: number; items: string[] }
  >;
};

function aggregateNutrition(rows: NutritionLogRow[]): DayNutrition[] {
  const byDate: Record<string, DayNutrition> = {};
  for (const r of rows) {
    if (!byDate[r.date]) {
      byDate[r.date] = {
        date: r.date,
        totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        by_meal: {},
      };
    }
    const day = byDate[r.date];
    day.totals.calories += r.calories;
    day.totals.protein += r.protein;
    day.totals.carbs += r.carbs;
    day.totals.fat += r.fat;
    day.totals.fiber += r.fiber;

    if (!day.by_meal[r.meal_type]) {
      day.by_meal[r.meal_type] = { calories: 0, protein: 0, items: [] };
    }
    day.by_meal[r.meal_type].calories += r.calories;
    day.by_meal[r.meal_type].protein += r.protein;
    day.by_meal[r.meal_type].items.push(r.item_name);
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

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
      { data: rawNutritionLogs },
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
      (supabase as any)
        .from("nutrition_logs")
        .select(
          "date, meal_type, item_name, calories, protein, carbs, fat, fiber",
        )
        .eq("user_id", user.id)
        .gte("date", since)
        .order("date", { ascending: true }),
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

    const nutritionRows = (rawNutritionLogs ?? []) as NutritionLogRow[];
    const nutritionDays = aggregateNutrition(nutritionRows);

    const avgCalories = nutritionDays.length
      ? Math.round(
          nutritionDays.reduce((s, d) => s + d.totals.calories, 0) /
            nutritionDays.length,
        )
      : null;
    const avgProtein = nutritionDays.length
      ? Math.round(
          nutritionDays.reduce((s, d) => s + d.totals.protein, 0) /
            nutritionDays.length,
        )
      : null;

    const mealCoverage: Record<string, number> = {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      snack: 0,
    };
    for (const d of nutritionDays) {
      for (const mt of Object.keys(d.by_meal)) {
        if (mt in mealCoverage) mealCoverage[mt]++;
      }
    }

    const prompt = `Generate a detailed weekly performance review based on this data:

CHECK-INS (${logs?.length ?? 0} entries):
${JSON.stringify(logs ?? [])}

SESSIONS (${sessions?.length ?? 0} total):
${JSON.stringify(sessions ?? [])}

WEIGHT LOGS:
${JSON.stringify(weights ?? [])}

NUTRITION (${nutritionDays.length} of the last 14 days have logged entries):
${JSON.stringify(nutritionDays)}

ACTIVE GOALS:
${JSON.stringify(goals ?? [])}

COMPUTED: Average readiness score: ${avgReadiness?.toFixed(1) ?? "N/A"}/10
COMPUTED: Average daily calories on logged days: ${avgCalories ?? "N/A"} kcal, average daily protein: ${avgProtein ?? "N/A"}g
COMPUTED: Meal coverage over the period (days with at least one entry) — breakfast: ${mealCoverage.breakfast}, lunch: ${mealCoverage.lunch}, dinner: ${mealCoverage.dinner}, snack: ${mealCoverage.snack}

Write a weekly review covering:
1. **Sleep & Recovery** — actual numbers, trend, issues
2. **Training Load** — sessions completed, types, intensity breakdown
3. **Nutrition** — calorie/macro trends, meal-type patterns (skipped meals, snack-heavy days), whether intake matches training load
4. **Mood & Energy** — trends and their correlation with training
5. **Body Composition** — weight trend if data exists
6. **Goal Progress** — status on each active goal
7. **Next Week Recommendations** — specific, actionable, based on the data

Be direct. Use numbers. Don't soften bad news. Keep it under 450 words.`;

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 900,
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
