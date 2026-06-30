/**
 * Prediction Engine — Phase 5C.1
 *
 * Pure deterministic forecast engine. No I/O. No network. No React.
 * Same inputs always produce the same output.
 *
 * Mathematical models:
 *   CTL/ATL projection   — Banister EMA forward-iteration at constant daily TSS
 *   Race time prediction — Threshold pace baseline + CTL-delta improvement factor
 *   Weight projection    — Ordinary least-squares regression on recent weight logs
 *   Fatigue / injury     — Weighted multi-signal risk scoring
 *   Goal probability     — Progress-pace × physiological readiness composite
 *   Confidence           — Data completeness + training history depth
 *
 * Performance: executes in < 1 ms for a typical athlete.
 * No O(n²) algorithms; all loops are O(n) with bounded n.
 */

// ── Private utilities ──────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function safeConf(raw: number): number {
  return Math.round(clamp(raw, 0.40, 0.98) * 100) / 100;
}

// ── Public types ───────────────────────────────────────────────────────────

export interface PredictionValue {
  value:      number;
  confidence: number;   // 0–1
  reason:     string;
}

export type RiskLevel   = "LOW" | "MEDIUM" | "HIGH";
export type DataQuality = "LOW" | "MEDIUM" | "HIGH";

export interface RiskAssessment {
  level:  RiskLevel;
  score:  number;   // raw risk score (useful for debugging)
  reason: string;
}

// ── Input ──────────────────────────────────────────────────────────────────

export interface PredictionInput {
  // Banister training load state
  ctl: number;   // Chronic Training Load (42-day EMA)
  atl: number;   // Acute Training Load  (7-day EMA)
  tsb: number;   // Training Stress Balance (CTL − ATL)

  // This week's actuals
  weeklyRunKm:        number;
  longRunKm:          number | null;
  weeklyLiftSessions: number;
  weeklyGrowthHours:  number;
  avgPaceSecPerKm:    number | null;   // from recent runs

  // Physiological state (null if no check-in)
  readinessScore:    number | null;
  recoveryScore:     number | null;
  avgSleepQuality7d: number | null;
  avgFatigue7d:      number | null;

  // This week's plan targets (from adaptive goals + planner)
  planWeeklyKm:         number;
  planIntensityLabel:   "Easy" | "Moderate" | "Hard" | "Peak";
  planWeeklyGrowthHours: number;
  planLiftSessions:     number;

  // User's profile goals (0 = not set)
  userRunKmGoal: number;
  userGymGoal:   number;

  // Recent weight logs — most-recent first
  recentWeights: { weight: number; date: string }[];

  // History depth (for confidence calibration)
  totalSessionCount: number;

  // Profile
  thresholdPaceSecPerKm: number | null;   // 5:30/km → 330

  // Date context
  today: string;   // "YYYY-MM-DD"
}

// ── Output ─────────────────────────────────────────────────────────────────

export interface PredictionOutput {
  performance: {
    predictedCTL14:     PredictionValue;
    predictedCTL30:     PredictionValue;
    predicted5KMin:     PredictionValue | null;   // race-time in decimal minutes
    predicted10KMin:    PredictionValue | null;
    predictedWeeklyKm:  PredictionValue;
  };
  body: {
    predictedWeight4Weeks: PredictionValue | null;
    recoveryTrend:         PredictionValue;
  };
  growth: {
    predictedWeeklyHours: PredictionValue;
    consistencyScore:     PredictionValue;   // 0–100
  };
  goals: {
    runningGoalProbability:  PredictionValue;   // 0–100
    strengthGoalProbability: PredictionValue;
    growthGoalProbability:   PredictionValue;
    overallAdherence:        PredictionValue;
  };
  risk: {
    fatigueRisk: RiskAssessment;
    injuryRisk:  RiskAssessment;
  };
  meta: {
    confidence:   number;        // 0–1
    dataQuality:  DataQuality;
    explanation:  string;
  };
}

// ── CTL projection ─────────────────────────────────────────────────────────

const K_CTL = Math.exp(-1 / 42);

// TSS per km varies by planned intensity label
const TSS_PER_KM: Record<string, number> = {
  Easy:     4.5,
  Moderate: 5.5,
  Hard:     6.5,
  Peak:     7.5,
};

