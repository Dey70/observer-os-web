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

// ── Recommendation based on TSB ──────────────────────────────────────────────
function getRecommendation(tsb: number): { label: string; detail: string; color: string } {
  if (tsb > 15)  return { label: "Race Day / Max Effort",   color: "var(--green)",  detail: "You're fully rested. High-intensity workout or a race is ideal today." };
  if (tsb > 0)   return { label: "Quality Session",         color: "var(--accent)", detail: "Perfect window for intervals, tempo, or a hard effort block." };
  if (tsb > -10) return { label: "Moderate / Threshold",   color: "var(--yellow)", detail: "Threshold or aerobic effort. Keep HR controlled — don't go over." };
  if (tsb > -20) return { label: "Easy Run",               color: "var(--yellow)", detail: "Aerobic only. Heart rate Zone 1–2. Let your body absorb the load." };
  return           { label: "Rest Day",                    color: "var(--red)",    detail: "High overtraining risk. Prioritise sleep, nutrition, and no hard effort." };
}

// ── Load trend over last 7 vs prior 7 days ───────────────────────────────────
function getTrend(
  metrics: TrainingMetricRow[],
  cutoff7: string,
  cutoff14: string,
): "rising" | "falling" | "stable" {
  const last7 = metrics.filter((m) => m.activity_date >= cutoff7);
  const prev7 = metrics.filter((m) => m.activity_date >= cutoff14 && m.activity_date < cutoff7);
  const avg = (arr: TrainingMetricRow[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, m) => s + m.tss, 0) / 7;
  const a = avg(last7);
  const b = avg(prev7);
  if (b === 0) return "stable";
  if (a > b * 1.1) return "rising";
  if (a < b * 0.9) return "falling";
  return "stable";
}

