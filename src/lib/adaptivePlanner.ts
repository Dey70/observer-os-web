/**
 * Adaptive Weekly Planner — Phase 5B
 *
 * Pure deterministic 7-day scheduling engine. Consumes AdaptiveGoalOutput
 * from Phase 5A and physiological signals to produce a concrete PlannedWeek.
 *
 * Scheduling invariants:
 *   - Long run anchored to Saturday (ISO week index 5)
 *   - Leg day never the day before long run (Friday = no lift_legs)
 *   - Quality sessions (intervals/tempo) blocked when TSB < -10 / readiness < 55
 *   - No 3+ consecutive high-load days
 *   - Growth blocks prefer rest/active-recovery days, then light training days
 */

import type { AdaptiveGoalOutput } from "@/lib/adaptiveGoals";

// ── Public output types ────────────────────────────────────────────────────

export type SessionType =
  | "run_easy"
  | "run_tempo"
  | "run_intervals"
  | "run_long"
  | "lift_push"
  | "lift_pull"
  | "lift_legs"
  | "lift_full"
  | "active_recovery"
  | "rest";

export type LoadLevel   = "high" | "medium" | "low" | "rest";
export type DayPriority = "HIGH" | "NORMAL" | "RECOVERY" | "REST";
export type PlanBalance = "Excellent" | "Good" | "Needs Adjustment";

export interface PlannedSession {
  type:         SessionType;
  label:        string;
  durationMin:  number;
  intensity:    string;
  distanceKm?:  number;
  notes:        string;
}

export interface PlannedGrowthBlock {
  category:    "study" | "project" | "learning" | "deep_work";
  label:       string;
  durationMin: number;
  timing:      "morning" | "afternoon" | "evening";
}

export interface PlannedNutrition {
  proteinG:     number;
  caloriesKcal: number;
  highlight:    string;
}

export interface PlannedDay {
  date:      string;      // "YYYY-MM-DD"
  dayOfWeek: string;      // "Monday" … "Sunday"
  shortDay:  string;      // "MON" … "SUN"
  dayIndex:  number;      // 0 = Monday, 6 = Sunday
  isToday:   boolean;
  isPast:    boolean;
  priority:  DayPriority;
  load:      LoadLevel;
  sessions:  PlannedSession[];
  growth:    PlannedGrowthBlock | null;
  nutrition: PlannedNutrition;
}

export interface WeekPlan {
  weekStart:         string;       // Monday "YYYY-MM-DD"
  weekEnd:           string;       // Sunday  "YYYY-MM-DD"
  days:              PlannedDay[]; // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  weekFocus:         string;       // e.g. "RUNNING WEEK"
  weekFocusColor:    string;       // CSS color variable reference
  planBalance:       PlanBalance;
  planBalanceReason: string;
  totalRunKm:        number;
  totalLiftSessions: number;
  totalGrowthHours:  number;
}

// ── Input type ─────────────────────────────────────────────────────────────

export interface PlannerInput {
  adaptiveGoals:   AdaptiveGoalOutput;
  ctl:             number;
  atl:             number;
  tsb:             number;
  readinessScore:  number | null;
  recoveryScore:   number | null;
  today:           string;   // "YYYY-MM-DD"
  trainingProfile: string;   // "balanced"|"running"|"strength"|"study_heavy"|"deload"
}

// ── Internal types ─────────────────────────────────────────────────────────

type SlotDef = { session: SessionType; load: LoadLevel };

type GrowthCategory = PlannedGrowthBlock["category"];

// ── Constants ──────────────────────────────────────────────────────────────

const DAY_NAMES  = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];


const GROWTH_LABELS: Record<GrowthCategory, string> = {
  study:     "Study",
  project:   "Project Work",
  learning:  "Learning",
  deep_work: "Deep Work",
};

// ── Week templates — 7 slots (Mon … Sun) ──────────────────────────────────

