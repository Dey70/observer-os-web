/**
 * Behavior Learning Engine — Phase 6C.9 (final refinement)
 *
 * Pure deterministic pattern recognition over rolling historical athlete data.
 *
 * Each insight carries four signals:
 *
 *   type       — "strength" | "warning" | "opportunity" | "habit"
 *   confidence — clamp(sampleRatio × patternStrength × recencyWeight, 0.50, 0.98)
 *   stability  — fraction of 30-day sub-windows where the finding agrees with overall
 *   evidence   — one-sentence specific citation of the underlying data ("Here's the proof.")
 *
 * confidence details:
 *   recencyWeight: exponential decay λ = 0.02/day
 *     → day 0: 1.00 · day 45: ~0.41 · day 90: ~0.17
 *   sampleRatio saturates at IDEAL_SAMPLES (20); clamped to [0.50, 0.98]
 *
 * Guarantees:
 *   • Same inputs → same outputs (referentially transparent)
 *   • No I/O, no network, no React, no Supabase
 *   • All algorithms O(n); target runtime < 10 ms on 90-day windows
 *   • Never infers a pattern from fewer than MIN_SAMPLES (5) data points
 *
 * Phase 7 can consume `type` to prioritise warnings over strengths in planner adaptation.
 */

import type { SkipReason } from "@/types";

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_SAMPLES   = 5;
const IDEAL_SAMPLES = 20;
const CONF_FLOOR    = 0.50;
const CONF_CEIL     = 0.98;
const MS_PER_DAY    = 86_400_000;
const DECAY_RATE    = 0.02;   // λ for exponential recency decay (per day)

const DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

// ── Input types ──────────────────────────────────────────────────────────────

export interface BehaviorSession {
  date:     string;
  type:     string;
  duration: number;
  rpe:      number;
}

export interface BehaviorGrowthLog {
  date:         string;
  category:     string;
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
  today:       string;
}

// ── Output types ─────────────────────────────────────────────────────────────

// Phase 7 can use type to prioritise warnings in planner adaptation.
export type InsightType = "strength" | "warning" | "opportunity" | "habit";

export interface BehaviorInsight {
  type:       InsightType;
  pattern:    string;   // concise headline sentence
  evidence:   string;   // specific data citation — "Here's the proof."
  confidence: number;   // 0.00–1.00: sampleRatio × patternStrength × recencyWeight
  stability:  number;   // 0.00–1.00: fraction of sub-windows that agree
  sampleSize: number;
}

export type InsightResult =
  | ({ status: "ok" } & BehaviorInsight)
  | { status: "insufficient_data"; sampleSize: number; minRequired: number };

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
  plannerSuggestions: PlannerSuggestion[];
  topInsights:        BehaviorInsight[];   // top 3 by confidence, pre-sorted
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

function isoDow(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

// ── Confidence: recency component ────────────────────────────────────────────

function recencyOf(dates: string[], todayMs: number): number {
  if (dates.length === 0) return 1.0;
  const sum = dates.reduce((acc, d) => {
    const age = Math.max(0, Math.floor((todayMs - utcMs(d)) / MS_PER_DAY));
    return acc + Math.exp(-DECAY_RATE * age);
  }, 0);
  return sum / dates.length;
}

function conf(sampleSize: number, patternStrength: number, recency = 1.0): number {
  const sampleRatio = Math.min(sampleSize / IDEAL_SAMPLES, 1.0);
  return round2(clamp(sampleRatio * patternStrength * recency, CONF_FLOOR, CONF_CEIL));
}

// ── Stability helpers ────────────────────────────────────────────────────────

// Fraction of active 30-day buckets where dominant day also leads that bucket.
function dowStability(dates: string[], dominantDow: number, todayMs: number): number {
  const bt = [0, 0, 0];
  const bm = [0, 0, 0];
  for (const d of dates) {
    const age = Math.max(0, Math.floor((todayMs - utcMs(d)) / MS_PER_DAY));
    const b   = age <= 30 ? 2 : age <= 60 ? 1 : 0;
    bt[b]++;
    if (isoDow(d) === dominantDow) bm[b]++;
  }
  let agreements = 0, valid = 0;
  for (let i = 0; i < 3; i++) {
    if (bt[i] < 2) continue;
    valid++;
    if (bm[i] / bt[i] >= 0.25) agreements++;
  }
  return valid === 0 ? 0.50 : round2(agreements / valid);
}

function trendStability(b: [number, number, number]): number {
  const dir01 = b[1] - b[0];
  const dir12 = b[2] - b[1];
  if (Math.sign(dir01) === Math.sign(dir12)) return 0.88;
  if (Math.abs(dir01) < 0.5 || Math.abs(dir12) < 0.5) return 0.65;
  return 0.30;
}

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
  const oldTop = topOf(old), recTop = topOf(rec);
  if (oldTop === dominantCat && recTop === dominantCat) return 0.95;
  if (oldTop === dominantCat || recTop === dominantCat) return 0.60;
  return 0.20;
}

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
  const oldTop = topOf(old), recTop = topOf(rec);
  if (oldTop === topReason && recTop === topReason) return 0.95;
  if (oldTop === topReason || recTop === topReason) return 0.60;
  return 0.20;
}

