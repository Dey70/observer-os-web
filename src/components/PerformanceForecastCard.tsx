"use client";

import type {
  PredictionOutput,
  RiskLevel,
} from "@/lib/predictionEngine";
import { formatMinutes, riskColor } from "@/lib/predictionEngine";

// ── Sub-components ─────────────────────────────────────────────────────────

function RiskPill({ level }: { level: RiskLevel }) {
  const color = riskColor(level);
  return (
    <span
      style={{
        fontFamily:     "var(--mono)",
        fontSize:       9,
        fontWeight:     700,
        letterSpacing:  "0.10em",
        color,
        border:         `1px solid ${color}55`,
        borderRadius:   4,
        padding:        "2px 8px",
      }}
    >
      {level}
    </span>
  );
}

function ConfBar({ pct, color = "var(--accent)" }: { pct: number; color?: string }) {
  return (
    <div style={{ flex: 1, height: 3, background: "var(--border2)", borderRadius: 2, overflow: "hidden" }}>
      <div
        style={{
          height:     "100%",
          width:      `${Math.min(100, pct)}%`,
          background: pct >= 100 ? "var(--green)" : color,
          borderRadius: 2,
          transition: "width 0.9s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
    </div>
  );
}

// "28 → 35" arrow display
function ArrowValue({
  current,
  predicted,
  color = "var(--accent)",
  suffix = "",
}: {
  current:   string | number;
  predicted: string | number;
  color?:    string;
  suffix?:   string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: "var(--text-muted)" }}>
        {current}{suffix}
      </span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>→</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color }}>
        {predicted}{suffix}
      </span>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  ctl:              number;
  weeklyRunKm:      number;
  estimated5KMin:   number | null;
  estimated10KMin:  number | null;
  prediction:       PredictionOutput;
}

// ── Card ───────────────────────────────────────────────────────────────────

