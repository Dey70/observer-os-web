/**
 * Adaptive Goal Engine — Phase 5A
 *
 * Deterministic weekly goal recommendations computed from existing
 * physiological and performance signals. No network calls. No DB writes.
 * A pure function: same inputs always produce the same output.
 *
 * Core invariant: at most ONE domain receives a major progression signal
 * per week. Recovery and nutrition overrides take absolute priority over
 * any training progression.
 *
 * Data flow:
 *   Dashboard / Profile → AdaptiveGoalInput → computeAdaptiveGoals() → AdaptiveGoalOutput
 *   CoachContext → buildAdaptiveGoalsBlock() → system prompt
 */

// ── Input ──────────────────────────────────────────────────────────────────

export interface AdaptiveGoalInput {
  // Banister training load model
  ctl: number;    // Chronic Training Load   (42-day EMA of TSS)
  atl: number;    // Acute Training Load      (7-day EMA of TSS)
  tsb: number;    // Training Stress Balance  (CTL − ATL, "form")

  // Physiological state — null when no check-in logged today
  readinessScore: number | null;  // 0–100 composite (recovery × load × sleep × energy)
  recoveryScore:  number | null;  // 0–100 from today's log + TSB

  // Today's subjective check-in — null when no check-in
  sleepQuality: number | null;  // 1–10
  fatigue:      number | null;  // 1–10
  soreness:     number | null;  // 1–10
  energy:       number | null;  // 1–10

  // 7-day rolling averages — null if fewer than 3 daily logs available
  avgSleepQuality7d: number | null;
  avgFatigue7d:      number | null;
  avgEnergy7d:       number | null;

  // Hybrid Athlete composite scores
  hybridScore:           number;   // 0–100 overall
  hybridGrowthComponent: number;   // 0–100, growth pillar only

  // This week's actuals
  weeklyRunKm:        number;
  weeklyRunCount:     number;
  weeklyLiftSessions: number;
  weeklyGrowthHours:  number;
  weeklyGrowthCategories: {
    study:     number;  // hours
    project:   number;
    learning:  number;
    deep_work: number;
  };

  // Nutrition actuals — null if not tracked this week
  avgDailyCalories: number | null;
  avgDailyProtein:  number | null;

  // Profile-derived targets (from calculateDailyTargets or profile defaults)
  proteinTargetG:    number;
  calorieTargetKcal: number | null;
  waterTargetMl:     number;

  // User-defined weekly goals from profile (0 = not set)
  userRunKmGoal:    number;
  userRunCountGoal: number;
  userGymGoal:      number;
}

// ── Output ─────────────────────────────────────────────────────────────────

export interface GoalRecommendation {
  value:      number;
  unit:       string;
  confidence: number;  // 0.50–0.98, 2 decimal places
  reason:     string;
}

export type IntensityLabel = "Easy" | "Moderate" | "Hard" | "Peak";

export interface AdaptiveGoalOutput {
  running: {
    weeklyKm:   GoalRecommendation;
    weeklyRuns: GoalRecommendation;
    intensity:  GoalRecommendation & { label: IntensityLabel };
  };
  strength: {
    weeklySessions: GoalRecommendation;
  };
  growth: {
    weeklyHours:      GoalRecommendation;
    categoryEmphasis: {
      category: keyof AdaptiveGoalInput["weeklyGrowthCategories"];
      label:    string;
      reason:   string;
    };
  };
  nutrition: {
    calories:    GoalRecommendation;
    protein:     GoalRecommendation;
    hydrationMl: GoalRecommendation;
  };
  recovery: {
    sleepHours:   GoalRecommendation;
    recoveryDays: GoalRecommendation;
  };
  // Engine meta
  primaryProgression: "running" | "strength" | "growth" | "nutrition" | "recovery" | null;
  weekSummary: string;
}

// ── Private utilities ──────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Clamp a raw confidence value to the valid range [0.50, 0.98]. */
function conf(raw: number): number {
  return Math.round(clamp(raw, 0.50, 0.98) * 100) / 100;
}

// ── Domain scoring ─────────────────────────────────────────────────────────

type Domain = "running" | "strength" | "growth" | "nutrition" | "recovery";

/**
 * Assigns a priority score to each domain.
 * Higher score = stronger justification for this week's progression.
 *
 * Recovery >= 8 blocks ALL training progressions.
 * Nutrition >= 5 blocks training progressions until protein intake improves.
 *
 * Growth is scored independently of training load — intellectual output does
 * not compete with physical output for the same physiological resources.
 */
