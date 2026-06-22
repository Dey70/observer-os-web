/**
 * POST /api/coach/recommend
 *
 * Returns AI-generated coaching recommendations for the current day.
 * The response is consumed by the Intelligence Panel sidebar on the
 * Coach page and can be cached client-side per session.
 *
 * Falls back to deterministic Phase 3 engine if:
 *   - GROQ_API_KEY is not set
 *   - Groq returns a non-200 response
 *   - The model output cannot be parsed as the expected JSON shape
 */

import { NextResponse }               from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildCoachContext }          from "@/lib/coachContext";
import { buildSystemPrompt, buildRecommendPrompt } from "@/lib/coachPrompt";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL    = "llama-3.3-70b-versatile";

// ── Public response shape ──────────────────────────────────────────────────

export interface RecommendResponse {
  training:     string;
  recovery:     string;
  nutrition:    string;
  primaryFocus: string;
  goalInsight:  string;
  /** "ai" when Groq answered; "deterministic" when the rule engine was used */
  source: "ai" | "deterministic";
}

// ── Helpers ────────────────────────────────────────────────────────────────

function deterministicFallback(
  ctx: Awaited<ReturnType<typeof buildCoachContext>>,
): RecommendResponse {
  return {
    training:     ctx.coach.trainingRecommendation,
    recovery:     ctx.coach.recoveryRecommendation,
    nutrition:    ctx.coach.nutritionRecommendation,
    primaryFocus: ctx.coach.primaryFocus,
    goalInsight:  ctx.coach.goalRecommendation,
    source:       "deterministic",
  };
}

function isValidRecommendation(obj: unknown): obj is Omit<RecommendResponse, "source"> {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.training     === "string" && o.training.length     > 0 &&
    typeof o.recovery     === "string" && o.recovery.length     > 0 &&
    typeof o.nutrition    === "string" && o.nutrition.length    > 0 &&
    typeof o.primaryFocus === "string" && o.primaryFocus.length > 0 &&
    typeof o.goalInsight  === "string" && o.goalInsight.length  > 0
  );
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = await buildCoachContext(supabase, user.id);

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(deterministicFallback(ctx));
    }

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  700,
        temperature: 0.45,
        messages: [
          { role: "system", content: buildSystemPrompt(ctx) },
          { role: "user",   content: buildRecommendPrompt(ctx) },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(deterministicFallback(ctx));
    }

    const data = await response.json();
    const raw  = (data.choices?.[0]?.message?.content ?? "") as string;

    let parsed: unknown;
    try {
      // Strip optional markdown code fences the model may wrap around JSON
      const json = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      parsed = JSON.parse(json);
    } catch {
      return NextResponse.json(deterministicFallback(ctx));
    }

    if (!isValidRecommendation(parsed)) {
      return NextResponse.json(deterministicFallback(ctx));
    }

    return NextResponse.json({ ...parsed, source: "ai" } satisfies RecommendResponse);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