function skipRateStability(skipDates: string[], completedDates: string[], todayMs: number): number {
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

// ── Constructors ─────────────────────────────────────────────────────────────

function ok(insight: BehaviorInsight): InsightResult {
  return { status: "ok", ...insight };
}

function noData(sampleSize: number, minRequired = MIN_SAMPLES): InsightResult {
  return { status: "insufficient_data", sampleSize, minRequired };
}

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
  ])].sort();

  let preferredRunDayIndex = -1;
  let preferredRunDay: InsightResult;
  if (runDates.length < MIN_SAMPLES) {
    preferredRunDay = noData(runDates.length);
  } else {
    const freq    = dowFreq(runDates);
    const total   = freq.reduce((s, v) => s + v, 0);
    const best    = argMax(freq);
    const count   = freq[best];
    const pct     = Math.round((count / total) * 100);
    const recency = recencyOf(runDates, todayMs);
    const stab    = dowStability(runDates, best, todayMs);
    const evN     = Math.min(20, runDates.length);
    const evCount = runDates.slice(-evN).filter((d) => isoDow(d) === best).length;
    preferredRunDayIndex = best;
    preferredRunDay = ok({
      type:       "habit",
      pattern:    `${pct}% of runs are completed on ${DAYS[best]}.`,
      evidence:   `${evCount} of your last ${evN} run sessions were on ${DAYS[best]}.`,
      confidence: conf(total, count / total, recency),
      stability:  stab,
      sampleSize: total,
    });
  }

  // ── Training: preferredLiftDay ─────────────────────────────────────────────

  const liftDates = sessions.filter((s) => s.type === "lift").map((s) => s.date).sort();
  let preferredLiftDay: InsightResult;
  if (liftDates.length < MIN_SAMPLES) {
    preferredLiftDay = noData(liftDates.length);
  } else {
    const freq    = dowFreq(liftDates);
    const total   = freq.reduce((s, v) => s + v, 0);
    const best    = argMax(freq);
    const count   = freq[best];
    const pct     = Math.round((count / total) * 100);
    const recency = recencyOf(liftDates, todayMs);
    const stab    = dowStability(liftDates, best, todayMs);
    const evN     = Math.min(15, liftDates.length);
    const evCount = liftDates.slice(-evN).filter((d) => isoDow(d) === best).length;
    preferredLiftDay = ok({
      type:       "habit",
      pattern:    `${pct}% of lift sessions are logged on ${DAYS[best]}.`,
      evidence:   `${evCount} of your last ${evN} lift sessions were on ${DAYS[best]}.`,
      confidence: conf(total, count / total, recency),
      stability:  stab,
      sampleSize: total,
    });
  }

  // ── Training: highestCompletionDay ─────────────────────────────────────────

  const allTrainingDates = [...new Set([
    ...sessions.filter((s) => s.type === "run" || s.type === "lift").map((s) => s.date),
    ...runs.map((r) => r.activity_date),
  ])].sort();

  let highestCompletionDayIndex = -1;
  let highestCompletionDay: InsightResult;
  if (allTrainingDates.length < MIN_SAMPLES) {
    highestCompletionDay = noData(allTrainingDates.length);
  } else {
    const freq    = dowFreq(allTrainingDates);
    const total   = freq.reduce((s, v) => s + v, 0);
    const best    = argMax(freq);
    const count   = freq[best];
    const pct     = Math.round((count / total) * 100);
    const recency = recencyOf(allTrainingDates, todayMs);
    const stab    = dowStability(allTrainingDates, best, todayMs);
    highestCompletionDayIndex = best;
    highestCompletionDay = ok({
      type:       "strength",
      pattern:    `${DAYS[best]} is the most consistent training day — ${pct}% of sessions happen then.`,
      evidence:   `${DAYS[best]} holds ${count} of ${total} total training sessions — more than any other day.`,
      confidence: conf(total, count / total, recency),
      stability:  stab,
      sampleSize: total,
    });
  }

  // ── Training: lowestCompletionDay ──────────────────────────────────────────

  let lowestCompletionDayIndex = -1;
  let lowestCompletionDay: InsightResult;
  if (skipReasons.length >= MIN_SAMPLES) {
    const skipDates = skipReasons.map((s) => s.date).sort();
    const freq      = dowFreq(skipDates);
    const total     = freq.reduce((s, v) => s + v, 0);
    const worst     = argMax(freq);
    const count     = freq[worst];
    const pct       = Math.round((count / total) * 100);
    const recency   = recencyOf(skipDates, todayMs);
    const stab      = dowStability(skipDates, worst, todayMs);
    const evN       = Math.min(10, skipDates.length);
    const evCount   = skipDates.slice(-evN).filter((d) => isoDow(d) === worst).length;
    lowestCompletionDayIndex = worst;
    lowestCompletionDay = ok({
      type:       "warning",
      pattern:    `${pct}% of skipped sessions fall on ${DAYS[worst]}.`,
      evidence:   `${evCount} of your last ${evN} recorded skips occurred on ${DAYS[worst]}.`,
      confidence: conf(total, count / total, recency),
      stability:  stab,
      sampleSize: total,
    });
  } else if (allTrainingDates.length >= MIN_SAMPLES) {
    const freq  = dowFreq(allTrainingDates);
    const total = freq.reduce((s, v) => s + v, 0);
    const worst = argMinNonZero(freq);
    if (worst === -1 || total < MIN_SAMPLES) {
      lowestCompletionDay = noData(allTrainingDates.length);
    } else {
      const count   = freq[worst];
      const pct     = Math.round((count / total) * 100);
      const recency = recencyOf(allTrainingDates, todayMs);
      const stab    = dowStability(allTrainingDates, worst, todayMs);
      const evN     = Math.min(20, allTrainingDates.length);
      const evCount = allTrainingDates.slice(-evN).filter((d) => isoDow(d) === worst).length;
      lowestCompletionDayIndex = worst;
      lowestCompletionDay = ok({
        type:       "warning",
        pattern:    `${DAYS[worst]} has the fewest logged sessions — only ${pct}% of total.`,
        evidence:   `Only ${evCount} of your last ${evN} sessions were on ${DAYS[worst]} — the lowest of any day.`,
        confidence: conf(total, 1 - count / total, recency),
        stability:  stab,
        sampleSize: total,
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
    const b: [number, number, number] = [0, 0, 0];
    for (const d of allTrainingDates) {
      const age = daysAgo(d);
      if (age <= 30) b[2]++; else if (age <= 60) b[1]++; else if (age <= 90) b[0]++;
    }
    const rOld    = b[0] / 4.3;
    const rMid    = b[1] / 4.3;
    const rRecent = b[2] / 4.3;
    const delta   = rRecent - rOld;
    const absDelta = Math.abs(delta);
    const strength = clamp(absDelta / Math.max(rOld, 0.5), 0, 1);
    const recency  = recencyOf(allTrainingDates, todayMs);
    const stab     = trendStability(b);

    if (absDelta < 0.3 || rOld < 0.1) {
      consistencyTrend = ok({
        type:       "habit",
        pattern:    `Training volume is stable — consistent sessions per week over 90 days.`,
        evidence:   `Sessions per week: ${rOld.toFixed(1)} → ${rMid.toFixed(1)} → ${rRecent.toFixed(1)} across three 30-day windows.`,
        confidence: conf(allTrainingDates.length, 0.75, recency),
        stability:  round2(stab),
        sampleSize: allTrainingDates.length,
      });
    } else if (delta > 0) {
      const pct = Math.round((delta / Math.max(rOld, 0.1)) * 100);
      consistencyTrend = ok({
        type:       "strength",
        pattern:    `Training consistency is improving — ${pct}% more sessions in recent weeks.`,
        evidence:   `Sessions per week: ${rOld.toFixed(1)} → ${rMid.toFixed(1)} → ${rRecent.toFixed(1)} — a rising trend.`,
        confidence: conf(allTrainingDates.length, strength, recency),
        stability:  round2(stab),
        sampleSize: allTrainingDates.length,
      });
    } else {
      const pct = Math.round(Math.abs(delta / Math.max(rOld, 0.1)) * 100);
      consistencyTrend = ok({
        type:       "warning",
        pattern:    `Training frequency has declined — ${pct}% fewer sessions in recent weeks.`,
        evidence:   `Sessions per week: ${rOld.toFixed(1)} → ${rMid.toFixed(1)} → ${rRecent.toFixed(1)} — a falling trend.`,
        confidence: conf(allTrainingDates.length, strength, recency),
        stability:  round2(stab),
        sampleSize: allTrainingDates.length,
      });
    }
  }

  // ── Training: lateWeekDropOff ──────────────────────────────────────────────

  let lateWeekDropOff: InsightResult;
  if (allTrainingDates.length < MIN_SAMPLES) {
    lateWeekDropOff = noData(allTrainingDates.length);
  } else {
    const freq  = dowFreq(allTrainingDates);
    const early = freq[0] + freq[1] + freq[2];
    const late  = freq[3] + freq[4] + freq[5];
    const total = early + late + freq[6];
    if (late === 0 || total < MIN_SAMPLES) {
      lateWeekDropOff = noData(total);
    } else {
      const ratio   = early / late;
      const dropOff = ratio > 1.3;
      const latePct = Math.round((late / (early + late)) * 100);
      const strength = clamp(Math.abs(ratio - 1.0) / 0.5, 0, 1);
      const recency  = recencyOf(allTrainingDates, todayMs);
      const oldDates = allTrainingDates.filter((d) => daysAgo(d) > 45);
      const newDates = allTrainingDates.filter((d) => daysAgo(d) <= 45);
      let stab = 0.50;
      if (oldDates.length >= 3 && newDates.length >= 3) {
        const oF    = dowFreq(oldDates);
        const nF    = dowFreq(newDates);
        const oE    = oF[0]+oF[1]+oF[2], oL = oF[3]+oF[4]+oF[5];
        const nE    = nF[0]+nF[1]+nF[2], nL = nF[3]+nF[4]+nF[5];
        const oDrop = oL > 0 && (oE / oL) > 1.3;
        const nDrop = nL > 0 && (nE / nL) > 1.3;
        stab = (oDrop === dropOff && nDrop === dropOff) ? 0.88
             : (oDrop === dropOff || nDrop === dropOff) ? 0.55 : 0.25;
      }
      lateWeekDropOff = ok({
        type: dropOff ? "warning" : "strength",
        pattern: dropOff
          ? `Late-week drop-off detected — only ${latePct}% of sessions happen Thursday–Saturday.`
          : `Training is well distributed — ${latePct}% of sessions are late-week.`,
        evidence: dropOff
          ? `${early} sessions Mon–Wed vs ${late} sessions Thu–Sat — early-week training dominates.`
          : `${early} sessions Mon–Wed and ${late} sessions Thu–Sat — training is spread across the week.`,
        confidence: conf(total, strength, recency),
        stability:  round2(stab),
        sampleSize: total,
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
    const oldH = highSleepEnergy.filter((x) => daysAgo(x.date) > 45).map((x) => x.energy);
    const newH = highSleepEnergy.filter((x) => daysAgo(x.date) <= 45).map((x) => x.energy);
    const oldL = lowSleepEnergy.filter((x)  => daysAgo(x.date) > 45).map((x) => x.energy);
    const newL = lowSleepEnergy.filter((x)  => daysAgo(x.date) <= 45).map((x) => x.energy);
    let stab   = 0.50;
    if (oldH.length >= 2 && oldL.length >= 2 && newH.length >= 2 && newL.length >= 2) {
      const sameSign = Math.sign(mean(oldH) - mean(oldL)) === Math.sign(mean(newH) - mean(newL));
      const spread   = Math.abs(Math.abs(mean(oldH) - mean(oldL)) - Math.abs(mean(newH) - mean(newL)));
      stab = sameSign ? round2(clamp(1.0 - spread / 3.0, 0.50, 0.95)) : 0.25;
    }
    const insightType: InsightType = delta > 0.5 ? "opportunity" : "habit";
    sleepImpact = ok({
      type: insightType,
      pattern: delta > 0.5
        ? `Good sleep (≥7.5h) correlates with +${absDelta.toFixed(1)} higher energy the next day.`
        : delta < -0.3
        ? `Sleep and next-day energy show an inverse pattern — other factors may dominate.`
        : `Sleep duration has a weak correlation with next-day energy in your data.`,
      evidence:
        `After ≥7.5h sleep: next-day energy averages ${avgHigh.toFixed(1)}/10. ` +
        `After <6h sleep: ${avgLow.toFixed(1)}/10 — a ${absDelta.toFixed(1)}-point difference.`,
      confidence: conf(total, strength, recency),
      stability:  stab,
      sampleSize: total,
    });
  }

  // ── Recovery: fatiguePattern ───────────────────────────────────────────────

  let fatiguePattern: InsightResult;
  if (dailyLogs.length < MIN_SAMPLES) {
    fatiguePattern = noData(dailyLogs.length);
  } else {
    const byDay: number[][] = [[], [], [], [], [], [], []];
    for (const log of dailyLogs) byDay[isoDow(log.date)].push(log.fatigue);
    const avgs       = byDay.map(mean);
    const highestDay = avgs.reduce((best, v, i) => (byDay[i].length >= 2 && v > avgs[best] ? i : best), 0);
    const lowestDay  = avgs.reduce((best, v, i) => (byDay[i].length >= 2 && v < avgs[best] ? i : best), highestDay);
    const range      = avgs[highestDay] - avgs[lowestDay];
    const logDates   = dailyLogs.map((l) => l.date);
    const recency    = recencyOf(logDates, todayMs);
    const stab       = dowStability(logDates, highestDay, todayMs);
    fatiguePattern = ok({
      type:       "warning",
      pattern:    `Fatigue peaks on ${DAYS[highestDay]} (avg ${avgs[highestDay].toFixed(1)}/10) — plan lighter sessions or recovery work.`,
      evidence:   `${DAYS[highestDay]}: avg fatigue ${avgs[highestDay].toFixed(1)}/10 vs ${DAYS[lowestDay]}: ${avgs[lowestDay].toFixed(1)}/10 — a ${range.toFixed(1)}-point gap.`,
      confidence: conf(dailyLogs.length, clamp(range / 4.0, 0, 1), recency),
      stability:  stab,
      sampleSize: dailyLogs.length,
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
    const third       = Math.floor(sorted.length / 3);
    const b3: [number, number, number] = [
      Math.round(mean(sorted.slice(0, third).map(recov)) * 10),
      Math.round(mean(sorted.slice(third, third * 2).map(recov)) * 10),
      Math.round(mean(sorted.slice(third * 2).map(recov)) * 10),
    ];
    const stab   = trendStability(b3);
    const s1     = (b3[0]/10).toFixed(1);
    const s2     = (b3[1]/10).toFixed(1);
    const s3     = (b3[2]/10).toFixed(1);
    const trendType: InsightType = Math.abs(delta) < 0.3 ? "habit" : delta > 0 ? "strength" : "warning";
    recoveryTrend = ok({
      type: trendType,
      pattern: Math.abs(delta) < 0.3
        ? `Recovery capacity is stable — consistent energy and fatigue scores over 90 days.`
        : delta > 0
        ? `Recovery is trending upward — recent scores are ${delta.toFixed(1)} points higher than earlier.`
        : `Recovery trend is declining — recent scores are ${Math.abs(delta).toFixed(1)} points lower.`,
      evidence:   `Recovery score across three 30-day windows: ${s1} → ${s2} → ${s3} (scale 1–10).`,
      confidence: conf(dailyLogs.length, Math.max(strength, 0.5), recency),
      stability:  round2(stab),
      sampleSize: dailyLogs.length,
    });
  }

  // ── Growth: bestGrowthDay ──────────────────────────────────────────────────

  const growthDates = growthLogs.map((g) => g.date).sort();
  let bestGrowthDay: InsightResult;
  if (growthLogs.length < MIN_SAMPLES) {
    bestGrowthDay = noData(growthLogs.length);
  } else {
    const freq    = dowFreq(growthDates);
    const total   = freq.reduce((s, v) => s + v, 0);
    const best    = argMax(freq);
    const count   = freq[best];
    const pct     = Math.round((count / total) * 100);
    const recency = recencyOf(growthDates, todayMs);
    const stab    = dowStability(growthDates, best, todayMs);
    const evN     = Math.min(14, growthDates.length);
    const evCount = growthDates.slice(-evN).filter((d) => isoDow(d) === best).length;
    bestGrowthDay = ok({
      type:       "opportunity",
      pattern:    `${DAYS[best]} is the most productive growth day — ${pct}% of sessions occur then.`,
      evidence:   `${evCount} of your last ${evN} growth sessions were logged on ${DAYS[best]}.`,
      confidence: conf(total, count / total, recency),
      stability:  stab,
      sampleSize: total,
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
      const pct    = Math.round((mins / grandTotal) * 100);
      const recency = recencyOf(growthDates, todayMs);
      const stab   = categoryStability(growthLogs, cat, todayMs);
      const LABEL: Record<string, string> = {
        study: "Study", project: "Project work", learning: "Learning", deep_work: "Deep work",
      };
      const label = LABEL[cat] ?? cat;
      dominantCategory = ok({
        type:       "habit",
        pattern:    `${label} accounts for ${pct}% of total growth time — your primary focus category.`,
        evidence:   `${(mins / 60).toFixed(1)}h of ${(grandTotal / 60).toFixed(1)}h total growth time in ${label.toLowerCase()} — ${pct}% of all focus hours.`,
        confidence: conf(growthLogs.length, mins / grandTotal, recency),
        stability:  stab,
        sampleSize: growthLogs.length,
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
    const active   = activeWeeks.size;
    const rate     = Math.min(active / WEEKS_IN_WINDOW, 1);
    const pct      = Math.round(rate * 100);
    const recency  = recencyOf(growthDates, todayMs);
    const oldWeeks = new Set<string>();
    const newWeeks = new Set<string>();
    for (const g of growthLogs) {
      const age    = daysAgo(g.date);
      const dow    = isoDow(g.date);
      const monday = new Date(utcMs(g.date) - dow * MS_PER_DAY).toISOString().split("T")[0];
      (age > 45 ? oldWeeks : newWeeks).add(monday);
    }
    const stab = round2(clamp(1.0 - Math.abs(oldWeeks.size / 6.5 - newWeeks.size / 6.5), 0.20, 0.95));
    const growthType: InsightType = rate >= 0.70 ? "strength" : rate >= 0.40 ? "habit" : "warning";
    growthConsistency = ok({
      type: growthType,
      pattern:    `Growth activities logged in ${pct}% of weeks — ${active} of the last ${WEEKS_IN_WINDOW} weeks.`,
      evidence:   `Growth logged in ${active} of the last ${WEEKS_IN_WINDOW} calendar weeks (${pct}% weekly consistency).`,
      confidence: conf(growthLogs.length, rate, recency),
      stability:  stab,
      sampleSize: growthLogs.length,
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
    const stab      = reasonStability(skipReasons, reason, todayMs);
    const skipSorted = [...skipReasons].sort((a, b) => a.date.localeCompare(b.date));
    const evN        = Math.min(10, skipSorted.length);
    const evCount    = skipSorted.slice(-evN).filter((s) => s.reason === reason).length;
    const REASON_LABEL: Record<SkipReason, string> = {
      fatigue: "Fatigue", injury: "Injury", busy: "Being too busy",
      travel: "Travel", motivation: "Low motivation", weather: "Weather",
      unknown: "Unknown reasons",
    };
    const LABEL: Record<SkipReason, string> = {
      fatigue: "fatigue", injury: "injury", busy: "being too busy",
      travel: "travel", motivation: "low motivation", weather: "weather",
      unknown: "unrecorded reasons",
    };
    topSkipReason = ok({
      type:       "warning",
      pattern:    `${pct}% of skipped sessions are attributed to ${LABEL[reason]}.`,
      evidence:   `${REASON_LABEL[reason]} caused ${evCount} of your last ${evN} recorded skips.`,
      confidence: conf(skipReasons.length, count / skipReasons.length, recency),
      stability:  stab,
      sampleSize: skipReasons.length,
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
    const stab      = skipRateStability(skipReasons.map((s) => s.date), completedDateArr, todayMs);
    const freqType: InsightType = rate < 0.10 ? "strength" : rate >= 0.25 ? "warning" : "habit";
    skipFrequency = ok({
      type: freqType,
      pattern: rate < 0.10
        ? `Excellent adherence — only ${pct}% of training sessions are skipped.`
        : rate < 0.25
        ? `${pct}% skip rate — within a healthy range but worth monitoring.`
        : `Elevated skip rate detected — ${pct}% of planned sessions were missed.`,
      evidence:   `${skipReasons.length} skips in ${totalAttempts} planned sessions over 90 days — a ${pct}% miss rate.`,
      confidence: conf(totalAttempts, strength, recency),
      stability:  stab,
      sampleSize: totalAttempts,
    });
  }

  // ── Skip: skipDayPattern ───────────────────────────────────────────────────

  let skipDayPattern: InsightResult;
  if (skipReasons.length < MIN_SAMPLES) {
    skipDayPattern = noData(skipReasons.length);
  } else {
    const skipDates = skipReasons.map((s) => s.date).sort();
    const freq      = dowFreq(skipDates);
    const total     = freq.reduce((s, v) => s + v, 0);
    const worst     = argMax(freq);
    const count     = freq[worst];
    const pct       = Math.round((count / total) * 100);
    const strength  = count / total;
    const recency   = recencyOf(skipDates, todayMs);
    const stab      = dowStability(skipDates, worst, todayMs);
    const evN       = Math.min(10, skipDates.length);
    const evCount   = skipDates.slice(-evN).filter((d) => isoDow(d) === worst).length;
    const skipType: InsightType = strength > 0.35 ? "warning" : "habit";
    skipDayPattern = ok({
      type: skipType,
      pattern: strength > 0.35
        ? `${DAYS[worst]} accounts for ${pct}% of all skips — a recurring pattern worth addressing.`
        : `Skips are spread across the week — no single day consistently disrupts training.`,
      evidence: strength > 0.35
        ? `${evCount} of your last ${evN} skips occurred on ${DAYS[worst]} — ${pct}% of all missed sessions.`
        : `${count} of ${total} recorded skips on ${DAYS[worst]} — skips distributed across the week.`,
      confidence: conf(total, strength, recency),
      stability:  stab,
      sampleSize: total,
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

  const lines: string[] = [`## Learned behavioral patterns (Phase 6C.9)`];

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
          `[${result.type.toUpperCase()}] ${label}: ${result.pattern} ` +
          `(conf ${Math.round(result.confidence * 100)}%, stab ${Math.round(result.stability * 100)}%, n=${result.sampleSize}) ` +
          `— Evidence: ${result.evidence}`,
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
