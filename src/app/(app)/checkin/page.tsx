"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { calcReadiness } from "@/lib/utils";
import { Card, PageHeader, Button, Field, Input } from "@/components/ui";

const SLIDERS = [
  { key: "sleep_quality", label: "Sleep Quality", min: 1, max: 10 },
  { key: "soreness", label: "Soreness", min: 1, max: 10 },
  { key: "fatigue", label: "Fatigue", min: 1, max: 10 },
  { key: "mood", label: "Mood", min: 1, max: 10 },
  { key: "energy", label: "Energy", min: 1, max: 10 },
] as const;

type SliderKey = (typeof SLIDERS)[number]["key"];

const DEFAULT_VALS: Record<SliderKey, number> = {
  sleep_quality: 7,
  soreness: 3,
  fatigue: 3,
  mood: 7,
  energy: 7,
};

export const dynamic = "force-dynamic";

export default function CheckinPage() {
  const sb = createClient();
  const [sleepHours, setSleepHours] = useState(7);
  const [vals, setVals] = useState<Record<SliderKey, number>>(DEFAULT_VALS);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const [alreadyChecked, setAlreadyChecked] = useState(false);

  const readiness = calcReadiness(
    vals.sleep_quality,
    vals.soreness,
    vals.fatigue,
    vals.mood,
    vals.energy,
  );
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    async function checkToday() {
      const todayStr = new Date().toISOString().split("T")[0];
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) return;
      const { data: raw } = await sb
        .from("daily_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", todayStr)
        .maybeSingle();
      const data = raw as {
        sleep_hours: number;
        sleep_quality: number;
        soreness: number;
        fatigue: number;
        mood: number;
        energy: number;
        notes: string | null;
      } | null;
      if (data) {
        setAlreadyChecked(true);
        setSleepHours(data.sleep_hours ?? 7);
        setVals({
          sleep_quality: data.sleep_quality ?? 7,
          soreness: data.soreness ?? 3,
          fatigue: data.fatigue ?? 3,
          mood: data.mood ?? 7,
          energy: data.energy ?? 7,
        });
        setNotes(data.notes ?? "");
      }
    }
    checkToday();
  }, []);

  async function handleSubmit() {
    setSaving(true);
    const todayStr = new Date().toISOString().split("T")[0];
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const payload = {
      user_id: user.id,
      date: todayStr,
      sleep_hours: sleepHours,
      ...vals,
      notes: notes.trim() || null,
    };

    await (sb as any)
      .from("daily_logs")
      .upsert(payload, { onConflict: "user_id,date" });
    setSaving(false);
    setSaved(true);
    setAlreadyChecked(true);

    setNudgeLoading(true);
    try {
      const res = await fetch("/api/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkin: payload }),
      });
      const data = await res.json();
      setNudge(data.nudge ?? null);
    } catch {}
    setNudgeLoading(false);
  }

  return (
    <div>
      <PageHeader title="DAILY CHECK-IN" subtitle={todayLabel} />

      <Card accent={readiness.color}>
        <div style={{ textAlign: "center", padding: "24px 0 20px" }}>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 96,
              fontWeight: 700,
              lineHeight: 1,
              color: readiness.color,
              transition: "color 0.3s",
            }}
          >
            {readiness.score.toFixed(1)}
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginTop: 8,
            }}
          >
            Readiness Score
          </div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 13,
              marginTop: 4,
              letterSpacing: "0.08em",
              color: readiness.color,
            }}
          >
            {readiness.label}
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                width: 110,
                flexShrink: 0,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Sleep Hours
            </span>
            <input
              type="range"
              min={0}
              max={12}
              step={0.5}
              value={sleepHours}
              onChange={(e) => setSleepHours(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 14,
                fontWeight: 700,
                width: 36,
                textAlign: "right",
              }}
            >
              {sleepHours}
            </span>
          </div>

          {SLIDERS.map((slider) => (
            <div
              key={slider.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  width: 110,
                  flexShrink: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {slider.label}
              </span>
              <input
                type="range"
                min={slider.min}
                max={slider.max}
                value={vals[slider.key]}
                onChange={(e) =>
                  setVals((prev) => ({
                    ...prev,
                    [slider.key]: parseInt(e.target.value),
                  }))
                }
                style={{ flex: 1 }}
              />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 14,
                  fontWeight: 700,
                  width: 36,
                  textAlign: "right",
                }}
              >
                {vals[slider.key]}
              </span>
            </div>
          ))}
        </div>

        <Field label="Notes (optional)">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth noting today..."
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
          <Button onClick={handleSubmit} disabled={saving}>
            {saving
              ? "Saving..."
              : alreadyChecked
                ? "Update Check-in"
                : "Log Check-in"}
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

      {(nudgeLoading || nudge) && (
        <Card
          style={{
            borderColor: "var(--accent)",
            background: "var(--accent-dim)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--accent)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            🤖 Coach Insight
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
              style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}
            >
              {nudge}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
