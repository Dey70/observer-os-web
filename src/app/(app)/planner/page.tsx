"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeCTLATLTSB } from "@/lib/trainingLoad";
import type { TrainingMetricRow } from "@/lib/trainingLoad";
import { computeRecoveryScore }  from "@/lib/recoveryScore";
import { computeReadiness }      from "@/lib/readiness";
import { computeAdaptiveGoals }  from "@/lib/adaptiveGoals";
import { computeWeekPlan }       from "@/lib/adaptivePlanner";
import type { WeekPlan, PlannedDay, PlannedSession, PlannedGrowthBlock, LoadLevel, DayPriority } from "@/lib/adaptivePlanner";
import type { DailyLog } from "@/types";

// ── Priority badge colours ─────────────────────────────────────────────────

const PRIORITY_META: Record<DayPriority, { label: string; color: string; bg: string }> = {
  HIGH:     { label: "HIGH",     color: "var(--red)",       bg: "var(--red-dim)"     },
  NORMAL:   { label: "NORMAL",   color: "var(--accent)",    bg: "var(--accent-dim)"  },
  RECOVERY: { label: "RECOVERY", color: "var(--green)",     bg: "var(--green-dim)"   },
  REST:     { label: "REST",     color: "var(--text-muted)", bg: "var(--surface2)"   },
};

const LOAD_BORDER: Record<LoadLevel, string> = {
  high:   "var(--red)33",
  medium: "var(--accent)22",
  low:    "var(--green)22",
  rest:   "var(--border)",
};

const SESSION_ICONS: Record<string, string> = {
  run_easy:        "→",
  run_tempo:       "⚡",
  run_intervals:   "⚡",
  run_long:        "→",
  lift_push:       "↑",
  lift_pull:       "↓",
  lift_legs:       "↕",
  lift_full:       "✦",
  active_recovery: "◌",
  rest:            "—",
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

const GROWTH_TIMING_LABEL: Record<string, string> = {
  morning:   "AM",
  afternoon: "PM",
  evening:   "EVE",
};

const BALANCE_META: Record<string, { color: string; dot: string }> = {
  "Excellent":        { color: "var(--green)",  dot: "●" },
  "Good":             { color: "var(--yellow)", dot: "●" },
  "Needs Adjustment": { color: "var(--red)",    dot: "●" },
};

// ── Sub-components ─────────────────────────────────────────────────────────

function SessionBlock({ session }: { session: PlannedSession }) {
  const color = SESSION_COLORS[session.type] ?? "var(--text-muted)";
  const icon  = SESSION_ICONS[session.type]  ?? "·";
  const isRest = session.type === "rest";

  if (isRest) {
    return (
      <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border2)" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.06em" }}>
          — Rest —
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: "1px solid var(--border2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 13, color, lineHeight: 1 }}>{icon}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color, letterSpacing: "0.01em" }}>
          {session.label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600,
            color, letterSpacing: "0.10em",
            background: color + "18", borderRadius: 4, padding: "2px 6px",
          }}
        >
          {session.intensity}
        </span>
        {session.distanceKm !== undefined && session.distanceKm > 0 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-muted)" }}>
            {session.distanceKm.toFixed(1)} km
          </span>
        )}
        {session.durationMin > 0 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>
            {session.durationMin} min
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 10, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.45,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
        }}
      >
        {session.notes}
      </div>
    </div>
  );
}

function GrowthBlock({ block }: { block: PlannedGrowthBlock }) {
  const timingLabel = GROWTH_TIMING_LABEL[block.timing] ?? block.timing.toUpperCase();
  const hrs = (block.durationMin / 60).toFixed(1);

  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: "var(--green)12",
        border: "1px solid var(--green)22",
        marginBottom: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "var(--green)", letterSpacing: "0.08em" }}>
          {block.label.toUpperCase()}
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)" }}>
          {timingLabel} · {hrs}h
        </span>
      </div>
    </div>
  );
}

