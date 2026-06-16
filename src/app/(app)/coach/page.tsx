// src/app/(app)/coach/page.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { calcReadiness, isSunday } from "@/lib/utils";
import { Badge, TypingDots } from "@/components/ui";
import type { ChatMessage, DailyLog, Session } from "@/types";
import { Activity, BarChart2, CalendarDays, Target } from "lucide-react";

export const dynamic = "force-dynamic";

const QUICK_PROMPTS = [
  {
    label: "Recovery",
    msg: "Pull my last 7 days and tell me how my recovery looks.",
  },
  {
    label: "Train today?",
    msg: "Look at my recent readiness — should I train hard today or rest?",
  },
  {
    label: "Sleep",
    msg: "Analyze my sleep trends and how they affect my training.",
  },
  {
    label: "Load vs recovery",
    msg: "Analyze training load vs recovery scores over 2 weeks.",
  },
  {
    label: "Patterns",
    msg: "What patterns do you see across sleep, mood, energy, training?",
  },
];

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Observer OS loaded. I have access to your data — check-ins, sessions, goals, weight logs. Ask me anything.",
};

type WeeklyStats = {
  readiness: number | null;
  sessions: number;
  avgSleep: number | null;
};

function WeeklyStatsBlock({ stats }: { stats: WeeklyStats | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div
          style={{
            fontSize: 9,
            color: "var(--text-dim)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: "var(--mono)",
          }}
        >
          Readiness (7d avg)
        </div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          {stats?.readiness != null ? stats.readiness.toFixed(1) : "—"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <div>
          <div
            style={{
              fontSize: 9,
              color: "var(--text-dim)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontFamily: "var(--mono)",
            }}
          >
            Sessions
          </div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 14,
              color: "var(--text)",
            }}
          >
            {stats?.sessions ?? "—"}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 9,
              color: "var(--text-dim)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontFamily: "var(--mono)",
            }}
          >
            Avg sleep
          </div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 14,
              color: "var(--text)",
            }}
          >
            {stats?.avgSleep != null ? `${stats.avgSleep}h` : "—"}
          </div>
        </div>
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
        <span
          style={{ marginLeft: "auto", fontSize: 9, color: "var(--accent)" }}
        >
          Today
        </span>
      )}
    </button>
  );
}

function formatPlanAsText(
  plan: Array<Record<string, unknown>>,
  focus: string,
  intensity: string,
): string {
  const header = `**Training plan — ${focus} focus, ${intensity} intensity**\n\n`;
  const lines = plan
    .map((day: any) => {
      const rpe = day.target_rpe ? ` (RPE ${day.target_rpe})` : "";
      return `**${day.day}** — ${day.title}${rpe}: ${day.description}`;
    })
    .join("\n");
  return header + lines;
}

