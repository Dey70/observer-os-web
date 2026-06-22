/**
 * Readiness model — measures how prepared the athlete is to train today.
 *
 * Distinct from recovery score: readiness captures both physical recovery
 * and psychological drive (energy). Recovery score measures "how healed is
 * the body?"; readiness measures "how ready is the athlete to perform?".
 *
 * Weights:
 *   Recovery score (0-100 → 0-10)   40%  — core physical state
 *   TSB normalised (−30 to +25)     20%  — training form
 *   Sleep quality (1-10)            20%  — sleep adequacy
 *   Energy (1-10)                   10%  — subjective drive
 *   Fatigue inverted (1-10)         10%  — systemic fatigue
 *
 * Thresholds:
 *   GREEN  ≥ 75  — full training appropriate
 *   YELLOW ≥ 50  — train with reduced intensity
 *   RED    < 50  — prioritise recovery, no hard sessions
 */

export type ReadinessGrade = "GREEN" | "YELLOW" | "RED";

export interface ReadinessOutput {
  score: number;
  grade: ReadinessGrade;
  label: string;
  color: string;
}

export function computeReadiness(
  recoveryScore: number,
  tsb: number,
  sleepQuality: number,
  fatigue: number,
  energy: number,
): ReadinessOutput {
  const recoveryPts = (recoveryScore / 100) * 10;
  const tsbPts      = Math.max(0, Math.min(10, ((tsb + 30) / 55) * 10));
  const fatigueInv  = 10 - fatigue;

  const raw =
    recoveryPts  * 0.40 +
    tsbPts       * 0.20 +
    sleepQuality * 0.20 +
    energy       * 0.10 +
    fatigueInv   * 0.10;

  const score = Math.min(100, Math.max(0, Math.round((raw / 10) * 100)));

  if (score >= 75)
    return { score, grade: "GREEN",  label: "Ready to Train",     color: "var(--green)" };
  if (score >= 50)
    return { score, grade: "YELLOW", label: "Train with Caution", color: "var(--yellow)" };
  return   { score, grade: "RED",    label: "Prioritise Recovery", color: "var(--red)" };
}
