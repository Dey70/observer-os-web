// src/components/ThemeSwitcher.tsx
//
// Shared theme picker — used by both the sidebar (compact swatches) and
// the Settings page (full picker cards). Always maps over THEMES from the
// registry; never hardcode a theme list here or anywhere else.
"use client";

import { Check } from "lucide-react";
import { THEMES } from "@/lib/themes";

function Swatch({ previewBg, previewAccent, size }: { previewBg: string; previewAccent: string; size: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "block",
        flexShrink: 0,
        background: previewBg,
        border: `2px solid ${previewAccent}`,
        boxShadow: `inset 0 0 0 2px ${previewBg}, 0 0 0 1px ${previewAccent}33`,
      }}
    />
  );
}

export function ThemeSwitcher({
  value,
  onChange,
  variant = "compact",
}: {
  value: string;
  onChange: (id: string) => void;
  variant?: "compact" | "grid";
}) {
  if (variant === "grid") {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        {THEMES.map((theme) => {
          const active = value === theme.id;
          return (
            <button
              key={theme.id}
              onClick={() => onChange(theme.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "14px 14px",
                borderRadius: 12,
                border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: active ? "var(--accent-dim)" : "var(--surface2)",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <Swatch previewBg={theme.previewBg} previewAccent={theme.previewAccent} size={28} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: active ? "var(--accent)" : "var(--text)",
                  }}
                >
                  {theme.label}
                  {active && <Check size={12} strokeWidth={3} />}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-dim)",
                    marginTop: 3,
                    lineHeight: 1.5,
                  }}
                >
                  {theme.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid var(--border2)",
        background: "var(--surface2)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
        }}
      >
        THEME
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        {THEMES.map((theme) => {
          const active = value === theme.id;
          return (
            <button
              key={theme.id}
              onClick={() => onChange(theme.id)}
              title={theme.label}
              aria-label={theme.label}
              aria-pressed={active}
              style={{
                position: "relative",
                padding: 0,
                border: "none",
                background: "none",
                cursor: "pointer",
                lineHeight: 0,
              }}
            >
              <Swatch previewBg={theme.previewBg} previewAccent={theme.previewAccent} size={18} />
              {active && (
                <span
                  style={{
                    position: "absolute",
                    inset: -3,
                    borderRadius: "50%",
                    border: "1.5px solid var(--text)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
