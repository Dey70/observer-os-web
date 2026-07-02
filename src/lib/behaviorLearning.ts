/**
 * Behavior Learning Engine — Phase 6C
 *
 * Pure deterministic pattern recognition over rolling historical athlete data.
 * Discovers recurring habits from sessions, growth logs, daily check-ins, and
 * skip reasons, then exposes them as typed insights to the Planner, Prediction
 * Engine, and Coach — without requiring any AI or LLM call.
 *
 * Guarantees:
 *   • Same inputs → same outputs (referentially transparent)
 *   • No I/O, no network, no React, no Supabase
 *   • All algorithms O(n); target runtime < 10 ms on 90-day windows
 *   • Never infers a pattern from fewer than MIN_SAMPLES (5) data points
 *
 * Pipeline position:
 *   Measure → Analyse → Goals → Planner → Prediction → Execution → Behavior ← (this file)
 *
 * Phase 6D extension points are marked with [6D].
 */

import type { SkipReason } from "@/types";

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_SAMPLES   = 5;
const IDEAL_SAMPLES = 20;    // sample count at which confidence saturates at pattern strength
const CONF_FLOOR    = 0.50;
const CONF_CEIL     = 0.98;
const MS_PER_DAY    = 86_400_000;

// ISO week day names (index 0 = Monday … 6 = Sunday)
const DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;
type Weekday = typeof DAYS[number];

// ── Input types ──────────────────────────────────────────────────────────────

export interface BehaviorSession {
  date:     string;   // "YYYY-MM-DD"
  type:     string;   // "run" | "lift" | "study" | …
  duration: number;   // minutes
  rpe:      number;   // 1–10
}

export interface BehaviorGrowthLog {
  date:         string;
  category:     string;   // "study" | "project" | "learning" | "deep_work"
  duration_min: number;
}

export interface BehaviorDailyLog {
  date:          string;
  sleep_hours:   number;
  sleep_quality: number;
  mood:          number;
  energy:        number;
  fatigue:       number;
  soreness:      number;
}

export interface BehaviorSkipReason {
  date:   string;
  reason: SkipReason;
}

export interface BehaviorRun {
  activity_date:   string;
  distance_meters: number;
}

export interface BehaviorInput {
  sessions:    BehaviorSession[];
  growthLogs:  BehaviorGrowthLog[];
  dailyLogs:   BehaviorDailyLog[];
  skipReasons: BehaviorSkipReason[];
  runs:        BehaviorRun[];
  today:       string;   // anchor date — "YYYY-MM-DD"
}

// ── Output types ─────────────────────────────────────────────────────────────

export interface BehaviorInsight {
  pattern:    string;   // one human-readable sentence
  confidence: number;   // 0.00–1.00, two decimal places
  sampleSize: number;
  reason:     string;   // concise statistical justification
}

// Either a concrete insight or an explicit "not enough data" signal.
export type InsightResult =
  | ({ status: "ok" } & BehaviorInsight)
  | { status: "insufficient_data"; sampleSize: number; minRequired: number };

// [6D] Planner will consume these suggestions in Phase 6D (Adaptive Personalisation)
export type PlannerSuggestionType =
  | "schedule_shift"    // move session to a more successful day
  | "load_adjustment"   // reduce intensity on a specific day
  | "recovery_insert"   // add rest / active-recovery slot
  | "growth_rebalance"; // rebalance growth categories

export interface PlannerSuggestion {
  type:       PlannerSuggestionType;
  action:     string;
  reason:     string;
  confidence: number;
  priority:   "high" | "medium" | "low";
}

export interface BehaviorProfile {
  training: {
    preferredRunDay:      InsightResult;
    preferredLiftDay:     InsightResult;
    highestCompletionDay: InsightResult;
    lowestCompletionDay:  InsightResult;
    consistencyTrend:     InsightResult;
    lateWeekDropOff:      InsightResult;
  };
  recovery: {
    sleepImpact:    InsightResult;
    fatiguePattern: InsightResult;
    recoveryTrend:  InsightResult;
  };
  growth: {
    bestGrowthDay:     InsightResult;
    dominantCategory:  InsightResult;
    growthConsistency: InsightResult;
  };
  skip: {
    topSkipReason:  InsightResult;
    skipFrequency:  InsightResult;
    skipDayPattern: InsightResult;
  };
  plannerSuggestions: PlannerSuggestion[];   // [6D] — non-destructive; planner reads but does not auto-apply
  topInsights:        BehaviorInsight[];     // top 3 by confidence — pre-sorted for the dashboard card
  dataQuality:        "rich" | "moderate" | "sparse";
}

