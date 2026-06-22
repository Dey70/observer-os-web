// src/app/(app)/settings/page.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Card, PageHeader, SectionLabel, Spinner } from "@/components/ui";
import {
  Bug,
  Lightbulb,
  MessageSquare,
  Paperclip,
  X,
  Check,
  Code,
  Briefcase,
  Camera,
  Mail,
  Activity,
  RefreshCw,
  Unlink,
  Link2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

const DEVELOPER_NAME = "Rajdeep Dey";
const DEVELOPER_TAGLINE = "Made with ❤️ in Assam, India";

const SOCIAL_LINKS: { icon: React.ElementType; label: string; href: string }[] =
  [
    { icon: Code, label: "GitHub", href: "https://github.com/Dey70" },
    {
      icon: Briefcase,
      label: "LinkedIn",
      href: "https://linkedin.com/in/your-handle",
    },
    {
      icon: Camera,
      label: "Instagram",
      href: "https://instagram.com/your-handle",
    },
    { icon: Mail, label: "Email", href: "mailto:rajdeep.x70@gmail.com" },
  ];

// Draft starting point — rewrite this in your own words/facts before shipping it.
const CREATOR_NOTE_PARAGRAPHS = [
  "Hey, I'm Rajdeep — a BTech AI & Data Science student from Assam, and a hybrid athlete training running and lifting on the side.",
  "Observer OS started as a way to stop guessing. I wanted one place that actually understood my training, recovery, and nutrition together instead of juggling a handful of apps that never talked to each other. The macro targets, the readiness scoring, the AI coach, the water tracking that adjusts for heat — all of it is built around how I actually train and think about my own numbers.",
  "I'm building this mostly for myself, but figured if it's useful to me, it might be useful to someone else too. If something's broken or could be better, the bug report above goes straight to my inbox — I read every one.",
  "Thanks for trying something I built for myself and decided to share.",
];

const TECH_STACK = "Next.js, Supabase, and Groq-powered AI";

// ─── Strava Integration ───────────────────────────────────────────────────────

type StravaStatus =
  | { connected: false }
  | {
      connected: true;
      athlete_name: string | null;
      athlete_avatar: string | null;
      last_synced_at: string | null;
      activity_count: number;
      week_km: number;
    };

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StravaIntegrationCard() {
  const [status, setStatus] = useState<StravaStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetch("/api/strava/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));

    // Handle redirect back from Strava OAuth
    const url = new URL(window.location.href);
    const stravaParam = url.searchParams.get("strava");
    if (stravaParam === "connected") {
      setSyncMsg({ type: "success", text: "Strava connected!" });
      window.history.replaceState({}, "", "/settings");
    } else if (stravaParam === "error") {
      setSyncMsg({ type: "error", text: "Connection failed — try again." });
      window.history.replaceState({}, "", "/settings");
    } else if (stravaParam === "denied") {
      setSyncMsg({ type: "error", text: "Authorization denied on Strava." });
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSyncMsg({ type: "error", text: data.error ?? "Sync failed." });
      } else {
        setSyncMsg({
          type: "success",
          text: `Synced ${data.inserted} new activit${data.inserted === 1 ? "y" : "ies"}.`,
        });
        // Refresh status to update counts
        fetch("/api/strava/status")
          .then((r) => r.json())
          .then(setStatus);
      }
    } catch {
      setSyncMsg({ type: "error", text: "Network error during sync." });
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Strava? Your imported activities will be kept."))
      return;
    setDisconnecting(true);
    try {
      await fetch("/api/strava/disconnect", { method: "DELETE" });
      setStatus({ connected: false });
      setSyncMsg(null);
    } finally {
      setDisconnecting(false);
    }
  }

  const isConnected = status?.connected === true;

  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionLabel>Integrations</SectionLabel>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {/* Left: Strava identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: isConnected ? "rgba(252,76,2,0.12)" : "var(--surface2)",
              border: `1px solid ${isConnected ? "rgba(252,76,2,0.35)" : "var(--border)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Activity
              size={18}
              color={isConnected ? "#FC4C02" : "var(--text-dim)"}
              strokeWidth={2}
            />
          </div>

          <div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              Strava
            </div>
            {status === null ? (
              <div
                style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}
              >
                Loading...
              </div>
            ) : isConnected && status.connected ? (
              <div style={{ marginTop: 2 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "var(--green)",
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "0.05em",
                    }}
                  >
                    <CheckCircle2 size={11} strokeWidth={2.5} />
                    CONNECTED
                  </span>
                  {status.athlete_name && (
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                      · {status.athlete_name}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-dim)",
                    fontFamily: "var(--mono)",
                    marginTop: 3,
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{status.activity_count} activities imported</span>
                  <span>·</span>
                  <span>Synced {formatRelativeTime(status.last_synced_at)}</span>
                  {status.week_km > 0 && (
                    <>
                      <span>·</span>
                      <span>{status.week_km} km this week</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                Connect to import runs and rides
              </div>
            )}
          </div>
        </div>

        {/* Right: Action buttons */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {status !== null && isConnected ? (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface2)",
                  color: syncing ? "var(--text-dim)" : "var(--text-muted)",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  cursor: syncing ? "not-allowed" : "pointer",
                  letterSpacing: "0.05em",
                }}
              >
                <RefreshCw
                  size={12}
                  strokeWidth={2}
                  style={{
                    animation: syncing ? "spin 0.8s linear infinite" : "none",
                  }}
                />
                {syncing ? "Syncing..." : "Sync Now"}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--red-dim)",
                  background: "var(--red-dim)",
                  color: "var(--red)",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  cursor: disconnecting ? "not-allowed" : "pointer",
                  letterSpacing: "0.05em",
                  opacity: disconnecting ? 0.5 : 1,
                }}
              >
                <Unlink size={12} strokeWidth={2} />
                Disconnect
              </button>
            </>
          ) : status !== null ? (
            <a
              href="/api/strava/auth"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 18px",
                borderRadius: 8,
                border: "1px solid rgba(252,76,2,0.5)",
                background: "rgba(252,76,2,0.1)",
                color: "#FC4C02",
                fontFamily: "var(--mono)",
                fontSize: 11,
                textDecoration: "none",
                letterSpacing: "0.05em",
                fontWeight: 600,
              }}
            >
              <Link2 size={12} strokeWidth={2} />
              Connect Strava
            </a>
          ) : null}
        </div>
      </div>

      {/* Sync feedback message */}
      {syncMsg && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: 8,
            background:
              syncMsg.type === "success" ? "var(--green-dim)" : "var(--red-dim)",
            border: `1px solid ${syncMsg.type === "success" ? "var(--green)" : "var(--red)"}`,
            color:
              syncMsg.type === "success" ? "var(--green)" : "var(--red)",
            fontSize: 11,
            fontFamily: "var(--mono)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {syncMsg.type === "success" ? (
            <CheckCircle2 size={12} strokeWidth={2.5} />
          ) : (
            <AlertCircle size={12} strokeWidth={2.5} />
          )}
          {syncMsg.text}
        </div>
      )}
    </Card>
  );
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

