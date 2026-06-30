"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeCTLATLTSB }   from "@/lib/trainingLoad";
import type { TrainingMetricRow } from "@/lib/trainingLoad";
import { computeRecoveryScore }  from "@/lib/recoveryScore";
import { computeReadiness }      from "@/lib/readiness";
import { computeAdaptiveGoals }  from "@/lib/adaptiveGoals";
import { computeWeekPlan }       from "@/lib/adaptivePlanner";
import type {
  WeekPlan,
  PlannedDay,
  PlannedSession,
  PlannedGrowthBlock,
  LoadLevel,
  DayPriority,
  GoalComparison,
  DecisionRationale,
} from "@/lib/adaptivePlanner";
import { computeExecutionSummary, replanRemainingWeek } from "@/lib/adaptiveExecution";
import type { ExecutionInput, ExecutionSummary, ExecutionDayStatus, ExecutionStatus } from "@/lib/adaptiveExecution";
import type { DailyLog } from "@/types";

// ── Colour maps ────────────────────────────────────────────────────────────

const PRIORITY_META: Record<DayPriority, { label: string; color: string; bg: string }> = {
  HIGH:     { label: "HIGH",     color: "var(--red)",        bg: "var(--red-dim)"     },
  NORMAL:   { label: "NORMAL",   color: "var(--accent)",     bg: "var(--accent-dim)"  },
  RECOVERY: { label: "RECOVERY", color: "var(--green)",      bg: "var(--green-dim)"   },
  REST:     { label: "REST",     color: "var(--text-muted)", bg: "var(--surface2)"    },
};

const EXEC_STATUS_META: Record<ExecutionStatus, { label: string; color: string }> = {
  planned:     { label: "PLANNED",     color: "var(--text-muted)" },
  in_progress: { label: "IN PROGRESS", color: "var(--yellow)"     },
  completed:   { label: "COMPLETED",   color: "var(--green)"      },
  skipped:     { label: "SKIPPED",     color: "var(--red)"        },
  rescheduled: { label: "RESCHEDULED", color: "var(--accent)"     },
  cancelled:   { label: "CANCELLED",   color: "var(--purple)"     },
};

const LOAD_BORDER: Record<LoadLevel, string> = {
  high:   "var(--red)44",
  medium: "var(--accent)28",
  low:    "var(--green)22",
  rest:   "var(--border)",
};

const SESSION_COLORS: Record<string, string> = {
  run_easy:        "var(--accent)",
  run_tempo:       "var(--yellow)",
  run_intervals:   "var(--red)",
  run_long:        "var(--accent)",
  lift_push:       "var(--purple)",
  lift_pull:       "var(--purple)",
  lift_legs:       "var(--purple)",
  lift_full:       "var(--purple)",
  active_recovery: "var(--green)",
  rest:            "var(--text-dim)",
};

const SESSION_ICONS: Record<string, string> = {
  run_easy: "→", run_tempo: "⚡", run_intervals: "⚡", run_long: "→",
  lift_push: "↑", lift_pull: "↓", lift_legs: "↕", lift_full: "✦",
  active_recovery: "◌", rest: "—",
};

const TIMING_LABEL: Record<string, string> = { morning: "AM", afternoon: "PM", evening: "EVE" };

const BALANCE_META: Record<string, { color: string }> = {
  "Excellent":        { color: "var(--green)"  },
  "Good":             { color: "var(--yellow)" },
  "Needs Adjustment": { color: "var(--red)"    },
};

// ── Sub-components ─────────────────────────────────────────────────────────

