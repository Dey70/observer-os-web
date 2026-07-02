"use client";

/**
 * AdaptiveGoalsCard — Phase 5A
 *
 * Displays the adaptive goal engine's recommendations alongside the user's
 * own profile targets. Read-only in Phase 5A. Phase 5B will add accept/reject.
 *
 * Receives pre-computed AdaptiveGoalOutput from the parent page;
 * performs no data fetching of its own.
 */

import type { AdaptiveGoalOutput, GoalRecommendation, IntensityLabel } from "@/lib/adaptiveGoals";

// ── Types ──────────────────────────────────────────────────────────────────

interface UserGoals {
  runKm:    number;  // 0 = not set
  runCount: number;
  gym:      number;
}

interface AdaptiveGoalsCardProps {
  goals:     AdaptiveGoalOutput;
  userGoals: UserGoals;
}

// ── Confidence chip ────────────────────────────────────────────────────────

function ConfidenceChip({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 85 ? "var(--green)"  :
    pct >= 70 ? "var(--accent)" :
                "var(--yellow)";
  return (
    <span
      style={{
        fontFamily:    "var(--mono)",
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: "0.08em",
        color,
        border:        `1px solid ${color}44`,
        borderRadius:  4,
        padding:       "1px 6px",
        flexShrink:    0,
        whiteSpace:    "nowrap",
      }}
    >
      {pct}%
    </span>
  );
}

// ── Intensity badge ────────────────────────────────────────────────────────

const INTENSITY_COLOR: Record<IntensityLabel, string> = {
  Easy:     "var(--green)",
  Moderate: "var(--yellow)",
  Hard:     "var(--accent)",
  Peak:     "var(--purple)",
};

function IntensityBadge({ label }: { label: IntensityLabel }) {
  const color = INTENSITY_COLOR[label];
  return (
    <span
      style={{
        fontFamily:    "var(--mono)",
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: "0.1em",
        color,
        border:        `1px solid ${color}55`,
        borderRadius:  4,
        padding:       "2px 8px",
      }}
    >
      {label.toUpperCase()}
    </span>
  );
}

// ── Delta indicator ────────────────────────────────────────────────────────

function Delta({ user, rec, unit }: { user: number; rec: number; unit: string }) {
  if (user <= 0) return null;
  const delta  = rec - user;
  const pct    = Math.round((delta / user) * 100);
  if (Math.abs(pct) < 1) return null;

  const isUp  = delta > 0;
  const color = isUp ? "var(--green)" : "var(--red)";
  const arrow = isUp ? "↑" : "↓";

  return (
    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color, fontWeight: 600 }}>
      {arrow} {isUp ? "+" : ""}{Math.abs(pct)}%
      {unit ? ` (${isUp ? "+" : ""}${Math.round(delta * 10) / 10}${unit})` : ""}
    </span>
  );
}

// ── Goal comparison row ────────────────────────────────────────────────────

interface GoalRowProps {
  label:    string;
  color:    string;
  rec:      GoalRecommendation;
  userVal?: number;  // 0 or undefined = not set
  extra?:   React.ReactNode;
}

function GoalRow({ label, color, rec, userVal, extra }: GoalRowProps) {
  const hasUser = (userVal ?? 0) > 0;

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        gap:           6,
        padding:       "11px 0",
        borderBottom:  "1px solid var(--border2)",
      }}
    >
      {/* Top row: label + values */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Domain label */}
        <span
          style={{
            fontFamily:    "var(--mono)",
            fontSize:      10,
            fontWeight:    700,
            letterSpacing: "0.1em",
            color:         "var(--text-dim)",
            width:         68,
            flexShrink:    0,
          }}
        >
          {label}
        </span>

        {/* User goal */}
        {hasUser ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
              {userVal}{rec.unit}
            </span>
            <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.06em" }}>user</span>
          </div>
        ) : (
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>—</span>
        )}

        {/* Arrow */}
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>→</span>

        {/* Recommended value */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      14,
              fontWeight:    700,
              color,
              letterSpacing: "-0.01em",
            }}
          >
            {rec.value}{rec.unit}
          </span>
          <ConfidenceChip value={rec.confidence} />
          {hasUser && <Delta user={userVal!} rec={rec.value} unit={rec.unit} />}
        </div>

        {extra}
      </div>

      {/* Reason */}
      <p
        style={{
          margin:     0,
          fontSize:   11,
          color:      "var(--text-dim)",
          lineHeight: 1.55,
          paddingLeft: 78,
        }}
      >
        {rec.reason}
      </p>
    </div>
  );
}

// ── Main card ──────────────────────────────────────────────────────────────