function scoreDomains(input: AdaptiveGoalInput): Record<Domain, number> {
  const rs = input.readinessScore ?? 50;
  const rc = input.recoveryScore  ?? 50;
  const sq = input.sleepQuality   ?? input.avgSleepQuality7d ?? 7;
  const ft = input.fatigue        ?? input.avgFatigue7d       ?? 5;

  const scores: Record<Domain, number> = {
    recovery:  0,
    nutrition: 0,
    running:   0,
    strength:  0,
    growth:    0,
  };

  // ── Recovery (overrides training when score >= 8) ──────────────────────
  if (rc < 40 || rs < 40 || input.tsb < -25)     scores.recovery = 10;
  else if (rc < 50 || input.tsb < -20)            scores.recovery = 9;
  else if (rc < 60 || input.tsb < -15)            scores.recovery = 8;
  else if (sq < 5  || ft >= 8)                    scores.recovery = 6;
  else if ((input.avgSleepQuality7d ?? 7) < 5.5)  scores.recovery = 5;

  // ── Nutrition (blocks training when score >= 5) ────────────────────────
  const pa = input.avgDailyProtein != null
    ? input.avgDailyProtein / input.proteinTargetG
    : null;

  if      (pa != null && pa < 0.70) scores.nutrition = 8;
  else if (pa != null && pa < 0.80) scores.nutrition = 5;
  else if (pa != null && pa < 0.90) scores.nutrition = 2;

  const trainingBlocked = scores.recovery >= 8 || scores.nutrition >= 5;

  if (!trainingBlocked) {
    // ── Running progression ─────────────────────────────────────────────
    if      (rs >= 80 && input.tsb >= 5)  scores.running = 5;
    else if (rs >= 75 && input.tsb >= 0)  scores.running = 4;
    else if (rs >= 65 && input.tsb >= -5) scores.running = 2;

    // ── Strength progression ────────────────────────────────────────────
    // A gym progression day is scored lower when running is already the
    // primary progression to enforce the one-domain-at-a-time rule.
    if (rs >= 65 && input.tsb >= -10) {
      scores.strength = scores.running > 2 ? 1 : 3;
    }
  }

  // ── Growth (independent of physical load state) ────────────────────────
  // Blocked only when recovery is critical (score >= 8).
  if (scores.recovery < 8) {
    const gh = input.weeklyGrowthHours;
    const gc = input.hybridGrowthComponent;

    if      (gh < 3)       scores.growth = 6;
    else if (gc < 40)      scores.growth = 5;
    else if (gh < 7)       scores.growth = 4;
    else if (gc < 55)      scores.growth = 3;
    else if (gh < 12)      scores.growth = 2;
  }

  return scores;
}

function selectPrimary(scores: Record<Domain, number>): Domain | null {
  let best:      Domain | null = null;
  let bestScore  = 0;
  for (const [d, s] of Object.entries(scores) as [Domain, number][]) {
    if (s > bestScore) { bestScore = s; best = d; }
  }
  return bestScore > 0 ? best : null;
}

// ── Running ────────────────────────────────────────────────────────────────

function intensityBlock(
  input:   AdaptiveGoalInput,
  primary: Domain | null,
): GoalRecommendation & { label: IntensityLabel } {
  const rs  = input.readinessScore ?? 50;
  const tsb = input.tsb;

  let label: IntensityLabel = "Moderate";
  let reason = "";
  let rawConf = 0.82;

  if (primary === "recovery" || tsb < -20 || rs < 45) {
    label   = "Easy";
    reason  = "Body is in recovery — keep all runs in Zone 1–2. No threshold or interval work this week.";
    rawConf = 0.93;
  } else if (tsb >= 10 && rs >= 80) {
    label   = "Peak";
    reason  = "Peak training form — schedule one high-intensity session (intervals or race-pace effort) this week.";
    rawConf = 0.90;
  } else if (tsb >= 0 && rs >= 70) {
    label   = "Hard";
    reason  = "Good form and solid recovery — one quality session (tempo run or track intervals) is appropriate.";
    rawConf = 0.85;
  } else if (tsb >= -10 && rs >= 55) {
    label   = "Moderate";
    reason  = "Some training fatigue present — one moderate-effort session; keep remaining runs in Zone 2.";
    rawConf = 0.79;
  } else {
    label   = "Easy";
    reason  = "Fatigue is elevated — all runs should stay in Zone 2 to facilitate recovery and CTL maintenance.";
    rawConf = 0.83;
  }

  if (input.readinessScore === null) rawConf -= 0.10;

  return { value: 0, unit: "", confidence: conf(rawConf), reason, label };
}

