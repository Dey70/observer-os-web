/**
 * Coach prompt builders.
 *
 * Two distinct prompts:
 *   buildSystemPrompt  — rich context prompt injected into every chat turn.
 *   buildRecommendPrompt — user-turn prompt requesting structured JSON
 *                          recommendations for the Intelligence Panel.
 *
 * Embedding pre-computed Phase 3 metrics (CTL/ATL/TSB, readiness grade,
 * hybrid score) means the LLM reasons from structured insight rather than
 * raw database rows, which materially improves output quality.
 */

import type { CoachContext } from "@/lib/coachContext";

// ── System prompt ──────────────────────────────────────────────────────────

export function buildSystemPrompt(ctx: CoachContext): string {
  const profileLines = [
    ctx.profileName     ? `Name: ${ctx.profileName}`                  : null,
    ctx.profileAge      ? `Age: ${ctx.profileAge}`                    : null,
    ctx.profileSex      ? `Sex: ${ctx.profileSex}`                    : null,
    ctx.profileSplit    ? `Training split: ${ctx.profileSplit}`        : null,
    ctx.currentWeightKg ? `Weight: ${ctx.currentWeightKg} kg`         : null,
    ctx.profileWeeklyGoal ? `Weekly session goal: ${ctx.profileWeeklyGoal}` : null,
    ctx.profileNotes    ? `Coach notes: ${ctx.profileNotes}`           : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const readinessLine = ctx.readiness
    ? `${ctx.readiness.score}/100 — ${ctx.readiness.grade} (${ctx.readiness.label})`
    : "Not computed — no check-in logged today.";

  const recoveryLine = ctx.recoveryScore !== null
    ? `${ctx.recoveryScore}/100`
    : "No data (no check-in).";

  const todayLine = ctx.todayLog
    ? [
        `sleep quality ${ctx.todayLog.sleep_quality}/10`,
        `sleep ${ctx.todayLog.sleep_hours}h`,
        `mood ${ctx.todayLog.mood}/10`,
        `energy ${ctx.todayLog.energy}/10`,
        `fatigue ${ctx.todayLog.fatigue}/10`,
        `soreness ${ctx.todayLog.soreness}/10`,
      ].join(" · ")
    : "No check-in logged today.";

  const weeklyLine = [
    ctx.weeklyStats.avgSleep   !== null ? `avg sleep ${ctx.weeklyStats.avgSleep}h`      : null,
    ctx.weeklyStats.avgMood    !== null ? `avg mood ${ctx.weeklyStats.avgMood}/10`       : null,
    ctx.weeklyStats.avgEnergy  !== null ? `avg energy ${ctx.weeklyStats.avgEnergy}/10`   : null,
    `${ctx.weeklyStats.sessionCount} sessions`,
    `${ctx.weeklyStats.kmThisWeek} km`,
  ]
    .filter(Boolean)
    .join(" · ");

  const goalLines = [
    ctx.goalProgress.hasKmGoal  ? `Distance: ${Math.round(ctx.goalProgress.weeklyKmPct  * 100)}% of weekly target` : null,
    ctx.goalProgress.hasRunGoal ? `Runs: ${Math.round(ctx.goalProgress.weeklyRunPct * 100)}%`    : null,
    ctx.goalProgress.hasGymGoal ? `Gym: ${Math.round(ctx.goalProgress.weeklyGymPct * 100)}%`     : null,
  ]
    .filter(Boolean)
    .join(" · ") || "No weekly targets set.";

  const hybridLine = `${ctx.hybrid.score}/100 — ${ctx.hybrid.level} (Recovery ${ctx.hybrid.components.recovery} · Training ${ctx.hybrid.components.training} · Nutrition ${ctx.hybrid.components.nutrition} · Consistency ${ctx.hybrid.components.consistency})`;

  const streakLine = `Check-in streak: ${ctx.checkinStreak} days · Session streak: ${ctx.sessionStreak} days`;

  const nutritionLine = `Protein target: ${ctx.nutritionTargets.protein}g · Water target: ${(ctx.nutritionTargets.waterMl / 1000).toFixed(1)}L`;

  return `You are Observer Coach — an elite AI performance coach for a hybrid athlete (running + lifting).

## Coaching philosophy
- Long-term sustainability over short-term gains
- Recovery IS training — neglecting it is the #1 mistake athletes make
- Nutrition fuels training — macro intake must match training load
- Mental state (mood, energy) directly predicts physical output
- Always cite actual numbers from the metrics below
- Tell the truth even when it is uncomfortable

## Athlete profile
${profileLines || "Profile not configured."}
${streakLine}

## Current state (today)
Readiness:      ${readinessLine}
Recovery score: ${recoveryLine}
Today:          ${todayLine}

## Training load — Banister model
CTL (fitness): ${ctx.ctl} · ATL (fatigue): ${ctx.atl} · TSB (form): ${ctx.tsb > 0 ? "+" : ""}${ctx.tsb}
Primary focus today: ${ctx.coach.primaryFocus}

## This week
${weeklyLine}

## Goal progress
${goalLines}
Status: ${ctx.coach.goalStatus}

## Hybrid Athlete Score
${hybridLine}

## Nutrition
${nutritionLine}

## Deterministic baseline recommendations (your floor — explain why, then exceed this level of detail)
Training:  ${ctx.coach.trainingRecommendation}
Recovery:  ${ctx.coach.recoveryRecommendation}
Nutrition: ${ctx.coach.nutritionRecommendation}
Goals:     ${ctx.coach.goalRecommendation}

## Response guidelines
- Reference actual numbers from the metrics above
- Explain reasoning behind recommendations — not just conclusions
- For weekly reviews: cover sleep, training load, nutrition, mood/energy, then next-week plan
- For quick questions: 2–4 sentences, lead with the key finding and its number
- Tone: direct, evidence-based, no generic wellness language`;
}

// ── Structured recommendations prompt ────────────────────────────────────

export function buildRecommendPrompt(ctx: CoachContext): string {
  const todayBlock = ctx.todayLog
    ? [
        `sleep quality ${ctx.todayLog.sleep_quality}/10`,
        `sleep ${ctx.todayLog.sleep_hours}h`,
        `energy ${ctx.todayLog.energy}/10`,
        `mood ${ctx.todayLog.mood}/10`,
        `fatigue ${ctx.todayLog.fatigue}/10`,
        `soreness ${ctx.todayLog.soreness}/10`,
      ].join(", ")
    : "No check-in logged today — use conservative defaults.";

  const goalBlock = [
    ctx.goalProgress.hasKmGoal  ? `distance ${Math.round(ctx.goalProgress.weeklyKmPct  * 100)}%` : null,
    ctx.goalProgress.hasRunGoal ? `runs ${Math.round(ctx.goalProgress.weeklyRunPct * 100)}%`      : null,
    ctx.goalProgress.hasGymGoal ? `gym ${Math.round(ctx.goalProgress.weeklyGymPct * 100)}%`       : null,
  ].filter(Boolean).join(", ") || "no targets set";

  return `Generate personalised coaching recommendations based on today's athlete state.

Today: ${todayBlock}
Readiness: ${ctx.readiness ? `${ctx.readiness.score}/100 — ${ctx.readiness.grade}` : "not computed"}
CTL: ${ctx.ctl} · ATL: ${ctx.atl} · TSB: ${ctx.tsb > 0 ? "+" : ""}${ctx.tsb}
Weekly goals: ${goalBlock} · Status: ${ctx.coach.goalStatus}
7-day averages: sleep ${ctx.weeklyStats.avgSleep ?? "?"}h · mood ${ctx.weeklyStats.avgMood ?? "?"} · energy ${ctx.weeklyStats.avgEnergy ?? "?"}

Respond with ONLY valid JSON — no markdown fences, no explanation outside the object:
{
  "training":     "<2–3 sentences referencing specific numbers and naming exact workout types>",
  "recovery":     "<2–3 sentences citing actual metrics and giving concrete recovery actions>",
  "nutrition":    "<2–3 sentences mentioning the ${ctx.nutritionTargets.protein}g protein and ${(ctx.nutritionTargets.waterMl / 1000).toFixed(1)}L water targets>",
  "primaryFocus": "<one short phrase, e.g. 'Peak Performance' or 'Active Recovery'>",
  "goalInsight":  "<1–2 sentences analysing goal progress with the actual percentages>"
}`;
}
