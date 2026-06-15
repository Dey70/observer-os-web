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
import { Pencil, Trash2, Check, X, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

const GOAL_TYPES = [
  { value: "weight", label: "Body Weight", unit: "kg", direction: "decrease" },
  {
    value: "sleep",
    label: "Sleep Duration",
    unit: "hrs",
    direction: "increase",
  },
  {
    value: "sessions_per_week",
    label: "Sessions / Week",
    unit: "sessions",
    direction: "increase",
  },
  {
    value: "run_distance",
    label: "Weekly Run (km)",
    unit: "km",
    direction: "increase",
  },
  { value: "custom", label: "Custom Goal", unit: "", direction: "increase" },
];

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

type EditState = {
  id: number;
  title: string;
  target_value: number;
  current_value: number;
  unit: string;
  deadline: string;
  direction: "increase" | "decrease";
};

export default function GoalsPage() {
  const sb = createClient();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // New goal form
  const [goalType, setGoalType] = useState("weight");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [unit, setUnit] = useState("kg");
  const [deadline, setDeadline] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">(
    "increase",
  );

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      setDirection(preset.direction as "increase" | "decrease");
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
      direction,
    });
    setSaving(false);
    setShowForm(false);
    setTitle("");
    setTarget("");
    setCurrent("");
    setDeadline("");
    load();
  }

  function startEdit(g: Goal) {
    setConfirmDeleteId(null);
    setEditingId(g.id);
    setEditState({
      id: g.id,
      title: g.title,
      target_value: g.target_value,
      current_value: g.current_value,
      unit: g.unit,
      deadline: g.deadline ?? "",
      direction: (g as any).direction ?? "increase",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditState(null);
  }

  async function saveEdit() {
    if (!editState) return;
    setEditSaving(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setEditSaving(false);
      return;
    }
    await (sb as any)
      .from("goals")
      .update({
        title: editState.title,
        target_value: editState.target_value,
        current_value: editState.current_value,
        unit: editState.unit,
        deadline: editState.deadline || null,
        direction: editState.direction,
      })
      .eq("id", editState.id)
      .eq("user_id", user.id);
    setEditSaving(false);
    setEditingId(null);
    setEditState(null);
    load();
  }

  async function completeGoal(id: number) {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    await (sb as any)
      .from("goals")
      .update({ active: false })
      .eq("id", id)
      .eq("user_id", user.id);
    load();
  }

  async function deleteGoal(id: number) {
    setDeleting(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setDeleting(false);
      return;
    }
    await (sb as any)
      .from("goals")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    setDeleting(false);
    setConfirmDeleteId(null);
    load();
  }

  const typeColors: Record<string, string> = {
    run: "var(--green)",
    lift: "var(--purple)",
    study: "var(--yellow)",
    rest: "var(--text-muted)",
    cross: "var(--accent)",
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px",
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text)",
    outline: "none",
    fontFamily: "var(--mono)",
    fontSize: 12,
    width: "100%",
    boxSizing: "border-box",
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
        subtitle="Set targets · track progress"
        right={
          <Button onClick={() => setShowForm((f) => !f)}>
            {showForm ? "Cancel" : "+ New Goal"}
          </Button>
        }
      />

      {/* New Goal Form */}
      {showForm && (
        <Card style={{ borderColor: "var(--accent)", marginBottom: 16 }}>
          <SectionLabel>New Goal</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            <Field label="Title">
              <Input
                placeholder="e.g. Reach 70kg body weight"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <Field label={`Target (${unit || "value"})`}>
                <Input
                  type="number"
                  step={0.1}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </Field>
              <Field label={`Current (${unit || "value"})`}>
                <Input
                  type="number"
                  step={0.1}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Direction">
              <Select
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as "increase" | "decrease")
                }
              >
                <option value="increase">↑ Increase (higher is better)</option>
                <option value="decrease">↓ Decrease (lower is better)</option>
              </Select>
            </Field>
            <Field label="Deadline (optional)">
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </Field>
          </div>
          <Button
            onClick={saveGoal}
            disabled={saving || !title || !target}
            style={{ marginTop: 12 }}
          >
            {saving ? "Saving..." : "Save Goal"}
          </Button>
        </Card>
      )}

      {/* Active Goals */}
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Active Goals ({goals.length})</SectionLabel>
        {goals.length === 0 ? (
          <EmptyState message="No active goals — add one above or ask the Coach to set goals for you" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {goals.map((g) => {
              const dir = (g as any).direction ?? "increase";
              const pct =
                dir === "decrease"
                  ? Math.min(
                      100,
                      Math.max(
                        0,
                        Math.round(
                          g.current_value - g.target_value <= 0 ? 100 : 0,
                        ),
                      ),
                    )
                  : Math.min(
                      100,
                      Math.round((g.current_value / g.target_value) * 100),
                    );
              // For decrease goals: 100% when current <= target, 0% when at start
              // We approximate using how close current is to target vs initial
              const pctDisplay =
                dir === "decrease"
                  ? g.current_value <= g.target_value
                    ? 100
                    : Math.max(
                        0,
                        Math.round(
                          (1 -
                            (g.current_value - g.target_value) /
                              g.target_value) *
                            100,
                        ),
                      )
                  : Math.min(
                      100,
                      Math.round((g.current_value / g.target_value) * 100),
                    );
              const isComplete = pctDisplay >= 100;
              const isEditing = editingId === g.id;
              const isConfirmingDelete = confirmDeleteId === g.id;

              // Days remaining
              const daysLeft = g.deadline
                ? Math.ceil(
                    (new Date(g.deadline).getTime() - Date.now()) / 86400000,
                  )
                : null;

              return (
                <div key={g.id}>
                  {/* Goal card */}
                  <div
                    style={{
                      padding: 16,
                      background: "var(--surface2)",
                      border: `1px solid ${isEditing ? "rgba(232,255,71,0.3)" : isComplete ? "rgba(0,230,118,0.25)" : "var(--border)"}`,
                      borderRadius:
                        isEditing || isConfirmingDelete ? "12px 12px 0 0" : 12,
                      transition: "all 0.15s",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 12,
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "var(--text)",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          {isComplete && (
                            <CheckCircle2
                              size={15}
                              color="var(--green)"
                              strokeWidth={2}
                            />
                          )}
                          {g.title}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            marginTop: 3,
                            fontFamily: "var(--mono)",
                            display: "flex",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <span>
                            {g.current_value} / {g.target_value} {g.unit}
                          </span>
                          {daysLeft !== null && (
                            <span
                              style={{
                                color:
                                  daysLeft < 7
                                    ? "var(--red)"
                                    : daysLeft < 30
                                      ? "var(--yellow)"
                                      : "var(--text-dim)",
                              }}
                            >
                              {daysLeft > 0
                                ? `${daysLeft}d left`
                                : daysLeft === 0
                                  ? "Due today"
                                  : `${Math.abs(daysLeft)}d overdue`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 20,
                            fontWeight: 700,
                            color: isComplete
                              ? "var(--green)"
                              : "var(--accent)",
                          }}
                        >
                          {pctDisplay}%
                        </span>
                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={() =>
                              isEditing ? cancelEdit() : startEdit(g)
                            }
                            title="Edit goal"
                            style={{
                              width: 28,
                              height: 28,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: isEditing
                                ? "rgba(232,255,71,0.1)"
                                : "rgba(255,255,255,0.05)",
                              border: `1px solid ${isEditing ? "rgba(232,255,71,0.3)" : "var(--border)"}`,
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            {isEditing ? (
                              <X size={12} color="#E8FF47" strokeWidth={2} />
                            ) : (
                              <Pencil
                                size={12}
                                color="var(--text-muted)"
                                strokeWidth={1.75}
                              />
                            )}
                          </button>
                          <button
                            onClick={() => completeGoal(g.id)}
                            title="Mark complete"
                            style={{
                              width: 28,
                              height: 28,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(0,230,118,0.06)",
                              border: "1px solid rgba(0,230,118,0.2)",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            <Check
                              size={12}
                              color="var(--green)"
                              strokeWidth={2.5}
                            />
                          </button>
                          <button
                            onClick={() => {
                              if (isEditing) cancelEdit();
                              setConfirmDeleteId(
                                isConfirmingDelete ? null : g.id,
                              );
                            }}
                            title="Delete goal"
                            style={{
                              width: 28,
                              height: 28,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: isConfirmingDelete
                                ? "rgba(255,68,68,0.1)"
                                : "rgba(255,255,255,0.05)",
                              border: `1px solid ${isConfirmingDelete ? "rgba(255,68,68,0.3)" : "var(--border)"}`,
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            <Trash2
                              size={12}
                              color={
                                isConfirmingDelete
                                  ? "var(--red)"
                                  : "var(--text-muted)"
                              }
                              strokeWidth={1.75}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div
                      style={{
                        height: 4,
                        background: "var(--border2)",
                        borderRadius: 99,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pctDisplay}%`,
                          background: isComplete
                            ? "var(--green)"
                            : pctDisplay > 66
                              ? "var(--accent)"
                              : pctDisplay > 33
                                ? "var(--yellow)"
                                : "var(--red)",
                          borderRadius: 99,
                          transition: "width 0.4s ease, background 0.3s",
                        }}
                      />
                    </div>
                  </div>

                  {/* Delete confirmation */}
                  {isConfirmingDelete && !isEditing && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: "rgba(255,68,68,0.06)",
                        border: "1px solid rgba(255,68,68,0.2)",
                        borderTop: "none",
                        borderRadius: "0 0 12px 12px",
                        gap: 8,
                        animation: "fadeIn 0.15s ease-out",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        Delete this goal permanently?
                      </span>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{
                            padding: "5px 12px",
                            fontSize: 11,
                            fontFamily: "var(--mono)",
                            background: "var(--surface2)",
                            border: "1px solid var(--border)",
                            color: "var(--text-muted)",
                            borderRadius: 5,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => deleteGoal(g.id)}
                          disabled={deleting}
                          style={{
                            padding: "5px 12px",
                            fontSize: 11,
                            fontFamily: "var(--mono)",
                            background: "rgba(255,68,68,0.15)",
                            border: "1px solid rgba(255,68,68,0.35)",
                            color: "var(--red)",
                            borderRadius: 5,
                            cursor: deleting ? "not-allowed" : "pointer",
                            opacity: deleting ? 0.6 : 1,
                          }}
                        >
                          {deleting ? "..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Edit panel */}
                  {isEditing && editState && (
                    <div
                      style={{
                        padding: "14px",
                        background: "rgba(232,255,71,0.025)",
                        border: "1px solid rgba(232,255,71,0.15)",
                        borderTop: "none",
                        borderRadius: "0 0 12px 12px",
                        animation: "fadeIn 0.15s ease-out",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 8,
                              color: "var(--text-dim)",
                              letterSpacing: "1.5px",
                              textTransform: "uppercase",
                              marginBottom: 4,
                              fontFamily: "var(--mono)",
                            }}
                          >
                            Title
                          </label>
                          <input
                            value={editState.title}
                            onChange={(e) =>
                              setEditState({
                                ...editState,
                                title: e.target.value,
                              })
                            }
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 8,
                              color: "var(--text-dim)",
                              letterSpacing: "1.5px",
                              textTransform: "uppercase",
                              marginBottom: 4,
                              fontFamily: "var(--mono)",
                            }}
                          >
                            Unit
                          </label>
                          <input
                            value={editState.unit}
                            onChange={(e) =>
                              setEditState({
                                ...editState,
                                unit: e.target.value,
                              })
                            }
                            style={inputStyle}
                          />
                        </div>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: 8,
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 8,
                              color: "var(--text-dim)",
                              letterSpacing: "1.5px",
                              textTransform: "uppercase",
                              marginBottom: 4,
                              fontFamily: "var(--mono)",
                            }}
                          >
                            Current
                          </label>
                          <input
                            type="number"
                            step={0.1}
                            value={editState.current_value}
                            onChange={(e) =>
                              setEditState({
                                ...editState,
                                current_value: parseFloat(e.target.value) || 0,
                              })
                            }
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 8,
                              color: "var(--text-dim)",
                              letterSpacing: "1.5px",
                              textTransform: "uppercase",
                              marginBottom: 4,
                              fontFamily: "var(--mono)",
                            }}
                          >
                            Target
                          </label>
                          <input
                            type="number"
                            step={0.1}
                            value={editState.target_value}
                            onChange={(e) =>
                              setEditState({
                                ...editState,
                                target_value: parseFloat(e.target.value) || 0,
                              })
                            }
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 8,
                              color: "var(--text-dim)",
                              letterSpacing: "1.5px",
                              textTransform: "uppercase",
                              marginBottom: 4,
                              fontFamily: "var(--mono)",
                            }}
                          >
                            Deadline
                          </label>
                          <input
                            type="date"
                            value={editState.deadline}
                            onChange={(e) =>
                              setEditState({
                                ...editState,
                                deadline: e.target.value,
                              })
                            }
                            style={{ ...inputStyle, colorScheme: "dark" }}
                          />
                        </div>
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: 8,
                            color: "var(--text-dim)",
                            letterSpacing: "1.5px",
                            textTransform: "uppercase",
                            marginBottom: 4,
                            fontFamily: "var(--mono)",
                          }}
                        >
                          Direction
                        </label>
                        <div style={{ display: "flex", gap: 8 }}>
                          {(["increase", "decrease"] as const).map((d) => (
                            <button
                              key={d}
                              onClick={() =>
                                setEditState({ ...editState, direction: d })
                              }
                              style={{
                                flex: 1,
                                padding: "7px",
                                fontSize: 11,
                                fontFamily: "var(--mono)",
                                background:
                                  editState.direction === d
                                    ? "rgba(232,255,71,0.1)"
                                    : "var(--surface)",
                                border: `1px solid ${editState.direction === d ? "rgba(232,255,71,0.3)" : "var(--border)"}`,
                                color:
                                  editState.direction === d
                                    ? "#E8FF47"
                                    : "var(--text-muted)",
                                borderRadius: 6,
                                cursor: "pointer",
                              }}
                            >
                              {d === "increase" ? "↑ Increase" : "↓ Decrease"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={saveEdit}
                          disabled={editSaving}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "7px 14px",
                            background: "rgba(232,255,71,0.15)",
                            border: "1px solid rgba(232,255,71,0.35)",
                            color: "#E8FF47",
                            fontSize: 11,
                            fontFamily: "var(--mono)",
                            borderRadius: 6,
                            cursor: editSaving ? "not-allowed" : "pointer",
                            opacity: editSaving ? 0.6 : 1,
                          }}
                        >
                          <Check size={11} strokeWidth={2.5} />
                          {editSaving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          style={{
                            padding: "7px 12px",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            color: "var(--text-muted)",
                            fontSize: 11,
                            fontFamily: "var(--mono)",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Training Plan */}
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
                      padding: "12px 14px",
                      background: isToday
                        ? "var(--accent-dim)"
                        : "var(--surface2)",
                      border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      flexWrap: "wrap",
                      borderRadius: 10,
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
                          borderRadius: 4,
                        }}
                      >
                        {day.type}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--text)",
                        }}
                      >
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