function recommendRunning(
  input:   AdaptiveGoalInput,
  primary: Domain | null,
): AdaptiveGoalOutput["running"] {
  const rs = input.readinessScore ?? 50;
  const rc = input.recoveryScore  ?? 50;

  // Baseline: user's set goal is the authoritative target; fall back to this
  // week's actual if no goal has been configured.
  const baseKm   = input.userRunKmGoal    > 0 ? input.userRunKmGoal    : Math.max(input.weeklyRunKm,   10);
  const baseRuns = input.userRunCountGoal > 0 ? input.userRunCountGoal : Math.max(input.weeklyRunCount, 3);

  let kmFactor = 1.0;
  let kmReason = "Training load and recovery are balanced — maintain current weekly volume.";
  let rawConf  = 0.82;

  if (primary === "running") {
    if (rs >= 80 && input.tsb >= 5) {
      kmFactor = 1.12;
      kmReason = "Strong readiness and positive training form support a 12% volume increase this week.";
      rawConf  = 0.91;
    } else if (rs >= 75 && input.tsb >= 0) {
      kmFactor = 1.07;
      kmReason = "Readiness is high and form is neutral-to-positive — a 7% progressive overload is appropriate.";
      rawConf  = 0.87;
    } else {
      kmFactor = 1.05;
      kmReason = "Recovery data supports a conservative 5% volume increase.";
      rawConf  = 0.80;
    }
  } else if (primary === "recovery" || input.tsb < -20) {
    kmFactor = 0.80;
    kmReason = "Accumulated fatigue demands a volume reduction to absorb training load and prevent injury.";
    rawConf  = 0.92;
  } else if (input.tsb < -10) {
    kmFactor = 0.90;
    kmReason = "Training stress balance is negative — hold volume and prioritise quality over quantity.";
    rawConf  = 0.86;
  } else if ((input.sleepQuality ?? 7) < 5 || (input.avgSleepQuality7d ?? 7) < 5) {
    kmFactor = 0.93;
    kmReason = "Sleep quality is suppressing recovery — hold running volume until sleep improves.";
    rawConf  = 0.82;
  } else if (rc < 55) {
    kmFactor = 0.95;
    kmReason = "Recovery score is sub-optimal — maintain current volume rather than progressing this week.";
    rawConf  = 0.79;
  }

  if (input.readinessScore === null) rawConf -= 0.10;

  const recKm    = round1(Math.max(0, baseKm * kmFactor));
  const runDelta = kmFactor > 1.08 ? 1 : kmFactor < 0.88 ? -1 : 0;
  const recRuns  = clamp(Math.round(baseRuns + runDelta), 1, 14);

  const runsConf = conf(rawConf - 0.04);
  let runsReason = "Run frequency tracks the volume recommendation.";
  if (runDelta >  0) runsReason = "Increased volume supports one additional run this week.";
  if (runDelta < 0)  runsReason = "Reduced volume — drop one run to allow adequate inter-session recovery.";

  return {
    weeklyKm:   { value: recKm,   unit: "km",    confidence: conf(rawConf), reason: kmReason },
    weeklyRuns: { value: recRuns, unit: "runs",   confidence: runsConf,      reason: runsReason },
    intensity:  intensityBlock(input, primary),
  };
}

// ── Strength ───────────────────────────────────────────────────────────────