function NutritionRow({ proteinG, caloriesKcal }: { proteinG: number; caloriesKcal: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        paddingTop: 8,
        borderTop: "1px solid var(--border2)",
        marginTop: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 9, color: "var(--text-dim)" }}>PROTEIN</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--yellow)" }}>
          {proteinG}g
        </span>
      </div>
      <div style={{ width: 1, height: 12, background: "var(--border2)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 9, color: "var(--text-dim)" }}>KCAL</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}>
          {caloriesKcal.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function DayCard({ day }: { day: PlannedDay }) {
  const pm  = PRIORITY_META[day.priority];
  const borderColor = LOAD_BORDER[day.load];

  return (
    <div
      style={{
        background:   day.isToday ? "var(--surface)"  : "var(--surface)",
        border:       day.isToday ? `1px solid ${day.load === "rest" ? "var(--accent)44" : borderColor}` : `1px solid ${borderColor}`,
        borderRadius: 14,
        padding:      "14px 14px 12px",
        display:      "flex",
        flexDirection: "column",
        gap:          6,
        opacity:      day.isPast && !day.isToday ? 0.6 : 1,
        position:     "relative",
        boxShadow:    day.isToday ? "0 0 0 2px var(--accent)44" : "none",
        minHeight:    200,
        transition:   "box-shadow 0.2s ease, opacity 0.2s ease",
      }}
    >
      {/* Day header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-muted)" }}>
            {day.shortDay}
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-dim)", marginTop: 1 }}>
            {day.date.slice(5).replace("-", "/")}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          {day.isToday && (
            <span
              style={{
                fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700,
                letterSpacing: "0.12em", color: "var(--accent)",
                background: "var(--accent-dim)", borderRadius: 4, padding: "2px 6px",
              }}
            >
              TODAY
            </span>
          )}
          {day.isPast && !day.isToday && (
            <span
              style={{
                fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.10em",
                color: "var(--text-dim)", borderRadius: 4,
              }}
            >
              PAST
            </span>
          )}
          <span
            style={{
              fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700,
              letterSpacing: "0.10em", color: pm.color,
              background: pm.bg, borderRadius: 4, padding: "2px 6px",
            }}
          >
            {pm.label}
          </span>
        </div>
      </div>

      {/* Sessions */}
      <div style={{ flex: 1 }}>
        {day.sessions.map((s, i) => (
          <SessionBlock key={i} session={s} />
        ))}
      </div>

      {/* Growth block */}
      {day.growth && <GrowthBlock block={day.growth} />}

      {/* Nutrition */}
      <NutritionRow
        proteinG={day.nutrition.proteinG}
        caloriesKcal={day.nutrition.caloriesKcal}
      />
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

  const [plan,    setPlan]    = useState<WeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

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
          .select("distance_meters")
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
      const runs     = (runsData    ?? []) as { distance_meters: number }[];
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

      // Weekly actuals
      const weeklyRunKm   = runs.reduce((s, r) => s + r.distance_meters, 0) / 1000;
      const weeklyLifts   = sessions.filter((s) => s.type === "lift" && s.date >= weekStartStr).length;
      const growthLogs    = growth.filter((g) => g.date >= weekStartStr);
      const growthHours   = growthLogs.reduce((s, g) => s + g.duration_min, 0) / 60;
      const growthByCat   = {
        study:     growthLogs.filter((g) => g.category === "study").reduce((s, g) => s + g.duration_min, 0) / 60,
        project:   growthLogs.filter((g) => g.category === "project").reduce((s, g) => s + g.duration_min, 0) / 60,
        learning:  growthLogs.filter((g) => g.category === "learning").reduce((s, g) => s + g.duration_min, 0) / 60,
        deep_work: growthLogs.filter((g) => g.category === "deep_work").reduce((s, g) => s + g.duration_min, 0) / 60,
      };

      const { computeHybridScore } = await import("@/lib/hybridScore");
      const weeklyGrowthMin = Math.round(growthHours * 60);
      const hybrid = computeHybridScore(recoveryScore, ctl, null, weeklyGrowthMin);

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
        avgDailyCalories: null,
        avgDailyProtein:  null,
        proteinTargetG:   proteinTarget,
        calorieTargetKcal: null,
        waterTargetMl:    3000,
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
        trainingProfile: profile?.split ?? "balanced",
      });

      setPlan(weekPlan);
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
        <div style={{ height: 60, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", animation: "pulse 1.8s ease-in-out infinite" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ height: 220, borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", animation: "pulse 1.8s ease-in-out infinite", animationDelay: `${i * 0.07}s` }} />
          ))}
        </div>
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

  // ── Helpers for date display ─────────────────────────────────────────────

  function fmtDate(iso: string) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  const bm = BALANCE_META[plan.planBalance] ?? BALANCE_META["Good"];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .pa1 { animation: fadeUp 0.35s ease both; }
        .pa2 { animation: fadeUp 0.35s 0.07s ease both; }
        .pa3 { animation: fadeUp 0.35s 0.14s ease both; }
        .plan-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 10px;
        }
        @media (max-width: 1400px) {
          .plan-grid { grid-template-columns: repeat(4, 1fr); }
        }
        @media (max-width: 900px) {
          .plan-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 640px) {
          .plan-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 420px) {
          .plan-grid { grid-template-columns: 1fr; }
        }
        .day-card-hover {
          transition: box-shadow 0.2s ease, transform 0.2s ease;
        }
        .day-card-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(0,0,0,0.25);
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="pa1" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>
              WEEKLY PLANNER
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>
              {fmtDate(plan.weekStart)} – {fmtDate(plan.weekEnd)} · Deterministic engine
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span
              style={{
                fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
                color: plan.weekFocusColor, background: plan.weekFocusColor + "18",
                border: `1px solid ${plan.weekFocusColor}33`,
                padding: "5px 12px", borderRadius: 99,
              }}
            >
              {plan.weekFocus}
            </span>
            <span
              style={{
                fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.10em",
                color: bm.color,
                padding: "5px 12px", borderRadius: 99,
                background: bm.color + "18",
                border: `1px solid ${bm.color}33`,
              }}
              title={plan.planBalanceReason}
            >
              {bm.dot} {plan.planBalance.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* ── Week summary strip ────────────────────────────────────────────────── */}
      <div
        className="pa2"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
          padding: "12px 16px",
          borderRadius: 12,
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        {[
          { label: "PLANNED KM",   value: `${plan.totalRunKm.toFixed(1)} km`,  color: "var(--accent)"  },
          { label: "LIFTS",        value: `${plan.totalLiftSessions} sessions`, color: "var(--purple)"  },
          { label: "GROWTH",       value: `${plan.totalGrowthHours.toFixed(1)} h`, color: "var(--green)" },
          { label: "PLAN BALANCE", value: plan.planBalance,                     color: bm.color         },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              display: "flex", flexDirection: "column", gap: 2,
              padding: "6px 14px",
              borderRadius: 8,
              background: "var(--surface2)",
              border: "1px solid var(--border2)",
              minWidth: 100,
            }}
          >
            <span style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)" }}>
              {label}
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color }}>
              {value}
            </span>
          </div>
        ))}

        {/* Balance reason */}
        <div
          style={{
            flex: 1, minWidth: 200,
            padding: "6px 14px",
            borderRadius: 8,
            background: "var(--surface2)",
            border: "1px solid var(--border2)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.4 }}>
            {plan.planBalanceReason}
          </span>
        </div>
      </div>

      {/* ── 7-day grid ───────────────────────────────────────────────────────── */}
      <div className="plan-grid pa3">
        {plan.days.map((day) => (
          <div key={day.date} className="day-card-hover">
            <DayCard day={day} />
          </div>
        ))}
      </div>

      {/* ── Footer note ──────────────────────────────────────────────────────── */}
      <div
        className="pa3"
        style={{
          marginTop: 20,
          padding: "10px 16px",
          borderRadius: 10,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.10em",
            color: "var(--accent)", background: "var(--accent-dim)",
            padding: "3px 8px", borderRadius: 4, flexShrink: 0,
          }}
        >
          Phase 5B · read-only
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.4 }}>
          Plan is deterministically regenerated from your latest physiological signals on every load.
          Past days show the originally scheduled intent.
        </div>
      </div>
    </>
  );
}
