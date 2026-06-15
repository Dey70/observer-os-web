"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { detectPRs, type PR } from "@/lib/prDetection";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  PersonStanding,
  Dumbbell,
  BookOpen,
  CheckCircle,
  RotateCcw,
  Clock,
  Zap,
  TrendingUp,
  Trophy,
} from "lucide-react";

type Tab = "run" | "lift" | "study";
type Effort = "easy" | "medium" | "hard" | "very_hard";

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "run", label: "RUN", icon: PersonStanding },
  { key: "lift", label: "LIFT", icon: Dumbbell },
  { key: "study", label: "STUDY", icon: BookOpen },
];

const effortOptions: { key: Effort; label: string }[] = [
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
  { key: "very_hard", label: "Very Hard" },
];

const effortToRpe: Record<Effort, number> = {
  easy: 3,
  medium: 5,
  hard: 7,
  very_hard: 9,
};

const TYPE_COLOR: Record<Tab, { main: string; dim: string }> = {
  run: { main: "var(--green)", dim: "var(--green-dim)" },
  lift: { main: "var(--purple)", dim: "var(--purple-dim)" },
  study: { main: "var(--yellow)", dim: "var(--yellow-dim)" },
};

const TYPE_LABEL: Record<Tab, string> = {
  run: "Run",
  lift: "Lift",
  study: "Study",
};

const terrainOptions = ["Road", "Trail", "Track", "Treadmill", "Mixed"];
const liftTypes = [
  "Push",
  "Pull",
  "Legs",
  "Full Body",
  "Upper",
  "Lower",
  "Core",
];

type LoggedSession = {
  type: Tab;
  duration: number; // minutes
  effort: Effort;
  rpe: number;
  notes: string;
  date: string;
  load: number;
};

