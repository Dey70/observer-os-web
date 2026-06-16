// Nutrition Engine — TDEE, macro target calculation, daily breakdown.
// Pure functions only; no Supabase calls here (keeps this testable / reusable
// on both client and server).

import type { Session, DailyLog } from "@/types";

export type Sex = "male" | "female";
export type NutritionGoalType =
  | "bulk"
  | "cut"
  | "maintain"
  | "recomp"
  | "endurance";

export interface NutritionProfileInputs {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  goal_type: NutritionGoalType;
  target_weight_kg?: number | null;
  goal_deadline?: string | null; // ISO date
}

export interface DailyTargets {
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  fiber: number; // grams
  water: number; // ml
  bmr: number;
  tdee: number;
  activity_label: "rest" | "moderate" | "heavy";
  breakdown_reason: string;
}

const KCAL_PER_KG_FAT = 7700;
const MAX_DAILY_ADJUSTMENT = 500; // safety cap, kcal/day surplus or deficit

// ── 1. BMR — Mifflin-St Jeor ──
export function calcBMR(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

// ── 2. Activity add-on from today's actual sessions ──
// Returns extra kcal burned today based on logged sessions, plus a tier label
// used later for protein/carb multipliers.
function calcActivityAddOn(
  sessions: Session[],
  weightKg: number,
): { addOn: number; hasLift: boolean; hasRun: boolean; longestRunMin: number } {
  let addOn = 0;
  let hasLift = false;
  let hasRun = false;
  let longestRunMin = 0;

  for (const s of sessions) {
    if (s.type === "run") {
      hasRun = true;
      longestRunMin = Math.max(longestRunMin, s.duration);
      // MET-based estimate; ~8 MET for moderate running.
      // kcal = MET * weight(kg) * duration(hr)
      addOn += 8 * weightKg * (s.duration / 60);
    } else if (s.type === "lift") {
      hasLift = true;
      // Flat-ish range depending on duration; ~5 kcal/min as a reasonable estimate
      addOn += Math.min(450, s.duration * 5);
    }
    // study sessions: no calorie add-on, sedentary
  }

  return { addOn: Math.round(addOn), hasLift, hasRun, longestRunMin };
}

// ── 3. Calorie target from goal type ──
function calorieAdjustmentForGoal(
  goalType: NutritionGoalType,
  inputs: NutritionProfileInputs,
  tdee: number,
): { adjustment: number; reason: string } {
  // If we have a target weight and deadline, compute a required rate,
  // but always cap it at the safety limit.
  if (
    (goalType === "bulk" || goalType === "cut") &&
    inputs.target_weight_kg &&
    inputs.goal_deadline
  ) {
    const daysRemaining = Math.max(
      1,
      Math.ceil(
        (new Date(inputs.goal_deadline).getTime() - Date.now()) / 86400000,
      ),
    );
    const weightDeltaKg = inputs.target_weight_kg - inputs.weight_kg;
    const requiredDailyKcal = (weightDeltaKg * KCAL_PER_KG_FAT) / daysRemaining;
    const capped = Math.max(
      -MAX_DAILY_ADJUSTMENT,
      Math.min(MAX_DAILY_ADJUSTMENT, Math.round(requiredDailyKcal)),
    );
    return {
      adjustment: capped,
      reason:
        capped !== Math.round(requiredDailyKcal)
          ? "deadline-based rate capped at safe limit"
          : "deadline-based rate",
    };
  }

  switch (goalType) {
    case "bulk":
      return { adjustment: 350, reason: "lean bulk surplus" };
    case "cut":
      return { adjustment: -400, reason: "fat loss deficit" };
    case "recomp":
      return { adjustment: 0, reason: "recomposition — maintenance calories" };
    case "endurance":
      return { adjustment: 100, reason: "fueling for endurance performance" };
    case "maintain":
    default:
      return { adjustment: 0, reason: "maintenance" };
  }
}

// ── 4. Protein tier (g/kg bodyweight) ──
function proteinPerKg(
  goalType: NutritionGoalType,
  hasLift: boolean,
  hasRun: boolean,
): number {
  let base: number;
  if (hasLift && hasRun) base = 2.2;
  else if (hasLift) base = 2.0;
  else if (hasRun) base = 1.5;
  else base = 1.3; // rest / sedentary day

  if (goalType === "cut") base += 0.2; // spare muscle in a deficit
  return base;
}

// ── 5. Carb tier (g/kg bodyweight) ──
function carbsPerKg(
  hasLift: boolean,
  hasRun: boolean,
  longestRunMin: number,
): number {
  if (hasRun && longestRunMin >= 60) return 7; // heavy/long endurance day
  if (hasLift && hasRun) return 5.5;
  if (hasLift || hasRun) return 4.5;
  return 2.5; // rest day
}

// ── 6. Fiber & water ──
function calcFiber(calories: number): number {
  return Math.round((calories / 1000) * 14);
}

function calcWater(weightKg: number, sessionCount: number): number {
  return Math.round(weightKg * 35 + sessionCount * 300);
}

// ── Main entry point ──
export function calculateDailyTargets(
  inputs: NutritionProfileInputs,
  todaysSessions: Session[],
  todaysReadinessScore: number | null,
): DailyTargets {
  const bmr = calcBMR(
    inputs.sex,
    inputs.weight_kg,
    inputs.height_cm,
    inputs.age,
  );
  const { addOn, hasLift, hasRun, longestRunMin } = calcActivityAddOn(
    todaysSessions,
    inputs.weight_kg,
  );

  const sedentaryTdee = bmr * 1.2;
  const tdee = Math.round(sedentaryTdee + addOn);

  const { adjustment, reason } = calorieAdjustmentForGoal(
    inputs.goal_type,
    inputs,
    tdee,
  );
  // Never let calories drop below 1.1x BMR even in an aggressive cut
  const floor = Math.round(bmr * 1.1);
  const calories = Math.max(floor, tdee + adjustment);

  const proteinTier = proteinPerKg(inputs.goal_type, hasLift, hasRun);
  const protein = Math.round(inputs.weight_kg * proteinTier);

  const carbTier = carbsPerKg(hasLift, hasRun, longestRunMin);
  let carbs = Math.round(inputs.weight_kg * carbTier);
  let readinessNote = "";
  if (todaysReadinessScore !== null && todaysReadinessScore < 5) {
    carbs += 18; // glycogen replenishment priority on low-readiness days
    readinessNote = ", carbs raised for low readiness";
  }

  // Fat: floor of 0.6g/kg, then fill remaining calories after protein+carbs
  const fatFloor = Math.round(inputs.weight_kg * 0.6);
  const remainingKcalForFat = calories - protein * 4 - carbs * 4;
  const fat = Math.max(fatFloor, Math.round(remainingKcalForFat / 9));

  const fiber = calcFiber(calories);
  const water = calcWater(inputs.weight_kg, todaysSessions.length);

  const activityLabel: DailyTargets["activity_label"] =
    hasLift && hasRun ? "heavy" : hasLift || hasRun ? "moderate" : "rest";

  const activityDesc =
    hasLift && hasRun
      ? "lift + run day"
      : hasLift
        ? "lift day"
        : hasRun
          ? longestRunMin >= 60
            ? "long run day"
            : "run day"
          : "rest day";

  const breakdown_reason = `${activityDesc} (${reason}): protein ${protein}g, carbs ${carbs}g${readinessNote}, fat ${fat}g floor-adjusted`;

  return {
    calories,
    protein,
    carbs,
    fat,
    fiber,
    water,
    bmr: Math.round(bmr),
    tdee,
    activity_label: activityLabel,
    breakdown_reason,
  };
}

// ── Helper: derive today's readiness score from a DailyLog, if present ──
export function readinessFromLog(log: DailyLog | null): number | null {
  if (!log) return null;
  // Mirrors calcReadiness in utils.ts without importing it (avoids coupling
  // this pure module to UI color/label concerns).
  const score =
    log.sleep_quality * 0.3 +
    log.mood * 0.2 +
    log.energy * 0.2 +
    (10 - log.soreness) * 0.15 +
    (10 - log.fatigue) * 0.15;
  return Math.round(score * 10) / 10;
}

// ── Portion-size lookup table (flat, cuisine-agnostic v1) ──
export const PORTION_SIZE_GRAMS: Record<string, number> = {
  "small bowl": 175,
  "medium bowl": 275,
  "large bowl": 375,
  bowl: 275,
  handful: 30,
  plate: 325,
  "small plate": 225,
  "large plate": 400,
  cup: 240,
  glass: 240,
  slice: 35,
  piece: 50,
};

export function estimatePortionGrams(description: string): number {
  const normalized = description.toLowerCase().trim();
  if (PORTION_SIZE_GRAMS[normalized]) return PORTION_SIZE_GRAMS[normalized];
  for (const [key, grams] of Object.entries(PORTION_SIZE_GRAMS)) {
    if (normalized.includes(key)) return grams;
  }
  return 250; // generic single-serving fallback
}
