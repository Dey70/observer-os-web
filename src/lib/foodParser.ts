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

  // 1. Cache
  const { data: cached } = await (supabase as any)
    .from("food_cache")
    .select("*")
    .eq("query_normalized", normalized)
    .maybeSingle();

  if (cached) {
    // fire-and-forget last_used_at bump
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

  // 2. Open Food Facts (best for branded/packaged items)
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

  // 3. USDA FoodData Central (best for generic whole foods)
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

  // 4. AI estimation fallback (Groq)
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
  const prompt = `Estimate the nutrition for "${foodName}" per 100g of the prepared food. Respond with ONLY a JSON object, no markdown, no explanation, in this exact shape: {"calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number}. Use realistic values for a typical home/restaurant preparation.`;

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
    // Generic fallback if even the AI call fails — flagged low-confidence
    // by the caller never trusting "ai" blindly without this catch existing.
    return { calories: 200, protein: 5, carbs: 25, fat: 8, fiber: 2 };
  }
}

// ── Split a multi-item input into discrete food strings ──
// "chicken sandwich, apple, and a coffee with milk" → 3 items
function splitItems(input: string): string[] {
  return input
    .split(/,| and |\+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ── Extract an explicit gram/portion qualifier from an item string ──
// Returns the cleaned food name and a portion description for lookup.
function extractPortion(itemText: string): {
  name: string;
  portionDesc: string;
  explicitGrams: number | null;
} {
  // "200g chicken breast" / "150 g rice"
  const gramMatch = itemText.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (gramMatch) {
    const grams = parseFloat(gramMatch[1]);
    const name = itemText.replace(gramMatch[0], "").trim();
    return { name, portionDesc: `${grams}g`, explicitGrams: grams };
  }

  // "2 eggs" / "3 rotis" — countable units, approximate unit weight
  const countMatch = itemText.match(/^(\d+)\s+(.+)$/);
  if (countMatch) {
    const count = parseInt(countMatch[1], 10);
    const name = countMatch[2].trim();
    // rough unit-weight heuristics for common countables
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
    };
    const matchedUnit = Object.keys(unitWeights).find((u) => name.includes(u));
    const grams = matchedUnit ? unitWeights[matchedUnit] * count : 100 * count;
    return { name, portionDesc: `${count}x (${grams}g)`, explicitGrams: grams };
  }

  // size-word portions ("medium bowl of dal rice")
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
    const grams = estimatePortionGrams(matchedSize);
    const name = itemText.replace(new RegExp(matchedSize, "i"), "").trim();
    return { name, portionDesc: matchedSize, explicitGrams: grams };
  }

  // no quantity at all — flagged low-confidence by caller via the null name
  return {
    name: itemText.trim(),
    portionDesc: "~1 serving (assumed)",
    explicitGrams: null,
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
    const { name, portionDesc, explicitGrams } = extractPortion(itemText);
    if (!name) continue;

    const { source, confidence, per100g } = await getPer100g(
      name,
      supabase,
      groqApiKey,
    );
    const grams = explicitGrams ?? 250; // default single-serving if totally unspecified

    // Confidence downgrade: explicit grams stated by user → high regardless
    // of source; no quantity given at all → never above medium.
    const finalConfidence: FoodConfidence = explicitGrams
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
