// Training load computation: TSS, TRIMP, CTL, ATL, TSB
// Pace-based intensity when distance is available; RPE proxy otherwise.

export interface TrainingMetricRow {
  activity_date: string;
  tss: number;
  trimp: number;
  pace_seconds_per_km: number | null;
  load_score: number;
  source: string;
}

const DEFAULT_THRESHOLD_PACE_SEC = 330; // 5:30 /km

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Intensity Factor: threshold_pace / actual_pace.
 * Values > 1.0 mean the athlete ran faster than threshold.
 * Clamped to [0.5, 1.3] to prevent outliers skewing TSS.
 */
export function calcIntensityFactor(
  paceSecPerKm: number,
  thresholdPaceSec = DEFAULT_THRESHOLD_PACE_SEC,
): number {
  return clamp(thresholdPaceSec / paceSecPerKm, 0.5, 1.3);
}

/**
 * TSS for a run with known pace.
 * TSS = (moving_time_sec × IF² × 100) / 3600
 * Exactly one hour at threshold pace = 100 TSS.
 * Capped at 400 — equivalent to a ~4-hour race-effort run — to prevent
 * data-corruption spikes from inflating the EMA.
 */
export function calcRunTSS(
  movingTimeSec: number,
  paceSecPerKm: number,
  thresholdPaceSec = DEFAULT_THRESHOLD_PACE_SEC,
): number {
  const IF = calcIntensityFactor(paceSecPerKm, thresholdPaceSec);
  return Math.min(400, Math.round((movingTimeSec * IF * IF * 100) / 3600));
}

/**
 * TSS proxy for manual sessions without distance/pace.
 * Intentionally lower than pace-based TSS so manual logging
 * doesn't inflate load relative to Strava data.
 */
export function calcSessionTSSProxy(durationMin: number, rpe: number): number {
  return Math.round((durationMin * rpe) / 10);
}

/**
 * Simplified TRIMP: duration × IF × zone coefficient.
 * Zone coefficients escalate effort weighting exponentially.
 */
export function calcTRIMP(movingTimeSec: number, intensityFactor: number): number {
  const coeff =
    intensityFactor < 0.75 ? 0.7
    : intensityFactor < 0.90 ? 1.0
    : intensityFactor < 1.00 ? 1.2
    : intensityFactor < 1.10 ? 1.5
    : 2.0;
  return Math.round((movingTimeSec / 60) * intensityFactor * coeff);
}

/**
 * Build a day-by-day TSS sum map from training_metrics rows.
 * Used as input to the EMA computation.
 */
function buildDailyTSS(metrics: TrainingMetricRow[], days: number): number[] {
  const map: Record<string, number> = {};
  for (const m of metrics) {
    map[m.activity_date] = (map[m.activity_date] ?? 0) + m.tss;
  }
  const result: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    result.push(map[date] ?? 0);
  }
  return result;
}

/**
 * Compute CTL (42-day EMA) and ATL (7-day EMA) from training_metrics.
 * TSB = CTL − ATL  ("Form").
 *
 * EMA decay: e^(-1/tau) where tau is the time constant in days.
 * One hour at threshold = 100 TSS → meaningful scale.
 *
 * lookbackDays controls how many days of history are used to warm up the EMA.
 * More history → more accurate CTL (which has a 42-day time constant and needs
 * at least 84–126 days to fully converge from a cold start). Default: 90 days
 * reaches ~88% of the true steady-state CTL value.
 */
export function computeCTLATLTSB(
  metrics: TrainingMetricRow[],
  lookbackDays = 90,
): {
  ctl: number;
  atl: number;
  tsb: number;
} {
  const dailyTSS = buildDailyTSS(metrics, lookbackDays);
  const kCtl = Math.exp(-1 / 42);
  const kAtl = Math.exp(-1 / 7);
  let ctl = 0;
  let atl = 0;
  for (const tss of dailyTSS) {
    ctl = ctl * kCtl + tss * (1 - kCtl);
    atl = atl * kAtl + tss * (1 - kAtl);
  }
  return { ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(ctl - atl) };
}

export interface LoadZone {
  label: string;
  color: string;
  description: string;
}

export function getLoadZone(tsb: number): LoadZone {
  if (tsb > 15)
    return { label: "FRESH",        color: "var(--green)",  description: "Well rested. Good time to race or test performance." };
  if (tsb > 0)
    return { label: "OPTIMAL",      color: "var(--accent)", description: "Peak performance window. Train hard and compete." };
  if (tsb > -10)
    return { label: "PRODUCTIVE",   color: "var(--yellow)", description: "Some fatigue — training is progressing well." };
  if (tsb > -20)
    return { label: "FATIGUED",     color: "var(--yellow)", description: "Accumulated fatigue. Prioritise recovery and sleep." };
  return   { label: "OVERREACHING", color: "var(--red)",    description: "High overtraining risk. Reduce load immediately." };
}

/** Chart-ready daily TSS array for the last N days. */
export function buildLoadChartData(
  metrics: TrainingMetricRow[],
  days: number,
): { date: string; tss: number }[] {
  const map: Record<string, number> = {};
  for (const m of metrics) {
    map[m.activity_date] = (map[m.activity_date] ?? 0) + m.tss;
  }
  const result: { date: string; tss: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    result.push({ date: date.slice(5), tss: map[date] ?? 0 });
  }
  return result;
}
