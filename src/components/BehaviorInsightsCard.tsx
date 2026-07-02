"use client";

/**
 * BehaviorInsightsCard — Phase 6C
 *
 * Displays the top 3 behavioral patterns discovered by the behavior learning
 * engine, plus any high-priority planner suggestions. Receives a pre-computed
 * BehaviorProfile; performs no data fetching of its own.
 *
 * Renders a "still learning" state when fewer than MIN_SAMPLES of data are
 * available, so it gracefully handles new users.
 */

import type { BehaviorInsight, BehaviorProfile, PlannerSuggestion } from "@/lib/behaviorLearning";

// ── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct   = Math.round(value * 100);
  const color = value >= 0.80 ? "var(--green)" : value >= 0.65 ? "var(--yellow)" : "var(--text-dim)";
  return (
    <span
      style={{
        fontFamily:    "var(--mono)",
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: "0.08em",
        color,
        border:        `1px solid ${color}55`,
        borderRadius:  4,
        padding:       "2px 7px",
        flexShrink:    0,
        whiteSpace:    "nowrap",
      }}
    >
      {pct}%
    </span>
  );
}

function InsightRow({ insight }: { insight: BehaviorInsight }) {
  return (
    <div
      style={{
        display:       "flex",
        alignItems:    "flex-start",
        gap:           10,
        padding:       "10px 0",
        borderBottom:  "1px solid var(--border2)",
      }}
    >
      <ConfidenceBadge value={insight.confidence} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>
          {insight.pattern}
        </div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize:   9,
            color:      "var(--text-dim)",
            marginTop:  4,
            lineHeight: 1.4,
          }}
        >
          {insight.reason} · n={insight.sampleSize}
        </div>
      </div>
    </div>
  );
}

function SuggestionRow({ suggestion }: { suggestion: PlannerSuggestion }) {
  const priorityColor =
    suggestion.priority === "high"   ? "var(--red)"    :
    suggestion.priority === "medium" ? "var(--yellow)" : "var(--text-dim)";

  return (
    <div
      style={{
        display:    "flex",
        alignItems: "flex-start",
        gap:        10,
        padding:    "8px 0",
        borderBottom: "1px solid var(--border2)",
      }}
    >
      <span
        style={{
          fontFamily:    "var(--mono)",
          fontSize:      8,
          fontWeight:    700,
          letterSpacing: "0.10em",
          color:         priorityColor,
          border:        `1px solid ${priorityColor}55`,
          borderRadius:  4,
          padding:       "2px 7px",
          flexShrink:    0,
          marginTop:     1,
          whiteSpace:    "nowrap",
        }}
      >
        {suggestion.priority.toUpperCase()}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
          {suggestion.action}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3, lineHeight: 1.4 }}>
          {suggestion.reason}
        </div>
      </div>
    </div>
  );
}

// ── Data quality badge ───────────────────────────────────────────────────────

const QUALITY_META = {
  rich:     { label: "RICH DATA",     color: "var(--green)"  },
  moderate: { label: "MODERATE DATA", color: "var(--yellow)" },
  sparse:   { label: "LEARNING",      color: "var(--text-dim)" },
} satisfies Record<BehaviorProfile["dataQuality"], { label: string; color: string }>;

// ── Card ─────────────────────────────────────────────────────────────────────

interface Props {
  profile: BehaviorProfile | null;
}

export function BehaviorInsightsCard({ profile }: Props) {
  if (!profile) return null;

  const quality     = QUALITY_META[profile.dataQuality];
  const hasInsights = profile.topInsights.length > 0;
  const suggestions = profile.plannerSuggestions.filter((s) => s.priority !== "low");

  return (
    <div
      className="dash-card"
      style={{
        background:   "var(--surface)",
        border:       "1px solid var(--border)",
        marginBottom: 12,
        overflow:     "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding:        "12px 20px",
          borderBottom:   "1px solid var(--border2)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          gap:            8,
        }}
      >
        <div
          style={{
            fontFamily:    "var(--mono)",
            fontSize:      9,
            fontWeight:    700,
            letterSpacing: "0.20em",
            color:         "var(--text-muted)",
          }}
        >
          BEHAVIOR INSIGHTS
        </div>
        <span
          style={{
            fontFamily:    "var(--mono)",
            fontSize:      8,
            fontWeight:    700,
            letterSpacing: "0.10em",
            color:         quality.color,
            border:        `1px solid ${quality.color}55`,
            borderRadius:  4,
            padding:       "2px 8px",
          }}
        >
          {quality.label}
        </span>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "14px 20px" }}>
        {!hasInsights ? (
          /* Sparse state — not enough data yet */
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div
              style={{
                fontFamily:    "var(--mono)",
                fontSize:      11,
                fontWeight:    700,
                letterSpacing: "0.12em",
                color:         "var(--text-dim)",
                marginBottom:  8,
              }}
            >
              OBSERVER IS STILL LEARNING
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, maxWidth: 360, margin: "0 auto" }}>
              Patterns emerge after 5+ sessions per type. Keep logging check-ins, sessions,
              and growth entries — insights will appear here automatically.
            </div>
          </div>
        ) : (
          <>
            {/* Top insights */}
            <div style={{ marginBottom: suggestions.length > 0 ? 16 : 0 }}>
              {profile.topInsights.map((insight, i) => (
                <InsightRow key={i} insight={insight} />
              ))}
            </div>

            {/* Planner suggestions */}
            {suggestions.length > 0 && (
              <>
                <div
                  style={{
                    fontFamily:    "var(--mono)",
                    fontSize:      8,
                    fontWeight:    700,
                    letterSpacing: "0.14em",
                    color:         "var(--text-dim)",
                    marginBottom:  8,
                    paddingTop:    4,
                  }}
                >
                  PLANNER SUGGESTIONS
                </div>
                {suggestions.map((s, i) => (
                  <SuggestionRow key={i} suggestion={s} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
