/**
 * CoachContext — server-side data aggregator.
 *
 * Builds a complete, typed snapshot of an athlete's current state by
 * combining raw Supabase data with the computed Phase 3 metrics.
 * Intended for use in API routes; never imported by client components.
 *
 * Separating this from the client-side loadIntelligence() function means
 * API routes get the same computed metrics without re-implementing the
 * calculation logic inline.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeRecoveryScore }      from "@/lib/recoveryScore";
import { computeCTLATLTSB }          from "@/lib/trainingLoad";
import type { TrainingMetricRow }    from "@/lib/trainingLoad";
import { computeReadiness }          from "@/lib/readiness";
import type { ReadinessOutput }      from "@/lib/readiness";
import { runCoachEngine }            from "@/lib/coachEngine";
import type { CoachOutput, GoalProgress } from "@/lib/coachEngine";
import { computeHybridScore }        from "@/lib/hybridScore";
import type { HybridScoreOutput }    from "@/lib/hybridScore";
import { calculateDailyTargets }     from "@/lib/nutritionEngine";
import type { NutritionProfileInputs } from "@/lib/nutritionEngine";
import { calcCheckinStreak, calcSessionStreak } from "@/lib/utils";
import type { DailyLog, Session, RunningActivity } from "@/types";
import { computeAdaptiveGoals } from "@/lib/adaptiveGoals";
import type { AdaptiveGoalOutput } from "@/lib/adaptiveGoals";

// ── Types ──────────────────────────────────────────────────────────────────

type ProfileRow = {
  name:                    string | null;
  age:                     number | null;
  sex:                     "male" | "female" | null;
  height_cm:               number | null;
  split:                   string | null;
  weekly_goal:             number | null;
  notes:                   string | null;
  nutrition_goal_type:     string | null;
  target_weight:           number | null;
  weekly_run_km_target:    number | null;
  weekly_run_count_target: number | null;
  weekly_gym_target:       number | null;
};

export interface CoachContext {
  // Identity
  userId:         string;
  profileName:    string | null;
  profileNotes:   string | null;
  // Biometric
  profileAge:     number | null;
  profileSex:     "male" | "female" | null;
  profileSplit:   string | null;
  profileWeeklyGoal:       number | null;
  profileWeeklyKmTarget:   number | null;
  profileWeeklyRunTarget:  number | null;
  profileWeeklyGymTarget:  number | null;
  currentWeightKg: number | null;
  // Phase 3 computed metrics
  readiness:      ReadinessOutput | null;
  recoveryScore:  number | null;
  ctl:            number;
  atl:            number;
  tsb:            number;
  hybrid:         HybridScoreOutput;
  coach:          CoachOutput;        // deterministic baseline — fallback + context
  goalProgress:   GoalProgress;
  // Streaks
  checkinStreak:  number;
  sessionStreak:  number;
  // Targets
  nutritionTargets: { protein: number; waterMl: number };
  // Recent data (for prompt context)
  todayLog:        DailyLog | null;
  recentLogs:      DailyLog[];        // last 7 days
  recentSessions:  Session[];         // last 7 days
  weeklyStats: {
    avgSleep:     number | null;
    avgMood:      number | null;
    avgEnergy:    number | null;
    sessionCount: number;
    kmThisWeek:   number;
  };
  // Phase 5A — Adaptive Goals
  adaptiveGoals: AdaptiveGoalOutput;
}

// ── Builder ────────────────────────────────────────────────────────────────

export async function buildCoachContext(
  supabase: SupabaseClient,
  userId:   string,
): Promise<CoachContext> {
  const todayStr = new Date().toISOString().split("T")[0];
  const since7   = new Date(Date.now() -  7 * 86400000).toISOString().split("T")[0];
  const since14  = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
  const since90  = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

  const [
    { data: rawLogs },
    { data: rawSessions },
    { data: rawMetrics },
    { data: rawProfile },
    { data: rawRuns },
    { data: rawWeights },
  ] = await Promise.all([
    supabase.from("daily_logs").select("*")
      .eq("user_id", userId).gte("date", since14).order("date", { ascending: false }),
    supabase.from("sessions").select("*")
      .eq("user_id", userId).gte("date", since14).order("date", { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("training_metrics")
      .select("activity_date, tss, trimp, pace_seconds_per_km, load_score, source")
      .eq("user_id", userId).gte("activity_date", since90).order("activity_date"),
    supabase.from("profiles")
      .select("name, age, sex, height_cm, split, weekly_goal, notes, nutrition_goal_type, target_weight, weekly_run_km_target, weekly_run_count_target, weekly_gym_target")
      .eq("user_id", userId).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("running_activities")
      .select("distance_meters, moving_time_seconds, activity_date")
      .eq("user_id", userId).gte("activity_date", since7),
    supabase.from("weight_logs").select("weight")
      .eq("user_id", userId).order("date", { ascending: false }).limit(1),
  ]);

  const logs     = (rawLogs     ?? []) as DailyLog[];
  const sessions = (rawSessions ?? []) as Session[];
  const metrics  = (rawMetrics  ?? []) as TrainingMetricRow[];
  const profile  = rawProfile as ProfileRow | null;
  const runs     = (rawRuns ?? []) as Pick<RunningActivity, "distance_meters" | "moving_time_seconds" | "activity_date">[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentWeightKg = ((rawWeights as any[])?.[0])?.weight ?? null;

  // ── Streaks & training load ─────────────────────────────────────────────

  const checkinStreak = calcCheckinStreak(logs);
  const sessionStreak = calcSessionStreak(sessions);

  const { ctl, atl, tsb } = metrics.length > 0
    ? computeCTLATLTSB(metrics)
    : { ctl: 0, atl: 0, tsb: 0 };

  // ── Today's state ──────────────────────────────────────────────────────

  const todayLog     = logs.find((l) => l.date === todayStr) ?? null;
  const recoveryScore = computeRecoveryScore(todayLog, tsb);

  // ── Goal progress ──────────────────────────────────────────────────────

  const weekDistM    = runs.reduce((s, r) => s + r.distance_meters, 0);
  const weekGymCount = sessions.filter((s) => s.type === "lift" && s.date >= since7).length;

  const hasKmGoal  = (profile?.weekly_run_km_target   ?? 0) > 0;
  const hasRunGoal = (profile?.weekly_run_count_target ?? 0) > 0;
  const hasGymGoal = (profile?.weekly_gym_target       ?? 0) > 0;

  const goalProgress: GoalProgress = {
    weeklyKmPct:  hasKmGoal  ? (weekDistM / 1000) / profile!.weekly_run_km_target!   : 0,
    weeklyRunPct: hasRunGoal ? runs.length          / profile!.weekly_run_count_target! : 0,
    weeklyGymPct: hasGymGoal ? weekGymCount         / profile!.weekly_gym_target!       : 0,
    hasKmGoal,
    hasRunGoal,
    hasGymGoal,
  };

  // ── Readiness + nutrition targets ──────────────────────────────────────

  let readiness:     ReadinessOutput | null = null;
  let proteinTarget  = 140;
  let waterTargetMl  = 3000;

  if (todayLog && recoveryScore !== null) {
    readiness = computeReadiness(
      recoveryScore,
      tsb,
      todayLog.sleep_quality,
      todayLog.fatigue,
      todayLog.energy,
    );

    if (profile?.sex && profile?.age && profile?.height_cm && currentWeightKg) {
      const todaySessions = sessions.filter((s) => s.date === todayStr);
      const targets = calculateDailyTargets(
        {
          sex:              profile.sex as NutritionProfileInputs["sex"],
          age:              profile.age,
          height_cm:        profile.height_cm,
          weight_kg:        currentWeightKg,
          goal_type:        (profile.nutrition_goal_type ?? "maintain") as NutritionProfileInputs["goal_type"],
          target_weight_kg: profile.target_weight ?? null,
        },
        todaySessions,
        readiness.score,
        false,
        null,
      );
      proteinTarget = targets.protein;
      waterTargetMl = targets.water;
    }
  }

  // ── Deterministic coach baseline ───────────────────────────────────────

  const coachInput = todayLog && recoveryScore !== null && readiness
    ? {
        recoveryScore,
        readinessScore: readiness.score,
        readinessGrade: readiness.grade,
        ctl, atl, tsb,
        sleepQuality: todayLog.sleep_quality,
        energy:       todayLog.energy,
        mood:         todayLog.mood,
        fatigue:      todayLog.fatigue,
        soreness:     todayLog.soreness,
        goalProgress,
        proteinTarget,
        waterTargetMl,
      }
    : {
        recoveryScore:  null,
        readinessScore: 50,
        readinessGrade: "YELLOW" as const,
        ctl, atl, tsb,
        sleepQuality: 7, energy: 5, mood: 5, fatigue: 5, soreness: 5,
        goalProgress,
        proteinTarget,
        waterTargetMl,
      };

  const coach = runCoachEngine(coachInput);

  // Growth minutes: growth_logs (preferred) + sessions(study) as fallback
  const weeklyGrowthMinutes =
    sessions
      .filter((s) => s.type === "study" && s.date >= since7)
      .reduce((sum, s) => sum + (s.duration ?? 0), 0);

  const weeklyGrowthHours = weeklyGrowthMinutes / 60;

  const hybrid = computeHybridScore(recoveryScore, ctl, null, weeklyGrowthMinutes);

  // ── Weekly stats ───────────────────────────────────────────────────────

  const recentLogs     = logs.filter((l) => l.date >= since7);
  const recentSessions = sessions.filter((s) => s.date >= since7);

  const avg    = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  const round1 = (n: number | null) => n !== null ? Math.round(n * 10) / 10 : null;

  const avgOf  = (arr: number[]) => arr.length >= 3 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

  // ── Adaptive Goals (Phase 5A) ──────────────────────────────────────────

  const weeklyLiftSessions = recentSessions.filter((s) => s.type === "lift").length;

  const adaptiveGoals = computeAdaptiveGoals({
    ctl, atl, tsb,
    readinessScore: readiness?.score ?? null,
    recoveryScore,
    sleepQuality: todayLog?.sleep_quality ?? null,
    fatigue:      todayLog?.fatigue      ?? null,
    soreness:     todayLog?.soreness     ?? null,
    energy:       todayLog?.energy       ?? null,
    avgSleepQuality7d: avgOf(recentLogs.map((l) => l.sleep_quality)),
    avgFatigue7d:      avgOf(recentLogs.map((l) => l.fatigue)),
    avgEnergy7d:       avgOf(recentLogs.map((l) => l.energy)),
    hybridScore:           hybrid.score,
    hybridGrowthComponent: hybrid.components.growth,
    weeklyRunKm:        Math.round((weekDistM / 1000) * 10) / 10,
    weeklyRunCount:     runs.length,
    weeklyLiftSessions,
    weeklyGrowthHours,
    weeklyGrowthCategories: {
      study:     weeklyGrowthHours,
      project:   0,
      learning:  0,
      deep_work: 0,
    },
    avgDailyCalories: null,
    avgDailyProtein:  null,
    proteinTargetG:    proteinTarget,
    calorieTargetKcal: null,
    waterTargetMl,
    userRunKmGoal:    profile?.weekly_run_km_target    ?? 0,
    userRunCountGoal: profile?.weekly_run_count_target ?? 0,
    userGymGoal:      profile?.weekly_gym_target       ?? 0,
  });

  return {
    userId,
    profileName:   profile?.name   ?? null,
    profileNotes:  profile?.notes  ?? null,
    profileAge:    profile?.age    ?? null,
    profileSex:    profile?.sex    ?? null,
    profileSplit:  profile?.split  ?? null,
    profileWeeklyGoal:       profile?.weekly_goal             ?? null,
    profileWeeklyKmTarget:   profile?.weekly_run_km_target    ?? null,
    profileWeeklyRunTarget:  profile?.weekly_run_count_target ?? null,
    profileWeeklyGymTarget:  profile?.weekly_gym_target       ?? null,
    currentWeightKg,
    readiness,
    recoveryScore,
    ctl, atl, tsb,
    hybrid,
    coach,
    goalProgress,
    checkinStreak,
    sessionStreak,
    nutritionTargets: { protein: proteinTarget, waterMl: waterTargetMl },
    todayLog,
    recentLogs,
    recentSessions,
    weeklyStats: {
      avgSleep:    round1(avg(recentLogs.map((l) => l.sleep_hours))),
      avgMood:     round1(avg(recentLogs.map((l) => l.mood))),
      avgEnergy:   round1(avg(recentLogs.map((l) => l.energy))),
      sessionCount: recentSessions.length,
      kmThisWeek:  Math.round((weekDistM / 1000) * 10) / 10,
    },
    adaptiveGoals,
  };
}
