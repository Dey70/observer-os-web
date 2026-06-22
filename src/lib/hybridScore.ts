/**
 * Hybrid Athlete Score — composite 0-100 index of overall athlete quality.
 *
 * Components (equal 25% weight each):
 *   Recovery    — today's recovery score (physical readiness)
 *   Training    — chronic training load (CTL), proxy for aerobic fitness
 *   Nutrition   — self-reported adherence; neutral 50 when not tracked
 *   Consistency — combined check-in and session streak, capped at 14 days
 *
 * Levels:
 *   80-100  Hybrid Athlete   — elite consistency across all domains
 *   60-79   Advancing        — strong in multiple areas, gaps remain
 *   40-59   Developing       — building the foundation
 *   0-39    Beginner         — significant room to grow
 */

export type HybridLevel = "Hybrid Athlete" | "Advancing" | "Developing" | "Beginner";

export interface HybridScoreOutput {
  score: number;
  level: HybridLevel;
  components: {
    recovery:    number;  // 0-100
    training:    number;  // 0-100
    nutrition:   number;  // 0-100, 50 when no data
    consistency: number;  // 0-100
  };
}

const STREAK_CAP = 14;

function trainingComponent(ctl: number): number {
  if (ctl >= 60) return 100;
  if (ctl >= 40) return 80;
  if (ctl >= 25) return 60;
  if (ctl >= 10) return 40;
  return 20;
}

function consistencyComponent(checkinStreak: number, sessionStreak: number): number {
  const checkinPct = Math.min(checkinStreak, STREAK_CAP) / STREAK_CAP;
  const sessionPct = Math.min(sessionStreak, STREAK_CAP) / STREAK_CAP;
  return Math.round((checkinPct * 0.5 + sessionPct * 0.5) * 100);
}

function levelFromScore(score: number): HybridLevel {
  if (score >= 80) return "Hybrid Athlete";
  if (score >= 60) return "Advancing";
  if (score >= 40) return "Developing";
  return "Beginner";
}

/**
 * @param recoveryScore    — 0-100 from computeRecoveryScore, or null if no check-in
 * @param ctl              — Chronic Training Load from Banister model
 * @param nutritionAdherence — 0-100 (protein_eaten/protein_target × 100), null if not tracking
 * @param checkinStreak    — consecutive daily log streak
 * @param sessionStreak    — consecutive training session streak
 */
export function computeHybridScore(
  recoveryScore:       number | null,
  ctl:                 number,
  nutritionAdherence:  number | null,
  checkinStreak:       number,
  sessionStreak:       number,
): HybridScoreOutput {
  const recovery    = recoveryScore !== null
    ? Math.min(100, Math.max(0, recoveryScore))
    : 50;
  const training    = trainingComponent(ctl);
  const nutrition   = nutritionAdherence !== null
    ? Math.min(100, Math.max(0, nutritionAdherence))
    : 50;
  const consistency = consistencyComponent(checkinStreak, sessionStreak);

  const score = Math.round((recovery + training + nutrition + consistency) / 4);

  return {
    score,
    level: levelFromScore(score),
    components: { recovery, training, nutrition, consistency },
  };
}
