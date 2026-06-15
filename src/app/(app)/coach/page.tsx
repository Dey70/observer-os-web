"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Badge, TypingDots } from "@/components/ui";
import type { ChatMessage } from "@/types";

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
    label: "Week review",
    msg: "Give me a detailed weekly review with actual numbers.",
  },
  {
    label: "Generate plan",
    msg: "Generate a training plan for this week based on my data.",
  },
  {
    label: "Set goal",
    msg: "Help me set a realistic body weight goal based on my data.",
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

export default function CoachPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSunday = new Date().getDay() === 0;
  const weeklyReviewSent = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (isSunday && !weeklyReviewSent.current) {
      weeklyReviewSent.current = true;
      setTimeout(() => {
        sendMessage(
          "It's Sunday — run a full weekly review using my actual data. Be specific with numbers.",
        );
      }, 1200);
    }
  }, []);

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
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "API error");
        }
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
    /*
      Key insight: we use a fixed-height flex column.
      On desktop: height = calc(100vh - 120px) — sidebar + padding
      On mobile:  height = calc(100dvh - 160px) — bottom nav + padding
      The middle messages div gets flex:1 and overflows-y scroll.
      Input is always at the bottom of the flex column, never pushed off screen.
    */
    <div
      className="coach-root"
      style={{
        display: "flex",
        flexDirection: "column",
        /* desktop height */
        height: "calc(100vh - 120px)",
        maxHeight: "calc(100vh - 120px)",
      }}
    >
      {/* Inject mobile override via a style tag */}
      <style>{`
        @media (max-width: 768px) {
          .coach-root {
            height: calc(100dvh - 160px) !important;
            max-height: calc(100dvh - 160px) !important;
          }
        }
      `}</style>

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
          <div
            style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700 }}
          >
            AI COACH
          </div>
          {isSunday && <Badge color="var(--accent)">📊 Weekly Review</Badge>}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Groq · llama-3.3-70b · Tool-calling enabled
        </div>
      </div>

      {/* Quick prompts — horizontal scroll, never wraps */}
      <div
        style={{
          flexShrink: 0,
          overflowX: "auto",
          marginBottom: 10,
          paddingBottom: 2,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 6,
            width: "max-content",
            paddingRight: 4,
          }}
        >
          {QUICK_PROMPTS.map((qp) => (
            <button
              key={qp.label}
              onClick={() => sendMessage(qp.msg)}
              disabled={loading}
              style={{
                padding: "6px 14px",
                border: "1px solid var(--border2)",
                fontSize: 12,
                color: loading ? "var(--text-dim)" : "var(--text-muted)",
                background: "rgba(255,255,255,0.03)",
                cursor: loading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                borderRadius: 8,
                flexShrink: 0,
              }}
            >
              {qp.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages — takes all remaining space, scrolls internally */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          borderRadius: 12,
          minHeight: 0 /* critical — prevents flex child from overflowing */,
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
              style={{
                padding: "10px 14px",
                fontSize: 13,
                lineHeight: 1.65,
                background:
                  msg.role === "user" ? "var(--accent-dim)" : "var(--surface2)",
                border: `1px solid ${msg.role === "user" ? "var(--accent)" : "var(--border)"}`,
                color: "var(--text)",
                borderRadius: 10,
                wordBreak: "break-word",
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
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                color: "var(--text-dim)",
                marginTop: 3,
              }}
            >
              thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — always at bottom, never scrolls away */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          marginTop: 10,
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid var(--border2)",
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={2}
          placeholder="Ask the coach... (Enter to send, Shift+Enter for newline)"
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
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          style={{
            padding: "0 20px",
            background:
              loading || !input.trim() ? "var(--border2)" : "var(--accent)",
            color: "#000",
            fontWeight: 700,
            fontSize: 20,
            border: "none",
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            flexShrink: 0,
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
