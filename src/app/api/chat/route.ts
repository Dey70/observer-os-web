import { NextRequest, NextResponse }                       from "next/server";
import { createServerSupabaseClient }                      from "@/lib/supabase/server";
import { buildCoachContext }                               from "@/lib/coachContext";
import { buildChatSystemPrompt }                           from "@/lib/coachPrompt";
import { loadMemoryFacts, extractAndPersistMemory }        from "@/lib/observerMemory";
import { AGENT_TOOLS, executeTool }                        from "@/lib/agent-tools";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL    = "openai/gpt-oss-120b";

// Keep request payloads bounded so a long thread or one huge paste can't
// trip Groq's request-size limit the way a fixed conversation window does
// in Claude/ChatGPT.
const MAX_HISTORY_MESSAGES = 16;
const MAX_MESSAGE_CHARS    = 8000;

function estimateTokens(messages: Array<Record<string, unknown>>): number {
  return Math.ceil(
    messages.reduce((sum, m) => sum + String(m.content ?? "").length, 0) / 4,
  );
}

function truncateContent(content: unknown): unknown {
  if (typeof content !== "string" || content.length <= MAX_MESSAGE_CHARS) return content;
  return (
    content.slice(0, MAX_MESSAGE_CHARS) +
    `\n\n[...truncated ${content.length - MAX_MESSAGE_CHARS} characters — message was too long to send in full]`
  );
}

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

    // Build full athlete context and load Observer Memory facts in parallel
    const [ctx, facts] = await Promise.all([
      buildCoachContext(supabase, user.id),
      loadMemoryFacts(supabase, user.id),
    ]);

    log("context_loaded", {
      userId:      user.id,
      memoryFacts: facts.length,
      hasTodayLog: !!ctx.todayLog,
      ctl:         ctx.ctl,
      atl:         ctx.atl,
      tsb:         ctx.tsb,
    });

    const systemPrompt = buildChatSystemPrompt(ctx, facts);

    // Sliding window: only replay the most recent turns, and cap any single
    // message's size, instead of resending the whole thread every request.
    const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES);
    if (recentMessages.length < messages.length) {
      log("history_truncated", { originalCount: messages.length, keptCount: recentMessages.length });
    }

    const groqMessages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...recentMessages.map((m: any) => ({
        role:    m.role,
        content: truncateContent(m.content),
        ...(m.tool_calls   ? { tool_calls:   m.tool_calls   } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name         ? { name:         m.name         } : {}),
      })),
    ];

    // Capture the latest user message for post-response memory extraction
    const lastUserMessage = [...messages].reverse()
      .find((m: { role: string; content: string }) => m.role === "user")?.content ?? "";

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
        const assistantContent: string = message.content ?? "";

        // Fire-and-forget memory extraction — does not delay the response
        extractAndPersistMemory(supabase, user.id, lastUserMessage, assistantContent)
          .catch(() => {});

        log("chat_complete", { iterations, userId: user.id });
        return NextResponse.json({ content: assistantContent, role: "assistant", iterations });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolNames = (message.tool_calls as Array<{ function: { name: string } }>)
        .map((tc) => tc.function.name);
      log("tool_calls", { iteration: iterations, tools: toolNames });

      const toolResults = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (message.tool_calls as any[]).map(async (tc) => {
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
