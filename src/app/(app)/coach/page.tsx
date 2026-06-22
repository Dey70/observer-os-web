// src/app/(app)/coach/page.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { calcCheckinStreak, calcSessionStreak, isSunday } from "@/lib/utils";
import { Badge, TypingDots } from "@/components/ui";
import type { ChatMessage, DailyLog, Session } from "@/types";
import { Activity, BarChart2, CalendarDays, Target } from "lucide-react";
import { computeRecoveryScore }   from "@/lib/recoveryScore";
import { computeCTLATLTSB }       from "@/lib/trainingLoad";
import type { TrainingMetricRow } from "@/lib/trainingLoad";
import { computeReadiness }       from "@/lib/readiness";
import type { ReadinessOutput }   from "@/lib/readiness";
import { runCoachEngine }         from "@/lib/coachEngine";
import type { CoachOutput, GoalProgress } from "@/lib/coachEngine";
import { computeHybridScore }     from "@/lib/hybridScore";
import type { HybridScoreOutput } from "@/lib/hybridScore";
import { calculateDailyTargets }  from "@/lib/nutritionEngine";
import type { NutritionProfileInputs } from "@/lib/nutritionEngine";
import type { RunningActivity }   from "@/types";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────

type ProfileRow = {
  weekly_run_km_target:    number | null;
  weekly_run_count_target: number | null;
  weekly_gym_target:       number | null;
  sex:                     "male" | "female" | null;
  age:                     number | null;
  height_cm:               number | null;
  nutrition_goal_type:     string | null;
  target_weight:           number | null;
};

type Intelligence = {
  readiness:    ReadinessOutput | null;
  coach:        CoachOutput     | null;
  hybrid:       HybridScoreOutput;
  ctl:          number;
  atl:          number;
  tsb:          number;
  goalProgress: GoalProgress;
  weeklyStats: {
    readiness: number | null;
    sessions:  number;
    avgSleep:  number | null;
  };
};

// AI-generated recommendations from /api/coach/recommend
type RecommendResponse = {
  training:     string;
  recovery:     string;
  nutrition:    string;
  primaryFocus: string;
  goalInsight:  string;
  source:       "ai" | "deterministic";
};

// ── Constants ──────────────────────────────────────────────────────────────

// Max messages sent to Groq per turn to avoid token overflow
const CONTEXT_WINDOW = 15;

const QUICK_PROMPTS = [
  { label: "Recovery",          msg: "Pull my last 7 days and tell me how my recovery looks." },
  { label: "Train today?",      msg: "Look at my recent readiness — should I train hard today or rest?" },
  { label: "Sleep",             msg: "Analyze my sleep trends and how they affect my training." },
  { label: "Load vs recovery",  msg: "Analyze training load vs recovery scores over 2 weeks." },
  { label: "Patterns",          msg: "What patterns do you see across sleep, mood, energy, training?" },
];

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Observer OS loaded. I have access to your data — check-ins, sessions, goals, weight logs. Ask me anything.",
};

// ── Sub-components ─────────────────────────────────────────────────────────

function SideLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        color: "var(--text-dim)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        fontFamily: "var(--mono)",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function MiniBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{label}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color }}>{value}</span>
      </div>
      <div style={{ height: 3, background: "var(--border2)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, value)}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

function GoalLine({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{label}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color }}>
          {Math.round(pct * 100)}%
        </span>
      </div>
      <div style={{ height: 3, background: "var(--border2)", borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, pct * 100)}%`,
            background: pct >= 1 ? "var(--green)" : color,
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}

function ShortcutButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "9px 10px",
        borderRadius: 8,
        border: `1px solid ${highlight ? "var(--accent)" : "var(--border)"}`,
        background: highlight ? "var(--accent-dim)" : "var(--surface2)",
        color: highlight ? "var(--accent)" : "var(--text-muted)",
        fontFamily: "var(--mono)",
        fontSize: 11,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        textAlign: "left",
      }}
    >
      <Icon size={13} strokeWidth={1.75} />
      {label}
      {highlight && (
        <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--accent)" }}>Today</span>
      )}
    </button>
  );
}

function IntelligencePanel({
  intel,
  loading,
  aiRec,
  aiRecLoading,
}: {
  intel:        Intelligence     | null;
  loading:      boolean;
  aiRec:        RecommendResponse | null;
  aiRecLoading: boolean;
}) {
  if (loading || !intel) {
    return (
      <div style={{ color: "var(--text-dim)", fontFamily: "var(--mono)", fontSize: 11, padding: "12px 0" }}>
        {loading ? "Loading..." : "—"}
      </div>
    );
  }

  // AI recs take priority; deterministic coach output is the fallback
  const trainText  = aiRec?.training     ?? intel.coach?.trainingRecommendation  ?? "";
  const recovText  = aiRec?.recovery     ?? intel.coach?.recoveryRecommendation  ?? "";
  const nutText    = aiRec?.nutrition    ?? intel.coach?.nutritionRecommendation ?? "";
  const goalText   = aiRec?.goalInsight  ?? intel.coach?.goalRecommendation      ?? "";
  const focusLabel = aiRec?.primaryFocus ?? intel.coach?.primaryFocus            ?? "";

  const goalStatusColor: Record<string, string> = {
    Exceeded:  "var(--green)",
    "On Track": "var(--accent)",
    Behind:    "var(--red)",
  };

  const recBlock = (text: string) => (
    <div
      style={{
        fontSize: 10,
        color: aiRecLoading && !aiRec ? "var(--text-dim)" : "var(--text-muted)",
        lineHeight: 1.5,
        padding: "6px 8px",
        background: "var(--surface2)",
        borderRadius: 6,
        fontStyle: aiRecLoading && !aiRec ? "italic" : "normal",
      }}
    >
      {aiRecLoading && !aiRec ? "Generating AI recommendations..." : text}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* 1 · Readiness */}
      <div>
        <SideLabel>Readiness</SideLabel>
        {intel.readiness ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, color: intel.readiness.color, lineHeight: 1 }}>
                {intel.readiness.score}
              </span>
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: intel.readiness.color }}>
                  {intel.readiness.grade}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 1 }}>
                  {intel.readiness.label}
                </div>
              </div>
            </div>
            {focusLabel && (
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.04em", marginTop: 2 }}>
                Focus: {focusLabel}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
            Log today&apos;s check-in to activate.
          </div>
        )}
      </div>

      <div style={{ height: 1, background: "var(--border2)" }} />

      {/* 2 · Training Load */}
      <div>
        <SideLabel>Training Load</SideLabel>
        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          {[
            { label: "ATL", value: intel.atl, color: "var(--red)" },
            { label: "CTL", value: intel.ctl, color: "var(--green)" },
            { label: "TSB", value: intel.tsb > 0 ? `+${intel.tsb}` : String(intel.tsb), color: "var(--accent)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
        {recBlock(trainText)}
      </div>

      <div style={{ height: 1, background: "var(--border2)" }} />

      {/* 3 · Goal Progress */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <SideLabel>Goal Progress</SideLabel>
          {intel.coach && (
            <span
              style={{
                fontSize: 8,
                fontFamily: "var(--mono)",
                fontWeight: 700,
                color: goalStatusColor[intel.coach.goalStatus],
                letterSpacing: "0.08em",
              }}
            >
              {intel.coach.goalStatus.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {intel.goalProgress.hasKmGoal  && <GoalLine label="Distance" pct={intel.goalProgress.weeklyKmPct}  color="var(--accent)" />}
          {intel.goalProgress.hasRunGoal && <GoalLine label="Runs"     pct={intel.goalProgress.weeklyRunPct} color="var(--accent)" />}
          {intel.goalProgress.hasGymGoal && <GoalLine label="Gym"      pct={intel.goalProgress.weeklyGymPct} color="var(--purple)" />}
          {!intel.goalProgress.hasKmGoal && !intel.goalProgress.hasRunGoal && !intel.goalProgress.hasGymGoal && (
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>Set targets in Profile.</div>
          )}
        </div>
        {goalText && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 8 }}>
            {aiRecLoading && !aiRec ? "Generating..." : goalText}
          </div>
        )}
      </div>

      <div style={{ height: 1, background: "var(--border2)" }} />

      {/* 4 · Hybrid Athlete Score */}
      <div>
        <SideLabel>Hybrid Athlete Score</SideLabel>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>
            {intel.hybrid.score}
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--accent)" }}>
            {intel.hybrid.level}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <MiniBar value={intel.hybrid.components.recovery}    color="var(--green)"  label="Recovery" />
          <MiniBar value={intel.hybrid.components.training}    color="var(--accent)" label="Training" />
          <MiniBar value={intel.hybrid.components.nutrition}   color="var(--yellow)" label="Nutrition" />
          <MiniBar value={intel.hybrid.components.consistency} color="var(--purple)" label="Consistency" />
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border2)" }} />

      {/* 5 · Recovery & Nutrition Recommendations */}
      {(recovText || nutText) && (
        <div>
          <SideLabel>Recommendations</SideLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { tag: "RECOV", text: recovText },
              { tag: "NUT",   text: nutText },
            ].map(({ tag, text }) => (
              <div
                key={tag}
                style={{
                  padding: "7px 8px",
                  background: "var(--surface2)",
                  borderRadius: 6,
                  borderLeft: "2px solid var(--border)",
                }}
              >
                <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 3 }}>
                  {tag}
                </div>
                <div style={{ fontSize: 10, color: aiRecLoading && !aiRec ? "var(--text-dim)" : "var(--text-muted)", lineHeight: 1.5, fontStyle: aiRecLoading && !aiRec ? "italic" : "normal" }}>
                  {aiRecLoading && !aiRec ? "Generating..." : text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatPlanAsText(
  plan: Array<Record<string, unknown>>,
  focus: string,
  intensity: string,
): string {
  const header = `**Training plan — ${focus} focus, ${intensity} intensity**\n\n`;
  const lines = plan
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((day: any) => {
      const rpe = day.target_rpe ? ` (RPE ${day.target_rpe})` : "";
      return `**${day.day}** — ${day.title}${rpe}: ${day.description}`;
    })
    .join("\n");
  return header + lines;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function CoachPage() {
  const sb     = createClient();
  const router = useRouter();

  const [messages, setMessages]         = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput]               = useState("");
  const [chatLoading, setChatLoading]   = useState(false);
  const [mounted, setMounted]           = useState(false);
  const [sheetOpen, setSheetOpen]       = useState(false);
  const [intel, setIntel]               = useState<Intelligence | null>(null);
  const [intelLoading, setIntelLoading] = useState(true);
  // AI recommendations for the Intelligence Panel
  const [aiRec, setAiRec]               = useState<RecommendResponse | null>(null);
  const [aiRecLoading, setAiRecLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const todayIsSunday  = isSunday();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  // ── Load conversation history from persistent storage ───────────────────

  const loadConvHistory = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any)
      .from("coach_conversations")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data?.length) return;

    const history = ([...data] as { role: string; content: string; created_at: string }[])
      .reverse()
      .map((r) => ({
        role:      r.role as "user" | "assistant",
        content:   r.content,
        timestamp: r.created_at,
      }));

    setMessages([INITIAL_MESSAGE, ...history]);
  }, []);

  useEffect(() => {
    loadConvHistory();
  }, [loadConvHistory]);

  // ── Fetch AI recommendations (non-blocking; deterministic is the fallback) ─

  useEffect(() => {
    setAiRecLoading(true);
    fetch("/api/coach/recommend", { method: "POST" })
      .then((r) => r.json())
      .then((data: unknown) => {
        const d = data as Record<string, unknown>;
        if (!d.error) setAiRec(d as RecommendResponse);
      })
      .catch(() => {})
      .finally(() => setAiRecLoading(false));
  }, []);

  // ── Load deterministic intelligence data ────────────────────────────────

  const loadIntelligence = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const todayStr  = new Date().toISOString().split("T")[0];
    const since7    = new Date(Date.now() -  7 * 86400000).toISOString().split("T")[0];
    const since14   = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
    const since90   = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
    const weekStart = new Date(Date.now() -  7 * 86400000).toISOString().split("T")[0];

    const [
      { data: rawLogs },
      { data: rawSessions },
      { data: rawMetrics },
      { data: rawProfile },
      { data: rawRuns },
      { data: rawWeights },
    ] = await Promise.all([
      sb.from("daily_logs").select("*").eq("user_id", user.id).gte("date", since14).order("date", { ascending: false }),
      sb.from("sessions").select("*").eq("user_id", user.id).gte("date", since14).order("date", { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("training_metrics")
        .select("activity_date, tss, trimp, pace_seconds_per_km, load_score, source")
        .eq("user_id", user.id).gte("activity_date", since90).order("activity_date"),
      sb.from("profiles")
        .select("weekly_run_km_target, weekly_run_count_target, weekly_gym_target, sex, age, height_cm, nutrition_goal_type, target_weight")
        .eq("user_id", user.id).maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("running_activities")
        .select("distance_meters, moving_time_seconds, activity_date")
        .eq("user_id", user.id).gte("activity_date", weekStart),
      sb.from("weight_logs").select("weight").eq("user_id", user.id).order("date", { ascending: false }).limit(1),
    ]);

    const logs     = (rawLogs     ?? []) as DailyLog[];
    const sessions = (rawSessions ?? []) as Session[];
    const metrics  = (rawMetrics  ?? []) as TrainingMetricRow[];
    const profile  = rawProfile as ProfileRow | null;
    const runs     = (rawRuns ?? []) as Pick<RunningActivity, "distance_meters" | "moving_time_seconds" | "activity_date">[];
    const weights  = (rawWeights ?? []) as { weight: number }[];

    const checkinStreak = calcCheckinStreak(logs);
    const sessionStreak = calcSessionStreak(sessions);

    const { ctl, atl, tsb } = metrics.length > 0
      ? computeCTLATLTSB(metrics)
      : { ctl: 0, atl: 0, tsb: 0 };

    const todayLog      = logs.find((l) => l.date === todayStr) ?? null;
    const recoveryScore = computeRecoveryScore(todayLog, tsb);

    const weekDistM    = runs.reduce((s, r) => s + r.distance_meters, 0);
    const weekRunCount = runs.length;
    const weekGymCount = sessions.filter((s) => s.type === "lift" && s.date >= weekStart).length;

    const hasKmGoal  = (profile?.weekly_run_km_target   ?? 0) > 0;
    const hasRunGoal = (profile?.weekly_run_count_target ?? 0) > 0;
    const hasGymGoal = (profile?.weekly_gym_target       ?? 0) > 0;

    const goalProgress: GoalProgress = {
      weeklyKmPct:  hasKmGoal  ? (weekDistM / 1000) / profile!.weekly_run_km_target!   : 0,
      weeklyRunPct: hasRunGoal ? weekRunCount        / profile!.weekly_run_count_target! : 0,
      weeklyGymPct: hasGymGoal ? weekGymCount        / profile!.weekly_gym_target!       : 0,
      hasKmGoal,
      hasRunGoal,
      hasGymGoal,
    };

    let readiness: ReadinessOutput | null = null;
    let coach:     CoachOutput | null     = null;
    let proteinTarget = 140;
    let waterTargetMl = 3000;

    const currentWeight = weights[0]?.weight ?? null;

    if (todayLog && recoveryScore !== null) {
      readiness = computeReadiness(
        recoveryScore, tsb, todayLog.sleep_quality, todayLog.fatigue, todayLog.energy,
      );

      if (profile?.sex && profile?.age && profile?.height_cm && currentWeight) {
        const todaySessions = sessions.filter((s) => s.date === todayStr);
        const targets = calculateDailyTargets(
          {
            sex:              profile.sex as NutritionProfileInputs["sex"],
            age:              profile.age,
            height_cm:        profile.height_cm,
            weight_kg:        currentWeight,
            goal_type:        (profile.nutrition_goal_type ?? "maintain") as NutritionProfileInputs["goal_type"],
            target_weight_kg: profile.target_weight ?? null,
          },
          todaySessions,
          readiness.score,
          false,
          null,
        );
        proteinTarget = targets.protein;
        waterTargetMl = targets.water;
      }

      coach = runCoachEngine({
        recoveryScore,
        readinessScore: readiness.score,
        readinessGrade: readiness.grade,
        ctl, atl, tsb,
        sleepQuality: todayLog.sleep_quality,
        energy:       todayLog.energy,
        mood:         todayLog.mood,
        fatigue:      todayLog.fatigue,
        soreness:     todayLog.soreness,
        goalProgress,
        proteinTarget,
        waterTargetMl,
      });
    } else {
      coach = runCoachEngine({
        recoveryScore:  null,
        readinessScore: 50,
        readinessGrade: "YELLOW",
        ctl, atl, tsb,
        sleepQuality: 7, energy: 5, mood: 5, fatigue: 5, soreness: 5,
        goalProgress,
        proteinTarget,
        waterTargetMl,
      });
    }

    const hybrid = computeHybridScore(recoveryScore, ctl, null, checkinStreak, sessionStreak);

    const last7Logs = logs.filter((l) => l.date >= since7);
    const avgSleep  = last7Logs.length
      ? Math.round((last7Logs.reduce((s, l) => s + l.sleep_hours, 0) / last7Logs.length) * 10) / 10
      : null;
    const avgReadiness = last7Logs.length
      ? Math.round(
          last7Logs.reduce(
            (s, l) =>
              s + (l.sleep_quality * 0.3 + l.mood * 0.2 + l.energy * 0.2 +
                (10 - l.soreness) * 0.15 + (10 - l.fatigue) * 0.15),
            0,
          ) / last7Logs.length * 10,
        ) / 10
      : null;

    setIntel({
      readiness,
      coach,
      hybrid,
      ctl,
      atl,
      tsb,
      goalProgress,
      weeklyStats: {
        readiness: avgReadiness,
        sessions:  sessions.length,
        avgSleep,
      },
    });
    setIntelLoading(false);
  }, []);

  useEffect(() => {
    loadIntelligence();
  }, [loadIntelligence]);

  // ── Chat ────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || chatLoading) return;
      const userMsg: ChatMessage = {
        role: "user",
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };
      const newHistory = [...messages, userMsg];
      setMessages(newHistory);
      setInput("");
      setChatLoading(true);

      // Trim to context window before sending (newest messages take priority)
      const apiMessages = newHistory
        .filter((m, i) => !(i === 0 && m.role === "assistant"))
        .slice(-CONTEXT_WINDOW)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        const assistantContent: string = data.content;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantContent, timestamp: new Date().toISOString() },
        ]);

        // Persist to coach_conversations (fire-and-forget)
        sb.auth.getUser().then(({ data: { user } }) => {
          if (!user) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sb as any).from("coach_conversations").insert([
            { user_id: user.id, role: "user",      content: text.trim() },
            { user_id: user.id, role: "assistant",  content: assistantContent },
          ]).then(() => {}).catch(() => {});
        }).catch(() => {});
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${err instanceof Error ? err.message : "Something went wrong."}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setChatLoading(false);
        inputRef.current?.focus();
      }
    },
    [messages, chatLoading],
  );

  async function runWeeklyReview() {
    if (chatLoading) return;
    setSheetOpen(false);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: "Run my weekly review", timestamp: new Date().toISOString() },
    ]);
    setChatLoading(true);
    try {
      const res  = await fetch("/api/review", { method: "POST" });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.review ?? data.error ?? "Couldn't generate the review.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong generating the review.", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function runGeneratePlan() {
    if (chatLoading) return;
    setSheetOpen(false);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: "Generate a training plan for this week", timestamp: new Date().toISOString() },
    ]);
    setChatLoading(true);
    try {
      const res  = await fetch("/api/coach/quick-plan", { method: "POST" });
      const data = await res.json();
      const content = data.error
        ? `Couldn't generate a plan: ${data.error}`
        : formatPlanAsText(data.plan, data.focus, data.intensity);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content, timestamp: new Date().toISOString() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong generating the plan.", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  function goToSetGoal() {
    setSheetOpen(false);
    router.push("/goals?new=1");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function formatTime(iso?: string) {
    if (!iso || !mounted) return "";
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function formatContent(content: string) {
    if (!content) return "";
    return content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const sourceLabel = aiRecLoading
    ? null
    : aiRec?.source === "ai"
      ? "AI"
      : "RULE";

  const sourceColor = aiRec?.source === "ai" ? "var(--green)" : "var(--text-dim)";

  return (
    <>
      <style>{`
        .coach-root { display: flex; flex-direction: column; width: 100%; height: calc(100vh - 80px); overflow: hidden; }
        .coach-body { display: flex; flex: 1; min-height: 0; gap: 16px; }
        .coach-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .coach-sidebar {
          width: 260px; flex-shrink: 0; display: flex; flex-direction: column; gap: 0;
          background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
          overflow: hidden;
        }
        .coach-sidebar-scroll { flex: 1; overflow-y: auto; padding: 14px; }
        .coach-sidebar-actions {
          padding: 10px 14px; border-top: 1px solid var(--border2);
          display: flex; flex-direction: column; gap: 6px;
        }
        .coach-mobile-toggle { display: none; }
        .coach-prompts { flex-shrink: 0; overflow-x: auto; margin-bottom: 10px; padding-bottom: 2px; }
        @media (max-width: 768px) {
          .coach-root { height: calc(100dvh - 130px); }
          .coach-sidebar { display: none; }
          .coach-mobile-toggle { display: flex !important; }
          .coach-prompt-btn { padding: 7px 11px !important; font-size: 11px !important; min-height: 36px; }
          .coach-messages { padding: 10px !important; border-radius: 10px !important; gap: 10px !important; }
          .coach-msg-bubble { padding: 9px 12px !important; font-size: 14px !important; }
          .coach-input-wrap textarea { font-size: 16px !important; padding: 10px 12px !important; height: 44px; box-sizing: border-box; }
        }
      `}</style>

      <div className="coach-root">
        {/* Header */}
        <div style={{ flexShrink: 0, marginBottom: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 2,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
                AI COACH
              </div>
              {todayIsSunday && <Badge color="var(--accent)">Weekly review day</Badge>}
            </div>
            <button
              className="coach-mobile-toggle"
              onClick={() => setSheetOpen(true)}
              style={{
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface2)",
                color: "var(--text-muted)",
                fontFamily: "var(--mono)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <Activity size={13} strokeWidth={1.75} />
              Stats
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Groq · llama-3.3-70b</div>
        </div>

        {/* Quick prompts */}
        {messages.length <= 1 && (
          <div className="coach-prompts">
            <div style={{ display: "flex", gap: 6, width: "max-content" }}>
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  className="coach-prompt-btn"
                  onClick={() => sendMessage(qp.msg)}
                  disabled={chatLoading}
                  style={{
                    padding: "6px 14px",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    color: chatLoading ? "var(--text-dim)" : "var(--text-muted)",
                    background: "var(--surface2)",
                    cursor: chatLoading ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                    borderRadius: 8,
                    transition: "all 0.15s ease",
                  }}
                >
                  {qp.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="coach-body">
          {/* Chat */}
          <div className="coach-main">
            <div
              className="coach-messages"
              style={{
                flex: 1,
                minWidth: 0,
                overflowY: "auto",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                borderRadius: 12,
              }}
            >
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    maxWidth: "85%",
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    animation: "fadeIn 0.2s ease-out",
                  }}
                >
                  <div
                    className="coach-msg-bubble"
                    style={{
                      padding: "10px 14px",
                      fontSize: 13,
                      lineHeight: 1.65,
                      background: msg.role === "user" ? "var(--accent-dim)" : "var(--surface2)",
                      border: `1px solid ${msg.role === "user" ? "var(--accent)" : "var(--border2)"}`,
                      color: "var(--text)",
                      borderRadius: 10,
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                      maxWidth: "100%",
                    }}
                    dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                  />
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 9,
                      color: "var(--text-dim)",
                      marginTop: 3,
                      textAlign: msg.role === "user" ? "right" : "left",
                    }}
                  >
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
                  <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div
              className="coach-input-wrap"
              style={{
                flexShrink: 0,
                display: "flex",
                marginTop: 10,
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={chatLoading}
                rows={2}
                placeholder="Ask the coach..."
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  background: "var(--surface)",
                  border: "none",
                  color: "var(--text)",
                  outline: "none",
                  fontSize: 13,
                  resize: "none",
                  fontFamily: "var(--sans)",
                  lineHeight: 1.5,
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={chatLoading || !input.trim()}
                style={{
                  padding: "0 20px",
                  background: chatLoading || !input.trim() ? "var(--surface2)" : "var(--accent)",
                  color: chatLoading || !input.trim() ? "var(--text-dim)" : "var(--bg)",
                  fontWeight: 700,
                  fontSize: 20,
                  border: "none",
                  cursor: chatLoading || !input.trim() ? "not-allowed" : "pointer",
                }}
              >
                ↑
              </button>
            </div>
          </div>

          {/* Intelligence Sidebar */}
          <div className="coach-sidebar">
            <div
              style={{
                padding: "12px 14px 10px",
                borderBottom: "1px solid var(--border2)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                }}
              >
                Intelligence Panel
              </div>
              {sourceLabel && (
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: sourceColor,
                    padding: "2px 6px",
                    border: `1px solid ${sourceColor}`,
                    borderRadius: 3,
                  }}
                >
                  {sourceLabel}
                </div>
              )}
            </div>
            <div className="coach-sidebar-scroll">
              <IntelligencePanel
                intel={intel}
                loading={intelLoading}
                aiRec={aiRec}
                aiRecLoading={aiRecLoading}
              />
            </div>
            <div className="coach-sidebar-actions">
              <ShortcutButton
                icon={BarChart2}
                label="Weekly review"
                onClick={runWeeklyReview}
                disabled={chatLoading}
                highlight={todayIsSunday}
              />
              <ShortcutButton
                icon={CalendarDays}
                label="Generate plan"
                onClick={runGeneratePlan}
                disabled={chatLoading}
              />
              <ShortcutButton
                icon={Target}
                label="Set a goal"
                onClick={goToSetGoal}
                disabled={chatLoading}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sheet */}
      {sheetOpen && (
        <div
          onClick={() => setSheetOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 300,
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              background: "var(--surface)",
              borderTop: "1px solid var(--border)",
              borderRadius: "20px 20px 0 0",
              padding: "20px 16px",
              maxHeight: "80vh",
              overflowY: "auto",
              animation: "slideUp 0.2s cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            <div
              style={{
                width: 36,
                height: 3,
                background: "var(--text-dim)",
                borderRadius: 99,
                margin: "0 auto 16px",
              }}
            />
            <IntelligencePanel
              intel={intel}
              loading={intelLoading}
              aiRec={aiRec}
              aiRecLoading={aiRecLoading}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              <ShortcutButton
                icon={BarChart2}
                label="Weekly review"
                onClick={runWeeklyReview}
                disabled={chatLoading}
                highlight={todayIsSunday}
              />
              <ShortcutButton
                icon={CalendarDays}
                label="Generate plan"
                onClick={runGeneratePlan}
                disabled={chatLoading}
              />
              <ShortcutButton
                icon={Target}
                label="Set a goal"
                onClick={goToSetGoal}
                disabled={chatLoading}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
