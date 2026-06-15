"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, PageHeader, StatCard, EmptyState } from "@/components/ui";
import type { Session } from "@/types";

export const dynamic = "force-dynamic";

function calcLoad(sessions: Session[], days: number): number {
  const since = new Date(Date.now() - days * 86400000)
    .toISOString()
    .split("T")[0];
  const filtered = sessions.filter((s) => s.date >= since);
  const totalLoad = filtered.reduce((sum, s) => sum + s.duration * s.rpe, 0);
  return Math.round(totalLoad / days);
}

function getZone(tsb: number): {
  label: string;
  color: string;
  description: string;
} {
  if (tsb > 10)
    return {
      label: "FRESH",
      color: "var(--green)",
      description: "Well rested. Good time to race or test performance.",
    };
  if (tsb >= -10)
    return {
      label: "OPTIMAL",
      color: "var(--accent)",
      description: "Peak performance zone. Train hard and compete.",
    };
  if (tsb >= -30)
    return {
      label: "FATIGUED",
      color: "var(--yellow)",
      description: "Accumulated fatigue. Monitor recovery closely.",
    };
  return {
    label: "DANGER",
    color: "var(--red)",
    description: "Overtraining risk. Reduce load immediately.",
  };
}

function buildChartData(sessions: Session[], days: number) {
  const data: { date: string; load: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().split("T")[0];
    const dayLoad = sessions
      .filter((s) => s.date === dateStr)
      .reduce((sum, s) => sum + s.duration * s.rpe, 0);
    data.push({ date: dateStr.slice(5), load: dayLoad });
  }
  return data;
}

export default function LoadPage() {
  const sb = createClient();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const since = new Date(Date.now() - 42 * 86400000)
      .toISOString()
      .split("T")[0];
    const { data } = await sb
      .from("sessions")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", since)
      .order("date");
    setSessions((data ?? []) as Session[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const atl = calcLoad(sessions, 7);
  const ctl = calcLoad(sessions, 42);
  const tsb = ctl - atl;
  const zone = getZone(tsb);
  const chartData = buildChartData(sessions, 28);
  const maxLoad = Math.max(...chartData.map((d) => d.load), 1);

  if (loading)
    return (
      <div>
        <PageHeader title="TRAINING LOAD" subtitle="ATL · CTL · TSB" />
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
        title="TRAINING LOAD"
        subtitle="Acute · Chronic · Form — last 42 days"
      />

      {sessions.length === 0 ? (
        <EmptyState message="No sessions logged yet — start training to see your load metrics" />
      ) : (
        <>
          {/* TSB Zone Banner */}
          <div
            style={{
              padding: "20px 24px",
              marginBottom: 16,
              background: "var(--surface)",
              border: `2px solid ${zone.color}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    color: zone.color,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Current Form
                </div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 32,
                    fontWeight: 700,
                    color: zone.color,
                  }}
                >
                  {zone.label}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    marginTop: 6,
                  }}
                >
                  {zone.description}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 48,
                    fontWeight: 700,
                    color: zone.color,
                    lineHeight: 1,
                  }}
                >
                  {tsb > 0 ? "+" : ""}
                  {tsb}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginTop: 4,
                  }}
                >
                  Training Stress Balance
                </div>
              </div>
            </div>
          </div>

          {/* ATL / CTL / TSB Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                padding: 16,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 32,
                  fontWeight: 700,
                  color: "var(--red)",
                  lineHeight: 1,
                }}
              >
                {atl}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 6,
                }}
              >
                ATL — Fatigue
              </div>
              <div
                style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}
              >
                7-day avg load
              </div>
            </div>
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                padding: 16,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 32,
                  fontWeight: 700,
                  color: "var(--green)",
                  lineHeight: 1,
                }}
              >
                {ctl}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 6,
                }}
              >
                CTL — Fitness
              </div>
              <div
                style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}
              >
                42-day avg load
              </div>
            </div>
            <div
              style={{
                background: "var(--surface)",
                border: `1px solid ${zone.color}`,
                padding: 16,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 32,
                  fontWeight: 700,
                  color: zone.color,
                  lineHeight: 1,
                }}
              >
                {tsb > 0 ? "+" : ""}
                {tsb}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 6,
                }}
              >
                TSB — Form
              </div>
              <div
                style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}
              >
                CTL minus ATL
              </div>
            </div>
          </div>

          {/* 28-day load chart */}
          <Card>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              Daily Training Load — Last 28 Days
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 3,
                height: 100,
              }}
            >
              {chartData.map((d, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "flex-end",
                      width: "100%",
                    }}
                  >
                    <div
                      title={`${d.date}: ${d.load}`}
                      style={{
                        width: "100%",
                        height:
                          d.load === 0
                            ? "2px"
                            : `${Math.max(4, (d.load / maxLoad) * 100)}%`,
                        background:
                          d.load === 0 ? "var(--border2)" : "var(--accent)",
                        opacity: 0.8,
                        transition: "height 0.3s",
                      }}
                    />
                  </div>
                  {i % 7 === 0 && (
                    <div
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 7,
                        color: "var(--text-dim)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {d.date}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Interpretation guide */}
          <Card style={{ borderColor: "var(--border)" }}>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              How to read this
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                {
                  range: "TSB > +10",
                  color: "var(--green)",
                  label: "Fresh",
                  desc: "Well rested. Good for racing or performance testing.",
                },
                {
                  range: "TSB -10 to +10",
                  color: "var(--accent)",
                  label: "Optimal",
                  desc: "Peak performance zone. Train hard, compete well.",
                },
                {
                  range: "TSB -10 to -30",
                  color: "var(--yellow)",
                  label: "Fatigued",
                  desc: "Accumulated fatigue. Monitor recovery, reduce intensity.",
                },
                {
                  range: "TSB < -30",
                  color: "var(--red)",
                  label: "Danger",
                  desc: "Overtraining risk. Take rest days immediately.",
                },
              ].map((item) => (
                <div
                  key={item.range}
                  style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
                >
                  <div style={{ width: 80, flexShrink: 0 }}>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 10,
                        color: item.color,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 10,
                        color: "var(--text-dim)",
                        marginBottom: 2,
                      }}
                    >
                      {item.range}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                background: "var(--bg)",
                border: "1px solid var(--border2)",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                <strong
                  style={{ color: "var(--text)", fontFamily: "var(--mono)" }}
                >
                  Load formula:
                </strong>{" "}
                Duration (min) × RPE = Session Load. ATL = 7-day average. CTL =
                42-day average. TSB = CTL − ATL.
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