function recommendStrength(
  input:   AdaptiveGoalInput,
  primary: Domain | null,
): AdaptiveGoalOutput["strength"] {
  const rs   = input.readinessScore ?? 50;
  const base = input.userGymGoal > 0
    ? input.userGymGoal
    : Math.max(input.weeklyLiftSessions, 2);

  let sessions = base;
  let reason   = "Maintain current strength training frequency this week.";
  let rawConf  = 0.80;

  if (primary === "strength") {
    sessions = clamp(base + 1, 1, 7);
    reason   = "Readiness and training load support adding one additional strength session this week.";
    rawConf  = 0.85;
  } else if (primary === "recovery" || input.tsb < -15) {
    sessions = clamp(base - 1, 1, 7);
    reason   = "Accumulated fatigue — reduce gym frequency to allow full recovery. Retain compound lifts at reduced intensity.";
    rawConf  = 0.88;
  } else if (rs < 55) {
    reason   = "Readiness is below threshold — maintain volume but reduce intensity to 70–75% effort.";
    rawConf  = 0.74;
  } else if (primary === "running") {
    reason   = "Running is the primary progression this week — hold gym sessions at maintenance.";
    rawConf  = 0.83;
  }

  if (input.readinessScore === null) rawConf -= 0.08;

  return {
    weeklySessions: {
      value:      clamp(sessions, 1, 7),
      unit:       "sessions",
      confidence: conf(rawConf),
      reason,
    },
  };
}

// ── Growth ─────────────────────────────────────────────────────────────────

type GrowthCategory = keyof AdaptiveGoalInput["weeklyGrowthCategories"];

const GROWTH_LABELS: Record<GrowthCategory, string> = {
  study:     "Study",
  project:   "Project",
  learning:  "Learning",
  deep_work: "Deep Work",
};

function weakestCategory(cats: AdaptiveGoalInput["weeklyGrowthCategories"]): GrowthCategory {
  return (Object.entries(cats) as [GrowthCategory, number][])
    .reduce((min, cur) => cur[1] < min[1] ? cur : min)[0];
}

function recommendGrowth(
  input:   AdaptiveGoalInput,
  primary: Domain | null,
): AdaptiveGoalOutput["growth"] {
  const gh = input.weeklyGrowthHours;
  const gc = input.hybridGrowthComponent;
  const base = Math.max(gh, 5);

  let target  = base;
  let reason  = `Growth is on track at ${gh.toFixed(1)}h — maintain current schedule.`;
  let rawConf = 0.75;

  if (primary === "growth") {
    if (gh < 3) {
      target  = 8;
      reason  = "Growth output is critically low — block a minimum of 8 focused hours this week.";
      rawConf = 0.88;
    } else if (gc < 40) {
      target  = round1(base * 1.30);
      reason  = `Growth pillar score (${gc}) is weak — a 30% increase in focused work will materially lift the Hybrid Score.`;
      rawConf = 0.85;
    } else if (gh < 7) {
      target  = round1(base * 1.20);
      reason  = "Growth hours are below the high-performance threshold — schedule additional deep work blocks.";
      rawConf = 0.82;
    } else {
      target  = round1(base * 1.10);
      reason  = "Consistent growth — a 10% increase pushes toward the 15h elite-growth benchmark.";
      rawConf = 0.80;
    }
  } else if (primary === "recovery") {
    target  = round1(base * 0.85);
    reason  = "Prioritise physical recovery — reduce total growth hours and favour lighter cognitive tasks.";
    rawConf = 0.78;
  }

  const weakCat  = weakestCategory(input.weeklyGrowthCategories);
  const weakHrs  = input.weeklyGrowthCategories[weakCat];
  const catLabel = GROWTH_LABELS[weakCat];
  const catReason = weakHrs === 0
    ? `No ${catLabel.toLowerCase()} sessions logged this week — add at least one focused block.`
    : `${catLabel} has the fewest hours (${weakHrs.toFixed(1)}h) — one targeted session would balance the growth portfolio.`;

  return {
    weeklyHours: {
      value:      round1(Math.max(1, target)),
      unit:       "hours",
      confidence: conf(rawConf),
      reason,
    },
    categoryEmphasis: {
      category: weakCat,
      label:    catLabel,
      reason:   catReason,
    },
  };
}

// ── Nutrition ──────────────────────────────────────────────────────────────