// ── Private utilities ────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ISO week day index from a "YYYY-MM-DD" string. Uses UTC to avoid
// timezone day-boundary issues on client or server.
function isoDow(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (jsDay + 6) % 7; // 0 = Monday … 6 = Sunday
}

function utcMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// Confidence: scaled by sample count (saturates at IDEAL_SAMPLES), then by
// patternStrength (how dominant the winning option is). Clamped to [CONF_FLOOR, CONF_CEIL].
function conf(sampleSize: number, patternStrength: number): number {
  const sampleRatio = Math.min(sampleSize / IDEAL_SAMPLES, 1.0);
  return round2(clamp(sampleRatio * patternStrength, CONF_FLOOR, CONF_CEIL));
}

function ok(insight: BehaviorInsight): InsightResult {
  return { status: "ok", ...insight };
}

function noData(sampleSize: number, minRequired = MIN_SAMPLES): InsightResult {
  return { status: "insufficient_data", sampleSize, minRequired };
}

// Build a frequency map over the 7 ISO week day indices.
function dowFreq(dates: string[]): number[] {
  const map = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dates) map[isoDow(d)]++;
  return map;
}

// Index of the maximum entry (first max wins ties).
function argMax(arr: number[]): number {
  let idx = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[idx]) idx = i;
  return idx;
}

// Index of the minimum entry, skipping zeros (first min wins ties).
function argMinNonZero(arr: number[]): number {
  let idx = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 0) continue;
    if (idx === -1 || arr[i] < arr[idx]) idx = i;
  }
  return idx;
}

// ── Engine ───────────────────────────────────────────────────────────────────

