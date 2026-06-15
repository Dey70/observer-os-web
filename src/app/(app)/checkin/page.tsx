"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { calcReadiness } from "@/lib/utils";
import { PageHeader, NudgeCard } from "@/components/ui";

const SLIDERS = [
  {
    key: "sleep_quality",
    label: "Sleep Quality",
    min: 1,
    max: 10,
    color: "#E8FF47",
    dataColor: "yellow",
  },
  {
    key: "soreness",
    label: "Soreness",
    min: 1,
    max: 10,
    color: "#FF6600",
    dataColor: "orange",
  },
  {
    key: "fatigue",
    label: "Fatigue",
    min: 1,
    max: 10,
    color: "#FF4444",
    dataColor: "red",
  },
  {
    key: "mood",
    label: "Mood",
    min: 1,
    max: 10,
    color: "#00E676",
    dataColor: "green",
  },
  {
    key: "energy",
    label: "Energy",
    min: 1,
    max: 10,
    color: "#A78BFA",
    dataColor: "purple",
  },
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
  const [mounted, setMounted] = useState(false);
  const [streak, setStreak] = useState(0);
  const [weight, setWeight] = useState<number | null>(null);

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
    setMounted(true);
    async function load() {
      const todayStr = new Date().toISOString().split("T")[0];
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) return;

      const [{ data: rawLog }, { data: logs }, { data: weights }] =
        await Promise.all([
          sb
            .from("daily_logs")
            .select("*")
            .eq("user_id", user.id)
            .eq("date", todayStr)
            .maybeSingle(),
          sb
            .from("daily_logs")
            .select("date")
            .eq("user_id", user.id)
            .order("date", { ascending: false })
            .limit(30),
          sb
            .from("weight_logs")
            .select("weight")
            .eq("user_id", user.id)
            .order("date", { ascending: false })
            .limit(1),
        ]);

      const data = rawLog as {
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

      if (logs?.length) {
        let s = 0;
        const yest = new Date(Date.now() - 86400000)
          .toISOString()
          .split("T")[0];
        const dates = (logs as any[]).map((l) => l.date);
        if (dates[0] === todayStr || dates[0] === yest) {
          s = 1;
          for (let i = 1; i < dates.length; i++) {
            const diff =
              (new Date(dates[i - 1]).getTime() -
                new Date(dates[i]).getTime()) /
              86400000;
            if (diff === 1) s++;
            else break;
          }
        }
        setStreak(s);
      }

      if (weights?.length) setWeight((weights[0] as any).weight);
    }
    load();
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
    <div style={{ maxWidth: 800 }}>
      <PageHeader title="Daily Check-in" subtitle={todayLabel} />

      {/* GLASS CARD */}
      <div
        style={{
          position: "relative",
          borderRadius: 24,
          padding: 28,
          marginBottom: 16,
          overflow: "hidden",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          backdropFilter: "blur(60px)",
          WebkitBackdropFilter: "blur(60px)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.2), 0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 24,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 24,
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.15) 0%, transparent 40%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "15%",
            right: "15%",
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${readiness.color}20 0%, transparent 70%)`,
            top: -120,
            right: -80,
            pointerEvents: "none",
            transition: "background 0.5s",
          }}
        />

        {/* Score */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 24,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            {mounted && (
              <div
                className="readiness-score"
                style={{
                  fontFamily: "var(--sans)",
                  fontSize: 96,
                  fontWeight: 900,
                  color: readiness.color,
                  lineHeight: 1,
                  letterSpacing: "-5px",
                  textShadow: `0 0 60px ${readiness.color}50, 0 0 120px ${readiness.color}25`,
                  animation: "scoreIn 0.5s cubic-bezier(0.34,1.56,0.64,1)",
                  transition: "color 0.3s",
                }}
              >
                {readiness.score.toFixed(1)}
              </div>
            )}
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.35)",
                letterSpacing: "3px",
                textTransform: "uppercase",
                marginTop: 6,
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
                letterSpacing: "1.5px",
                marginTop: 4,
              }}
            >
              {readiness.label}
            </div>
          </div>
          <div
            style={{
              padding: "6px 14px",
              borderRadius: 99,
              marginTop: 14,
              background: `${readiness.color}15`,
              border: `1px solid ${readiness.color}35`,
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: readiness.color,
              letterSpacing: "1px",
              textTransform: "uppercase",
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
            gap: 12,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.55)",
              width: 90,
              minWidth: 90,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              fontFamily: "var(--mono)",
              flexShrink: 0,
            }}
          >
            Sleep Hrs
          </span>
          <input
            type="range"
            min={0}
            max={12}
            step={0.5}
            value={sleepHours}
            onChange={(e) => setSleepHours(parseFloat(e.target.value))}
            data-color="yellow"
            style={{ flex: 1, minWidth: 0 }}
          />
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 14,
              fontWeight: 700,
              width: 28,
              textAlign: "right",
              color: "#E8FF47",
              flexShrink: 0,
            }}
          >
            {sleepHours}
          </span>
        </div>

        {/* Metric sliders */}
        {SLIDERS.map((slider) => (
          <div
            key={slider.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.55)",
                width: 90,
                minWidth: 90,
                textTransform: "uppercase",
                letterSpacing: "0.8px",
                fontFamily: "var(--mono)",
                flexShrink: 0,
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
              data-color={slider.dataColor}
              style={{ flex: 1, minWidth: 0 }}
            />
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 14,
                fontWeight: 700,
                width: 28,
                textAlign: "right",
                color: slider.color,
                flexShrink: 0,
              }}
            >
              {vals[slider.key]}
            </span>
          </div>
        ))}

        {/* Notes */}
        <div style={{ marginBottom: 16, marginTop: 8 }}>
          <label
            style={{
              display: "block",
              fontSize: 9,
              color: "rgba(255,255,255,0.35)",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              marginBottom: 8,
              fontFamily: "var(--mono)",
            }}
          >
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth noting today..."
            style={{
              width: "100%",
              padding: "11px 16px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              color: "rgba(255,255,255,0.8)",
              outline: "none",
              fontFamily: "var(--mono)",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: "13px 28px",
              borderRadius: 10,
              background: "var(--accent)",
              color: "#000",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
              boxShadow:
                "0 4px 20px rgba(232,255,71,0.3), 0 0 40px rgba(232,255,71,0.1)",
              transition: "all 0.2s",
              fontFamily: "var(--sans)",
            }}
          >
            {saving
              ? "Saving..."
              : alreadyChecked
                ? "Update Check-in"
                : "Log Check-in"}
          </button>
          {saved && (
            <span
              style={{
                fontSize: 11,
                color: "var(--green)",
                fontFamily: "var(--mono)",
                letterSpacing: "1px",
              }}
            >
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 18,
            position: "relative",
            overflow: "hidden",
            backdropFilter: "blur(20px)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: "linear-gradient(90deg,#E8FF47,#00E676)",
              borderRadius: "16px 16px 0 0",
            }}
          />
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 24,
              fontWeight: 700,
              color: "#E8FF47",
              marginBottom: 4,
            }}
          >
            {streak > 0 ? `${streak}` : "—"}
          </div>
          <div
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
            }}
          >
            Check-in Streak
          </div>
        </div>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 18,
            position: "relative",
            overflow: "hidden",
            backdropFilter: "blur(20px)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: "linear-gradient(90deg,#00E676,#10B981)",
              borderRadius: "16px 16px 0 0",
            }}
          />
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 24,
              fontWeight: 700,
              color: "#00E676",
              marginBottom: 4,
            }}
          >
            {weight ? `${weight} kg` : "—"}
          </div>
          <div
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
            }}
          >
            Current Weight
          </div>
        </div>
      </div>

      {/* Nudge */}
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