function estimateDailyTSS(planKm: number, intensity: string, liftSessions: number): number {
  const runTSS  = planKm * (TSS_PER_KM[intensity] ?? 5.5);
  const liftTSS = liftSessions * 45;   // ~45 TSS per strength session
  return (runTSS + liftTSS) / 7;
}

// Banister EMA forward projection at constant daily TSS:
//   CTL(n) = CTL(0) × k^n  +  avgDailyTSS × (1 − k^n)
function projectCTL(ctlNow: number, dailyTSS: number, days: number): number {
  const decay = Math.pow(K_CTL, days);
  return ctlNow * decay + dailyTSS * (1 - decay);
}

function buildCTLPredictions(input: PredictionInput, baseConf: number): {
  ctl14: PredictionValue;
  ctl30: PredictionValue;
  ctl14Raw: number;
  ctl30Raw: number;
} {
  const dailyTSS = estimateDailyTSS(
    input.planWeeklyKm,
    input.planIntensityLabel,
    input.planLiftSessions,
  );

  const ctl14Raw = round1(projectCTL(input.ctl, dailyTSS, 14));
  const ctl30Raw = round1(projectCTL(input.ctl, dailyTSS, 30));

  const delta14 = round1(ctl14Raw - input.ctl);
  const delta30 = round1(ctl30Raw - input.ctl);

  const dir14 = delta14 > 0 ? "rising" : delta14 < 0 ? "declining" : "stable";
  const dir30 = delta30 > 0 ? "rising" : delta30 < 0 ? "declining" : "stable";

  return {
    ctl14: {
      value:      ctl14Raw,
      confidence: safeConf(baseConf - 0.03),
      reason: `At ${input.planIntensityLabel.toLowerCase()} intensity (${input.planWeeklyKm} km/week), CTL is ${dir14} from ${input.ctl} → ${ctl14Raw} over 14 days (${delta14 >= 0 ? "+" : ""}${delta14}).`,
    },
    ctl30: {
      value:      ctl30Raw,
      confidence: safeConf(baseConf - 0.08),
      reason: `Holding current plan for 30 days projects CTL to ${ctl30Raw} (${delta30 >= 0 ? "+" : ""}${delta30} from ${input.ctl}). Assumes consistent training adherence.`,
    },
    ctl14Raw,
    ctl30Raw,
  };
}

// ── Race time prediction ───────────────────────────────────────────────────

// Current 5K/10K estimates from threshold or average pace.
// Threshold pace ≈ 10K race pace for most athletes.
// 5K pace ≈ threshold × 0.935 (roughly 6.5% faster than 10K pace).
export interface CurrentEstimates {
  estimated5KMin:  number | null;   // decimal minutes
  estimated10KMin: number | null;
}

export function computeCurrentEstimates(
  thresholdPaceSecPerKm: number | null,
  avgPaceSecPerKm: number | null,
): CurrentEstimates {
  const pace = thresholdPaceSecPerKm
    ?? (avgPaceSecPerKm ? avgPaceSecPerKm * 0.88 : null);   // easy → threshold

  if (!pace) return { estimated5KMin: null, estimated10KMin: null };

  return {
    estimated5KMin:  round1((pace * 0.935 * 5)  / 60),
    estimated10KMin: round1((pace * 10)           / 60),
  };
}

function buildRacePredictions(
  input:    PredictionInput,
  ctl14Raw: number,
  baseConf: number,
): { pred5K: PredictionValue | null; pred10K: PredictionValue | null } {
  const current = computeCurrentEstimates(
    input.thresholdPaceSecPerKm,
    input.avgPaceSecPerKm,
  );

  if (!current.estimated5KMin || !current.estimated10KMin) {
    return { pred5K: null, pred10K: null };
  }

  // Each 5 CTL units ≈ 1% race-pace improvement (conservative empirical model)
  const ctlDelta = ctl14Raw - input.ctl;
  const paceImproveFrac = clamp(ctlDelta / 500, -0.04, 0.04);

  const pred5KMin  = round1(current.estimated5KMin  * (1 - paceImproveFrac));
  const pred10KMin = round1(current.estimated10KMin * (1 - paceImproveFrac));

  const pctStr  = `${Math.abs(Math.round(paceImproveFrac * 1000) / 10)}%`;
  const dir     = paceImproveFrac > 0.001 ? `faster by ~${pctStr}` : paceImproveFrac < -0.001 ? `slower by ~${pctStr}` : "stable";
  const ctlNote = `CTL ${ctlDelta >= 0 ? "+" : ""}${round1(ctlDelta)} over 14 days`;
  const paceConf = safeConf(baseConf - (input.thresholdPaceSecPerKm ? 0.04 : 0.12));

  return {
    pred5K: {
      value:      pred5KMin,
      confidence: paceConf,
      reason: `${ctlNote} → estimated 5K ${dir}. Threshold pace is the primary input.`,
    },
    pred10K: {
      value:      pred10KMin,
      confidence: paceConf,
      reason: `${ctlNote} → estimated 10K ${dir}. Based on threshold pace projection.`,
    },
  };
}