const TEMPLATES: Record<string, SlotDef[]> = {
  recovery: [
    { session: "active_recovery", load: "low"    },
    { session: "rest",            load: "rest"   },
    { session: "run_easy",        load: "medium" },
    { session: "active_recovery", load: "low"    },
    { session: "rest",            load: "rest"   },
    { session: "run_easy",        load: "medium" },
    { session: "rest",            load: "rest"   },
  ],
  running_easy: [
    { session: "run_easy",  load: "medium" },
    { session: "lift_push", load: "medium" },
    { session: "rest",      load: "rest"   },
    { session: "run_easy",  load: "medium" },
    { session: "lift_pull", load: "medium" },
    { session: "run_long",  load: "high"   },
    { session: "rest",      load: "rest"   },
  ],
  running_moderate: [
    { session: "run_easy",  load: "medium" },
    { session: "lift_push", load: "medium" },
    { session: "run_easy",  load: "medium" },
    { session: "lift_pull", load: "medium" },
    { session: "rest",      load: "rest"   },
    { session: "run_long",  load: "high"   },
    { session: "rest",      load: "rest"   },
  ],
  running_hard: [
    { session: "run_easy",  load: "medium" },
    { session: "lift_push", load: "medium" },
    { session: "run_tempo", load: "medium" },
    { session: "run_easy",  load: "medium" },
    { session: "lift_pull", load: "medium" },
    { session: "run_long",  load: "high"   },
    { session: "rest",      load: "rest"   },
  ],
  running_peak: [
    { session: "run_easy",        load: "medium" },
    { session: "run_intervals",   load: "high"   },
    { session: "rest",            load: "rest"   },
    { session: "run_easy",        load: "medium" },
    { session: "lift_push",       load: "medium" },
    { session: "run_long",        load: "high"   },
    { session: "active_recovery", load: "low"    },
  ],
  strength: [
    { session: "lift_legs", load: "high"   },
    { session: "run_easy",  load: "medium" },
    { session: "lift_push", load: "medium" },
    { session: "run_easy",  load: "medium" },
    { session: "lift_pull", load: "medium" },
    { session: "run_long",  load: "high"   },
    { session: "rest",      load: "rest"   },
  ],
  growth: [
    { session: "run_easy",  load: "medium" },
    { session: "lift_push", load: "medium" },
    { session: "rest",      load: "rest"   },
    { session: "run_easy",  load: "medium" },
    { session: "lift_pull", load: "medium" },
    { session: "run_long",  load: "high"   },
    { session: "rest",      load: "rest"   },
  ],
  balanced: [
    { session: "run_easy",  load: "medium" },
    { session: "lift_push", load: "medium" },
    { session: "run_easy",  load: "medium" },
    { session: "lift_pull", load: "medium" },
    { session: "rest",      load: "rest"   },
    { session: "run_long",  load: "high"   },
    { session: "rest",      load: "rest"   },
  ],
  deload: [
    { session: "active_recovery", load: "low"    },
    { session: "lift_full",       load: "medium" },
    { session: "run_easy",        load: "medium" },
    { session: "rest",            load: "rest"   },
    { session: "lift_full",       load: "medium" },
    { session: "run_easy",        load: "medium" },
    { session: "rest",            load: "rest"   },
  ],
};

// ── Template selection ─────────────────────────────────────────────────────

function selectTemplate(
  primary:         AdaptiveGoalOutput["primaryProgression"],
  intensity:       string,
  tsb:             number,
  trainingProfile: string,
): string {
  if (primary === "recovery" || tsb < -20) return "recovery";

  if (primary === "running") {
    if (intensity === "Peak")     return "running_peak";
    if (intensity === "Hard")     return "running_hard";
    if (intensity === "Moderate") return "running_moderate";
    return "running_easy";
  }

  if (primary === "strength")  return "strength";
  if (primary === "growth")    return "growth";
  if (primary === "nutrition") return "balanced";

  // No clear primary — fall back on profile
  if (trainingProfile === "deload")   return "deload";
  if (trainingProfile === "running")  return "running_moderate";
  if (trainingProfile === "strength") return "strength";
  return "balanced";
}

// ── Post-template constraint enforcement ──────────────────────────────────

