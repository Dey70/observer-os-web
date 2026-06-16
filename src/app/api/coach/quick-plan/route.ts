// src/app/api/coach/quick-plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { executeTool } from "@/lib/agent-tools";
import { calcReadiness } from "@/lib/utils";

const VALID_FOCUS = [
  "balanced",
  "running",
  "strength",
  "deload",
  "study_heavy",
];

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

    const { data: rawProfile } = await supabase
      .from("profiles")
      .select("split")
      .eq("user_id", user.id)
      .maybeSingle();
    const profileSplit = (rawProfile as any)?.split as string | undefined;
    const focus = VALID_FOCUS.includes(profileSplit ?? "")
      ? (profileSplit as string)
      : "balanced";

    const since = new Date(Date.now() - 3 * 86400000)
      .toISOString()
      .split("T")[0];
    const { data: rawLogs } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", since)
      .order("date", { ascending: false })
      .limit(1);
    const lastLog = (rawLogs as any[] | null)?.[0];
    let intensity: "low" | "moderate" | "high" = "moderate";
    if (lastLog) {
      const score = calcReadiness(
        lastLog.sleep_quality,
        lastLog.soreness,
        lastLog.fatigue,
        lastLog.mood,
        lastLog.energy,
      ).score;
      intensity = score >= 8 ? "high" : score >= 5 ? "moderate" : "low";
    }

    const result = await executeTool(
      "generate_training_plan",
      { focus, intensity },
      supabase,
      user.id,
    );

    let parsed: any;
    try {
      parsed = JSON.parse(result);
    } catch {
      return NextResponse.json({ error: result }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
