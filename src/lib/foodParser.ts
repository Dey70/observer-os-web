// Food parsing pipeline — resolves free-text food descriptions into macro
// data. Strategy: food_cache → Open Food Facts → USDA → AI estimation.
// Used server-side only (calls external APIs + Groq).

import type { SupabaseClient } from "@supabase/supabase-js";
import { estimatePortionGrams } from "./nutritionEngine";

export type FoodConfidence = "high" | "medium" | "low";
export type FoodSource = "off" | "usda" | "ai" | "manual";

export interface ParsedFoodItem {
  name: string;
  portion_desc: string;
  grams: number;
  confidence: FoodConfidence;
  source: FoodSource;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface MealParseResult {
  items: ParsedFoodItem[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
}

function normalizeQuery(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, " ");
}

// ── Known supplements lookup ──
interface SupplementMatch {
  match: (q: string) => boolean;
  perServing: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  servingGrams: number;
  label: string;
}

const SUPPLEMENTS: SupplementMatch[] = [
  {
    match: (q) => /\bcreatine\b/.test(q),
    perServing: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    servingGrams: 5,
    label: "Creatine",
  },
  {
    match: (q) => /\b(bcaa|branch chain amino)/.test(q),
    perServing: { calories: 10, protein: 2.5, carbs: 0, fat: 0, fiber: 0 },
    servingGrams: 7,
    label: "BCAA",
  },
  {
    match: (q) => /\b(eaa|essential amino)/.test(q),
    perServing: { calories: 15, protein: 4, carbs: 0, fat: 0, fiber: 0 },
    servingGrams: 10,
    label: "EAA",
  },
  {
    match: (q) => /\b(electrolyte|ors|hydration salt|rehydration)/.test(q),
    perServing: { calories: 5, protein: 0, carbs: 1, fat: 0, fiber: 0 },
    servingGrams: 5,
    label: "Electrolytes",
  },
  {
    match: (q) => /\b(multivitamin|multi-vitamin|daily vitamin)/.test(q),
    perServing: { calories: 5, protein: 0, carbs: 1, fat: 0, fiber: 0 },
    servingGrams: 1,
    label: "Multivitamin",
  },
  {
    match: (q) => /\b(fish oil|omega.?3)/.test(q),
    perServing: { calories: 9, protein: 0, carbs: 0, fat: 1, fiber: 0 },
    servingGrams: 1,
    label: "Fish oil",
  },
  {
    match: (q) => /\bglutamine\b/.test(q),
    perServing: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    servingGrams: 5,
    label: "Glutamine",
  },
  {
    match: (q) => /\b(pre.?workout)\b/.test(q),
    perServing: { calories: 5, protein: 0, carbs: 1, fat: 0, fiber: 0 },
    servingGrams: 8,
    label: "Pre-workout",
  },
  {
    match: (q) =>
      /\b(whey protein|protein powder|protein scoop|protein shake)\b/.test(q),
    perServing: { calories: 120, protein: 24, carbs: 3, fat: 1.5, fiber: 0 },
    servingGrams: 30,
    label: "Whey protein",
  },
];

function matchSupplement(foodName: string): SupplementMatch | null {
  const normalized = normalizeQuery(foodName);
  return SUPPLEMENTS.find((s) => s.match(normalized)) ?? null;
}

// ── Per-100g macro lookup, tried in order: cache → OFF → USDA → AI ──
async function getPer100g(
  foodName: string,
  supabase: SupabaseClient,
  groqApiKey: string,
): Promise<{
  source: FoodSource;
  confidence: FoodConfidence;
  per100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
}> {
  const normalized = normalizeQuery(foodName);

  const { data: cached } = await (supabase as any)
    .from("food_cache")
    .select("*")
    .eq("query_normalized", normalized)
    .maybeSingle();

  if (cached) {
    (supabase as any)
      .from("food_cache")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", cached.id)
      .then(() => {});
    return {
      source: cached.source,
      confidence: cached.source === "ai" ? "medium" : "high",
      per100g: {
        calories: cached.calories_per_100g,
        protein: cached.protein_per_100g,
        carbs: cached.carbs_per_100g,
        fat: cached.fat_per_100g,
        fiber: cached.fiber_per_100g,
      },
    };
  }

  try {
    const offRes = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
        foodName,
      )}&search_simple=1&action=process&json=1&page_size=1`,
    );
    if (offRes.ok) {
      const offData = await offRes.json();
      const product = offData?.products?.[0];
      const n = product?.nutriments;
      if (n && (n["energy-kcal_100g"] || n["energy-kcal_serving"])) {
        const per100g = {
          calories: n["energy-kcal_100g"] ?? 0,
          protein: n["proteins_100g"] ?? 0,
          carbs: n["carbohydrates_100g"] ?? 0,
          fat: n["fat_100g"] ?? 0,
          fiber: n["fiber_100g"] ?? 0,
        };
        await cacheResult(supabase, normalized, "off", per100g);
        return { source: "off", confidence: "high", per100g };
      }
    }
  } catch {
    // fall through to next source
  }

  const usdaKey = process.env.USDA_API_KEY;
  if (usdaKey) {
    try {
      const usdaRes = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${usdaKey}&query=${encodeURIComponent(
          foodName,
        )}&pageSize=1`,
      );
      if (usdaRes.ok) {
        const usdaData = await usdaRes.json();
        const food = usdaData?.foods?.[0];
        if (food?.foodNutrients) {
          const findNutrient = (name: string) =>
            food.foodNutrients.find((n: any) =>
              n.nutrientName?.toLowerCase().includes(name),
            )?.value ?? 0;
          const per100g = {
            calories: findNutrient("energy"),
            protein: findNutrient("protein"),
            carbs: findNutrient("carbohydrate"),
            fat: findNutrient("total lipid"),
            fiber: findNutrient("fiber"),
          };
          if (per100g.calories > 0) {
            await cacheResult(supabase, normalized, "usda", per100g);
            return { source: "usda", confidence: "high", per100g };
          }
        }
      }
    } catch {
      // fall through to AI
    }
  }

  const aiResult = await estimateWithAI(foodName, groqApiKey);
  await cacheResult(supabase, normalized, "ai", aiResult);
  return { source: "ai", confidence: "medium", per100g: aiResult };
}