function recommendNutrition(
  input:   AdaptiveGoalInput,
  primary: Domain | null,
): AdaptiveGoalOutput["nutrition"] {
  const calTarget  = input.calorieTargetKcal ?? 2500;
  const protTarget = input.proteinTargetG;
  const waterMl    = input.waterTargetMl;

  // ── Calories ──────────────────────────────────────────────────────────
  let calReason = `Hit your ${calTarget.toLocaleString()} kcal target daily — consistent fuelling supports adaptation.`;
  let calConf   = 0.78;

  if (primary === "nutrition" && input.avgDailyCalories != null) {
    const gap = calTarget - input.avgDailyCalories;
    if (gap > calTarget * 0.15) {
      calReason = `Avg intake (${Math.round(input.avgDailyCalories).toLocaleString()} kcal) is ${Math.round(gap).toLocaleString()} kcal below target — underfuelling directly suppresses recovery and adaptation.`;
      calConf   = 0.93;
    } else if (gap > 0) {
      calReason = `Intake is slightly below target (${Math.round(input.avgDailyCalories).toLocaleString()} kcal avg) — close the gap to sustain training demands.`;
      calConf   = 0.86;
    }
  } else if (input.avgDailyCalories == null) {
    calReason = "No nutrition data logged — track meals for 3+ days to unlock precise fuel recommendations.";
    calConf   = 0.60;
  }

  // ── Protein ───────────────────────────────────────────────────────────
  let protReason = `Target ${protTarget}g of protein daily — distribute across 4+ meals for optimal muscle protein synthesis.`;
  let protConf   = 0.80;

  if (input.avgDailyProtein != null) {
    const pa = input.avgDailyProtein / protTarget;
    if (primary === "nutrition" && pa < 0.70) {
      protReason = `Protein intake is critically low (avg ${Math.round(input.avgDailyProtein)}g vs ${protTarget}g target) — prioritise protein at every meal this week.`;
      protConf   = 0.96;
    } else if (pa < 0.85) {
      protReason = `Protein is below target (avg ${Math.round(input.avgDailyProtein)}g) — add a protein-rich snack between meals to close the gap.`;
      protConf   = 0.88;
    } else if (pa >= 0.95) {
      protReason = `Protein adherence is strong (avg ${Math.round(input.avgDailyProtein)}g) — maintain this consistency.`;
      protConf   = 0.90;
    }
  } else {
    protReason = "Log meals to track protein — it is the single highest-leverage nutrition metric for hybrid athletes.";
    protConf   = 0.62;
  }

  // ── Hydration ─────────────────────────────────────────────────────────
  const waterL      = (waterMl / 1000).toFixed(1);
  const waterReason = `Target ${waterL}L daily — increase by +250–500ml on training days and when temperature exceeds 28°C.`;

  return {
    calories:    { value: calTarget,  unit: "kcal", confidence: conf(calConf),  reason: calReason },
    protein:     { value: protTarget, unit: "g",    confidence: conf(protConf), reason: protReason },
    hydrationMl: { value: waterMl,    unit: "ml",   confidence: conf(0.88),     reason: waterReason },
  };
}

// ── Recovery ───────────────────────────────────────────────────────────────

function recommendRecovery(
  input:   AdaptiveGoalInput,
  primary: Domain | null,
): AdaptiveGoalOutput["recovery"] {
  const avgSQ = input.avgSleepQuality7d ?? input.sleepQuality ?? 7;
  const rc    = input.recoveryScore ?? 65;

  // ── Sleep hours ───────────────────────────────────────────────────────
  let sleepHrs    = 8.0;
  let sleepReason = "Aim for 8h per night — consistent sleep timing matters as much as raw duration.";
  let sleepConf   = 0.80;

  if (primary === "recovery" || avgSQ < 5 || rc < 50) {
    sleepHrs    = 8.5;
    sleepReason = "Recovery is compromised — prioritise 8.5h and eliminate screens at least 60 minutes before bed.";
    sleepConf   = 0.92;
  } else if (avgSQ < 6.5) {
    sleepReason = "Sleep quality is sub-optimal — a consistent wind-down routine will improve both quality and duration.";
    sleepConf   = 0.84;
  } else if (rc >= 80 && input.tsb >= 5) {
    sleepHrs    = 7.5;
    sleepReason = "Recovery is excellent — 7.5h is sufficient. Sleep quality matters more than marginal extra duration.";
    sleepConf   = 0.77;
  }

  // ── Recovery days ─────────────────────────────────────────────────────
  let restDays   = 1;
  let restReason = "One full rest or active-recovery day (yoga, walking) is appropriate this week.";
  let restConf   = 0.78;

  if (primary === "recovery" || input.tsb < -20 || rc < 45) {
    restDays   = 2;
    restReason = "High fatigue and negative form — schedule 2 full rest days. Light walking only.";
    restConf   = 0.93;
  } else if (input.tsb < -10 || rc < 60) {
    restDays   = 1;
    restReason = "Moderate fatigue — one full rest day allows recovery without meaningful fitness loss.";
    restConf   = 0.86;
  } else if (input.tsb >= 10 && rc >= 75) {
    restReason = "Good form — one planned rest day preserves freshness for key sessions.";
    restConf   = 0.80;
  }

  return {
    sleepHours:   { value: sleepHrs,  unit: "hours", confidence: conf(sleepConf), reason: sleepReason },
    recoveryDays: { value: restDays,  unit: "days",  confidence: conf(restConf),  reason: restReason },
  };
}