export function computeBehaviorProfile(input: BehaviorInput): BehaviorProfile {
  const { sessions, growthLogs, dailyLogs, skipReasons, runs, today } = input;

  const todayMs = utcMs(today);
  const daysAgo = (dateStr: string) =>
    Math.floor((todayMs - utcMs(dateStr)) / MS_PER_DAY);

  // ── Training: preferredRunDay ──────────────────────────────────────────────

  const runDates = [...new Set([
    ...sessions.filter((s) => s.type === "run").map((s) => s.date),
    ...runs.map((r) => r.activity_date),
  ])];

  let preferredRunDayIndex = -1;
  let preferredRunDay: InsightResult;
  if (runDates.length < MIN_SAMPLES) {
    preferredRunDay = noData(runDates.length);
  } else {
    const freq  = dowFreq(runDates);
    const total = freq.reduce((s, v) => s + v, 0);
    const best  = argMax(freq);
    const count = freq[best];
    const pct   = Math.round((count / total) * 100);
    preferredRunDayIndex = best;
    preferredRunDay = ok({
      pattern:    `${pct}% of runs are completed on ${DAYS[best]}.`,
      confidence: conf(total, count / total),
      sampleSize: total,
      reason:     `${count} of ${total} run sessions occurred on ${DAYS[best]}.`,
    });
  }

  // ── Training: preferredLiftDay ─────────────────────────────────────────────

  const liftDates = sessions.filter((s) => s.type === "lift").map((s) => s.date);
  let preferredLiftDay: InsightResult;
  if (liftDates.length < MIN_SAMPLES) {
    preferredLiftDay = noData(liftDates.length);
  } else {
    const freq  = dowFreq(liftDates);
    const total = freq.reduce((s, v) => s + v, 0);
    const best  = argMax(freq);
    const count = freq[best];
    const pct   = Math.round((count / total) * 100);
    preferredLiftDay = ok({
      pattern:    `${pct}% of lift sessions are logged on ${DAYS[best]}.`,
      confidence: conf(total, count / total),
      sampleSize: total,
      reason:     `${count} of ${total} lift sessions occurred on ${DAYS[best]}.`,
    });
  }

  // ── Training: highestCompletionDay ─────────────────────────────────────────
  // Proxy: day of week with the most training sessions logged.

  const allTrainingDates = [...new Set([
    ...sessions.filter((s) => s.type === "run" || s.type === "lift").map((s) => s.date),
    ...runs.map((r) => r.activity_date),
  ])];

  let highestCompletionDayIndex = -1;
  let highestCompletionDay: InsightResult;
  if (allTrainingDates.length < MIN_SAMPLES) {
    highestCompletionDay = noData(allTrainingDates.length);
  } else {
    const freq  = dowFreq(allTrainingDates);
    const total = freq.reduce((s, v) => s + v, 0);
    const best  = argMax(freq);
    const count = freq[best];
    const pct   = Math.round((count / total) * 100);
    highestCompletionDayIndex = best;
    highestCompletionDay = ok({
      pattern:    `${DAYS[best]} is the most consistent training day — ${pct}% of sessions happen then.`,
      confidence: conf(total, count / total),
      sampleSize: total,
      reason:     `${count} of ${total} training sessions were logged on ${DAYS[best]}.`,
    });
  }

  // ── Training: lowestCompletionDay ──────────────────────────────────────────
  // Primary: day with most recorded skips. Fallback: day with fewest sessions.

  let lowestCompletionDayIndex = -1;
  let lowestCompletionDay: InsightResult;
  if (skipReasons.length >= MIN_SAMPLES) {
    const freq  = dowFreq(skipReasons.map((s) => s.date));
    const total = freq.reduce((s, v) => s + v, 0);
    const worst = argMax(freq);
    const count = freq[worst];
    const pct   = Math.round((count / total) * 100);
    lowestCompletionDayIndex = worst;
    lowestCompletionDay = ok({
      pattern:    `${pct}% of skipped sessions fall on ${DAYS[worst]}.`,
      confidence: conf(total, count / total),
      sampleSize: total,
      reason:     `${count} of ${total} recorded skips occurred on ${DAYS[worst]}.`,
    });
  } else if (allTrainingDates.length >= MIN_SAMPLES) {
    const freq  = dowFreq(allTrainingDates);
    const total = freq.reduce((s, v) => s + v, 0);
    const worst = argMinNonZero(freq);
    if (worst === -1 || total < MIN_SAMPLES) {
      lowestCompletionDay = noData(allTrainingDates.length);
    } else {
      const count = freq[worst];
      const pct   = Math.round((count / total) * 100);
      lowestCompletionDayIndex = worst;
      lowestCompletionDay = ok({
        pattern:    `${DAYS[worst]} has the fewest logged sessions — only ${pct}% of total.`,
        confidence: conf(total, 1 - count / total),
        sampleSize: total,
        reason:     `Only ${count} of ${total} sessions were on ${DAYS[worst]}.`,
      });
    }
  } else {
    lowestCompletionDay = noData(Math.max(skipReasons.length, allTrainingDates.length));
  }

  // ── Training: consistencyTrend ─────────────────────────────────────────────
  // Split 90-day window into three 30-day buckets; compare oldest vs newest.

  let consistencyTrend: InsightResult;
  if (allTrainingDates.length < MIN_SAMPLES) {
    consistencyTrend = noData(allTrainingDates.length);
  } else {
    const b = [0, 0, 0]; // [oldest(60–90d), middle(30–60d), recent(0–30d)]
    for (const d of allTrainingDates) {
      const age = daysAgo(d);
      if (age <= 30)       b[2]++;
      else if (age <= 60)  b[1]++;
      else if (age <= 90)  b[0]++;
    }
    // Sessions per week within each ~4.3-week bucket
    const rOld    = b[0] / 4.3;
    const rRecent = b[2] / 4.3;
    const delta   = rRecent - rOld;
    const absDelta = Math.abs(delta);
    const strength = clamp(absDelta / Math.max(rOld, 0.5), 0, 1);

    if (absDelta < 0.3 || rOld < 0.1) {
      consistencyTrend = ok({
        pattern:    `Training volume is stable — consistent sessions per week over 90 days.`,
        confidence: conf(allTrainingDates.length, 0.75),
        sampleSize: allTrainingDates.length,
        reason:     `${b[0]} sessions (weeks 9–13), ${b[1]} (weeks 5–8), ${b[2]} (weeks 1–4).`,
      });
    } else if (delta > 0) {
      const pct = Math.round((delta / Math.max(rOld, 0.1)) * 100);
      consistencyTrend = ok({
        pattern:    `Training consistency is improving — ${pct}% more sessions in recent weeks.`,
        confidence: conf(allTrainingDates.length, strength),
        sampleSize: allTrainingDates.length,
        reason:     `${b[2]} sessions (last 30 days) vs ${b[0]} sessions (days 60–90).`,
      });
    } else {
      const pct = Math.round(Math.abs(delta / Math.max(rOld, 0.1)) * 100);
      consistencyTrend = ok({
        pattern:    `Training frequency has declined — ${pct}% fewer sessions in recent weeks.`,
        confidence: conf(allTrainingDates.length, strength),
        sampleSize: allTrainingDates.length,
        reason:     `${b[2]} sessions (last 30 days) vs ${b[0]} sessions (days 60–90).`,
      });
    }
  }

  // ── Training: lateWeekDropOff ──────────────────────────────────────────────
  // Compare session counts for Mon–Wed vs Thu–Sat.

  let lateWeekDropOff: InsightResult;
  if (allTrainingDates.length < MIN_SAMPLES) {
    lateWeekDropOff = noData(allTrainingDates.length);
  } else {
    const freq    = dowFreq(allTrainingDates);
    const early   = freq[0] + freq[1] + freq[2]; // Mon Tue Wed
    const late    = freq[3] + freq[4] + freq[5]; // Thu Fri Sat
    const total   = early + late + freq[6];
    if (late === 0 || total < MIN_SAMPLES) {
      lateWeekDropOff = noData(total);
    } else {
      const ratio   = early / late;
      const dropOff = ratio > 1.3;
      const latePct = Math.round((late / (early + late)) * 100);
      const strength = clamp(Math.abs(ratio - 1.0) / 0.5, 0, 1);
      lateWeekDropOff = ok({
        pattern: dropOff
          ? `Late-week drop-off detected — only ${latePct}% of sessions happen Thursday–Saturday.`
          : `Training is well distributed — ${latePct}% of sessions are late-week.`,
        confidence: conf(total, strength),
        sampleSize: total,
        reason:     `Mon–Wed: ${early} sessions · Thu–Sat: ${late} sessions.`,
      });
    }
  }

  // ── Recovery: sleepImpact ──────────────────────────────────────────────────
  // Measure next-day energy after high-sleep (≥7.5h) vs low-sleep (<6h) nights.

  const sortedLogs = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
  const highSleepEnergy: number[] = [];
  const lowSleepEnergy:  number[] = [];

  for (let i = 0; i < sortedLogs.length - 1; i++) {
    const curr = sortedLogs[i];
    const next = sortedLogs[i + 1];
    // Only use consecutive or near-consecutive days (≤2 day gap)
    if (daysAgo(curr.date) - daysAgo(next.date) > 2) continue;
    if (curr.sleep_hours >= 7.5) highSleepEnergy.push(next.energy);
    else if (curr.sleep_hours < 6.0) lowSleepEnergy.push(next.energy);
  }

  let sleepImpact: InsightResult;
  if (highSleepEnergy.length < MIN_SAMPLES || lowSleepEnergy.length < MIN_SAMPLES) {
    sleepImpact = noData(Math.min(highSleepEnergy.length, lowSleepEnergy.length));
  } else {
    const avgHigh  = mean(highSleepEnergy);
    const avgLow   = mean(lowSleepEnergy);
    const delta    = avgHigh - avgLow;
    const absDelta = Math.abs(delta);
    const strength = clamp(absDelta / 3.0, 0, 1); // 3-point spread saturates confidence
    const total    = highSleepEnergy.length + lowSleepEnergy.length;
    sleepImpact = ok({
      pattern: delta > 0.5
        ? `Good sleep (≥7.5h) correlates with +${absDelta.toFixed(1)} higher energy the next day.`
        : delta < -0.3
        ? `Sleep and next-day energy show an inverse pattern — other factors may dominate.`
        : `Sleep duration has a weak correlation with next-day energy in your data.`,
      confidence: conf(total, strength),
      sampleSize: total,
      reason:
        `After ≥7.5h sleep: avg next-day energy ${avgHigh.toFixed(1)}/10 (n=${highSleepEnergy.length}). ` +
        `After <6h sleep: ${avgLow.toFixed(1)}/10 (n=${lowSleepEnergy.length}).`,
    });
  }

  // ── Recovery: fatiguePattern ───────────────────────────────────────────────
  // Find which day of the week has the highest average fatigue.

  let fatiguePattern: InsightResult;
  if (dailyLogs.length < MIN_SAMPLES) {
    fatiguePattern = noData(dailyLogs.length);
  } else {
    const byDay: number[][] = [[], [], [], [], [], [], []];
    for (const log of dailyLogs) byDay[isoDow(log.date)].push(log.fatigue);
    const avgs = byDay.map(mean);
    const highestDay = avgs.reduce((best, v, i, arr) =>
      byDay[i].length >= 2 && v > arr[best] ? i : best, 0);
    const lowestDay  = avgs.reduce((best, v, i, arr) =>
      byDay[i].length >= 2 && v < arr[best] ? i : best, highestDay);
    const range   = avgs[highestDay] - avgs[lowestDay];
    const strength = clamp(range / 4.0, 0, 1); // 4-point spread saturates
    fatiguePattern = ok({
      pattern:
        `Fatigue peaks on ${DAYS[highestDay]} (avg ${avgs[highestDay].toFixed(1)}/10) — schedule lighter sessions or recovery work.`,
      confidence: conf(dailyLogs.length, strength),
      sampleSize: dailyLogs.length,
      reason:
        `${DAYS[highestDay]}: ${avgs[highestDay].toFixed(1)} avg fatigue vs ` +
        `${DAYS[lowestDay]}: ${avgs[lowestDay].toFixed(1)} avg fatigue (lowest day).`,
    });
  }

  // ── Recovery: recoveryTrend ────────────────────────────────────────────────
  // Compare recovery proxy score (avg of energy and inverted fatigue) across two halves.

  let recoveryTrend: InsightResult;
  if (dailyLogs.length < MIN_SAMPLES) {
    recoveryTrend = noData(dailyLogs.length);
  } else {
    const sorted = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
    const mid    = Math.floor(sorted.length / 2);
    const recov  = (l: BehaviorDailyLog) => (l.energy + (10 - l.fatigue)) / 2;
    const earlyScore  = mean(sorted.slice(0, mid).map(recov));
    const recentScore = mean(sorted.slice(mid).map(recov));
    const delta   = recentScore - earlyScore;
    const strength = clamp(Math.abs(delta) / 2.0, 0, 1); // 2-point change saturates
    recoveryTrend = ok({
      pattern: Math.abs(delta) < 0.3
        ? `Recovery capacity is stable — consistent energy and fatigue scores over 90 days.`
        : delta > 0
        ? `Recovery is trending upward — recent scores are ${delta.toFixed(1)} points higher than earlier.`
        : `Recovery trend is declining — recent scores are ${Math.abs(delta).toFixed(1)} points lower.`,
      confidence: conf(dailyLogs.length, Math.max(strength, 0.5)),
      sampleSize: dailyLogs.length,
      reason:
        `Early period avg recovery: ${earlyScore.toFixed(1)} · Recent period: ${recentScore.toFixed(1)} (scale 1–10).`,
    });
  }

  // ── Growth: bestGrowthDay ──────────────────────────────────────────────────

  let bestGrowthDay: InsightResult;
  if (growthLogs.length < MIN_SAMPLES) {
    bestGrowthDay = noData(growthLogs.length);
  } else {
    const freq  = dowFreq(growthLogs.map((g) => g.date));
    const total = freq.reduce((s, v) => s + v, 0);
    const best  = argMax(freq);
    const count = freq[best];
    const pct   = Math.round((count / total) * 100);
    bestGrowthDay = ok({
      pattern:    `${DAYS[best]} is the most productive growth day — ${pct}% of sessions occur then.`,
      confidence: conf(total, count / total),
      sampleSize: total,
      reason:     `${count} of ${total} growth log entries recorded on ${DAYS[best]}.`,
    });
  }

  // ── Growth: dominantCategory ───────────────────────────────────────────────

  let dominantCategory: InsightResult;
  if (growthLogs.length < MIN_SAMPLES) {
    dominantCategory = noData(growthLogs.length);
  } else {
    const totals: Record<string, number> = {};
    let grandTotal = 0;
    for (const g of growthLogs) {
      totals[g.category] = (totals[g.category] ?? 0) + g.duration_min;
      grandTotal += g.duration_min;
    }
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (!sorted.length || grandTotal === 0) {
      dominantCategory = noData(growthLogs.length);
    } else {
      const [cat, mins] = sorted[0];
      const pct   = Math.round((mins / grandTotal) * 100);
      const LABEL: Record<string, string> = {
        study: "Study", project: "Project work", learning: "Learning", deep_work: "Deep work",
      };
      const label = LABEL[cat] ?? cat;
      dominantCategory = ok({
        pattern:    `${label} accounts for ${pct}% of total growth time — your primary focus category.`,
        confidence: conf(growthLogs.length, mins / grandTotal),
        sampleSize: growthLogs.length,
        reason:
          `${(mins / 60).toFixed(1)}h of ${(grandTotal / 60).toFixed(1)}h total growth in ${label.toLowerCase()}.`,
      });
    }
  }

  // ── Growth: growthConsistency ──────────────────────────────────────────────
  // Fraction of the 90-day rolling window's weeks that contained at least one growth log.

  let growthConsistency: InsightResult;
  if (growthLogs.length < MIN_SAMPLES) {
    growthConsistency = noData(growthLogs.length);
  } else {
    const activeWeeks = new Set<string>();
    for (const g of growthLogs) {
      const dow    = isoDow(g.date);
      const monday = new Date(utcMs(g.date) - dow * MS_PER_DAY);
      activeWeeks.add(monday.toISOString().split("T")[0]);
    }
    const WEEKS_IN_WINDOW = 13; // 90 ÷ 7 ≈ 12.86
    const active   = activeWeeks.size;
    const rate     = Math.min(active / WEEKS_IN_WINDOW, 1);
    const pct      = Math.round(rate * 100);
    growthConsistency = ok({
      pattern:    `Growth activities logged in ${pct}% of weeks — ${active} of the last ${WEEKS_IN_WINDOW} weeks.`,
      confidence: conf(growthLogs.length, rate),
      sampleSize: growthLogs.length,
      reason:     `${active} distinct calendar weeks contained at least one growth log entry.`,
    });
  }

  // ── Skip: topSkipReason ────────────────────────────────────────────────────

  let topSkipReason: InsightResult;
  if (skipReasons.length < MIN_SAMPLES) {
    topSkipReason = noData(skipReasons.length);
  } else {
    const counts: Partial<Record<SkipReason, number>> = {};
    for (const s of skipReasons) counts[s.reason] = (counts[s.reason] ?? 0) + 1;
    const sorted = (Object.entries(counts) as [SkipReason, number][]).sort((a, b) => b[1] - a[1]);
    const [reason, count] = sorted[0];
    const pct   = Math.round((count / skipReasons.length) * 100);
    const LABEL: Record<SkipReason, string> = {
      fatigue:    "fatigue",
      injury:     "injury",
      busy:       "being too busy",
      travel:     "travel",
      motivation: "low motivation",
      weather:    "weather",
      unknown:    "unrecorded reasons",
    };
    topSkipReason = ok({
      pattern:    `${pct}% of skipped sessions are attributed to ${LABEL[reason]}.`,
      confidence: conf(skipReasons.length, count / skipReasons.length),
      sampleSize: skipReasons.length,
      reason:     `${count} of ${skipReasons.length} recorded skips are due to "${reason}".`,
    });
  }

  // ── Skip: skipFrequency ────────────────────────────────────────────────────
  // Skip rate = recorded skips ÷ (completed training sessions + skips).

  const completedCount = new Set([
    ...sessions.filter((s) => s.type === "run" || s.type === "lift").map((s) => s.date),
    ...runs.map((r) => r.activity_date),
  ]).size;
  const totalAttempts = completedCount + skipReasons.length;

  let skipFrequency: InsightResult;
  if (totalAttempts < MIN_SAMPLES) {
    skipFrequency = noData(totalAttempts);
  } else {
    const rate = skipReasons.length / totalAttempts;
    const pct  = Math.round(rate * 100);
    // Inverse strength: high skip rate → confident in "high skip rate" finding
    const strength = clamp(rate * 2, CONF_FLOOR, 1.0);
    skipFrequency = ok({
      pattern: rate < 0.10
        ? `Excellent adherence — only ${pct}% of training sessions are skipped.`
        : rate < 0.25
        ? `${pct}% skip rate — within a healthy range but worth monitoring.`
        : `Elevated skip rate detected — ${pct}% of planned sessions were missed.`,
      confidence: conf(totalAttempts, strength),
      sampleSize: totalAttempts,
      reason:     `${skipReasons.length} skips recorded vs ${completedCount} completed sessions.`,
    });
  }

  // ── Skip: skipDayPattern ───────────────────────────────────────────────────

  let skipDayPattern: InsightResult;
  if (skipReasons.length < MIN_SAMPLES) {
    skipDayPattern = noData(skipReasons.length);
  } else {
    const freq  = dowFreq(skipReasons.map((s) => s.date));
    const total = freq.reduce((s, v) => s + v, 0);
    const worst = argMax(freq);
    const count = freq[worst];
    const pct   = Math.round((count / total) * 100);
    const strength = count / total;
    skipDayPattern = ok({
      pattern: strength > 0.35
        ? `${DAYS[worst]} accounts for ${pct}% of all skips — a recurring pattern worth addressing.`
        : `Skips are spread across the week — no single day consistently disrupts training.`,
      confidence: conf(total, strength),
      sampleSize: total,
      reason:     `${count} of ${total} recorded skips occurred on ${DAYS[worst]}.`,
    });
  }

  // ── Planner suggestions ────────────────────────────────────────────────────
  // Non-destructive. Phase 6D will decide whether to auto-apply them.

  const plannerSuggestions: PlannerSuggestion[] = [];

  // S1: preferred run day ≠ Saturday (long-run anchor) → suggest shift [6D]
  if (
    preferredRunDay.status === "ok" &&
    preferredRunDayIndex !== -1 &&
    preferredRunDayIndex !== 5 && // 5 = Saturday
    preferredRunDay.confidence >= 0.65
  ) {
    const { sampleSize, confidence: c } = preferredRunDay;
    const pct = Math.round((runDates.length > 0
      ? dowFreq(runDates)[preferredRunDayIndex] / runDates.length
      : 0) * 100);
    plannerSuggestions.push({
      type:       "schedule_shift",
      action:     `Consider anchoring the long run on ${DAYS[preferredRunDayIndex]} instead of Saturday.`,
      reason:     `${pct}% of historical runs occur on ${DAYS[preferredRunDayIndex]} (n=${sampleSize}).`,
      confidence: c,
      priority:   c >= 0.80 ? "high" : "medium",
    });
  }

  // S2: skip day pattern with high confidence → suggest moving that session earlier [6D]
  if (
    skipDayPattern.status === "ok" &&
    skipDayPattern.confidence >= 0.65 &&
    lowestCompletionDayIndex !== -1
  ) {
    const pct = Math.round(
      (skipReasons.length > 0
        ? dowFreq(skipReasons.map((s) => s.date))[lowestCompletionDayIndex] / skipReasons.length
        : 0) * 100,
    );
    plannerSuggestions.push({
      type:       "schedule_shift",
      action:     `Move ${DAYS[lowestCompletionDayIndex]} sessions earlier in the week.`,
      reason:     `${pct}% of recorded skips occur on ${DAYS[lowestCompletionDayIndex]}.`,
      confidence: skipDayPattern.confidence,
      priority:   skipDayPattern.confidence >= 0.80 ? "high" : "medium",
    });
  }

  // S3: late-week drop-off confirmed → redistribute load [6D]
  if (lateWeekDropOff.status === "ok" && lateWeekDropOff.confidence >= 0.70) {
    const freq = dowFreq(allTrainingDates);
    const early = freq[0] + freq[1] + freq[2];
    const late  = freq[3] + freq[4] + freq[5];
    if (early > late) {
      plannerSuggestions.push({
        type:       "load_adjustment",
        action:     `Redistribute some Monday–Wednesday load to Thursday–Saturday.`,
        reason:     `Athlete completes ${early} sessions early-week vs ${late} late-week — week skews front-loaded.`,
        confidence: lateWeekDropOff.confidence,
        priority:   "medium",
      });
    }
  }

  // S4: sleep impact strong → protect pre-session sleep [6D]
  if (sleepImpact.status === "ok" && sleepImpact.confidence >= 0.70) {
    const avgH = mean(highSleepEnergy);
    const avgL = mean(lowSleepEnergy);
    if (avgH - avgL >= 1.5) {
      plannerSuggestions.push({
        type:       "recovery_insert",
        action:     `Flag key sessions with a sleep target of ≥7.5h the night before.`,
        reason:     `Good sleep nights yield +${(avgH - avgL).toFixed(1)} energy points the next day.`,
        confidence: sleepImpact.confidence,
        priority:   "low",
      });
    }
  }

  // ── Top insights ───────────────────────────────────────────────────────────
  // Collect all ok insights, sort by confidence descending, return top 3.

  const allInsights: BehaviorInsight[] = [];
  const allResults: InsightResult[] = [
    preferredRunDay, preferredLiftDay, highestCompletionDay, lowestCompletionDay,
    consistencyTrend, lateWeekDropOff,
    sleepImpact, fatiguePattern, recoveryTrend,
    bestGrowthDay, dominantCategory, growthConsistency,
    topSkipReason, skipFrequency, skipDayPattern,
  ];
  for (const r of allResults) {
    if (r.status === "ok") allInsights.push(r);
  }
  allInsights.sort((a, b) => b.confidence - a.confidence);
  const topInsights = allInsights.slice(0, 3);

  // ── Data quality ───────────────────────────────────────────────────────────

  const totalSessions  = allTrainingDates.length;
  const totalDailyLogs = dailyLogs.length;
  const totalGrowth    = growthLogs.length;
  const dataQuality: BehaviorProfile["dataQuality"] =
    totalSessions >= 40 && totalDailyLogs >= 30 && totalGrowth >= 10 ? "rich"
    : totalSessions >= 20 && totalDailyLogs >= 14                    ? "moderate"
    : "sparse";

  return {
    training: {
      preferredRunDay,
      preferredLiftDay,
      highestCompletionDay,
      lowestCompletionDay,
      consistencyTrend,
      lateWeekDropOff,
    },
    recovery: {
      sleepImpact,
      fatiguePattern,
      recoveryTrend,
    },
    growth: {
      bestGrowthDay,
      dominantCategory,
      growthConsistency,
    },
    skip: {
      topSkipReason,
      skipFrequency,
      skipDayPattern,
    },
    plannerSuggestions,
    topInsights,
    dataQuality,
  };
}