// ── Weekly km projection ───────────────────────────────────────────────────

function buildKmPrediction(input: PredictionInput, baseConf: number): PredictionValue {
  // Current adherence ratio: actual vs plan (bounded to [0.5, 1.1])
  const safeBase = Math.max(input.weeklyRunKm, 1);
  const adherence = clamp(safeBase / Math.max(input.planWeeklyKm, safeBase), 0.5, 1.1);

  // Project next week at adherence-adjusted plan (slight optimism factor +0.05)
  const projected = round1(input.planWeeklyKm * clamp(adherence + 0.05, 0.55, 1.05));

  const gapKm = round1(input.planWeeklyKm - input.weeklyRunKm);
  const reason = input.weeklyRunKm >= input.planWeeklyKm
    ? `Currently matching or exceeding the ${input.planWeeklyKm} km plan — projecting ${projected} km next week.`
    : `Projecting ${projected} km next week. Plan is ${input.planWeeklyKm} km; ${gapKm > 0 ? `${gapKm} km gap` : "on track"} from current ${round1(input.weeklyRunKm)} km.`;

  return { value: projected, confidence: safeConf(baseConf - 0.05), reason };
}

// ── Weight trend (OLS linear regression) ──────────────────────────────────

function buildWeightPrediction(weights: { weight: number; date: string }[]): PredictionValue | null {
  if (weights.length < 5) return null;

  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = new Date(sorted[0].date + "T00:00:00").getTime();

  const pts = sorted.map((w) => ({
    x: (new Date(w.date + "T00:00:00").getTime() - t0) / 86400000,
    y: w.weight,
  }));

  const n    = pts.length;
  const sumX  = pts.reduce((s, p) => s + p.x, 0);
  const sumY  = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = pts.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;

  if (Math.abs(denom) < 1e-6) return null;

  const slope     = (n * sumXY - sumX * sumY) / denom;   // kg/day
  const latestW   = sorted[sorted.length - 1].weight;
  const projected = Math.round((latestW + clamp(slope * 28, -2.5, 2.5)) * 10) / 10;

  const weeklyDelta = round1(slope * 7);
  const trend = Math.abs(slope) < 0.015
    ? "stable"
    : slope > 0
    ? `gaining ~${weeklyDelta} kg/week`
    : `losing ~${Math.abs(weeklyDelta)} kg/week`;

  return {
    value:      projected,
    confidence: safeConf(n >= 10 ? 0.78 : n >= 7 ? 0.68 : 0.57),
    reason: `Weight is ${trend}. 4-week projection from ${latestW} kg current; capped at ±2.5 kg to prevent extrapolation.`,
  };
}

// ── Recovery trend ─────────────────────────────────────────────────────────

function buildRecoveryTrend(input: PredictionInput, ctl14Raw: number): PredictionValue {
  const rc = input.recoveryScore ?? 60;

  // TSB trajectory: rising TSB improves recovery, falling TSB suppresses it
  const tsbDir   = input.tsb < -15 ? -1 : input.tsb > 5 ? 1 : 0;
  const ctlGain  = clamp((ctl14Raw - input.ctl) * 0.5, -6, 6);
  const delta    = tsbDir * 8 + ctlGain;
  const projected = Math.round(clamp(rc + delta, 20, 95));

  const reason = projected > rc + 4
    ? "Recovery is projected to improve — planned rest days and positive TSB trajectory allow absorption of recent load."
    : projected < rc - 4
    ? "Recovery is likely to decline — high training load without deload risks suppressing physiological readiness."
    : "Recovery is expected to remain stable given the balance between training stimulus and planned rest.";

  return {
    value:      projected,
    confidence: safeConf(input.recoveryScore !== null ? 0.70 : 0.52),
    reason,
  };
}

