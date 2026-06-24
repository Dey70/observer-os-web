"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { detectPRs, type PR } from "@/lib/prDetection";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  PersonStanding,
  Dumbbell,
  Brain,
  CheckCircle,
  RotateCcw,
  Clock,
  Zap,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { GrowthLog } from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = "run" | "lift" | "growth";
type Effort = "easy" | "medium" | "hard" | "very_hard";
type GrowthCategory = GrowthLog["category"];

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "run",    label: "RUN",    icon: PersonStanding },
  { key: "lift",   label: "LIFT",   icon: Dumbbell       },
  { key: "growth", label: "GROWTH", icon: Brain          },
];

const effortOptions: { key: Effort; label: string }[] = [
  { key: "easy",      label: "Easy"      },
  { key: "medium",    label: "Medium"    },
  { key: "hard",      label: "Hard"      },
  { key: "very_hard", label: "Very Hard" },
];

const effortToRpe: Record<Effort, number> = {
  easy: 3, medium: 5, hard: 7, very_hard: 9,
};

const growthCategories: { key: GrowthCategory; label: string; desc: string }[] = [
  { key: "study",     label: "Study",     desc: "Academic, revision, exams"    },
  { key: "project",   label: "Project",   desc: "Building, coding, creating"   },
  { key: "learning",  label: "Learning",  desc: "Books, courses, videos"       },
  { key: "deep_work", label: "Deep Work", desc: "Distraction-free focus block" },
];

const GROWTH_TITLE_PLACEHOLDERS: Record<GrowthCategory, string> = {
  study:     "e.g. Data Science Revision",
  project:   "e.g. Observer OS Development",
  learning:  "e.g. Coursera ML Course",
  deep_work: "e.g. Deep Work Session",
};

const TYPE_COLOR: Record<Tab, { main: string; dim: string }> = {
  run:    { main: "var(--green)",  dim: "var(--green-dim)"  },
  lift:   { main: "var(--purple)", dim: "var(--purple-dim)" },
  growth: { main: "var(--accent)", dim: "var(--accent-dim)" },
};

const TYPE_LABEL: Record<Tab, string> = {
  run: "Run", lift: "Lift", growth: "Growth",
};

const terrainOptions = ["Road", "Trail", "Track", "Treadmill", "Mixed"];
const liftTypes = ["Push", "Pull", "Legs", "Full Body", "Upper", "Lower", "Core"];

// ── Helpers ────────────────────────────────────────────────────────────────

function focusLabel(score: number): string {
  if (score <= 3) return "Distracted";
  if (score <= 6) return "Average";
  if (score <= 8) return "Focused";
  return "Deep Focus";
}

function focusColor(score: number): string {
  if (score <= 3) return "#ef4444";
  if (score <= 6) return "var(--yellow)";
  if (score <= 8) return "var(--green)";
  return "var(--accent)";
}

function sanitizeNumericInput(raw: string, max: number): string {
  if (raw === "") return "";
  const stripped = raw.replace(/^0+(?=\d)/, "");
  const num = parseInt(stripped, 10);
  if (isNaN(num)) return "";
  if (num > max) return String(max);
  return stripped;
}

