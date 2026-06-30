"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  calcDashboardStats,
  calcCheckinStreak,
  calcSessionStreak,
  formatDuration,
  getLast14Days,
} from "@/lib/utils";
import {
  BarChart,
  Button,
  Input,
  EmptyState,
} from "@/components/ui";
import {
  formatDistance,
  formatDuration as fmtDur,
  formatPace,
  activityTypeLabel,
  activityTypeColor,
} from "@/lib/strava";
import {
  computeRecoveryScore,
  getRecoveryStatus,
} from "@/lib/recoveryScore";
import { computeCTLATLTSB } from "@/lib/trainingLoad";
import type { TrainingMetricRow } from "@/lib/trainingLoad";
import { computeReadiness } from "@/lib/readiness";
import type { ReadinessOutput } from "@/lib/readiness";
import { runCoachEngine } from "@/lib/coachEngine";
import type { CoachOutput } from "@/lib/coachEngine";
import { computeHybridScore } from "@/lib/hybridScore";
import type { HybridScoreOutput } from "@/lib/hybridScore";
import { calculateDailyTargets } from "@/lib/nutritionEngine";
import type { NutritionProfileInputs } from "@/lib/nutritionEngine";
import type {
  DailyLog,
  Session,
  WeightLog,
  DashboardStats,
  RunningActivity,
} from "@/types";
import { computeAdaptiveGoals } from "@/lib/adaptiveGoals";
import type { AdaptiveGoalOutput } from "@/lib/adaptiveGoals";
import { AdaptiveGoalsCard } from "@/components/AdaptiveGoalsCard";
import { computeWeekPlan } from "@/lib/adaptivePlanner";
import type { WeekPlan } from "@/lib/adaptivePlanner";
import {
  computePredictions,
  computeCurrentEstimates,
} from "@/lib/predictionEngine";
import type { PredictionInput } from "@/lib/predictionEngine";
import { PerformanceForecastCard } from "@/components/PerformanceForecastCard";

export const dynamic = "force-dynamic";

// Module-level: avoids calling Date.now() during render
const MODULE_NOW = Date.now();

type ProfileRow = {
  weekly_run_km_target:   number;
  weekly_run_count_target: number;
  weekly_gym_target:      number;
  sex:                    "male" | "female" | null;
  age:                    number | null;
  height_cm:              number | null;
  nutrition_goal_type:    string | null;
  target_weight:          number | null;
  threshold_pace_seconds: number | null;
  split:                  string | null;
};

// ── SVG Readiness Gauge ────────────────────────────────────────────────────
// 270° arc (gap at bottom). r=54, cx=70, cy=70, viewBox 0 0 140 140.
// Start: (31.8, 108.2) at 135° · End: (108.2, 108.2) at 45°

const ARC_FULL = 254.5; // arc length of 270° with r=54

