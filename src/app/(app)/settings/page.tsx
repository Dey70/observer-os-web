// src/app/(app)/settings/page.tsx
"use client";

import { useState, useRef } from "react";
import { Card, PageHeader, SectionLabel } from "@/components/ui";
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
} from "lucide-react";

export const dynamic = "force-dynamic";

const DEVELOPER_NAME = "Rajdeep Dey";
const DEVELOPER_TAGLINE = "Made with love in Assam, India";

const SOCIAL_LINKS: { icon: React.ElementType; label: string; href: string }[] =
  [
    { icon: Code, label: "GitHub", href: "https://github.com/Dey70" },
    {
      icon: Briefcase,
      label: "Portfolio",
      href: "https://www.linkedin.com/in/rajdeep-dey-188784289/",
    },
    {
      icon: Camera,
      label: "Instagram",
      href: "https://instagram.com/rajdeep.x70",
    },
    { icon: Mail, label: "Email", href: "mailto:raideep.x70@gmail.com" },
  ];

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
    <div style={{ maxWidth: 640 }}>
      <PageHeader
        title="SETTINGS"
        subtitle="Feedback, bugs, and a bit about this app"
      />

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
        <SectionLabel>About</SectionLabel>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: 4,
          }}
        >
          {DEVELOPER_NAME}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            marginBottom: 18,
          }}
        >
          {DEVELOPER_TAGLINE}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
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
      </Card>
    </div>
  );
}
