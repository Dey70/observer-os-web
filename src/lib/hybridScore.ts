/**
 * Hybrid Athlete Score — composite 0–100 index of overall performance quality.
 *
 * Four equal-weight pillars (25% each):
 *
 *   Recovery  — today's physiological readiness (sleep, HRV proxy, soreness)
 *   Training  — chronic training load (CTL), proxy for aerobic + strength fitness
 *   Nutrition — macro adherence; neutral 50 when not tracked
 *   Growth    — weekly intellectual/skill-development output (study, projects,
 *               deep-work blocks). Sourced from growth_logs; falls back to
 *               sessions(type='study') until growth_logs is populated.
 *
 * Levels:
 *   80–100  Hybrid Athlete  — elite performance across all four pillars
 *   60–79   Advancing       — strong in multiple areas, clear gaps remain
 *   40–59   Developing      — building the foundation
 *   0–39    Beginner        — significant room to grow in most pillars
 */

export type HybridLevel = "Hybrid Athlete" | "Advancing" | "Developing" | "Beginner";

export interface HybridScoreOutput {
  score: number;
  level: HybridLevel;
  components: {
    recovery:  number;  // 0-100
    training:  number;  // 0-100
    nutrition: number;  // 0-100; 50 when not tracked
    growth:    number;  // 0-100; 0 when no growth sessions logged
  };
}

// ── Component scorers ──────────────────────────────────────────────────────

function trainingComponent(ctl: number): number {
  if (ctl >= 60) return 100;
  if (ctl >= 40) return 80;
  if (ctl >= 25) return 60;
  if (ctl >= 10) return 40;
  return 20;
}

/**
 * Growth component — step function on weekly focused-work hours.
 *
 * @param weeklyGrowthMinutes — total minutes of study/project/learning/deep-work
 *   logged in the past 7 days. Sourced from growth_logs first; sessions(study)
 *   as fallback. Pass 0 when no data exists.
 */
function growthComponent(weeklyGrowthMinutes: number): number {
  const hours = weeklyGrowthMinutes / 60;
  if (hours >= 20) return 100;
  if (hours >= 15) return 85;
  if (hours >= 10) return 70;
  if (hours >= 6)  return 55;
  if (hours >= 3)  return 40;
  return 20;
}

function levelFromScore(score: number): HybridLevel {
  if (score >= 80) return "Hybrid Athlete";
  if (score >= 60) return "Advancing";
  if (score >= 40) return "Developing";
  return "Beginner";
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * @param recoveryScore        — 0-100 from computeRecoveryScore, or null if no check-in
 * @param ctl                  — Chronic Training Load from the Banister model
 * @param nutritionAdherence   — 0-100 (protein_eaten / protein_target × 100), null if not tracked
 * @param weeklyGrowthMinutes  — total study/project/learning minutes in past 7 days
 */
export function computeHybridScore(
  recoveryScore:       number | null,
  ctl:                 number,
  nutritionAdherence:  number | null,
  weeklyGrowthMinutes: number,
): HybridScoreOutput {
  const recovery  = recoveryScore     !== null ? Math.min(100, Math.max(0, recoveryScore))    : 50;
  const training  = trainingComponent(ctl);
  const nutrition = nutritionAdherence !== null ? Math.min(100, Math.max(0, nutritionAdherence)) : 50;
  const growth    = growthComponent(weeklyGrowthMinutes);

  const score = Math.round((recovery + training + nutrition + growth) / 4);

  return {
    score,
    level: levelFromScore(score),
    components: { recovery, training, nutrition, growth },
  };
}