async function cacheResult(
  supabase: SupabaseClient,
  normalized: string,
  source: FoodSource,
  per100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  },
) {
  if (source === "manual") return;
  try {
    await (supabase as any).from("food_cache").upsert(
      {
        query_normalized: normalized,
        source,
        calories_per_100g: per100g.calories,
        protein_per_100g: per100g.protein,
        carbs_per_100g: per100g.carbs,
        fat_per_100g: per100g.fat,
        fiber_per_100g: per100g.fiber,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "query_normalized" },
    );
  } catch {
    // cache write failures are non-fatal
  }
}

// Grounding the AI with known reference points measurably reduces wild
// hallucinations for common foods — without this, a small model has no
// anchor and can guess protein density that's off by 5x for something as
// basic as rice.
async function estimateWithAI(
  foodName: string,
  groqApiKey: string,
): Promise<{
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}> {
  const prompt = `Estimate the nutrition for "${foodName}" per 100g of the prepared food. Be realistic and grounded in known nutrition data — for reference, cooked white rice is about 130 kcal and 2.7g protein per 100g, plain non-starchy vegetables are about 20-40 kcal and 1-3g protein per 100g, cooked lentils/dal are about 115 kcal and 9g protein per 100g, and cooked lean meat is about 150-200 kcal and 20-30g protein per 100g. Don't overestimate protein for plant foods. Respond with ONLY a JSON object, no markdown, no explanation, in this exact shape: {"calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number}. Use realistic values for a typical home/restaurant preparation.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 150,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error("Groq estimation failed");
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      calories: Number(parsed.calories) || 200,
      protein: Number(parsed.protein) || 5,
      carbs: Number(parsed.carbs) || 25,
      fat: Number(parsed.fat) || 8,
      fiber: Number(parsed.fiber) || 2,
    };
  } catch {
    return { calories: 200, protein: 5, carbs: 25, fat: 8, fiber: 2 };
  }
}

// ── Split a multi-item input into discrete food strings ──
function splitItems(input: string): string[] {
  return input
    .split(/,| and |\+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Strip filler/connector words ("had", "a little bit of", "of") from the
// front of a food name. Runs in a loop so combos like "had a little bit of"
// get fully cleaned, not just the first phrase matched. This also matters
// for lookup quality — a messy name like "had half a of rice" won't match
// well in OFF/USDA, forcing a worse AI fallback; a clean "rice" will.
const FILLER_PREFIXES = [
  /^i\s+had\s+/i,
  /^i\s+ate\s+/i,
  /^had\s+/i,
  /^ate\s+/i,
  /^a\s+little\s+bit\s+of\s+/i,
  /^a\s+little\s+of\s+/i,
  /^a\s+bit\s+of\s+/i,
  /^a\s+small\s+amount\s+of\s+/i,
  /^some\s+/i,
  /^a\s+/i,
  /^an\s+/i,
  /^the\s+/i,
  /^of\s+/i,
];

function cleanFoodName(raw: string): string {
  let text = raw.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of FILLER_PREFIXES) {
      if (pattern.test(text)) {
        text = text.replace(pattern, "").trim();
        changed = true;
      }
    }
  }
  return text.replace(/\s{2,}/g, " ").trim();
}

// ── Fraction modifiers ("half a plate", "quarter bowl") ──
function detectFractionMultiplier(text: string): number {
  const lower = text.toLowerCase();
  if (/\bone and a half\b/.test(lower)) return 1.5;
  if (/\bhalf\b/.test(lower)) return 0.5;
  if (/\bquarter\b/.test(lower)) return 0.25;
  return 1;
}

// ── Diminutive language ("a little bit of papad") — clearly small, should
// never fall through to the generic "unspecified serving" default.
const DIMINUTIVE_PATTERN =
  /\b(a\s+little\s+bit\s+of|a\s+little\s+of|a\s+bit\s+of|a\s+small\s+amount\s+of|a\s+pinch\s+of|a\s+dash\s+of)\b/i;
const DIMINUTIVE_GRAMS = 40;

// ── Extract an explicit gram/portion qualifier from an item string ──
function extractPortion(itemText: string): {
  name: string;
  portionDesc: string;
  explicitGrams: number | null;
  isApproximate: boolean;
} {
  const gramMatch = itemText.match(/(\d+(?:\.\d+)?)\s*gm?\b/i);
  if (gramMatch) {
    const grams = parseFloat(gramMatch[1]);
    const name = cleanFoodName(itemText.replace(gramMatch[0], ""));
    return {
      name,
      portionDesc: `${grams}g`,
      explicitGrams: grams,
      isApproximate: false,
    };
  }

  const countMatch = itemText.match(/^(\d+)\s+(.+)$/);
  if (countMatch) {
    const count = parseInt(countMatch[1], 10);
    const name = cleanFoodName(countMatch[2]);
    const unitWeights: Record<string, number> = {
      egg: 50,
      eggs: 50,
      roti: 40,
      rotis: 40,
      chapati: 40,
      banana: 120,
      apple: 180,
      slice: 35,
      slices: 35,
      piece: 100,
      pieces: 100,
    };
    const matchedUnit = Object.keys(unitWeights).find((u) => name.includes(u));
    const grams = matchedUnit ? unitWeights[matchedUnit] * count : 100 * count;
    return {
      name,
      portionDesc: `${count}x (${grams}g)`,
      explicitGrams: grams,
      isApproximate: false,
    };
  }

  if (DIMINUTIVE_PATTERN.test(itemText)) {
    const name = cleanFoodName(itemText.replace(DIMINUTIVE_PATTERN, ""));
    return {
      name,
      portionDesc: `a little (≈${DIMINUTIVE_GRAMS}g, estimated)`,
      explicitGrams: DIMINUTIVE_GRAMS,
      isApproximate: true,
    };
  }

  const sizeWords = [
    "small bowl",
    "medium bowl",
    "large bowl",
    "small plate",
    "large plate",
    "plate",
    "bowl",
    "handful",
    "cup",
    "glass",
  ];
  const lower = itemText.toLowerCase();
  const matchedSize = sizeWords.find((w) => lower.includes(w));
  if (matchedSize) {
    const fraction = detectFractionMultiplier(itemText);
    const baseGrams = estimatePortionGrams(matchedSize);
    const grams = Math.round(baseGrams * fraction);
    const name = cleanFoodName(
      itemText.replace(new RegExp(matchedSize, "i"), ""),
    );
    const fractionLabel =
      fraction === 0.5
        ? " (half)"
        : fraction === 0.25
          ? " (quarter)"
          : fraction === 1.5
            ? " (1.5x)"
            : "";
    return {
      name,
      portionDesc: `${matchedSize}${fractionLabel}`,
      explicitGrams: grams,
      isApproximate: fraction !== 1,
    };
  }

  return {
    name: cleanFoodName(itemText),
    portionDesc: "~1 serving (assumed)",
    explicitGrams: null,
    isApproximate: true,
  };
}

export async function parseMeal(
  rawInput: string,
  supabase: SupabaseClient,
  groqApiKey: string,
): Promise<MealParseResult> {
  const itemTexts = splitItems(rawInput);
  const items: ParsedFoodItem[] = [];

  for (const itemText of itemTexts) {
    const { name, portionDesc, explicitGrams, isApproximate } =
      extractPortion(itemText);
    if (!name) continue;

    const supplement = matchSupplement(name) ?? matchSupplement(itemText);
    if (supplement) {
      items.push({
        name: supplement.label,
        portion_desc: explicitGrams ? `${explicitGrams}g` : "1 serving",
        grams: explicitGrams ?? supplement.servingGrams,
        confidence: "high",
        source: "manual",
        calories: supplement.perServing.calories,
        protein: supplement.perServing.protein,
        carbs: supplement.perServing.carbs,
        fat: supplement.perServing.fat,
        fiber: supplement.perServing.fiber,
      });
      continue;
    }

    const { source, confidence, per100g } = await getPer100g(
      name,
      supabase,
      groqApiKey,
    );
    // Lowered from 250 — most unquantified mentions in a multi-item meal
    // description are sides/accompaniments, not full standalone servings.
    const grams = explicitGrams ?? 100;

    const finalConfidence: FoodConfidence =
      explicitGrams && !isApproximate
        ? confidence
        : confidence === "high"
          ? "medium"
          : confidence;

    const factor = grams / 100;
    items.push({
      name,
      portion_desc: portionDesc,
      grams,
      confidence: finalConfidence,
      source,
      calories: Math.round(per100g.calories * factor),
      protein: Math.round(per100g.protein * factor * 10) / 10,
      carbs: Math.round(per100g.carbs * factor * 10) / 10,
      fat: Math.round(per100g.fat * factor * 10) / 10,
      fiber: Math.round(per100g.fiber * factor * 10) / 10,
    });
  }

  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
      fiber: acc.fiber + item.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );

  return { items, totals };
}