function fmtDur(v: number): string {
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ── Discriminated session union ────────────────────────────────────────────

type LoggedTrainingSession = {
  kind:     "training";
  type:     "run" | "lift";
  duration: number;
  effort:   Effort;
  rpe:      number;
  notes:    string;
  date:     string;
  load:     number;
};

type LoggedGrowthSession = {
  kind:       "growth";
  category:   GrowthCategory;
  title:      string;
  duration:   number;
  focusScore: number;
  notes:      string;
  date:       string;
  tags:       string[];
};

type LoggedSession = LoggedTrainingSession | LoggedGrowthSession;

// ── Component ──────────────────────────────────────────────────────────────

export default function LogPage() {
  const router   = useRouter();
  const supabase = createClient();

  // Shared state
  const [tab,     setTab]     = useState<Tab>("run");
  const [date,    setDate]    = useState(() => new Date().toISOString().split("T")[0]);
  const [hours,   setHours]   = useState("0");
  const [minutes, setMinutes] = useState("30");
  const [notes,   setNotes]   = useState("");
  const [loading, setLoading] = useState(false);

  // Run-specific
  const [distance, setDistance] = useState(5.0);
  const [terrain,  setTerrain]  = useState("Road");

  // Lift-specific
  const [effort,   setEffort]   = useState<Effort>("medium");
  const [liftType, setLiftType] = useState("Push");

  // Growth-specific
  const [growthTitle,    setGrowthTitle]    = useState("");
  const [growthCategory, setGrowthCategory] = useState<GrowthCategory>("study");
  const [focusScore,     setFocusScore]     = useState(7);
  const [growthTags,     setGrowthTags]     = useState("");
  const [titleError,     setTitleError]     = useState(false);

  // Post-submit state
  const [loggedSession, setLoggedSession] = useState<LoggedSession | null>(null);
  const [nudge,         setNudge]         = useState<string | null>(null);
  const [nudgeLoading,  setNudgeLoading]  = useState(false);
  const [newPRs,        setNewPRs]        = useState<PR[]>([]);

  function resetForm() {
    setLoggedSession(null);
    setNudge(null);
    setNewPRs([]);
    setNotes("");
    setHours("0");
    setMinutes("30");
    setEffort("medium");
    setDistance(5.0);
    setTerrain("Road");
    setLiftType("Push");
    setGrowthTitle("");
    setGrowthCategory("study");
    setFocusScore(7);
    setGrowthTags("");
    setTitleError(false);
    setDate(new Date().toISOString().split("T")[0]);
  }

  // ── Submit handlers ──────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (tab === "growth") {
      await handleGrowthSubmit();
    } else {
      await handleTrainingSubmit();
    }
  };

  const handleGrowthSubmit = async () => {
    if (!growthTitle.trim()) {
      setTitleError(true);
      return;
    }
    const durationMinutes = (parseInt(hours, 10) || 0) * 60 + (parseInt(minutes, 10) || 0);
    if (durationMinutes <= 0) return;

    setTitleError(false);
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const tags = growthTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any)
        .from("growth_logs")
        .insert({
          user_id:      user.id,
          date,
          category:     growthCategory,
          title:        growthTitle.trim(),
          duration_min: durationMinutes,
          focus_score:  focusScore,
          output_notes: notes.trim() || null,
          tags:         tags.length > 0 ? tags : null,
        });

      if (insertError) {
        console.error("growth_insert_error", insertError);
        alert(`Failed to log growth session: ${insertError.message}`);
        return;
      }

      setLoggedSession({
        kind:       "growth",
        category:   growthCategory,
        title:      growthTitle.trim(),
        duration:   durationMinutes,
        focusScore,
        notes,
        date,
        tags,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrainingSubmit = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const durationMinutes = (parseInt(hours, 10) || 0) * 60 + (parseInt(minutes, 10) || 0);
      const rpe  = effortToRpe[effort];
      const load = durationMinutes * rpe;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any)
        .from("sessions")
        .insert({
          user_id:  user.id,
          type:     tab,
          date,
          duration: durationMinutes,
          rpe,
          notes:    notes.trim() || null,
        });

      if (insertError) {
        console.error("session_insert_error", insertError);
        alert(`Failed to log session: ${insertError.message}`);
        setLoading(false);
        return;
      }

      const { data: { user: u2 } } = await supabase.auth.getUser();
      if (u2) {
        detectPRs(supabase, u2.id, { type: tab as "run" | "lift", duration: durationMinutes, rpe, date, notes })
          .then(setNewPRs)
          .catch(() => {});
      }

      setLoggedSession({
        kind: "training", type: tab as "run" | "lift",
        duration: durationMinutes, effort, rpe, notes, date, load,
      });
      setLoading(false);

      setNudgeLoading(true);
      try {
        const res = await fetch("/api/nudge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkin: {
              session_type: tab, duration: durationMinutes, rpe, effort, notes,
              sleep_quality: 7, soreness: 3, fatigue: 3, mood: 7, energy: 7,
            },
          }),
        });
        const data = await res.json();
        setNudge(data.nudge ?? null);
      } catch { /* non-critical */ }
      setNudgeLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  // ── Styles ───────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    backgroundColor: "var(--surface2)",
    border: "1px solid var(--border2)",
    borderRadius: "10px",
    color: "var(--text)",
    fontFamily: "var(--mono)",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    minWidth: 0,
    transition: "border-color 0.2s ease",
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--mono)",
    fontSize: "11px",
    letterSpacing: "0.1em",
    color: "var(--text-muted)",
    marginBottom: "8px",
    display: "block",
  };

  // ── Success screen: Growth ───────────────────────────────────────────────

  if (loggedSession?.kind === "growth") {
    const s = loggedSession;
    const catLabel = growthCategories.find((c) => c.key === s.category)?.label ?? s.category;
    const qualityLabel = focusLabel(s.focusScore);
    const qualityColor = focusColor(s.focusScore);

    return (
      <div style={{ maxWidth: 520, animation: "pageEnter 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both" }}>
        <div style={{ textAlign: "center", marginBottom: 32, paddingTop: 16 }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "var(--accent-dim)", border: "2px solid var(--accent)40",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 0 40px var(--accent-dim)",
            animation: "scoreIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
          }}>
            <Brain size={36} color="var(--accent)" strokeWidth={1.75} />
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.05em", marginBottom: 6 }}>
            GROWTH LOGGED
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>{s.date}</div>
        </div>

        <div style={{
          background: "var(--surface)", border: "1px solid var(--border2)",
          borderRadius: 20, padding: 24, marginBottom: 16,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: "var(--accent)", borderRadius: "20px 20px 0 0",
          }} />

          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20 }}>
            <span style={{
              padding: "4px 12px", borderRadius: 99,
              background: "var(--accent-dim)", border: "1px solid var(--accent)30",
              fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
              color: "var(--accent)", letterSpacing: "0.1em", textTransform: "uppercase",
              flexShrink: 0,
            }}>
              {catLabel}
            </span>
            <span style={{
              fontSize: 14, color: "var(--text)", fontFamily: "var(--sans)",
              fontWeight: 500, lineHeight: 1.4,
            }}>
              {s.title}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: s.tags.length > 0 ? 20 : 0 }}>
            {[
              { icon: Clock,    label: "Duration", value: fmtDur(s.duration),           color: "var(--text)"     },
              { icon: Zap,      label: "Focus",    value: `${s.focusScore}/10`,          color: qualityColor      },
              { icon: CheckCircle, label: "Quality", value: qualityLabel,               color: qualityColor      },
            ].map(({ icon: StatIcon, label, value, color: c }) => (
              <div key={label} style={{
                background: "var(--surface2)", border: "1px solid var(--border2)",
                borderRadius: 12, padding: "14px 12px", textAlign: "center",
              }}>
                <StatIcon size={14} color="var(--text-dim)" strokeWidth={1.75} style={{ marginBottom: 6 }} />
                <div style={{
                  fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700,
                  color: c, lineHeight: 1, marginBottom: 4,
                }}>
                  {value}
                </div>
                <div style={{
                  fontSize: 9, color: "var(--text-muted)", letterSpacing: "1.5px",
                  textTransform: "uppercase", fontFamily: "var(--mono)",
                }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {s.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {s.tags.map((tag) => (
                <span key={tag} style={{
                  padding: "3px 10px", borderRadius: 99,
                  background: "var(--surface2)", border: "1px solid var(--border2)",
                  fontFamily: "var(--mono)", fontSize: 10,
                  color: "var(--text-dim)", letterSpacing: "0.05em",
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={resetForm}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, padding: "13px", background: "var(--surface2)",
              border: "1px solid var(--border)", borderRadius: 10,
              color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: 12,
              fontWeight: 600, letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <RotateCcw size={14} strokeWidth={2} />
            LOG ANOTHER
          </button>
          <button
            onClick={() => router.push("/history")}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              padding: "13px", background: "var(--accent)", border: "none",
              borderRadius: 10, color: "var(--bg)", fontFamily: "var(--mono)", fontSize: 12,
              fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.15s",
            }}
          >
            VIEW HISTORY
          </button>
        </div>
      </div>
    );
  }

  // ── Success screen: Training ─────────────────────────────────────────────

  if (loggedSession?.kind === "training") {
    const s = loggedSession;
    const Icon       = tabs.find((t) => t.key === s.type)?.icon ?? CheckCircle;
    const themeColor = TYPE_COLOR[s.type];
    const durationLabel = fmtDur(s.duration);

    return (
      <div style={{ maxWidth: 520, animation: "pageEnter 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both" }}>
        <div style={{ textAlign: "center", marginBottom: 32, paddingTop: 16 }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: themeColor.dim, border: `2px solid ${themeColor.main}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px", boxShadow: `0 0 40px ${themeColor.dim}`,
            animation: "scoreIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
          }}>
            <Icon size={36} color={themeColor.main} strokeWidth={1.75} />
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: themeColor.main, letterSpacing: "0.05em", marginBottom: 6 }}>
            SESSION LOGGED
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>{s.date}</div>
        </div>

        <div style={{
          background: "var(--surface)", border: "1px solid var(--border2)",
          borderRadius: 20, padding: 24, marginBottom: 16,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: themeColor.main, borderRadius: "20px 20px 0 0",
          }} />

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <span style={{
              padding: "4px 12px", borderRadius: 99, background: themeColor.dim,
              border: `1px solid ${themeColor.main}30`, fontFamily: "var(--mono)",
              fontSize: 11, fontWeight: 700, color: themeColor.main,
              letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              {TYPE_LABEL[s.type]}
            </span>
            {s.notes && (
              <span style={{ fontSize: 13, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.notes}
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              { icon: Clock,    label: "Duration", value: durationLabel,          color: "var(--text)"       },
              { icon: Zap,      label: "RPE",      value: `${s.rpe}/10`,          color: themeColor.main     },
              { icon: TrendingUp, label: "Load",   value: s.load.toString(),      color: "var(--yellow)"     },
            ].map(({ icon: StatIcon, label, value, color: c }) => (
              <div key={label} style={{
                background: "var(--surface2)", border: "1px solid var(--border2)",
                borderRadius: 12, padding: "14px 12px", textAlign: "center",
              }}>
                <StatIcon size={14} color="var(--text-dim)" strokeWidth={1.75} style={{ marginBottom: 6 }} />
                <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: c, lineHeight: 1, marginBottom: 4 }}>
                  {value}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: "var(--mono)" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "1px" }}>
              Effort:
            </span>
            <span style={{ fontSize: 12, color: "var(--text)", fontFamily: "var(--mono)" }}>
              {effortOptions.find((e) => e.key === s.effort)?.label}
            </span>
          </div>
        </div>

        {newPRs.length > 0 && (
          <div style={{
            background: "var(--yellow-dim)", border: "1px solid var(--border)",
            borderRadius: 16, padding: "16px 18px", marginBottom: 16,
            animation: "scoreIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: "var(--yellow-dim)", display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Trophy size={16} color="var(--yellow)" strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--yellow)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {newPRs.length === 1 ? "New Personal Record!" : `${newPRs.length} New Personal Records!`}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)", marginTop: 1 }}>
                  You just hit a new best
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {newPRs.map((pr) => (
                <div key={pr.metric} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", background: "var(--surface)",
                  border: "1px solid var(--border2)", borderRadius: 8,
                }}>
                  <span style={{ fontSize: 12, color: "var(--text)", fontFamily: "var(--mono)" }}>{pr.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {pr.previous !== null && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)", textDecoration: "line-through" }}>
                        {pr.metric.includes("load") ? pr.previous : fmtDur(pr.previous)}
                      </span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--yellow)", fontFamily: "var(--mono)" }}>
                      {pr.metric.includes("load") ? pr.value : fmtDur(pr.value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(nudgeLoading || nudge) && (
          <div style={{
            background: "var(--accent-dim)", border: "1px solid var(--accent-glow)",
            borderRadius: 14, padding: "14px 16px", marginBottom: 16,
            animation: "fadeIn 0.3s ease-out both",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 18, height: 18, borderRadius: 5, background: "var(--accent-dim)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                </svg>
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)", letterSpacing: "2px", textTransform: "uppercase", fontFamily: "var(--mono)" }}>
                Coach Insight
              </div>
            </div>
            {nudgeLoading ? (
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 5, height: 5, background: "var(--accent)", borderRadius: "50%",
                    animation: `bounce 1s ${i * 150}ms infinite`,
                  }} />
                ))}
              </div>
            ) : (
              <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--text)", lineHeight: 1.7, fontWeight: 300 }}>
                {nudge}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={resetForm}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, padding: "13px", background: "var(--surface2)",
              border: "1px solid var(--border)", borderRadius: 10, color: "var(--text-muted)",
              fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600,
              letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <RotateCcw size={14} strokeWidth={2} />
            LOG ANOTHER
          </button>
          <button
            onClick={() => router.push("/history")}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              padding: "13px", background: "var(--accent)", border: "none",
              borderRadius: 10, color: "var(--bg)", fontFamily: "var(--mono)", fontSize: 12,
              fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.15s",
            }}
          >
            VIEW HISTORY
          </button>
        </div>
      </div>
    );
  }

  // ── Log form ─────────────────────────────────────────────────────────────

  const isGrowth = tab === "growth";

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{
          fontFamily: "var(--mono)", fontSize: "24px", fontWeight: 700,
          letterSpacing: "0.06em", color: "var(--text)", margin: 0,
        }}>
          LOG SESSION
        </h1>
        <p style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
          {isGrowth ? "Record study, projects, learning, or deep work" : "Record a training session"}
        </p>
      </div>

      <div style={{
        backgroundColor: "var(--surface)", border: "1px solid var(--border2)",
        borderRadius: "20px", padding: "24px 20px", overflow: "hidden",
        boxSizing: "border-box", width: "100%",
      }}>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: "4px", backgroundColor: "var(--surface2)",
          borderRadius: "12px", padding: "4px", marginBottom: "28px",
        }}>
          {tabs.map(({ key, label, icon: Icon }) => {
            const isActive = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  gap: "6px", padding: "10px 4px", borderRadius: "9px", border: "none",
                  cursor: "pointer",
                  backgroundColor: isActive ? "var(--accent-dim)" : "transparent",
                  fontFamily: "var(--mono)", fontSize: "11px",
                  fontWeight: isActive ? 700 : 500, letterSpacing: "0.08em",
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  transition: "all 0.15s ease", minWidth: 0,
                }}
              >
                <Icon
                  size={13} strokeWidth={isActive ? 2.5 : 1.75}
                  color={isActive ? "var(--accent)" : "var(--text-dim)"}
                  style={{ filter: isActive ? "drop-shadow(0 0 4px var(--accent-glow))" : "none", flexShrink: 0 }}
                />
                {label}
              </button>
            );
          })}
        </div>

        {/* Growth: Title */}
        {isGrowth && (
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>TITLE <span style={{ color: "#ef4444" }}>*</span></label>
            <input
              type="text"
              value={growthTitle}
              onChange={(e) => { setGrowthTitle(e.target.value); if (titleError) setTitleError(false); }}
              placeholder={GROWTH_TITLE_PLACEHOLDERS[growthCategory]}
              style={{
                ...inputStyle,
                borderColor: titleError ? "#ef4444" : "var(--border2)",
              }}
            />
            {titleError && (
              <div style={{ fontSize: 11, color: "#ef4444", fontFamily: "var(--mono)", marginTop: 4 }}>
                Title is required
              </div>
            )}
          </div>
        )}

        {/* Growth: Category */}
        {isGrowth && (
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>CATEGORY <span style={{ color: "#ef4444" }}>*</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {growthCategories.map(({ key, label, desc }) => {
                const isActive = growthCategory === key;
                return (
                  <button
                    key={key}
                    onClick={() => setGrowthCategory(key)}
                    style={{
                      padding: "12px 14px", borderRadius: "10px", textAlign: "left",
                      border: `1px solid ${isActive ? "var(--accent)" : "transparent"}`,
                      backgroundColor: isActive ? "var(--accent-dim)" : "var(--surface2)",
                      cursor: "pointer", transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{
                      fontFamily: "var(--mono)", fontSize: "12px",
                      fontWeight: isActive ? 700 : 500, letterSpacing: "0.06em",
                      color: isActive ? "var(--accent)" : "var(--text)",
                      marginBottom: 2,
                    }}>
                      {label}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--sans)" }}>
                      {desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Date */}
        <div style={{ marginBottom: "16px", width: "100%" }}>
          <label style={labelStyle}>DATE</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              ...inputStyle, colorScheme: "var(--color-scheme)",
              display: "block", minHeight: "48px", lineHeight: "1.5",
              WebkitAppearance: "none", appearance: "none",
            }}
          />
        </div>

        {/* Duration */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
          <div>
            <label style={labelStyle}>HOURS</label>
            <input
              type="number" min={0} max={24} value={hours}
              onChange={(e) => setHours(sanitizeNumericInput(e.target.value, 24))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>MINUTES</label>
            <input
              type="number" min={0} max={59} value={minutes}
              onChange={(e) => setMinutes(sanitizeNumericInput(e.target.value, 59))}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Effort (run/lift only) */}
        {!isGrowth && (
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>EFFORT</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {effortOptions.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setEffort(key)}
                  style={{
                    padding: "10px 8px", borderRadius: "9px",
                    border: `1px solid ${effort === key ? "var(--accent)" : "transparent"}`,
                    backgroundColor: effort === key ? "var(--accent-dim)" : "var(--surface2)",
                    color: effort === key ? "var(--accent)" : "var(--text-muted)",
                    fontFamily: "var(--sans)", fontSize: "13px",
                    fontWeight: effort === key ? 600 : 400,
                    cursor: "pointer", transition: "all 0.15s ease",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Run fields */}
        {tab === "run" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
            <div>
              <label style={labelStyle}>DISTANCE (KM)</label>
              <input
                type="number" step="0.1" min={0} value={distance}
                onChange={(e) => setDistance(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>TERRAIN</label>
              <select
                value={terrain} onChange={(e) => setTerrain(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer", colorScheme: "var(--color-scheme)" }}
              >
                {terrainOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Lift fields */}
        {tab === "lift" && (
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>SESSION TYPE</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {liftTypes.map((t) => (
                <button
                  key={t} onClick={() => setLiftType(t)}
                  style={{
                    padding: "8px 14px", borderRadius: "9px",
                    border: `1px solid ${liftType === t ? "var(--accent)" : "transparent"}`,
                    backgroundColor: liftType === t ? "var(--accent-dim)" : "var(--surface2)",
                    color: liftType === t ? "var(--accent)" : "var(--text-muted)",
                    fontFamily: "var(--sans)", fontSize: "13px",
                    fontWeight: liftType === t ? 600 : 400, cursor: "pointer",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Growth: Focus Score slider */}
        {isGrowth && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                FOCUS SCORE <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700, color: focusColor(focusScore) }}>
                  {focusScore}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: focusColor(focusScore), fontWeight: 600 }}>
                  {focusLabel(focusScore)}
                </span>
              </div>
            </div>
            <input
              type="range"
              min={1} max={10} step={1}
              value={focusScore}
              onChange={(e) => setFocusScore(Number(e.target.value))}
              style={{
                width: "100%", height: 6, cursor: "pointer",
                accentColor: focusColor(focusScore),
                outline: "none",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              {[
                { score: 1,  label: "1–3 Distracted" },
                { score: 5,  label: "4–6 Average"    },
                { score: 8,  label: "7–8 Focused"    },
                { score: 10, label: "9–10 Deep"      },
              ].map(({ score, label }) => (
                <span key={score} style={{
                  fontSize: 9, fontFamily: "var(--mono)", color: "var(--text-muted)",
                  letterSpacing: "0.05em",
                }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: isGrowth ? "16px" : "24px" }}>
          <label style={labelStyle}>{isGrowth ? "NOTES (OPTIONAL)" : "NOTES"}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isGrowth ? "What did you work on? Key takeaways?" : "How did it go?"}
            rows={3}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--sans)" }}
          />
        </div>

        {/* Growth: Tags */}
        {isGrowth && (
          <div style={{ marginBottom: "24px" }}>
            <label style={labelStyle}>TAGS (OPTIONAL)</label>
            <input
              type="text"
              value={growthTags}
              onChange={(e) => setGrowthTags(e.target.value)}
              placeholder="e.g. algorithms, leetcode, observer-os"
              style={inputStyle}
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)", marginTop: 5 }}>
              Comma-separated
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "8px", padding: "14px", backgroundColor: "var(--accent)",
            border: "none", borderRadius: "10px", color: "var(--bg)",
            fontFamily: "var(--mono)", fontSize: "13px", fontWeight: 700,
            letterSpacing: "0.08em", cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1, transition: "all 0.2s ease",
            width: "100%", boxSizing: "border-box",
            boxShadow: "0 4px 20px var(--accent-glow)",
          }}
        >
          {loading
            ? (isGrowth ? "LOGGING..." : "LOGGING...")
            : (isGrowth ? "LOG GROWTH" : "LOG SESSION")}
        </button>
      </div>
    </div>
  );
}