export function PerformanceForecastCard({
  ctl,
  weeklyRunKm,
  estimated5KMin,
  estimated10KMin,
  prediction,
}: Props) {
  const { performance: perf, risk, goals, meta, growth } = prediction;

  const qualityColor =
    meta.dataQuality === "HIGH"   ? "var(--green)"  :
    meta.dataQuality === "MEDIUM" ? "var(--yellow)" :
    "var(--red)";

  // Delta helpers
  const ctl14Delta = Math.round((perf.predictedCTL14.value - ctl) * 10) / 10;
  const kmDelta    = Math.round((perf.predictedWeeklyKm.value - weeklyRunKm) * 10) / 10;

  return (
    <div
      className="dash-card"
      style={{
        background:    "var(--surface)",
        border:        "1px solid var(--accent)22",
        marginBottom:  12,
        overflow:      "hidden",
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
          flexWrap:       "wrap",
          gap:            8,
          background:     "var(--accent)06",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      9,
              fontWeight:    700,
              letterSpacing: "0.20em",
              color:         "var(--text-muted)",
            }}
          >
            PERFORMANCE FORECAST
          </div>
          <div
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      8,
              letterSpacing: "0.12em",
              color:         "var(--accent)",
              border:        "1px solid var(--accent)44",
              borderRadius:  4,
              padding:       "2px 8px",
            }}
          >
            30 DAYS
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      9,
              color:         qualityColor,
              letterSpacing: "0.10em",
              fontWeight:    700,
            }}
          >
            {meta.dataQuality} CONFIDENCE
          </div>
          <div
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      11,
              fontWeight:    700,
              color:         qualityColor,
            }}
          >
            {Math.round(meta.confidence * 100)}%
          </div>
        </div>
      </div>

      {/* ── Body — two columns ── */}
      <div
        style={{
          padding:  "16px 20px",
          display:  "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:      20,
        }}
      >
        {/* Left — Performance projections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              fontFamily:    "var(--mono)",
              fontSize:      8,
              letterSpacing: "0.16em",
              color:         "var(--text-dim)",
              textTransform: "uppercase",
              marginBottom:  2,
            }}
          >
            Performance Projections
          </div>

          {/* CTL */}
          <div>
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                marginBottom:   5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                  CTL · Fitness
                </span>
                <span
                  style={{
                    fontFamily:    "var(--mono)",
                    fontSize:      8,
                    color:         ctl14Delta > 0 ? "var(--green)" : ctl14Delta < 0 ? "var(--red)" : "var(--text-dim)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {ctl14Delta > 0 ? "+" : ""}{ctl14Delta} · 14d
                </span>
              </div>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize:   9,
                  color:      "var(--text-dim)",
                }}
              >
                {Math.round(perf.predictedCTL14.confidence * 100)}%
              </span>
            </div>
            <ArrowValue
              current={ctl}
              predicted={perf.predictedCTL14.value}
              color="var(--green)"
            />
          </div>

          {/* 5K */}
          {perf.predicted5KMin && estimated5KMin && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em" }}>5K Estimate</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)" }}>
                  {Math.round(perf.predicted5KMin.confidence * 100)}%
                </span>
              </div>
              <ArrowValue
                current={formatMinutes(estimated5KMin)}
                predicted={formatMinutes(perf.predicted5KMin.value)}
                color="var(--accent)"
              />
            </div>
          )}

          {/* 10K */}
          {perf.predicted10KMin && estimated10KMin && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em" }}>10K Estimate</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)" }}>
                  {Math.round(perf.predicted10KMin.confidence * 100)}%
                </span>
              </div>
              <ArrowValue
                current={formatMinutes(estimated10KMin)}
                predicted={formatMinutes(perf.predicted10KMin.value)}
                color="var(--accent)"
              />
            </div>
          )}

          {/* Weekly km */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                  Weekly Km
                </span>
                {kmDelta !== 0 && (
                  <span style={{ fontFamily: "var(--mono)", fontSize: 8, color: kmDelta > 0 ? "var(--green)" : "var(--red)", letterSpacing: "0.06em" }}>
                    {kmDelta > 0 ? "+" : ""}{kmDelta}
                  </span>
                )}
              </div>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)" }}>
                {Math.round(perf.predictedWeeklyKm.confidence * 100)}%
              </span>
            </div>
            <ArrowValue
              current={Math.round(weeklyRunKm * 10) / 10}
              predicted={perf.predictedWeeklyKm.value}
              color="var(--purple)"
              suffix=" km"
            />
          </div>

          {/* CTL 30d secondary */}
          <div
            style={{
              paddingTop:   10,
              borderTop:    "1px solid var(--border2)",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.04em" }}>
              CTL · 30 days
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text-dim)" }}>
                {ctl}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>→</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: "var(--green)" }}>
                {perf.predictedCTL30.value}
              </span>
            </div>
          </div>
        </div>

        {/* Right — Risk + Goals */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Risk section */}
          <div>
            <div
              style={{
                fontFamily:    "var(--mono)",
                fontSize:      8,
                letterSpacing: "0.16em",
                color:         "var(--text-dim)",
                textTransform: "uppercase",
                marginBottom:  10,
              }}
            >
              Risk Assessment
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Fatigue", risk: risk.fatigueRisk },
                { label: "Injury",  risk: risk.injuryRisk  },
              ].map(({ label, risk: r }) => (
                <div
                  key={label}
                  style={{
                    display:     "flex",
                    alignItems:  "center",
                    justifyContent: "space-between",
                    padding:     "8px 10px",
                    borderRadius: 8,
                    background:  `${riskColor(r.level)}08`,
                    border:      `1px solid ${riskColor(r.level)}22`,
                  }}
                >
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
                  <RiskPill level={r.level} />
                </div>
              ))}
            </div>
          </div>

          {/* Goal forecast */}
          <div>
            <div
              style={{
                fontFamily:    "var(--mono)",
                fontSize:      8,
                letterSpacing: "0.16em",
                color:         "var(--text-dim)",
                textTransform: "uppercase",
                marginBottom:  10,
              }}
            >
              Goal Forecast
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Running",  pct: goals.runningGoalProbability.value,  color: "var(--accent)"  },
                { label: "Strength", pct: goals.strengthGoalProbability.value, color: "var(--purple)"  },
                { label: "Growth",   pct: goals.growthGoalProbability.value,   color: "var(--green)"   },
              ].map(({ label, pct, color }) => (
                <div key={label}>
                  <div
                    style={{
                      display:        "flex",
                      justifyContent: "space-between",
                      alignItems:     "baseline",
                      marginBottom:   4,
                    }}
                  >
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color }}>
                      {Math.round(pct)}%
                    </span>
                  </div>
                  <ConfBar pct={pct} color={color} />
                </div>
              ))}
            </div>
          </div>

          {/* Growth consistency */}
          <div
            style={{
              marginTop:   4,
              paddingTop:  10,
              borderTop:   "1px solid var(--border2)",
              display:     "flex",
              alignItems:  "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)", marginBottom: 3 }}>
                GROWTH CONSISTENCY
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: "var(--yellow)" }}>
                {growth.consistencyScore.value}%
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)", marginBottom: 3 }}>
                NEXT WEEK HOURS
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: "var(--yellow)" }}>
                {growth.predictedWeeklyHours.value}h
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer — explanation ── */}
      <div
        style={{
          padding:    "10px 20px",
          borderTop:  "1px solid var(--border2)",
          display:    "flex",
          alignItems: "center",
          gap:        10,
          background: "var(--surface2)",
        }}
      >
        <div
          style={{
            width:        6,
            height:       6,
            borderRadius: "50%",
            background:   qualityColor,
            flexShrink:   0,
          }}
        />
        <span style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>
          {meta.explanation}
        </span>
      </div>
    </div>
  );
}
