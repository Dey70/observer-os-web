/**
 * Adaptive Execution Engine — Phase 6A
 *
 * Pure deterministic engine. No AI. No LLM. No database migrations.
 *
 * Observes whether the athlete actually did what adaptivePlanner.ts
 * scheduled, by diffing the WeekPlan against already-logged sessions /
 * runs / growth hours. Execution state is never stored — it is re-derived
 * from the plan + actuals on every call, the same way adaptiveGoals,
 * adaptivePlanner and predictionEngine are pure functions of their inputs.
 *
 * Consumes adaptivePlanner's WeekPlan/PlannedDay/PlannedSession types only.
 * Does not modify adaptiveGoals.ts, adaptivePlanner.ts or predictionEngine.ts.
 */

import type {
  WeekPlan,
  PlannedDay,
  PlannedSession,
  SessionType,
  LoadLevel,
  DayPriority,
  PlanBalance,
} from "@/lib/adaptivePlanner";
import type { SkipReason } from "@/types";

export type { SkipReason };

// ── Public types ────────────────────────────────────────────────────────────

export type ExecutionStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "skipped"
  | "rescheduled"
  | "cancelled";

export interface ExecutionDayStatus {
  date:         string;
  dayOfWeek:    string;
  status:       ExecutionStatus;
  plannedLabel: string;
  note:         string;
  skipReason:   SkipReason | null;
}

export interface ExecutionDeviation {
  label:        string;
  plannedValue: number;
  actualValue:  number;
  unit:         string;
  deltaPct:     number;
  status:       "ahead" | "on_track" | "behind" | "no_data";
}

export interface ExecutionChange {
  fromDate:     string;
  toDate:       string;
  sessionLabel: string;
  reason:       string;
}

export interface ExecutionSummary {
  days:                ExecutionDayStatus[];
  completedSessions:   number;
  missedSessions:      number;
  completionPct:       number;
  adherencePct:        number;
  recoveryDeviation:   ExecutionDeviation;
  nutritionDeviation:  ExecutionDeviation;
  growthDeviation:     ExecutionDeviation;
  plannerDeviation:    ExecutionDeviation;
  replanningRequired:  boolean;
  reason:              string;
  nextAdjustment:      string | null;
}

export interface ExecutionInput {
  weekPlan:                 WeekPlan;
  today:                    string;          // "YYYY-MM-DD"
  completedRunDates:        string[];        // dates with a logged run (Strava + manual session fallback)
  completedLiftDates:       string[];        // dates with a logged lift session
  actualWeeklyRunKm:        number;          // this calendar week so far
  actualWeeklyLiftSessions: number;
  actualWeeklyGrowthHours:  number;
  actualAvgDailyProtein:    number | null;   // null = no nutrition logging
  skipReasons:              Record<string, SkipReason>;  // date → recorded reason; {} if none yet
}

// ── Small helpers ───────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sessionLoadLevel(type: SessionType): LoadLevel {
  switch (type) {
    case "run_long":
    case "run_intervals":
    case "lift_legs":
      return "high";
    case "active_recovery":
      return "low";
    case "rest":
      return "rest";
    default:
      return "medium";
  }
}

function dayPriorityLocal(type: SessionType): DayPriority {
  if (type === "rest") return "REST";
  if (type === "active_recovery") return "RECOVERY";
  if (type === "run_long" || type === "run_intervals" || type === "lift_legs") return "HIGH";
  return "NORMAL";
}

// ── Base day classification ────────────────────────────────────────────────

