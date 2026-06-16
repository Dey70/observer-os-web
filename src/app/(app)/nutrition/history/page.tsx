// src/app/(app)/nutrition/history/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  PageHeader,
  SectionLabel,
  StatCard,
  EmptyState,
  Badge,
} from "@/components/ui";
import type { MealType } from "@/lib/utils";

export const dynamic = "force-dynamic";

type NutritionLogRow = {
  id: number;
  date: string;
  meal_type: MealType;
  item_name: string;
  portion_desc: string | null;
  confidence: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

const MEAL_META: Record<MealType, { label: string; color: string }> = {
  breakfast: { label: "Breakfast", color: "var(--yellow)" },
  lunch: { label: "Lunch", color: "var(--accent)" },
  dinner: { label: "Dinner", color: "var(--purple)" },
  snack: { label: "Snack", color: "var(--green)" },
  junk: { label: "Junk", color: "var(--red)" },
};

const MEAL_ORDER: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "junk",
];

function groupByMeal(
  rows: NutritionLogRow[],
): Record<MealType, NutritionLogRow[]> {
  const groups: Record<MealType, NutritionLogRow[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
    junk: [],
  };
  for (const r of rows) {
    const key = groups[r.meal_type] ? r.meal_type : "snack";
    groups[key].push(r);
  }
  return groups;
}

function dayTotals(rows: NutritionLogRow[]) {
  return rows.reduce(
    (acc, r) => ({
      calories: acc.calories + r.calories,
      protein: acc.protein + r.protein,
      carbs: acc.carbs + r.carbs,
      fat: acc.fat + r.fat,
      fiber: acc.fiber + r.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const RANGE_OPTIONS = [7, 14, 30];

export default function NutritionHistoryPage() {
  const sb = createClient();
  const [logs, setLogs] = useState<NutritionLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(14);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const since = new Date(Date.now() - rangeDays * 86400000)
      .toISOString()
      .split("T")[0];
    const { data } = await (sb as any)
      .from("nutrition_logs")
      .select(
        "id, date, meal_type, item_name, portion_desc, confidence, calories, protein, carbs, fat, fiber",
      )
      .eq("user_id", user.id)
      .gte("date", since)
      .order("date", { ascending: false })
      .order("logged_at", { ascending: true });
    setLogs((data ?? []) as NutritionLogRow[]);
    setLoading(false);
  }, [rangeDays]);

  useEffect(() => {
    load();
  }, [load]);

  const byDate = new Map<string, NutritionLogRow[]>();
  for (const l of logs) {
    if (!byDate.has(l.date)) byDate.set(l.date, []);
    byDate.get(l.date)!.push(l);
  }
  const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

  const daysLogged = dates.length;
  const avgCalories = daysLogged
    ? Math.round(
        dates.reduce((s, d) => s + dayTotals(byDate.get(d)!).calories, 0) /
          daysLogged,
      )
    : 0;
  const avgProtein = daysLogged
    ? Math.round(
        dates.reduce((s, d) => s + dayTotals(byDate.get(d)!).protein, 0) /
          daysLogged,
      )
    : 0;
  const junkDays = dates.filter((d) =>
    byDate.get(d)!.some((r) => r.meal_type === "junk"),
  ).length;

  if (loading) {
    return (
      <div>
        <PageHeader
          title="NUTRITION HISTORY"
          subtitle="Past days at a glance"
        />
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
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        title="NUTRITION HISTORY"
        subtitle="Past days at a glance"
        right={
          <div style={{ display: "flex", gap: 6 }}>
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRangeDays(r)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${rangeDays === r ? "var(--accent)" : "var(--border)"}`,
                  background:
                    rangeDays === r ? "var(--accent-dim)" : "var(--surface2)",
                  color:
                    rangeDays === r ? "var(--accent)" : "var(--text-muted)",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {r}d
              </button>
            ))}
          </div>
        }
      />

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <StatCard value={daysLogged} label={`Days logged / ${rangeDays}`} />
        <StatCard
          value={avgCalories}
          label="Avg calories"
          color="var(--accent)"
        />
        <StatCard
          value={`${avgProtein}g`}
          label="Avg protein"
          color="var(--red)"
        />
        <StatCard value={junkDays} label="Junk days" color="var(--red)" />
      </div>

      <Card>
        <SectionLabel>Daily breakdown</SectionLabel>
        {dates.length === 0 ? (
          <EmptyState
            message={`No nutrition logged in the last ${rangeDays} days`}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dates.map((date) => {
              const rows = byDate.get(date)!;
              const totals = dayTotals(rows);
              const hasJunk = rows.some((r) => r.meal_type === "junk");
              const isExpanded = expandedDate === date;
              const grouped = groupByMeal(rows);

              return (
                <div key={date}>
                  <button
                    onClick={() => setExpandedDate(isExpanded ? null : date)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      borderRadius: isExpanded ? "10px 10px 0 0" : 10,
                      border: "1px solid var(--border2)",
                      background: "var(--surface2)",
                      cursor: "pointer",
                      textAlign: "left",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 13,
                          color: "var(--text)",
                        }}
                      >
                        {formatDateLabel(date)}
                      </span>
                      {hasJunk && <Badge color="var(--red)">Junk</Badge>}
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                        color: "var(--text-muted)",
                      }}
                    >
                      {Math.round(totals.calories)} kcal · P
                      {totals.protein.toFixed(0)} C{totals.carbs.toFixed(0)} F
                      {totals.fat.toFixed(0)}
                    </span>
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        border: "1px solid var(--border2)",
                        borderTop: "none",
                        borderRadius: "0 0 10px 10px",
                        padding: 14,
                        background: "var(--surface)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                      }}
                    >
                      {MEAL_ORDER.map((mt) => {
                        const items = grouped[mt];
                        if (!items.length) return null;
                        const meta = MEAL_META[mt];
                        return (
                          <div key={mt}>
                            <div
                              style={{
                                fontFamily: "var(--mono)",
                                fontSize: 10,
                                color: meta.color,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                marginBottom: 6,
                              }}
                            >
                              {meta.label}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              {items.map((item) => (
                                <div
                                  key={item.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: 12,
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  <span
                                    style={{
                                      color: "var(--text)",
                                      textTransform: "capitalize",
                                    }}
                                  >
                                    {item.item_name}
                                  </span>
                                  <span style={{ fontFamily: "var(--mono)" }}>
                                    {item.calories} kcal
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