export function AdaptiveGoalsCard({ goals, userGoals }: AdaptiveGoalsCardProps) {
  const primaryColor: Record<string, string> = {
    running:   "var(--accent)",
    strength:  "var(--purple)",
    growth:    "var(--green)",
    nutrition: "var(--yellow)",
    recovery:  "var(--red)",
  };
  const accentColor = goals.primaryProgression
    ? (primaryColor[goals.primaryProgression] ?? "var(--accent)")
    : "var(--accent)";

  return (
    <div
      className="dash-card"
      style={{
        background:  "var(--glass-bg)",
        border:      `1px solid ${accentColor}33`,
        marginBottom: 12,
        overflow:    "hidden",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          padding:      "12px 20px",
          borderBottom: "1px solid var(--border2)",
          background:   `${accentColor}08`,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
          gap:          12,
          flexWrap:     "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      9,
              fontWeight:    700,
              letterSpacing: "0.2em",
              color:         "var(--text-muted)",
            }}
          >
            ADAPTIVE GOALS
          </span>
          {goals.primaryProgression && (
            <span
              style={{
                fontFamily:    "var(--mono)",
                fontSize:      9,
                fontWeight:    700,
                letterSpacing: "0.1em",
                color:         accentColor,
                border:        `1px solid ${accentColor}55`,
                borderRadius:  4,
                padding:       "2px 8px",
              }}
            >
              {goals.primaryProgression.toUpperCase()} WEEK
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
          Phase 5A · read-only
        </span>
      </div>

      {/* ── Week summary ─────────────────────────────────────────────────── */}
      <div
        style={{
          padding:     "10px 20px",
          borderBottom: "1px solid var(--border2)",
          borderLeft:  `3px solid ${accentColor}`,
          background:  `${accentColor}06`,
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          {goals.weekSummary}
        </p>
      </div>

      {/* ── Domain rows ──────────────────────────────────────────────────── */}
      <div style={{ padding: "4px 20px 16px" }}>

        {/* ── Running ─────────────────────────────────────────────────── */}
        <div style={{ paddingTop: 12 }}>
          <div
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      9,
              fontWeight:    700,
              letterSpacing: "0.14em",
              color:         "var(--accent)",
              marginBottom:  6,
            }}
          >
            RUNNING
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <GoalRow
              label="Distance"
              color="var(--accent)"
              rec={goals.running.weeklyKm}
              userVal={userGoals.runKm}
            />
            <GoalRow
              label="Runs"
              color="var(--accent)"
              rec={goals.running.weeklyRuns}
              userVal={userGoals.runCount}
            />
            <div
              style={{
                display:       "flex",
                flexDirection: "column",
                gap:           6,
                padding:       "11px 0",
                borderBottom:  "1px solid var(--border2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontFamily:    "var(--mono)",
                    fontSize:      10,
                    fontWeight:    700,
                    letterSpacing: "0.1em",
                    color:         "var(--text-dim)",
                    width:         68,
                    flexShrink:    0,
                  }}
                >
                  Intensity
                </span>
                <IntensityBadge label={goals.running.intensity.label} />
                <ConfidenceChip value={goals.running.intensity.confidence} />
              </div>
              <p
                style={{
                  margin:      0,
                  fontSize:    11,
                  color:       "var(--text-dim)",
                  lineHeight:  1.55,
                  paddingLeft: 78,
                }}
              >
                {goals.running.intensity.reason}
              </p>
            </div>
          </div>
        </div>

        {/* ── Strength ─────────────────────────────────────────────────── */}
        <div style={{ paddingTop: 12 }}>
          <div
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      9,
              fontWeight:    700,
              letterSpacing: "0.14em",
              color:         "var(--purple)",
              marginBottom:  6,
            }}
          >
            STRENGTH
          </div>
          <GoalRow
            label="Sessions"
            color="var(--purple)"
            rec={goals.strength.weeklySessions}
            userVal={userGoals.gym}
          />
        </div>

        {/* ── Growth ───────────────────────────────────────────────────── */}
        <div style={{ paddingTop: 12 }}>
          <div
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      9,
              fontWeight:    700,
              letterSpacing: "0.14em",
              color:         "var(--green)",
              marginBottom:  6,
            }}
          >
            GROWTH
          </div>
          <GoalRow
            label="Hours"
            color="var(--green)"
            rec={goals.growth.weeklyHours}
          />
          <div
            style={{
              display:       "flex",
              flexDirection: "column",
              gap:           4,
              padding:       "10px 0",
              borderBottom:  "1px solid var(--border2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontFamily:    "var(--mono)",
                  fontSize:      10,
                  fontWeight:    700,
                  letterSpacing: "0.1em",
                  color:         "var(--text-dim)",
                  width:         68,
                  flexShrink:    0,
                }}
              >
                Emphasis
              </span>
              <span
                style={{
                  fontFamily:    "var(--mono)",
                  fontSize:      11,
                  fontWeight:    700,
                  color:         "var(--green)",
                  letterSpacing: "0.04em",
                }}
              >
                {goals.growth.categoryEmphasis.label}
              </span>
            </div>
            <p
              style={{
                margin:      0,
                fontSize:    11,
                color:       "var(--text-dim)",
                lineHeight:  1.55,
                paddingLeft: 78,
              }}
            >
              {goals.growth.categoryEmphasis.reason}
            </p>
          </div>
        </div>

        {/* ── Nutrition ────────────────────────────────────────────────── */}
        <div style={{ paddingTop: 12 }}>
          <div
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      9,
              fontWeight:    700,
              letterSpacing: "0.14em",
              color:         "var(--yellow)",
              marginBottom:  6,
            }}
          >
            NUTRITION
          </div>
          <GoalRow
            label="Protein"
            color="var(--yellow)"
            rec={goals.nutrition.protein}
          />
          <GoalRow
            label="Calories"
            color="var(--yellow)"
            rec={{ ...goals.nutrition.calories, value: goals.nutrition.calories.value, unit: " kcal" }}
          />
          <GoalRow
            label="Hydration"
            color="var(--yellow)"
            rec={{
              ...goals.nutrition.hydrationMl,
              value: Math.round(goals.nutrition.hydrationMl.value / 100) / 10,
              unit:  "L",
            }}
          />
        </div>

      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div
        style={{
          padding:      "10px 20px",
          borderTop:    "1px solid var(--border2)",
          background:   "var(--surface2)",
          display:      "flex",
          alignItems:   "center",
          gap:          8,
        }}
      >
        <div
          style={{
            width:  6,
            height: 6,
            borderRadius: "50%",
            background:  accentColor,
            flexShrink:  0,
          }}
        />
        <span style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Recommendations are deterministic and recompute every page load from your current data.
          Goal acceptance coming in Phase 5B.
        </span>
      </div>
    </div>
  );
}
