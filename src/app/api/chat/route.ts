import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AGENT_TOOLS, executeTool } from "@/lib/agent-tools";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// Rough token estimate: 1 token ≈ 4 chars
function estimateTokens(messages: Array<Record<string, unknown>>): number {
  return Math.ceil(
    messages.reduce((sum, m) => sum + String(m.content ?? "").length, 0) / 4,
  );
}

const SYSTEM_PROMPT = `You are Observer OS Coach — an elite AI performance coach for a BTech AI&DS student and hybrid athlete (running + lifting).

## Your role
Analyze data, identify patterns, and deliver direct, actionable coaching. You have access to tools that let you query the user's real data — use them before answering questions about their performance.

## Coaching philosophy
- Long-term sustainability over short-term gains
- Recovery is training — neglecting it is the biggest mistake athletes make
- Nutrition fuels training — macro intake should match training load, not be an afterthought
- Mental state and study load directly affect physical performance
- Data-driven — cite actual numbers. Never give vague reassurance.
- Tell the truth even when it's uncomfortable

## Tool use guidelines
- ALWAYS call get_checkins or get_sessions before answering performance questions
- Call get_nutrition when asked about diet, eating enough, macros, or whether food intake matches training load
- Call analyze_trend when asked about patterns over time
- Call generate_training_plan when asked for a plan or schedule
- Call update_goal when the user wants to set or update a goal
- You may chain multiple tool calls in one turn

## Response format
- Concise and specific — lead with the key insight
- Use actual numbers from the data
- For weekly reviews: structured analysis covering sleep, training load, nutrition, mood/energy, recommendations
- For quick questions: 2–4 sentences max

## Tone
Direct, knowledgeable, no corporate wellness language. Like a coach who respects you enough to be honest.`;

type Profile = {
  name: string | null;
  age: number | null;
  split: string | null;
  weekly_goal: number | null;
  target_weight: number | null;
  notes: string | null;
};

export async function POST(req: NextRequest) {
  const requestId = Math.random().toString(36).slice(2, 9);
  const log = (event: string, data: Record<string, unknown>) =>
    console.log(JSON.stringify({ ts: new Date().toISOString(), requestId, event, ...data }));

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

    const body = await req.json();
    const { messages } = body;

    if (!messages?.length) {
      log("bad_request", { reason: "no messages" });
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 },
      );
    }

    log("chat_start", { userId: user.id, messageCount: messages.length });

    // Fetch user profile for coach context
    const { data: rawProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    const profile = rawProfile as Profile | null;

    const profileContext = profile
      ? `

## Athlete Profile
- Name: ${profile.name ?? "Unknown"}
- Age: ${profile.age ?? "Unknown"}
- Preferred training split: ${profile.split ?? "balanced"}
- Weekly session goal: ${profile.weekly_goal ?? 4} sessions
- Target weight: ${profile.target_weight ? profile.target_weight + " kg" : "Not set"}
- Coach notes: ${profile.notes ?? "None"}
`
      : "";

    if (!process.env.GROQ_API_KEY) {
      log("groq_key_missing", { userId: user.id });
      return NextResponse.json({ error: "Groq API key not configured" }, { status: 500 });
    }

    const groqMessages: Array<Record<string, unknown>> = [
      { role: "system", content: SYSTEM_PROMPT + profileContext },
      ...messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const estimatedTokens = estimateTokens(groqMessages);

      log("groq_request", { iteration: iterations, messageCount: groqMessages.length, estimatedTokens });

      const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          temperature: 0.7,
          messages: groqMessages,
          tools: AGENT_TOOLS,
          tool_choice: "auto",
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        let parsedError: unknown;
        try { parsedError = JSON.parse(errBody); } catch { parsedError = errBody; }
        log("groq_error", {
          status: response.status,
          statusText: response.statusText,
          iteration: iterations,
          estimatedTokens,
          groqError: parsedError,
        });
        return NextResponse.json(
          { error: `Groq API error ${response.status}`, detail: parsedError },
          { status: response.status === 429 ? 429 : 500 },
        );
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) {
        log("groq_no_choice", { iteration: iterations, responseKeys: Object.keys(data) });
        return NextResponse.json(
          { error: "No response from model" },
          { status: 500 },
        );
      }

      log("groq_response", {
        iteration: iterations,
        finishReason: choice.finish_reason,
        hasToolCalls: !!choice.message?.tool_calls?.length,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      });

      const message = choice.message;
      groqMessages.push(message);

      if (!message.tool_calls?.length) {
        log("chat_complete", { iterations, userId: user.id });
        return NextResponse.json({
          content: message.content,
          role: "assistant",
          iterations,
        });
      }

      const toolNames = message.tool_calls.map((tc: any) => tc.function.name);
      log("tool_calls", { iteration: iterations, tools: toolNames });

      const toolResults = await Promise.all(
        message.tool_calls.map(async (tc: any) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            log("tool_arg_parse_error", { tool: tc.function.name, raw: tc.function.arguments });
          }
          const result = await executeTool(
            tc.function.name,
            args,
            supabase,
            user.id,
          );
          log("tool_result", { tool: tc.function.name, resultLength: result.length });
          return {
            role: "tool" as const,
            tool_call_id: tc.id,
            name: tc.function.name,
            content: result,
          };
        }),
      );

      groqMessages.push(...toolResults);
    }

    log("iteration_limit_reached", { userId: user.id, iterations });
    return NextResponse.json({
      content:
        "I ran into a loop while thinking. Please try rephrasing your question.",
      role: "assistant",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const stack   = err instanceof Error ? err.stack : undefined;
    log("unhandled_exception", { message, stack });
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
