// src/app/(app)/nutrition/page.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Card, SectionLabel, EmptyState } from "@/components/ui";
import type { DailyTargets } from "@/lib/nutritionEngine";
import type { ParsedFoodItem } from "@/lib/foodParser";
import { guessMealType, type MealType } from "@/lib/utils";
import {
  Flame,
  Beef,
  Wheat,
  Droplet,
  Droplets,
  Leaf,
  AlertCircle,
  Check,
  Trash2,
  Pencil,
  X,
  Coffee,
  Sun,
  Moon,
  Cookie,
  Undo2,
} from "lucide-react";

export const dynamic = "force-dynamic";

type NutritionLogRow = {
  id: number;
  meal_group_id: string;
  date: string;
  meal_type: MealType;
  item_name: string;
  portion_desc: string | null;
  source: string;
  confidence: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

type WaterLogRow = {
  id: number;
  amount_ml: number;
};

type PendingMeal = {
  items: ParsedFoodItem[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  raw_input: string;
  meal_type: MealType;
};

const RING_METRICS = [
  {
    key: "calories" as const,
    label: "Calories",
    unit: "kcal",
    icon: Flame,
    color: "var(--accent)",
  },
  {
    key: "protein" as const,
    label: "Protein",
    unit: "g",
    icon: Beef,
    color: "var(--red)",
  },
  {
    key: "carbs" as const,
    label: "Carbs",
    unit: "g",
    icon: Wheat,
    color: "var(--yellow)",
  },
  {
    key: "fat" as const,
    label: "Fat",
    unit: "g",
    icon: Droplet,
    color: "var(--purple)",
  },
  {
    key: "fiber" as const,
    label: "Fiber",
    unit: "g",
    icon: Leaf,
    color: "var(--green)",
  },
];

const BMI_CATEGORY_LABEL: Record<string, { label: string; color: string }> = {
  underweight: { label: "Underweight", color: "var(--yellow)" },
  normal: { label: "Normal", color: "var(--green)" },
  overweight: { label: "Overweight", color: "var(--yellow)" },
  obese: { label: "Obese", color: "var(--red)" },
};

const MEAL_TYPES: {
  value: MealType;
  label: string;
  icon: React.ElementType;
  color: string;
}[] = [
  {
    value: "breakfast",
    label: "Breakfast",
    icon: Coffee,
    color: "var(--yellow)",
  },
  { value: "lunch", label: "Lunch", icon: Sun, color: "var(--accent)" },
  { value: "dinner", label: "Dinner", icon: Moon, color: "var(--purple)" },
  { value: "snack", label: "Snack", icon: Cookie, color: "var(--green)" },
];

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

// No CSS theme var fits water cleanly (accent/red/yellow/purple/green are
// already claimed by the macro rings), so this one's a literal hex —
// consistent with how records/page.tsx does the same thing for PR colors.
const WATER_COLOR = "#4FC3F7";

const WATER_QUICK_AMOUNTS = [250, 500, 1000];

function recomputeTotals(items: ParsedFoodItem[]) {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
      fiber: acc.fiber + item.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

function groupLogsByMeal(
  logs: NutritionLogRow[],
): Record<MealType, NutritionLogRow[]> {
  const groups: Record<MealType, NutritionLogRow[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const l of logs) {
    const key: MealType = groups[l.meal_type] ? l.meal_type : "snack";
    groups[key].push(l);
  }
  return groups;
}

function MacroRing({
  label,
  consumed,
  target,
  unit,
  color,
  Icon,
}: {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  color: string;
  Icon: React.ElementType;
}) {
  const pct =
    target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "16px 10px",
      }}
    >
      <div style={{ position: "relative", width: 68, height: 68 }}>
        <svg width="68" height="68" style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx="34"
            cy="34"
            r="28"
            fill="none"
            stroke="var(--border2)"
            strokeWidth="6"
          />
          <circle
            cx="34"
            cy="34"
            r="28"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={16} color={color} strokeWidth={1.75} />
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          {Math.round(consumed)}
          <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>
            /{Math.round(target)}
          </span>
        </div>
        <div
          style={{
            fontSize: 8,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          {label} ({unit})
        </div>
      </div>
    </div>
  );
}

// Same visual shell as MacroRing but values are in liters, since 1900/3500
// reads worse than 1.9/3.5 — the underlying numbers stay in ml everywhere
// else (DB, target calc), this is purely a display conversion.
function WaterRing({
  consumedMl,
  targetMl,
}: {
  consumedMl: number;
  targetMl: number;
}) {
  const pct =
    targetMl > 0 ? Math.min(100, Math.round((consumedMl / targetMl) * 100)) : 0;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "16px 10px",
      }}
    >
      <div style={{ position: "relative", width: 68, height: 68 }}>
        <svg width="68" height="68" style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx="34"
            cy="34"
            r="28"
            fill="none"
            stroke="var(--border2)"
            strokeWidth="6"
          />
          <circle
            cx="34"
            cy="34"
            r="28"
            fill="none"
            stroke={WATER_COLOR}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Droplets size={16} color={WATER_COLOR} strokeWidth={1.75} />
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          {(consumedMl / 1000).toFixed(1)}
          <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>
            /{(targetMl / 1000).toFixed(1)}
          </span>
        </div>
        <div
          style={{
            fontSize: 8,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginTop: 2,
          }}
        >
          Water (L)
        </div>
      </div>
    </div>
  );
}

