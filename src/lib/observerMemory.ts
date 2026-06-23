/**
 * Observer Memory — two-layer athlete knowledge system.
 *
 * Layer 1 (Athlete Profile): always-fresh structured data from the DB.
 *   Built from buildCoachContext and rendered into the system prompt.
 *
 * Layer 2 (Observer Memory): distilled facts stored in coach_memory.
 *   Seeded from structured data (source = 'system').
 *   Enriched by AI extraction after each conversation turn (source = 'ai').
 *
 * The coach never replays raw conversation transcripts — it reasons
 * from structured insight. This bounds the context window and keeps
 * quality consistent across sessions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachContext } from "@/lib/coachContext";

// ── Types ──────────────────────────────────────────────────────────────────

export type MemoryCategory =
  | "biometric"   // body composition, weight trends
  | "pattern"     // recurring behavioral/physiological patterns
  | "preference"  // training style, recovery approach preferences
  | "milestone"   // PRs, achievements, breakthrough performances
  | "flag"        // recurring issues, injury history, health concerns
  | "training"    // current training state observations
  | "goal";       // long-term performance targets

export interface MemoryFact {
  category:   MemoryCategory;
  key:        string;
  value:      string;
  confidence: number;
  source:     "system" | "ai" | "user";
  updatedAt:  string;
}

export interface MemorySummary {
  count:      number;
  categories: Partial<Record<MemoryCategory, number>>;
}

// ── Category display labels ────────────────────────────────────────────────

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  biometric:  "BIOMETRIC",
  pattern:    "PATTERN",
  preference: "PREFERENCE",
  milestone:  "MILESTONE",
  flag:       "FLAG",
  training:   "TRAINING",
  goal:       "GOAL",
};

// ── Load ──────────────────────────────────────────────────────────────────

export async function loadMemoryFacts(
  supabase: SupabaseClient,
  userId: string,
): Promise<MemoryFact[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("coach_memory")
    .select("category, key, value, confidence, source, updated_at")
    .eq("user_id", userId)
    .is("expires_at", null)
    .order("category")
    .order("updated_at", { ascending: false });

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    category:   r.category as MemoryCategory,
    key:        r.key as string,
    value:      r.value as string,
    confidence: r.confidence as number,
    source:     r.source as "system" | "ai" | "user",
    updatedAt:  r.updated_at as string,
  }));
}

export async function getMemorySummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<MemorySummary> {
  const facts = await loadMemoryFacts(supabase, userId);
  const categories: Partial<Record<MemoryCategory, number>> = {};
  for (const f of facts) {
    categories[f.category] = (categories[f.category] ?? 0) + 1;
  }
  return { count: facts.length, categories };
}

// ── Upsert ────────────────────────────────────────────────────────────────

async function upsertFacts(
  supabase: SupabaseClient,
  userId:  string,
  facts:   Omit<MemoryFact, "updatedAt">[],
): Promise<void> {
  if (!facts.length) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("coach_memory").upsert(
    facts.map((f) => ({
      user_id:    userId,
      category:   f.category,
      key:        f.key,
      value:      f.value,
      confidence: f.confidence,
      source:     f.source,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,category,key" },
  );
}

// ── System seeding ─────────────────────────────────────────────────────────
//
// Populates coach_memory from existing structured athlete data.
// Safe to re-run — upserts are idempotent.

export async function seedSystemMemory(
  supabase: SupabaseClient,
  userId:   string,
  ctx:      CoachContext,
): Promise<void> {
  const facts: Omit<MemoryFact, "updatedAt">[] = [];

  const sys = (
    category: MemoryCategory,
    key:      string,
    value:    string,
    confidence = 1.0,
  ) => facts.push({ category, key, value, confidence, source: "system" });

  // ── Biometrics ───────────────────────────────────────────────────────────

  if (ctx.profileAge)      sys("biometric", "age",    `${ctx.profileAge} years old`);
  if (ctx.profileSex)      sys("biometric", "sex",    ctx.profileSex);
  if (ctx.currentWeightKg) sys("biometric", "weight_current", `${ctx.currentWeightKg} kg`);

  // Weight trend from last 10 logs
  const { data: wLogs } = await supabase
    .from("weight_logs")
    .select("date, weight")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(10);

  const weights = (
    (wLogs ?? []) as { date: string; weight: number }[]
  ).reverse();

  if (weights.length >= 3) {
    const first = weights[0].weight;
    const last  = weights[weights.length - 1].weight;
    const delta = last - first;
    const trend =
      Math.abs(delta) < 0.5
        ? "stable"
        : delta > 0
          ? `gaining — ↑${delta.toFixed(1)} kg over ${weights.length} entries`
          : `cutting — ↓${Math.abs(delta).toFixed(1)} kg over ${weights.length} entries`;
    sys("biometric", "weight_trend", trend);
  }

  // ── Training state ────────────────────────────────────────────────────────

  if (ctx.profileSplit) sys("training", "primary_split", ctx.profileSplit);

  if (ctx.profileWeeklyGoal) {
    sys("training", "session_goal", `${ctx.profileWeeklyGoal} sessions per week`);
  }
  if (ctx.profileWeeklyKmTarget) {
    sys("training", "km_target", `${ctx.profileWeeklyKmTarget} km per week`);
  }
  if (ctx.profileWeeklyRunTarget) {
    sys("training", "run_count_target", `${ctx.profileWeeklyRunTarget} runs per week`);
  }
  if (ctx.profileWeeklyGymTarget) {
    sys("training", "gym_target", `${ctx.profileWeeklyGymTarget} gym sessions per week`);
  }
  if (ctx.ctl > 0) {
    sys(
      "training", "banister_snapshot",
      `CTL ${ctx.ctl} · ATL ${ctx.atl} · TSB ${ctx.tsb > 0 ? "+" : ""}${ctx.tsb}`,
    );
  }
  if (ctx.checkinStreak >= 3) {
    sys("pattern", "checkin_streak", `${ctx.checkinStreak}-day check-in streak`);
  }
  if (ctx.sessionStreak >= 3) {
    sys("pattern", "session_streak", `${ctx.sessionStreak}-day training streak`);
  }

  // ── Milestones from personal_records ─────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prs } = await (supabase as any)
    .from("personal_records")
    .select("type, metric, value, date")
    .eq("user_id", userId);

  for (const pr of (
    (prs ?? []) as { type: string; metric: string; value: number; date: string }[]
  )) {
    const label = formatPR(pr.type, pr.metric, pr.value);
    if (label) sys("milestone", `pr_${pr.type}_${pr.metric}`, `${label} — achieved ${pr.date}`);
  }

  // ── Goals ─────────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: goals } = await (supabase as any)
    .from("goals")
    .select("type, title, target_value, unit, deadline")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(6);

  for (const g of (
    (goals ?? []) as {
      type: string; title: string;
      target_value: number; unit: string; deadline?: string;
    }[]
  )) {
    const deadline = g.deadline ? ` · deadline ${g.deadline}` : "";
    sys("goal", `active_${g.type}`, `${g.title}: ${g.target_value} ${g.unit}${deadline}`);
  }

  // ── Behavioral patterns from recent check-ins ─────────────────────────────

  const since14 = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
  const { data: recentLogs } = await supabase
    .from("daily_logs")
    .select("sleep_hours, sleep_quality, mood, energy, fatigue, soreness")
    .eq("user_id", userId)
    .gte("date", since14);

  const logs = (recentLogs ?? []) as {
    sleep_hours: number; sleep_quality: number;
    mood: number; energy: number; fatigue: number; soreness: number;
  }[];

  if (logs.length >= 5) {
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const avgSleep    = avg(logs.map((l) => l.sleep_hours));
    const avgQuality  = avg(logs.map((l) => l.sleep_quality));
    const avgEnergy   = avg(logs.map((l) => l.energy));
    const avgFatigue  = avg(logs.map((l) => l.fatigue));
    const avgSoreness = avg(logs.map((l) => l.soreness));

    sys(
      "pattern", "sleep_14d",
      `avg ${avgSleep.toFixed(1)}h sleep · quality ${avgQuality.toFixed(1)}/10 over 14 days`,
    );
    sys(
      "pattern", "load_response_14d",
      `avg energy ${avgEnergy.toFixed(1)}/10 · fatigue ${avgFatigue.toFixed(1)}/10 · soreness ${avgSoreness.toFixed(1)}/10`,
    );
  }

  // Coach notes from profile — high signal for personalisation
  if (ctx.profileNotes) {
    sys("preference", "coach_notes", ctx.profileNotes);
  }

  await upsertFacts(supabase, userId, facts);
}

// ── Context block builders ─────────────────────────────────────────────────

export function buildAthleteProfileBlock(ctx: CoachContext): string {
  const lines: string[] = [];

  if (ctx.profileSex)          lines.push(`Sex: ${ctx.profileSex}`);
  if (ctx.profileAge)          lines.push(`Age: ${ctx.profileAge}`);
  if (ctx.currentWeightKg)     lines.push(`Weight: ${ctx.currentWeightKg} kg`);
  if (ctx.profileSplit)        lines.push(`Training split: ${ctx.profileSplit}`);
  if (ctx.profileWeeklyGoal)   lines.push(`Weekly session target: ${ctx.profileWeeklyGoal}`);
  if (ctx.profileNotes)        lines.push(`Notes: ${ctx.profileNotes}`);

  return lines.length
    ? `## Athlete Profile\n${lines.map((l) => `- ${l}`).join("\n")}`
    : "## Athlete Profile\nNot configured — prompt athlete to complete their profile.";
}

export function buildObserverMemoryBlock(facts: MemoryFact[]): string {
  if (!facts.length) {
    return "## Observer Memory\nNo learned facts yet — memory builds as training data accumulates.";
  }

  const ORDER: MemoryCategory[] = [
    "goal", "milestone", "training", "biometric", "pattern", "preference", "flag",
  ];

  const byCategory = facts.reduce<Partial<Record<MemoryCategory, MemoryFact[]>>>(
    (acc, f) => {
      (acc[f.category] ??= []).push(f);
      return acc;
    },
    {},
  );

  const lines = ["## Observer Memory — athlete's training history"];
  for (const cat of ORDER) {
    const catFacts = byCategory[cat];
    if (!catFacts?.length) continue;
    for (const f of catFacts) {
      lines.push(`[${CATEGORY_LABEL[cat]}] ${f.value}`);
    }
  }

  return lines.join("\n");
}

// ── AI extraction (fire-and-forget) ───────────────────────────────────────

const EXTRACTION_MODEL = "llama-3.1-8b-instant";

const EXTRACTION_SYSTEM = `You are a memory extraction module for an athlete performance coach.
Given one coaching exchange, extract 0–3 facts about this athlete worth remembering across future sessions.

Only extract facts that are:
- Stable: still relevant in 2+ weeks
- Non-obvious: not derivable from basic profile data alone
- Performance-relevant: training behaviour, injury, goal, recovery preference, milestone

Return ONLY a JSON array. Empty array if nothing qualifies.
Schema: [{"category":"biometric|pattern|preference|milestone|flag|training|goal","key":"snake_case","value":"human-readable fact","confidence":0.0-1.0}]`;

export async function extractAndPersistMemory(
  supabase:          SupabaseClient,
  userId:            string,
  userMessage:       string,
  assistantResponse: string,
): Promise<void> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({
        model:       EXTRACTION_MODEL,
        max_tokens:  300,
        temperature: 0.1,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM },
          {
            role:    "user",
            content: `Athlete: "${userMessage.slice(0, 400)}"\nCoach: "${assistantResponse.slice(0, 600)}"`,
          },
        ],
      }),
    });

    if (!res.ok) return;
    const data = await res.json();
    const raw  = (data.choices?.[0]?.message?.content ?? "").trim();

    let extracted: unknown[];
    try {
      const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      extracted = JSON.parse(clean);
      if (!Array.isArray(extracted)) return;
    } catch {
      return;
    }

    const valid = extracted.filter(
      (f): f is {
        category:   MemoryCategory;
        key:        string;
        value:      string;
        confidence: number;
      } =>
        typeof f === "object" && f !== null &&
        typeof (f as Record<string, unknown>).category === "string" &&
        typeof (f as Record<string, unknown>).key       === "string" &&
        typeof (f as Record<string, unknown>).value     === "string" &&
        typeof (f as Record<string, unknown>).confidence === "number" &&
        (f as Record<string, unknown>).confidence as number >= 0.7,
    );

    if (valid.length) {
      await upsertFacts(supabase, userId, valid.map((f) => ({ ...f, source: "ai" as const })));
    }
  } catch {
    // Non-critical — swallow all extraction errors
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPR(type: string, metric: string, value: number): string | null {
  if (type === "run") {
    if (metric === "longest_run")
      return `Longest run: ${(value / 1000).toFixed(1)} km`;
    if (metric === "strava_best_pace" || metric.startsWith("best_pace_")) {
      const label = metric === "strava_best_pace"
        ? "Best pace"
        : `Best pace ${metric.replace("best_pace_", "").replace("_", " ")}`;
      return `${label}: ${formatPace(value)} /km`;
    }
  }
  if (type === "lift") {
    return `${metric.replace(/_/g, " ")}: ${value} kg`;
  }
  return null;
}

function formatPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