export default function CoachPage() {
  const sb = createClient();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const todayIsSunday = isSunday();

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadWeeklyStats = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const since = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .split("T")[0];
    const [{ data: rawLogs }, { data: rawSessions }] = await Promise.all([
      sb
        .from("daily_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", since),
      sb.from("sessions").select("*").eq("user_id", user.id).gte("date", since),
    ]);
    const logs = (rawLogs ?? []) as DailyLog[];
    const sessions = (rawSessions ?? []) as Session[];
    const avgSleep = logs.length
      ? Math.round(
          (logs.reduce((s, l) => s + l.sleep_hours, 0) / logs.length) * 10,
        ) / 10
      : null;
    const readinessScores = logs.map(
      (l) =>
        calcReadiness(l.sleep_quality, l.soreness, l.fatigue, l.mood, l.energy)
          .score,
    );
    const avgReadiness = readinessScores.length
      ? Math.round(
          (readinessScores.reduce((s, v) => s + v, 0) /
            readinessScores.length) *
            10,
        ) / 10
      : null;
    setWeeklyStats({
      readiness: avgReadiness,
      sessions: sessions.length,
      avgSleep,
    });
  }, []);

  useEffect(() => {
    loadWeeklyStats();
  }, [loadWeeklyStats]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const userMsg: ChatMessage = {
        role: "user",
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };
      const newHistory = [...messages, userMsg];
      setMessages(newHistory);
      setInput("");
      setLoading(true);

      const apiMessages = newHistory
        .filter((m, i) => !(i === 0 && m.role === "assistant"))
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.content,
            timestamp: new Date().toISOString(),
          },
        ]);
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
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [messages, loading],
  );

  async function runWeeklyReview() {
    if (loading) return;
    setSheetOpen(false);
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: "Run my weekly review",
        timestamp: new Date().toISOString(),
      },
    ]);
    setLoading(true);
    try {
      const res = await fetch("/api/review", { method: "POST" });
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
        {
          role: "assistant",
          content: "Something went wrong generating the review.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function runGeneratePlan() {
    if (loading) return;
    setSheetOpen(false);
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: "Generate a training plan for this week",
        timestamp: new Date().toISOString(),
      },
    ]);
    setLoading(true);
    try {
      const res = await fetch("/api/coach/quick-plan", { method: "POST" });
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
        {
          role: "assistant",
          content: "Something went wrong generating the plan.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
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
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function formatContent(content: string) {
    if (!content) return "";
    return content
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  return (
    <>
      <style>{`
        .coach-root { display: flex; flex-direction: column; width: 100%; height: calc(100vh - 80px); overflow: hidden; }
        .coach-body { display: flex; flex: 1; min-height: 0; gap: 16px; }
        .coach-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .coach-sidebar { width: 220px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; }
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
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text)",
                }}
              >
                AI COACH
              </div>
              {todayIsSunday && (
                <Badge color="var(--accent)">Weekly review day</Badge>
              )}
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
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Groq · llama-3.3-70b
          </div>
        </div>

        {messages.length <= 1 && (
          <div className="coach-prompts">
            <div style={{ display: "flex", gap: 6, width: "max-content" }}>
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  className="coach-prompt-btn"
                  onClick={() => sendMessage(qp.msg)}
                  disabled={loading}
                  style={{
                    padding: "6px 14px",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    color: loading ? "var(--text-dim)" : "var(--text-muted)",
                    background: "var(--surface2)",
                    cursor: loading ? "not-allowed" : "pointer",
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
                      background:
                        msg.role === "user"
                          ? "var(--accent-dim)"
                          : "var(--surface2)",
                      border: `1px solid ${msg.role === "user" ? "var(--accent)" : "var(--border2)"}`,
                      color: "var(--text)",
                      borderRadius: 10,
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                      maxWidth: "100%",
                    }}
                    dangerouslySetInnerHTML={{
                      __html: formatContent(msg.content),
                    }}
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
              {loading && (
                <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
                  <div
                    style={{
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                    }}
                  >
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
                disabled={loading}
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
                disabled={loading || !input.trim()}
                style={{
                  padding: "0 20px",
                  background:
                    loading || !input.trim()
                      ? "var(--surface2)"
                      : "var(--accent)",
                  color:
                    loading || !input.trim() ? "var(--text-dim)" : "var(--bg)",
                  fontWeight: 700,
                  fontSize: 20,
                  border: "none",
                  cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                }}
              >
                ↑
              </button>
            </div>
          </div>

          <div className="coach-sidebar">
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontFamily: "var(--mono)",
                  marginBottom: 10,
                }}
              >
                This Week
              </div>
              <WeeklyStatsBlock stats={weeklyStats} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <ShortcutButton
                icon={BarChart2}
                label="Weekly review"
                onClick={runWeeklyReview}
                disabled={loading}
                highlight={todayIsSunday}
              />
              <ShortcutButton
                icon={CalendarDays}
                label="Generate plan"
                onClick={runGeneratePlan}
                disabled={loading}
              />
              <ShortcutButton
                icon={Target}
                label="Set a goal"
                onClick={goToSetGoal}
                disabled={loading}
              />
            </div>
          </div>
        </div>
      </div>

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
            <div style={{ marginBottom: 16 }}>
              <WeeklyStatsBlock stats={weeklyStats} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <ShortcutButton
                icon={BarChart2}
                label="Weekly review"
                onClick={runWeeklyReview}
                disabled={loading}
                highlight={todayIsSunday}
              />
              <ShortcutButton
                icon={CalendarDays}
                label="Generate plan"
                onClick={runGeneratePlan}
                disabled={loading}
              />
              <ShortcutButton
                icon={Target}
                label="Set a goal"
                onClick={goToSetGoal}
                disabled={loading}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