// ── Growth projection ──────────────────────────────────────────────────────

function buildGrowthPredictions(input: PredictionInput): {
  weeklyHours: PredictionValue;
  consistency: PredictionValue;
} {
  const current  = input.weeklyGrowthHours;
  const planned  = Math.max(input.planWeeklyGrowthHours, 0.5);
  const adherence = current > 0 ? clamp(current / planned, 0.30, 1.20) : 0.5;

  // Next-week projection: adherence-adjusted plan with slight improvement
  const projected = round1(planned * clamp(adherence + 0.05, 0.40, 1.10));

  const consistencyPct = Math.round(clamp(adherence * 100, 10, 98));

  const hoursReason = current >= planned
    ? `Growth is on track (${round1(current)}h actual vs ${round1(planned)}h plan) — projecting ${projected}h next week.`
    : `${round1(current)}h logged vs ${round1(planned)}h target. Projecting ${projected}h next week based on current adherence pattern.`;

  const consReason = adherence >= 0.90
    ? "Excellent growth consistency — output closely matches the weekly plan."
    : adherence >= 0.70
    ? "Moderate consistency — some variability in growth output, but trend is positive."
    : "Growth consistency needs attention — significant gap between planned and actual output.";

  return {
    weeklyHours: { value: projected, confidence: safeConf(0.68), reason: hoursReason },
    consistency: { value: consistencyPct, confidence: safeConf(0.63), reason: consReason },
  };
}

// ── Goal probability ───────────────────────────────────────────────────────

// ISO day-of-week index: 0 = Monday, 6 = Sunday
function dowIndex(dateStr: string): number {
  const dow = new Date(dateStr + "T00:00:00").getDay();   // 0=Sun … 6=Sat
  return dow === 0 ? 6 : dow - 1;
}

function buildGoalPredictions(input: PredictionInput): PredictionOutput["goals"] {
  const dayIdx      = dowIndex(input.today);
  const weekFrac    = clamp((dayIdx + 1) / 7, 1 / 7, 1);   // 1/7 on Mon, 1.0 on Sun

  const readFactor = clamp((input.readinessScore ?? 55) / 100, 0.30, 1.0);
  const tsbFactor  = clamp((input.tsb + 30) / 60, 0.20, 1.0);
  const formFactor = readFactor * 0.5 + tsbFactor * 0.5;

  // ── Running ──────────────────────────────────────────────────────────────
  const runTarget  = input.userRunKmGoal > 0 ? input.userRunKmGoal : input.planWeeklyKm;
  const runOnPace  = runTarget > 0 ? (input.weeklyRunKm / runTarget) / weekFrac : 0.5;
  const runProb    = clamp(runOnPace * 0.60 + formFactor * 0.30 + 0.10, 0.05, 0.98);
  const remaining  = round1(Math.max(0, runTarget - input.weeklyRunKm));
  const runReason  = runOnPace >= 1.0
    ? `Ahead of weekly pace (${round1(input.weeklyRunKm)}/${runTarget} km) — strong probability of hitting the target.`
    : remaining > 0
    ? `${remaining} km remaining to reach the ${runTarget} km target; ${runOnPace >= 0.85 ? "on track" : "behind pace"}.`
    : `Weekly run target already met (${round1(input.weeklyRunKm)} km).`;

  // ── Strength ─────────────────────────────────────────────────────────────
  const gymTarget  = input.userGymGoal > 0 ? input.userGymGoal : input.planLiftSessions;
  const gymOnPace  = gymTarget > 0 ? (input.weeklyLiftSessions / gymTarget) / weekFrac : 0.5;
  const gymProb    = clamp(gymOnPace * 0.65 + tsbFactor * 0.25 + 0.10, 0.05, 0.98);
  const gymLeft    = Math.max(0, gymTarget - input.weeklyLiftSessions);
  const gymReason  = gymLeft === 0
    ? `Gym sessions completed for the week (${input.weeklyLiftSessions}/${gymTarget}).`
    : `${gymLeft} session${gymLeft > 1 ? "s" : ""} remaining to reach ${gymTarget} for the week.`;

  // ── Growth ────────────────────────────────────────────────────────────────
  const growthTarget  = Math.max(input.planWeeklyGrowthHours, 1);
  const growthOnPace  = (input.weeklyGrowthHours / growthTarget) / weekFrac;
  const growthProb    = clamp(growthOnPace * 0.60 + 0.30, 0.15, 0.98);
  const growthLeft    = round1(Math.max(0, growthTarget - input.weeklyGrowthHours));
  const growthReason  = growthLeft === 0
    ? `Growth hours target met (${round1(input.weeklyGrowthHours)}h).`
    : `${growthLeft}h needed to reach the ${round1(growthTarget)}h weekly growth target.`;

  // ── Overall ───────────────────────────────────────────────────────────────
  const overall = round1(clamp(runProb * 0.40 + gymProb * 0.30 + growthProb * 0.30, 0.10, 0.97) * 100);

  const fmt = (v: number) => Math.round(v * 100);

  return {
    runningGoalProbability:  { value: fmt(runProb),    confidence: safeConf(0.72), reason: runReason },
    strengthGoalProbability: { value: fmt(gymProb),    confidence: safeConf(0.68), reason: gymReason },
    growthGoalProbability:   { value: fmt(growthProb), confidence: safeConf(0.64), reason: growthReason },
    overallAdherence: {
      value:      overall,
      confidence: safeConf(0.70),
      reason: `Composite of running (${fmt(runProb)}%), strength (${fmt(gymProb)}%), and growth (${fmt(growthProb)}%) goal probabilities.`,
    },
  };
}

