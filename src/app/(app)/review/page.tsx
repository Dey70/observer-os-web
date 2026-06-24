"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback, useEffect, useMemo } from "react";
import { RotateCcw, AlertTriangle } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type ReviewSections = {
  training:  string;
  nutrition: string;
  growth:    string;
  overall:   string;
  nextWeek:  string;
};

type Grade          = "A" | "B" | "C" | "D";
type RecoveryStatus = "GOOD" | "WARNING" | "CRITICAL";
type GrowthBar      = { label: string; hours: number };

type ReviewData = {
  sections:        ReviewSections;
  generatedAt:     string;
  grade:           Grade;
  actionItems:     string[];
  growthBars:      GrowthBar[];
  recoveryStatus:  RecoveryStatus;
  achievements:    string[];
};

// ── Parsers ────────────────────────────────────────────────────────────────────

function parseReview(text: string): ReviewSections {
  const keyMap: Record<string, keyof ReviewSections> = {
    "TRAINING":                   "training",
    "NUTRITION":                  "nutrition",
    "GROWTH":                     "growth",
    "OVERALL ASSESSMENT":         "overall",
    "NEXT WEEK — ACTION ITEMS": "nextWeek",
    "NEXT WEEK - ACTION ITEMS":   "nextWeek",
    "NEXT WEEK":                  "nextWeek",
  };

  const result: ReviewSections = { training: "", nutrition: "", growth: "", overall: "", nextWeek: "" };
  let current: keyof ReviewSections | null = null;
  const buf: string[] = [];

  for (const line of text.split("\n")) {
    const m = line.match(/^\*\*(.+?)\*\*/);
    if (m) {
      if (current) result[current] = buf.splice(0).join("\n").trim();
      const key = m[1].trim().toUpperCase();
      current = keyMap[key] ?? null;
    } else if (current) {
      buf.push(line);
    }
  }
  if (current) result[current] = buf.join("\n").trim();
  return result;
}

function deriveGrade(overall: string): Grade {
  const t = overall.toLowerCase();
  if (["critical", "significantly lacking", "failed to", "very poor", "no data"].some((w) => t.includes(w))) return "D";
  const cHits = ["insufficient", "below target", "limited", "low growth", "not tracked", "concerning"].filter((w) => t.includes(w)).length;
  if (cHits >= 2) return "C";
  if (cHits >= 1) return "B";
  if (["excellent", "outstanding", "exceptional", "strong across all", "all pillars"].some((w) => t.includes(w))) return "A";
  return "B";
}

function parseActionItems(nextWeekText: string): string[] {
  return nextWeekText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+[.)]\s/.test(l))
    .map((l) => l.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function parseGrowthBars(growthText: string): GrowthBar[] {
  const seen = new Map<string, number>();
  const LABEL: Record<string, string> = {
    study: "STUDY", project: "PROJECT", learning: "LEARNING",
    deepwork: "DEEP WORK", reading: "READING", coding: "CODING", writing: "WRITING",
  };
  const re = /\b(study|project|learning|deep[\s-]?work|reading|coding|writing)[^0-9]{0,12}?([0-9]+(?:\.[0-9]+)?)\s*h(?:our)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(growthText)) !== null) {
    const key   = m[1].toLowerCase().replace(/[\s-]/g, "");
    const hours = parseFloat(m[2]);
    if (!isNaN(hours) && hours > 0) {
      seen.set(key, Math.max(seen.get(key) ?? 0, hours));
    }
  }
  return [...seen.entries()]
    .map(([key, hours]) => ({ label: LABEL[key] ?? key.toUpperCase(), hours }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);
}

function deriveRecoveryStatus(trainingText: string): RecoveryStatus {
  const t = trainingText.toLowerCase();
  if (["poor recovery", "low readiness", "high fatigue", "critical", "overreaching", "under-recovered"].some((w) => t.includes(w))) return "CRITICAL";
  if (["moderate fatigue", "suboptimal", "below average", "concerning", "limited sleep", "low energy"].some((w) => t.includes(w))) return "WARNING";
  return "GOOD";
}

