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
    else router.push("/home");
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
        backgroundImage:
          "radial-gradient(ellipse at 50% 0%, rgba(232,255,71,0.04) 0%, transparent 60%)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* Logo area */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.3em",
              color: "var(--accent)",
              textTransform: "uppercase",
              textShadow: "0 0 30px rgba(232,255,71,0.4)",
              marginBottom: 8,
            }}
          >
            Observer OS
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              letterSpacing: "0.05em",
            }}
          >
            Personal AI performance coach
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "32px 28px",
            boxShadow: "0 0 40px rgba(0,0,0,0.4)",
          }}
        >
          {/* Tabs */}
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
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: tab === t ? "var(--accent)" : "var(--text-muted)",
                  background: "none",
                  border: "none",
                  borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
                  marginBottom: -1,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  fontFamily: "var(--mono)",
                }}
              >
                {t === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={tab === "signin" ? handleSignIn : handleSignUp}>
            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                  fontFamily: "var(--mono)",
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
                  padding: "10px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--border2)",
                  color: "var(--text)",
                  outline: "none",
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border2)")}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                  fontFamily: "var(--mono)",
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
                  padding: "10px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--border2)",
                  color: "var(--text)",
                  outline: "none",
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border2)")}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px",
                background: loading ? "#555" : "var(--accent)",
                color: "#000",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                fontFamily: "var(--mono)",
                boxShadow: loading ? "none" : "0 0 20px rgba(232,255,71,0.2)",
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
                marginTop: 16,
                textAlign: "center",
                color: message.error ? "var(--red)" : "var(--green)",
                fontFamily: "var(--mono)",
                letterSpacing: "0.02em",
              }}
            >
              {message.text}
            </div>
          )}
        </div>

        {/* Bottom text */}
        <div
          style={{
            textAlign: "center",
            marginTop: 20,
            fontSize: 11,
            color: "var(--text-dim)",
            letterSpacing: "0.05em",
          }}
        >
          Data-driven · AI-powered · Built for athletes
        </div>
      </div>
    </div>
  );
}
