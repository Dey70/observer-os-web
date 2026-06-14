"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  PageHeader,
  SectionLabel,
  Button,
  Field,
  Input,
  Select,
  EmptyState,
} from "@/components/ui";
import type { Goal, TrainingPlan } from "@/types";

export const dynamic = "force-dynamic";

const GOAL_TYPES = [
  { value: "weight", label: "Body Weight", unit: "kg" },
  { value: "sleep", label: "Sleep Duration", unit: "hrs" },
  { value: "sessions_per_week", label: "Sessions / Week", unit: "sessions" },
  { value: "run_distance", label: "Weekly Run (km)", unit: "km" },
  { value: "custom", label: "Custom Goal", unit: "" },
];

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export default function GoalsPage() {
  const sb = createClient();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [goalType, setGoalType] = useState("weight");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [unit, setUnit] = useState("kg");
  const [deadline, setDeadline] = useState("");

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const weekStart = getWeekStart();
    const [{ data: g }, { data: p }] = await Promise.all([
      sb
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("created_at", { ascending: false }),
      (sb as any)
        .from("training_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("week_start", weekStart)
        .maybeSingle(),
    ]);
    setGoals((g ?? []) as Goal[]);
    setPlan(p as TrainingPlan | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function onTypeChange(val: string) {
    setGoalType(val);
    const preset = GOAL_TYPES.find((t) => t.value === val);
    if (preset) {
      setUnit(preset.unit);
      setTitle(preset.label);
    }
  }

  async function saveGoal() {
    if (!title || !target) return;
    setSaving(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    await (sb as any).from("goals").insert({
      user_id: user.id,
      type: goalType,
      title,
      target_value: parseFloat(target),
      current_value: parseFloat(current) || 0,
      unit,
      deadline: deadline || null,
      active: true,
    });
    setSaving(false);
    setShowForm(false);
    setTitle("");
    setTarget("");
    setCurrent("");
    setDeadline("");
    load();
  }

  async function archiveGoal(id: number) {
    await (sb as any).from("goals").update({ active: false }).eq("id", id);
    load();
  }

  const typeColors: Record<string, string> = {
    run: "var(--green)",
    lift: "var(--purple)",
    study: "var(--yellow)",
    rest: "var(--text-muted)",
    cross: "var(--accent)",
  };

  if (loading)
    return (
      <div>
        <PageHeader title="GOALS" subtitle="Track your targets" />
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
        title="GOALS"
        subtitle="Set targets · track progress · let the coach generate plans"
        right={
          <Button onClick={() => setShowForm((f) => !f)}>
            {showForm ? "Cancel" : "+ New Goal"}
          </Button>
        }
      />

      {showForm && (
        <Card style={{ borderColor: "var(--accent)" }}>
          <SectionLabel>New Goal</SectionLabel>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px" }}>
              <Field label="Goal Type">
                <Select
                  value={goalType}
                  onChange={(e) => onTypeChange(e.target.value)}
                >
                  {GOAL_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div style={{ flex: "2 1 200px" }}>
              <Field label="Title">
                <Input
                  placeholder="e.g. Reach 70kg body weight"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 100px" }}>
              <Field label={`Target (${unit || "value"})`}>
                <Input
                  type="number"
                  step={0.1}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: "1 1 100px" }}>
              <Field label={`Current (${unit || "value"})`}>
                <Input
                  type="number"
                  step={0.1}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </Field>
            </div>
            {goalType === "custom" && (
              <div style={{ flex: "0 0 80px" }}>
                <Field label="Unit">
                  <Input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </Field>
              </div>
            )}
            <div style={{ flex: "1 1 140px" }}>
              <Field label="Deadline (optional)">
                <Input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <Button onClick={saveGoal} disabled={saving || !title || !target}>
            {saving ? "Saving..." : "Save Goal"}
          </Button>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Active Goals</SectionLabel>
        {goals.length === 0 ? (
          <EmptyState message="No active goals — add one above or ask the Coach to set goals for you" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {goals.map((g) => {
              const pct = Math.min(
                100,
                Math.round((g.current_value / g.target_value) * 100),
              );
              return (
                <div
                  key={g.id}
                  style={{
                    padding: 16,
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {g.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginTop: 2,
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {g.current_value} / {g.target_value} {g.unit}
                        {g.deadline && ` · by ${g.deadline}`}
                      </div>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 20,
                          fontWeight: 700,
                          color: pct >= 100 ? "var(--green)" : "var(--accent)",
                        }}
                      >
                        {pct}%
                      </span>
                      <button
                        onClick={() => archiveGoal(g.id)}
                        style={{
                          fontSize: 10,
                          color: "var(--text-dim)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                  <div style={{ height: 3, background: "var(--border2)" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background:
                          pct >= 100 ? "var(--green)" : "var(--accent)",
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>This Week&apos;s Training Plan</SectionLabel>
        {!plan ? (
          <EmptyState message="No plan for this week — ask the Coach to generate one for you" />
        ) : (
          <>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 16,
                fontFamily: "var(--mono)",
              }}
            >
              {plan.notes} · Generated{" "}
              {new Date(plan.generated_at).toLocaleDateString()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(plan.plan as any[]).map((day: any, i: number) => {
                const isToday =
                  day.date === new Date().toISOString().split("T")[0];
                return (
                  <div
                    key={i}
                    style={{
                      padding: "12px 16px",
                      background: isToday
                        ? "var(--accent-dim)"
                        : "var(--surface2)",
                      border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 80 }}>
                      <div
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 11,
                          color: isToday
                            ? "var(--accent)"
                            : "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {day.day}
                      </div>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 9,
                          letterSpacing: "0.1em",
                          padding: "2px 6px",
                          border: `1px solid ${typeColors[day.type] ?? "var(--border)"}`,
                          color: typeColors[day.type] ?? "var(--text-muted)",
                          textTransform: "uppercase",
                          marginTop: 4,
                          display: "inline-block",
                        }}
                      >
                        {day.type}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {day.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        {day.description}
                      </div>
                      {day.target_rpe && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-dim)",
                            fontFamily: "var(--mono)",
                            marginTop: 4,
                          }}
                        >
                          Target RPE: {day.target_rpe}/10
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
