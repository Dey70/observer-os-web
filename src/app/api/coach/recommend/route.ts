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
const MODEL    = "openai/gpt-oss-120b";

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
  const requestId = Math.random().toString(36).slice(2, 9);
  const log = (event: string, data: Record<string, unknown>) =>
    console.log(JSON.stringify({ ts: new Date().toISOString(), requestId, route: "recommend", event, ...data }));

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      log("auth_failure", { authError: authError?.message ?? "no user" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    log("recommend_start", { userId: user.id });

    let ctx: Awaited<ReturnType<typeof buildCoachContext>>;
    try {
      ctx = await buildCoachContext(supabase, user.id);
      log("context_built", {
        userId: user.id,
        hasTodayLog: !!ctx.todayLog,
        recentLogs: ctx.recentLogs.length,
        recentSessions: ctx.recentSessions.length,
        ctl: ctx.ctl, atl: ctx.atl, tsb: ctx.tsb,
      });
    } catch (ctxErr) {
      const message = ctxErr instanceof Error ? ctxErr.message : String(ctxErr);
      log("context_build_error", { userId: user.id, error: message });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      log("groq_key_missing", { userId: user.id, fallback: "deterministic" });
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
      const errBody = await response.text();
      let parsedError: unknown;
      try { parsedError = JSON.parse(errBody); } catch { parsedError = errBody; }
      log("groq_error", {
        userId: user.id,
        status: response.status,
        statusText: response.statusText,
        groqError: parsedError,
        fallback: "deterministic",
      });
      return NextResponse.json(deterministicFallback(ctx));
    }

    const data = await response.json();
    const raw  = (data.choices?.[0]?.message?.content ?? "") as string;

    log("groq_response_received", {
      userId: user.id,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      rawLength: raw.length,
    });

    let parsed: unknown;
    try {
      // Strip optional markdown code fences the model may wrap around JSON
      const json = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      parsed = JSON.parse(json);
    } catch (parseErr) {
      log("json_parse_error", {
        userId: user.id,
        parseError: parseErr instanceof Error ? parseErr.message : String(parseErr),
        rawPreview: raw.slice(0, 200),
        fallback: "deterministic",
      });
      return NextResponse.json(deterministicFallback(ctx));
    }

    if (!isValidRecommendation(parsed)) {
      const p = parsed as Record<string, unknown>;
      log("validation_failure", {
        userId: user.id,
        missingFields: ["training","recovery","nutrition","primaryFocus","goalInsight"].filter(
          (k) => typeof p?.[k] !== "string" || !(p[k] as string).length,
        ),
        fallback: "deterministic",
      });
      return NextResponse.json(deterministicFallback(ctx));
    }

    log("recommend_complete", { userId: user.id, source: "ai" });
    return NextResponse.json({ ...parsed, source: "ai" } satisfies RecommendResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack   = err instanceof Error ? err.stack : undefined;
    console.log(JSON.stringify({ ts: new Date().toISOString(), requestId, route: "recommend", event: "unhandled_exception", message, stack }));
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
