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
  Card,
  PageHeader,
  StatCard,
  SectionLabel,
  BarChart,
  Button,
  Field,
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
  getRecoveryBanner,
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

export const dynamic = "force-dynamic";

type ProfileRow = {
  weekly_run_km_target:  number;
  weekly_run_count_target: number;
  weekly_gym_target:     number;
  sex:                   "male" | "female" | null;
  age:                   number | null;
  height_cm:             number | null;
  nutrition_goal_type:   string | null;
  target_weight:         number | null;
  threshold_pace_seconds: number | null;
};

// ── Reusable sub-components ────────────────────────────────────────────────

function RecRow({
  icon,
  text,
}: {
  icon: string;
  text: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid var(--border2)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          color: "var(--text-dim)",
          letterSpacing: "0.06em",
          flexShrink: 0,
          paddingTop: 1,
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55 }}>
        {text}
      </span>
    </div>
  );
}

function GoalBar({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number | string;
  target: number | string;
  color: string;
}) {
  const pct = Math.min(
    1,
    typeof current === "number" && typeof target === "number" && target > 0
      ? current / target
      : 0,
  );
  const done = pct >= 1;
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: done ? color : "var(--text)",
          }}
        >
          {current} / {target}
          {typeof current === "number" && typeof target === "string" ? "" : ""}
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "var(--border2)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct * 100}%`,
            background: done ? "var(--green)" : color,
            borderRadius: 3,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
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

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    const since        = getLast14Days();
    const weekStart    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const metrics90Since = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
    const todayStr2    = new Date().toISOString().split("T")[0];

    const [
      { data: l },
      { data: s },
      { data: w },
      { data: runs },
      { data: recent },
      { data: metricsData },
      { data: profileData },
      { data: nutData },
    ] = await Promise.all([
      sb.from("daily_logs").select("*").eq("user_id", user.id).gte("date", since).order("date"),
      sb.from("sessions").select("*").eq("user_id", user.id).gte("date", since).order("date", { ascending: false }),
      sb.from("weight_logs").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(14),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("running_activities").select("*").eq("user_id", user.id).gte("activity_date", weekStart).order("activity_date", { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("running_activities").select("*").eq("user_id", user.id).order("activity_date", { ascending: false }).limit(5),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any)
        .from("training_metrics")
        .select("activity_date, tss, trimp, pace_seconds_per_km, load_score, source")
        .eq("user_id", user.id)
        .gte("activity_date", metrics90Since)
        .order("activity_date"),
      sb
        .from("profiles")
        .select(
          "weekly_run_km_target, weekly_run_count_target, weekly_gym_target, sex, age, height_cm, nutrition_goal_type, target_weight, threshold_pace_seconds",
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      sb.from("nutrition_logs").select("calories").eq("user_id", user.id).eq("date", todayStr2),
    ]);

    const logsData    = (l      ?? []) as DailyLog[];
    const sessData    = (s      ?? []) as Session[];
    const wData       = (w      ?? []) as WeightLog[];
    const runsData    = (runs   ?? []) as RunningActivity[];
    const recentData  = (recent ?? []) as RunningActivity[];

    setLogs(logsData);
    setSessions(sessData);
    setWeights(wData);
    setWeekRuns(runsData);
    setRecentActivities(recentData);
    setStravaConnected(recentData.length > 0);
    setTrainingMetrics((metricsData ?? []) as TrainingMetricRow[]);
    setProfile(profileData as ProfileRow | null);

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

    // ── AI Insight (fire-and-forget after state is settled) ─────────────
    const last7Logs  = logsData.filter((l) => l.date >= weekStart);
    const todayLogAi = logsData.find((l) => l.date === todayStr2) ?? null;
    const avgOf = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : null;

    const metricsArr = (metricsData ?? []) as TrainingMetricRow[];
    const { ctl: ctlAi, tsb: tsbAi } = metricsArr.length > 0
      ? computeCTLATLTSB(metricsArr)
      : { ctl: 0, tsb: 0 };

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

    const checkinStrAi = calcCheckinStreak(logsData);
    const sessionStrAi = calcSessionStreak(sessData);
    const recovForHybrid = todayLogAi ? computeRecoveryScore(todayLogAi, tsbAi) : null;
    const hybridAi = computeHybridScore(recovForHybrid, ctlAi, null, checkinStrAi, sessionStrAi);

    const weekSessAi = sessData.filter((s) => s.date >= weekStart);
    const sessionTypesAi = { run: 0, lift: 0, study: 0 };
    weekSessAi.forEach((s) => {
      if (s.type === "run")   sessionTypesAi.run++;
      if (s.type === "lift")  sessionTypesAi.lift++;
      if (s.type === "study") sessionTypesAi.study++;
    });

    const nutRowsAi = (nutData ?? []) as { calories: number }[];
    const todayCaloriesAi = nutRowsAi.length > 0
      ? nutRowsAi.reduce((s, r) => s + (r.calories ?? 0), 0)
      : null;

    fetch("/api/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        avgSleep7d:       avgOf(last7Logs.map((l) => l.sleep_hours)),
        todaySleep:       todayLogAi?.sleep_hours ?? null,
        avgMood7d:        avgOf(last7Logs.map((l) => l.mood)),
        avgEnergy7d:      avgOf(last7Logs.map((l) => l.energy)),
        sessionTypes:     sessionTypesAi,
        todayCals:        todayCaloriesAi,
        calTarget:        null,
        latestWeight:     wData[0]?.weight ?? null,
        weightChange7d:   null,
        checkinStreak:    checkinStrAi,
        thisWeekSessions: weekSessAi.length,
        weeklyGoal:       null,
        readinessScore:   readinessScoreAi,
        readinessGrade:   readinessGradeAi,
        tsb:              tsbAi,
        ctl:              ctlAi,
        hybridScore:      hybridAi.score,
        hybridLevel:      hybridAi.level,
      }),
    })
      .then((r) => r.json())
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
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) { setSavingWeight(false); return; }
    const todayStr = new Date().toISOString().split("T")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any)
      .from("weight_logs")
      .upsert({ user_id: user.id, date: todayStr, weight: val }, { onConflict: "user_id,date" });
    setWeightInput("");
    setSavingWeight(false);
    load();
  }

  // ── Derived values ──────────────────────────────────────────────────────

  const todayStr      = useMemo(() => new Date().toISOString().split("T")[0], []);
  const weekStartDate = useMemo(
    () => {
      // eslint-disable-next-line react-hooks/purity
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    },
    [],
  );
  const todayLog      = logs.find((l) => l.date === todayStr) ?? null;

  const { tsb, ctl, atl } = trainingMetrics.length > 0
    ? computeCTLATLTSB(trainingMetrics)
    : { tsb: 0, ctl: 0, atl: 0 };

  const recoveryScore  = computeRecoveryScore(todayLog, tsb);
  const recoveryStatus = recoveryScore !== null ? getRecoveryStatus(recoveryScore) : null;
  const recoveryBanner = getRecoveryBanner(todayLog, recoveryScore);

  const weekDistM  = weekRuns.reduce((s, r) => s + r.distance_meters, 0);
  const weekGymCount = sessions.filter((s) => s.type === "lift" && s.date >= weekStartDate).length;

  // Readiness + coach engine (require today's check-in)
  let readinessOutput: ReadinessOutput | null = null;
  let coachOutput:     CoachOutput     | null = null;
  let hybridOutput:    HybridScoreOutput      = computeHybridScore(recoveryScore, ctl, null, checkinStreak, sessionStreak);

  if (todayLog && recoveryScore !== null) {
    readinessOutput = computeReadiness(
      recoveryScore,
      tsb,
      todayLog.sleep_quality,
      todayLog.fatigue,
      todayLog.energy,
    );

    // Nutrition targets for rec text
    const currentWeight = weights[0]?.weight ?? null;
    let proteinTarget   = 140;
    let waterTargetMl   = 3000;

    if (
      profile?.sex &&
      profile?.age &&
      profile?.height_cm &&
      currentWeight
    ) {
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
      ctl,
      atl,
      tsb,
      sleepQuality: todayLog.sleep_quality,
      energy:       todayLog.energy,
      mood:         todayLog.mood,
      fatigue:      todayLog.fatigue,
      soreness:     todayLog.soreness,
      goalProgress: {
        weeklyKmPct:  hasKmGoal  ? (weekDistM / 1000) / profile!.weekly_run_km_target  : 0,
        weeklyRunPct: hasRunGoal ? weekRuns.length    / profile!.weekly_run_count_target : 0,
        weeklyGymPct: hasGymGoal ? weekGymCount       / profile!.weekly_gym_target       : 0,
        hasKmGoal,
        hasRunGoal,
        hasGymGoal,
      },
      proteinTarget,
      waterTargetMl,
    });

    hybridOutput = computeHybridScore(recoveryScore, ctl, null, checkinStreak, sessionStreak);
  }

  const typeColor: Record<string, string> = {
    run: "var(--green)", lift: "var(--purple)", study: "var(--yellow)",
  };

  const sleepChartData  = logs.map((l) => ({ label: l.date.slice(5), value: l.sleep_hours }));
  const moodChartData   = logs.map((l) => ({ label: l.date.slice(5), value: l.mood }));
  const energyChartData = logs.map((l) => ({ label: l.date.slice(5), value: l.energy }));
  const weightChartData = [...weights].reverse().map((w) => ({ label: w.date.slice(5), value: w.weight }));
  const weightMax       = weights.length ? Math.max(...weights.map((w) => w.weight)) + 1 : 100;

  function streakLabel(n: number) {
    return n === 0 ? "—" : n >= 3 ? `🔥 ${n}` : `${n}`;
  }

  const goalStatusColor: Record<string, string> = {
    "Exceeded":  "var(--green)",
    "On Track":  "var(--accent)",
    "Behind":    "var(--red)",
  };

  if (loading)
    return (
      <div>
        <PageHeader title="DASHBOARD" subtitle="Last 14 days" />
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: 13 }}>
          Loading...
        </div>
      </div>
    );

  return (
    <div>
      <PageHeader title="DASHBOARD" subtitle="Last 14 days" />

      {/* Recovery Banner */}
      {recoveryBanner.show && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: 14,
            borderRadius: 10,
            border: `1px solid ${recoveryBanner.color}`,
            background: `${recoveryBanner.color}10`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: recoveryBanner.color,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, color: recoveryBanner.color }}>
            {recoveryBanner.message}
          </span>
        </div>
      )}

      {/* ── OBSERVER COACH CARD ── */}
      {coachOutput && readinessOutput ? (
        <div
          style={{
            marginBottom: 16,
            background: "var(--surface)",
            border: `1px solid ${readinessOutput.color}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              Observer Coach
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 24,
                  fontWeight: 700,
                  color: readinessOutput.color,
                  lineHeight: 1,
                }}
              >
                {readinessOutput.score}
                <span
                  style={{ fontSize: 11, fontWeight: 400, color: "var(--text-dim)", marginLeft: 2 }}
                >
                  /100
                </span>
              </div>
              <div
                style={{
                  padding: "3px 10px",
                  borderRadius: 4,
                  border: `1px solid ${readinessOutput.color}`,
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: readinessOutput.color,
                }}
              >
                {readinessOutput.grade}
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "14px 20px" }}>
            {/* Focus + label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontFamily: "var(--mono)",
                  color: "var(--text-dim)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Focus
              </span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: readinessOutput.color,
                  letterSpacing: "0.04em",
                }}
              >
                {coachOutput.primaryFocus}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  color: "var(--text-dim)",
                  fontFamily: "var(--mono)",
                }}
              >
                {readinessOutput.label}
              </span>
            </div>

            {/* Three recommendations */}
            <div>
              <RecRow icon="TRAIN" text={coachOutput.trainingRecommendation} />
              <RecRow icon="RECOV" text={coachOutput.recoveryRecommendation} />
              <div style={{ paddingTop: 8 }}>
                <RecRow icon="NUT  " text={coachOutput.nutritionRecommendation} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* No check-in nudge */
        !todayLog && (
          <div
            style={{
              marginBottom: 16,
              padding: "16px 20px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              Observer Coach
            </div>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Log today&apos;s check-in to activate coaching recommendations.
            </span>
          </div>
        )
      )}

      {/* AI Insight */}
      {aiInsight && (
        <div
          style={{
            marginBottom: 16,
            padding: "14px 20px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderLeft: "3px solid var(--accent)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 9,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              marginBottom: 8,
            }}
          >
            AI Insight · Groq
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.65 }}>
            {aiInsight}
          </p>
        </div>
      )}

      {/* Main stats — 2 cols on mobile, 4 on desktop */}
      <div className="grid-4" style={{ marginBottom: 12 }}>
        <StatCard value={stats?.avgSleep ?? "—"}    label="Avg Sleep (hrs)" />
        <StatCard value={stats?.avgMood  ?? "—"}    label="Avg Mood"   color="var(--yellow)" />
        <StatCard value={stats?.avgEnergy ?? "—"}   label="Avg Energy" color="var(--green)" />
        <StatCard value={stats?.totalSessions ?? 0} label="Sessions"   color="var(--accent)" />
      </div>

      {/* Second row */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <StatCard
          value={stats?.avgReadiness?.toFixed(1) ?? "—"}
          label="Avg Readiness"
          color="var(--accent)"
        />
        <StatCard
          value={`${stats?.sessionsByType.run ?? 0}/${stats?.sessionsByType.lift ?? 0}/${stats?.sessionsByType.study ?? 0}`}
          label="Run/Lift/Study"
        />
        <StatCard value={streakLabel(checkinStreak)} label="Check-in Streak" color="var(--red)" />
        <StatCard value={streakLabel(sessionStreak)} label="Session Streak"  color="var(--red)" />
      </div>

      {/* Recovery Score */}
      {recoveryStatus && (
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 12,
            marginBottom: 16,
            padding: "18px 20px",
            background: "var(--surface)",
            border: `1px solid ${recoveryStatus.color}`,
            borderRadius: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Recovery Score · Today
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 28,
                fontWeight: 700,
                color: recoveryStatus.color,
                lineHeight: 1,
              }}
            >
              {recoveryStatus.score}
              <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 2 }}>/100</span>
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: recoveryStatus.color,
                marginTop: 6,
                letterSpacing: "0.06em",
              }}
            >
              {recoveryStatus.label}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
              {recoveryStatus.description}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                width: 6,
                height: 70,
                borderRadius: 3,
                background: "var(--border2)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  width: "100%",
                  height: `${recoveryStatus.score}%`,
                  background: recoveryStatus.color,
                  borderRadius: 3,
                  transition: "height 0.4s ease",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Net Calories */}
      {todayNetCals !== null &&
        (() => {
          const net      = todayNetCals.eaten - todayNetCals.burned;
          const netColor =
            net > 300 ? "var(--yellow)" : net < -300 ? "var(--red)" : "var(--green)";
          return (
            <Card style={{ marginBottom: 16 }}>
              <SectionLabel>Net Calories · Today</SectionLabel>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 100px" }}>
                  <StatCard value={Math.round(todayNetCals.eaten)} label="Eaten"  color="var(--yellow)" />
                </div>
                <div style={{ flex: "1 1 100px" }}>
                  <StatCard value={Math.round(todayNetCals.burned)} label="Burned" color="var(--red)" />
                </div>
                <div style={{ flex: "1 1 100px" }}>
                  <StatCard
                    value={net > 0 ? `+${Math.round(net)}` : String(Math.round(net))}
                    label="Net"
                    color={netColor}
                  />
                </div>
              </div>
            </Card>
          );
        })()}

      {/* Running Summary */}
      {stravaConnected && (
        <Card style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <SectionLabel>This Week · Running</SectionLabel>
            <span
              style={{
                fontSize: 9,
                fontFamily: "var(--mono)",
                color: "#FC4C02",
                letterSpacing: "0.1em",
                border: "1px solid rgba(252,76,2,0.35)",
                padding: "2px 7px",
                borderRadius: 4,
              }}
            >
              STRAVA
            </span>
          </div>

          {(() => {
            const weekTotalTime = weekRuns.reduce((s, r) => s + r.moving_time_seconds, 0);
            const longestM      = weekRuns.length > 0 ? Math.max(...weekRuns.map((r) => r.distance_meters)) : 0;
            const avgPace       = weekDistM > 0 ? weekTotalTime / (weekDistM / 1000) : 0;
            const lastRun       = recentActivities[0];
            const lastRunLabel  = (() => {
              if (!lastRun) return "—";
              const diffDays = Math.floor(
                (Date.now() - new Date(lastRun.activity_date + "T00:00:00").getTime()) / 86400000,
              );
              if (diffDays === 0) return "Today";
              if (diffDays === 1) return "Yesterday";
              return `${diffDays}d ago`;
            })();
            return (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: weekRuns.length > 0 ? 16 : 0 }}>
                  {[
                    { value: weekRuns.length > 0 ? `${(weekDistM / 1000).toFixed(1)} km` : "—", label: "Weekly km" },
                    { value: weekRuns.length, label: "Runs" },
                    { value: longestM > 0 ? `${(longestM / 1000).toFixed(1)} km` : "—", label: "Longest" },
                    { value: avgPace > 0 ? formatPace(1000 / avgPace) : "—", label: "Avg Pace" },
                    { value: lastRunLabel, label: "Last Run" },
                  ].map(({ value, label }) => (
                    <div key={label} style={{ flex: "1 1 130px", minWidth: 0 }}>
                      <StatCard value={value} label={label} color="var(--green)" />
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          {recentActivities.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recentActivities.map((run) => (
                <div
                  key={run.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--surface2)",
                    border: "1px solid var(--border2)",
                    borderRadius: 10,
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 180,
                      }}
                    >
                      {run.activity_name}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: "var(--green)" }}>
                      {formatDistance(run.distance_meters)} km
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                      {fmtDur(run.moving_time_seconds)}
                    </span>
                    {run.average_speed && run.average_speed > 0 && (
                      <span style={{ fontSize: 11, color: "var(--green)", fontFamily: "var(--mono)" }}>
                        {formatPace(run.average_speed)}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                      {run.activity_date.slice(5)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Weekly Goals */}
      {profile &&
        (profile.weekly_run_km_target > 0 ||
          profile.weekly_run_count_target > 0 ||
          profile.weekly_gym_target > 0) && (
          <Card style={{ marginBottom: 0 }}>
            <SectionLabel>Weekly Goals</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
              {profile.weekly_run_km_target > 0 && (
                <GoalBar
                  label="Weekly Distance"
                  current={`${(weekDistM / 1000).toFixed(1)}`}
                  target={`${profile.weekly_run_km_target} km`}
                  color="var(--accent)"
                />
              )}
              {profile.weekly_run_count_target > 0 && (
                <GoalBar
                  label="Runs"
                  current={weekRuns.length}
                  target={profile.weekly_run_count_target}
                  color="var(--accent)"
                />
              )}
              {profile.weekly_gym_target > 0 && (
                <GoalBar
                  label="Gym Sessions"
                  current={weekGymCount}
                  target={profile.weekly_gym_target}
                  color="var(--purple)"
                />
              )}
            </div>

            {/* Goal Intelligence */}
            {coachOutput && (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 14px",
                  background: "var(--surface2)",
                  border: `1px solid ${goalStatusColor[coachOutput.goalStatus]}30`,
                  borderLeft: `3px solid ${goalStatusColor[coachOutput.goalStatus]}`,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "var(--mono)",
                      color: "var(--text-dim)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Goal Intelligence
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      color: goalStatusColor[coachOutput.goalStatus],
                      letterSpacing: "0.08em",
                    }}
                  >
                    {coachOutput.goalStatus.toUpperCase()}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.55 }}>
                  {coachOutput.goalRecommendation}
                </p>
              </div>
            )}
          </Card>
        )}

      {/* Hybrid Athlete Score */}
      <Card style={{ marginTop: 16, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <SectionLabel>Hybrid Athlete Score</SectionLabel>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 28,
                fontWeight: 700,
                color: "var(--accent)",
                lineHeight: 1,
              }}
            >
              {hybridOutput.score}
            </span>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--accent)",
                letterSpacing: "0.08em",
              }}
            >
              {hybridOutput.level}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              { label: "Recovery",    value: hybridOutput.components.recovery,    color: "var(--green)"  },
              { label: "Training",    value: hybridOutput.components.training,     color: "var(--accent)" },
              { label: "Nutrition",   value: hybridOutput.components.nutrition,    color: "var(--yellow)" },
              { label: "Consistency", value: hybridOutput.components.consistency,  color: "var(--purple)" },
            ] as const
          ).map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                flex: "1 1 100px",
                padding: "10px 12px",
                background: "var(--surface2)",
                border: "1px solid var(--border2)",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 18,
                  fontWeight: 700,
                  color,
                  lineHeight: 1,
                }}
              >
                {value}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "var(--text-dim)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 4,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  height: 3,
                  background: "var(--border2)",
                  borderRadius: 2,
                  marginTop: 6,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${value}%`,
                    background: color,
                    borderRadius: 2,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Weight Tracker */}
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Body Weight</SectionLabel>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ width: 120 }}>
            <Field label="Weight (kg)">
              <Input
                type="number"
                step={0.1}
                placeholder="72.5"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && logWeight()}
              />
            </Field>
          </div>
          <Button onClick={logWeight} disabled={savingWeight || !weightInput} style={{ marginBottom: 16 }}>
            Log
          </Button>
          {stats?.weightAvg7d ? (
            <div style={{ marginBottom: 16, marginLeft: 8 }}>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--purple)",
                }}
              >
                {stats.weightAvg7d} kg
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginLeft: 8,
                }}
              >
                7-day avg
              </span>
            </div>
          ) : null}
        </div>
        {weightChartData.length > 0 ? (
          <BarChart data={weightChartData} color="var(--purple)" maxVal={weightMax} />
        ) : (
          <EmptyState message="No weight data yet" />
        )}
      </Card>

      {/* Charts */}
      <Card style={{ marginBottom: 16 }}>
        {logs.length > 0 ? (
          <>
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Sleep (hours)
              </div>
              <BarChart data={sleepChartData} color="var(--accent)" maxVal={12} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Mood
              </div>
              <BarChart data={moodChartData} color="var(--yellow)" maxVal={10} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Energy
              </div>
              <BarChart data={energyChartData} color="var(--green)" maxVal={10} />
            </div>
          </>
        ) : (
          <EmptyState message="No check-ins yet" />
        )}
      </Card>

      {/* Recent Sessions */}
      <Card>
        <SectionLabel>Recent Sessions</SectionLabel>
        {sessions.length === 0 ? (
          <EmptyState message="No sessions logged yet" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sessions.slice(0, 8).map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      padding: "3px 8px",
                      border: `1px solid ${typeColor[s.type]}`,
                      color: typeColor[s.type],
                      textTransform: "uppercase",
                      flexShrink: 0,
                    }}
                  >
                    {s.type}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.notes || "—"}
                  </span>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                    {formatDuration(s.duration)}
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>
                    {s.date}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