function applyConstraints(
  raw:            SlotDef[],
  tsb:            number,
  readinessScore: number | null,
  targetRuns:     number,
  targetLifts:    number,
): SlotDef[] {
  const slots = raw.map((s) => ({ ...s }));

  // Quality session eligibility gates
  const canIntervals = tsb >= 0   && (readinessScore ?? 50) >= 70;
  const canTempo     = tsb >= -10 && (readinessScore ?? 50) >= 55;

  for (let i = 0; i < 7; i++) {
    if (slots[i].session === "run_intervals" && !canIntervals) {
      slots[i] = canTempo
        ? { session: "run_tempo", load: "medium" }
        : { session: "run_easy",  load: "medium" };
    }
    if (slots[i].session === "run_tempo" && !canTempo) {
      slots[i] = { session: "run_easy", load: "medium" };
    }
  }

  // Friday leg day protection: lift_legs before Saturday long run creates too
  // much fatigue. Swap to push if the template placed it there.
  if (slots[4].session === "lift_legs" && slots[5].session === "run_long") {
    slots[4] = { session: "lift_push", load: "medium" };
  }

  // Trim excess runs (never remove long run; remove easy runs last)
  const RUN_SESSIONS: Set<SessionType> = new Set(["run_easy", "run_tempo", "run_intervals", "run_long"]);
  const currentRuns = slots.filter((s) => RUN_SESSIONS.has(s.session)).length;
  if (currentRuns > targetRuns) {
    let toRemove = currentRuns - targetRuns;
    for (let i = 6; i >= 0 && toRemove > 0; i--) {
      if (slots[i].session === "run_easy") {
        slots[i] = { session: "rest", load: "rest" };
        toRemove--;
      }
    }
  }

  // Trim excess lifts
  const LIFT_SESSIONS: Set<SessionType> = new Set(["lift_push", "lift_pull", "lift_legs", "lift_full"]);
  const currentLifts = slots.filter((s) => LIFT_SESSIONS.has(s.session)).length;
  if (currentLifts > targetLifts) {
    let toRemove = currentLifts - targetLifts;
    for (let i = 6; i >= 0 && toRemove > 0; i--) {
      if (LIFT_SESSIONS.has(slots[i].session)) {
        slots[i] = { session: "rest", load: "rest" };
        toRemove--;
      }
    }
  }

  // Consecutive high-load guard (no 3 in a row)
  for (let i = 0; i < 5; i++) {
    if (
      slots[i].load   === "high" &&
      slots[i+1].load === "high" &&
      slots[i+2]?.load === "high"
    ) {
      const mid = slots[i+1].session;
      if (mid === "run_intervals" || mid === "run_tempo") {
        slots[i+1] = { session: "run_easy", load: "medium" };
      } else if (mid === "lift_legs") {
        slots[i+1] = { session: "lift_full", load: "medium" };
      } else {
        slots[i+1] = { session: "active_recovery", load: "low" };
      }
    }
  }

  return slots;
}

// ── Session data builder ───────────────────────────────────────────────────

function buildSession(
  type:         SessionType,
  weeklyKm:     number,
  targetRuns:   number,
  hasQualRun:   boolean,
): PlannedSession {
  const safeKm   = Math.max(weeklyKm, 5);
  const longKm   = Math.round(safeKm * 0.38 * 10) / 10;
  const qualKm   = hasQualRun ? Math.round(safeKm * 0.20 * 10) / 10 : 0;
  const easyRuns = Math.max(1, targetRuns - 1 - (hasQualRun ? 1 : 0));
  const easyKm   = Math.round(((safeKm - longKm - qualKm) / easyRuns) * 10) / 10;

  switch (type) {
    case "run_long":
      return {
        type, label: "Long Run",
        durationMin: Math.max(30, Math.round(longKm * 5.5)),
        intensity: "Zone 2", distanceKm: longKm,
        notes: "Aerobic base building. Conversational pace throughout — last 10% at mid-Zone 2.",
      };
    case "run_easy":
      return {
        type, label: "Easy Run",
        durationMin: Math.max(20, Math.round(easyKm * 6)),
        intensity: "Zone 2", distanceKm: easyKm,
        notes: "Keep heart rate below 75% max. Fully conversational pace.",
      };
    case "run_tempo":
      return {
        type, label: "Tempo Run",
        durationMin: Math.max(35, Math.round(qualKm * 5.25 + 15)),
        intensity: "Zone 3–4", distanceKm: qualKm,
        notes: "Warm up 10 min easy, then 20–25 min at comfortably-hard threshold pace. Cool down 5 min.",
      };
    case "run_intervals":
      return {
        type, label: "Interval Session",
        durationMin: Math.max(40, Math.round(qualKm * 5.5 + 20)),
        intensity: "Zone 5", distanceKm: qualKm,
        notes: "8 min warm-up · 6–8 × 1 km at 5 km race pace · 90 s jog recovery · 5 min cool-down.",
      };
    case "lift_legs":
      return {
        type, label: "Lower Body",
        durationMin: 55, intensity: "RPE 7–8",
        notes: "Back squat, Romanian deadlift, Bulgarian split squat. Full rest between compound sets.",
      };
    case "lift_push":
      return {
        type, label: "Upper Push",
        durationMin: 50, intensity: "RPE 7–8",
        notes: "Bench press, overhead press, dips. Horizontal then vertical push patterns.",
      };
    case "lift_pull":
      return {
        type, label: "Upper Pull",
        durationMin: 50, intensity: "RPE 7–8",
        notes: "Barbell rows, pull-ups, face pulls. Emphasise posterior chain and scapular retraction.",
      };
    case "lift_full":
      return {
        type, label: "Full Body",
        durationMin: 45, intensity: "RPE 6–7",
        notes: "One compound per movement pattern: squat, hinge, push, pull. Quality over volume.",
      };
    case "active_recovery":
      return {
        type, label: "Active Recovery",
        durationMin: 30, intensity: "Low",
        notes: "20–30 min walk, yoga, or foam rolling. Keep heart rate below 60% max.",
      };
    default:
      return {
        type: "rest", label: "Rest",
        durationMin: 0, intensity: "None",
        notes: "Full rest day. Prioritise 8h sleep and maintain protein intake.",
      };
  }
}

