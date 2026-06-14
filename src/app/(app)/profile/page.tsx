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

export const dynamic = "force-dynamic";

const SPLITS = [
  { value: "balanced", label: "Balanced (Run + Lift + Study)" },
  { value: "running", label: "Running focused" },
  { value: "strength", label: "Strength focused" },
  { value: "study_heavy", label: "Study heavy" },
  { value: "deload", label: "Deload / Recovery" },
];

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
    const { data: raw } = await sb
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    const data = raw as {
      name: string | null;
      age: number | null;
      split: string;
      weekly_goal: number;
      target_weight: number | null;
      notes: string | null;
    } | null;
    if (data) {
      setName(data.name ?? "");
      setAge(data.age?.toString() ?? "");
      setSplit(data.split ?? "balanced");
      setWeeklyGoal(data.weekly_goal?.toString() ?? "4");
      setTargetWeight(data.target_weight?.toString() ?? "");
      setNotes(data.notes ?? "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    await (sb as any).from("profiles").upsert(
      {
        user_id: user.id,
        name: name.trim() || null,
        age: age ? parseInt(age) : null,
        split,
        weekly_goal: parseInt(weeklyGoal) || 4,
        target_weight: targetWeight ? parseFloat(targetWeight) : null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
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
          <div style={{ flex: "2 1 200px" }}>
            <Field label="Name">
              <Input
                placeholder="Rajdeep"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <div style={{ flex: "0 0 100px" }}>
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
          Training Preferences
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 4,
          }}
        >
          <div style={{ flex: "2 1 200px" }}>
            <Field label="Training Split">
              <Select value={split} onChange={(e) => setSplit(e.target.value)}>
                {SPLITS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div style={{ flex: "0 0 140px" }}>
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
          <div style={{ flex: "0 0 140px" }}>
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
            marginTop: 8,
          }}
        >
          Notes for the Coach
        </div>
        <Field label="Anything the coach should always know">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. I have a 10K race in 6 weeks. I struggle with lower body soreness after leg days..."
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
            }}
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
              ✓ Saved — coach will use this from now on
            </span>
          )}
        </div>
      </Card>

      {/* Notifications */}
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
            Your browser doesn't support push notifications. Try Chrome on
            desktop or Android.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div>
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
                  8:00 AM — check-in reminder · 8:00 PM — session log reminder
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
                Notifications blocked. Go to browser Settings → Site Settings →
                Notifications → allow this site.
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
                  Test check-in reminder
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
                  Test session reminder
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* How coach uses profile */}
      <Card style={{ borderColor: "var(--accent-dim)" }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          How the coach uses your profile
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["Name", "Personalizes responses"],
            [
              "Age",
              "Adjusts recovery expectations and training recommendations",
            ],
            [
              "Training split",
              "Informs training plan generation and session recommendations",
            ],
            ["Weekly goal", "Used to assess whether you're on track each week"],
            [
              "Target weight",
              "Referenced when discussing body composition trends",
            ],
            [
              "Coach notes",
              "Permanent context — injury history, upcoming events, constraints",
            ],
          ].map(([key, val]) => (
            <div key={key} style={{ display: "flex", gap: 16, fontSize: 12 }}>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  color: "var(--accent)",
                  width: 120,
                  flexShrink: 0,
                }}
              >
                {key}
              </span>
              <span style={{ color: "var(--text-muted)" }}>{val}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
