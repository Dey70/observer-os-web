// src/lib/foodParser.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { estimatePortionGrams } from "./nutritionEngine";

export type FoodConfidence = "verified" | "learned" | "high" | "medium" | "low";
export type FoodSource = "off" | "usda" | "ai" | "manual" | "user";

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
  times_used?: number;
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

interface GenericFoodMatch {
  match: (q: string) => boolean;
  per100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  label: string;
}

const GENERIC_FOODS: GenericFoodMatch[] = [
  // ── Whole foods: always prefer these over cache/OFF for accuracy ──────────
  {
    match: (q) => /\beggs?\b/.test(q) && !/\b(fried\s+rice|mayo|mayonnaise|scotch)\b/.test(q),
    per100g: { calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0 },
    label: "Egg",
  },
  {
    match: (q) => /\bbananas?\b/.test(q),
    per100g: { calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6 },
    label: "Banana",
  },
  {
    match: (q) => /\bchicken\s+breast\b/.test(q),
    per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
    label: "Chicken breast",
  },
  {
    match: (q) =>
      /\brice\b/.test(q) &&
      !/\b(fried\s+rice|biryani|pulao|pilaf)\b/.test(q),
    per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 },
    label: "Cooked rice",
  },
  {
    match: (q) =>
      /\b(daal?|lentils?|masoor|chana\s+dal|moong\s+dal|toor\s+dal|urad\s+dal)\b/.test(q),
    per100g: { calories: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 8 },
    label: "Dal (cooked lentils)",
  },
  {
    match: (q) =>
      /\bmilk\b/.test(q) &&
      !/\b(milkshake|condensed|evaporated|coconut\s+milk|almond\s+milk|oat\s+milk|soy\s+milk)\b/.test(q),
    per100g: { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0 },
    label: "Milk",
  },
  {
    match: (q) =>
      /\boats?\b/.test(q) &&
      !/\b(granola|oat\s+milk|oat\s+bar|flapjack)\b/.test(q),
    per100g: { calories: 71, protein: 2.5, carbs: 12, fat: 1.4, fiber: 1.7 },
    label: "Oats (cooked)",
  },
  {
    match: (q) => /\bapples?\b/.test(q),
    per100g: { calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4 },
    label: "Apple",
  },
  {
    match: (q) => /\b(roti|chapati|chapatti)\b/.test(q),
    per100g: { calories: 297, protein: 9, carbs: 55, fat: 5, fiber: 4.7 },
    label: "Roti",
  },
  {
    match: (q) => /\bpaneer\b/.test(q),
    per100g: { calories: 265, protein: 18, carbs: 1.2, fat: 21, fiber: 0 },
    label: "Paneer",
  },
  {
    match: (q) => /\b(curd|dahi|yoghurt?)\b/.test(q),
    per100g: { calories: 59, protein: 3.5, carbs: 3.4, fat: 3.3, fiber: 0 },
    label: "Curd / yogurt",
  },
  {
    match: (q) =>
      /\bpotatoes?\b/.test(q) &&
      !/\b(sweet\s+potato|chips|fries|crisps)\b/.test(q),
    per100g: { calories: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2 },
    label: "Potato (cooked)",
  },
  {
    match: (q) => /\bsweet\s+potato\b/.test(q),
    per100g: { calories: 86, protein: 1.6, carbs: 20, fat: 0.1, fiber: 3 },
    label: "Sweet potato (cooked)",
  },
  {
    match: (q) =>
      /\b(bread|toast)\b/.test(q) &&
      !/\b(sandwich|burger|naan)\b/.test(q),
    per100g: { calories: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7 },
    label: "White bread",
  },
  {
    match: (q) => /\btofu\b/.test(q),
    per100g: { calories: 76, protein: 8, carbs: 1.9, fat: 4.8, fiber: 0.3 },
    label: "Tofu",
  },
  // ── Generic dishes ────────────────────────────────────────────────────────
  {
    match: (q) =>
      /\b(mixed\s+)?(veggies|vegetables|greens)\b/.test(q) &&
      !/\b(curry|fry|fried|gravy|stir.?fry|sabzi|sabji|roasted|grilled)\b/.test(q),
    per100g: { calories: 35, protein: 2, carbs: 6, fat: 0.4, fiber: 2.5 },
    label: "Mixed vegetables",
  },
  {
    match: (q) =>
      /\bsalad\b/.test(q) &&
      !/\b(dressing|mayo|cheese|chicken|tuna|egg|paneer)\b/.test(q),
    per100g: { calories: 25, protein: 1.5, carbs: 4, fat: 0.3, fiber: 2 },
    label: "Plain salad",
  },
];

function matchGenericFood(foodName: string): GenericFoodMatch | null {
  const normalized = normalizeQuery(foodName);
  return GENERIC_FOODS.find((g) => g.match(normalized)) ?? null;
}