function extractRecoverySentences(trainingText: string): string {
  const KEYS = ["sleep", "readiness", "fatigue", "recovery", "rest", "energy", "mood", "soreness"];
  const parts = trainingText.split(". ").filter((s) => KEYS.some((k) => s.toLowerCase().includes(k)));
  return parts.map((s) => s.trim().replace(/\.$/, "")).join(". ").trim();
}

function parseAchievements(sections: ReviewSections): string[] {
  const SIGNALS = ["strong", "achieved", "exceeded", "completed", "hit ", "improved", "consistent", "excellent", "outstanding", "personal best"];
  const wins: string[] = [];
  for (const text of [sections.training, sections.growth, sections.overall]) {
    for (const raw of text.split(". ")) {
      const s = raw.trim().replace(/\.$/, "");
      if (s.length < 25 || s.length > 155) continue;
      if (SIGNALS.some((w) => s.toLowerCase().includes(w))) wins.push(s);
    }
  }
  return [...new Set(wins)].slice(0, 5);
}

// ── Grade metadata ─────────────────────────────────────────────────────────────

const GRADE_META: Record<Grade, { color: string; label: string; context: string }> = {
  A: { color: "var(--green)",  label: "ELITE",      context: "All three pillars performing at peak capacity."   },
  B: { color: "var(--accent)", label: "SOLID",       context: "Strong week with focused room to optimise."       },
  C: { color: "var(--yellow)", label: "DEVELOPING",  context: "Mixed performance — one or more pillars lagging." },
  D: { color: "#ef4444",       label: "NEEDS WORK",  context: "Multiple pillars are below acceptable baseline."  },
};

const RECOVERY_META: Record<RecoveryStatus, { color: string; bg: string; border: string }> = {
  GOOD:     { color: "var(--green)",  bg: "rgba(0,230,118,0.08)",   border: "rgba(0,230,118,0.25)"   },
  WARNING:  { color: "var(--yellow)", bg: "rgba(255,184,0,0.08)",   border: "rgba(255,184,0,0.25)"   },
  CRITICAL: { color: "#ef4444",       bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)"   },
};

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skel({ h, mb = 10, r = 14 }: { h: number; mb?: number; r?: number }) {
  return (
    <div style={{
      height: h, borderRadius: r,
      background: "var(--surface2)",
      border: "1px solid var(--border2)",
      marginBottom: mb,
      animation: "rvPulse 1.8s ease-in-out infinite",
    }} />
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ maxWidth: 820 }}>
      <style>{`@keyframes rvPulse{0%,100%{opacity:.3}50%{opacity:.65}}`}</style>
      <Skel h={62} mb={26} />
      <Skel h={118} mb={10} />
      <Skel h={96} mb={10} />
      <Skel h={80} mb={10} />
      <Skel h={88} mb={10} />
      <Skel h={140} mb={10} />
      <Skel h={72} mb={10} />
      <Skel h={168} mb={0} />
    </div>
  );
}

// ── Section card ───────────────────────────────────────────────────────────────