function classifyDays(
  days:               PlannedDay[],
  today:              string,
  completedRunDates:  Set<string>,
  completedLiftDates: Set<string>,
  skipReasons:        Record<string, SkipReason>,
): ExecutionDayStatus[] {
  return days.map((d) => {
    const sess       = d.sessions[0];
    const type       = sess?.type ?? "rest";
    const isRestLike = type === "rest" || type === "active_recovery";
    const label      = sess?.label ?? "Rest";

    if (d.date > today) {
      return { date: d.date, dayOfWeek: d.dayOfWeek, status: "planned", plannedLabel: label, note: "Scheduled.", skipReason: null };
    }

    if (isRestLike) {
      return { date: d.date, dayOfWeek: d.dayOfWeek, status: "completed", plannedLabel: label, note: "Rest day.", skipReason: null };
    }

    const matched = type.startsWith("run_")
      ? completedRunDates.has(d.date)
      : type.startsWith("lift_")
      ? completedLiftDates.has(d.date)
      : false;

    if (d.date === today) {
      return matched
        ? { date: d.date, dayOfWeek: d.dayOfWeek, status: "completed",   plannedLabel: label, note: `${label} logged today.`, skipReason: null }
        : { date: d.date, dayOfWeek: d.dayOfWeek, status: "in_progress", plannedLabel: label, note: `${label} not yet logged today.`, skipReason: null };
    }

    return matched
      ? { date: d.date, dayOfWeek: d.dayOfWeek, status: "completed", plannedLabel: label, note: `${label} logged.`, skipReason: null }
      : { date: d.date, dayOfWeek: d.dayOfWeek, status: "skipped",   plannedLabel: label, note: `${label} not logged — marked skipped.`, skipReason: skipReasons[d.date] ?? "unknown" };
  });
}

// ── Deviation builder ───────────────────────────────────────────────────────

function buildDeviation(
  label:   string,
  planned: number,
  actual:  number,
  unit:    string,
  noData = false,
): ExecutionDeviation {
  if (noData) {
    return { label, plannedValue: round1(planned), actualValue: round1(actual), unit, deltaPct: 0, status: "no_data" };
  }
  const deltaPct = planned > 0 ? clamp((actual - planned) / planned, -1, 1) : (actual > 0 ? 1 : 0);
  const status: ExecutionDeviation["status"] =
    deltaPct >= 0.05 ? "ahead" : deltaPct <= -0.15 ? "behind" : "on_track";
  return { label, plannedValue: round1(planned), actualValue: round1(actual), unit, deltaPct: round2(deltaPct), status };
}

// ── Automatic replanning — make-up move search ─────────────────────────────

interface MoveRecord {
  fromDate: string;
  toIndex:  number;
  session:  PlannedSession;
  reason:   string;
}

interface CancelRecord {
  index:         number;
  originalLabel: string;
  reason:        string;
}

function wouldCreateTripleHigh(load: LoadLevel[], idx: number, newLoad: LoadLevel): boolean {
  const working = [...load];
  working[idx] = newLoad;
  for (let i = 0; i <= working.length - 3; i++) {
    if (working[i] === "high" && working[i + 1] === "high" && working[i + 2] === "high") return true;
  }
  return false;
}

/**
 * Never regenerates the week. Only considers future days (date > today) that
 * are currently rest/active_recovery as makeup slots, and never moves a
 * missed long run (tracked only as deviation). Respects the long-run anchor,
 * the Friday-leg-day guard and the no-3-consecutive-high-load rule already
 * encoded as data in adaptivePlanner's output (day.load / session.type).
 */
