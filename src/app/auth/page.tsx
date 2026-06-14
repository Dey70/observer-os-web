"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AuthPage() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const router = useRouter();
  const sb = createClient();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setMessage({ text: error.message, error: true });
    else router.push("/checkin");
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const { error } = await sb.auth.signUp({ email, password });
    setLoading(false);
    if (error) setMessage({ text: error.message, error: true });
    else
      setMessage({
        text: "Check your email to confirm your account.",
        error: false,
      });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "40px 32px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.2em",
            color: "var(--accent)",
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          Observer OS
        </div>
        <div
          style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 32 }}
        >
          Personal AI performance coach
        </div>

        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            marginBottom: 28,
          }}
        >
          {(["signin", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setMessage(null);
              }}
              style={{
                flex: 1,
                padding: "10px",
                textAlign: "center",
                fontSize: 13,
                color: tab === t ? "var(--accent)" : "var(--text-muted)",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
                marginBottom: -1,
                cursor: "pointer",
              }}
            >
              {t === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={tab === "signin" ? handleSignIn : handleSignUp}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--bg)",
                border: "1px solid var(--border2)",
                color: "var(--text)",
                outline: "none",
                fontFamily: "var(--mono)",
                fontSize: 13,
              }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--bg)",
                border: "1px solid var(--border2)",
                color: "var(--text)",
                outline: "none",
                fontFamily: "var(--mono)",
                fontSize: 13,
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              background: loading ? "#555" : "var(--accent)",
              color: "#000",
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "0.04em",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: 8,
            }}
          >
            {loading
              ? "Please wait..."
              : tab === "signin"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>

        {message && (
          <div
            style={{
              fontSize: 12,
              marginTop: 14,
              textAlign: "center",
              color: message.error ? "var(--red)" : "var(--green)",
            }}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
