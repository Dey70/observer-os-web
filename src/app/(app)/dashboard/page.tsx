"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  calcDashboardStats,
  formatDuration,
  getLast14Days,
  rpeToLabel,
} from "@/lib/utils";
import {
  Card,
  PageHeader,
  StatCard,
  SectionLabel,
  BarChart,
  Button,
  Field,
  Input,
  EmptyState,
} from "@/components/ui";
import type { DailyLog, Session, WeightLog, DashboardStats } from "@/types";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const sb = createClient();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [weightInput, setWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const since = getLast14Days();

    const [{ data: l }, { data: s }, { data: w }] = await Promise.all([
      sb
        .from("daily_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", since)
        .order("date"),
      sb
        .from("sessions")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", since)
        .order("date", { ascending: false }),
      sb
        .from("weight_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(14),
    ]);

    const logsData = (l ?? []) as DailyLog[];
    const sessData = (s ?? []) as Session[];
    const wData = (w ?? []) as WeightLog[];

    setLogs(logsData);
    setSessions(sessData);
    setWeights(wData);
    setStats(calcDashboardStats(logsData, sessData, wData));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function logWeight() {
    const val = parseFloat(weightInput);
    if (!val || val < 20 || val > 300) return;
    setSavingWeight(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setSavingWeight(false);
      return;
    }
    const todayStr = new Date().toISOString().split("T")[0];
    await (sb as any)
      .from("weight_logs")
      .upsert(
        { user_id: user.id, date: todayStr, weight: val },
        { onConflict: "user_id,date" },
      );
    setWeightInput("");
    setSavingWeight(false);
    load();
  }

  const typeColor: Record<string, string> = {
    run: "var(--green)",
    lift: "var(--purple)",
    study: "var(--yellow)",
  };

  const sleepChartData = logs.map((l) => ({
    label: l.date.slice(5),
    value: l.sleep_hours,
  }));
  const moodChartData = logs.map((l) => ({
    label: l.date.slice(5),
    value: l.mood,
  }));
  const energyChartData = logs.map((l) => ({
    label: l.date.slice(5),
    value: l.energy,
  }));
  const weightChartData = [...weights]
    .reverse()
    .map((w) => ({ label: w.date.slice(5), value: w.weight }));
  const weightMax = weights.length
    ? Math.max(...weights.map((w) => w.weight)) + 1
    : 100;

  if (loading)
    return (
      <div>
        <PageHeader title="DASHBOARD" subtitle="Last 14 days" />
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
      <PageHeader title="DASHBOARD" subtitle="Last 14 days" />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard value={stats?.avgSleep ?? "—"} label="Avg Sleep (hrs)" />
        <StatCard
          value={stats?.avgMood ?? "—"}
          label="Avg Mood"
          color="var(--yellow)"
        />
        <StatCard
          value={stats?.avgEnergy ?? "—"}
          label="Avg Energy"
          color="var(--green)"
        />
        <StatCard
          value={stats?.totalSessions ?? 0}
          label="Sessions"
          color="var(--accent)"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatCard
          value={stats?.avgReadiness?.toFixed(1) ?? "—"}
          label="Avg Readiness"
          color="var(--accent)"
        />
        <StatCard
          value={`${stats?.sessionsByType.run ?? 0} / ${stats?.sessionsByType.lift ?? 0} / ${stats?.sessionsByType.study ?? 0}`}
          label="Run / Lift / Study"
        />
        <StatCard
          value={stats?.currentWeight ? `${stats.currentWeight} kg` : "—"}
          label="Current Weight"
          color="var(--purple)"
        />
      </div>

      {/* Weight Tracker */}
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Body Weight</SectionLabel>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 120 }}>
            <Field label="Weight (kg)">
              <Input
                type="number"
                step={0.1}
                placeholder="72.5"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && logWeight()}
              />
            </Field>
          </div>
          <Button
            onClick={logWeight}
            disabled={savingWeight || !weightInput}
            style={{ marginBottom: 16 }}
          >
            Log
          </Button>
          {stats?.weightAvg7d ? (
            <div style={{ marginBottom: 16, marginLeft: 8 }}>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--purple)",
                }}
              >
                {stats.weightAvg7d} kg
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginLeft: 8,
                }}
              >
                7-day avg
              </span>
            </div>
          ) : null}
        </div>
        {weightChartData.length > 0 ? (
          <BarChart
            data={weightChartData}
            color="var(--purple)"
            maxVal={weightMax}
          />
        ) : (
          <EmptyState message="No weight data yet — log your first entry above" />
        )}
      </Card>

      {/* Charts */}
      <Card style={{ marginBottom: 16 }}>
        {logs.length > 0 ? (
          <>
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Sleep (hours)
              </div>
              <BarChart
                data={sleepChartData}
                color="var(--accent)"
                maxVal={12}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Mood
              </div>
              <BarChart
                data={moodChartData}
                color="var(--yellow)"
                maxVal={10}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Energy
              </div>
              <BarChart
                data={energyChartData}
                color="var(--green)"
                maxVal={10}
              />
            </div>
          </>
        ) : (
          <EmptyState message="No check-ins yet — start with your daily check-in" />
        )}
      </Card>

      {/* Recent Sessions */}
      <Card>
        <SectionLabel>Recent Sessions</SectionLabel>
        {sessions.length === 0 ? (
          <EmptyState message="No sessions logged yet" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sessions.slice(0, 8).map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      padding: "3px 8px",
                      border: `1px solid ${typeColor[s.type]}`,
                      color: typeColor[s.type],
                      textTransform: "uppercase",
                    }}
                  >
                    {s.type}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {s.notes || "—"}
                  </span>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                    {formatDuration(s.duration)}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      color: "var(--text-dim)",
                    }}
                  >
                    {rpeToLabel(s.rpe)} · {s.date}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
