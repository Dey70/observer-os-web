"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { effortToRpe } from "@/lib/utils";
import {
  Card,
  PageHeader,
  Button,
  Field,
  Input,
  Select,
  Chip,
  EffortButton,
} from "@/components/ui";

type SessionType = "run" | "lift" | "study";
type Effort = "easy" | "medium" | "hard" | "vhard";

const MUSCLES = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"];
const TERRAINS = ["Road", "Trail", "Track", "Treadmill"];

export const dynamic = "force-dynamic";

export default function LogPage() {
  const sb = createClient();
  const [type, setType] = useState<SessionType>("run");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const [effort, setEffort] = useState<Effort | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [distance, setDistance] = useState("");
  const [terrain, setTerrain] = useState("Road");
  const [exercises, setExercises] = useState("");
  const [muscles, setMuscles] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [focus, setFocus] = useState("Medium");

  function toggleMuscle(m: string) {
    setMuscles((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  }

  async function handleSubmit() {
    const duration = (parseInt(hours) || 0) * 60 + (parseInt(mins) || 0);
    if (!duration) return;
    setSaving(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    let notesArr: string[] = [];
    if (type === "run") {
      if (distance) notesArr.push(`${distance}km · ${terrain}`);
    } else if (type === "lift") {
      if (exercises) notesArr.push(exercises);
      if (muscles.length) notesArr.push(muscles.join(", "));
    } else {
      if (topic) notesArr.push(topic);
      notesArr.push(`Focus: ${focus}`);
    }
    if (notes) notesArr.push(notes);

    await (sb as any).from("sessions").insert({
      user_id: user.id,
      date,
      type,
      duration,
      rpe: effortToRpe(effort ?? "medium"),
      notes: notesArr.join(" · ") || null,
    });

    setSaving(false);
    setSaved(true);
    setHours("");
    setMins("");
    setEffort(null);
    setNotes("");
    setDistance("");
    setExercises("");
    setMuscles([]);
    setTopic("");
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div>
      <PageHeader
        title="LOG SESSION"
        subtitle="Record a training or study session"
      />

      <Card>
        {/* Type tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border2)",
            marginBottom: 24,
          }}
        >
          {(["run", "lift", "study"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                flex: 1,
                padding: 10,
                textAlign: "center",
                fontFamily: "var(--mono)",
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: type === t ? "var(--accent)" : "var(--text-muted)",
                background: type === t ? "var(--accent-dim)" : "none",
                border: "none",
                borderRight: "1px solid var(--border2)",
                cursor: "pointer",
              }}
            >
              {t === "run" ? "🏃 Run" : t === "lift" ? "🏋 Lift" : "📚 Study"}
            </button>
          ))}
        </div>

        {/* Date + Duration */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 140px" }}>
            <Field label="Date">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
          <div style={{ flex: "0 0 80px" }}>
            <Field label="Hours">
              <Input
                type="number"
                min={0}
                max={12}
                placeholder="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </Field>
          </div>
          <div style={{ flex: "0 0 80px" }}>
            <Field label="Minutes">
              <Input
                type="number"
                min={0}
                max={59}
                placeholder="30"
                value={mins}
                onChange={(e) => setMins(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Effort */}
        <Field label="Effort">
          <div
            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}
          >
            {(["easy", "medium", "hard", "vhard"] as Effort[]).map((e) => (
              <EffortButton
                key={e}
                value={e}
                label={
                  e === "vhard"
                    ? "Very Hard"
                    : e.charAt(0).toUpperCase() + e.slice(1)
                }
                selected={effort === e}
                onClick={() => setEffort(e)}
              />
            ))}
          </div>
        </Field>

        {/* Run fields */}
        {type === "run" && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 120px" }}>
              <Field label="Distance (km)">
                <Input
                  type="number"
                  step={0.1}
                  placeholder="5.0"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <Field label="Terrain">
                <Select
                  value={terrain}
                  onChange={(e) => setTerrain(e.target.value)}
                >
                  {TERRAINS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        )}

        {/* Lift fields */}
        {type === "lift" && (
          <>
            <Field label="Exercises">
              <Input
                placeholder="Squat 3×5, Bench 4×8..."
                value={exercises}
                onChange={(e) => setExercises(e.target.value)}
              />
            </Field>
            <Field label="Muscle Groups">
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                {MUSCLES.map((m) => (
                  <Chip
                    key={m}
                    label={m}
                    active={muscles.includes(m)}
                    onClick={() => toggleMuscle(m)}
                  />
                ))}
              </div>
            </Field>
          </>
        )}

        {/* Study fields */}
        {type === "study" && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px" }}>
              <Field label="Topic / Subject">
                <Input
                  placeholder="Machine Learning, DSA..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: "0 0 140px" }}>
              <Field label="Focus Quality">
                <Select
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                >
                  {["Low", "Medium", "High", "Deep Work"].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        )}

        <Field label="Notes">
          <Input
            placeholder="How did it go?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 8,
          }}
        >
          <Button onClick={handleSubmit} disabled={saving || (!hours && !mins)}>
            {saving ? "Saving..." : "Log Session"}
          </Button>
          {saved && (
            <span
              style={{
                fontSize: 12,
                color: "var(--green)",
                fontFamily: "var(--mono)",
              }}
            >
              ✓ Saved
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
