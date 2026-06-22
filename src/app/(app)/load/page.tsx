"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import {
  computeCTLATLTSB,
  getLoadZone,
  buildLoadChartData,
  calcSessionTSSProxy,
} from "@/lib/trainingLoad";
import type { TrainingMetricRow } from "@/lib/trainingLoad";
import type { Session } from "@/types";

export const dynamic = "force-dynamic";

export default function LoadPage() {
  const sb = createClient();
  const [metrics, setMetrics] = useState<TrainingMetricRow[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    const since = new Date(Date.now() - 42 * 86400000).toISOString().split("T")[0];

    const [{ data: metricsData }, { data: sessionsData }] = await Promise.all([
      (sb as any)
        .from("training_metrics")
        .select("activity_date, tss, trimp, pace_seconds_per_km, load_score, source")
        .eq("user_id", user.id)
        .gte("activity_date", since)
        .order("activity_date"),
      sb
        .from("sessions")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", since)
        .order("date"),
    ]);

    setMetrics((metricsData ?? []) as TrainingMetricRow[]);
    setSessions((sessionsData ?? []) as Session[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasMetrics = metrics.length > 0;

  // If Strava training_metrics exist, use TSS-based EMA.
  // Fall back to RPE proxy if the user has only manually logged sessions.
  const { ctl, atl, tsb } = hasMetrics
    ? computeCTLATLTSB(metrics)
    : (() => {
        const calcAvgLoad = (days: number) => {
          const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
          const filtered = sessions.filter((s) => s.date >= since);
          const total = filtered.reduce((sum, s) => sum + calcSessionTSSProxy(s.duration, s.rpe), 0);
          return Math.round(total / days);
        };
        const a = calcAvgLoad(7);
        const c = calcAvgLoad(42);
        return { ctl: c, atl: a, tsb: c - a };
      })();

  const zone = getLoadZone(tsb);

  // Chart data — always 28 days
  const chartData = hasMetrics
    ? buildLoadChartData(metrics, 28)
    : (() => {
        const data: { date: string; tss: number }[] = [];
        for (let i = 27; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          const dateStr = d.toISOString().split("T")[0];
          const dayLoad = sessions
            .filter((s) => s.date === dateStr)
            .reduce((sum, s) => sum + calcSessionTSSProxy(s.duration, s.rpe), 0);
          data.push({ date: dateStr.slice(5), tss: dayLoad });
        }
        return data;
      })();

  const maxTSS = Math.max(...chartData.map((d) => d.tss), 1);
  const totalSessions = sessions.length;

  if (loading)
    return (
      <div>
        <PageHeader title="TRAINING LOAD" subtitle="ATL · CTL · TSB" />
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: 13 }}>
          Loading...
        </div>
      </div>
    );

  return (
    <div>
      <PageHeader
        title="TRAINING LOAD"
        subtitle={hasMetrics ? "TSS-based · Acute · Chronic · Form" : "RPE-based · Acute · Chronic · Form"}
      />

      {totalSessions === 0 && !hasMetrics ? (
        <EmptyState message="No sessions logged yet — sync Strava or log a session to start tracking load" />
      ) : (
        <>
          {/* Data source badge */}
          {!hasMetrics && totalSessions > 0 && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: 6,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                fontSize: 10,
                color: "var(--text-dim)",
                fontFamily: "var(--mono)",
                marginBottom: 12,
                letterSpacing: "0.06em",
              }}
            >
              Using RPE estimates — sync Strava runs for TSS-based metrics
            </div>
          )}

          {/* TSB Zone Banner */}
          <div
            style={{
              padding: "20px 24px",
              marginBottom: 16,
              background: "var(--surface)",
              border: `2px solid ${zone.color}`,
              borderRadius: 12,
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
                    fontSize: 10,
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
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
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
                  {tsb > 0 ? "+" : ""}{tsb}
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

          {/* ATL / CTL / TSB cards */}
          <div className="grid-3" style={{ marginBottom: 16 }}>
            {[
              { label: "ATL — Fatigue",  sublabel: hasMetrics ? "7-day EMA of TSS" : "7-day avg load",  value: atl, color: "var(--red)"   },
              { label: "CTL — Fitness",  sublabel: hasMetrics ? "42-day EMA of TSS" : "42-day avg load", value: ctl, color: "var(--green)" },
              { label: "TSB — Form",     sublabel: "CTL minus ATL",                                       value: `${tsb > 0 ? "+" : ""}${tsb}`, color: zone.color },
            ].map(({ label, sublabel, value, color }) => (
              <div
                key={label}
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${color === zone.color ? color : "var(--border)"}`,
                  padding: 16,
                  borderRadius: 10,
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
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                  {sublabel}
                </div>
              </div>
            ))}
          </div>

          {/* Zone guide */}
          <Card style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Form Zones (TSB)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { range: "> +15",      label: "Fresh",        color: "var(--green)",  note: "Race-ready. Performance will be high." },
                { range: "0 to +15",   label: "Optimal",      color: "var(--accent)", note: "Peak window. Train and compete." },
                { range: "−10 to 0",   label: "Productive",   color: "var(--yellow)", note: "Building fitness. Normal fatigue." },
                { range: "−20 to −10", label: "Fatigued",     color: "var(--yellow)", note: "High fatigue. Monitor recovery." },
                { range: "< −20",      label: "Overreaching", color: "var(--red)",    note: "Overtraining risk. Reduce load now." },
              ].map(({ range, label, color, note }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: tsb > 15 && label === "Fresh"        ? `${color}12`
                              : tsb > 0  && label === "Optimal"      ? `${color}12`
                              : tsb > -10 && label === "Productive"  ? `${color}12`
                              : tsb > -20 && label === "Fatigued"    ? `${color}12`
                              : label === "Overreaching" && tsb <= -20 ? `${color}12`
                              : "transparent",
                    border: `1px solid ${
                      (tsb > 15 && label === "Fresh")        ||
                      (tsb > 0  && tsb <= 15 && label === "Optimal")     ||
                      (tsb > -10 && tsb <= 0 && label === "Productive")  ||
                      (tsb > -20 && tsb <= -10 && label === "Fatigued")  ||
                      (tsb <= -20 && label === "Overreaching")
                        ? color : "var(--border2)"
                    }`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      color,
                      width: 70,
                      flexShrink: 0,
                    }}
                  >
                    {range}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      fontWeight: 600,
                      color,
                      width: 96,
                      flexShrink: 0,
                    }}
                  >
                    {label}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{note}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Daily load chart */}
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
              Daily {hasMetrics ? "TSS" : "Load"} — Last 28 Days
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 100 }}>
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
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                    <div
                      title={`${d.date}: ${d.tss} ${hasMetrics ? "TSS" : "load"}`}
                      style={{
                        width: "100%",
                        height: d.tss === 0 ? "2px" : `${Math.max(4, (d.tss / maxTSS) * 100)}%`,
                        background: d.tss === 0 ? "var(--border2)" : zone.color,
                        opacity: 0.75,
                        borderRadius: "2px 2px 0 0",
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
