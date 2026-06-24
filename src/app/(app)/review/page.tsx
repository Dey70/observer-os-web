"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback, useEffect, useMemo } from "react";
import { RotateCcw, AlertTriangle } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type ReviewSections = {
  training:  string;
  nutrition: string;
  growth:    string;
  overall:   string;
  nextWeek:  string;
};

type Grade = "A" | "B" | "C" | "D";

type ReviewData = {
  sections:    ReviewSections;
  generatedAt: string;
  grade:       Grade;
  actionItems: string[];
};

// ── Parsers ────────────────────────────────────────────────────────────────

function parseReview(text: string): ReviewSections {
  const keyMap: Record<string, keyof ReviewSections> = {
    "TRAINING":                    "training",
    "NUTRITION":                   "nutrition",
    "GROWTH":                      "growth",
    "OVERALL ASSESSMENT":          "overall",
    "NEXT WEEK — ACTION ITEMS": "nextWeek",
    "NEXT WEEK - ACTION ITEMS":    "nextWeek",
    "NEXT WEEK":                   "nextWeek",
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
  const dWords = ["critical", "significantly lacking", "failed to", "very poor", "no data"];
  const cWords = ["insufficient", "below target", "limited", "low growth", "not tracked", "concerning"];
  const aWords = ["excellent", "outstanding", "exceptional", "strong across all", "all pillars"];
  if (dWords.some((w) => t.includes(w))) return "D";
  const cHits = cWords.filter((w) => t.includes(w)).length;
  if (cHits >= 2) return "C";
  if (cHits >= 1) return "B";
  if (aWords.some((w) => t.includes(w))) return "A";
  return "B";
}

function parseActionItems(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+[.)]\s/.test(l))
    .map((l) => l.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

// ── Grade metadata ─────────────────────────────────────────────────────────

const GRADE_META: Record<Grade, { color: string; label: string }> = {
  A: { color: "var(--green)",  label: "ELITE"        },
  B: { color: "var(--accent)", label: "SOLID"        },
  C: { color: "var(--yellow)", label: "DEVELOPING"   },
  D: { color: "#ef4444",       label: "NEEDS WORK"   },
};

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skel({ h, mb = 10 }: { h: number; mb?: number }) {
  return (
    <div style={{
      height: h, borderRadius: 14, background: "var(--surface)",
      border: "1px solid var(--border)", marginBottom: mb,
      animation: "pulse 1.8s ease-in-out infinite",
    }} />
  );
}

// ── Pillar card ────────────────────────────────────────────────────────────

function PillarCard({
  tag, subtitle, color, children,
}: {
  tag: string; subtitle?: string; color: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border2)",
      borderRadius: 14, overflow: "hidden", height: "100%",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        padding: "11px 18px", borderBottom: "1px solid var(--border2)",
        background: "var(--surface2)",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: color, flexShrink: 0 }} />
        <div>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.18em", color,
          }}>
            {tag}
          </div>
          {subtitle && (
            <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--text-dim)", letterSpacing: "0.1em", marginTop: 1 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: "14px 18px", flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const [data,    setData]    = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const weekRange = useMemo(() => {
    const end   = new Date();
    const start = new Date(end.getTime() - 7 * 86400000);
    const fmt   = (d: Date) =>
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return `${fmt(start)} – ${fmt(end)}`;
  }, []);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/review", { method: "POST" });
      const json = await res.json() as { review?: string; generated_at?: string; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);

      const sections    = parseReview(json.review ?? "");
      const grade       = deriveGrade(sections.overall);
      const actionItems = parseActionItems(sections.nextWeek);

      setData({ sections, generatedAt: json.generated_at ?? new Date().toISOString(), grade, actionItems });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to generate weekly review.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    generate();
  }, [generate]);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ maxWidth: 860 }}>
        <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }`}</style>
        <Skel h={54} mb={24} />
        <Skel h={148} mb={12} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Skel h={180} mb={0} />
          <Skel h={180} mb={0} />
          <Skel h={180} mb={0} />
        </div>
        <Skel h={160} mb={0} />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={{ maxWidth: 860 }}>
        <div style={{
          background: "var(--surface)", border: "1px solid #ef444433",
          borderRadius: 14, padding: "40px 32px",
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 16, textAlign: "center",
        }}>
          <AlertTriangle size={28} color="#ef4444" strokeWidth={1.5} />
          <div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700,
              color: "#ef4444", letterSpacing: "0.08em", marginBottom: 8,
            }}>
              UNABLE TO GENERATE WEEKLY REVIEW
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.65, maxWidth: 380 }}>
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

  const { sections, grade, actionItems, generatedAt } = data;
  const { color: gColor, label: gLabel } = GRADE_META[grade];

  const genTime = new Date(generatedAt).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit",
  });
  const genDate = new Date(generatedAt).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).toUpperCase();

  const textStyle: React.CSSProperties = {
    fontSize: 13, color: "var(--text-muted)", lineHeight: 1.75, margin: 0,
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 860 }}>
      <style>{`
        .rv-card { border-radius: 14px; transition: box-shadow 0.2s ease, transform 0.2s ease; }
        .rv-card:hover { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(0,0,0,0.22); }
        .rv-3col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        @media (max-width: 860px) { .rv-3col { grid-template-columns: 1fr 1fr !important; } }
        @media (max-width: 560px) { .rv-3col { grid-template-columns: 1fr !important; } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .a1 { animation: fadeUp 0.35s ease both; }
        .a2 { animation: fadeUp 0.35s 0.07s ease both; }
        .a3 { animation: fadeUp 0.35s 0.14s ease both; }
        .a4 { animation: fadeUp 0.35s 0.21s ease both; }
        .a5 { animation: fadeUp 0.35s 0.28s ease both; }
      `}</style>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="a1" style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        marginBottom: 24, flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700,
            letterSpacing: "-0.01em", color: "var(--text)",
          }}>
            WEEKLY INTELLIGENCE REPORT
          </div>
          <div style={{
            fontSize: 11, color: "var(--text-dim)", marginTop: 5,
            display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
          }}>
            <span>{weekRange}</span>
            <span style={{ color: "var(--border2)" }}>·</span>
            <span>Generated {genTime}</span>
            <span style={{ color: "var(--border2)" }}>·</span>
            <span>Observer Coach</span>
          </div>
        </div>

        <button
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
          <RotateCcw size={12} strokeWidth={2.5} />
          REGENERATE
        </button>
      </div>

      {/* ── Hero: Grade + Overall Assessment ─────────────────────────────── */}
      <div
        className="rv-card a2"
        style={{
          background: "var(--surface)",
          border: `1px solid ${gColor}33`,
          borderRadius: 14,
          marginBottom: 12,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          overflow: "hidden",
        }}
      >
        {/* Grade column */}
        <div style={{
          width: 120,
          background: `${gColor}10`,
          borderRight: `1px solid ${gColor}22`,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "28px 20px", gap: 6,
        }}>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 64, fontWeight: 700,
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
        </div>

        {/* Assessment column */}
        <div style={{ padding: "24px 28px" }}>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.18em", color: "var(--text-dim)", marginBottom: 12,
          }}>
            OVERALL ASSESSMENT
          </div>
          <p style={{
            fontSize: 14, color: "var(--text)", lineHeight: 1.7,
            margin: 0, fontWeight: 400,
          }}>
            {sections.overall || "Assessment not available."}
          </p>
        </div>
      </div>

      {/* ── 3-column pillar cards ─────────────────────────────────────────── */}
      <div className="rv-3col">
        <div className="rv-card">
          <PillarCard tag="TRAINING" subtitle="INCL. RECOVERY" color="var(--green)">
            <p style={textStyle}>
              {sections.training || "No training data logged this period."}
            </p>
          </PillarCard>
        </div>

        <div className="rv-card">
          <PillarCard tag="NUTRITION" color="var(--yellow)">
            <p style={textStyle}>
              {sections.nutrition || "Nutrition was not tracked this period."}
            </p>
          </PillarCard>
        </div>

        <div className="rv-card">
          <PillarCard tag="GROWTH" color="var(--accent)">
            <p style={textStyle}>
              {sections.growth || "No growth sessions were logged this period."}
            </p>
          </PillarCard>
        </div>
      </div>

      {/* ── Next Week Priorities ──────────────────────────────────────────── */}
      <div
        className="rv-card a4"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border2)",
          borderRadius: 14,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <div style={{
          padding: "11px 20px", borderBottom: "1px solid var(--border2)",
          background: "var(--surface2)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: "var(--purple)", flexShrink: 0 }} />
          <div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.18em", color: "var(--purple)",
            }}>
              NEXT WEEK — PRIORITIES
            </div>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 8, color: "var(--text-dim)",
              letterSpacing: "0.1em", marginTop: 1,
            }}>
              ONE DATA-DRIVEN ACTION PER PILLAR
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 20px" }}>
          {actionItems.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {actionItems.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", gap: 16, alignItems: "flex-start",
                    padding: "10px 0",
                    borderBottom: i < actionItems.length - 1 ? "1px solid var(--border2)" : "none",
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    background: "var(--purple)18", border: "1px solid var(--purple)33",
                    display: "flex", alignItems: "center", justifyContent: "center",
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
            <p style={textStyle}>{sections.nextWeek || "No action items available."}</p>
          )}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="a5" style={{ textAlign: "center", paddingBottom: 24 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 99,
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
