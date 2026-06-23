/**
 * GET /api/coach/memory
 *
 * Returns a summary of the athlete's Observer Memory (fact count by category).
 * Also triggers system memory seeding if no facts exist yet — this runs once
 * on first page load so that facts are ready before the athlete's first message.
 */

import { NextResponse }               from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildCoachContext }          from "@/lib/coachContext";
import {
  getMemorySummary,
  seedSystemMemory,
}                                     from "@/lib/observerMemory";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let summary = await getMemorySummary(supabase, user.id);

    // Seed on first access so facts are ready before the first chat turn
    if (summary.count === 0) {
      try {
        const ctx = await buildCoachContext(supabase, user.id);
        await seedSystemMemory(supabase, user.id, ctx);
        summary = await getMemorySummary(supabase, user.id);
      } catch {
        // Non-critical — page can function without memory facts
      }
    }

    return NextResponse.json(summary);
  } catch {
    return NextResponse.json({ count: 0, categories: {} });
  }
}

/**
 * POST /api/coach/memory/refresh
 * Re-seeds all system memory facts from current structured data.
 * Call after significant profile/goal changes.
 */
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
    await seedSystemMemory(supabase, user.id, ctx);
    const summary = await getMemorySummary(supabase, user.id);

    return NextResponse.json({ ...summary, refreshed: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 500 },
    );
  }
}
