"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, PageHeader, EmptyState } from "@/components/ui";
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
        <EmptyState message="No sessions logged yet" />
      ) : (
        <>
          {/* TSB Zone Banner */}
          <div
            style={{
              padding: "20px",
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
                    fontSize: 28,
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
                    fontSize: 40,
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
                  TSB
                </div>
              </div>
            </div>
          </div>

          {/* ATL / CTL / TSB Cards — 3 cols on desktop, all 3 on mobile too but smaller */}
          <div className="grid-3" style={{ marginBottom: 16 }}>
            {[
              {
                label: "ATL — Fatigue",
                sublabel: "7-day avg load",
                value: atl,
                color: "var(--red)",
              },
              {
                label: "CTL — Fitness",
                sublabel: "42-day avg load",
                value: ctl,
                color: "var(--green)",
              },
              {
                label: "TSB — Form",
                sublabel: "CTL minus ATL",
                value: `${tsb > 0 ? "+" : ""}${tsb}`,
                color: zone.color,
              },
            ].map(({ label, sublabel, value, color }) => (
              <div
                key={label}
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${color === zone.color ? color : "var(--border)"}`,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 28,
                    fontWeight: 700,
                    color,
                    lineHeight: 1,
                  }}
                >
                  {value}
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
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-dim)",
                    marginTop: 4,
                  }}
                >
                  {sublabel}
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
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
              Daily Load — Last 28 Days
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
        </>
      )}
    </div>
  );
}
