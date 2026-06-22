// src/app/(app)/profile/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  PageHeader,
  Button,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { useNotifications } from "@/hooks/useNotifications";
import { calcBMI, bmiCategory } from "@/lib/nutritionEngine";

export const dynamic = "force-dynamic";

const SPLITS = [
  { value: "balanced", label: "Balanced (Run + Lift + Study)" },
  { value: "running", label: "Running focused" },
  { value: "strength", label: "Strength focused" },
  { value: "study_heavy", label: "Study heavy" },
  { value: "deload", label: "Deload / Recovery" },
];

const NUTRITION_GOALS = [
  { value: "maintain", label: "Maintain weight" },
  { value: "bulk", label: "Build muscle (surplus)" },
  { value: "cut", label: "Fat loss (deficit)" },
  { value: "recomp", label: "Recomposition" },
  { value: "endurance", label: "Endurance performance" },
];

const BMI_CATEGORY_LABEL: Record<string, { label: string; color: string }> = {
  underweight: { label: "Underweight", color: "var(--yellow)" },
  normal: { label: "Normal", color: "var(--green)" },
  overweight: { label: "Overweight", color: "var(--yellow)" },
  obese: { label: "Obese", color: "var(--red)" },
};

async function geocodeCity(
  cityQuery: string,
): Promise<{ lat: number; lon: number; name: string } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery)}&count=1`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return null;
    const parts = [result.name, result.admin1, result.country].filter(Boolean);
    return {
      lat: result.latitude,
      lon: result.longitude,
      name: parts.join(", "),
    };
  } catch {
    return null;
  }
}

export default function ProfilePage() {
  const sb = createClient();
  const {
    supported,
    permission,
    enabled,
    enable,
    disable,
    sendTestNotification,
  } = useNotifications();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [split, setSplit] = useState("balanced");
  const [weeklyGoal, setWeeklyGoal] = useState("4");
  const [targetWeight, setTargetWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [heightCm, setHeightCm] = useState("");
  const [nutritionGoalType, setNutritionGoalType] = useState("maintain");
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [weeklyRunKm, setWeeklyRunKm] = useState("");
  const [weeklyRunCount, setWeeklyRunCount] = useState("");
  const [weeklyGym, setWeeklyGym] = useState("");
  const [thresholdPaceInput, setThresholdPaceInput] = useState("5:30");
  const [city, setCity] = useState("");
  const [storedLat, setStoredLat] = useState<number | null>(null);
  const [storedLon, setStoredLon] = useState<number | null>(null);
  const [resolvedLocation, setResolvedLocation] = useState<string | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifLoading, setNotifLoading] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    setEmail(user.email ?? "");

    const [{ data: raw }, { data: rawWeights }] = await Promise.all([
      sb.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      sb
        .from("weight_logs")
        .select("weight")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(1),
    ]);

    const data = raw as {
      name: string | null;
      age: number | null;
      split: string;
      weekly_goal: number;
      target_weight: number | null;
      notes: string | null;
      sex: "male" | "female" | null;
      height_cm: number | null;
      nutrition_goal_type: string | null;
      latitude: number | null;
      longitude: number | null;
      city_name: string | null;
      weekly_run_km_target: number | null;
      weekly_run_count_target: number | null;
      weekly_gym_target: number | null;
      threshold_pace_seconds: number | null;
    } | null;
    if (data) {
      setName(data.name ?? "");
      setAge(data.age?.toString() ?? "");
      setSplit(data.split ?? "balanced");
      setWeeklyGoal(data.weekly_goal?.toString() ?? "4");
      setTargetWeight(data.target_weight?.toString() ?? "");
      setNotes(data.notes ?? "");
      setSex(data.sex ?? "male");
      setHeightCm(data.height_cm?.toString() ?? "");
      setNutritionGoalType(data.nutrition_goal_type ?? "maintain");
      setCity(data.city_name ?? "");
      setStoredLat(data.latitude ?? null);
      setStoredLon(data.longitude ?? null);
      setResolvedLocation(data.city_name ?? null);
      setWeeklyRunKm(data.weekly_run_km_target?.toString() ?? "");
      setWeeklyRunCount(data.weekly_run_count_target?.toString() ?? "");
      setWeeklyGym(data.weekly_gym_target?.toString() ?? "");
      const secs = data.threshold_pace_seconds ?? 330;
      setThresholdPaceInput(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`);
    }

    const weights = (rawWeights ?? []) as { weight: number }[];
    setCurrentWeight(weights.length ? weights[0].weight : null);

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setGeocodeError(null);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    let latitude = storedLat;
    let longitude = storedLon;
    let cityName: string | null = resolvedLocation;

    if (!city.trim()) {
      latitude = null;
      longitude = null;
      cityName = null;
    } else {
      const geo = await geocodeCity(city.trim());
      if (geo) {
        latitude = geo.lat;
        longitude = geo.lon;
        cityName = geo.name;
      } else {
        setGeocodeError(
          "Couldn't resolve that location just now — keeping your previously saved location (if any) for weather-adjusted hydration.",
        );
      }
    }

    const paceParts = thresholdPaceInput.split(":");
    const paceMinutes = parseInt(paceParts[0] ?? "5") || 5;
    const paceSeconds = parseInt(paceParts[1] ?? "30") || 0;
    const thresholdSecs = paceMinutes * 60 + paceSeconds;

    await (sb as any).from("profiles").upsert(
      {
        user_id: user.id,
        name: name.trim() || null,
        age: age ? parseInt(age) : null,
        split,
        weekly_goal: parseInt(weeklyGoal) || 4,
        target_weight: targetWeight ? parseFloat(targetWeight) : null,
        notes: notes.trim() || null,
        sex,
        height_cm: heightCm ? parseFloat(heightCm) : null,
        nutrition_goal_type: nutritionGoalType,
        latitude,
        longitude,
        city_name: cityName,
        weekly_run_km_target: weeklyRunKm ? parseFloat(weeklyRunKm) : 0,
        weekly_run_count_target: weeklyRunCount ? parseInt(weeklyRunCount) : 0,
        weekly_gym_target: weeklyGym ? parseInt(weeklyGym) : 0,
        threshold_pace_seconds: thresholdSecs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    setStoredLat(latitude);
    setStoredLon(longitude);
    setResolvedLocation(cityName);
    setCity(cityName ?? "");

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function toggleNotifications() {
    setNotifLoading(true);
    if (enabled) disable();
    else await enable();
    setNotifLoading(false);
  }

  if (loading)
    return (
      <div>
        <PageHeader title="PROFILE" subtitle="Your athlete profile" />
        <div
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--mono)",
            fontSize: 13,
          }}
        >
          Loading...
        </div>
      </div>
    );

  const heightNum = heightCm ? parseFloat(heightCm) : null;
  const bmi =
    heightNum && currentWeight ? calcBMI(currentWeight, heightNum) : null;
  const bmiInfo = bmi !== null ? BMI_CATEGORY_LABEL[bmiCategory(bmi)] : null;

  return (
    <div>
      <PageHeader
        title="PROFILE"
        subtitle="The coach reads this before every response"
      />

      <Card>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          Account
        </div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 13,
            color: "var(--text-muted)",
            marginBottom: 24,
            padding: "10px 12px",
            background: "var(--bg)",
            border: "1px solid var(--border2)",
            wordBreak: "break-all",
          }}
        >
          {email}
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          Identity
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 4,
          }}
        >
          <div style={{ flex: "2 1 160px" }}>
            <Field label="Name">
              <Input
                placeholder="Rajdeep"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <div style={{ flex: "0 0 90px" }}>
            <Field label="Age">
              <Input
                type="number"
                placeholder="21"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 120px" }}>
            <Field label="Sex (for BMR calc)">
              <Select
                value={sex}
                onChange={(e) => setSex(e.target.value as "male" | "female")}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </Select>
            </Field>
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <Field label="Height (cm)">
              <Input
                type="number"
                placeholder="178"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div
          style={{
            marginTop: 4,
            marginBottom: 8,
            padding: "12px 14px",
            background: "var(--surface2)",
            border: "1px solid var(--border2)",
            borderRadius: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                color: "var(--text-dim)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontFamily: "var(--mono)",
                marginBottom: 4,
              }}
            >
              Current Weight
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 18,
                fontWeight: 700,
                color: currentWeight ? "var(--text)" : "var(--text-dim)",
              }}
            >
              {currentWeight ? `${currentWeight} kg` : "Not logged yet"}
            </div>
            <div
              style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}
            >
              Logged on the Dashboard — most recent entry shown here
            </div>
          </div>
          {bmi !== null && bmiInfo ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 99,
                border: `1px solid ${bmiInfo.color}`,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 14,
                  fontWeight: 700,
                  color: bmiInfo.color,
                }}
              >
                BMI {bmi}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: bmiInfo.color,
                  fontFamily: "var(--mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {bmiInfo.label}
              </span>
            </div>
          ) : (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-dim)",
                fontFamily: "var(--mono)",
              }}
            >
              Add height + log weight to see BMI
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-dim)",
            marginBottom: 8,
            fontFamily: "var(--mono)",
            lineHeight: 1.5,
          }}
        >
          BMI is a rough screening number — it doesn't separate muscle from fat,
          so it can read high for muscular athletes. Treat it as a reference
          point, not a target.
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 16,
            marginTop: 8,
          }}
        >
          Training
        </div>
        <Field label="Training Split">
          <Select value={split} onChange={(e) => setSplit(e.target.value)}>
            {SPLITS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 120px" }}>
            <Field label="Weekly Session Goal">
              <Input
                type="number"
                min={1}
                max={14}
                placeholder="4"
                value={weeklyGoal}
                onChange={(e) => setWeeklyGoal(e.target.value)}
              />
            </Field>
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <Field label="Target Weight (kg)">
              <Input
                type="number"
                step={0.1}
                placeholder="70.0"
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 16,
            marginTop: 24,
          }}
        >
          Running Goals
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 110px" }}>
            <Field label="Weekly km target">
              <Input
                type="number"
                step={0.5}
                min={0}
                placeholder="30"
                value={weeklyRunKm}
                onChange={(e) => setWeeklyRunKm(e.target.value)}
              />
            </Field>
          </div>
          <div style={{ flex: "1 1 110px" }}>
            <Field label="Weekly runs target">
              <Input
                type="number"
                min={0}
                max={14}
                placeholder="4"
                value={weeklyRunCount}
                onChange={(e) => setWeeklyRunCount(e.target.value)}
              />
            </Field>
          </div>
          <div style={{ flex: "1 1 110px" }}>
            <Field label="Weekly gym target">
              <Input
                type="number"
                min={0}
                max={14}
                placeholder="3"
                value={weeklyGym}
                onChange={(e) => setWeeklyGym(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <Field label="Threshold pace (MM:SS /km)">
          <Input
            type="text"
            placeholder="5:30"
            value={thresholdPaceInput}
            onChange={(e) => setThresholdPaceInput(e.target.value)}
          />
        </Field>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            marginBottom: 4,
            fontFamily: "var(--mono)",
            lineHeight: 1.5,
          }}
        >
          Threshold pace is used to calculate TSS (Training Stress Score) for your Strava runs. Default 5:30/km.
          Weekly goals appear as progress bars on the Dashboard.
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 16,
            marginTop: 8,
          }}
        >
          Nutrition
        </div>
        <Field label="Nutrition Goal">
          <Select
            value={nutritionGoalType}
            onChange={(e) => setNutritionGoalType(e.target.value)}
          >
            {NUTRITION_GOALS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            marginBottom: 4,
            fontFamily: "var(--mono)",
          }}
        >
          Used with your current weight, height, and today's sessions to
          calculate daily calorie, macro, and water targets on the Nutrition
          page.
        </div>

        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 16,
            marginTop: 24,
          }}
        >
          Location
        </div>
        <Field label="City (for weather-adjusted hydration)">
          <Input
            placeholder="e.g. Bengaluru"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </Field>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            marginBottom: 8,
            fontFamily: "var(--mono)",
            lineHeight: 1.5,
          }}
        >
          On hot days your water target gets bumped up automatically (+250 to
          +750ml depending on temperature). Leave this blank to skip the weather
          adjustment entirely.
        </div>
        {resolvedLocation && (
          <div
            style={{
              fontSize: 11,
              color: "var(--green)",
              marginBottom: 4,
              fontFamily: "var(--mono)",
            }}
          >
            Currently resolved to: {resolvedLocation}
          </div>
        )}
        {geocodeError && (
          <div
            style={{
              fontSize: 11,
              color: "var(--yellow)",
              marginBottom: 4,
              fontFamily: "var(--mono)",
            }}
          >
            {geocodeError}
          </div>
        )}

        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 16,
            marginTop: 24,
          }}
        >
          Notes for the Coach
        </div>
        <Field label="Anything the coach should always know">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. I have a 10K race in 6 weeks..."
            rows={4}
            style={{
              width: "100%",
              padding: "9px 12px",
              background: "var(--bg)",
              border: "1px solid var(--border2)",
              color: "var(--text)",
              outline: "none",
              fontFamily: "var(--sans)",
              fontSize: 13,
              resize: "vertical",
              lineHeight: 1.6,
              boxSizing: "border-box",
            }}
          />
        </Field>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Profile"}
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

      <Card>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          Notifications
        </div>
        {!supported ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Your browser doesn&apos;t support push notifications.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text)",
                    marginBottom: 4,
                  }}
                >
                  Daily reminders
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  8 AM check-in · 8 PM session log
                </div>
              </div>
              <button
                onClick={toggleNotifications}
                disabled={notifLoading}
                style={{
                  width: 48,
                  height: 26,
                  borderRadius: 13,
                  background: enabled ? "var(--accent)" : "var(--border2)",
                  border: "none",
                  cursor: notifLoading ? "not-allowed" : "pointer",
                  position: "relative",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#000",
                    position: "absolute",
                    top: 3,
                    left: enabled ? 25 : 3,
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
            {permission === "denied" && (
              <div
                style={{ fontSize: 12, color: "var(--red)", marginBottom: 12 }}
              >
                Notifications blocked in browser settings.
              </div>
            )}
            {enabled && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => sendTestNotification("checkin")}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--border2)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                    background: "none",
                    cursor: "pointer",
                  }}
                >
                  Test check-in
                </button>
                <button
                  onClick={() => sendTestNotification("session")}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--border2)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                    background: "none",
                    cursor: "pointer",
                  }}
                >
                  Test session
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
