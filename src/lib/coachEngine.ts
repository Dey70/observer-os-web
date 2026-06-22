/**
 * Observer Coach Engine — deterministic decision layer.
 *
 * All outputs are derived from rules applied to physiological and
 * performance data. No external API calls. Works fully offline.
 *
 * Rule priority: specific physiological red flags override general score.
 */

import type { ReadinessGrade } from "@/lib/readiness";

// ── Input / Output types ────────────────────────────────────────────────────

export interface GoalProgress {
  weeklyKmPct:  number;  // fraction completed (0–1), ignored when hasKmGoal = false
  weeklyRunPct: number;
  weeklyGymPct: number;
  hasKmGoal:    boolean;
  hasRunGoal:   boolean;
  hasGymGoal:   boolean;
}

export interface CoachInput {
  recoveryScore:   number | null;
  readinessScore:  number;
  readinessGrade:  ReadinessGrade;
  ctl:             number;
  atl:             number;
  tsb:             number;
  sleepQuality:    number;
  energy:          number;
  mood:            number;
  fatigue:         number;
  soreness:        number;
  goalProgress:    GoalProgress;
  proteinTarget:   number;  // grams
  waterTargetMl:   number;
}

export type GoalStatus = "Behind" | "On Track" | "Exceeded";

export interface CoachOutput {
  trainingRecommendation:  string;
  recoveryRecommendation:  string;
  nutritionRecommendation: string;
  primaryFocus:            string;
  goalStatus:              GoalStatus;
  goalRecommendation:      string;
}

// ── Private rule functions ──────────────────────────────────────────────────

function trainingRecommendation(grade: ReadinessGrade, tsb: number): string {
  if (grade === "RED")
    return "Full rest today. No structured training. Easy walking is fine if energy allows.";

  if (grade === "YELLOW") {
    return tsb > 0
      ? "Zone 2 aerobic only — 30–40 min easy run or light movement. Avoid any intensity."
      : "Active recovery only. Yoga, mobility work, or a 20-minute walk. Skip the gym today.";
  }

  // GREEN
  if (tsb > 15)
    return "Peak readiness window. Prioritise a key quality session — threshold run, intervals, or maximal compound lifts.";
  if (tsb > 0)
    return "Good form and solid recovery. Tempo run 6–10 km or a compound strength session is appropriate.";
  if (tsb > -10)
    return "Fitness building phase. Zone 2 run 8–12 km or moderate strength at 70–80% effort.";
  return "Recovery score is solid but accumulated load is high. Zone 2 only today — no threshold work.";
}

function recoveryRecommendation(
  sleepQuality: number,
  fatigue:      number,
  soreness:     number,
  tsb:          number,
  recoveryScore: number | null,
): string {
  if (sleepQuality < 6)
    return "Sleep quality is the primary limiter. Target 8+ hours tonight — no screens for 1 hour before bed.";
  if (fatigue >= 8)
    return "Fatigue is critically elevated. No hard training today. A 20-minute afternoon nap meaningfully reduces cortisol.";
  if (soreness >= 8)
    return "Significant soreness detected. Prioritise protein intake, foam rolling, and a contrast shower. Light movement only.";
  if (tsb < -20)
    return "Overreaching zone. Schedule 2–3 full rest days now to prevent injury and hormonal suppression.";
  if (recoveryScore !== null && recoveryScore < 50)
    return "Recovery is below threshold. Focus on sleep quality, hydration, and whole foods tonight to reset.";
  return "Recovery is on track. Maintain consistent sleep timing and stay ahead on hydration through the day.";
}

function nutritionRecommendation(
  energy:        number,
  proteinTarget: number,
  waterTargetMl: number,
): string {
  const waterL = (waterTargetMl / 1000).toFixed(1);
  if (energy <= 3)
    return `Significant under-fuelling detected. Increase carbohydrate intake now and prioritise ${proteinTarget}g protein today.`;
  if (energy <= 5)
    return `Energy is sub-optimal. Ensure carbohydrate targets are met. Protein target: ${proteinTarget}g · Water: ${waterL}L.`;
  return `Protein target ${proteinTarget}g · Water target ${waterL}L. Prioritise whole food sources and pre-/post-workout timing.`;
}

function primaryFocus(grade: ReadinessGrade, tsb: number): string {
  if (grade === "RED")    return "Full Recovery";
  if (grade === "YELLOW") return tsb > 0 ? "Maintenance" : "Active Recovery";
  if (tsb > 15)           return "Peak Performance";
  if (tsb > 0)            return "Aerobic Development";
  if (tsb > -10)          return "Fitness Building";
  return "Load Management";
}

function goalAnalysis(gp: GoalProgress): {
  status: GoalStatus;
  recommendation: string;
} {
  const active = (
    [
      gp.hasKmGoal  ? gp.weeklyKmPct  : null,
      gp.hasRunGoal ? gp.weeklyRunPct : null,
      gp.hasGymGoal ? gp.weeklyGymPct : null,
    ] as (number | null)[]
  ).filter((v): v is number => v !== null);

  if (active.length === 0) {
    return {
      status: "On Track",
      recommendation:
        "No weekly targets set. Add km, run, and gym targets in your profile to enable goal intelligence.",
    };
  }

  const avg = active.reduce((s, v) => s + v, 0) / active.length;

  if (avg >= 1.2) {
    const excess = Math.round((avg - 1) * 100);
    return {
      status: "Exceeded",
      recommendation: `Weekly targets exceeded by ${excess}%. Consider scaling next week's goal for progressive overload.`,
    };
  }
  if (avg >= 0.7) {
    return {
      status: "On Track",
      recommendation:
        "Good consistency. Maintain current training volume through the end of the week.",
    };
  }
  if (avg >= 0.4) {
    return {
      status: "Behind",
      recommendation:
        "Behind schedule. Prioritise consistency — add one extra session before the week ends.",
    };
  }
  return {
    status: "Behind",
    recommendation:
      "Significantly behind target. Focus on completing one quality session today before adding volume.",
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export function runCoachEngine(input: CoachInput): CoachOutput {
  const { status, recommendation } = goalAnalysis(input.goalProgress);

  return {
    trainingRecommendation:  trainingRecommendation(input.readinessGrade, input.tsb),
    recoveryRecommendation:  recoveryRecommendation(
      input.sleepQuality,
      input.fatigue,
      input.soreness,
      input.tsb,
      input.recoveryScore,
    ),
    nutritionRecommendation: nutritionRecommendation(
      input.energy,
      input.proteinTarget,
      input.waterTargetMl,
    ),
    primaryFocus:       primaryFocus(input.readinessGrade, input.tsb),
    goalStatus:         status,
    goalRecommendation: recommendation,
  };
}
