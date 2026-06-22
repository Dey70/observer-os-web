import type { DailyLog } from "@/types";

export interface RecoveryResult {
  score: number;       // 0-100
  label: string;       // Excellent / Good / Moderate / Recovery Needed
  color: string;       // CSS variable
  description: string;
}

export interface RecoveryBanner {
  message: string;
  color: string;
  show: boolean;
}

/**
 * Compute 0-100 recovery score from today's daily check-in + current TSB.
 *
 * Weights:
 *   Sleep quality  1-10      → 35%
 *   Sleep duration            → 25%  (4h = 0, 8h = 10, linear)
 *   Fatigue inverted 1-10    → 20%  (fatigue 10 = worst → 0 pts)
 *   Soreness inverted 1-10   → 10%
 *   TSB normalized           → 10%  (TSB -30 = 0pts, +25 = 10pts)
 *
 * Returns null when no check-in has been logged today.
 */
export function computeRecoveryScore(
  log: DailyLog | null,
  tsb: number,
): number | null {
  if (!log) return null;

  const sleepScore    = Math.max(0, Math.min(10, ((log.sleep_hours - 4) / 4) * 10));
  const fatigueScore  = 10 - log.fatigue;
  const sorenessScore = 10 - log.soreness;
  const tsbScore      = Math.max(0, Math.min(10, ((tsb + 30) / 55) * 10));

  const raw =
    log.sleep_quality * 0.35 +
    sleepScore        * 0.25 +
    fatigueScore      * 0.20 +
    sorenessScore     * 0.10 +
    tsbScore          * 0.10;

  return Math.min(100, Math.max(0, Math.round((raw / 10) * 100)));
}

export function getRecoveryStatus(score: number): RecoveryResult {
  if (score >= 80)
    return { score, label: "Excellent",        color: "var(--green)",  description: "Full recovery. Ready for high-intensity work." };
  if (score >= 65)
    return { score, label: "Good",             color: "var(--accent)", description: "Recovered well. Normal training is appropriate." };
  if (score >= 50)
    return { score, label: "Moderate",         color: "var(--yellow)", description: "Some fatigue present. Keep intensity manageable." };
  return   { score, label: "Recovery Needed",  color: "var(--red)",    description: "Body needs rest. Prioritize sleep and nutrition." };
}

/**
 * Contextual coaching banner.
 * Most specific physiological signal takes priority over general score.
 */
export function getRecoveryBanner(
  log: DailyLog | null,
  score: number | null,
): RecoveryBanner {
  if (!log || score === null)
    return { message: "", color: "var(--text-dim)", show: false };

  if (log.sleep_hours < 6)
    return {
      message: `Low sleep (${log.sleep_hours}h). Take it easy today and prioritize rest tonight.`,
      color: "var(--yellow)",
      show: true,
    };
  if (log.fatigue >= 8)
    return {
      message: "Elevated fatigue — consider a rest day or easy aerobic movement only.",
      color: "var(--yellow)",
      show: true,
    };
  if (log.soreness >= 8)
    return {
      message: "High soreness reported. Easy aerobic work or full rest is recommended.",
      color: "var(--yellow)",
      show: true,
    };
  if (score >= 80)
    return {
      message: "High recovery and low fatigue. Good day for a hard run or quality session.",
      color: "var(--green)",
      show: true,
    };
  if (score >= 65)
    return {
      message: "Feeling good. Stick to your plan — moderate to hard effort is fine.",
      color: "var(--accent)",
      show: true,
    };
  if (score >= 50)
    return {
      message: "Fatigue is elevated. Keep today aerobic and below threshold.",
      color: "var(--yellow)",
      show: true,
    };
  return {
    message: "Recovery score below 50. Prioritize sleep, nutrition, and easy movement only.",
    color: "var(--red)",
    show: true,
  };
}
