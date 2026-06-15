"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { PersonStanding, Dumbbell, BookOpen, CheckCircle } from "lucide-react";

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
const studySubjects = [
  "Math",
  "Science",
  "Languages",
  "Programming",
  "History",
  "Other",
];

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
  const [success, setSuccess] = useState(false);

  const [distance, setDistance] = useState(5.0);
  const [terrain, setTerrain] = useState("Road");
  const [liftType, setLiftType] = useState("Push");
  const [subject, setSubject] = useState("Programming");
  const [focusScore, setFocusScore] = useState(7);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const durationMinutes = hours * 60 + minutes;
      const sessionData: any = {
        user_id: user.id,
        session_type: tab,
        date,
        duration_minutes: durationMinutes,
        effort,
        notes,
        ...(tab === "run" && { distance_km: distance, terrain }),
        ...(tab === "lift" && { lift_type: liftType }),
        ...(tab === "study" && { subject, focus_score: focusScore }),
      };
      await supabase.from("sessions").insert(sessionData as any);
      setSuccess(true);
      setTimeout(() => {
        router.push("/history");
      }, 1200);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    color: "#fff",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "JetBrains Mono, monospace",
    fontSize: "11px",
    letterSpacing: "0.1em",
    color: "rgba(255,255,255,0.35)",
    marginBottom: "8px",
    display: "block",
  };

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "24px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "#fff",
            margin: 0,
          }}
        >
          LOG SESSION
        </h1>
        <p
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "12px",
            color: "rgba(255,255,255,0.35)",
            marginTop: "6px",
          }}
        >
          Record a training or study session
        </p>
      </div>

      <div
        style={{
          backgroundColor: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "20px",
          padding: "24px 20px",
        }}
      >
        {/* Tab switcher */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            backgroundColor: "rgba(255,255,255,0.04)",
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
                  padding: "10px 8px",
                  borderRadius: "9px",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: isActive
                    ? "rgba(232,255,71,0.1)"
                    : "transparent",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: "11px",
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: "0.08em",
                  color: isActive ? "#E8FF47" : "rgba(255,255,255,0.35)",
                  transition: "all 0.15s ease",
                }}
              >
                <Icon
                  size={13}
                  strokeWidth={isActive ? 2.5 : 1.75}
                  color={isActive ? "#E8FF47" : "rgba(255,255,255,0.35)"}
                  style={{
                    filter: isActive
                      ? "drop-shadow(0 0 4px rgba(232,255,71,0.6))"
                      : "none",
                  }}
                />
                {label}
              </button>
            );
          })}
        </div>

        {/* Date + Duration — stacked on mobile */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 80px",
            gap: "12px",
            marginBottom: "20px",
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle}>DATE</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...inputStyle, colorScheme: "dark" }}
            />
          </div>
          <div>
            <label style={labelStyle}>HRS</label>
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
            <label style={labelStyle}>MIN</label>
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
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {effortOptions.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setEffort(key)}
                style={{
                  padding: "9px 16px",
                  borderRadius: "9px",
                  border: `1px solid ${effort === key ? "#E8FF47" : "rgba(255,255,255,0.1)"}`,
                  backgroundColor:
                    effort === key ? "rgba(232,255,71,0.08)" : "transparent",
                  color: effort === key ? "#E8FF47" : "rgba(255,255,255,0.45)",
                  fontFamily: "Inter, sans-serif",
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
                  colorScheme: "dark",
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
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {liftTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setLiftType(t)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "9px",
                    border: `1px solid ${liftType === t ? "#E8FF47" : "rgba(255,255,255,0.1)"}`,
                    backgroundColor:
                      liftType === t ? "rgba(232,255,71,0.08)" : "transparent",
                    color:
                      liftType === t ? "#E8FF47" : "rgba(255,255,255,0.45)",
                    fontFamily: "Inter, sans-serif",
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
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  colorScheme: "dark",
                }}
              >
                {studySubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
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
              fontFamily: "Inter, sans-serif",
            }}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || success}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "13px 28px",
            backgroundColor: success ? "rgba(232,255,71,0.15)" : "#E8FF47",
            border: success ? "1px solid #E8FF47" : "none",
            borderRadius: "10px",
            color: success ? "#E8FF47" : "#060608",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: loading || success ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
            transition: "all 0.2s ease",
            width: "100%",
          }}
        >
          {success ? (
            <>
              <CheckCircle size={15} strokeWidth={2.5} />
              LOGGED
            </>
          ) : loading ? (
            "LOGGING..."
          ) : (
            "LOG SESSION"
          )}
        </button>
      </div>
    </div>
  );
}
