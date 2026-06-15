"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { calcReadiness } from "@/lib/utils";
import {
  Card,
  PageHeader,
  Button,
  Field,
  Input,
  NudgeCard,
} from "@/components/ui";

const SLIDERS = [
  { key: "sleep_quality", label: "Sleep Quality", min: 1, max: 10 },
  { key: "soreness", label: "Soreness", min: 1, max: 10 },
  { key: "fatigue", label: "Fatigue", min: 1, max: 10 },
  { key: "mood", label: "Mood", min: 1, max: 10 },
  { key: "energy", label: "Energy", min: 1, max: 10 },
] as const;

type SliderKey = (typeof SLIDERS)[number]["key"];

const SLIDER_COLORS: Record<SliderKey, string> = {
  sleep_quality: "var(--accent)",
  soreness: "var(--red)",
  fatigue: "var(--yellow)",
  mood: "var(--green)",
  energy: "var(--purple)",
};

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
      <PageHeader title="Daily Check-in" subtitle={todayLabel} />

      {/* Readiness Card — glass style */}
      <div className="glass" style={{ padding: 24, marginBottom: 16 }}>
        {/* Ambient glow */}
        <div
          style={{
            position: "absolute",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${readiness.color}15 0%, transparent 70%)`,
            top: -60,
            right: -40,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 80,
                fontWeight: 700,
                color: readiness.color,
                lineHeight: 1,
                transition: "color 0.3s",
              }}
            >
              {readiness.score.toFixed(1)}
            </div>
            <div
              style={{
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "2.5px",
                textTransform: "uppercase",
                marginTop: 4,
                fontFamily: "var(--mono)",
              }}
            >
              Readiness Score
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: readiness.color,
                letterSpacing: "1px",
                marginTop: 3,
              }}
            >
              {readiness.label}
            </div>
          </div>
          <div
            style={{
              display: "inline-flex",
              padding: "5px 12px",
              borderRadius: 8,
              background: `${readiness.color}10`,
              border: `1px solid ${readiness.color}25`,
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: readiness.color,
              letterSpacing: "1px",
              textTransform: "uppercase",
              marginTop: 8,
            }}
          >
            {readiness.level}
          </div>
        </div>

        {/* Sleep Hours */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontSize: 9,
              color: "var(--text-muted)",
              width: 88,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              fontFamily: "var(--mono)",
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
            style={{ flex: 1, accentColor: "var(--accent)" }}
          />
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 13,
              fontWeight: 700,
              width: 24,
              textAlign: "right",
              color: "var(--accent)",
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
              gap: 14,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: "var(--text-muted)",
                width: 88,
                textTransform: "uppercase",
                letterSpacing: "0.8px",
                fontFamily: "var(--mono)",
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
              style={{ flex: 1, accentColor: SLIDER_COLORS[slider.key] }}
            />
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 13,
                fontWeight: 700,
                width: 24,
                textAlign: "right",
                color: SLIDER_COLORS[slider.key],
              }}
            >
              {vals[slider.key]}
            </span>
          </div>
        ))}

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
                fontSize: 11,
                color: "var(--green)",
                fontFamily: "var(--mono)",
              }}
            >
              Saved
            </span>
          )}
        </div>
      </div>

      {/* AI Nudge */}
      {(nudgeLoading || nudge) && (
        <NudgeCard>
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
            nudge
          )}
        </NudgeCard>
      )}
    </div>
  );
}