// ── Growth block placement ─────────────────────────────────────────────────

function placeGrowthBlocks(
  sessions:      SessionType[],
  targetHours:   number,
  focusCategory: GrowthCategory,
): (PlannedGrowthBlock | null)[] {
  const blocks: (PlannedGrowthBlock | null)[] = new Array(7).fill(null);
  if (targetHours <= 0) return blocks;

  const HIGH_LOAD: Set<SessionType> = new Set(["run_intervals", "run_long", "lift_legs"]);

  // Build placement priority list
  // Tier 1: genuine rest days
  const tier1 = [0, 1, 2, 3, 4, 6].filter((i) => sessions[i] === "rest");
  // Tier 2: active_recovery days
  const tier2 = [0, 1, 2, 3, 4, 6].filter((i) => sessions[i] === "active_recovery");
  // Tier 3: light training days (not high-load)
  const tier3 = [0, 1, 2, 3, 4, 6].filter(
    (i) => !HIGH_LOAD.has(sessions[i]) && sessions[i] !== "rest" && sessions[i] !== "active_recovery",
  );

  const candidates = [...new Set([...tier1, ...tier2, ...tier3])];

  let remainingMin = Math.round(targetHours * 60);

  // Alternate: primary focus category → deep_work → focus → deep_work …
  const categorySequence: GrowthCategory[] = [
    focusCategory, "deep_work", focusCategory, "deep_work", focusCategory,
  ];

  let placed = 0;
  for (let ci = 0; ci < candidates.length && remainingMin >= 45; ci++) {
    const dayIndex = candidates[ci];
    const isRestLike = sessions[dayIndex] === "rest" || sessions[dayIndex] === "active_recovery";

    // Block duration: 90–120 min on rest days, 60–90 min on training days
    const maxBlock = isRestLike ? 120 : 90;
    const dur = Math.min(maxBlock, Math.max(45, remainingMin));
    if (dur < 45) break;

    const timing: PlannedGrowthBlock["timing"] = isRestLike ? "morning" : "evening";
    const category = categorySequence[placed % categorySequence.length];

    blocks[dayIndex] = {
      category,
      label:       GROWTH_LABELS[category],
      durationMin: dur,
      timing,
    };

    remainingMin -= dur;
    placed++;
  }

  return blocks;
}

// ── Per-day nutrition ──────────────────────────────────────────────────────

function buildDayNutrition(
  session:      SessionType,
  baseProteinG: number,
  baseCalsKcal: number,
): PlannedNutrition {
  const isHigh = session === "run_long" || session === "run_intervals" || session === "lift_legs";
  const isRest = session === "rest";

  const protMult = isHigh ? 1.10 : isRest ? 0.90 : 1.00;
  const calMult  = isHigh ? 1.10 : isRest ? 0.85 : 1.00;

  const proteinG     = Math.round(baseProteinG * protMult);
  const caloriesKcal = Math.round(baseCalsKcal * calMult);

  const highlight = isHigh
    ? `High-output day — fuel with ${proteinG}g protein across 4–5 meals.`
    : isRest
    ? `Rest day — ${proteinG}g protein, vegetable-rich meals, early cut-off.`
    : `Training day — hit ${proteinG}g protein and stay well hydrated.`;

  return { proteinG, caloriesKcal, highlight };
}

// ── Day priority ───────────────────────────────────────────────────────────

function dayPriority(session: SessionType): DayPriority {
  if (session === "rest")            return "REST";
  if (session === "active_recovery") return "RECOVERY";
  if (
    session === "run_long" ||
    session === "run_intervals" ||
    session === "lift_legs"
  ) return "HIGH";
  return "NORMAL";
}

// ── Week dates ─────────────────────────────────────────────────────────────