// ── Coach prompt block ────────────────────────────────────────────────────────

export function buildBehaviorBlock(profile: BehaviorProfile): string {
  if (profile.dataQuality === "sparse") {
    return `## Behavioral patterns (Phase 6C — behavior learning)\nInsufficient history — patterns will emerge as data accumulates.`;
  }

  const lines: string[] = [`## Learned behavioral patterns (Phase 6C)`];

  const categories: [string, Record<string, InsightResult>][] = [
    ["Training",  profile.training as unknown as Record<string, InsightResult>],
    ["Recovery",  profile.recovery as unknown as Record<string, InsightResult>],
    ["Growth",    profile.growth   as unknown as Record<string, InsightResult>],
    ["Skip",      profile.skip     as unknown as Record<string, InsightResult>],
  ];

  for (const [label, group] of categories) {
    for (const result of Object.values(group)) {
      if (result.status === "ok" && result.confidence >= 0.60) {
        lines.push(`${label}: ${result.pattern} (confidence ${Math.round(result.confidence * 100)}%, n=${result.sampleSize})`);
      }
    }
  }

  if (profile.plannerSuggestions.length > 0) {
    lines.push(`Planner suggestions:`);
    for (const s of profile.plannerSuggestions) {
      lines.push(`  • [${s.priority.toUpperCase()}] ${s.action} — ${s.reason}`);
    }
  }

  return lines.join("\n");
}