function findMakeupMoves(
  days:         PlannedDay[],
  today:        string,
  skippedDates: Set<string>,
): { moves: MoveRecord[]; cancellation: CancelRecord | null } {
  const load = days.map((d) => d.load);
  const usedCandidate = new Set<number>();

  const candidateIndices = days
    .map((_, i) => i)
    .filter((i) => {
      const d = days[i];
      if (d.date <= today) return false;
      const t = d.sessions[0]?.type;
      return t === "rest" || t === "active_recovery";
    });

  const moves: MoveRecord[] = [];
  let unmatchedCount = 0;

  for (const day of days) {
    if (!skippedDates.has(day.date)) continue;
    const sess = day.sessions[0];
    if (!sess || sess.type === "run_long") continue; // missed long run: deviation only, never made up

    let placed = false;
    for (const ci of candidateIndices) {
      if (usedCandidate.has(ci)) continue;
      if (sess.type === "lift_legs" && days[ci + 1]?.sessions[0]?.type === "run_long") continue;

      const newLoad = sessionLoadLevel(sess.type);
      if (wouldCreateTripleHigh(load, ci, newLoad)) continue;

      moves.push({
        fromDate: day.date,
        toIndex:  ci,
        session:  sess,
        reason:   `${sess.label} missed on ${day.dayOfWeek} — moved to ${days[ci].dayOfWeek} (was ${days[ci].sessions[0]?.label ?? "Rest"}).`,
      });
      usedCandidate.add(ci);
      load[ci] = newLoad;
      placed = true;
      break;
    }
    if (!placed) unmatchedCount++;
  }

  // Two or more sessions missed with no makeup capacity: protect recovery by
  // dropping one upcoming non-critical session rather than stacking fatigue.
  let cancellation: CancelRecord | null = null;
  if (unmatchedCount >= 2) {
    for (let i = days.length - 1; i >= 0; i--) {
      if (usedCandidate.has(i)) continue;
      const d = days[i];
      if (d.date <= today) continue;
      const t = d.sessions[0]?.type;
      if (t === "run_easy" || t === "lift_push" || t === "lift_pull" || t === "lift_full") {
        cancellation = {
          index:         i,
          originalLabel: d.sessions[0]!.label,
          reason:        `${unmatchedCount} sessions missed this week — ${d.sessions[0]!.label} on ${d.dayOfWeek} converted to active recovery to protect against overtraining.`,
        };
        break;
      }
    }
  }

  return { moves, cancellation };
}

// ── Plan balance recompute (mirrors adaptivePlanner's scorePlanBalance rules) ─