// ── Fatigue risk ───────────────────────────────────────────────────────────

function buildFatigueRisk(input: PredictionInput): RiskAssessment {
  let score = 0;

  // TSB (primary fatigue signal)
  if      (input.tsb < -25) score += 4;
  else if (input.tsb < -15) score += 3;
  else if (input.tsb < -5)  score += 1;

  // Recovery
  const rc = input.recoveryScore;
  if      (rc !== null && rc < 40) score += 3;
  else if (rc !== null && rc < 60) score += 1;

  // Readiness
  const rs = input.readinessScore;
  if      (rs !== null && rs < 40) score += 2;
  else if (rs !== null && rs < 55) score += 1;

  // Subjective fatigue (daily log)
  const ft = input.avgFatigue7d;
  if      (ft !== null && ft > 8) score += 2;
  else if (ft !== null && ft > 6) score += 1;

  // Planned load increase vs current
  const safeBase = Math.max(input.weeklyRunKm, 5);
  const loadIncrease = (input.planWeeklyKm - input.weeklyRunKm) / safeBase;
  if (loadIncrease > 0.20) score += 1;

  const level: RiskLevel = score >= 6 ? "HIGH" : score >= 3 ? "MEDIUM" : "LOW";

  const reason = level === "HIGH"
    ? `Multiple fatigue signals elevated — TSB ${input.tsb}, recovery ${rc ?? "—"}/100. Prioritise rest before next hard session.`
    : level === "MEDIUM"
    ? `Moderate fatigue accumulation detected (TSB ${input.tsb}). Monitor closely; avoid adding load this week.`
    : `Fatigue markers within acceptable range (TSB ${input.tsb}). Continue as planned with attention to sleep quality.`;

  return { level, score, reason };
}

// ── Injury risk ────────────────────────────────────────────────────────────

function buildInjuryRisk(input: PredictionInput): RiskAssessment {
  let score = 0;

  // Rapid load increase — primary injury predictor
  const safeBase = Math.max(input.weeklyRunKm, 5);
  const loadIncrease = (input.planWeeklyKm - input.weeklyRunKm) / safeBase;
  if      (loadIncrease > 0.30) score += 4;
  else if (loadIncrease > 0.20) score += 3;
  else if (loadIncrease > 0.12) score += 1;

  // Negative TSB compounds mechanical load on connective tissue
  if      (input.tsb < -20) score += 3;
  else if (input.tsb < -10) score += 1;

  // Low recovery = poor tissue repair
  const rc = input.recoveryScore;
  if      (rc !== null && rc < 40) score += 2;
  else if (rc !== null && rc < 55) score += 1;

  // High subjective fatigue
  const ft = input.avgFatigue7d;
  if (ft !== null && ft > 8) score += 1;

  const level: RiskLevel = score >= 6 ? "HIGH" : score >= 3 ? "MEDIUM" : "LOW";

  const loadPct = Math.round(loadIncrease * 100);
  const reason = level === "HIGH"
    ? `High injury risk — ${loadPct > 12 ? `planned load increase of ${loadPct}%` : `sustained negative form (TSB ${input.tsb})`} with low recovery. Reduce volume before progressing.`
    : level === "MEDIUM"
    ? `Moderate injury risk from ${loadPct > 12 ? `${loadPct}% load increase` : `negative TSB (${input.tsb})`}. Monitor for early warning signs (soreness, stiffness).`
    : "Injury risk is low — load progression and recovery signals are within safe parameters.";

  return { level, score, reason };
}

