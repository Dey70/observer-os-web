import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseMeal } from "@/lib/foodParser";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { input, meal_type, date } = body;

    if (!input || typeof input !== "string" || !input.trim()) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 },
      );
    }

    const result = await parseMeal(input.trim(), supabase, groqApiKey);

    if (!result.items.length) {
      return NextResponse.json({
        items: [],
        totals: result.totals,
        coach_note:
          'I couldn\'t identify any food items in that. Try describing what you ate, e.g. "2 eggs and toast".',
      });
    }

    return NextResponse.json({
      meal_type: meal_type || "snack",
      date: date || new Date().toISOString().split("T")[0],
      items: result.items,
      totals: result.totals,
      raw_input: input.trim(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