function recomputeBalance(days: PlannedDay[]): { balance: PlanBalance; reason: string } {
  const hasRestDay = days.some((d) => d.sessions[0]?.type === "rest");

  let maxConsecHigh = 0;
  let run = 0;
  for (const d of days) {
    if (d.load === "high") { run++; maxConsecHigh = Math.max(maxConsecHigh, run); }
    else run = 0;
  }

  if (maxConsecHigh >= 3) {
    return {
      balance: "Needs Adjustment",
      reason:  `${maxConsecHigh} consecutive high-load days detected — insert a medium or rest day to reduce injury risk.`,
    };
  }
  if (!hasRestDay) {
    return {
      balance: "Needs Adjustment",
      reason:  "No full rest day in the schedule — add at least one to prevent cumulative overtraining.",
    };
  }
  if (maxConsecHigh >= 2) {
    return {
      balance: "Good",
      reason:  "Back-to-back high-intensity days present — ensure quality sleep and adequate protein on those days.",
    };
  }
  return {
    balance: "Excellent",
    reason:  "Well-distributed load with clear recovery spacing. Optimal adaptation stimulus.",
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Diff the week plan against actuals. No I/O. No side effects. Same inputs
 * always produce the same output. `summary.days` already reflects any
 * pending makeup moves / cancellation (a read-only preview of what
 * replanRemainingWeek would do), so callers can render badges from it
 * without necessarily applying the replan.
 */
export function computeExecutionSummary(input: ExecutionInput): ExecutionSummary {
  const { weekPlan, today } = input;
  const days = weekPlan.days;
  const completedRunSet  = new Set(input.completedRunDates);
  const completedLiftSet = new Set(input.completedLiftDates);

  const baseDays = classifyDays(days, today, completedRunSet, completedLiftSet, input.skipReasons);

  const elapsedDays = days.filter((d) => d.date <= today);

  const trainableElapsed = baseDays.filter((d, i) => {
    const t = days[i].sessions[0]?.type;
    return days[i].date <= today && t !== "rest" && t !== "active_recovery";
  });
  const completedSessions = trainableElapsed.filter((d) => d.status === "completed").length;
  const missedSessions    = trainableElapsed.filter((d) => d.status === "skipped").length;
  const completionPct = trainableElapsed.length > 0
    ? Math.round((completedSessions / trainableElapsed.length) * 100)
    : 100;

  // ── Deviations (elapsed days only) ───────────────────────────────────────

  const plannedRunKmElapsed = elapsedDays.reduce((s, d) => {
    const sess = d.sessions[0];
    return s + (sess && sess.type.startsWith("run_") ? (sess.distanceKm ?? 0) : 0);
  }, 0);
  const plannerDeviation = buildDeviation("Run Volume", plannedRunKmElapsed, input.actualWeeklyRunKm, "km");

  const plannedRestDays = elapsedDays.filter((d) => {
    const t = d.sessions[0]?.type;
    return t === "rest" || t === "active_recovery";
  });
  const restHonored = plannedRestDays.filter((d) =>
    !completedRunSet.has(d.date) && !completedLiftSet.has(d.date),
  ).length;
  const recoveryDeviation = buildDeviation("Rest Days Honoured", plannedRestDays.length, restHonored, "days");

  const plannedGrowthHoursElapsed = elapsedDays.reduce((s, d) => s + (d.growth?.durationMin ?? 0), 0) / 60;
  const growthDeviation = buildDeviation("Growth Hours", plannedGrowthHoursElapsed, input.actualWeeklyGrowthHours, "h");

  const plannedLiftElapsed = elapsedDays.filter((d) => d.sessions[0]?.type.startsWith("lift_")).length;

  const plannedProteinAvg = elapsedDays.length > 0
    ? elapsedDays.reduce((s, d) => s + d.nutrition.proteinG, 0) / elapsedDays.length
    : 0;
  const nutritionDeviation = input.actualAvgDailyProtein === null
    ? buildDeviation("Daily Protein", plannedProteinAvg, plannedProteinAvg, "g", true)
    : buildDeviation("Daily Protein", plannedProteinAvg, input.actualAvgDailyProtein, "g");

  const ratio = (actual: number, planned: number) => (planned > 0 ? clamp(actual / planned, 0, 1.2) : 1);
  const adherencePct = clamp(
    Math.round(
      100 * (
        0.3 * ratio(input.actualWeeklyRunKm, plannedRunKmElapsed) +
        0.2 * ratio(input.actualWeeklyLiftSessions, plannedLiftElapsed) +
        0.25 * ratio(input.actualWeeklyGrowthHours, plannedGrowthHoursElapsed) +
        0.25 * ratio(restHonored, plannedRestDays.length)
      ),
    ),
    0, 100,
  );

  // ── Replanning preview ───────────────────────────────────────────────────

  const skippedDates = new Set(baseDays.filter((d) => d.status === "skipped").map((d) => d.date));
  const { moves, cancellation } = findMakeupMoves(days, today, skippedDates);

  const finalDays = baseDays.map((d) => ({ ...d }));
  for (const mv of moves) {
    finalDays[mv.toIndex] = {
      ...finalDays[mv.toIndex],
      status:       "rescheduled",
      plannedLabel: mv.session.label,
      note:         mv.reason,
      skipReason:   null,
    };
  }
  if (cancellation) {
    finalDays[cancellation.index] = {
      ...finalDays[cancellation.index],
      status:       "cancelled",
      plannedLabel: "Active Recovery",
      note:         cancellation.reason,
      skipReason:   null,
    };
  }

  const replanningRequired = moves.length > 0 || cancellation !== null;
  const nextAdjustment = moves[0]?.reason ?? cancellation?.reason ?? null;
  const reason = !replanningRequired
    ? (missedSessions > 0
        ? `${missedSessions} session(s) missed but no future capacity to redistribute this week.`
        : "All sessions on track — no replanning needed.")
    : `${moves.length} session(s) rescheduled${cancellation ? ", 1 session converted to active recovery" : ""} to keep the week's structure intact.`;

  return {
    days: finalDays,
    completedSessions,
    missedSessions,
    completionPct,
    adherencePct,
    recoveryDeviation,
    nutritionDeviation,
    growthDeviation,
    plannerDeviation,
    replanningRequired,
    reason,
    nextAdjustment,
  };
}

/**
 * Applies the makeup moves/cancellation found for `summary` to a clone of
 * `weekPlan`. Only ever mutates future days (date > today) — past and
 * today's day are returned untouched. Returns the original plan unchanged
 * when no replanning is required.
 */
export function replanRemainingWeek(
  weekPlan: WeekPlan,
  today:    string,
  summary:  ExecutionSummary,
): { plan: WeekPlan; changes: ExecutionChange[]; replanned: boolean } {
  if (!summary.replanningRequired) {
    return { plan: weekPlan, changes: [], replanned: false };
  }

  const skippedDates = new Set(summary.days.filter((d) => d.status === "skipped").map((d) => d.date));
  const { moves, cancellation } = findMakeupMoves(weekPlan.days, today, skippedDates);

  if (moves.length === 0 && !cancellation) {
    return { plan: weekPlan, changes: [], replanned: false };
  }

  const days = weekPlan.days.map((d) => ({ ...d, sessions: [...d.sessions] }));
  const changes: ExecutionChange[] = [];

  for (const mv of moves) {
    const target = days[mv.toIndex];
    days[mv.toIndex] = {
      ...target,
      sessions: [mv.session],
      load:     sessionLoadLevel(mv.session.type),
      priority: dayPriorityLocal(mv.session.type),
    };
    changes.push({ fromDate: mv.fromDate, toDate: target.date, sessionLabel: mv.session.label, reason: mv.reason });
  }

  if (cancellation) {
    const target = days[cancellation.index];
    days[cancellation.index] = {
      ...target,
      sessions: [{
        type: "active_recovery", label: "Active Recovery", durationMin: 30, intensity: "Low",
        notes: "20–30 min walk, yoga, or foam rolling. Keep heart rate below 60% max.",
      }],
      load:     "low",
      priority: "RECOVERY",
    };
    changes.push({
      fromDate: target.date, toDate: target.date,
      sessionLabel: cancellation.originalLabel, reason: cancellation.reason,
    });
  }

  const totalRunKm = round1(days.reduce((s, d) => {
    const sess = d.sessions[0];
    return s + (sess && sess.type.startsWith("run_") ? (sess.distanceKm ?? 0) : 0);
  }, 0));
  const totalLiftSessions = days.filter((d) => d.sessions[0]?.type.startsWith("lift_")).length;

  const { balance, reason: balanceReason } = recomputeBalance(days);

  const plan: WeekPlan = {
    ...weekPlan,
    days,
    totalRunKm,
    totalLiftSessions,
    planBalance:       balance,
    planBalanceReason: balanceReason,
  };

  return { plan, changes, replanned: true };
}

// ── Coach prompt block ──────────────────────────────────────────────────────

export function buildExecutionSummaryBlock(summary: ExecutionSummary): string {
  const skippedWithReasons = summary.days.filter(
    (d) => d.status === "skipped" && d.skipReason !== null && d.skipReason !== "unknown",
  );
  const skipReasonLine = skippedWithReasons.length > 0
    ? `Skip reasons: ${skippedWithReasons.map((d) => `${d.date} → ${d.skipReason!}`).join(", ")}`
    : summary.missedSessions > 0
    ? "Skip reasons: not yet recorded"
    : "Skip reasons: n/a";

  const lines = [
    `## Execution status (Phase 6A — adaptive execution)`,
    `Completion: ${summary.completedSessions} completed · ${summary.missedSessions} missed (${summary.completionPct}% completion rate)`,
    `Weekly adherence: ${summary.adherencePct}%`,
    `Run volume: ${summary.plannerDeviation.actualValue}${summary.plannerDeviation.unit} vs ${summary.plannerDeviation.plannedValue}${summary.plannerDeviation.unit} planned (${summary.plannerDeviation.status})`,
    `Recovery: ${summary.recoveryDeviation.actualValue}/${summary.recoveryDeviation.plannedValue} rest days honoured (${summary.recoveryDeviation.status})`,
    `Growth: ${summary.growthDeviation.actualValue}h vs ${summary.growthDeviation.plannedValue}h planned (${summary.growthDeviation.status})`,
    summary.nutritionDeviation.status === "no_data"
      ? `Nutrition: no protein logging this week`
      : `Nutrition: ${summary.nutritionDeviation.actualValue}g vs ${summary.nutritionDeviation.plannedValue}g planned protein (${summary.nutritionDeviation.status})`,
    summary.replanningRequired
      ? `Replanning: ${summary.reason}`
      : `Replanning: not needed — ${summary.reason}`,
    skipReasonLine,
  ];
  return lines.join("\n");
}