function ReadinessArc({
  score,
  color,
  grade,
  loading,
}: {
  score: number;
  color: string;
  grade: string;
  loading: boolean;
}) {
  const offset = loading ? ARC_FULL : ARC_FULL * (1 - score / 100);

  return (
    <div style={{ position: "relative", width: "min(148px, 100%)", aspectRatio: "1 / 1", flexShrink: 0 }}>
      <svg viewBox="0 0 140 140" width="100%" height="100%">
        {/* Track */}
        <path
          d="M 31.8 108.2 A 54 54 0 1 1 108.2 108.2"
          fill="none"
          stroke="var(--border2)"
          strokeWidth={11}
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d="M 31.8 108.2 A 54 54 0 1 1 108.2 108.2"
          fill="none"
          stroke={color}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={ARC_FULL}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 1.1s cubic-bezier(0.4, 0, 0.2, 1)",
            filter: score > 0 ? `drop-shadow(0 0 5px ${color}88)` : "none",
          }}
        />
      </svg>
      {/* Center overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 14,
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 34,
            fontWeight: 700,
            color: score > 0 ? color : "var(--text-dim)",
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          {score > 0 ? score : "—"}
        </div>
        {score > 0 && (
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.16em",
              color,
              marginTop: 5,
            }}
          >
            {grade}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Progress bar that animates on render ───────────────────────────────────

function AnimBar({
  pct,
  color,
  height = 6,
}: {
  pct: number;
  color: string;
  height?: number;
}) {
  return (
    <div
      style={{
        height,
        background: "var(--border2)",
        borderRadius: height,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(100, pct * 100)}%`,
          background: pct >= 1 ? "var(--green)" : color,
          borderRadius: height,
          transition: "width 0.9s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}

// ── Growth helpers ────────────────────────────────────────────────────────

type GrowthLogSummary = { date: string; category: string; duration_min: number };

function calcGrowthStreak(entries: GrowthLogSummary[], today: string): number {
  const dates = new Set(entries.map((e) => e.date));
  let streak = 0;
  const d = new Date(today + "T00:00:00");
  while (dates.has(d.toISOString().split("T")[0])) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function getGrowthInsight(
  by: { study: number; project: number; learning: number; deep_work: number },
  total: number,
): string {
  if (total === 0) return "";
  if (total >= 15) return `Exceptional growth week — ${total.toFixed(1)}h of focused work.`;
  const balanced = Object.values(by).every((h) => h > 0);
  if (balanced && total >= 8) return "Growth is balanced across all categories.";
  const dominant = (Object.entries(by) as [string, number][])
    .filter(([, h]) => h > 0)
    .sort((a, b) => b[1] - a[1])[0];
  if (!dominant) return "";
  if (total < 3) return "Growth is low — block time for focused work this week.";
  const labels: Record<string, string> = {
    study: "study", project: "project", learning: "learning", deep_work: "deep work",
  };
  return `Strong ${labels[dominant[0]] ?? dominant[0]} focus this week.`;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const sb = createClient();
  const [stats, setStats]               = useState<DashboardStats | null>(null);
  const [logs, setLogs]                 = useState<DailyLog[]>([]);
  const [sessions, setSessions]         = useState<Session[]>([]);
  const [weights, setWeights]           = useState<WeightLog[]>([]);
  const [checkinStreak, setCheckinStreak] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [weightInput, setWeightInput]   = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [weekRuns, setWeekRuns]         = useState<RunningActivity[]>([]);
  const [recentActivities, setRecentActivities] = useState<RunningActivity[]>([]);
  const [stravaConnected, setStravaConnected]   = useState(false);
  const [trainingMetrics, setTrainingMetrics]   = useState<TrainingMetricRow[]>([]);
  const [todayNetCals, setTodayNetCals] = useState<{ eaten: number; burned: number } | null>(null);
  const [profile, setProfile]           = useState<ProfileRow | null>(null);
  const [aiInsight, setAiInsight]       = useState<string | null>(null);
  const [growthLogs, setGrowthLogs]     = useState<GrowthLogSummary[]>([]);

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const since          = getLast14Days();
    const weekStart      = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const metrics90Since = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
    const since30        = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const todayStr2      = new Date().toISOString().split("T")[0];

    const [
      { data: l },
      { data: s },
      { data: w },
      { data: runs },
      { data: recent },
      { data: metricsData },
      { data: profileData },
      { data: nutData },
      { data: growthData },
    ] = await Promise.all([
      sb.from("daily_logs").select("*").eq("user_id", user.id).gte("date", since).order("date"),
      sb.from("sessions").select("*").eq("user_id", user.id).gte("date", since).order("date", { ascending: false }),
      sb.from("weight_logs").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(14),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("running_activities").select("*").eq("user_id", user.id).gte("activity_date", weekStart).order("activity_date", { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("running_activities").select("*").eq("user_id", user.id).order("activity_date", { ascending: false }).limit(5),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("training_metrics")
        .select("activity_date, tss, trimp, pace_seconds_per_km, load_score, source")
        .eq("user_id", user.id).gte("activity_date", metrics90Since).order("activity_date"),
      sb.from("profiles")
        .select("weekly_run_km_target, weekly_run_count_target, weekly_gym_target, sex, age, height_cm, nutrition_goal_type, target_weight, threshold_pace_seconds, split")
        .eq("user_id", user.id).maybeSingle(),
      sb.from("nutrition_logs").select("calories").eq("user_id", user.id).eq("date", todayStr2),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("growth_logs")
        .select("date, category, duration_min")
        .eq("user_id", user.id).gte("date", since30).order("date", { ascending: false }),
    ]);

    const logsData   = (l      ?? []) as DailyLog[];
    const sessData   = (s      ?? []) as Session[];
    const wData      = (w      ?? []) as WeightLog[];
    const runsData   = (runs   ?? []) as RunningActivity[];
    const recentData = (recent ?? []) as RunningActivity[];

    setLogs(logsData);
    setSessions(sessData);
    setWeights(wData);
    setWeekRuns(runsData);
    setRecentActivities(recentData);
    setStravaConnected(recentData.length > 0);
    setTrainingMetrics((metricsData ?? []) as TrainingMetricRow[]);
    setProfile(profileData as ProfileRow | null);
    setGrowthLogs((growthData ?? []) as GrowthLogSummary[]);

    const nutRows = (nutData ?? []) as { calories: number }[];
    const eaten   = nutRows.reduce((sum, r) => sum + (r.calories ?? 0), 0);
    const burned  = (sessData as { calories_burned?: number | null; date: string }[])
      .filter((s) => s.date === todayStr2 && s.calories_burned)
      .reduce((sum, s) => sum + (s.calories_burned ?? 0), 0);
    setTodayNetCals(nutRows.length > 0 || burned > 0 ? { eaten, burned } : null);

    setStats(calcDashboardStats(logsData, sessData, wData));
    setCheckinStreak(calcCheckinStreak(logsData));
    setSessionStreak(calcSessionStreak(sessData));
    setLoading(false);

    // ── AI Insight ──────────────────────────────────────────────────────────
    const last7Logs  = logsData.filter((l) => l.date >= weekStart);
    const todayLogAi = logsData.find((l) => l.date === todayStr2) ?? null;
    const avgOf = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : null;
    const metricsArr = (metricsData ?? []) as TrainingMetricRow[];
    const { ctl: ctlAi, tsb: tsbAi } = metricsArr.length > 0 ? computeCTLATLTSB(metricsArr) : { ctl: 0, tsb: 0 };
    let readinessScoreAi: number | null = null;
    let readinessGradeAi: string | null = null;
    if (todayLogAi) {
      const recovAi = computeRecoveryScore(todayLogAi, tsbAi);
      if (recovAi !== null) {
        const rAi = computeReadiness(recovAi, tsbAi, todayLogAi.sleep_quality, todayLogAi.fatigue, todayLogAi.energy);
        readinessScoreAi = rAi.score;
        readinessGradeAi = rAi.grade;
      }
    }
    const checkinStrAi   = calcCheckinStreak(logsData);
    const sessionStrAi   = calcSessionStreak(sessData);
    const recovForHybrid = todayLogAi ? computeRecoveryScore(todayLogAi, tsbAi) : null;
    const weekSessAi     = sessData.filter((s) => s.date >= weekStart);
    const growthLogsAi = ((growthData ?? []) as GrowthLogSummary[]).filter((g) => g.date >= weekStart);
    const weeklyGrowthMinAi =
      growthLogsAi.reduce((sum, g) => sum + g.duration_min, 0) +
      sessData.filter((s) => s.type === "study" && s.date >= weekStart)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((sum, s) => sum + ((s as any).duration ?? 0), 0);
    const hybridAi       = computeHybridScore(recovForHybrid, ctlAi, null, weeklyGrowthMinAi);
    const sessionTypesAi = { run: 0, lift: 0, study: 0 };
    weekSessAi.forEach((s) => {
      if (s.type === "run")   sessionTypesAi.run++;
      if (s.type === "lift")  sessionTypesAi.lift++;
      if (s.type === "study") sessionTypesAi.study++;
    });
    const todayCaloriesAi = nutRows.length > 0 ? nutRows.reduce((s, r) => s + (r.calories ?? 0), 0) : null;
    fetch("/api/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        avgSleep7d: avgOf(last7Logs.map((l) => l.sleep_hours)), todaySleep: todayLogAi?.sleep_hours ?? null,
        avgMood7d: avgOf(last7Logs.map((l) => l.mood)), avgEnergy7d: avgOf(last7Logs.map((l) => l.energy)),
        sessionTypes: sessionTypesAi, todayCals: todayCaloriesAi, calTarget: null,
        latestWeight: wData[0]?.weight ?? null, weightChange7d: null,
        checkinStreak: checkinStrAi, thisWeekSessions: weekSessAi.length, weeklyGoal: null,
        readinessScore: readinessScoreAi, readinessGrade: readinessGradeAi,
        tsb: tsbAi, ctl: ctlAi, hybridScore: hybridAi.score, hybridLevel: hybridAi.level,
      }),
    }).then((r) => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => { if (d.insight) setAiInsight(d.insight); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function logWeight() {
    const val = parseFloat(weightInput);
    if (!val || val < 20 || val > 300) return;
    setSavingWeight(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setSavingWeight(false); return; }
    const todayStr = new Date().toISOString().split("T")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from("weight_logs").upsert({ user_id: user.id, date: todayStr, weight: val }, { onConflict: "user_id,date" });
    setWeightInput("");
    setSavingWeight(false);
    load();
  }

  // ── Derived values (unchanged) ─────────────────────────────────────────

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const weekStartDate = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  }, []);
  const todayLog = logs.find((l) => l.date === todayStr) ?? null;

  const { tsb, ctl, atl } = trainingMetrics.length > 0
    ? computeCTLATLTSB(trainingMetrics)
    : { tsb: 0, ctl: 0, atl: 0 };

  const recoveryScore  = computeRecoveryScore(todayLog, tsb);
  const recoveryStatus = recoveryScore !== null ? getRecoveryStatus(recoveryScore) : null;

  const weekDistM    = weekRuns.reduce((s, r) => s + r.distance_meters, 0);
  const weekGymCount = sessions.filter((s) => s.type === "lift" && s.date >= weekStartDate).length;

  // ── Growth metrics ─────────────────────────────────────────────────────
  // Primary: growth_logs. Secondary: sessions(type='study') as legacy fallback.

  const weekGrowthLogs = growthLogs.filter((g) => g.date >= weekStartDate);
  const legacyStudyHours = sessions
    .filter((s) => s.type === "study" && s.date >= weekStartDate)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((sum, s) => sum + ((s as any).duration ?? 0), 0) / 60;

  const growthByCategory = {
    study:     weekGrowthLogs.filter((g) => g.category === "study").reduce((s, g) => s + g.duration_min, 0) / 60 + legacyStudyHours,
    project:   weekGrowthLogs.filter((g) => g.category === "project").reduce((s, g) => s + g.duration_min, 0) / 60,
    learning:  weekGrowthLogs.filter((g) => g.category === "learning").reduce((s, g) => s + g.duration_min, 0) / 60,
    deep_work: weekGrowthLogs.filter((g) => g.category === "deep_work").reduce((s, g) => s + g.duration_min, 0) / 60,
  };
  const totalGrowthHours    = Object.values(growthByCategory).reduce((s, v) => s + v, 0);
  const weeklyGrowthMinutes = Math.round(totalGrowthHours * 60);
  const growthStreak        = calcGrowthStreak(growthLogs, todayStr);
  const growthInsightText   = getGrowthInsight(growthByCategory, totalGrowthHours);
  const hasGrowthData       = totalGrowthHours > 0;
  const maxCatHours         = Math.max(...Object.values(growthByCategory), 0.01);

  let readinessOutput: ReadinessOutput | null = null;
  let coachOutput:     CoachOutput     | null = null;
  let hybridOutput:    HybridScoreOutput      = computeHybridScore(recoveryScore, ctl, null, weeklyGrowthMinutes);
  let proteinTarget  = 140;
  let waterTargetMl  = 3000;

  if (todayLog && recoveryScore !== null) {
    readinessOutput = computeReadiness(recoveryScore, tsb, todayLog.sleep_quality, todayLog.fatigue, todayLog.energy);

    const currentWeight = weights[0]?.weight ?? null;

    if (profile?.sex && profile?.age && profile?.height_cm && currentWeight) {
      const todaySessions = sessions.filter((s) => s.date === todayStr);
      const targets = calculateDailyTargets(
        {
          sex:              profile.sex as NutritionProfileInputs["sex"],
          age:              profile.age,
          height_cm:        profile.height_cm,
          weight_kg:        currentWeight,
          goal_type:        (profile.nutrition_goal_type ?? "maintain") as NutritionProfileInputs["goal_type"],
          target_weight_kg: profile.target_weight ?? null,
        },
        todaySessions,
        readinessOutput?.score ?? null,
        false,
        null,
      );
      proteinTarget = targets.protein;
      waterTargetMl = targets.water;
    }

    const hasKmGoal  = (profile?.weekly_run_km_target  ?? 0) > 0;
    const hasRunGoal = (profile?.weekly_run_count_target ?? 0) > 0;
    const hasGymGoal = (profile?.weekly_gym_target       ?? 0) > 0;

    coachOutput = runCoachEngine({
      recoveryScore,
      readinessScore: readinessOutput.score,
      readinessGrade: readinessOutput.grade,
      ctl, atl, tsb,
      sleepQuality: todayLog.sleep_quality,
      energy:       todayLog.energy,
      mood:         todayLog.mood,
      fatigue:      todayLog.fatigue,
      soreness:     todayLog.soreness,
      goalProgress: {
        weeklyKmPct:  hasKmGoal  ? (weekDistM / 1000) / profile!.weekly_run_km_target  : 0,
        weeklyRunPct: hasRunGoal ? weekRuns.length    / profile!.weekly_run_count_target : 0,
        weeklyGymPct: hasGymGoal ? weekGymCount       / profile!.weekly_gym_target       : 0,
        hasKmGoal, hasRunGoal, hasGymGoal,
      },
      proteinTarget,
      waterTargetMl,
    });

    hybridOutput = computeHybridScore(recoveryScore, ctl, null, weeklyGrowthMinutes);
  }

  // ── Adaptive Goals (Phase 5A) ─────────────────────────────────────────

  const weekLogs7d = logs.filter((l) => l.date >= weekStartDate);
  const avg7d = (arr: number[]) => arr.length >= 3 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

  const adaptiveGoalOutput: AdaptiveGoalOutput = computeAdaptiveGoals({
    ctl, atl, tsb,
    readinessScore: readinessOutput?.score ?? null,
    recoveryScore,
    sleepQuality: todayLog?.sleep_quality ?? null,
    fatigue:      todayLog?.fatigue      ?? null,
    soreness:     todayLog?.soreness     ?? null,
    energy:       todayLog?.energy       ?? null,
    avgSleepQuality7d: avg7d(weekLogs7d.map((l) => l.sleep_quality)),
    avgFatigue7d:      avg7d(weekLogs7d.map((l) => l.fatigue)),
    avgEnergy7d:       avg7d(weekLogs7d.map((l) => l.energy)),
    hybridScore:           hybridOutput.score,
    hybridGrowthComponent: hybridOutput.components.growth,
    weeklyRunKm:        weekDistM / 1000,
    weeklyRunCount:     weekRuns.length,
    weeklyLiftSessions: weekGymCount,
    weeklyGrowthHours:  totalGrowthHours,
    weeklyGrowthCategories: growthByCategory,
    avgDailyCalories: todayNetCals?.eaten ?? null,
    avgDailyProtein:  null,
    proteinTargetG:   proteinTarget,
    calorieTargetKcal: null,
    waterTargetMl,
    userRunKmGoal:    profile?.weekly_run_km_target    ?? 0,
    userRunCountGoal: profile?.weekly_run_count_target ?? 0,
    userGymGoal:      profile?.weekly_gym_target       ?? 0,
  });

  // ── Weekly plan (Phase 5B) ────────────────────────────────────────────

  const weekPlan: WeekPlan = computeWeekPlan({
    adaptiveGoals: adaptiveGoalOutput,
    ctl, atl, tsb,
    readinessScore: readinessOutput?.score ?? null,
    recoveryScore,
    today: todayStr,
    trainingProfile:  profile?.split ?? "balanced",
    userRunKmGoal:    profile?.weekly_run_km_target    ?? 0,
    userGymGoal:      profile?.weekly_gym_target       ?? 0,
    proteinTargetG:   proteinTarget,
  });

  const todayPlanDay = weekPlan.days.find((d) => d.isToday) ?? weekPlan.days[0];

  // ── Prediction Engine (Phase 5C.1) ────────────────────────────────────

  const avgPaceFromRuns = (() => {
    const withSpeed = weekRuns.filter((r) => r.average_speed && r.average_speed > 0);
    if (withSpeed.length === 0) return null;
    return withSpeed.reduce((s, r) => s + 1000 / r.average_speed!, 0) / withSpeed.length;
  })();

  const longRunKm = weekRuns.length > 0
    ? Math.max(...weekRuns.map((r) => r.distance_meters)) / 1000
    : null;

  const predInput: PredictionInput = {
    ctl, atl, tsb,
    weeklyRunKm:        weekDistM / 1000,
    longRunKm,
    weeklyLiftSessions: weekGymCount,
    weeklyGrowthHours:  totalGrowthHours,
    avgPaceSecPerKm:    avgPaceFromRuns,
    readinessScore:     readinessOutput?.score ?? null,
    recoveryScore,
    avgSleepQuality7d:  avg7d(weekLogs7d.map((l) => l.sleep_quality)),
    avgFatigue7d:       avg7d(weekLogs7d.map((l) => l.fatigue)),
    planWeeklyKm:          adaptiveGoalOutput.running.weeklyKm.value,
    planIntensityLabel:    adaptiveGoalOutput.running.intensity.label,
    planWeeklyGrowthHours: adaptiveGoalOutput.growth.weeklyHours.value,
    planLiftSessions:      adaptiveGoalOutput.strength.weeklySessions.value,
    userRunKmGoal:  profile?.weekly_run_km_target ?? 0,
    userGymGoal:    profile?.weekly_gym_target    ?? 0,
    recentWeights:  weights.map((w) => ({ weight: w.weight, date: w.date })),
    totalSessionCount:     trainingMetrics.length,
    thresholdPaceSecPerKm: profile?.threshold_pace_seconds ?? null,
    today: todayStr,
  };

  const predictionOutput     = computePredictions(predInput);
  const currentEstimates     = computeCurrentEstimates(
    profile?.threshold_pace_seconds ?? null,
    avgPaceFromRuns,
  );

  // ── Date display ──────────────────────────────────────────────────────

  const dateLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  }, []);

  const greetingHour = useMemo(() => new Date().getHours(), []);
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";

  // ── Chart data ───────────────────────────────────────────────────────

  const sleepChartData  = logs.map((l) => ({ label: l.date.slice(5), value: l.sleep_hours }));
  const moodChartData   = logs.map((l) => ({ label: l.date.slice(5), value: l.mood }));
  const energyChartData = logs.map((l) => ({ label: l.date.slice(5), value: l.energy }));
  const weightChartData = [...weights].reverse().map((w) => ({ label: w.date.slice(5), value: w.weight }));
  const weightMax       = weights.length ? Math.max(...weights.map((w) => w.weight)) + 2 : 100;

  const goalStatusColor: Record<string, string> = {
    Exceeded: "var(--green)", "On Track": "var(--accent)", Behind: "var(--red)",
  };

  const hasGoals = profile && (profile.weekly_run_km_target > 0 || profile.weekly_run_count_target > 0 || profile.weekly_gym_target > 0);

  function streakBadge(n: number, color: string) {
    if (n === 0) return { text: "0", color: "var(--text-dim)" };
    if (n >= 7)  return { text: `🔥 ${n}`, color };
    if (n >= 3)  return { text: `${n}`, color };
    return { text: `${n}`, color: "var(--text-muted)" };
  }

  const checkinBadge  = streakBadge(checkinStreak,  "var(--accent)");
  const sessionBadge  = streakBadge(sessionStreak,  "var(--purple)");

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: i === 1 ? 180 : 100,
              borderRadius: 14,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              animation: "pulse 1.8s ease-in-out infinite",
            }}
          />
        ))}
        <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const readScore  = readinessOutput?.score  ?? 0;
  const readColor  = readinessOutput?.color  ?? "var(--text-dim)";
  const readGrade  = readinessOutput?.grade  ?? "";
  const readLabel  = readinessOutput?.label  ?? "";
  const focusLabel = coachOutput?.primaryFocus ?? "";

  return (
    <>
      <style>{`
        .dash-card {
          border-radius: 14px;
          transition: box-shadow 0.22s ease, transform 0.22s ease, border-color 0.22s ease;
        }
        .dash-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(0,0,0,0.28);
        }
        .dash-tile {
          border-radius: 12px;
          transition: box-shadow 0.18s ease, transform 0.18s ease;
        }
        .dash-tile:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.22); }
        .rec-row {
          display: flex; align-items: flex-start; gap: 10;
          padding: 9px 0; border-bottom: 1px solid var(--border2);
        }
        .rec-row:last-child { border-bottom: none; padding-bottom: 0; }
        .run-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; border-radius: 10px;
          background: var(--surface2); border: 1px solid var(--border2);
          transition: background 0.15s ease, border-color 0.15s ease;
          gap: 8;
        }
        .run-row:hover { background: var(--surface); border-color: var(--border); }
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .a1 { animation: fadeUp 0.4s ease both; }
        .a2 { animation: fadeUp 0.4s 0.07s ease both; }
        .a3 { animation: fadeUp 0.4s 0.14s ease both; }
        .a4 { animation: fadeUp 0.4s 0.21s ease both; }
        .a5 { animation: fadeUp 0.4s 0.28s ease both; }
        .a6 { animation: fadeUp 0.4s 0.35s ease both; }
        /* Hero grid: arc card + 3 metric tiles */
        .dash-hero { grid-template-columns: 188px 1fr 1fr 1fr; }
        /* Grid children must never overflow their column */
        .dash-hero > *, .dash-2col > *, .dash-3col > * { min-width: 0; }
        /* Laptop ≤1100px viewport: tighten arc, tiles stay equal */
        @media (max-width: 1100px) {
          .dash-hero { grid-template-columns: 164px 1fr 1fr 1fr; }
        }
        /* Tablet ≤900px viewport: 2×2 grid */
        @media (max-width: 900px) {
          .dash-hero { grid-template-columns: 1fr 1fr !important; }
          .dash-3col { grid-template-columns: 1fr 1fr !important; }
        }
        /* Mobile ≤640px: single column */
        @media (max-width: 640px) {
          .dash-hero { grid-template-columns: 1fr !important; }
          .dash-2col { grid-template-columns: 1fr !important; }
          .dash-3col { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="a1" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>
            DASHBOARD
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>
            {greeting} · {dateLabel}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Check-in", value: checkinBadge.text,  color: checkinBadge.color  },
            { label: "Session",  value: sessionBadge.text,  color: sessionBadge.color  },
            ...(growthStreak > 0 ? [{ label: "Growth", value: growthStreak >= 7 ? `🔥 ${growthStreak}` : `${growthStreak}`, color: "var(--accent)" }] : []),
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                padding: "6px 14px",
                borderRadius: 99,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.08em" }}>{label}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hero row ──────────────────────────────────────────────────────── */}
      <div
        className="dash-hero a2"
        style={{ display: "grid", gap: 10, marginBottom: 12 }}
      >
        {/* Readiness gauge card */}
        <div
          className="dash-card"
          style={{
            background: "var(--surface)",
            border: `1px solid ${readScore > 0 ? readColor + "55" : "var(--border)"}`,
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.18em", color: "var(--text-dim)", textTransform: "uppercase", alignSelf: "flex-start" }}>
            Today
          </div>
          <ReadinessArc score={readScore} color={readColor} grade={readGrade} loading={loading} />
          {readScore > 0 ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, color: readColor, fontWeight: 600 }}>{readLabel}</div>
              {focusLabel && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em", marginTop: 4 }}>
                  FOCUS · {focusLabel}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>No check-in yet</div>
            </div>
          )}
        </div>

        {/* Recovery tile */}
        <div
          className="dash-tile"
          style={{
            background: "var(--surface)",
            border: recoveryStatus ? `1px solid ${recoveryStatus.color}33` : "1px solid var(--border)",
            padding: "18px 16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-dim)", textTransform: "uppercase" }}>
            Recovery
          </div>
          {recoveryStatus ? (
            <>
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 36, fontWeight: 700, color: recoveryStatus.color, lineHeight: 1, letterSpacing: "-0.02em" }}>
                  {recoveryStatus.score}
                </div>
                <div style={{ fontSize: 9, fontFamily: "var(--mono)", letterSpacing: "0.08em", color: recoveryStatus.color, marginTop: 4 }}>
                  {recoveryStatus.label}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 4, background: "var(--border2)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${recoveryStatus.score}%`, background: recoveryStatus.color, borderRadius: 2, transition: "width 0.9s ease" }} />
                </div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 5, lineHeight: 1.4 }}>
                  {recoveryStatus.description}
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: "auto" }}>Log check-in</div>
          )}
        </div>

        {/* Hybrid score tile */}
        <div
          className="dash-tile"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--accent)22",
            padding: "18px 16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-dim)", textTransform: "uppercase" }}>
            Hybrid Score
          </div>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 36, fontWeight: 700, color: "var(--accent)", lineHeight: 1, letterSpacing: "-0.02em" }}>
              {hybridOutput.score}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.06em", marginTop: 4 }}>
              {hybridOutput.level}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
            {[
              { label: "Recov", val: hybridOutput.components.recovery,    color: "var(--green)"  },
              { label: "Train", val: hybridOutput.components.training,     color: "var(--accent)" },
              { label: "Growth", val: hybridOutput.components.growth,      color: "var(--purple)" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 9, color: "var(--text-dim)", width: 32, flexShrink: 0 }}>{label}</div>
                <div style={{ flex: 1, height: 3, background: "var(--border2)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${val}%`, background: color, borderRadius: 2, transition: "width 0.9s ease" }} />
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 9, color, width: 22, textAlign: "right" }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Training load tile */}
        <div
          className="dash-tile"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            padding: "18px 16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-dim)", textTransform: "uppercase" }}>
            Training Load
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 8 }}>
            {[
              { key: "CTL", val: ctl, color: "var(--green)" },
              { key: "ATL", val: atl, color: "var(--red)" },
              { key: "TSB", val: tsb, color: "var(--accent)" },
            ].map(({ key, val, color }) => (
              <div key={key} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
                  {val > 0 && key === "TSB" ? `+${val}` : val}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 3, letterSpacing: "0.08em" }}>{key}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.06em", marginBottom: 4 }}>TSB · Form</div>
            <div style={{ height: 4, background: "var(--border2)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
              {/* Zero marker */}
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--border)", zIndex: 1 }} />
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  ...(tsb >= 0
                    ? { left: "50%", width: `${Math.min(50, (tsb / 30) * 50)}%`, background: "var(--green)" }
                    : { right: "50%", width: `${Math.min(50, (Math.abs(tsb) / 30) * 50)}%`, background: "var(--red)" }),
                  transition: "width 0.9s ease",
                  borderRadius: 2,
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 9, color: "var(--red)", letterSpacing: "0.06em" }}>Fatigue</span>
              <span style={{ fontSize: 9, color: "var(--green)", letterSpacing: "0.06em" }}>Fresh</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Observer Coach card ────────────────────────────────────────────── */}
      <div className="a3">
        {coachOutput && readinessOutput ? (
          <div
            className="dash-card"
            style={{
              background: "var(--surface)",
              border: `1px solid ${readColor}44`,
              marginBottom: 12,
              overflow: "hidden",
            }}
          >
            {/* Header strip */}
            <div
              style={{
                padding: "12px 22px",
                borderBottom: "1px solid var(--border2)",
                background: `${readColor}08`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--text-muted)" }}>
                  OBSERVER COACH
                </div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: readColor,
                    letterSpacing: "0.08em",
                    padding: "2px 10px",
                    border: `1px solid ${readColor}55`,
                    borderRadius: 4,
                  }}
                >
                  {readGrade}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: readColor, fontWeight: 700 }}>
                  {focusLabel}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>
                  {readLabel}
                </div>
              </div>
            </div>
            {/* Recommendations */}
            <div style={{ padding: "14px 22px", display: "flex", flexDirection: "column" }}>
              {[
                { tag: "TRAIN", text: coachOutput.trainingRecommendation,  tagColor: "var(--green)"  },
                { tag: "RECOV", text: coachOutput.recoveryRecommendation,  tagColor: "var(--accent)" },
                { tag: "NUT",   text: coachOutput.nutritionRecommendation, tagColor: "var(--yellow)" },
              ].map(({ tag, text, tagColor }) => (
                <div key={tag} className="rec-row">
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      color: tagColor,
                      flexShrink: 0,
                      paddingTop: 1,
                      width: 38,
                    }}
                  >
                    {tag}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          !todayLog && (
            <div
              className="dash-card"
              style={{
                marginBottom: 12,
                padding: "16px 22px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-dim)", flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.18em", color: "var(--text-dim)", marginBottom: 4 }}>
                  OBSERVER COACH
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Log today&apos;s check-in to activate personalised coaching recommendations.
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* ── AI Insight ────────────────────────────────────────────────────── */}
      {aiInsight && (
        <div
          className="dash-card a4"
          style={{
            marginBottom: 12,
            padding: "16px 22px",
            background: "var(--surface)",
            border: "1px solid var(--accent)33",
            borderLeft: "3px solid var(--accent)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.18em", color: "var(--accent)", fontWeight: 700 }}>
              AI INSIGHT
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--text-dim)", letterSpacing: "0.1em" }}>
              · GROQ
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--text)", margin: 0, lineHeight: 1.7 }}>{aiInsight}</p>
        </div>
      )}

      {/* ── Adaptive Goals ───────────────────────────────────────────────── */}
      <div className="a4">
        <AdaptiveGoalsCard
          goals={adaptiveGoalOutput}
          userGoals={{
            runKm:    profile?.weekly_run_km_target    ?? 0,
            runCount: profile?.weekly_run_count_target ?? 0,
            gym:      profile?.weekly_gym_target       ?? 0,
          }}
        />
      </div>

      {/* ── Performance Forecast (Phase 5C.1) ────────────────────────────── */}
      <div className="a4">
        <PerformanceForecastCard
          ctl={ctl}
          weeklyRunKm={weekDistM / 1000}
          estimated5KMin={currentEstimates.estimated5KMin}
          estimated10KMin={currentEstimates.estimated10KMin}
          prediction={predictionOutput}
        />
      </div>

      {/* ── Next Session ─────────────────────────────────────────────────── */}
      <div
        className="dash-card a4"
        style={{
          background: "var(--surface)",
          border: todayPlanDay.load === "high"
            ? "1px solid var(--red)33"
            : todayPlanDay.load === "rest"
            ? "1px solid var(--border)"
            : "1px solid var(--accent)22",
          marginBottom: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--border2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", color: "var(--text-muted)" }}>
            NEXT SESSION · TODAY
          </div>
          <a
            href="/planner"
            style={{
              fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.10em",
              color: "var(--accent)", textDecoration: "none",
              border: "1px solid var(--accent)44", borderRadius: 6, padding: "3px 10px",
              transition: "all 0.15s ease",
            }}
          >
            FULL PLAN →
          </a>
        </div>

        <div style={{ padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: 14 }}>
          {/* Session block */}
          {todayPlanDay.sessions.map((sess, i) => {
            const isRest  = sess.type === "rest";
            const sessCol = isRest ? "var(--text-dim)" : sess.type.startsWith("run_") ? "var(--accent)" : "var(--purple)";
            return (
              <div
                key={i}
                style={{
                  flex: "1 1 200px",
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: isRest ? "var(--surface2)" : sessCol + "10",
                  border: `1px solid ${isRest ? "var(--border2)" : sessCol + "33"}`,
                }}
              >
                <div style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)", marginBottom: 5 }}>
                  {sess.type.startsWith("run_") ? "RUN" : sess.type.startsWith("lift_") ? "LIFT" : "REST"}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: sessCol, marginBottom: 2 }}>
                  {sess.label}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    {sess.intensity}
                  </span>
                  {sess.distanceKm !== undefined && sess.distanceKm > 0 && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)" }}>
                      {sess.distanceKm.toFixed(1)} km
                    </span>
                  )}
                  {sess.durationMin > 0 && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)" }}>
                      {sess.durationMin} min
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.45 }}>
                  {sess.notes}
                </div>
              </div>
            );
          })}

          {/* Growth block */}
          {todayPlanDay.growth && (
            <div
              style={{
                flex: "1 1 180px",
                padding: "12px 14px",
                borderRadius: 10,
                background: "var(--green)10",
                border: "1px solid var(--green)22",
              }}
            >
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)", marginBottom: 5 }}>
                GROWTH
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "var(--green)", marginBottom: 2 }}>
                {todayPlanDay.growth.label}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-muted)" }}>
                  {todayPlanDay.growth.timing.toUpperCase()}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)" }}>
                  {todayPlanDay.growth.durationMin} min
                </span>
              </div>
            </div>
          )}

          {/* Nutrition target */}
          <div
            style={{
              flex: "0 1 160px",
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--yellow)08",
              border: "1px solid var(--yellow)22",
            }}
          >
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)", marginBottom: 5 }}>
              NUTRITION
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700, color: "var(--yellow)", lineHeight: 1 }}>
              {todayPlanDay.nutrition.proteinG}g
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.08em", color: "var(--text-muted)", marginTop: 3 }}>
              PROTEIN TARGET
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
              {todayPlanDay.nutrition.caloriesKcal.toLocaleString()} kcal
            </div>
          </div>
        </div>
      </div>

      {/* ── Growth This Week ─────────────────────────────────────────────── */}
      <div
        className="dash-card a4"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--accent)22",
          marginBottom: 12,
          overflow: "hidden",
        }}
      >
        {/* Card header */}
        <div style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--border2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", color: "var(--text-muted)" }}>
            GROWTH THIS WEEK
          </div>
          {growthStreak > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
                {growthStreak >= 7 ? `🔥 ${growthStreak}` : growthStreak}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.06em" }}>
                DAY STREAK
              </span>
            </div>
          )}
        </div>

        {/* Empty state */}
        {!hasGrowthData ? (
          <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 340 }}>
              Log your first study, project, learning, or deep work session to activate Growth analytics.
            </div>
            <a
              href="/log"
              style={{
                fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
                color: "var(--accent)", border: "1px solid var(--accent)44",
                padding: "7px 18px", borderRadius: 8, textDecoration: "none",
                letterSpacing: "0.08em", transition: "all 0.15s",
              }}
            >
              LOG GROWTH →
            </a>
          </div>
        ) : (
          <div style={{ padding: "16px 20px" }}>
            {/* Insight */}
            {growthInsightText && (
              <div style={{
                fontSize: 12, color: "var(--text-dim)", marginBottom: 16,
                fontStyle: "italic", lineHeight: 1.5,
                borderLeft: "2px solid var(--accent)44", paddingLeft: 10,
              }}>
                {growthInsightText}
              </div>
            )}

            {/* Category bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {(
                [
                  { key: "study",     label: "Study",     color: "var(--yellow)"  },
                  { key: "project",   label: "Project",   color: "var(--accent)"  },
                  { key: "learning",  label: "Learning",  color: "var(--green)"   },
                  { key: "deep_work", label: "Deep Work", color: "var(--purple)"  },
                ] as { key: keyof typeof growthByCategory; label: string; color: string }[]
              ).map(({ key, label, color }) => {
                const hours = growthByCategory[key];
                const pct   = hours / maxCatHours;
                return (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: hours > 0 ? "var(--text-muted)" : "var(--text-dim)", letterSpacing: "0.04em" }}>
                        {label}
                      </span>
                      <span style={{
                        fontFamily: "var(--mono)", fontSize: 12, fontWeight: hours > 0 ? 700 : 400,
                        color: hours > 0 ? color : "var(--text-dim)",
                      }}>
                        {hours > 0 ? `${hours.toFixed(1)}h` : "—"}
                      </span>
                    </div>
                    <AnimBar pct={pct} color={color} height={5} />
                  </div>
                );
              })}
            </div>

            {/* Total footer */}
            <div style={{
              marginTop: 16, paddingTop: 12,
              borderTop: "1px solid var(--border2)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.14em" }}>
                TOTAL THIS WEEK
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>
                  {totalGrowthHours.toFixed(1)}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>h</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Middle two-column ─────────────────────────────────────────────── */}
      <div
        className="dash-2col a4"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}
      >
        {/* Net calories */}
        {todayNetCals !== null && (() => {
          const net = todayNetCals.eaten - todayNetCals.burned;
          const netColor = net > 300 ? "var(--yellow)" : net < -300 ? "var(--red)" : "var(--green)";
          return (
            <div
              className="dash-card"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "18px 20px" }}
            >
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 14 }}>
                Net Calories · Today
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { label: "Eaten",  value: Math.round(todayNetCals.eaten),  color: "var(--yellow)" },
                  { label: "Burned", value: Math.round(todayNetCals.burned), color: "var(--red)" },
                  { label: "Net",    value: net > 0 ? `+${Math.round(net)}` : Math.round(net), color: netColor },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ flex: "1 1 60px" }}>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
                      {value}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4, letterSpacing: "0.08em" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Weekly goals */}
        {hasGoals && (
          <div
            className="dash-card"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "18px 20px" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-dim)", textTransform: "uppercase" }}>
                Weekly Goals
              </div>
              {coachOutput && (
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    color: goalStatusColor[coachOutput.goalStatus],
                    letterSpacing: "0.1em",
                  }}
                >
                  {coachOutput.goalStatus.toUpperCase()}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {profile!.weekly_run_km_target > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Distance</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>
                      {(weekDistM / 1000).toFixed(1)} / {profile!.weekly_run_km_target} km
                    </span>
                  </div>
                  <AnimBar pct={(weekDistM / 1000) / profile!.weekly_run_km_target} color="var(--accent)" height={7} />
                </div>
              )}
              {profile!.weekly_run_count_target > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Runs</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>
                      {weekRuns.length} / {profile!.weekly_run_count_target}
                    </span>
                  </div>
                  <AnimBar pct={weekRuns.length / profile!.weekly_run_count_target} color="var(--accent)" height={7} />
                </div>
              )}
              {profile!.weekly_gym_target > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Gym</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>
                      {weekGymCount} / {profile!.weekly_gym_target}
                    </span>
                  </div>
                  <AnimBar pct={weekGymCount / profile!.weekly_gym_target} color="var(--purple)" height={7} />
                </div>
              )}
            </div>
            {coachOutput && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border2)" }}>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.55 }}>
                  {coachOutput.goalRecommendation}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Strava this week ──────────────────────────────────────────────── */}
      {stravaConnected && (
        <div
          className="dash-card a5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", marginBottom: 12, overflow: "hidden" }}
        >
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", color: "var(--text-muted)" }}>
              THIS WEEK · RUNNING
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "#FC4C02", letterSpacing: "0.1em", border: "1px solid rgba(252,76,2,0.35)", padding: "2px 7px", borderRadius: 4 }}>
              STRAVA
            </div>
          </div>
          {/* Week stats */}
          {weekRuns.length > 0 && (() => {
            const weekTotalTime = weekRuns.reduce((s, r) => s + r.moving_time_seconds, 0);
            const longestM      = Math.max(...weekRuns.map((r) => r.distance_meters));
            const avgPace       = weekDistM > 0 ? weekTotalTime / (weekDistM / 1000) : 0;
            return (
              <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border2)", display: "flex", gap: 24, flexWrap: "wrap" }}>
                {[
                  { label: "Distance",  value: `${(weekDistM / 1000).toFixed(1)} km`, color: "var(--green)" },
                  { label: "Runs",      value: weekRuns.length,                        color: "var(--text)" },
                  { label: "Longest",   value: `${(longestM / 1000).toFixed(1)} km`,  color: "var(--text)" },
                  { label: "Avg Pace",  value: avgPace > 0 ? formatPace(1000 / avgPace) : "—", color: "var(--accent)" },
                  { label: "Time",      value: fmtDur(weekTotalTime),                 color: "var(--text)" },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 4, letterSpacing: "0.08em" }}>{label}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          {/* Recent runs */}
          <div style={{ padding: "10px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
            {recentActivities.slice(0, 4).map((run) => {
              const diffDays = Math.floor((MODULE_NOW - new Date(run.activity_date + "T00:00:00").getTime()) / 86400000);
              const when = diffDays === 0 ? "Today" : diffDays === 1 ? "Yesterday" : `${diffDays}d ago`;
              return (
                <div key={run.id} className="run-row">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 9,
                        letterSpacing: "0.08em",
                        padding: "2px 7px",
                        border: `1px solid ${activityTypeColor(run.activity_type)}`,
                        color: activityTypeColor(run.activity_type),
                        borderRadius: 4,
                        textTransform: "uppercase",
                        flexShrink: 0,
                      }}
                    >
                      {activityTypeLabel(run.activity_type)}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                      {run.activity_name}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 14, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: "var(--green)" }}>
                      {formatDistance(run.distance_meters)} km
                    </span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
                      {fmtDur(run.moving_time_seconds)}
                    </span>
                    {run.average_speed && run.average_speed > 0 && (
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>
                        {formatPace(run.average_speed)}
                      </span>
                    )}
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>{when}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Trend sparklines ──────────────────────────────────────────────── */}
      {logs.length > 0 && (
        <div
          className="dash-3col a5"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}
        >
          {[
            { label: "Sleep (hrs)", data: sleepChartData, color: "var(--accent)",  max: 10 },
            { label: "Mood",        data: moodChartData,  color: "var(--yellow)",  max: 10 },
            { label: "Energy",      data: energyChartData, color: "var(--green)", max: 10 },
          ].map(({ label, data, color, max }) => (
            <div
              key={label}
              className="dash-card"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "16px 16px 14px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {label}
                </div>
                {data.length > 0 && (
                  <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color }}>
                    {data[data.length - 1].value}
                  </div>
                )}
              </div>
              <BarChart data={data} color={color} maxVal={max} />
            </div>
          ))}
        </div>
      )}

      {/* ── Bottom row ────────────────────────────────────────────────────── */}
      <div
        className="dash-2col a6"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}
      >
        {/* Weight tracker */}
        {(() => {
          const latestW  = weights[0]?.weight ?? null;
          const oldestW  = weights.length >= 2 ? weights[weights.length - 1].weight : null;
          const deltaW   = latestW !== null && oldestW !== null ? +(latestW - oldestW).toFixed(1) : null;
          const weightMin = weights.length ? Math.min(...weights.map((w) => w.weight)) - 1 : 0;
          return (
            <div
              className="dash-card"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                    Body Weight
                  </div>
                  {latestW !== null ? (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: "var(--purple)", lineHeight: 1, letterSpacing: "-0.02em" }}>
                        {latestW}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>kg</span>
                      {deltaW !== null && (
                        <span style={{
                          fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
                          color: deltaW < 0 ? "var(--green)" : deltaW > 0 ? "var(--red)" : "var(--text-dim)",
                          letterSpacing: "0.04em",
                        }}>
                          {deltaW > 0 ? "+" : ""}{deltaW}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontFamily: "var(--mono)", fontSize: 22, color: "var(--text-dim)" }}>—</div>
                  )}
                </div>
                {stats?.weightAvg7d && (
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 4 }}>7-DAY AVG</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 600, color: "var(--purple)" }}>
                      {stats.weightAvg7d} kg
                    </div>
                  </div>
                )}
              </div>

              {/* Log input */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <Input
                    type="number"
                    step={0.1}
                    placeholder={latestW !== null ? `${latestW} kg` : "72.5 kg"}
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && logWeight()}
                  />
                </div>
                <Button onClick={logWeight} disabled={savingWeight || !weightInput}>
                  {savingWeight ? "…" : "Log"}
                </Button>
              </div>

              {/* Chart */}
              {weightChartData.length > 0 ? (
                <BarChart
                  data={weightChartData}
                  color="var(--purple)"
                  maxVal={weightMax}
                  minVal={weightMin}
                />
              ) : (
                <EmptyState message="No weight data yet" />
              )}
            </div>
          );
        })()}

        {/* Recent sessions */}
        <div
          className="dash-card"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "18px 20px" }}
        >
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 14 }}>
            Recent Sessions
          </div>
          {sessions.length === 0 ? (
            <EmptyState message="No sessions logged yet" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sessions.slice(0, 6).map((s) => {
                const typeColor: Record<string, string> = { run: "var(--green)", lift: "var(--purple)", study: "var(--yellow)" };
                const color = typeColor[s.type] ?? "var(--text-dim)";
                return (
                  <div
                    key={s.id}
                    className="run-row"
                    style={{ padding: "9px 12px" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.1em", padding: "2px 7px", border: `1px solid ${color}`, color, textTransform: "uppercase", borderRadius: 4, flexShrink: 0 }}>
                        {s.type}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.notes || "—"}
                      </span>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)" }}>
                        {formatDuration(s.duration)}
                      </div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", marginTop: 1 }}>
                        {s.date.slice(5)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