export default function NutritionPage() {
  const sb = createClient();
  const [date] = useState(() => new Date().toISOString().split("T")[0]);
  const [targets, setTargets] = useState<DailyTargets | null>(null);
  const [targetsError, setTargetsError] = useState<string[] | null>(null);
  const [logs, setLogs] = useState<NutritionLogRow[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [input, setInput] = useState("");
  const [mealType, setMealType] = useState<MealType>(() => guessMealType());
  const [parsing, setParsing] = useState(false);
  const [pending, setPending] = useState<PendingMeal | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ParsedFoodItem | null>(null);
  const [customWaterAmount, setCustomWaterAmount] = useState("");
  const [loggingWater, setLoggingWater] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    const [targetsRes, logsRes, waterRes] = await Promise.all([
      fetch(`/api/nutrition/targets?date=${date}`).then((r) => r.json()),
      (sb as any)
        .from("nutrition_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", date)
        .order("logged_at", { ascending: true }),
      (sb as any)
        .from("water_logs")
        .select("id, amount_ml")
        .eq("user_id", user.id)
        .eq("date", date)
        .order("logged_at", { ascending: true }),
    ]);

    if (targetsRes.error) {
      setTargetsError(targetsRes.missing ?? ["profile data"]);
      setTargets(null);
    } else {
      setTargetsError(null);
      setTargets(targetsRes.targets);
    }

    setLogs((logsRes.data ?? []) as NutritionLogRow[]);
    setWaterLogs((waterRes.data ?? []) as WaterLogRow[]);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const consumed = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fat: acc.fat + l.fat,
      fiber: acc.fiber + l.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );

  const consumedWaterMl = waterLogs.reduce((s, w) => s + w.amount_ml, 0);

  const groupedLogs = groupLogsByMeal(logs);

  async function handleParse() {
    if (!input.trim() || parsing) return;
    setParsing(true);
    setParseError(null);
    setPending(null);
    setEditingIndex(null);
    try {
      const res = await fetch("/api/nutrition/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: input.trim(),
          date,
          meal_type: mealType,
        }),
      });
      const data = await res.json();
      if (data.error && !data.items) {
        setParseError(data.error);
      } else if (!data.items?.length) {
        setParseError(data.coach_note || "Couldn't identify any food in that.");
      } else {
        setPending({
          items: data.items,
          totals: data.totals,
          raw_input: data.raw_input,
          meal_type: (data.meal_type as MealType) ?? mealType,
        });
      }
    } catch {
      setParseError("Something went wrong parsing that. Try again.");
    } finally {
      setParsing(false);
    }
  }

  async function confirmMeal() {
    if (!pending) return;
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    const mealGroupId = crypto.randomUUID();
    const rows = pending.items.map((item) => ({
      user_id: user.id,
      meal_group_id: mealGroupId,
      date,
      meal_type: pending.meal_type,
      item_name: item.name,
      portion_desc: item.portion_desc,
      raw_input: pending.raw_input,
      source: item.source,
      confidence: item.confidence,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: item.fiber,
    }));

    await (sb as any).from("nutrition_logs").insert(rows);
    setPending(null);
    setEditingIndex(null);
    setInput("");
    load();
    inputRef.current?.focus();
  }

  function discardPending() {
    setPending(null);
    setEditingIndex(null);
  }

  function changePendingMealType(newType: MealType) {
    if (!pending) return;
    setPending({ ...pending, meal_type: newType });
  }

  function startEditItem(index: number) {
    if (!pending) return;
    setEditingIndex(index);
    setEditDraft({ ...pending.items[index] });
  }

  function cancelEditItem() {
    setEditingIndex(null);
    setEditDraft(null);
  }

  function saveEditItem() {
    if (!pending || editingIndex === null || !editDraft) return;
    const newItems = [...pending.items];
    newItems[editingIndex] = {
      ...editDraft,
      confidence: "high",
      source: "manual",
    };
    setPending({
      items: newItems,
      totals: recomputeTotals(newItems),
      raw_input: pending.raw_input,
      meal_type: pending.meal_type,
    });
    setEditingIndex(null);
    setEditDraft(null);
  }

  function removePendingItem(index: number) {
    if (!pending) return;
    const newItems = pending.items.filter((_, i) => i !== index);
    if (newItems.length === 0) {
      setPending(null);
      setEditingIndex(null);
      return;
    }
    setPending({
      items: newItems,
      totals: recomputeTotals(newItems),
      raw_input: pending.raw_input,
      meal_type: pending.meal_type,
    });
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditDraft(null);
    }
  }

  async function deleteLogItem(id: number) {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    await (sb as any)
      .from("nutrition_logs")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    load();
  }

  async function logWater(amountMl: number) {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    setLoggingWater(true);
    await (sb as any)
      .from("water_logs")
      .insert({ user_id: user.id, date, amount_ml: amountMl });
    await load();
    setLoggingWater(false);
  }

  async function logCustomWater() {
    const ml = Math.round(parseFloat(customWaterAmount));
    if (!ml || ml <= 0) return;
    await logWater(ml);
    setCustomWaterAmount("");
  }

  async function undoLastWater() {
    if (!waterLogs.length) return;
    const last = waterLogs[waterLogs.length - 1];
    await (sb as any).from("water_logs").delete().eq("id", last.id);
    load();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleParse();
  }

  function handleWaterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") logCustomWater();
  }

  const confidenceColor: Record<string, string> = {
    high: "var(--green)",
    medium: "var(--yellow)",
    low: "var(--red)",
  };

  const editFieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text)",
    outline: "none",
    fontFamily: "var(--mono)",
    fontSize: 12,
    boxSizing: "border-box",
  };

  if (loading)
    return (
      <div>
        <PageHeader title="NUTRITION" subtitle="Macro tracking" />
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

  const bmiInfo = targets ? BMI_CATEGORY_LABEL[targets.bmi_category] : null;

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        title="NUTRITION"
        subtitle={
          targets
            ? targets.breakdown_reason.charAt(0).toUpperCase() +
              targets.breakdown_reason.slice(1)
            : "Today's intake"
        }
      />

      {targetsError ? (
        <Card style={{ borderColor: "var(--yellow)", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <AlertCircle
              size={16}
              color="var(--yellow)"
              strokeWidth={1.75}
              style={{ marginTop: 1, flexShrink: 0 }}
            />
            <div>
              <div
                style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}
              >
                Add a few profile details to unlock personalized targets
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Missing: {targetsError.join(", ")}. Add these in{" "}
                <a href="/profile" style={{ color: "var(--accent)" }}>
                  Profile
                </a>
                {targetsError.includes("weight") &&
                  " and log today's weight on the Dashboard"}
                .
              </div>
            </div>
          </div>
        </Card>
      ) : (
        targets && (
          <Card style={{ marginBottom: 16 }}>
            <SectionLabel>Today's Targets</SectionLabel>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: 8,
              }}
              className="grid-nutrition-rings"
            >
              {RING_METRICS.map(({ key, label, unit, icon, color }) => (
                <MacroRing
                  key={key}
                  label={label}
                  consumed={consumed[key]}
                  target={targets[key]}
                  unit={unit}
                  color={color}
                  Icon={icon}
                />
              ))}
              <WaterRing
                consumedMl={consumedWaterMl}
                targetMl={targets.water}
              />
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 11,
                color: "var(--text-dim)",
                fontFamily: "var(--mono)",
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span>BMR {targets.bmr}</span>
              <span>TDEE {targets.tdee}</span>
              {bmiInfo && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "2px 8px",
                    borderRadius: 99,
                    border: `1px solid ${bmiInfo.color}`,
                    color: bmiInfo.color,
                  }}
                >
                  BMI {targets.bmi} · {bmiInfo.label}
                </span>
              )}
            </div>

            {/* Water quick-log */}
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid var(--border2)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                  fontFamily: "var(--mono)",
                }}
              >
                Log Water
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {WATER_QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => logWater(amt)}
                    disabled={loggingWater}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 99,
                      border: `1px solid ${WATER_COLOR}40`,
                      background: `${WATER_COLOR}15`,
                      color: WATER_COLOR,
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: loggingWater ? "not-allowed" : "pointer",
                      opacity: loggingWater ? 0.6 : 1,
                    }}
                  >
                    +{amt >= 1000 ? `${amt / 1000}L` : `${amt}ml`}
                  </button>
                ))}
                <input
                  type="number"
                  value={customWaterAmount}
                  onChange={(e) => setCustomWaterAmount(e.target.value)}
                  onKeyDown={handleWaterKeyDown}
                  placeholder="Custom ml"
                  style={{
                    width: 90,
                    padding: "6px 10px",
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text)",
                    outline: "none",
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                  }}
                />
                <button
                  onClick={logCustomWater}
                  disabled={!customWaterAmount || loggingWater}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface2)",
                    color: "var(--text-muted)",
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                    cursor:
                      !customWaterAmount || loggingWater
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  Add
                </button>
                {waterLogs.length > 0 && (
                  <button
                    onClick={undoLastWater}
                    title="Undo last water entry"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "6px 10px",
                      background: "transparent",
                      border: "none",
                      color: "var(--text-dim)",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    <Undo2 size={11} strokeWidth={1.75} />
                    Undo last (+{waterLogs[waterLogs.length - 1].amount_ml}ml)
                  </button>
                )}
              </div>
            </div>
          </Card>
        )
      )}

      {/* Meal log — grouped by meal type */}
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Today's Log ({logs.length} items)</SectionLabel>
        {logs.length === 0 ? (
          <EmptyState message="Nothing logged yet — tell the coach what you ate below" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {MEAL_ORDER.map((mt) => {
              const items = groupedLogs[mt];
              if (!items.length) return null;
              const meta = MEAL_TYPES.find((m) => m.value === mt)!;
              const subtotal = items.reduce((s, l) => s + l.calories, 0);
              const Icon = meta.icon;
              return (
                <div key={mt}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <Icon size={13} color={meta.color} strokeWidth={1.75} />
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          color: meta.color,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: "var(--text-dim)",
                      }}
                    >
                      {Math.round(subtotal)} kcal
                    </span>
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    {items.map((l) => (
                      <div
                        key={l.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          background: "var(--surface2)",
                          border: "1px solid var(--border2)",
                          borderRadius: 8,
                          gap: 8,
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                color: "var(--text)",
                                textTransform: "capitalize",
                              }}
                            >
                              {l.item_name}
                            </span>
                            <span
                              style={{
                                fontSize: 9,
                                fontFamily: "var(--mono)",
                                color:
                                  confidenceColor[l.confidence] ??
                                  "var(--text-dim)",
                                border: `1px solid ${confidenceColor[l.confidence] ?? "var(--border)"}`,
                                borderRadius: 4,
                                padding: "1px 5px",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              {l.confidence}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--text-dim)",
                              fontFamily: "var(--mono)",
                              marginTop: 2,
                            }}
                          >
                            {l.portion_desc} · {l.calories} kcal · P{l.protein}{" "}
                            C{l.carbs} F{l.fat}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteLogItem(l.id)}
                          style={{
                            width: 26,
                            height: 26,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "transparent",
                            border: "1px solid var(--border2)",
                            borderRadius: 6,
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          <Trash2
                            size={11}
                            color="var(--text-dim)"
                            strokeWidth={1.75}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Pending confirmation card */}
      {pending && (
        <Card style={{ borderColor: "var(--accent)", marginBottom: 16 }}>
          <SectionLabel>Confirm This Meal</SectionLabel>

          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            {MEAL_TYPES.map(({ value, label, icon: Icon, color }) => {
              const isActive = pending.meal_type === value;
              return (
                <button
                  key={value}
                  onClick={() => changePendingMealType(value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 10px",
                    borderRadius: 99,
                    border: `1px solid ${isActive ? color : "var(--border2)"}`,
                    background: isActive ? "var(--surface2)" : "transparent",
                    color: isActive ? color : "var(--text-dim)",
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <Icon size={11} strokeWidth={isActive ? 2.25 : 1.75} />
                  {label}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 14,
            }}
          >
            {pending.items.map((item, i) => {
              const isEditing = editingIndex === i;
              return (
                <div
                  key={i}
                  style={{
                    padding: "10px 12px",
                    background: "var(--surface2)",
                    border: `1px solid ${isEditing ? "var(--accent)" : "var(--border2)"}`,
                    borderRadius: 8,
                  }}
                >
                  {isEditing && editDraft ? (
                    <div>
                      <div style={{ marginBottom: 8 }}>
                        <label
                          style={{
                            fontSize: 9,
                            color: "var(--text-dim)",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            fontFamily: "var(--mono)",
                          }}
                        >
                          Item name
                        </label>
                        <input
                          value={editDraft.name}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, name: e.target.value })
                          }
                          style={{ ...editFieldStyle, marginTop: 4 }}
                        />
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(5, 1fr)",
                          gap: 6,
                          marginBottom: 10,
                        }}
                      >
                        {(
                          [
                            "calories",
                            "protein",
                            "carbs",
                            "fat",
                            "fiber",
                          ] as const
                        ).map((field) => (
                          <div key={field}>
                            <label
                              style={{
                                fontSize: 8,
                                color: "var(--text-dim)",
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                fontFamily: "var(--mono)",
                              }}
                            >
                              {field === "calories"
                                ? "kcal"
                                : field.slice(0, 1).toUpperCase()}
                            </label>
                            <input
                              type="number"
                              value={editDraft[field]}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  [field]: parseFloat(e.target.value) || 0,
                                })
                              }
                              style={{ ...editFieldStyle, marginTop: 4 }}
                            />
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={saveEditItem}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "6px 12px",
                            background: "var(--accent-dim)",
                            border: "1px solid var(--accent)",
                            borderRadius: 6,
                            color: "var(--accent)",
                            fontFamily: "var(--mono)",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          <Check size={11} strokeWidth={2.5} /> Save
                        </button>
                        <button
                          onClick={cancelEditItem}
                          style={{
                            padding: "6px 12px",
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            color: "var(--text-muted)",
                            fontFamily: "var(--mono)",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--text)",
                            textTransform: "capitalize",
                          }}
                        >
                          {item.name}
                        </span>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--text-dim)",
                            fontFamily: "var(--mono)",
                            marginTop: 2,
                          }}
                        >
                          {item.portion_desc} ·{" "}
                          <span
                            style={{ color: confidenceColor[item.confidence] }}
                          >
                            {item.confidence} confidence
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          flexShrink: 0,
                        }}
                      >
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: 13,
                              fontWeight: 700,
                              color: "var(--accent)",
                            }}
                          >
                            {item.calories} kcal
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--text-dim)",
                              fontFamily: "var(--mono)",
                            }}
                          >
                            P{item.protein} C{item.carbs} F{item.fat}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={() => startEditItem(i)}
                            title="Edit"
                            style={{
                              width: 24,
                              height: 24,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "transparent",
                              border: "1px solid var(--border2)",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            <Pencil
                              size={11}
                              color="var(--text-muted)"
                              strokeWidth={1.75}
                            />
                          </button>
                          <button
                            onClick={() => removePendingItem(i)}
                            title="Remove from this meal"
                            style={{
                              width: 24,
                              height: 24,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "transparent",
                              border: "1px solid var(--border2)",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            <X
                              size={11}
                              color="var(--text-dim)"
                              strokeWidth={1.75}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--text-muted)",
              marginBottom: 14,
              paddingTop: 10,
              borderTop: "1px solid var(--border2)",
            }}
          >
            <span>Total: {pending.totals.calories} kcal</span>
            <span>
              P{pending.totals.protein} C{pending.totals.carbs} F
              {pending.totals.fat} Fi{pending.totals.fiber}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={confirmMeal}
              disabled={editingIndex !== null}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "11px",
                background:
                  editingIndex !== null ? "var(--surface2)" : "var(--accent)",
                border: "none",
                borderRadius: 8,
                color: editingIndex !== null ? "var(--text-dim)" : "var(--bg)",
                fontFamily: "var(--mono)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                cursor: editingIndex !== null ? "not-allowed" : "pointer",
              }}
            >
              <Check size={13} strokeWidth={2.5} /> ADD TO LOG
            </button>
            <button
              onClick={discardPending}
              style={{
                padding: "11px 18px",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-muted)",
                fontFamily: "var(--mono)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Discard
            </button>
          </div>
        </Card>
      )}

      {parseError && (
        <Card style={{ borderColor: "var(--red)", marginBottom: 16 }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--red)",
              fontFamily: "var(--mono)",
            }}
          >
            {parseError}
          </div>
        </Card>
      )}

      {/* Meal type selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {MEAL_TYPES.map(({ value, label, icon: Icon, color }) => {
          const isActive = mealType === value;
          return (
            <button
              key={value}
              onClick={() => setMealType(value)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "9px 6px",
                borderRadius: 10,
                border: `1px solid ${isActive ? color : "var(--border)"}`,
                background: isActive ? "var(--surface2)" : "var(--surface)",
                color: isActive ? color : "var(--text-muted)",
                fontFamily: "var(--mono)",
                fontSize: 11,
                fontWeight: isActive ? 700 : 400,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <Icon size={13} strokeWidth={isActive ? 2.25 : 1.75} />
              {label}
            </button>
          );
        })}
      </div>

      {/* AI input bar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          position: "sticky",
          bottom: 16,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={parsing}
          placeholder={`What did you have for ${
            mealType === "snack" ? "your snack" : mealType
          }? e.g. 2 eggs, oats with banana, black coffee`}
          style={{
            flex: 1,
            padding: "13px 16px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            color: "var(--text)",
            outline: "none",
            fontFamily: "var(--sans)",
            fontSize: 14,
            minWidth: 0,
          }}
        />
        <button
          onClick={handleParse}
          disabled={parsing || !input.trim()}
          style={{
            padding: "0 22px",
            background:
              parsing || !input.trim() ? "var(--surface2)" : "var(--accent)",
            color: parsing || !input.trim() ? "var(--text-dim)" : "var(--bg)",
            border: "none",
            borderRadius: 12,
            fontFamily: "var(--mono)",
            fontSize: 12,
            fontWeight: 700,
            cursor: parsing || !input.trim() ? "not-allowed" : "pointer",
            letterSpacing: "0.05em",
          }}
        >
          {parsing ? "..." : "LOG"}
        </button>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .grid-nutrition-rings { grid-template-columns: repeat(3, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