// ── Confidence model ───────────────────────────────────────────────────────

function buildConfidence(input: PredictionInput): { confidence: number; quality: DataQuality } {
  let base = 0.50;

  // Training history depth
  if      (input.totalSessionCount >= 20) base += 0.22;
  else if (input.totalSessionCount >= 10) base += 0.14;
  else if (input.totalSessionCount >= 4)  base += 0.07;

  // Data richness bonuses
  if (input.avgPaceSecPerKm !== null)       base += 0.06;
  if (input.thresholdPaceSecPerKm !== null) base += 0.04;
  if (input.readinessScore !== null)        base += 0.05;
  if (input.recoveryScore !== null)         base += 0.04;
  if (input.recentWeights.length >= 7)      base += 0.03;
  if (input.avgFatigue7d !== null)          base += 0.03;

  const c       = clamp(base, 0.40, 0.95);
  const quality: DataQuality = c >= 0.74 ? "HIGH" : c >= 0.60 ? "MEDIUM" : "LOW";

  return { confidence: Math.round(c * 100) / 100, quality };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute deterministic performance predictions from the current athlete state.
 *
 * This is a pure function. No I/O. No side effects.
 * All inputs must be pre-computed by the caller from existing engines.
 * Executes in under 1 ms for a typical athlete.
 */
export function computePredictions(input: PredictionInput): PredictionOutput {
  const { confidence: baseConf, quality } = buildConfidence(input);

  // CTL projections (used by downstream models)
  const { ctl14, ctl30, ctl14Raw } = buildCTLPredictions(input, baseConf);

  // Performance
  const { pred5K, pred10K } = buildRacePredictions(input, ctl14Raw, baseConf);
  const weeklyKm = buildKmPrediction(input, baseConf);

  // Body
  const weightPred   = buildWeightPrediction(input.recentWeights);
  const recoveryTrend = buildRecoveryTrend(input, ctl14Raw);

  // Growth
  const { weeklyHours, consistency } = buildGrowthPredictions(input);

  // Goals
  const goals = buildGoalPredictions(input);

  // Risk
  const fatigueRisk = buildFatigueRisk(input);
  const injuryRisk  = buildInjuryRisk(input);

  // Meta
  const explanation = quality === "HIGH"
    ? `Predictions based on ${input.totalSessionCount}+ sessions with full physiological data. Confidence is high.`
    : quality === "MEDIUM"
    ? `Predictions use available data (${input.totalSessionCount} sessions). Add daily check-ins and weight logs to improve accuracy.`
    : `Limited training history (${input.totalSessionCount} sessions). Log consistently for 2–3 weeks to unlock precise forecasting.`;

  return {
    performance: {
      predictedCTL14:    ctl14,
      predictedCTL30:    ctl30,
      predicted5KMin:    pred5K,
      predicted10KMin:   pred10K,
      predictedWeeklyKm: weeklyKm,
    },
    body: {
      predictedWeight4Weeks: weightPred,
      recoveryTrend,
    },
    growth: {
      predictedWeeklyHours: weeklyHours,
      consistencyScore:     consistency,
    },
    goals,
    risk: { fatigueRisk, injuryRisk },
    meta: { confidence: baseConf, dataQuality: quality, explanation },
  };
}

// ── Display helpers ────────────────────────────────────────────────────────

/** Convert decimal minutes to "mm:ss" string. e.g. 23.75 → "23:45" */
export function formatMinutes(decimalMin: number): string {
  const m = Math.floor(decimalMin);
  const s = Math.round((decimalMin - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function riskColor(level: RiskLevel): string {
  if (level === "HIGH")   return "var(--red)";
  if (level === "MEDIUM") return "var(--yellow)";
  return "var(--green)";
}