function SessionBlock({ session }: { session: PlannedSession }) {
  const color  = SESSION_COLORS[session.type] ?? "var(--text-muted)";
  const icon   = SESSION_ICONS[session.type]  ?? "·";
  const isRest = session.type === "rest";

  if (isRest) {
    return (
      <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border2)" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.05em" }}>
          — Rest —
        </span>
      </div>
    );
  }
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color, lineHeight: 1 }}>{icon}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color }}>
          {session.label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 600, color, background: color + "18", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.08em" }}>
          {session.intensity}
        </span>
        {session.distanceKm !== undefined && session.distanceKm > 0 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-muted)" }}>
            {session.distanceKm.toFixed(1)} km
          </span>
        )}
        {session.durationMin > 0 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)" }}>
            {session.durationMin} min
          </span>
        )}
      </div>
      <div style={{ fontSize: 9, color: "var(--text-dim)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
        {session.notes}
      </div>
    </div>
  );
}

// Improvement 5: show category + title + timing + duration
function GrowthBlock({ block }: { block: PlannedGrowthBlock }) {
  const tLabel = TIMING_LABEL[block.timing] ?? block.timing.toUpperCase();
  const hrs    = (block.durationMin / 60).toFixed(1);

  return (
    <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--green)10", border: "1px solid var(--green)22", marginBottom: 4 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--green)", marginBottom: 2 }}>
        {block.label.toUpperCase()}
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--green)", marginBottom: 2 }}>
        {block.title}
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)" }}>
        {tLabel} · {hrs}h
      </div>
    </div>
  );
}

