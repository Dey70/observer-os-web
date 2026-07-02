/**
 * Behavior Learning Engine — Phase 6C (refined)
 *
 * Pure deterministic pattern recognition over rolling historical athlete data.
 *
 * Each insight carries two quality signals:
 *
 *   confidence = clamp(sampleRatio × patternStrength × recencyWeight, 0.50, 0.98)
 *
 *     recencyWeight: exponential decay, λ = 0.02 per day
 *       → day   0: weight 1.00
 *       → day  45: weight ~0.41
 *       → day  90: weight ~0.17
 *     A pattern confirmed only last week beats one seen only three months ago.
 *
 *   stability = fraction of active 30-day sub-windows where the pattern's
 *     conclusion agrees with the overall conclusion
 *       → 1.00 = identical finding in every sub-window  (habit is rock-solid)
 *       → 0.00 = pattern reverses each sub-window       (habit is volatile)
 *
 * Guarantees:
 *   • Same inputs → same outputs (referentially transparent)
 *   • No I/O, no network, no React, no Supabase
 *   • All algorithms O(n); target runtime < 10 ms on 90-day windows
 *   • Never infers a pattern from fewer than MIN_SAMPLES (5) data points
 *
 * Phase 6D extension points are marked with [6D].
 */

import type { SkipReason } from "@/types";

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_SAMPLES   = 5;
const IDEAL_SAMPLES = 20;     // sample count at which sampleRatio saturates
const CONF_FLOOR    = 0.50;
const CONF_CEIL     = 0.98;
const MS_PER_DAY    = 86_400_000;
const DECAY_RATE    = 0.02;   // λ for exponential recency decay (per day)

// ISO week day names (index 0 = Monday … 6 = Sunday)
const DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

// ── Input types ──────────────────────────────────────────────────────────────

export interface BehaviorSession {
  date:     string;   // "YYYY-MM-DD"
  type:     string;   // "run" | "lift" | …
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
  confidence: number;   // 0.00–1.00 — sampleRatio × patternStrength × recencyWeight
  stability:  number;   // 0.00–1.00 — consistency of finding across time sub-windows
  sampleSize: number;
  reason:     string;   // statistical justification
}

export type InsightResult =
  | ({ status: "ok" } & BehaviorInsight)
  | { status: "insufficient_data"; sampleSize: number; minRequired: number };

// [6D] Planner will consume these in Phase 6D (Adaptive Personalisation)
export type PlannerSuggestionType =
  | "schedule_shift"
  | "load_adjustment"
  | "recovery_insert"
  | "growth_rebalance";

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
  plannerSuggestions: PlannerSuggestion[];   // [6D] — non-destructive
  topInsights:        BehaviorInsight[];     // top 3 by confidence, pre-sorted for the card
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

function utcMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// ISO week day index: 0 = Monday … 6 = Sunday. Uses UTC to avoid timezone issues.
function isoDow(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

// ── Confidence: recency component ────────────────────────────────────────────

// Average exponential recency weight across a set of dated observations.
// Returns a value in (0, 1]: approaches 1.0 when all observations are very recent.
function recencyOf(dates: string[], todayMs: number): number {
  if (dates.length === 0) return 1.0;
  const sum = dates.reduce((acc, d) => {
    const age = Math.max(0, Math.floor((todayMs - utcMs(d)) / MS_PER_DAY));
    return acc + Math.exp(-DECAY_RATE * age);
  }, 0);
  return sum / dates.length;
}

// Composite confidence: sampleRatio × patternStrength × recencyWeight, clamped.
function conf(
  sampleSize:      number,
  patternStrength: number,
  recency:         number = 1.0,
): number {
  const sampleRatio = Math.min(sampleSize / IDEAL_SAMPLES, 1.0);
  return round2(clamp(sampleRatio * patternStrength * recency, CONF_FLOOR, CONF_CEIL));
}

// ── Stability helpers ────────────────────────────────────────────────────────

// Day-of-week stability: what fraction of active 30-day buckets does the
// overall dominant day also dominate that bucket (≥25% share)?
// Buckets: [oldest 60–90d ago] [middle 30–60d ago] [recent 0–30d ago]
function dowStability(dates: string[], dominantDow: number, todayMs: number): number {
  const bt = [0, 0, 0]; // bucket total counts
  const bm = [0, 0, 0]; // dominant-day match counts
  for (const d of dates) {
    const age = Math.max(0, Math.floor((todayMs - utcMs(d)) / MS_PER_DAY));
    const b   = age <= 30 ? 2 : age <= 60 ? 1 : 0;
    bt[b]++;
    if (isoDow(d) === dominantDow) bm[b]++;
  }
  let agreements = 0;
  let valid       = 0;
  for (let i = 0; i < 3; i++) {
    if (bt[i] < 2) continue;
    valid++;
    if (bm[i] / bt[i] >= 0.25) agreements++;
  }
  return valid === 0 ? 0.50 : round2(agreements / valid);
}

// Trend stability: does the direction of change hold across all three time buckets?
// b = [oldest_count, middle_count, recent_count]
function trendStability(b: [number, number, number]): number {
  const dir01 = b[1] - b[0];
  const dir12 = b[2] - b[1];
  if (Math.sign(dir01) === Math.sign(dir12)) return 0.88;
  if (Math.abs(dir01) < 0.5 || Math.abs(dir12) < 0.5) return 0.65;
  return 0.30;
}

// Category stability: does the same category dominate in older (>45d) AND recent (≤45d) halves?
function categoryStability(
  logs:        { date: string; category: string; duration_min: number }[],
  dominantCat: string,
  todayMs:     number,
): number {
  const old: Record<string, number> = {};
  const rec: Record<string, number> = {};
  for (const g of logs) {
    const age = Math.max(0, Math.floor((todayMs - utcMs(g.date)) / MS_PER_DAY));
    const bucket = age > 45 ? old : rec;
    bucket[g.category] = (bucket[g.category] ?? 0) + g.duration_min;
  }
  const topOf = (t: Record<string, number>) =>
    Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (!Object.keys(old).length || !Object.keys(rec).length) return 0.50;
  const oldTop = topOf(old);
  const recTop = topOf(rec);
  if (oldTop === dominantCat && recTop === dominantCat) return 0.95;
  if (oldTop === dominantCat || recTop === dominantCat) return 0.60;
  return 0.20;
}

// Skip-reason stability: does the same reason top the list in both halves?
function reasonStability(
  skips:     { date: string; reason: SkipReason }[],
  topReason: SkipReason,
  todayMs:   number,
): number {
  const old: Partial<Record<SkipReason, number>> = {};
  const rec: Partial<Record<SkipReason, number>> = {};
  for (const s of skips) {
    const age    = Math.max(0, Math.floor((todayMs - utcMs(s.date)) / MS_PER_DAY));
    const bucket = age > 45 ? old : rec;
    bucket[s.reason] = (bucket[s.reason] ?? 0) + 1;
  }
  const topOf = (t: Partial<Record<SkipReason, number>>) =>
    (Object.entries(t) as [SkipReason, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (!Object.keys(old).length || !Object.keys(rec).length) return 0.50;
  const oldTop = topOf(old);
  const recTop = topOf(rec);
  if (oldTop === topReason && recTop === topReason) return 0.95;
  if (oldTop === topReason || recTop === topReason) return 0.60;
  return 0.20;
}

// Skip-rate stability: is the skip rate similar in older vs recent half?
function skipRateStability(
  skipDates:      string[],
  completedDates: string[],
  todayMs:        number,
): number {
  let oS = 0, oC = 0, rS = 0, rC = 0;
  for (const d of skipDates) {
    const age = Math.max(0, Math.floor((todayMs - utcMs(d)) / MS_PER_DAY));
    if (age > 45) oS++; else rS++;
  }
  for (const d of completedDates) {
    const age = Math.max(0, Math.floor((todayMs - utcMs(d)) / MS_PER_DAY));
    if (age > 45) oC++; else rC++;
  }
  if (oS + oC < 2 || rS + rC < 2) return 0.50;
  const delta = Math.abs(oS / (oS + oC) - rS / (rS + rC));
  return round2(clamp(1.0 - delta * 3, 0.20, 0.98));
}

// ── Insight constructors ─────────────────────────────────────────────────────

function ok(insight: BehaviorInsight): InsightResult {
  return { status: "ok", ...insight };
}

function noData(sampleSize: number, minRequired = MIN_SAMPLES): InsightResult {
  return { status: "insufficient_data", sampleSize, minRequired };
}

// Frequency map over 7 ISO week day indices.
function dowFreq(dates: string[]): number[] {
  const m = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dates) m[isoDow(d)]++;
  return m;
}

function argMax(arr: number[]): number {
  let idx = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[idx]) idx = i;
  return idx;
}

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
    Math.max(0, Math.floor((todayMs - utcMs(dateStr)) / MS_PER_DAY));

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
    const freq      = dowFreq(runDates);
    const total     = freq.reduce((s, v) => s + v, 0);
    const best      = argMax(freq);
    const count     = freq[best];
    const pct       = Math.round((count / total) * 100);
    const recency   = recencyOf(runDates, todayMs);
    const stability = dowStability(runDates, best, todayMs);
    preferredRunDayIndex = best;
    preferredRunDay = ok({
      pattern:    `${pct}% of runs are completed on ${DAYS[best]}.`,
      confidence: conf(total, count / total, recency),
      stability,
      sampleSize: total,
      reason:     `${count} of ${total} run sessions on ${DAYS[best]} · recency ${Math.round(recency * 100)}%`,
    });
  }

  // ── Training: preferredLiftDay ─────────────────────────────────────────────

  const liftDates = sessions.filter((s) => s.type === "lift").map((s) => s.date);
  let preferredLiftDay: InsightResult;
  if (liftDates.length < MIN_SAMPLES) {
    preferredLiftDay = noData(liftDates.length);
  } else {
    const freq      = dowFreq(liftDates);
    const total     = freq.reduce((s, v) => s + v, 0);
    const best      = argMax(freq);
    const count     = freq[best];
    const pct       = Math.round((count / total) * 100);
    const recency   = recencyOf(liftDates, todayMs);
    const stability = dowStability(liftDates, best, todayMs);
    preferredLiftDay = ok({
      pattern:    `${pct}% of lift sessions are logged on ${DAYS[best]}.`,
      confidence: conf(total, count / total, recency),
      stability,
      sampleSize: total,
      reason:     `${count} of ${total} lift sessions on ${DAYS[best]} · recency ${Math.round(recency * 100)}%`,
    });
  }

  // ── Training: highestCompletionDay ─────────────────────────────────────────

  const allTrainingDates = [...new Set([
    ...sessions.filter((s) => s.type === "run" || s.type === "lift").map((s) => s.date),
    ...runs.map((r) => r.activity_date),
  ])];

  let highestCompletionDayIndex = -1;
  let highestCompletionDay: InsightResult;
  if (allTrainingDates.length < MIN_SAMPLES) {
    highestCompletionDay = noData(allTrainingDates.length);
  } else {
    const freq      = dowFreq(allTrainingDates);
    const total     = freq.reduce((s, v) => s + v, 0);
    const best      = argMax(freq);
    const count     = freq[best];
    const pct       = Math.round((count / total) * 100);
    const recency   = recencyOf(allTrainingDates, todayMs);
    const stability = dowStability(allTrainingDates, best, todayMs);
    highestCompletionDayIndex = best;
    highestCompletionDay = ok({
      pattern:    `${DAYS[best]} is the most consistent training day — ${pct}% of sessions happen then.`,
      confidence: conf(total, count / total, recency),
      stability,
      sampleSize: total,
      reason:     `${count} of ${total} sessions on ${DAYS[best]} · recency ${Math.round(recency * 100)}%`,
    });
  }

  // ── Training: lowestCompletionDay ──────────────────────────────────────────

  let lowestCompletionDayIndex = -1;
  let lowestCompletionDay: InsightResult;
  if (skipReasons.length >= MIN_SAMPLES) {
    const skipDates = skipReasons.map((s) => s.date);
    const freq      = dowFreq(skipDates);
    const total     = freq.reduce((s, v) => s + v, 0);
    const worst     = argMax(freq);
    const count     = freq[worst];
    const pct       = Math.round((count / total) * 100);
    const recency   = recencyOf(skipDates, todayMs);
    const stability = dowStability(skipDates, worst, todayMs);
    lowestCompletionDayIndex = worst;
    lowestCompletionDay = ok({
      pattern:    `${pct}% of skipped sessions fall on ${DAYS[worst]}.`,
      confidence: conf(total, count / total, recency),
      stability,
      sampleSize: total,
      reason:     `${count} of ${total} recorded skips on ${DAYS[worst]} · recency ${Math.round(recency * 100)}%`,
    });
  } else if (allTrainingDates.length >= MIN_SAMPLES) {
    const freq  = dowFreq(allTrainingDates);
    const total = freq.reduce((s, v) => s + v, 0);
    const worst = argMinNonZero(freq);
    if (worst === -1 || total < MIN_SAMPLES) {
      lowestCompletionDay = noData(allTrainingDates.length);
    } else {
      const count     = freq[worst];
      const pct       = Math.round((count / total) * 100);
      const recency   = recencyOf(allTrainingDates, todayMs);
      const stability = dowStability(allTrainingDates, worst, todayMs);
      lowestCompletionDayIndex = worst;
      lowestCompletionDay = ok({
        pattern:    `${DAYS[worst]} has the fewest logged sessions — only ${pct}% of total.`,
        confidence: conf(total, 1 - count / total, recency),
        stability,
        sampleSize: total,
        reason:     `Only ${count} of ${total} sessions on ${DAYS[worst]} · recency ${Math.round(recency * 100)}%`,
      });
    }
  } else {
    lowestCompletionDay = noData(Math.max(skipReasons.length, allTrainingDates.length));
  }

  // ── Training: consistencyTrend ─────────────────────────────────────────────

  let consistencyTrend: InsightResult;
  if (allTrainingDates.length < MIN_SAMPLES) {
    consistencyTrend = noData(allTrainingDates.length);
  } else {
    const b: [number, number, number] = [0, 0, 0]; // [oldest(60–90d), middle(30–60d), recent(0–30d)]
    for (const d of allTrainingDates) {
      const age = daysAgo(d);
      if (age <= 30) b[2]++; else if (age <= 60) b[1]++; else if (age <= 90) b[0]++;
    }
    const rOld    = b[0] / 4.3;
    const rRecent = b[2] / 4.3;
    const delta   = rRecent - rOld;
    const absDelta = Math.abs(delta);
    const strength = clamp(absDelta / Math.max(rOld, 0.5), 0, 1);
    const recency  = recencyOf(allTrainingDates, todayMs);
    const stability = trendStability(b);

    if (absDelta < 0.3 || rOld < 0.1) {
      consistencyTrend = ok({
        pattern:    `Training volume is stable — consistent sessions per week over 90 days.`,
        confidence: conf(allTrainingDates.length, 0.75, recency),
        stability:  round2(stability),
        sampleSize: allTrainingDates.length,
        reason:     `${b[0]} sessions (wks 9–13), ${b[1]} (wks 5–8), ${b[2]} (wks 1–4)`,
      });
    } else if (delta > 0) {
      const pct = Math.round((delta / Math.max(rOld, 0.1)) * 100);
      consistencyTrend = ok({
        pattern:    `Training consistency is improving — ${pct}% more sessions in recent weeks.`,
        confidence: conf(allTrainingDates.length, strength, recency),
        stability:  round2(stability),
        sampleSize: allTrainingDates.length,
        reason:     `${b[2]} sessions (last 30d) vs ${b[0]} sessions (60–90d ago)`,
      });
    } else {
      const pct = Math.round(Math.abs(delta / Math.max(rOld, 0.1)) * 100);
      consistencyTrend = ok({
        pattern:    `Training frequency has declined — ${pct}% fewer sessions in recent weeks.`,
        confidence: conf(allTrainingDates.length, strength, recency),
        stability:  round2(stability),
        sampleSize: allTrainingDates.length,
        reason:     `${b[2]} sessions (last 30d) vs ${b[0]} sessions (60–90d ago)`,
      });
    }
  }

  // ── Training: lateWeekDropOff ──────────────────────────────────────────────

  let lateWeekDropOff: InsightResult;
  if (allTrainingDates.length < MIN_SAMPLES) {
    lateWeekDropOff = noData(allTrainingDates.length);
  } else {
    const freq  = dowFreq(allTrainingDates);
    const early = freq[0] + freq[1] + freq[2]; // Mon Tue Wed
    const late  = freq[3] + freq[4] + freq[5]; // Thu Fri Sat
    const total = early + late + freq[6];
    if (late === 0 || total < MIN_SAMPLES) {
      lateWeekDropOff = noData(total);
    } else {
      const ratio   = early / late;
      const dropOff = ratio > 1.3;
      const latePct = Math.round((late / (early + late)) * 100);
      const strength = clamp(Math.abs(ratio - 1.0) / 0.5, 0, 1);
      const recency  = recencyOf(allTrainingDates, todayMs);
      // Stability: does the same ratio hold in both halves?
      const oldDates = allTrainingDates.filter((d) => daysAgo(d) > 45);
      const newDates = allTrainingDates.filter((d) => daysAgo(d) <= 45);
      let stability  = 0.50;
      if (oldDates.length >= 3 && newDates.length >= 3) {
        const oF   = dowFreq(oldDates);
        const nF   = dowFreq(newDates);
        const oE   = oF[0]+oF[1]+oF[2], oL = oF[3]+oF[4]+oF[5];
        const nE   = nF[0]+nF[1]+nF[2], nL = nF[3]+nF[4]+nF[5];
        const oDrop = oL > 0 && (oE / oL) > 1.3;
        const nDrop = nL > 0 && (nE / nL) > 1.3;
        stability = (oDrop === dropOff && nDrop === dropOff) ? 0.88
                  : (oDrop === dropOff || nDrop === dropOff) ? 0.55 : 0.25;
      }
      lateWeekDropOff = ok({
        pattern: dropOff
          ? `Late-week drop-off detected — only ${latePct}% of sessions happen Thursday–Saturday.`
          : `Training is well distributed — ${latePct}% of sessions are late-week.`,
        confidence: conf(total, strength, recency),
        stability:  round2(stability),
        sampleSize: total,
        reason:     `Mon–Wed: ${early} sessions · Thu–Sat: ${late} sessions`,
      });
    }
  }

  // ── Recovery: sleepImpact ──────────────────────────────────────────────────

  const sortedLogs = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
  const highSleepEnergy: { energy: number; date: string }[] = [];
  const lowSleepEnergy:  { energy: number; date: string }[] = [];

  for (let i = 0; i < sortedLogs.length - 1; i++) {
    const curr = sortedLogs[i];
    const next = sortedLogs[i + 1];
    if (daysAgo(curr.date) - daysAgo(next.date) > 2) continue;
    if (curr.sleep_hours >= 7.5) highSleepEnergy.push({ energy: next.energy, date: next.date });
    else if (curr.sleep_hours < 6.0) lowSleepEnergy.push({ energy: next.energy, date: next.date });
  }

  let sleepImpact: InsightResult;
  if (highSleepEnergy.length < MIN_SAMPLES || lowSleepEnergy.length < MIN_SAMPLES) {
    sleepImpact = noData(Math.min(highSleepEnergy.length, lowSleepEnergy.length));
  } else {
    const avgHigh  = mean(highSleepEnergy.map((x) => x.energy));
    const avgLow   = mean(lowSleepEnergy.map((x) => x.energy));
    const delta    = avgHigh - avgLow;
    const absDelta = Math.abs(delta);
    const strength = clamp(absDelta / 3.0, 0, 1);
    const total    = highSleepEnergy.length + lowSleepEnergy.length;
    const allDates = [...highSleepEnergy.map((x) => x.date), ...lowSleepEnergy.map((x) => x.date)];
    const recency  = recencyOf(allDates, todayMs);
    // Stability: does the same direction hold in both halves?
    const oldH = highSleepEnergy.filter((x) => daysAgo(x.date) > 45).map((x) => x.energy);
    const newH = highSleepEnergy.filter((x) => daysAgo(x.date) <= 45).map((x) => x.energy);
    const oldL = lowSleepEnergy.filter((x)  => daysAgo(x.date) > 45).map((x) => x.energy);
    const newL = lowSleepEnergy.filter((x)  => daysAgo(x.date) <= 45).map((x) => x.energy);
    let stability = 0.50;
    if (oldH.length >= 2 && oldL.length >= 2 && newH.length >= 2 && newL.length >= 2) {
      const oldDelta = mean(oldH) - mean(oldL);
      const newDelta = mean(newH) - mean(newL);
      const sameSign = Math.sign(oldDelta) === Math.sign(newDelta);
      const spread   = Math.abs(Math.abs(oldDelta) - Math.abs(newDelta));
      stability = sameSign ? round2(clamp(1.0 - spread / 3.0, 0.50, 0.95)) : 0.25;
    }
    sleepImpact = ok({
      pattern: delta > 0.5
        ? `Good sleep (≥7.5h) correlates with +${absDelta.toFixed(1)} higher energy the next day.`
        : delta < -0.3
        ? `Sleep and next-day energy show an inverse pattern — other factors may dominate.`
        : `Sleep duration has a weak correlation with next-day energy in your data.`,
      confidence: conf(total, strength, recency),
      stability,
      sampleSize: total,
      reason:
        `After ≥7.5h sleep: avg energy ${avgHigh.toFixed(1)}/10 (n=${highSleepEnergy.length}) · ` +
        `after <6h: ${avgLow.toFixed(1)}/10 (n=${lowSleepEnergy.length})`,
    });
  }

  // ── Recovery: fatiguePattern ───────────────────────────────────────────────

  let fatiguePattern: InsightResult;
  if (dailyLogs.length < MIN_SAMPLES) {
    fatiguePattern = noData(dailyLogs.length);
  } else {
    const byDay: number[][] = [[], [], [], [], [], [], []];
    for (const log of dailyLogs) byDay[isoDow(log.date)].push(log.fatigue);
    const avgs        = byDay.map(mean);
    const highestDay  = avgs.reduce((best, v, i) => (byDay[i].length >= 2 && v > avgs[best] ? i : best), 0);
    const lowestDay   = avgs.reduce((best, v, i) => (byDay[i].length >= 2 && v < avgs[best] ? i : best), highestDay);
    const range       = avgs[highestDay] - avgs[lowestDay];
    const strength    = clamp(range / 4.0, 0, 1);
    const logDates    = dailyLogs.map((l) => l.date);
    const recency     = recencyOf(logDates, todayMs);
    const stability   = dowStability(logDates, highestDay, todayMs);
    fatiguePattern = ok({
      pattern:    `Fatigue peaks on ${DAYS[highestDay]} (avg ${avgs[highestDay].toFixed(1)}/10) — plan lighter sessions or recovery work.`,
      confidence: conf(dailyLogs.length, strength, recency),
      stability,
      sampleSize: dailyLogs.length,
      reason:
        `${DAYS[highestDay]}: ${avgs[highestDay].toFixed(1)} avg fatigue vs ` +
        `${DAYS[lowestDay]}: ${avgs[lowestDay].toFixed(1)} (lowest)`,
    });
  }

  // ── Recovery: recoveryTrend ────────────────────────────────────────────────

  let recoveryTrend: InsightResult;
  if (dailyLogs.length < MIN_SAMPLES) {
    recoveryTrend = noData(dailyLogs.length);
  } else {
    const sorted = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
    const mid    = Math.floor(sorted.length / 2);
    const recov  = (l: BehaviorDailyLog) => (l.energy + (10 - l.fatigue)) / 2;
    const earlyScore  = mean(sorted.slice(0, mid).map(recov));
    const recentScore = mean(sorted.slice(mid).map(recov));
    const delta       = recentScore - earlyScore;
    const strength    = clamp(Math.abs(delta) / 2.0, 0, 1);
    const recency     = recencyOf(dailyLogs.map((l) => l.date), todayMs);
    // Split into 3 thirds for trend stability
    const third = Math.floor(sorted.length / 3);
    const b3: [number, number, number] = [
      Math.round(mean(sorted.slice(0, third).map(recov)) * 10),
      Math.round(mean(sorted.slice(third, third * 2).map(recov)) * 10),
      Math.round(mean(sorted.slice(third * 2).map(recov)) * 10),
    ];
    const stability = trendStability(b3);
    recoveryTrend = ok({
      pattern: Math.abs(delta) < 0.3
        ? `Recovery capacity is stable — consistent energy and fatigue scores over 90 days.`
        : delta > 0
        ? `Recovery is trending upward — recent scores are ${delta.toFixed(1)} points higher than earlier.`
        : `Recovery trend is declining — recent scores are ${Math.abs(delta).toFixed(1)} points lower.`,
      confidence: conf(dailyLogs.length, Math.max(strength, 0.5), recency),
      stability:  round2(stability),
      sampleSize: dailyLogs.length,
      reason:     `Early period avg recovery: ${earlyScore.toFixed(1)} · Recent: ${recentScore.toFixed(1)} (scale 1–10)`,
    });
  }

  // ── Growth: bestGrowthDay ──────────────────────────────────────────────────

  const growthDates = growthLogs.map((g) => g.date);
  let bestGrowthDay: InsightResult;
  if (growthLogs.length < MIN_SAMPLES) {
    bestGrowthDay = noData(growthLogs.length);
  } else {
    const freq      = dowFreq(growthDates);
    const total     = freq.reduce((s, v) => s + v, 0);
    const best      = argMax(freq);
    const count     = freq[best];
    const pct       = Math.round((count / total) * 100);
    const recency   = recencyOf(growthDates, todayMs);
    const stability = dowStability(growthDates, best, todayMs);
    bestGrowthDay = ok({
      pattern:    `${DAYS[best]} is the most productive growth day — ${pct}% of sessions occur then.`,
      confidence: conf(total, count / total, recency),
      stability,
      sampleSize: total,
      reason:     `${count} of ${total} growth log entries on ${DAYS[best]} · recency ${Math.round(recency * 100)}%`,
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
      const pct       = Math.round((mins / grandTotal) * 100);
      const recency   = recencyOf(growthDates, todayMs);
      const stability = categoryStability(growthLogs, cat, todayMs);
      const LABEL: Record<string, string> = {
        study: "Study", project: "Project work", learning: "Learning", deep_work: "Deep work",
      };
      const label = LABEL[cat] ?? cat;
      dominantCategory = ok({
        pattern:    `${label} accounts for ${pct}% of total growth time — your primary focus category.`,
        confidence: conf(growthLogs.length, mins / grandTotal, recency),
        stability,
        sampleSize: growthLogs.length,
        reason:
          `${(mins / 60).toFixed(1)}h of ${(grandTotal / 60).toFixed(1)}h total in ${label.toLowerCase()} · recency ${Math.round(recency * 100)}%`,
      });
    }
  }

  // ── Growth: growthConsistency ──────────────────────────────────────────────

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
    const WEEKS_IN_WINDOW = 13;
    const active    = activeWeeks.size;
    const rate      = Math.min(active / WEEKS_IN_WINDOW, 1);
    const pct       = Math.round(rate * 100);
    const recency   = recencyOf(growthDates, todayMs);
    // Stability: is the weekly rate similar in older vs recent half?
    const oldWeeks  = new Set<string>();
    const newWeeks  = new Set<string>();
    for (const g of growthLogs) {
      const age    = daysAgo(g.date);
      const dow    = isoDow(g.date);
      const monday = new Date(utcMs(g.date) - dow * MS_PER_DAY).toISOString().split("T")[0];
      (age > 45 ? oldWeeks : newWeeks).add(monday);
    }
    const rateVar   = Math.abs(oldWeeks.size / 6.5 - newWeeks.size / 6.5);
    const stability = round2(clamp(1.0 - rateVar, 0.20, 0.95));
    growthConsistency = ok({
      pattern:    `Growth activities logged in ${pct}% of weeks — ${active} of the last ${WEEKS_IN_WINDOW} weeks.`,
      confidence: conf(growthLogs.length, rate, recency),
      stability,
      sampleSize: growthLogs.length,
      reason:     `${active} distinct calendar weeks with ≥1 growth log entry · recency ${Math.round(recency * 100)}%`,
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
    const pct       = Math.round((count / skipReasons.length) * 100);
    const skipDates = skipReasons.map((s) => s.date);
    const recency   = recencyOf(skipDates, todayMs);
    const stability = reasonStability(skipReasons, reason, todayMs);
    const LABEL: Record<SkipReason, string> = {
      fatigue: "fatigue", injury: "injury", busy: "being too busy",
      travel: "travel", motivation: "low motivation", weather: "weather",
      unknown: "unrecorded reasons",
    };
    topSkipReason = ok({
      pattern:    `${pct}% of skipped sessions are attributed to ${LABEL[reason]}.`,
      confidence: conf(skipReasons.length, count / skipReasons.length, recency),
      stability,
      sampleSize: skipReasons.length,
      reason:     `${count} of ${skipReasons.length} recorded skips due to "${reason}" · recency ${Math.round(recency * 100)}%`,
    });
  }

  // ── Skip: skipFrequency ────────────────────────────────────────────────────

  const completedDateSet = new Set([
    ...sessions.filter((s) => s.type === "run" || s.type === "lift").map((s) => s.date),
    ...runs.map((r) => r.activity_date),
  ]);
  const completedDateArr = Array.from(completedDateSet);
  const totalAttempts    = completedDateArr.length + skipReasons.length;

  let skipFrequency: InsightResult;
  if (totalAttempts < MIN_SAMPLES) {
    skipFrequency = noData(totalAttempts);
  } else {
    const rate      = skipReasons.length / totalAttempts;
    const pct       = Math.round(rate * 100);
    const strength  = clamp(rate * 2, CONF_FLOOR, 1.0);
    const allDates  = [...skipReasons.map((s) => s.date), ...completedDateArr];
    const recency   = recencyOf(allDates, todayMs);
    const stability = skipRateStability(skipReasons.map((s) => s.date), completedDateArr, todayMs);
    skipFrequency = ok({
      pattern: rate < 0.10
        ? `Excellent adherence — only ${pct}% of training sessions are skipped.`
        : rate < 0.25
        ? `${pct}% skip rate — within a healthy range but worth monitoring.`
        : `Elevated skip rate detected — ${pct}% of planned sessions were missed.`,
      confidence: conf(totalAttempts, strength, recency),
      stability,
      sampleSize: totalAttempts,
      reason:     `${skipReasons.length} skips vs ${completedDateArr.length} completed sessions`,
    });
  }

  // ── Skip: skipDayPattern ───────────────────────────────────────────────────

  let skipDayPattern: InsightResult;
  if (skipReasons.length < MIN_SAMPLES) {
    skipDayPattern = noData(skipReasons.length);
  } else {
    const skipDates = skipReasons.map((s) => s.date);
    const freq      = dowFreq(skipDates);
    const total     = freq.reduce((s, v) => s + v, 0);
    const worst     = argMax(freq);
    const count     = freq[worst];
    const pct       = Math.round((count / total) * 100);
    const strength  = count / total;
    const recency   = recencyOf(skipDates, todayMs);
    const stability = dowStability(skipDates, worst, todayMs);
    skipDayPattern = ok({
      pattern: strength > 0.35
        ? `${DAYS[worst]} accounts for ${pct}% of all skips — a recurring pattern worth addressing.`
        : `Skips are spread across the week — no single day consistently disrupts training.`,
      confidence: conf(total, strength, recency),
      stability,
      sampleSize: total,
      reason:     `${count} of ${total} recorded skips on ${DAYS[worst]} · recency ${Math.round(recency * 100)}%`,
    });
  }

  // ── Planner suggestions ────────────────────────────────────────────────────

  const plannerSuggestions: PlannerSuggestion[] = [];

  if (
    preferredRunDay.status === "ok" &&
    preferredRunDayIndex !== -1 && preferredRunDayIndex !== 5 &&
    preferredRunDay.confidence >= 0.65
  ) {
    const pct = runDates.length > 0
      ? Math.round((dowFreq(runDates)[preferredRunDayIndex] / runDates.length) * 100)
      : 0;
    plannerSuggestions.push({
      type:       "schedule_shift",
      action:     `Consider anchoring the long run on ${DAYS[preferredRunDayIndex]} instead of Saturday.`,
      reason:     `${pct}% of historical runs occur on ${DAYS[preferredRunDayIndex]} (n=${preferredRunDay.sampleSize}).`,
      confidence: preferredRunDay.confidence,
      priority:   preferredRunDay.confidence >= 0.80 ? "high" : "medium",
    });
  }

  if (
    skipDayPattern.status === "ok" && skipDayPattern.confidence >= 0.65 &&
    lowestCompletionDayIndex !== -1
  ) {
    const pct = skipReasons.length > 0
      ? Math.round((dowFreq(skipReasons.map((s) => s.date))[lowestCompletionDayIndex] / skipReasons.length) * 100)
      : 0;
    plannerSuggestions.push({
      type:       "schedule_shift",
      action:     `Move ${DAYS[lowestCompletionDayIndex]} sessions earlier in the week.`,
      reason:     `${pct}% of recorded skips occur on ${DAYS[lowestCompletionDayIndex]}.`,
      confidence: skipDayPattern.confidence,
      priority:   skipDayPattern.confidence >= 0.80 ? "high" : "medium",
    });
  }

  if (lateWeekDropOff.status === "ok" && lateWeekDropOff.confidence >= 0.70) {
    const freq  = dowFreq(allTrainingDates);
    const early = freq[0] + freq[1] + freq[2];
    const late  = freq[3] + freq[4] + freq[5];
    if (early > late) {
      plannerSuggestions.push({
        type:       "load_adjustment",
        action:     `Redistribute some Monday–Wednesday load to Thursday–Saturday.`,
        reason:     `${early} early-week vs ${late} late-week sessions — week skews front-loaded.`,
        confidence: lateWeekDropOff.confidence,
        priority:   "medium",
      });
    }
  }

  if (sleepImpact.status === "ok" && sleepImpact.confidence >= 0.70) {
    const avgH = mean(highSleepEnergy.map((x) => x.energy));
    const avgL = mean(lowSleepEnergy.map((x) => x.energy));
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

  const allInsights: BehaviorInsight[] = [];
  for (const r of [
    preferredRunDay, preferredLiftDay, highestCompletionDay, lowestCompletionDay,
    consistencyTrend, lateWeekDropOff,
    sleepImpact, fatiguePattern, recoveryTrend,
    bestGrowthDay, dominantCategory, growthConsistency,
    topSkipReason, skipFrequency, skipDayPattern,
  ]) {
    if (r.status === "ok") allInsights.push(r);
  }
  allInsights.sort((a, b) => b.confidence - a.confidence);
  const topInsights = allInsights.slice(0, 3);

  // ── Data quality ───────────────────────────────────────────────────────────

  const dataQuality: BehaviorProfile["dataQuality"] =
    allTrainingDates.length >= 40 && dailyLogs.length >= 30 && growthLogs.length >= 10 ? "rich"
    : allTrainingDates.length >= 20 && dailyLogs.length >= 14                           ? "moderate"
    : "sparse";

  return {
    training: {
      preferredRunDay, preferredLiftDay, highestCompletionDay, lowestCompletionDay,
      consistencyTrend, lateWeekDropOff,
    },
    recovery:  { sleepImpact, fatiguePattern, recoveryTrend },
    growth:    { bestGrowthDay, dominantCategory, growthConsistency },
    skip:      { topSkipReason, skipFrequency, skipDayPattern },
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
    ["Training", profile.training as unknown as Record<string, InsightResult>],
    ["Recovery", profile.recovery as unknown as Record<string, InsightResult>],
    ["Growth",   profile.growth   as unknown as Record<string, InsightResult>],
    ["Skip",     profile.skip     as unknown as Record<string, InsightResult>],
  ];

  for (const [label, group] of categories) {
    for (const result of Object.values(group)) {
      if (result.status === "ok" && result.confidence >= 0.60) {
        lines.push(
          `${label}: ${result.pattern} ` +
          `(conf ${Math.round(result.confidence * 100)}%, stab ${Math.round(result.stability * 100)}%, n=${result.sampleSize})`,
        );
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