function scoreOFFProductName(
  productName: string | undefined,
  query: string,
): number {
  if (!productName) return 0;
  const pn = productName.toLowerCase().trim();
  const q = query.toLowerCase().trim();
  if (pn === q) return 100;
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return pn.includes(q) ? 50 : 0;
  const matched = words.filter((w) => pn.includes(w));
  return Math.round((matched.length / words.length) * 60);
}

async function getPer100g(
  foodName: string,
  supabase: SupabaseClient,
  groqApiKey: string,
): Promise<{
  source: FoodSource;
  confidence: FoodConfidence;
  times_used?: number;
  per100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
}> {
  const normalized = normalizeQuery(foodName);

  // 1. User's personal food dictionary — highest priority.
  // RLS filters to the current user automatically.
  {
    const { data: byName } = await (supabase as any)
      .from("user_foods")
      .select("*")
      .eq("name", normalized)
      .maybeSingle();

    const { data: byAlias } = !byName
      ? await (supabase as any)
          .from("user_foods")
          .select("*")
          .contains("aliases", [normalized])
          .maybeSingle()
      : { data: null };

    const userFood = byName ?? byAlias;
    if (userFood) {
      (supabase as any)
        .from("user_foods")
        .update({
          times_used: userFood.times_used + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", userFood.id)
        .then(() => {});
      return {
        source: "user" as FoodSource,
        confidence: userFood.confidence as FoodConfidence,
        times_used: userFood.times_used as number,
        per100g: {
          calories: userFood.calories_per_100g,
          protein: userFood.protein_per_100g,
          carbs: userFood.carbs_per_100g,
          fat: userFood.fat_per_100g,
          fiber: userFood.fiber_per_100g,
        },
      };
    }
  }

  const { data: cached } = await (supabase as any)
    .from("food_cache")
    .select("*")
    .eq("query_normalized", normalized)
    .maybeSingle();

  if (cached) {
    // Detect internally inconsistent cache entries (e.g. a complex dish cached
    // under a simple food name): if macro-derived calories diverge >30% from
    // the stated calories the entry is untrustworthy — delete and re-fetch.
    const expectedCals =
      cached.protein_per_100g * 4 +
      cached.carbs_per_100g * 4 +
      cached.fat_per_100g * 9;
    const divergence =
      Math.abs(cached.calories_per_100g - expectedCals) /
      Math.max(cached.calories_per_100g, 1);
    if (divergence > 0.3) {
      (supabase as any)
        .from("food_cache")
        .delete()
        .eq("id", cached.id)
        .then(() => {});
      // fall through to re-fetch
    } else {
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
  }

  const usdaKey = process.env.USDA_API_KEY;

  // When USDA is configured, use it first and skip OFF entirely.
  // USDA (lab-measured whole foods) is far more accurate than OFF
  // (crowdsourced packaged products) for common meal ingredients.
  if (usdaKey) {
    try {
      const usdaRes = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${usdaKey}&query=${encodeURIComponent(
          foodName,
        )}&pageSize=3&dataType=Survey%20(FNDDS),SR%20Legacy,Foundation`,
      );
      if (usdaRes.ok) {
        const usdaData = await usdaRes.json();
        // Pick the first result that has a meaningful calorie value
        for (const food of usdaData?.foods ?? []) {
          if (!food?.foodNutrients) continue;
          const findNutrient = (term: string) =>
            food.foodNutrients.find((n: any) =>
              n.nutrientName?.toLowerCase().includes(term),
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
  } else {
    // No USDA key — fall back to OFF (packaged product database).
    // Fetch 5 candidates, score by name similarity, and reject implausibly
    // high-calorie products to avoid caching wrong matches (e.g. "banana"
    // returning banana chips at 500 kcal/100g instead of fresh banana at 89).
    try {
      const offRes = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
          foodName,
        )}&search_simple=1&action=process&json=1&page_size=5`,
      );
      if (offRes.ok) {
        const offData = await offRes.json();
        // Oils, nuts, and butter legitimately exceed 600 kcal/100g.
        const isFatFood =
          /\b(oil|ghee|butter|lard|mayo|mayonnaise|peanut\s+butter|tahini|coconut\s+cream|coconut\s+oil|almonds?|cashews?|walnuts?|peanuts?)\b/i.test(
            foodName,
          );
        const candidates: Array<{ product: any; score: number }> = (
          offData?.products ?? []
        )
          .filter((p: any) => {
            const cal = p?.nutriments?.["energy-kcal_100g"];
            return cal && cal > 0 && (isFatFood || cal <= 900);
          })
          .map((p: any) => ({
            product: p,
            score: scoreOFFProductName(p.product_name, foodName),
          }))
          .filter((c: { product: any; score: number }) => c.score > 0)
          .sort(
            (
              a: { product: any; score: number },
              b: { product: any; score: number },
            ) => b.score - a.score,
          );

        if (candidates.length > 0) {
          const n = candidates[0].product.nutriments;
          const per100g = {
            calories: n["energy-kcal_100g"],
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

function splitItems(input: string): string[] {
  return input
    .split(/,| and |\+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

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

const FILLER_SUFFIXES = [
  /\s+for\s+(breakfast|lunch|dinner|snack|supper|brunch)\s*$/i,
  /\s+after\s+(workout|gym|run|training|exercise|lifting)\s*$/i,
  /\s+before\s+(workout|gym|run|training|exercise|bed|sleep)\s*$/i,
  /\s+in\s+(the\s+)?(morning|afternoon|evening|night)\s*$/i,
  /\s+at\s+(breakfast|lunch|dinner|night)\s*$/i,
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
    for (const pattern of FILLER_SUFFIXES) {
      if (pattern.test(text)) {
        text = text.replace(pattern, "").trim();
        changed = true;
      }
    }
  }
  return text.replace(/\s{2,}/g, " ").trim();
}

function detectFractionMultiplier(text: string): number {
  const lower = text.toLowerCase();
  if (/\bone and a half\b/.test(lower)) return 1.5;
  if (/\bhalf\b/.test(lower)) return 0.5;
  if (/\bquarter\b/.test(lower)) return 0.25;
  return 1;
}

// Leading "a" is now optional, so "small amount of X" matches the same as
// "a small amount of X" — both should get the small diminutive default,
// not the generic no-quantity fallback.
const DIMINUTIVE_PATTERN =
  /\b(?:a\s+)?(little\s+bit\s+of|little\s+of|bit\s+of|small\s+amount\s+of|pinch\s+of|dash\s+of)\b/i;
const DIMINUTIVE_GRAMS = 40;

// Shared between the count-match branch (for "1 small bowl of X") and the
// size-word branch (for "a small bowl of X" with no leading number).
const SIZE_WORDS = [
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
    const restText = countMatch[2];
    const name = cleanFoodName(restText);

    // A leading number can be qualifying a container/size word ("1 small
    // bowl of daal") rather than a discrete countable unit ("2 eggs") —
    // check for that first, since treating "small bowl" as just another
    // noun and defaulting to a flat 100g badly underestimates a real bowl.
    const lowerRest = restText.toLowerCase();
    const matchedContainerSize = SIZE_WORDS.find((w) => lowerRest.includes(w));

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

    if (matchedContainerSize && !matchedUnit) {
      const baseGrams = estimatePortionGrams(matchedContainerSize);
      const grams = Math.round(baseGrams * count);
      const containerName = cleanFoodName(
        restText.replace(new RegExp(matchedContainerSize, "i"), ""),
      );
      return {
        name: containerName,
        portionDesc: `${count}x ${matchedContainerSize} (${grams}g)`,
        explicitGrams: grams,
        isApproximate: false,
      };
    }

    // "pieces" of meat in a curry/gravy are bite-sized chunks (~20-30g
    // each), not a 100g cut — keep the larger default for bread/fruit-style
    // units, but shrink it specifically for meat-in-curry context.
    const isCurryContext = /\b(curry|gravy|sabzi|sabji|stew|masala)\b/i.test(
      itemText,
    );
    const unitWeight =
      (matchedUnit === "piece" || matchedUnit === "pieces") && isCurryContext
        ? 25
        : matchedUnit
          ? unitWeights[matchedUnit]
          : 100;
    const grams = unitWeight * count;
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

  const lower = itemText.toLowerCase();
  const matchedSize = SIZE_WORDS.find((w) => lower.includes(w));
  if (matchedSize) {
    const fraction = detectFractionMultiplier(itemText);
    const baseGrams = estimatePortionGrams(matchedSize);
    const grams = Math.round(baseGrams * fraction);
    const withoutSize = itemText.replace(new RegExp(matchedSize, "i"), "");
    const withoutFraction =
      fraction !== 1
        ? withoutSize.replace(/\b(one and a half|half|quarter)\b/gi, " ")
        : withoutSize;
    const name = cleanFoodName(withoutFraction);
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

    const generic = matchGenericFood(name) ?? matchGenericFood(itemText);
    if (generic) {
      const grams = explicitGrams ?? 150;
      const factor = grams / 100;
      items.push({
        name: generic.label,
        portion_desc: portionDesc,
        grams,
        confidence: "medium",
        source: "manual",
        calories: Math.round(generic.per100g.calories * factor),
        protein: Math.round(generic.per100g.protein * factor * 10) / 10,
        carbs: Math.round(generic.per100g.carbs * factor * 10) / 10,
        fat: Math.round(generic.per100g.fat * factor * 10) / 10,
        fiber: Math.round(generic.per100g.fiber * factor * 10) / 10,
      });
      continue;
    }

    const { source, confidence, per100g, times_used } = await getPer100g(
      name,
      supabase,
      groqApiKey,
    );
    // Use explicit grams if we parsed a portion (bowl, plate, count, etc.).
    // Otherwise fall back to 150g — a more realistic single serving than 100g
    // for cooked dishes (rice, dal, curry, etc.) while not overcounting snacks.
    const grams = explicitGrams ?? 150;

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
      times_used,
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