function SectionCard({
  animClass = "",
  num,
  tag,
  subtitle,
  accentColor,
  badge,
  children,
}: {
  animClass?:   string;
  num:          string;
  tag:          string;
  subtitle?:    string;
  accentColor:  string;
  badge?:       React.ReactNode;
  children:     React.ReactNode;
}) {
  return (
    <div
      className={`rv-card ${animClass}`}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border2)",
        borderRadius: 14,
        overflow: "hidden",
        marginBottom: 10,
      }}
    >
      {/* Header bar */}
      <div style={{
        padding: "10px 20px",
        background: "var(--surface2)",
        borderBottom: "1px solid var(--border2)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700,
            color: "var(--text-dim)", letterSpacing: "0.14em",
          }}>
            {num}
          </span>
          <div style={{ width: 1, height: 12, background: "var(--border2)", flexShrink: 0 }} />
          <div style={{ width: 3, height: 14, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
          <div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.18em", color: accentColor,
            }}>
              {tag}
            </div>
            {subtitle && (
              <div style={{
                fontFamily: "var(--mono)", fontSize: 8,
                color: "var(--text-dim)", letterSpacing: "0.1em", marginTop: 1,
              }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {badge}
      </div>
      {/* Body */}
      <div style={{ padding: "18px 20px" }}>
        {children}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const [data,    setData]    = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const weekRange = useMemo(() => {
    const end   = new Date();
    const start = new Date(end.getTime() - 7 * 86400000);
    const fmt   = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return `${fmt(start)} – ${fmt(end)}`;
  }, []);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/review", { method: "POST" });
      const json = await res.json() as { review?: string; generated_at?: string; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);

      const sections       = parseReview(json.review ?? "");
      const grade          = deriveGrade(sections.overall);
      const actionItems    = parseActionItems(sections.nextWeek);
      const growthBars     = parseGrowthBars(sections.growth);
      const recoveryStatus = deriveRecoveryStatus(sections.training);
      const achievements   = parseAchievements(sections);

      setData({
        sections,
        generatedAt: json.generated_at ?? new Date().toISOString(),
        grade, actionItems, growthBars, recoveryStatus, achievements,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to generate weekly review.");
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { generate(); }, [generate]);

  if (loading) return <LoadingSkeleton />;

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={{ maxWidth: 820 }}>
        <div style={{
          background: "var(--surface)", border: "1px solid rgba(239,68,68,0.22)",
          borderRadius: 14, padding: "52px 32px",
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 18, textAlign: "center",
        }}>
          <AlertTriangle size={28} color="#ef4444" strokeWidth={1.5} />
          <div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
              color: "#ef4444", letterSpacing: "0.1em", marginBottom: 10,
            }}>
              UNABLE TO GENERATE WEEKLY REVIEW
            </div>
            <div style={{
              fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, maxWidth: 400,
            }}>
              {error}
            </div>
          </div>
          <button
            onClick={generate}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 22px",
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 8, cursor: "pointer", fontFamily: "var(--mono)",
              fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
              color: "var(--text-muted)", transition: "all 0.15s",
            }}
          >
            <RotateCcw size={12} strokeWidth={2.5} />
            RETRY
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { sections, grade, actionItems, generatedAt, growthBars, recoveryStatus, achievements } = data;
  const { color: gColor, label: gLabel, context: gContext } = GRADE_META[grade];
  const recMeta = RECOVERY_META[recoveryStatus];

  const genTime = new Date(generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const genDate = new Date(generatedAt).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).toUpperCase();

  const prose: React.CSSProperties = {
    fontSize: 13, color: "var(--text-muted)", lineHeight: 1.78, margin: 0,
  };

  const maxBarHours = Math.max(...growthBars.map((b) => b.hours), 0.1);
  const recoverySummary = extractRecoverySentences(sections.training);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 820 }}>
      <style>{`
        @keyframes rvFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes rvBarSlide{from{width:0}to{width:var(--w)}}
        .rv-a1{animation:rvFadeUp .35s ease both}
        .rv-a2{animation:rvFadeUp .35s .06s ease both}
        .rv-a3{animation:rvFadeUp .35s .12s ease both}
        .rv-a4{animation:rvFadeUp .35s .18s ease both}
        .rv-a5{animation:rvFadeUp .35s .24s ease both}
        .rv-a6{animation:rvFadeUp .35s .30s ease both}
        .rv-a7{animation:rvFadeUp .35s .36s ease both}
        .rv-a8{animation:rvFadeUp .35s .42s ease both}
        .rv-a9{animation:rvFadeUp .35s .48s ease both}
        .rv-card{transition:box-shadow .18s ease,transform .18s ease}
        .rv-card:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(0,0,0,.22)}
        .rv-regenbtn:hover{background:var(--surface2)!important;border-color:var(--border)!important;color:var(--text)!important}
      `}</style>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div
        className="rv-a1"
        style={{
          display: "flex", alignItems: "flex-end", justifyContent: "space-between",
          marginBottom: 24, flexWrap: "wrap", gap: 12,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
            <span style={{
              fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700,
              letterSpacing: "-0.01em", color: "var(--text)",
            }}>
              WEEKLY INTELLIGENCE REPORT
            </span>
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 9px", borderRadius: 99,
              background: `${gColor}14`, border: `1px solid ${gColor}30`,
              flexShrink: 0,
            }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: gColor }} />
              <span style={{
                fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700,
                color: gColor, letterSpacing: "0.14em",
              }}>
                {gLabel}
              </span>
            </div>
          </div>
          <div style={{
            fontSize: 11, color: "var(--text-dim)",
            display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
          }}>
            <span style={{ fontFamily: "var(--mono)", letterSpacing: "0.04em" }}>{weekRange}</span>
            <span style={{ color: "var(--border)" }}>·</span>
            <span>Generated {genTime}</span>
            <span style={{ color: "var(--border)" }}>·</span>
            <span>Observer Coach</span>
          </div>
        </div>

        <button
          className="rv-regenbtn"
          onClick={generate}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 7, padding: "8px 16px",
            background: "var(--surface)", border: "1px solid var(--border2)",
            borderRadius: 8, cursor: "pointer", fontFamily: "var(--mono)",
            fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            color: "var(--text-muted)", transition: "all 0.15s",
          }}
        >
          <RotateCcw size={11} strokeWidth={2.5} />
          REGENERATE
        </button>
      </div>

      {/* ── Executive summary ────────────────────────────────────────────────── */}
      <div
        className="rv-card rv-a2"
        style={{
          background: "var(--surface)",
          border: `1px solid ${gColor}28`,
          borderRadius: 14,
          marginBottom: 10,
          display: "grid",
          gridTemplateColumns: "112px 1fr",
          overflow: "hidden",
        }}
      >
        {/* Grade column */}
        <div style={{
          background: `${gColor}0a`,
          borderRight: `1px solid ${gColor}1c`,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "28px 16px", gap: 5,
        }}>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 60, fontWeight: 700,
            color: gColor, lineHeight: 1, letterSpacing: "-0.04em",
          }}>
            {grade}
          </div>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700,
            color: gColor, letterSpacing: "0.2em",
          }}>
            {gLabel}
          </div>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 7.5,
            color: "var(--text-dim)", letterSpacing: "0.06em",
            textAlign: "center", marginTop: 4, lineHeight: 1.55,
          }}>
            {gContext}
          </div>
        </div>

        {/* Assessment column */}
        <div style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700,
              letterSpacing: "0.18em", color: "var(--text-dim)", marginBottom: 11,
            }}>
              EXECUTIVE SUMMARY
            </div>
            <p style={{
              fontSize: 14, color: "var(--text)", lineHeight: 1.72, margin: 0,
            }}>
              {sections.overall || "Assessment not available."}
            </p>
          </div>

          {/* Grade scale */}
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {(["D", "C", "B", "A"] as Grade[]).map((g) => (
              <div
                key={g}
                title={`Grade ${g} — ${GRADE_META[g].label}`}
                style={{
                  height: 3, flex: 1, borderRadius: 99,
                  background: g === grade ? GRADE_META[g].color : "var(--border2)",
                }}
              />
            ))}
            <span style={{
              fontFamily: "var(--mono)", fontSize: 7.5, color: "var(--text-dim)",
              letterSpacing: "0.1em", marginLeft: 10, whiteSpace: "nowrap",
            }}>
              D → A
            </span>
          </div>
        </div>
      </div>

      {/* ── 01 Training ─────────────────────────────────────────────────────── */}
      <SectionCard
        animClass="rv-a3"
        num="01"
        tag="TRAINING REVIEW"
        subtitle="SESSIONS · LOAD · DISTRIBUTION"
        accentColor="var(--green)"
      >
        <p style={prose}>{sections.training || "No training data was logged this period."}</p>
      </SectionCard>

      {/* ── 02 Recovery ─────────────────────────────────────────────────────── */}
      <SectionCard
        animClass="rv-a4"
        num="02"
        tag="RECOVERY REVIEW"
        subtitle="SLEEP · READINESS · FATIGUE"
        accentColor={recMeta.color}
        badge={
          <div style={{
            padding: "4px 10px", borderRadius: 99,
            background: recMeta.bg, border: `1px solid ${recMeta.border}`,
            fontFamily: "var(--mono)", fontSize: 8, fontWeight: 700,
            color: recMeta.color, letterSpacing: "0.16em",
            flexShrink: 0,
          }}>
            {recoveryStatus}
          </div>
        }
      >
        <p style={prose}>
          {recoverySummary || "Recovery data is included in the Training review above."}
        </p>
      </SectionCard>

      {/* ── 03 Nutrition ────────────────────────────────────────────────────── */}
      <SectionCard
        animClass="rv-a5"
        num="03"
        tag="NUTRITION REVIEW"
        subtitle="CALORIES · PROTEIN · ADHERENCE"
        accentColor="var(--yellow)"
      >
        <p style={prose}>{sections.nutrition || "Nutrition was not tracked this period."}</p>
      </SectionCard>

      {/* ── 04 Growth ───────────────────────────────────────────────────────── */}
      <SectionCard
        animClass="rv-a6"
        num="04"
        tag="GROWTH REVIEW"
        subtitle="STUDY · PROJECT · LEARNING · DEEP WORK"
        accentColor="var(--accent)"
      >
        <p style={{ ...prose, marginBottom: growthBars.length > 0 ? 20 : 0 }}>
          {sections.growth || "No growth sessions were logged this period."}
        </p>

        {growthBars.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {growthBars.map((bar, i) => {
              const pct     = (bar.hours / maxBarHours) * 100;
              const isTop   = i === 0;
              const barColor = isTop ? "var(--accent)" : "var(--text-dim)";
              return (
                <div key={bar.label}>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 5,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{
                        fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
                        letterSpacing: "0.12em",
                        color: isTop ? "var(--accent)" : "var(--text-muted)",
                      }}>
                        {bar.label}
                      </span>
                      {isTop && (
                        <span style={{
                          fontFamily: "var(--mono)", fontSize: 7, fontWeight: 700,
                          letterSpacing: "0.1em", color: "var(--accent)",
                          padding: "1px 5px", borderRadius: 3,
                          background: "rgba(232,255,71,0.12)",
                          border: "1px solid rgba(232,255,71,0.28)",
                        }}>
                          TOP
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontFamily: "var(--mono)", fontSize: 9,
                      color: "var(--text-dim)", letterSpacing: "0.06em",
                    }}>
                      {bar.hours}h
                    </span>
                  </div>
                  <div style={{
                    height: 4, borderRadius: 99,
                    background: "var(--border2)", overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%", borderRadius: 99, background: barColor,
                      width: `${pct}%`,
                      transition: "width 0.65s cubic-bezier(0.34,1.56,0.64,1)",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ── 05 Achievements ─────────────────────────────────────────────────── */}
      <SectionCard
        animClass="rv-a7"
        num="05"
        tag="THIS WEEK'S WINS"
        subtitle="HIGHLIGHTS FROM THE REPORT"
        accentColor="var(--purple)"
      >
        {achievements.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {achievements.map((win, i) => (
              <div
                key={i}
                style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  padding: "9px 0",
                  borderBottom: i < achievements.length - 1 ? "1px solid var(--border2)" : "none",
                }}
              >
                <div style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: "var(--purple)", flexShrink: 0, marginTop: 6,
                }} />
                <span style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.65 }}>
                  {win}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={prose}>No standout wins were detected in this report.</p>
        )}
      </SectionCard>

      {/* ── 06 Next week ────────────────────────────────────────────────────── */}
      <SectionCard
        animClass="rv-a8"
        num="06"
        tag="NEXT WEEK — PRIORITIES"
        subtitle="DATA-DRIVEN ACTION ITEMS"
        accentColor="var(--purple)"
      >
        {actionItems.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {actionItems.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex", gap: 16, alignItems: "flex-start",
                  padding: "11px 0",
                  borderBottom: i < actionItems.length - 1 ? "1px solid var(--border2)" : "none",
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: "rgba(167,139,250,0.09)",
                  border: "1px solid rgba(167,139,250,0.24)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{
                    fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700,
                    color: "var(--purple)",
                  }}>
                    {i + 1}
                  </span>
                </div>
                <span style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.65, paddingTop: 2 }}>
                  {item}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={prose}>{sections.nextWeek || "No action items available."}</p>
        )}
      </SectionCard>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div className="rv-a9" style={{ textAlign: "center", paddingTop: 4, paddingBottom: 28 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 16px", borderRadius: 99,
          border: "1px solid var(--border2)", background: "var(--surface)",
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)" }} />
          <span style={{
            fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)",
            letterSpacing: "0.1em",
          }}>
            OBSERVER OS · {genDate}
          </span>
        </div>
      </div>
    </div>
  );
}
