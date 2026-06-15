// Personal Records detection logic
// Called after a successful session insert

import { SupabaseClient } from "@supabase/supabase-js";

export type PR = {
  metric: string;
  label: string;
  value: number;
  unit: string;
  previous: number | null;
};

export async function detectPRs(
  supabase: SupabaseClient,
  userId: string,
  session: {
    id?: number;
    type: "run" | "lift" | "study";
    duration: number;
    rpe: number;
    date: string;
    distance?: number;
    notes?: string;
  },
): Promise<PR[]> {
  const prs: PR[] = [];

  // Fetch past sessions of same type (exclude today's just inserted)
  const { data: pastSessions } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("type", session.type)
    .neq("date", session.date)
    .order("date", { ascending: false });

  const past = (pastSessions ?? []) as any[];

  // Fetch existing PRs
  const { data: existingPRs } = await (supabase as any)
    .from("personal_records")
    .select("*")
    .eq("user_id", userId)
    .eq("type", session.type);

  const prMap: Record<string, { value: number; id: number }> = {};
  for (const pr of (existingPRs ?? []) as any[]) {
    prMap[pr.metric] = { value: pr.value, id: pr.id };
  }

  async function checkAndSavePR(
    metric: string,
    label: string,
    currentValue: number,
    unit: string,
    higherIsBetter = true,
  ) {
    const existing = prMap[metric];
    const isBetter = existing
      ? higherIsBetter
        ? currentValue > existing.value
        : currentValue < existing.value
      : true;

    if (isBetter) {
      // Upsert the PR
      await (supabase as any).from("personal_records").upsert(
        {
          user_id: userId,
          type: session.type,
          metric,
          value: currentValue,
          date: session.date,
        },
        { onConflict: "user_id,type,metric" },
      );

      prs.push({
        metric,
        label,
        value: currentValue,
        unit,
        previous: existing?.value ?? null,
      });
    }
  }

  if (session.type === "run") {
    // 1. Longest duration run
    const maxDuration =
      past.length > 0 ? Math.max(...past.map((s) => s.duration)) : 0;
    if (session.duration > maxDuration) {
      await checkAndSavePR(
        "longest_run",
        "Longest Run",
        session.duration,
        "min",
      );
    }

    // 2. Distance PR (if distance logged via notes pattern or distance field)
    // We check duration as proxy for distance PRs when no distance field
    const maxLoad =
      past.length > 0 ? Math.max(...past.map((s) => s.duration * s.rpe)) : 0;
    const currentLoad = session.duration * session.rpe;
    if (currentLoad > maxLoad) {
      await checkAndSavePR(
        "highest_load_run",
        "Highest Training Load",
        currentLoad,
        "pts",
      );
    }
  }

  if (session.type === "lift") {
    // 1. Longest lift session
    const maxDuration =
      past.length > 0 ? Math.max(...past.map((s) => s.duration)) : 0;
    if (session.duration > maxDuration) {
      await checkAndSavePR(
        "longest_lift",
        "Longest Lift Session",
        session.duration,
        "min",
      );
    }

    // 2. Highest intensity lift (duration × rpe)
    const maxLoad =
      past.length > 0 ? Math.max(...past.map((s) => s.duration * s.rpe)) : 0;
    const currentLoad = session.duration * session.rpe;
    if (currentLoad > maxLoad) {
      await checkAndSavePR(
        "highest_load_lift",
        "Highest Training Load",
        currentLoad,
        "pts",
      );
    }
  }

  if (session.type === "study") {
    // 1. Longest study session
    const maxDuration =
      past.length > 0 ? Math.max(...past.map((s) => s.duration)) : 0;
    if (session.duration > maxDuration) {
      await checkAndSavePR(
        "longest_study",
        "Longest Study Session",
        session.duration,
        "min",
      );
    }

    // 2. Highest focus load (duration × rpe as proxy for focus intensity)
    const maxLoad =
      past.length > 0 ? Math.max(...past.map((s) => s.duration * s.rpe)) : 0;
    const currentLoad = session.duration * session.rpe;
    if (currentLoad > maxLoad) {
      await checkAndSavePR(
        "highest_focus_load",
        "Highest Focus Load",
        currentLoad,
        "pts",
      );
    }
  }

  return prs;
}
