import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateDailyTargets, readinessFromLog } from "@/lib/nutritionEngine";
import type { Session, DailyLog } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const date =
      url.searchParams.get("date") || new Date().toISOString().split("T")[0];

    const [
      { data: rawProfile },
      { data: rawWeights },
      { data: rawSessions },
      { data: rawLog },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("weight_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(1),
      supabase
        .from("sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", date),
      supabase
        .from("daily_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", date)
        .maybeSingle(),
    ]);

    const profile = rawProfile as any;
    const weights = (rawWeights ?? []) as any[];
    const sessions = (rawSessions ?? []) as Session[];
    const log = rawLog as DailyLog | null;

    const missing: string[] = [];
    if (!profile?.age) missing.push("age");
    if (!profile?.height_cm) missing.push("height");
    if (!weights.length) missing.push("weight");

    if (missing.length) {
      return NextResponse.json(
        {
          error: "Missing required profile data",
          missing,
        },
        { status: 422 },
      );
    }

    const targets = calculateDailyTargets(
      {
        sex: profile.sex || "male",
        age: profile.age,
        height_cm: profile.height_cm,
        weight_kg: weights[0].weight,
        goal_type: profile.nutrition_goal_type || "maintain",
        target_weight_kg: profile.target_weight,
        goal_deadline: null,
      },
      sessions,
      readinessFromLog(log),
    );

    return NextResponse.json({ date, targets });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
