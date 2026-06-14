"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Badge, TypingDots } from "@/components/ui";
import type { ChatMessage } from "@/types";

export const dynamic = "force-dynamic";

const QUICK_PROMPTS = [
  {
    label: "Recovery check",
    msg: "Pull my last 7 days of data and tell me how my recovery looks.",
  },
  {
    label: "Train or rest today",
    msg: "Look at my recent readiness and sessions — should I train hard today or take it easy?",
  },
  {
    label: "Sleep analysis",
    msg: "Analyze my sleep trends and tell me how they're affecting my training performance.",
  },
  {
    label: "Weekly review",
    msg: "Give me a detailed weekly review. Use my actual numbers. What went well, what needs work?",
  },
  {
    label: "Generate plan",
    msg: "Based on my current fitness and recovery data, generate a training plan for this week.",
  },
  {
    label: "Set a goal",
    msg: "Help me set a realistic body weight goal based on my current data.",
  },
  {
    label: "Load vs recovery",
    msg: "Analyze the trend in my training load vs my recovery scores over the last 2 weeks.",
  },
  {
    label: "Pattern analysis",
    msg: "What patterns do you see in my data? Look at everything — sleep, mood, energy, training.",
  },
];

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Observer OS loaded. I have access to your data — I can query your check-ins, sessions, goals, and weight logs in real time. Ask me anything, or pick a quick action above.",
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
            content: `Error: ${err instanceof Error ? err.message : "Something went wrong. Check your API keys."}`,
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <div
            style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700 }}
          >
            AI COACH
          </div>
          {isSunday && (
            <Badge color="var(--accent)">📊 Weekly Review Day</Badge>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Powered by Groq · llama-3.3-70b · Tool-calling enabled
        </div>
      </div>

      {/* Quick prompts */}
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}
      >
        {QUICK_PROMPTS.map((qp) => (
          <button
            key={qp.label}
            onClick={() => sendMessage(qp.msg)}
            disabled={loading}
            style={{
              padding: "5px 12px",
              border: "1px solid var(--border2)",
              fontSize: 11,
              color: loading ? "var(--text-dim)" : "var(--text-muted)",
              background: "none",
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: "0.03em",
            }}
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              maxWidth: "82%",
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                fontSize: 13,
                lineHeight: 1.7,
                background:
                  msg.role === "user" ? "var(--accent-dim)" : "var(--surface2)",
                border: `1px solid ${msg.role === "user" ? "var(--accent)" : "var(--border)"}`,
                color: "var(--text)",
              }}
              dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
            />
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                color: "var(--text-dim)",
                marginTop: 4,
                textAlign: msg.role === "user" ? "right" : "left",
              }}
            >
              {formatTime(msg.timestamp)}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ alignSelf: "flex-start", maxWidth: "82%" }}>
            <div
              style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
              }}
            >
              <TypingDots />
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                color: "var(--text-dim)",
                marginTop: 4,
              }}
            >
              thinking + querying data...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", marginTop: 12 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={1}
          placeholder="Ask the coach... (Enter to send, Shift+Enter for newline)"
          style={{
            flex: 1,
            padding: "12px 16px",
            background: "var(--surface)",
            border: "1px solid var(--border2)",
            borderRight: "none",
            color: "var(--text)",
            outline: "none",
            fontSize: 13,
            resize: "none",
            fontFamily: "var(--sans)",
            lineHeight: 1.5,
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
            fontSize: 18,
            border: "none",
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