function getMondayOfWeek(todayStr: string): Date {
  const d = new Date(todayStr + "T00:00:00");
  const dow = d.getDay(); // 0=Sun … 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ── Plan balance ───────────────────────────────────────────────────────────

function scorePlanBalance(slots: SlotDef[]): { balance: PlanBalance; reason: string } {
  const hasRestDay = slots.some((s) => s.session === "rest");

  let maxConsecHigh = 0;
  let run = 0;
  for (const s of slots) {
    if (s.load === "high") { run++; maxConsecHigh = Math.max(maxConsecHigh, run); }
    else run = 0;
  }

  if (maxConsecHigh >= 3) {
    return {
      balance: "Needs Adjustment",
      reason:  `${maxConsecHigh} consecutive high-load days detected — insert a medium or rest day to reduce injury risk.`,
    };
  }
  if (!hasRestDay) {
    return {
      balance: "Needs Adjustment",
      reason:  "No full rest day in the schedule — add at least one to prevent cumulative overtraining.",
    };
  }
  if (maxConsecHigh >= 2) {
    return {
      balance: "Good",
      reason:  "Back-to-back high-intensity days present — ensure quality sleep and ≥150g protein on those days.",
    };
  }
  return {
    balance: "Excellent",
    reason:  "Well-distributed load with clear recovery spacing. Optimal adaptation stimulus.",
  };
}

// ── Week focus label ───────────────────────────────────────────────────────

function weekFocusMeta(
  primary: AdaptiveGoalOutput["primaryProgression"],
): { label: string; color: string } {
  switch (primary) {
    case "running":   return { label: "RUNNING WEEK",   color: "var(--accent)"     };
    case "strength":  return { label: "STRENGTH WEEK",  color: "var(--purple)"     };
    case "growth":    return { label: "GROWTH WEEK",    color: "var(--green)"      };
    case "nutrition": return { label: "NUTRITION WEEK", color: "var(--yellow)"     };
    case "recovery":  return { label: "RECOVERY WEEK",  color: "var(--red)"        };
    default:          return { label: "BALANCED WEEK",  color: "var(--text-muted)" };
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a deterministic 7-day training plan for the ISO week containing `today`.
 * No I/O. No side effects. Same inputs always produce the same output.
 */
export function computeWeekPlan(input: PlannerInput): WeekPlan {
  const { adaptiveGoals, tsb, readinessScore, today, trainingProfile } = input;
  const { primaryProgression: primary, running, strength, growth, nutrition } = adaptiveGoals;

  const targetRuns  = Math.max(1, Math.round(running.weeklyRuns.value));
  const targetLifts = Math.max(0, Math.round(strength.weeklySessions.value));
  const intensity   = running.intensity.label;

  // Select and constrain template
  const templateKey = selectTemplate(primary, intensity, tsb, trainingProfile);
  const rawSlots    = TEMPLATES[templateKey];
  const slots       = applyConstraints(rawSlots, tsb, readinessScore, targetRuns, targetLifts);

  // Detect quality run presence after constraint application
  const hasQualRun = slots.some(
    (s) => s.session === "run_intervals" || s.session === "run_tempo",
  );

  // Growth blocks
  const focusCategory = growth.categoryEmphasis.category as GrowthCategory;
  const growthBlocks  = placeGrowthBlocks(
    slots.map((s) => s.session),
    growth.weeklyHours.value,
    focusCategory,
  );

  // Nutrition base values
  const baseProtein = nutrition.protein.value;
  const baseCals    = nutrition.calories.value > 0 ? nutrition.calories.value : 2500;

  // Build week dates
  const monday = getMondayOfWeek(today);

  const days: PlannedDay[] = slots.map((slot, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = isoDate(date);

    const sess    = buildSession(slot.session, running.weeklyKm.value, targetRuns, hasQualRun);
    const nutDay  = buildDayNutrition(slot.session, baseProtein, baseCals);

    return {
      date:      dateStr,
      dayOfWeek: DAY_NAMES[i],
      shortDay:  SHORT_DAYS[i],
      dayIndex:  i,
      isToday:   dateStr === today,
      isPast:    dateStr < today,
      priority:  dayPriority(slot.session),
      load:      slot.load,
      sessions:  [sess],
      growth:    growthBlocks[i],
      nutrition: nutDay,
    };
  });

  const { balance, reason } = scorePlanBalance(slots);
  const { label: weekFocus, color: weekFocusColor } = weekFocusMeta(primary);

  const totalLiftSessions = slots.filter((s) =>
    s.session === "lift_push" ||
    s.session === "lift_pull" ||
    s.session === "lift_legs" ||
    s.session === "lift_full",
  ).length;

  return {
    weekStart:         isoDate(monday),
    weekEnd:           isoDate(new Date(monday.getTime() + 6 * 86400000)),
    days,
    weekFocus,
    weekFocusColor,
    planBalance:       balance,
    planBalanceReason: reason,
    totalRunKm:        running.weeklyKm.value,
    totalLiftSessions,
    totalGrowthHours:  growth.weeklyHours.value,
  };
}
