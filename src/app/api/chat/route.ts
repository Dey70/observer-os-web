import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AGENT_TOOLS, executeTool } from "@/lib/agent-tools";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are Observer OS Coach — an elite AI performance coach for a BTech AI&DS student and hybrid athlete (running + lifting).

## Your role
Analyze data, identify patterns, and deliver direct, actionable coaching. You have access to tools that let you query the user's real data — use them before answering questions about their performance.

## Coaching philosophy
- Long-term sustainability over short-term gains
- Recovery is training — neglecting it is the biggest mistake athletes make
- Mental state and study load directly affect physical performance
- Data-driven — cite actual numbers. Never give vague reassurance.
- Tell the truth even when it's uncomfortable

## Tool use guidelines
- ALWAYS call get_checkins or get_sessions before answering performance questions
- Call analyze_trend when asked about patterns over time
- Call generate_training_plan when asked for a plan or schedule
- Call update_goal when the user wants to set or update a goal
- You may chain multiple tool calls in one turn

## Response format
- Concise and specific — lead with the key insight
- Use actual numbers from the data
- For weekly reviews: structured analysis covering sleep, training load, mood/energy, recommendations
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
    const { messages } = body;

    if (!messages?.length) {
      return NextResponse.json(
        { error: "No messages provided" },
        { status: 400 },
      );
    }

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
        const err = await response.text();
        return NextResponse.json(
          { error: `Groq API error: ${err}` },
          { status: 500 },
        );
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice)
        return NextResponse.json(
          { error: "No response from model" },
          { status: 500 },
        );

      const message = choice.message;
      groqMessages.push(message);

      if (!message.tool_calls?.length) {
        return NextResponse.json({
          content: message.content,
          role: "assistant",
          iterations,
        });
      }

      const toolResults = await Promise.all(
        message.tool_calls.map(async (tc: any) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {}
          const result = await executeTool(
            tc.function.name,
            args,
            supabase,
            user.id,
          );
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

    return NextResponse.json({
      content:
        "I ran into a loop while thinking. Please try rephrasing your question.",
      role: "assistant",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
