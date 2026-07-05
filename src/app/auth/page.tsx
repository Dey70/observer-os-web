"use client";

import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

type OAuthProvider = "google" | "github";

const OAUTH_PROVIDERS: {
  id: OAuthProvider;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "google",
    label: "Continue with Google",
    icon: (
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.55 10.78l7.98-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
    ),
  },
  {
    id: "github",
    label: "Continue with GitHub",
    icon: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
    ),
  },
];

function AuthForm() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(
    null,
  );
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(() => {
    const error = searchParams.get("error");
    if (error === "oauth_missing_code") {
      return {
        text: "Sign-in was cancelled or incomplete. Please try again.",
        error: true,
      };
    }
    if (error === "oauth_exchange_failed") {
      return {
        text: "Couldn't complete sign-in with that provider. Please try again.",
        error: true,
      };
    }
    return null;
  });
  const router = useRouter();
  const sb = createClient();

  async function handleOAuth(provider: OAuthProvider) {
    setOauthLoading(provider);
    setMessage(null);
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setMessage({ text: error.message, error: true });
      setOauthLoading(null);
    }
  }

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
              disabled={loading || !!oauthLoading}
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
                cursor:
                  loading || !!oauthLoading ? "not-allowed" : "pointer",
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

          {/* Divider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "24px 0",
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontFamily: "var(--mono)",
                whiteSpace: "nowrap",
              }}
            >
              or continue with
            </div>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {/* OAuth buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {OAUTH_PROVIDERS.map(({ id, label, icon }) => {
              const isThisLoading = oauthLoading === id;
              const disabled = loading || !!oauthLoading;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleOAuth(id)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    background: "var(--bg)",
                    border: "1px solid var(--border2)",
                    color: "var(--text)",
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    letterSpacing: "0.02em",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled && !isThisLoading ? 0.5 : 1,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!disabled)
                      e.currentTarget.style.borderColor = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border2)";
                  }}
                >
                  {icon}
                  {isThisLoading ? "Redirecting..." : label}
                </button>
              );
            })}
          </div>

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

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