function NutritionRow({ proteinG, caloriesKcal }: { proteinG: number; caloriesKcal: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8, borderTop: "1px solid var(--border2)", marginTop: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 8, color: "var(--text-dim)", letterSpacing: "0.06em" }}>PRO</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--yellow)" }}>
          {proteinG}g
        </span>
      </div>
      <div style={{ width: 1, height: 10, background: "var(--border2)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 8, color: "var(--text-dim)", letterSpacing: "0.06em" }}>KCAL</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>
          {caloriesKcal.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function ExecStatusBadge({ status }: { status: ExecutionStatus }) {
  const meta = EXEC_STATUS_META[status];
  return (
    <span
      style={{
        fontFamily:    "var(--mono)",
        fontSize:      8,
        fontWeight:    700,
        letterSpacing: "0.10em",
        color:         meta.color,
        border:        `1px solid ${meta.color}55`,
        borderRadius:  4,
        padding:       "2px 6px",
      }}
    >
      {meta.label}
    </span>
  );
}

// Improvement 3: visual hierarchy — TODAY glow, TOMORROW secondary, PAST dim
function DayCard({ day, execStatus }: { day: PlannedDay; execStatus?: ExecutionDayStatus }) {
  const pm     = PRIORITY_META[day.priority];
  const border = LOAD_BORDER[day.load];

  const todayStyle = day.isToday ? {
    border:    `1px solid var(--accent)66`,
    boxShadow: "0 0 0 2px var(--accent)33, 0 8px 32px var(--accent)14",
  } : day.isTomorrow ? {
    border:    `1px solid ${border}`,
    boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
  } : {
    border: `1px solid ${border}`,
  };

  return (
    <div
      style={{
        background:    "var(--surface)",
        borderRadius:  14,
        padding:       "14px 14px 12px",
        display:       "flex",
        flexDirection: "column",
        gap:           5,
        opacity:       day.isPast && !day.isToday ? 0.55 : 1,
        minHeight:     200,
        transition:    "box-shadow 0.2s ease, opacity 0.2s ease",
        ...todayStyle,
      }}
    >
      {/* Day header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 3 }}>
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: day.isToday ? "var(--accent)" : "var(--text-muted)" }}>
            {day.shortDay}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>
            {day.date.slice(5).replace("-", "/")}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          {execStatus && <ExecStatusBadge status={execStatus.status} />}
          {day.isToday && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 4, padding: "2px 6px" }}>
              TODAY
            </span>
          )}
          {day.isTomorrow && !day.isToday && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.10em", color: "var(--text-muted)", background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 4, padding: "2px 5px" }}>
              TMR
            </span>
          )}
          {day.isPast && !day.isToday && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.08em", color: "var(--text-dim)" }}>
              PAST
            </span>
          )}
          <span style={{ fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.10em", color: pm.color, background: pm.bg, borderRadius: 4, padding: "2px 6px" }}>
            {pm.label}
          </span>
        </div>
      </div>

      {/* Sessions */}
      <div style={{ flex: 1 }}>
        {day.sessions.map((s, i) => <SessionBlock key={i} session={s} />)}
      </div>

      {/* Growth */}
      {day.growth && <GrowthBlock block={day.growth} />}

      {/* Nutrition */}
      <NutritionRow proteinG={day.nutrition.proteinG} caloriesKcal={day.nutrition.caloriesKcal} />
    </div>
  );
}

// Improvement 2: planned vs goal tile with progress bar
function GoalTile({
  label,
  cmp,
  color,
}: {
  label: string;
  cmp:   GoalComparison;
  color: string;
}) {
  const hasTarget = cmp.target !== null;
  const pct       = cmp.pct ?? 1;
  const barPct    = Math.min(1, pct);
  const overGoal  = pct > 1.0;

  function fmt(v: number): string {
    if (cmp.unit === "km")       return `${v.toFixed(1)} km`;
    if (cmp.unit === "sessions") return `${v} sess`;
    if (cmp.unit === "h")        return `${v.toFixed(1)}h`;
    if (cmp.unit === "g/day")    return `${v}g`;
    return `${v}`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "10px 14px", borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border2)", minWidth: 110, flex: "1 1 110px" }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>
        {fmt(cmp.planned)}
      </span>
      {hasTarget ? (
        <>
          <div style={{ height: 3, background: "var(--border2)", borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
            <div style={{ height: "100%", width: `${barPct * 100}%`, background: overGoal ? "var(--green)" : color, borderRadius: 2, transition: "width 0.9s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--text-dim)" }}>
              Target: {fmt(cmp.target!)}
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, color: overGoal ? "var(--green)" : color }}>
              {Math.round(pct * 100)}%
            </span>
          </div>
        </>
      ) : (
        <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--text-dim)" }}>No target</span>
      )}
    </div>
  );
}

// Improvement 1: WHY THIS PLAN card
function RationaleCard({ r }: { r: DecisionRationale }) {
  return (
    <div
      style={{
        background:   "var(--surface)",
        border:       `1px solid ${r.priorityColor}33`,
        borderRadius: 14,
        overflow:     "hidden",
        marginBottom: 14,
      }}
    >
      <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", color: "var(--text-muted)" }}>
          WHY THIS PLAN
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: r.priorityColor, background: r.priorityColor + "18", border: `1px solid ${r.priorityColor}33`, borderRadius: 99, padding: "3px 10px" }}>
          {r.primaryPriority}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {/* Signals column */}
        <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border2)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)", marginBottom: 10 }}>
            SIGNALS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {r.signals.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: r.priorityColor, flexShrink: 0, marginTop: 1 }}>·</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.35 }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Decisions column */}
        <div style={{ padding: "14px 20px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)", marginBottom: 10 }}>
            DECISION
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {r.decisions.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: r.priorityColor, flexShrink: 0, marginTop: 1 }}>→</span>
                <span style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.35 }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Improvement 6: plan balance with bullets
function BalanceCard({ plan }: { plan: WeekPlan }) {
  const bm = BALANCE_META[plan.planBalance] ?? BALANCE_META["Good"];
  return (
    <div style={{ padding: "12px 16px", borderRadius: 12, background: "var(--surface)", border: `1px solid ${bm.color}22`, marginBottom: 14, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)", marginBottom: 5 }}>
          PLAN BALANCE
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: bm.color }}>
          {plan.planBalance.toUpperCase()}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 5, paddingTop: 2 }}>
        {plan.planBalanceBullets.map((b, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: bm.color, flexShrink: 0, marginTop: 1 }}>✓</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.35 }}>{b}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Profile row type ────────────────────────────────────────────────────────