type Category = "bug" | "feature" | "feedback";

const CATEGORIES: {
  value: Category;
  label: string;
  icon: React.ElementType;
}[] = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "feature", label: "Feature idea", icon: Lightbulb },
  { value: "feedback", label: "Feedback", icon: MessageSquare },
];

export default function SettingsPage() {
  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("That image is too large — please use one under 5MB.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshot(reader.result as string);
      setScreenshotName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function removeScreenshot() {
    setScreenshot(null);
    setScreenshotName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), category, screenshot }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Something went wrong sending that.");
      } else {
        setSent(true);
        setMessage("");
        removeScreenshot();
        setTimeout(() => setSent(false), 4000);
      }
    } catch {
      setError("Something went wrong sending that.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div style={{ maxWidth: 640 }}>
        <PageHeader
          title="SETTINGS"
          subtitle="Integrations, feedback, and a bit about this app"
        />

        <StravaIntegrationCard />

        <Card style={{ marginBottom: 16 }}>
          <SectionLabel>Report a bug or idea</SectionLabel>

          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            {CATEGORIES.map((cat) => {
              const isActive = category === cat.value;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    borderRadius: 99,
                    border: isActive
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                    background: isActive
                      ? "var(--accent-dim)"
                      : "var(--surface2)",
                    color: isActive ? "var(--accent)" : "var(--text-muted)",
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  <Icon size={13} strokeWidth={1.75} />
                  {cat.label}
                </button>
              );
            })}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              category === "bug"
                ? "What happened? What did you expect instead? Steps to reproduce if you can..."
                : category === "feature"
                  ? "What would you like to see added or changed?"
                  : "Anything on your mind about the app..."
            }
            rows={5}
            style={{
              width: "100%",
              padding: "11px 14px",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              color: "var(--text)",
              outline: "none",
              fontFamily: "var(--sans)",
              fontSize: 14,
              resize: "vertical",
              lineHeight: 1.6,
              boxSizing: "border-box",
              marginBottom: 12,
            }}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            {screenshot === null ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface2)",
                  color: "var(--text-muted)",
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <Paperclip size={13} strokeWidth={1.75} />
                Attach screenshot
              </button>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border2)",
                  background: "var(--surface2)",
                }}
              >
                <img
                  src={screenshot}
                  alt="Screenshot preview"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    objectFit: "cover",
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    fontFamily: "var(--mono)",
                    maxWidth: 140,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {screenshotName}
                </span>
                <button
                  onClick={removeScreenshot}
                  style={{
                    width: 20,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <X size={12} color="var(--text-dim)" strokeWidth={1.75} />
                </button>
              </div>
            )}
          </div>

          {error !== null && (
            <div
              style={{
                fontSize: 12,
                color: "var(--red)",
                fontFamily: "var(--mono)",
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={handleSubmit}
              disabled={message.trim().length === 0 || sending}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "11px 22px",
                background:
                  message.trim().length === 0 || sending
                    ? "var(--surface2)"
                    : "var(--accent)",
                color:
                  message.trim().length === 0 || sending
                    ? "var(--text-dim)"
                    : "var(--bg)",
                border: "none",
                borderRadius: 8,
                fontFamily: "var(--mono)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                cursor:
                  message.trim().length === 0 || sending
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {sending ? "Sending..." : "Send"}
            </button>
            {sent === true && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 12,
                  color: "var(--green)",
                  fontFamily: "var(--mono)",
                }}
              >
                <Check size={13} strokeWidth={2.5} />
                Sent — thanks for flagging it
              </span>
            )}
          </div>
        </Card>

        <Card>
          <SectionLabel>About the creator</SectionLabel>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "var(--accent-dim)",
                border: "1px solid var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--mono)",
                fontSize: 16,
                fontWeight: 700,
                color: "var(--accent)",
                flexShrink: 0,
              }}
            >
              RD
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text)",
                }}
              >
                {DEVELOPER_NAME}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                {DEVELOPER_TAGLINE}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            {SOCIAL_LINKS.map((social) => {
              const Icon = social.icon;
              return (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={social.label}
                  style={{
                    width: 36,
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface2)",
                    color: "var(--text-muted)",
                  }}
                >
                  <Icon size={16} strokeWidth={1.75} />
                </a>
              );
            })}
          </div>

          <button
            onClick={() => setNotesOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--border2)",
              background: "var(--surface2)",
              color: "var(--text)",
              fontFamily: "var(--sans)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Notes from the creator
            <span style={{ color: "var(--accent)", fontFamily: "var(--mono)" }}>
              →
            </span>
          </button>
        </Card>
      </div>

      {notesOpen && (
        <div
          onClick={() => setNotesOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 400,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--select-bg)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "24px 24px 20px",
              maxWidth: 480,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              animation: "scoreIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontFamily: "var(--mono)",
                }}
              >
                A note from Rajdeep
              </div>
              <button
                onClick={() => setNotesOpen(false)}
                style={{
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <X size={15} color="var(--text-dim)" strokeWidth={1.75} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {CREATOR_NOTE_PARAGRAPHS.map((para, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: "var(--text)",
                    margin: 0,
                  }}
                >
                  {para}
                </p>
              ))}
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: "1px solid var(--border2)",
                fontSize: 11,
                color: "var(--text-dim)",
                fontFamily: "var(--mono)",
              }}
            >
              Built with {TECH_STACK}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
