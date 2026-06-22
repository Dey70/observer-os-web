"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  calcDashboardStats,
  calcCheckinStreak,
  calcSessionStreak,
  formatDuration,
  getLast14Days,
  getWeekStart,
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
import { formatDistance, formatDuration as fmtDur, activityTypeLabel, activityTypeColor } from "@/lib/strava";
import type { DailyLog, Session, WeightLog, DashboardStats, RunningActivity } from "@/types";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const sb = createClient();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [checkinStreak, setCheckinStreak] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [weightInput, setWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [weekRuns, setWeekRuns] = useState<RunningActivity[]>([]);
  const [stravaConnected, setStravaConnected] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const since = getLast14Days();
    const weekStart = getWeekStart();

    const [{ data: l }, { data: s }, { data: w }, { data: runs }] =
      await Promise.all([
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
        (sb as any)
          .from("running_activities")
          .select("*")
          .eq("user_id", user.id)
          .gte("activity_date", weekStart)
          .order("activity_date", { ascending: false }),
      ]);

    const logsData = (l ?? []) as DailyLog[];
    const sessData = (s ?? []) as Session[];
    const wData = (w ?? []) as WeightLog[];
    const runsData = (runs ?? []) as RunningActivity[];

    setLogs(logsData);
    setSessions(sessData);
    setWeights(wData);
    setWeekRuns(runsData);
    setStravaConnected(runsData.length > 0);
    setStats(calcDashboardStats(logsData, sessData, wData));
    setCheckinStreak(calcCheckinStreak(logsData));
    setSessionStreak(calcSessionStreak(sessData));
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

  function streakLabel(n: number) {
    return n === 0 ? "—" : n >= 3 ? `🔥 ${n}` : `${n}`;
  }

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

      {/* Main stats — 2 cols on mobile, 4 on desktop */}
      <div className="grid-4" style={{ marginBottom: 12 }}>
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

      {/* Second row */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <StatCard
          value={stats?.avgReadiness?.toFixed(1) ?? "—"}
          label="Avg Readiness"
          color="var(--accent)"
        />
        <StatCard
          value={`${stats?.sessionsByType.run ?? 0}/${stats?.sessionsByType.lift ?? 0}/${stats?.sessionsByType.study ?? 0}`}
          label="Run/Lift/Study"
        />
        <StatCard
          value={streakLabel(checkinStreak)}
          label="Check-in Streak"
          color="var(--red)"
        />
        <StatCard
          value={streakLabel(sessionStreak)}
          label="Session Streak"
          color="var(--red)"
        />
      </div>

      {/* Running Summary — only shown when Strava activities exist this week */}
      {(stravaConnected || weekRuns.length > 0) && (
        <Card style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <SectionLabel>This Week · Running</SectionLabel>
            <span
              style={{
                fontSize: 9,
                fontFamily: "var(--mono)",
                color: "#FC4C02",
                letterSpacing: "0.1em",
                border: "1px solid rgba(252,76,2,0.35)",
                padding: "2px 7px",
                borderRadius: 4,
              }}
            >
              STRAVA
            </span>
          </div>

          {weekRuns.length === 0 ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                fontFamily: "var(--mono)",
                textAlign: "center",
                padding: "16px 0",
              }}
            >
              No activities this week yet
            </div>
          ) : (
            <>
              {/* Stats grid */}
              <div className="grid-4" style={{ marginBottom: 16 }}>
                <StatCard
                  value={`${(weekRuns.reduce((s, r) => s + r.distance_meters, 0) / 1000).toFixed(1)} km`}
                  label="Total Distance"
                  color="var(--green)"
                />
                <StatCard
                  value={weekRuns.length}
                  label="Activities"
                  color="var(--green)"
                />
                <StatCard
                  value={`${(Math.max(...weekRuns.map((r) => r.distance_meters)) / 1000).toFixed(1)} km`}
                  label="Longest"
                  color="var(--green)"
                />
                <StatCard
                  value={fmtDur(
                    weekRuns.reduce((s, r) => s + r.moving_time_seconds, 0),
                  )}
                  label="Moving Time"
                  color="var(--green)"
                />
              </div>

              {/* Recent activities list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {weekRuns.slice(0, 5).map((run) => (
                  <div
                    key={run.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "var(--surface2)",
                      border: "1px solid var(--border2)",
                      borderRadius: 10,
                      gap: 8,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 9,
                          letterSpacing: "0.08em",
                          padding: "2px 7px",
                          border: `1px solid ${activityTypeColor(run.activity_type)}`,
                          color: activityTypeColor(run.activity_type),
                          borderRadius: 4,
                          textTransform: "uppercase",
                          flexShrink: 0,
                        }}
                      >
                        {activityTypeLabel(run.activity_type)}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 180,
                        }}
                      >
                        {run.activity_name}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--green)",
                        }}
                      >
                        {formatDistance(run.distance_meters)} km
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-dim)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {fmtDur(run.moving_time_seconds)}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-dim)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        {run.activity_date.slice(5)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

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
          <div style={{ width: 120 }}>
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
          <EmptyState message="No weight data yet" />
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
          <EmptyState message="No check-ins yet" />
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
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      padding: "3px 8px",
                      border: `1px solid ${typeColor[s.type]}`,
                      color: typeColor[s.type],
                      textTransform: "uppercase",
                      flexShrink: 0,
                    }}
                  >
                    {s.type}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
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
                    {s.date}
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
