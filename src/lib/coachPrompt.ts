/**
 * Coach prompt builders.
 *
 * Exports two system prompts:
 *
 *   buildChatSystemPrompt   — full prompt for /api/chat (context + memory + tools).
 *   buildSystemPrompt       — compact prompt for /api/coach/recommend (no tools).
 *   buildRecommendPrompt    — user-turn requesting structured JSON for the panel.
 *
 * All prompts are athlete-agnostic: they receive computed context from
 * buildCoachContext and learned facts from observerMemory. No values are
 * hardcoded — the same prompt functions correctly for any athlete account.
 */

import type { CoachContext } from "@/lib/coachContext";
import {
  buildAthleteProfileBlock,
  buildObserverMemoryBlock,
  type MemoryFact,
} from "@/lib/observerMemory";
import { buildAdaptiveGoalsBlock } from "@/lib/adaptiveGoals";

// ── Shared coaching philosophy ─────────────────────────────────────────────

const PHILOSOPHY = `## Coaching philosophy
- Long-term sustainability over short-term gains
- Recovery IS training — neglecting it is the #1 mistake athletes make
- Nutrition fuels training — macro intake must match training load
- Mental state (mood, energy) directly predicts physical output
- Always cite actual numbers from the athlete's data
- Tell the truth even when it is uncomfortable`;

// ── Current-state snapshot helper ──────────────────────────────────────────

function buildCurrentStateBlock(ctx: CoachContext): string {
  const readinessLine = ctx.readiness
    ? `${ctx.readiness.score}/100 — ${ctx.readiness.grade} (${ctx.readiness.label})`
    : "Not computed — no check-in logged today.";

  const recoveryLine = ctx.recoveryScore !== null
    ? `${ctx.recoveryScore}/100`
    : "No data — no check-in today.";

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
    ctx.weeklyStats.avgSleep   !== null ? `avg sleep ${ctx.weeklyStats.avgSleep}h`     : null,
    ctx.weeklyStats.avgMood    !== null ? `avg mood ${ctx.weeklyStats.avgMood}/10`      : null,
    ctx.weeklyStats.avgEnergy  !== null ? `avg energy ${ctx.weeklyStats.avgEnergy}/10`  : null,
    `${ctx.weeklyStats.sessionCount} sessions`,
    `${ctx.weeklyStats.kmThisWeek} km`,
  ].filter(Boolean).join(" · ");

  const goalLines = [
    ctx.goalProgress.hasKmGoal  ? `Distance: ${Math.round(ctx.goalProgress.weeklyKmPct  * 100)}% of weekly target` : null,
    ctx.goalProgress.hasRunGoal ? `Runs: ${Math.round(ctx.goalProgress.weeklyRunPct * 100)}%`                      : null,
    ctx.goalProgress.hasGymGoal ? `Gym: ${Math.round(ctx.goalProgress.weeklyGymPct  * 100)}%`                      : null,
  ].filter(Boolean).join(" · ") || "No weekly targets set.";

  const hybridLine = `${ctx.hybrid.score}/100 — ${ctx.hybrid.level} `
    + `(Recovery ${ctx.hybrid.components.recovery} · Training ${ctx.hybrid.components.training} `
    + `· Nutrition ${ctx.hybrid.components.nutrition} · Growth ${ctx.hybrid.components.growth})`;

  const streakLine = `Check-in streak: ${ctx.checkinStreak} days · Session streak: ${ctx.sessionStreak} days`;
  const nutritionLine = `Protein target: ${ctx.nutritionTargets.protein}g · Water target: ${(ctx.nutritionTargets.waterMl / 1000).toFixed(1)}L`;

  return [
    `## Current state (today)`,
    `Readiness:      ${readinessLine}`,
    `Recovery score: ${recoveryLine}`,
    `Today:          ${todayLine}`,
    ``,
    `## Training load — Banister model`,
    `CTL (fitness): ${ctx.ctl} · ATL (fatigue): ${ctx.atl} · TSB (form): ${ctx.tsb > 0 ? "+" : ""}${ctx.tsb}`,
    `Primary focus today: ${ctx.coach.primaryFocus}`,
    ``,
    `## This week`,
    weeklyLine,
    ``,
    `## Goal progress`,
    goalLines,
    `Status: ${ctx.coach.goalStatus}`,
    ``,
    `## Hybrid Athlete Score`,
    hybridLine,
    `${streakLine}`,
    ``,
    `## Nutrition`,
    nutritionLine,
  ].join("\n");
}

// ── Chat system prompt ─────────────────────────────────────────────────────

export function buildChatSystemPrompt(ctx: CoachContext, facts: MemoryFact[]): string {
  const profileBlock      = buildAthleteProfileBlock(ctx);
  const memoryBlock       = buildObserverMemoryBlock(facts);
  const stateBlock        = buildCurrentStateBlock(ctx);
  const adaptiveGoalsBlock = buildAdaptiveGoalsBlock(ctx.adaptiveGoals);

  const baselineBlock = [
    `## Deterministic baseline recommendations (your floor — analyse and exceed)`,
    `Training:  ${ctx.coach.trainingRecommendation}`,
    `Recovery:  ${ctx.coach.recoveryRecommendation}`,
    `Nutrition: ${ctx.coach.nutritionRecommendation}`,
    `Goals:     ${ctx.coach.goalRecommendation}`,
  ].join("\n");

  const toolBlock = `## Tool use
- ALWAYS call get_checkins or get_sessions before answering performance questions
- Call get_nutrition when asked about diet, macros, or whether intake matches load
- Call analyze_trend when asked about patterns over time
- Call generate_training_plan when asked for a weekly plan or schedule
- Call update_goal when the athlete wants to set or change a goal
- Chain multiple tools in a single turn when needed`;

  const responseBlock = `## Response format
- Lead with the key finding and its number — never open with a generic observation
- Reference actual metrics from the data above
- For weekly reviews: cover sleep, training load, nutrition, mood/energy, then next-week plan
- For quick questions: 2–4 sentences max
- Tone: direct, evidence-based, no generic wellness language`;

  return [
    `You are Observer Coach — a data-driven performance coach specialising in hybrid athlete development (running + lifting).`,
    ``,
    PHILOSOPHY,
    ``,
    profileBlock,
    ``,
    memoryBlock,
    ``,
    stateBlock,
    ``,
    adaptiveGoalsBlock,
    ``,
    baselineBlock,
    ``,
    toolBlock,
    ``,
    responseBlock,
  ].join("\n");
}

// ── Recommend system prompt (Intelligence Panel sidebar) ───────────────────

export function buildSystemPrompt(ctx: CoachContext): string {
  const profileBlock = buildAthleteProfileBlock(ctx);
  const stateBlock   = buildCurrentStateBlock(ctx);

  return [
    `You are Observer Coach — a data-driven performance coach specialising in hybrid athlete development.`,
    ``,
    PHILOSOPHY,
    ``,
    profileBlock,
    ``,
    stateBlock,
    ``,
    `## Response guidelines`,
    `- Reference actual numbers from the metrics above`,
    `- Explain reasoning behind recommendations — not just conclusions`,
    `- Tone: direct, evidence-based, no generic wellness language`,
  ].join("\n");
}

// ── Structured recommendations prompt ─────────────────────────────────────

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
    ctx.goalProgress.hasGymGoal ? `gym ${Math.round(ctx.goalProgress.weeklyGymPct  * 100)}%`      : null,
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
