import type { SupabaseClient } from "@supabase/supabase-js";
import { getWeekStart } from "./utils";

export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_checkins",
      description:
        "Retrieve daily check-in logs. Use when you need sleep, mood, energy, soreness, or fatigue data.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "How many days back to fetch. Default 14, max 30.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_sessions",
      description:
        "Retrieve training and study sessions. Use when asked about training load, recent runs, lifts, or study hours.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "How many days back. Default 14.",
          },
          type: {
            type: "string",
            enum: ["run", "lift", "study", "all"],
            description: "Filter by session type.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_goals",
      description:
        "Retrieve the user's active goals and current progress toward them.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_weight_trend",
      description: "Retrieve body weight logs and calculate trend.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "How many days back. Default 14.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_nutrition",
      description:
        "Retrieve logged nutrition (calories, protein, carbs, fat, fiber) for recent days, plus today's calculated macro targets. Use when asked about diet, eating enough, macros, or whether nutrition matches training load.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "How many days back to fetch. Default 7.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_training_plan",
      description:
        "Generate a personalized weekly training plan based on current fitness data, goals, and readiness trends.",
      parameters: {
        type: "object",
        properties: {
          focus: {
            type: "string",
            enum: ["balanced", "running", "strength", "deload", "study_heavy"],
            description: "The primary focus for this training week.",
          },
          intensity: {
            type: "string",
            enum: ["low", "moderate", "high"],
            description: "Overall intensity level based on recovery data.",
          },
        },
        required: ["focus", "intensity"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_goal",
      description: "Create or update a goal for the user.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "weight",
              "sleep",
              "sessions_per_week",
              "run_distance",
              "custom",
            ],
          },
          title: { type: "string", description: "Human-readable goal title." },
          target_value: { type: "number" },
          current_value: { type: "number" },
          unit: { type: "string", description: "e.g. kg, hours, sessions, km" },
          deadline: {
            type: "string",
            description: "ISO date string, optional.",
          },
        },
        required: ["type", "title", "target_value", "current_value", "unit"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_trend",
      description:
        "Compute statistical trends for a specific metric over time.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: [
              "sleep_hours",
              "sleep_quality",
              "mood",
              "energy",
              "soreness",
              "fatigue",
              "readiness",
              "weight",
            ],
          },
          days: {
            type: "number",
            description: "Analysis window in days. Default 14.",
          },
        },
        required: ["metric"],
      },
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  try {
    switch (name) {
      case "get_checkins": {
        const days = (args.days as number) || 14;
        const since = new Date(Date.now() - days * 86400000)
          .toISOString()
          .split("T")[0];
        const { data, error } = await supabase
          .from("daily_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("date", since)
          .order("date", { ascending: false });
        if (error) return `Error: ${error.message}`;
        return JSON.stringify({ count: data?.length ?? 0, data: data ?? [] });
      }

      case "get_sessions": {
        const days = (args.days as number) || 14;
        const since = new Date(Date.now() - days * 86400000)
          .toISOString()
          .split("T")[0];
        let query = supabase
          .from("sessions")
          .select("*")
          .eq("user_id", userId)
          .gte("date", since)
          .order("date", { ascending: false });
        if (args.type && args.type !== "all") {
          query = query.eq("type", args.type as string);
        }
        const { data, error } = await query;
        if (error) return `Error: ${error.message}`;
        const totalMinutes = (data ?? []).reduce(
          (s, r) => s + (r.duration || 0),
          0,
        );
        return JSON.stringify({
          count: data?.length ?? 0,
          total_minutes: totalMinutes,
          data: data ?? [],
        });
      }

      case "get_goals": {
        const { data, error } = await supabase
          .from("goals")
          .select("*")
          .eq("user_id", userId)
          .eq("active", true)
          .order("created_at", { ascending: false });
        if (error) return `Error: ${error.message}`;
        return JSON.stringify({ count: data?.length ?? 0, goals: data ?? [] });
      }

      case "get_weight_trend": {
        const days = (args.days as number) || 14;
        const since = new Date(Date.now() - days * 86400000)
          .toISOString()
          .split("T")[0];
        const { data, error } = await supabase
          .from("weight_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("date", since)
          .order("date", { ascending: true });
        if (error) return `Error: ${error.message}`;
        const weights = (data ?? []).map((w) => w.weight);
        const avg = weights.length
          ? weights.reduce((s, v) => s + v, 0) / weights.length
          : null;
        const trend =
          weights.length >= 2
            ? weights[weights.length - 1] - weights[0] > 0
              ? "increasing"
              : "decreasing"
            : "insufficient data";
        return JSON.stringify({
          data: data ?? [],
          average: avg?.toFixed(1),
          trend,
          count: weights.length,
        });
      }

      case "get_nutrition": {
        const days = (args.days as number) || 7;
        const since = new Date(Date.now() - days * 86400000)
          .toISOString()
          .split("T")[0];
        const { data, error } = await (supabase as any)
          .from("nutrition_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("date", since)
          .order("date", { ascending: false });
        if (error) return `Error: ${error.message}`;

        const rows = (data ?? []) as any[];
        const byDate: Record<
          string,
          {
            calories: number;
            protein: number;
            carbs: number;
            fat: number;
            fiber: number;
            items: string[];
          }
        > = {};
        for (const r of rows) {
          if (!byDate[r.date]) {
            byDate[r.date] = {
              calories: 0,
              protein: 0,
              carbs: 0,
              fat: 0,
              fiber: 0,
              items: [],
            };
          }
          byDate[r.date].calories += r.calories;
          byDate[r.date].protein += r.protein;
          byDate[r.date].carbs += r.carbs;
          byDate[r.date].fat += r.fat;
          byDate[r.date].fiber += r.fiber;
          byDate[r.date].items.push(`${r.meal_type}: ${r.item_name}`);
        }

        // Today's targets for comparison
        const today = new Date().toISOString().split("T")[0];
        const [
          { data: profile },
          { data: weights },
          { data: todaySessions },
          { data: todayLog },
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("weight_logs")
            .select("*")
            .eq("user_id", userId)
            .order("date", { ascending: false })
            .limit(1),
          supabase
            .from("sessions")
            .select("*")
            .eq("user_id", userId)
            .eq("date", today),
          supabase
            .from("daily_logs")
            .select("*")
            .eq("user_id", userId)
            .eq("date", today)
            .maybeSingle(),
        ]);

        let todaysTargets = null;
        const p = profile as any;
        if (p?.age && p?.height_cm && weights?.length) {
          const { calculateDailyTargets, readinessFromLog } =
            await import("./nutritionEngine");
          todaysTargets = calculateDailyTargets(
            {
              sex: p.sex || "male",
              age: p.age,
              height_cm: p.height_cm,
              weight_kg: (weights as any[])[0].weight,
              goal_type: p.nutrition_goal_type || "maintain",
              target_weight_kg: p.target_weight,
              goal_deadline: null,
            },
            (todaySessions ?? []) as any[],
            readinessFromLog(todayLog as any),
          );
        }

        return JSON.stringify({
          count: rows.length,
          by_date: byDate,
          todays_targets: todaysTargets,
        });
      }

      case "generate_training_plan": {
        const focus = args.focus as string;
        const intensity = args.intensity as string;
        const weekStart = getWeekStart();

        const planTemplates: Record<string, Record<string, unknown>[]> = {
          balanced: [
            {
              day: "Monday",
              type: "run",
              title: "Easy run",
              description: "Zone 2 aerobic base",
              target_rpe: 4,
            },
            {
              day: "Tuesday",
              type: "lift",
              title: "Upper body",
              description: "Push/pull compound movements",
              target_rpe: 6,
            },
            {
              day: "Wednesday",
              type: "study",
              title: "Deep work block",
              description: "High-focus study session",
            },
            {
              day: "Thursday",
              type: "run",
              title: "Tempo run",
              description: "Comfortably hard pace",
              target_rpe: 7,
            },
            {
              day: "Friday",
              type: "lift",
              title: "Lower body",
              description: "Squat + hinge focus",
              target_rpe: 7,
            },
            {
              day: "Saturday",
              type: "run",
              title: "Long run",
              description: "Easy long-distance aerobic",
              target_rpe: 5,
            },
            {
              day: "Sunday",
              type: "rest",
              title: "Rest + review",
              description: "Recovery, mobility, weekly review",
            },
          ],
          running: [
            {
              day: "Monday",
              type: "run",
              title: "Easy recovery run",
              description: "Zone 2, keep it easy",
              target_rpe: 3,
            },
            {
              day: "Tuesday",
              type: "run",
              title: "Interval work",
              description: "6×800m at 5K pace",
              target_rpe: 8,
            },
            {
              day: "Wednesday",
              type: "rest",
              title: "Active recovery",
              description: "Walk, stretch, mobility",
            },
            {
              day: "Thursday",
              type: "run",
              title: "Threshold run",
              description: "20–25 min at lactate threshold",
              target_rpe: 7,
            },
            {
              day: "Friday",
              type: "lift",
              title: "Strength support",
              description: "Legs + core for running economy",
              target_rpe: 5,
            },
            {
              day: "Saturday",
              type: "run",
              title: "Long run",
              description: "Easy aerobic effort",
              target_rpe: 4,
            },
            {
              day: "Sunday",
              type: "rest",
              title: "Full rest",
              description: "Zero physical stress",
            },
          ],
          strength: [
            {
              day: "Monday",
              type: "lift",
              title: "Squat day",
              description: "Back squat + accessory",
              target_rpe: 8,
            },
            {
              day: "Tuesday",
              type: "run",
              title: "Easy aerobic",
              description: "Light Zone 2 conditioning",
              target_rpe: 3,
            },
            {
              day: "Wednesday",
              type: "lift",
              title: "Press day",
              description: "OHP + bench + rows",
              target_rpe: 8,
            },
            {
              day: "Thursday",
              type: "study",
              title: "Study block",
              description: "Mental recovery from training",
            },
            {
              day: "Friday",
              type: "lift",
              title: "Deadlift day",
              description: "Hinge pattern + back volume",
              target_rpe: 8,
            },
            {
              day: "Saturday",
              type: "run",
              title: "Conditioning",
              description: "20–30 min easy run",
              target_rpe: 4,
            },
            {
              day: "Sunday",
              type: "rest",
              title: "Full rest",
              description: "Eat, sleep, recover",
            },
          ],
          deload: [
            {
              day: "Monday",
              type: "run",
              title: "Very easy run",
              description: "20 min Zone 1 jog",
              target_rpe: 2,
            },
            {
              day: "Tuesday",
              type: "lift",
              title: "Light lift",
              description: "50% of normal weight, high reps",
              target_rpe: 4,
            },
            {
              day: "Wednesday",
              type: "rest",
              title: "Rest",
              description: "Full rest or gentle walk",
            },
            {
              day: "Thursday",
              type: "study",
              title: "Study",
              description: "Low intensity study",
            },
            {
              day: "Friday",
              type: "lift",
              title: "Light lift",
              description: "Same as Tuesday",
              target_rpe: 4,
            },
            {
              day: "Saturday",
              type: "rest",
              title: "Rest",
              description: "Full rest",
            },
            {
              day: "Sunday",
              type: "rest",
              title: "Review",
              description: "Weekly review and planning",
            },
          ],
          study_heavy: [
            {
              day: "Monday",
              type: "study",
              title: "Study block",
              description: "Deep work, no distractions",
            },
            {
              day: "Tuesday",
              type: "run",
              title: "Easy run",
              description: "Clear your head",
              target_rpe: 3,
            },
            {
              day: "Wednesday",
              type: "study",
              title: "Study block",
              description: "Deep work",
            },
            {
              day: "Thursday",
              type: "lift",
              title: "Quick lift",
              description: "Full body, 45 min max",
              target_rpe: 6,
            },
            {
              day: "Friday",
              type: "study",
              title: "Study block",
              description: "Deep work",
            },
            {
              day: "Saturday",
              type: "run",
              title: "Long run",
              description: "Stress relief run",
              target_rpe: 4,
            },
            {
              day: "Sunday",
              type: "rest",
              title: "Rest + review",
              description: "Full rest, weekly review",
            },
          ],
        };

        const basePlan = planTemplates[focus] || planTemplates.balanced;
        const weekDate = new Date(weekStart);

        const plan = basePlan.map((day, i) => {
          const date = new Date(weekDate);
          date.setDate(weekDate.getDate() + i);
          const target_rpe = day.target_rpe as number | undefined;
          const adjusted_rpe = target_rpe
            ? intensity === "low"
              ? Math.max(1, target_rpe - 2)
              : intensity === "high"
                ? Math.min(10, target_rpe + 1)
                : target_rpe
            : undefined;
          return {
            ...day,
            date: date.toISOString().split("T")[0],
            target_rpe: adjusted_rpe,
          };
        });

        const { error } = await (supabase as any).from("training_plans").upsert(
          {
            user_id: userId,
            week_start: weekStart,
            plan,
            notes: `Generated for ${focus} focus, ${intensity} intensity`,
            generated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,week_start" },
        );

        if (error) return `Plan generated but save failed: ${error.message}`;
        return JSON.stringify({
          success: true,
          week_start: weekStart,
          focus,
          intensity,
          plan,
        });
      }

      case "update_goal": {
        const { error } = await (supabase as any).from("goals").insert({
          user_id: userId,
          type: args.type as string,
          title: args.title as string,
          target_value: args.target_value as number,
          current_value: args.current_value as number,
          unit: args.unit as string,
          deadline: (args.deadline as string) || null,
          active: true,
        });
        if (error) return `Error saving goal: ${error.message}`;
        return JSON.stringify({
          success: true,
          message: "Goal saved successfully.",
        });
      }

      case "analyze_trend": {
        const metric = args.metric as string;
        const days = (args.days as number) || 14;
        const since = new Date(Date.now() - days * 86400000)
          .toISOString()
          .split("T")[0];

        if (metric === "weight") {
          const { data } = await supabase
            .from("weight_logs")
            .select("date, weight")
            .eq("user_id", userId)
            .gte("date", since)
            .order("date");
          const vals = (data ?? []).map((r) => r.weight);
          return buildTrendResult(metric, vals);
        }

        const cols =
          metric === "readiness"
            ? "date, sleep_quality, soreness, fatigue, mood, energy"
            : "date, " + metric;

        const { data: rawRows } = await (supabase as any)
          .from("daily_logs")
          .select(cols)
          .eq("user_id", userId)
          .gte("date", since)
          .order("date");

        const rows = (rawRows ?? []) as Record<string, number>[];

        let vals: number[];
        if (metric === "readiness") {
          const { calcReadiness } = await import("./utils");
          vals = rows.map(
            (r) =>
              calcReadiness(
                r.sleep_quality,
                r.soreness,
                r.fatigue,
                r.mood,
                r.energy,
              ).score,
          );
        } else {
          vals = rows.map((r) => r[metric] as number);
        }

        return buildTrendResult(metric, vals);
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool execution error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function buildTrendResult(metric: string, vals: number[]): string {
  if (!vals.length)
    return JSON.stringify({ metric, error: "No data in range" });
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const last = vals[vals.length - 1];
  const first = vals[0];
  const delta = last - first;
  const trend =
    Math.abs(delta) < 0.2 ? "stable" : delta > 0 ? "increasing" : "decreasing";
  return JSON.stringify({
    metric,
    count: vals.length,
    avg: avg.toFixed(2),
    min,
    max,
    latest: last,
    trend,
    delta: delta.toFixed(2),
  });
}