type ProfileRow = {
  split:                   string | null;
  weekly_run_km_target:    number | null;
  weekly_run_count_target: number | null;
  weekly_gym_target:       number | null;
  sex:                     "male" | "female" | null;
  age:                     number | null;
  height_cm:               number | null;
  nutrition_goal_type:     string | null;
  target_weight:           number | null;
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const sb = createClient();
  const [plan,        setPlan]        = useState<WeekPlan | null>(null);
  const [execSummary, setExecSummary] = useState<ExecutionSummary | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      const today        = new Date().toISOString().split("T")[0];
      const since14      = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
      const since90      = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const weekStartStr = new Date(Date.now() -  7 * 86400000).toISOString().split("T")[0];

      const [
        { data: logsData },
        { data: sessData },
        { data: metricsData },
        { data: profileData },
        { data: runsData },
        { data: growthData },
        { data: weightData },
      ] = await Promise.all([
        sb.from("daily_logs").select("*").eq("user_id", user.id).gte("date", since14).order("date", { ascending: false }),
        sb.from("sessions").select("*").eq("user_id", user.id).gte("date", since14).order("date", { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any).from("training_metrics")
          .select("activity_date, tss, trimp, pace_seconds_per_km, load_score, source")
          .eq("user_id", user.id).gte("activity_date", since90).order("activity_date"),
        sb.from("profiles")
          .select("split, weekly_run_km_target, weekly_run_count_target, weekly_gym_target, sex, age, height_cm, nutrition_goal_type, target_weight")
          .eq("user_id", user.id).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any).from("running_activities")
          .select("distance_meters, activity_date")
          .eq("user_id", user.id).gte("activity_date", weekStartStr),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as any).from("growth_logs")
          .select("date, category, duration_min")
          .eq("user_id", user.id).gte("date", weekStartStr),
        sb.from("weight_logs").select("weight").eq("user_id", user.id).order("date", { ascending: false }).limit(1),
      ]);

      const logs     = (logsData    ?? []) as DailyLog[];
      const sessions = (sessData    ?? []) as { type: string; date: string; duration?: number }[];
      const metrics  = (metricsData ?? []) as TrainingMetricRow[];
      const profile  = profileData as ProfileRow | null;
      const runs     = (runsData    ?? []) as { distance_meters: number; activity_date: string }[];
      const growth   = (growthData  ?? []) as { date: string; category: string; duration_min: number }[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latestWeight = ((weightData as any[])?.[0])?.weight ?? null;

      const { ctl, atl, tsb } = metrics.length > 0
        ? computeCTLATLTSB(metrics)
        : { ctl: 0, atl: 0, tsb: 0 };

      const todayLog      = logs.find((l) => l.date === today) ?? null;
      const recoveryScore = computeRecoveryScore(todayLog, tsb);

      let readinessScore: number | null = null;
      let proteinTarget  = 140;

      if (todayLog && recoveryScore !== null) {
        const r = computeReadiness(recoveryScore, tsb, todayLog.sleep_quality, todayLog.fatigue, todayLog.energy);
        readinessScore = r.score;
      }

      if (profile?.sex && profile?.age && profile?.height_cm && latestWeight) {
        const { calculateDailyTargets } = await import("@/lib/nutritionEngine");
        type NutritionProfileInputs = import("@/lib/nutritionEngine").NutritionProfileInputs;
        const todaySess = sessions.filter((s) => s.date === today);
        const targets = calculateDailyTargets(
          {
            sex:              profile.sex as NutritionProfileInputs["sex"],
            age:              profile.age,
            height_cm:        profile.height_cm,
            weight_kg:        latestWeight,
            goal_type:        (profile.nutrition_goal_type ?? "maintain") as NutritionProfileInputs["goal_type"],
            target_weight_kg: profile.target_weight ?? null,
          },
          todaySess as Parameters<typeof calculateDailyTargets>[1],
          readinessScore,
          false,
          null,
        );
        proteinTarget = targets.protein;
      }

      const weeklyRunKm = runs.reduce((s, r) => s + r.distance_meters, 0) / 1000;
      const weeklyLifts = sessions.filter((s) => s.type === "lift" && s.date >= weekStartStr).length;
      const growthLogs  = growth.filter((g) => g.date >= weekStartStr);
      const growthHours = growthLogs.reduce((s, g) => s + g.duration_min, 0) / 60;
      const growthByCat = {
        study:     growthLogs.filter((g) => g.category === "study").reduce((s, g) => s + g.duration_min, 0) / 60,
        project:   growthLogs.filter((g) => g.category === "project").reduce((s, g) => s + g.duration_min, 0) / 60,
        learning:  growthLogs.filter((g) => g.category === "learning").reduce((s, g) => s + g.duration_min, 0) / 60,
        deep_work: growthLogs.filter((g) => g.category === "deep_work").reduce((s, g) => s + g.duration_min, 0) / 60,
      };

      const { computeHybridScore } = await import("@/lib/hybridScore");
      const hybrid = computeHybridScore(recoveryScore, ctl, null, Math.round(growthHours * 60));

      const weekLogs7d = logs.filter((l) => l.date >= weekStartStr);
      const avg7d = (arr: number[]) => arr.length >= 3 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

      const adaptiveGoals = computeAdaptiveGoals({
        ctl, atl, tsb,
        readinessScore,
        recoveryScore,
        sleepQuality: todayLog?.sleep_quality ?? null,
        fatigue:      todayLog?.fatigue       ?? null,
        soreness:     todayLog?.soreness      ?? null,
        energy:       todayLog?.energy        ?? null,
        avgSleepQuality7d: avg7d(weekLogs7d.map((l) => l.sleep_quality)),
        avgFatigue7d:      avg7d(weekLogs7d.map((l) => l.fatigue)),
        avgEnergy7d:       avg7d(weekLogs7d.map((l) => l.energy)),
        hybridScore:           hybrid.score,
        hybridGrowthComponent: hybrid.components.growth,
        weeklyRunKm,
        weeklyRunCount:     runs.length,
        weeklyLiftSessions: weeklyLifts,
        weeklyGrowthHours:  growthHours,
        weeklyGrowthCategories: growthByCat,
        avgDailyCalories:  null,
        avgDailyProtein:   null,
        proteinTargetG:    proteinTarget,
        calorieTargetKcal: null,
        waterTargetMl:     3000,
        userRunKmGoal:    profile?.weekly_run_km_target    ?? 0,
        userRunCountGoal: profile?.weekly_run_count_target ?? 0,
        userGymGoal:      profile?.weekly_gym_target       ?? 0,
      });

      const weekPlan = computeWeekPlan({
        adaptiveGoals,
        ctl, atl, tsb,
        readinessScore,
        recoveryScore,
        today,
        trainingProfile:  profile?.split ?? "balanced",
        userRunKmGoal:    profile?.weekly_run_km_target    ?? 0,
        userGymGoal:      profile?.weekly_gym_target       ?? 0,
        proteinTargetG:   proteinTarget,
      });

      const completedRunDates = Array.from(new Set([
        ...runs.map((r) => r.activity_date),
        ...sessions.filter((s) => s.type === "run").map((s) => s.date),
      ]));
      const completedLiftDates = Array.from(new Set(
        sessions.filter((s) => s.type === "lift").map((s) => s.date),
      ));

      const execInput: ExecutionInput = {
        weekPlan,
        today,
        completedRunDates,
        completedLiftDates,
        actualWeeklyRunKm:        weeklyRunKm,
        actualWeeklyLiftSessions: weeklyLifts,
        actualWeeklyGrowthHours:  growthHours,
        actualAvgDailyProtein:    null,
      };

      const executionSummary = computeExecutionSummary(execInput);
      const { plan: finalPlan } = replanRemainingWeek(weekPlan, today, executionSummary);

      setPlan(finalPlan);
      setExecSummary(executionSummary);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[80, 120, 60, 220].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", animation: "pulse 1.8s ease-in-out infinite", animationDelay: `${i * 0.07}s` }} />
        ))}
        <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", fontFamily: "var(--mono)", fontSize: 12 }}>
        {error ?? "Failed to generate plan."}
      </div>
    );
  }

  function fmtDate(iso: string) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  const bm = BALANCE_META[plan.planBalance] ?? BALANCE_META["Good"];

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .pa1 { animation: fadeUp 0.30s ease both; }
        .pa2 { animation: fadeUp 0.30s 0.06s ease both; }
        .pa3 { animation: fadeUp 0.30s 0.12s ease both; }
        .pa4 { animation: fadeUp 0.30s 0.18s ease both; }
        .pa5 { animation: fadeUp 0.30s 0.24s ease both; }
        .plan-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 10px;
        }
        @media (max-width: 1400px) { .plan-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (max-width: 900px)  { .plan-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 640px)  { .plan-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 420px)  { .plan-grid { grid-template-columns: 1fr; } }
        .day-card-hover { transition: box-shadow 0.2s ease, transform 0.2s ease; }
        .day-card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,0.25); }
        .rationale-grid { display: grid; grid-template-columns: 1fr 1fr; }
        @media (max-width: 560px) { .rationale-grid { grid-template-columns: 1fr; } }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="pa1" style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>
            WEEKLY PLANNER
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>
            {fmtDate(plan.weekStart)} – {fmtDate(plan.weekEnd)} · Deterministic schedule
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: plan.weekFocusColor, background: plan.weekFocusColor + "18", border: `1px solid ${plan.weekFocusColor}33`, padding: "5px 12px", borderRadius: 99 }}>
            {plan.weekFocus}
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.10em", color: bm.color, background: bm.color + "18", border: `1px solid ${bm.color}33`, padding: "5px 12px", borderRadius: 99 }}>
            ● {plan.planBalance.toUpperCase()}
          </span>
        </div>
      </div>

      {/* ── Improvement 1: WHY THIS PLAN card ────────────────────────────── */}
      <div className="pa2">
        <RationaleCard r={plan.decisionRationale} />
      </div>

      {/* ── Improvement 2: Planned vs Goal summary strip ─────────────────── */}
      <div className="pa3" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "12px 16px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <GoalTile label="Running"  cmp={plan.goalComparison.running}  color="var(--accent)"  />
          <GoalTile label="Strength" cmp={plan.goalComparison.strength} color="var(--purple)"  />
          <GoalTile label="Growth"   cmp={plan.goalComparison.growth}   color="var(--green)"   />
          <GoalTile label="Protein"  cmp={plan.goalComparison.protein}  color="var(--yellow)"  />
        </div>
      </div>

      {/* ── Improvement 6: Plan Balance card ─────────────────────────────── */}
      <div className="pa3">
        <BalanceCard plan={plan} />
      </div>

      {/* ── 7-day grid (Improvement 3: visual hierarchy) ──────────────────── */}
      <div className="plan-grid pa4">
        {plan.days.map((day) => (
          <div key={day.date} className="day-card-hover">
            <DayCard day={day} execStatus={execSummary?.days.find((d) => d.date === day.date)} />
          </div>
        ))}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="pa5" style={{ marginTop: 20, padding: "10px 16px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.10em", color: "var(--accent)", background: "var(--accent-dim)", padding: "3px 8px", borderRadius: 4, flexShrink: 0 }}>
          Phase 6A · adaptive execution
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.4 }}>
          Plan regenerated deterministically from latest physiological signals every load.
          Missed sessions are automatically redistributed across the remaining week — read-only badges, no manual editing yet.
        </div>
      </div>
    </>
  );
}