// ── Week summary ───────────────────────────────────────────────────────────

function buildWeekSummary(primary: Domain | null, input: AdaptiveGoalInput): string {
  const rs = input.readinessScore ?? 50;
  const rc = input.recoveryScore  ?? 65;
  const tsbStr = `${input.tsb > 0 ? "+" : ""}${input.tsb}`;

  switch (primary) {
    case "recovery":
      return `Recovery is the primary priority this week — training volume is reduced to absorb recent load. TSB: ${tsbStr}, Recovery: ${rc}/100.`;
    case "nutrition":
      return `Nutrition quality is the rate-limiting factor this week — consistent protein intake will unlock further training adaptations.`;
    case "running":
      return `Running progression is the primary focus. Readiness ${rs}/100 and form ${tsbStr} TSB support a controlled volume increase.`;
    case "strength":
      return `Strength is the primary progression this week — readiness supports an additional gym session while running holds at maintenance.`;
    case "growth":
      return `Intellectual growth is the dominant opportunity this week — training load is adequate but focused work hours need to increase to lift the Growth pillar.`;
    default:
      return `All four pillars are in balance — maintain current training, nutrition, and growth schedules this week.`;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Compute deterministic adaptive weekly goals from the current athlete state.
 *
 * This is a pure function — it performs no I/O and has no side effects.
 * All inputs must be pre-computed by the caller using the existing engines
 * (computeCTLATLTSB, computeRecoveryScore, computeReadiness, etc.).
 */
export function computeAdaptiveGoals(input: AdaptiveGoalInput): AdaptiveGoalOutput {
  const scores  = scoreDomains(input);
  const primary = selectPrimary(scores);

  return {
    running:   recommendRunning(input, primary),
    strength:  recommendStrength(input, primary),
    growth:    recommendGrowth(input, primary),
    nutrition: recommendNutrition(input, primary),
    recovery:  recommendRecovery(input, primary),
    primaryProgression: primary,
    weekSummary: buildWeekSummary(primary, input),
  };
}

// ── Context block builder (for coach prompt injection) ─────────────────────

/**
 * Renders adaptive goals as a structured markdown block for the coach's
 * system prompt. Keeps the coach context tightly scoped — only the most
 * actionable recommendation per domain is surfaced.
 */
export function buildAdaptiveGoalsBlock(goals: AdaptiveGoalOutput): string {
  const fmt = (r: GoalRecommendation) =>
    `${r.value}${r.unit} (${Math.round(r.confidence * 100)}% confidence) — ${r.reason}`;

  return [
    `## Adaptive Goals — Engine Recommendations (this week)`,
    `Primary progression: ${goals.primaryProgression ?? "Maintenance"}`,
    `Context: ${goals.weekSummary}`,
    ``,
    `Running:`,
    `  Volume:    ${fmt(goals.running.weeklyKm)}`,
    `  Runs:      ${fmt(goals.running.weeklyRuns)}`,
    `  Intensity: ${goals.running.intensity.label} — ${goals.running.intensity.reason}`,
    ``,
    `Strength:`,
    `  Sessions: ${fmt(goals.strength.weeklySessions)}`,
    ``,
    `Growth:`,
    `  Hours:    ${fmt(goals.growth.weeklyHours)}`,
    `  Emphasis: ${goals.growth.categoryEmphasis.label} — ${goals.growth.categoryEmphasis.reason}`,
    ``,
    `Nutrition:`,
    `  Calories: ${fmt(goals.nutrition.calories)}`,
    `  Protein:  ${fmt(goals.nutrition.protein)}`,
    ``,
    `Recovery:`,
    `  Sleep:          ${fmt(goals.recovery.sleepHours)}`,
    `  Rest days:      ${fmt(goals.recovery.recoveryDays)}`,
  ].join("\n");
}
