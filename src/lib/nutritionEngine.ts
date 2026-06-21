// src/lib/nutritionEngine.ts
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
  bmi: number;
  bmi_category: BMICategory;
}

export type BMICategory = "underweight" | "normal" | "overweight" | "obese";

export function calcBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function bmiCategory(bmi: number): BMICategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}

const KCAL_PER_KG_FAT = 7700;
const MAX_DAILY_ADJUSTMENT = 500;

export function calcBMR(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

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
      addOn += 8 * weightKg * (s.duration / 60);
    } else if (s.type === "lift") {
      hasLift = true;
      addOn += Math.min(450, s.duration * 5);
    }
  }

  return { addOn: Math.round(addOn), hasLift, hasRun, longestRunMin };
}

function calorieAdjustmentForGoal(
  goalType: NutritionGoalType,
  inputs: NutritionProfileInputs,
  tdee: number,
): { adjustment: number; reason: string } {
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

function proteinPerKg(
  goalType: NutritionGoalType,
  hasLift: boolean,
  hasRun: boolean,
): number {
  let base: number;
  if (hasLift && hasRun) base = 2.2;
  else if (hasLift) base = 2.0;
  else if (hasRun) base = 1.5;
  else base = 1.3;

  if (goalType === "cut") base += 0.2;
  return base;
}

function carbsPerKg(
  hasLift: boolean,
  hasRun: boolean,
  longestRunMin: number,
): number {
  if (hasRun && longestRunMin >= 60) return 7;
  if (hasLift && hasRun) return 5.5;
  if (hasLift || hasRun) return 4.5;
  return 2.5;
}

function calcFiber(calories: number): number {
  return Math.round((calories / 1000) * 14);
}

// Tiered (not continuous) on purpose, to match the rest of this file's
// style, and capped at +750ml so an extreme heat reading can't push the
// target into unreasonable territory. Worst-case stack (heavy session day
// + creatine + heatwave) still lands ~5-6L/day — normal sports-science
// range for heavy exercisers in heat, not hyponatremia risk.
function calcHeatAddOn(tempC: number | null): number {
  if (tempC === null) return 0;
  if (tempC >= 35) return 750;
  if (tempC >= 30) return 500;
  if (tempC >= 25) return 250;
  return 0;
}

function calcWater(
  weightKg: number,
  sessionCount: number,
  tookCreatine: boolean,
  currentTempC: number | null = null,
): number {
  const base = Math.round(weightKg * 35 + sessionCount * 300);
  const creatineAddOn = tookCreatine ? 750 : 0;
  const heatAddOn = calcHeatAddOn(currentTempC);
  return base + creatineAddOn + heatAddOn;
}

export function calculateDailyTargets(
  inputs: NutritionProfileInputs,
  todaysSessions: Session[],
  todaysReadinessScore: number | null,
  tookCreatine: boolean = false,
  currentTempC: number | null = null,
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
  const floor = Math.round(bmr * 1.1);
  const calories = Math.max(floor, tdee + adjustment);

  const proteinTier = proteinPerKg(inputs.goal_type, hasLift, hasRun);
  const protein = Math.round(inputs.weight_kg * proteinTier);

  const carbTier = carbsPerKg(hasLift, hasRun, longestRunMin);
  let carbs = Math.round(inputs.weight_kg * carbTier);
  let readinessNote = "";
  if (todaysReadinessScore !== null && todaysReadinessScore < 5) {
    carbs += 18;
    readinessNote = ", carbs raised for low readiness";
  }

  const fatFloor = Math.round(inputs.weight_kg * 0.6);
  const remainingKcalForFat = calories - protein * 4 - carbs * 4;
  const fat = Math.max(fatFloor, Math.round(remainingKcalForFat / 9));

  const fiber = calcFiber(calories);
  const water = calcWater(
    inputs.weight_kg,
    todaysSessions.length,
    tookCreatine,
    currentTempC,
  );

  const bmi = calcBMI(inputs.weight_kg, inputs.height_cm);

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

  const creatineNote = tookCreatine ? ", water raised for creatine intake" : "";
  const heatNote =
    currentTempC !== null && currentTempC >= 25
      ? `, water raised for hot weather (${Math.round(currentTempC)}°C)`
      : "";
  const breakdown_reason = `${activityDesc} (${reason}): protein ${protein}g, carbs ${carbs}g${readinessNote}, fat ${fat}g floor-adjusted${creatineNote}${heatNote}`;

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
    bmi,
    bmi_category: bmiCategory(bmi),
  };
}

export function readinessFromLog(log: DailyLog | null): number | null {
  if (!log) return null;
  const score =
    log.sleep_quality * 0.3 +
    log.mood * 0.2 +
    log.energy * 0.2 +
    (10 - log.soreness) * 0.15 +
    (10 - log.fatigue) * 0.15;
  return Math.round(score * 10) / 10;
}

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
  scoop: 30,
  scoops: 30,
};

export function estimatePortionGrams(description: string): number {
  const normalized = description.toLowerCase().trim();
  if (PORTION_SIZE_GRAMS[normalized]) return PORTION_SIZE_GRAMS[normalized];
  for (const [key, grams] of Object.entries(PORTION_SIZE_GRAMS)) {
    if (normalized.includes(key)) return grams;
  }
  return 250;
}