export default function LoadPage() {
  const sb = createClient();
  const [metrics, setMetrics] = useState<TrainingMetricRow[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // 90-day window for accurate CTL EMA warm-up (42-day time constant needs
    // at least 84+ days of history to converge to ~88% of steady-state).
    const since = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

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

  // Compute date cutoffs once — same pattern as dashboard, avoids IIFE Date.now() calls
  const now = Date.now();
  const cutoff7d  = new Date(now -  7 * 86400000).toISOString().split("T")[0];
  const cutoff14d = new Date(now - 14 * 86400000).toISOString().split("T")[0];
  const cutoff42d = new Date(now - 42 * 86400000).toISOString().split("T")[0];

  let ctl: number, atl: number, tsb: number;
  if (hasMetrics) {
    ({ ctl, atl, tsb } = computeCTLATLTSB(metrics));
  } else {
    const calcAvg = (cutoff: string, days: number) => {
      const filtered = sessions.filter((s) => s.date >= cutoff);
      const total = filtered.reduce((sum, s) => sum + calcSessionTSSProxy(s.duration, s.rpe), 0);
      return Math.round(total / days);
    };
    ctl = calcAvg(cutoff42d, 42);
    atl = calcAvg(cutoff7d, 7);
    tsb = ctl - atl;
  }

  const zone = getLoadZone(tsb);
  const rec  = getRecommendation(tsb);
  const trend = hasMetrics ? getTrend(metrics, cutoff7d, cutoff14d) : "stable";
  const trendIcon = trend === "rising" ? "▲" : trend === "falling" ? "▼" : "→";
  const trendColor = trend === "rising" ? "var(--red)" : trend === "falling" ? "var(--green)" : "var(--text-dim)";

  // Chart: always 28 days
  const chartData = hasMetrics
    ? buildLoadChartData(metrics, 28)
    : (() => {
        const data: { date: string; tss: number }[] = [];
        for (let i = 27; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          const dateStr = d.toISOString().split("T")[0];
          const dayTSS = sessions
            .filter((s) => s.date === dateStr)
            .reduce((sum, s) => sum + calcSessionTSSProxy(s.duration, s.rpe), 0);
          data.push({ date: dateStr.slice(5), tss: dayTSS });
        }
        return data;
      })();

  const maxTSS = Math.max(...chartData.map((d) => d.tss), 1);
  const totalSessions = sessions.length;

  if (loading)
    return (
      <div>
        <PageHeader title="TRAINING LOAD" subtitle="ATL · CTL · TSB" />
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: 13 }}>Loading...</div>
      </div>
    );

  return (
    <div>
      <PageHeader
        title="TRAINING LOAD"
        subtitle={hasMetrics ? "TSS-based · Banister Model" : "RPE-based estimate"}
      />

      {totalSessions === 0 && !hasMetrics ? (
        <EmptyState message="No sessions logged yet — sync Strava or log a session to start tracking load" />
      ) : (
        <>
          {/* Data source badge */}
          {!hasMetrics && totalSessions > 0 && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 10px", borderRadius: 6, marginBottom: 12,
              background: "var(--surface2)", border: "1px solid var(--border)",
              fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)", letterSpacing: "0.06em",
            }}>
              Using RPE estimates — sync Strava runs for TSS-based metrics
            </div>
          )}

          {/* TSB Zone Banner */}
          <div style={{
            padding: "20px 24px", marginBottom: 16,
            background: "var(--surface)", border: `2px solid ${zone.color}`, borderRadius: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: zone.color, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>
                  Current Form
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: zone.color }}>
                  {zone.label}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
                  {zone.description}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 40, fontWeight: 700, color: zone.color, lineHeight: 1 }}>
                  {tsb > 0 ? "+" : ""}{tsb}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>
                  TSB
                </div>
              </div>
            </div>
          </div>

          {/* ATL / CTL / TSB metric cards */}
          <div className="grid-3" style={{ marginBottom: 16 }}>
            {[
              {
                label: "ATL — Fatigue",
                sublabel: hasMetrics ? "7-day EMA of TSS" : "7-day avg load",
                value: atl,
                color: "var(--red)",
                tooltip: "Acute Training Load: how fatigued your body is from the last 7 days of training.",
              },
              {
                label: "CTL — Fitness",
                sublabel: hasMetrics ? "42-day EMA of TSS" : "42-day avg load",
                value: ctl,
                color: "var(--green)",
                tooltip: "Chronic Training Load: your aerobic fitness built over the last 6 weeks.",
              },
              {
                label: "TSB — Form",
                sublabel: "CTL minus ATL",
                value: `${tsb > 0 ? "+" : ""}${tsb}`,
                color: zone.color,
                tooltip: "Training Stress Balance: positive = fresh, negative = fatigued. Race when TSB is +5 to +20.",
              },
            ].map(({ label, sublabel, value, color, tooltip }) => (
              <div
                key={label}
                title={tooltip}
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${color === zone.color ? color : "var(--border)"}`,
                  padding: 16, borderRadius: 10, cursor: "help",
                }}
              >
                <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 6 }}>
                  {label}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>{sublabel}</div>
              </div>
            ))}
          </div>

          {/* Recommended Today */}
          <div style={{
            padding: "16px 20px", marginBottom: 16,
            background: "var(--surface)", borderRadius: 10,
            border: `1px solid ${rec.color}`,
            display: "flex", alignItems: "center", gap: 16,
          }}>
            <div style={{
              fontFamily: "var(--mono)", fontSize: 10, color: rec.color,
              letterSpacing: "0.12em", textTransform: "uppercase",
              flexShrink: 0,
            }}>
              Today
            </div>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: rec.color, marginBottom: 3 }}>
                {rec.label}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{rec.detail}</div>
            </div>
          </div>

          {/* Load trend badge */}
          {hasMetrics && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                7-day Load Trend
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: trendColor }}>
                {trendIcon} {trend.charAt(0).toUpperCase() + trend.slice(1)}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {trend === "rising" ? "Training stress increasing vs prior week"
                 : trend === "falling" ? "Training stress decreasing vs prior week"
                 : "Load stable vs prior week"}
              </span>
            </div>
          )}

          {/* Zone guide */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
              Form Zones (TSB)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { range: "> +15",      label: "Fresh",        color: "var(--green)",  note: "Race-ready. Performance will be high." },
                { range: "0 to +15",   label: "Optimal",      color: "var(--accent)", note: "Peak window. Train hard and compete." },
                { range: "−10 to 0",   label: "Productive",   color: "var(--yellow)", note: "Building fitness. Normal fatigue." },
                { range: "−20 to −10", label: "Fatigued",     color: "var(--yellow)", note: "High fatigue. Monitor recovery closely." },
                { range: "< −20",      label: "Overreaching", color: "var(--red)",    note: "Overtraining risk. Reduce load immediately." },
              ].map(({ range, label, color, note }) => {
                const active =
                  (tsb > 15  && label === "Fresh")        ||
                  (tsb > 0   && tsb <= 15  && label === "Optimal")     ||
                  (tsb > -10 && tsb <= 0   && label === "Productive")  ||
                  (tsb > -20 && tsb <= -10 && label === "Fatigued")    ||
                  (tsb <= -20 && label === "Overreaching");
                return (
                  <div
                    key={label}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "8px 12px", borderRadius: 8,
                      background: active ? `${color}12` : "transparent",
                      border: `1px solid ${active ? color : "var(--border2)"}`,
                    }}
                  >
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color, width: 70, flexShrink: 0 }}>{range}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color, width: 96, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{note}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Daily TSS chart — 28 days */}
          <Card>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Daily {hasMetrics ? "TSS" : "Load"} — Last 28 Days
              </div>
              {hasMetrics && (
                <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                  peak {Math.max(...chartData.map((d) => d.tss))} TSS
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 100 }}>
              {chartData.map((d, i) => (
                <div
                  key={i}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}
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
                    <div style={{ fontFamily: "var(--mono)", fontSize: 7, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                      {d.date}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Week separators */}
            <div style={{ display: "flex", marginTop: 8, gap: 3 }}>
              {[0, 1, 2, 3].map((w) => (
                <div key={w} style={{ flex: 7, height: 1, background: "var(--border2)" }} />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