export default function LogPage() {
  const router = useRouter();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("run");
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [effort, setEffort] = useState<Effort>("medium");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const [distance, setDistance] = useState(5.0);
  const [terrain, setTerrain] = useState("Road");
  const [liftType, setLiftType] = useState("Push");
  const [subject, setSubject] = useState("");
  const [focusScore, setFocusScore] = useState(7);

  // Success state
  const [loggedSession, setLoggedSession] = useState<LoggedSession | null>(
    null,
  );
  const [nudge, setNudge] = useState<string | null>(null);
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const [newPRs, setNewPRs] = useState<PR[]>([]);

  function resetForm() {
    setLoggedSession(null);
    setNudge(null);
    setNewPRs([]);
    setNotes("");
    setHours(0);
    setMinutes(30);
    setEffort("medium");
    setDistance(5.0);
    setTerrain("Road");
    setLiftType("Push");
    setSubject("");
    setFocusScore(7);
    setDate(new Date().toISOString().split("T")[0]);
  }

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const durationMinutes = hours * 60 + minutes;
      const rpe = effortToRpe[effort];
      const load = durationMinutes * rpe;

      const sessionData = {
        user_id: user.id,
        type: tab,
        date,
        duration: durationMinutes,
        rpe,
        notes: notes.trim() || null,
      };

      const { error: insertError } = await (supabase as any)
        .from("sessions")
        .insert(sessionData);

      if (insertError) {
        console.error("Insert error:", insertError);
        alert(`Failed to log session: ${insertError.message}`);
        setLoading(false);
        return;
      }

      const logged: LoggedSession = {
        type: tab,
        duration: durationMinutes,
        effort,
        rpe,
        notes,
        date,
        load,
      };

      // Detect PRs in background
      const {
        data: { user: u2 },
      } = await supabase.auth.getUser();
      if (u2) {
        detectPRs(supabase, u2.id, {
          type: tab,
          duration: durationMinutes,
          rpe,
          date,
          notes,
        })
          .then(setNewPRs)
          .catch(() => {});
      }

      setLoggedSession(logged);
      setLoading(false);

      // Fetch AI nudge in background
      setNudgeLoading(true);
      try {
        const res = await fetch("/api/nudge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkin: {
              session_type: tab,
              duration: durationMinutes,
              rpe,
              effort,
              notes,
              sleep_quality: 7,
              soreness: 3,
              fatigue: 3,
              mood: 7,
              energy: 7,
            },
          }),
        });
        const data = await res.json();
        setNudge(data.nudge ?? null);
      } catch {}
      setNudgeLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    backgroundColor: "var(--surface2)",
    border: "1px solid var(--border2)", // Softer border!
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

  function fmtDur(v: number): string {
    const h = Math.floor(v / 60);
    const m = v % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  // ── SUCCESS SCREEN ──
  if (loggedSession) {
    const Icon =
      tabs.find((t) => t.key === loggedSession.type)?.icon ?? CheckCircle;
    const themeColor = TYPE_COLOR[loggedSession.type];
    const hrs = Math.floor(loggedSession.duration / 60);
    const mins = loggedSession.duration % 60;
    const durationLabel = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

    return (
      <div
        style={{
          maxWidth: 520,
          animation: "pageEnter 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32, paddingTop: 16 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: themeColor.dim,
              border: `2px solid ${themeColor.main}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              boxShadow: `0 0 40px ${themeColor.dim}`,
              animation: "scoreIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
            }}
          >
            <Icon size={36} color={themeColor.main} strokeWidth={1.75} />
          </div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 22,
              fontWeight: 700,
              color: themeColor.main,
              letterSpacing: "0.05em",
              marginBottom: 6,
            }}
          >
            SESSION LOGGED
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              fontFamily: "var(--mono)",
            }}
          >
            {loggedSession.date}
          </div>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: `1px solid var(--border2)`,
            borderRadius: 20,
            padding: 24,
            marginBottom: 16,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: themeColor.main,
              borderRadius: "20px 20px 0 0",
            }}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 24,
            }}
          >
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 99,
                background: themeColor.dim,
                border: `1px solid ${themeColor.main}30`,
                fontFamily: "var(--mono)",
                fontSize: 11,
                fontWeight: 700,
                color: themeColor.main,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {TYPE_LABEL[loggedSession.type]}
            </span>
            {loggedSession.notes && (
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-dim)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {loggedSession.notes}
              </span>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              {
                icon: Clock,
                label: "Duration",
                value: durationLabel,
                color: "var(--text)",
              },
              {
                icon: Zap,
                label: "RPE",
                value: `${loggedSession.rpe}/10`,
                color: themeColor.main,
              },
              {
                icon: TrendingUp,
                label: "Load",
                value: loggedSession.load.toString(),
                color: "var(--yellow)",
              },
            ].map(({ icon: StatIcon, label, value, color: c }) => (
              <div
                key={label}
                style={{
                  background: "var(--surface2)",
                  border: "1px solid var(--border2)",
                  borderRadius: 12,
                  padding: "14px 12px",
                  textAlign: "center",
                }}
              >
                <StatIcon
                  size={14}
                  color="var(--text-dim)"
                  strokeWidth={1.75}
                  style={{ marginBottom: 6 }}
                />
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 18,
                    fontWeight: 700,
                    color: c,
                    lineHeight: 1,
                    marginBottom: 4,
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    fontFamily: "var(--mono)",
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                fontFamily: "var(--mono)",
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Effort:
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--text)",
                fontFamily: "var(--mono)",
              }}
            >
              {effortOptions.find((e) => e.key === loggedSession.effort)?.label}
            </span>
          </div>
        </div>

        {newPRs.length > 0 && (
          <div
            style={{
              background: "var(--yellow-dim)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "16px 18px",
              marginBottom: 16,
              animation: "scoreIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: "var(--yellow-dim)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Trophy size={16} color="var(--yellow)" strokeWidth={2} />
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--yellow)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  {newPRs.length === 1
                    ? "New Personal Record!"
                    : `${newPRs.length} New Personal Records!`}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    fontFamily: "var(--mono)",
                    marginTop: 1,
                  }}
                >
                  You just hit a new best
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {newPRs.map((pr) => (
                <div
                  key={pr.metric}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "var(--surface)",
                    border: "1px solid var(--border2)",
                    borderRadius: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text)",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    {pr.label}
                  </span>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    {pr.previous !== null && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          fontFamily: "var(--mono)",
                          textDecoration: "line-through",
                        }}
                      >
                        {pr.metric.includes("load")
                          ? pr.previous
                          : fmtDur(pr.previous)}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--yellow)",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {pr.metric.includes("load") ? pr.value : fmtDur(pr.value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(nudgeLoading || nudge) && (
          <div
            style={{
              background: "var(--accent-dim)",
              border: "1px solid var(--accent-glow)",
              borderRadius: 14,
              padding: "14px 16px",
              marginBottom: 16,
              animation: "fadeIn 0.3s ease-out both",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  background: "var(--accent-dim)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--accent)",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  fontFamily: "var(--mono)",
                }}
              >
                Coach Insight
              </div>
            </div>
            {nudgeLoading ? (
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 5,
                      height: 5,
                      background: "var(--accent)",
                      borderRadius: "50%",
                      animation: `bounce 1s ${i * 150}ms infinite`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  fontFamily: "var(--sans)",
                  fontSize: 13,
                  color: "var(--text)",
                  lineHeight: 1.7,
                  fontWeight: 300,
                }}
              >
                {nudge}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={resetForm}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "13px",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              color: "var(--text-muted)",
              fontFamily: "var(--mono)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.08em",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <RotateCcw size={14} strokeWidth={2} />
            LOG ANOTHER
          </button>
          <button
            onClick={() => router.push("/history")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "13px",
              background: "var(--accent)",
              border: "none",
              borderRadius: 10,
              color: "var(--bg)",
              fontFamily: "var(--mono)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            VIEW HISTORY
          </button>
        </div>
      </div>
    );
  }

  // ── LOG FORM ──
  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontFamily: "var(--mono)",
            fontSize: "24px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "var(--text)",
            margin: 0,
          }}
        >
          LOG SESSION
        </h1>
        <p
          style={{
            fontFamily: "var(--mono)",
            fontSize: "12px",
            color: "var(--text-muted)",
            marginTop: "6px",
          }}
        >
          Record a training or study session
        </p>
      </div>

      <div
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border2)", // Softer container border
          borderRadius: "20px",
          padding: "24px 20px",
          overflow: "hidden",
          boxSizing: "border-box",
          width: "100%",
        }}
      >
        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            backgroundColor: "var(--surface2)",
            borderRadius: "12px",
            padding: "4px",
            marginBottom: "28px",
          }}
        >
          {tabs.map(({ key, label, icon: Icon }) => {
            const isActive = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px 4px",
                  borderRadius: "9px",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: isActive
                    ? "var(--accent-dim)"
                    : "transparent",
                  fontFamily: "var(--mono)",
                  fontSize: "11px",
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: "0.08em",
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  transition: "all 0.15s ease",
                  minWidth: 0,
                }}
              >
                <Icon
                  size={13}
                  strokeWidth={isActive ? 2.5 : 1.75}
                  color={isActive ? "var(--accent)" : "var(--text-dim)"}
                  style={{
                    filter: isActive
                      ? "drop-shadow(0 0 4px var(--accent-glow))"
                      : "none",
                    flexShrink: 0,
                  }}
                />
                {label}
              </button>
            );
          })}
        </div>

        {/* Date */}
        <div style={{ marginBottom: "16px", width: "100%" }}>
          <label style={labelStyle}>DATE</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              ...inputStyle,
              colorScheme: "var(--color-scheme)",
              display: "block",
              minHeight: "48px",
              lineHeight: "1.5",
              WebkitAppearance: "none",
              appearance: "none",
            }}
          />
        </div>

        {/* Duration */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          <div>
            <label style={labelStyle}>HOURS</label>
            <input
              type="number"
              min={0}
              max={24}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>MINUTES</label>
            <input
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Effort */}
        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle}>EFFORT</label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            {effortOptions.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setEffort(key)}
                style={{
                  padding: "10px 8px",
                  borderRadius: "9px",
                  border: `1px solid ${effort === key ? "var(--accent)" : "transparent"}`, // Replaced hard border with transparent
                  backgroundColor:
                    effort === key ? "var(--accent-dim)" : "var(--surface2)", // Rely on surface contrast
                  color: effort === key ? "var(--accent)" : "var(--text-muted)",
                  fontFamily: "var(--sans)",
                  fontSize: "13px",
                  fontWeight: effort === key ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Run fields */}
        {tab === "run" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <div>
              <label style={labelStyle}>DISTANCE (KM)</label>
              <input
                type="number"
                step="0.1"
                min={0}
                value={distance}
                onChange={(e) => setDistance(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>TERRAIN</label>
              <select
                value={terrain}
                onChange={(e) => setTerrain(e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  colorScheme: "var(--color-scheme)",
                }}
              >
                {terrainOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Lift fields */}
        {tab === "lift" && (
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>SESSION TYPE</label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
              }}
            >
              {liftTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setLiftType(t)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "9px",
                    border: `1px solid ${liftType === t ? "var(--accent)" : "transparent"}`, // Replaced hard border
                    backgroundColor:
                      liftType === t ? "var(--accent-dim)" : "var(--surface2)",
                    color:
                      liftType === t ? "var(--accent)" : "var(--text-muted)",
                    fontFamily: "var(--sans)",
                    fontSize: "13px",
                    fontWeight: liftType === t ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Study fields */}
        {tab === "study" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <div>
              <label style={labelStyle}>SUBJECT</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Algorithms..."
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>FOCUS SCORE</label>
              <input
                type="number"
                min={1}
                max={10}
                value={focusScore}
                onChange={(e) => setFocusScore(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: "24px" }}>
          <label style={labelStyle}>NOTES</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it go?"
            rows={3}
            style={{
              ...inputStyle,
              resize: "vertical",
              fontFamily: "var(--sans)",
            }}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "14px",
            backgroundColor: "var(--accent)",
            border: "none",
            borderRadius: "10px",
            color: "var(--bg)",
            fontFamily: "var(--mono)",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            transition: "all 0.2s ease",
            width: "100%",
            boxSizing: "border-box",
            boxShadow: "0 4px 20px var(--accent-glow)",
          }}
        >
          {loading ? "LOGGING..." : "LOG SESSION"}
        </button>
      </div>
    </div>
  );
}
