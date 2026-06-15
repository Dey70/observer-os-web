"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Card, SectionLabel, EmptyState } from "@/components/ui";
import {
  Heart,
  Wind,
  Zap,
  Percent,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

export const dynamic = "force-dynamic";

type MetricLog = {
  id: number;
  date: string;
  hrv: number | null;
  resting_hr: number | null;
  vo2max: number | null;
  body_fat: number | null;
  notes: string | null;
};

const METRICS = [
  {
    key: "hrv" as const,
    label: "HRV",
    unit: "ms",
    icon: Zap,
    color: "#E8FF47",
    description: "Heart Rate Variability — higher is better",
    goodDirection: "up",
    placeholder: "45",
    min: 10,
    max: 200,
  },
  {
    key: "resting_hr" as const,
    label: "Resting HR",
    unit: "bpm",
    icon: Heart,
    color: "#FF4444",
    description: "Resting Heart Rate — lower is better",
    goodDirection: "down",
    placeholder: "55",
    min: 30,
    max: 120,
  },
  {
    key: "vo2max" as const,
    label: "VO2 Max",
    unit: "ml/kg/min",
    icon: Wind,
    color: "#00E676",
    description: "Aerobic capacity — higher is better",
    goodDirection: "up",
    placeholder: "45",
    min: 20,
    max: 90,
  },
  {
    key: "body_fat" as const,
    label: "Body Fat",
    unit: "%",
    icon: Percent,
    color: "#A78BFA",
    description: "Body fat percentage",
    goodDirection: "down",
    placeholder: "15",
    min: 3,
    max: 50,
  },
];

function MiniChart({
  data,
  color,
  goodDirection,
}: {
  data: { date: string; value: number }[];
  color: string;
  goodDirection: "up" | "down";
}) {
  if (data.length < 2) return null;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 120,
    H = 40;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((d.value - min) / range) * (H - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");

  const last = values[values.length - 1];
  const first = values[0];
  const delta = last - first;
  const isGood = goodDirection === "up" ? delta >= 0 : delta <= 0;
  const trendColor =
    Math.abs(delta) < 0.5
      ? "rgba(255,255,255,0.3)"
      : isGood
        ? "#00E676"
        : "#FF4444";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
        />
        {/* Last point dot */}
        {(() => {
          const lastPt = points.split(" ").pop()!.split(",");
          return <circle cx={lastPt[0]} cy={lastPt[1]} r="3" fill={color} />;
        })()}
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        {Math.abs(delta) < 0.5 ? (
          <Minus size={11} color={trendColor} />
        ) : delta > 0 ? (
          <TrendingUp size={11} color={trendColor} />
        ) : (
          <TrendingDown size={11} color={trendColor} />
        )}
        <span
          style={{ fontFamily: "var(--mono)", fontSize: 10, color: trendColor }}
        >
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export default function MetricsPage() {
  const sb = createClient();
  const [logs, setLogs] = useState<MetricLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [vals, setVals] = useState<Record<string, string>>({
    hrv: "",
    resting_hr: "",
    vo2max: "",
    body_fat: "",
  });
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    const { data } = await (sb as any)
      .from("body_metrics")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(30);

    const logData = (data ?? []) as MetricLog[];
    setLogs(logData);

    // Pre-fill today's values if already logged
    const todayStr = new Date().toISOString().split("T")[0];
    const todayLog = logData.find((l) => l.date === todayStr);
    if (todayLog) {
      setVals({
        hrv: todayLog.hrv?.toString() ?? "",
        resting_hr: todayLog.resting_hr?.toString() ?? "",
        vo2max: todayLog.vo2max?.toString() ?? "",
        body_fat: todayLog.body_fat?.toString() ?? "",
      });
      setNotes(todayLog.notes ?? "");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const payload = {
      user_id: user.id,
      date,
      hrv: vals.hrv ? parseFloat(vals.hrv) : null,
      resting_hr: vals.resting_hr ? parseFloat(vals.resting_hr) : null,
      vo2max: vals.vo2max ? parseFloat(vals.vo2max) : null,
      body_fat: vals.body_fat ? parseFloat(vals.body_fat) : null,
      notes: notes.trim() || null,
    };

    const { error } = await (sb as any)
      .from("body_metrics")
      .upsert(payload, { onConflict: "user_id,date" });

    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      load();
    }
    setSaving(false);
  }

  // Latest value for each metric
  function getLatest(key: keyof MetricLog) {
    for (const log of logs) {
      const v = log[key];
      if (v !== null && v !== undefined) return v as number;
    }
    return null;
  }

  // Chart data for each metric (last 14 days with values)
  function getChartData(key: keyof MetricLog) {
    return logs
      .filter((l) => l[key] !== null)
      .slice(0, 14)
      .reverse()
      .map((l) => ({ date: l.date.slice(5), value: l[key] as number }));
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10,
    color: "var(--text)",
    outline: "none",
    fontFamily: "var(--mono)",
    fontSize: 14,
    boxSizing: "border-box",
  };

  if (loading)
    return (
      <div>
        <PageHeader
          title="BODY METRICS"
          subtitle="HRV · Resting HR · VO2 Max · Body Fat"
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

  return (
    <div>
      <PageHeader
        title="BODY METRICS"
        subtitle="Track physiological markers over time"
      />

      {/* Current metric cards */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        {METRICS.map(
          ({ key, label, unit, icon: Icon, color, goodDirection }) => {
            const latest = getLatest(key as keyof MetricLog);
            const chartData = getChartData(key as keyof MetricLog);

            return (
              <div
                key={key}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16,
                  padding: 16,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Top color bar */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: color,
                    borderRadius: "16px 16px 0 0",
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Icon size={14} color={color} strokeWidth={1.75} />
                  <span
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.4)",
                      fontFamily: "var(--mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {label}
                  </span>
                </div>

                {latest !== null ? (
                  <>
                    <div
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 28,
                        fontWeight: 700,
                        color,
                        lineHeight: 1,
                        marginBottom: 4,
                      }}
                    >
                      {latest}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.3)",
                        fontFamily: "var(--mono)",
                        marginBottom: 12,
                      }}
                    >
                      {unit}
                    </div>
                    <MiniChart
                      data={chartData}
                      color={color}
                      goodDirection={goodDirection as "up" | "down"}
                    />
                  </>
                ) : (
                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.2)",
                      fontFamily: "var(--mono)",
                      paddingTop: 4,
                    }}
                  >
                    No data yet
                  </div>
                )}
              </div>
            );
          },
        )}
      </div>

      {/* Log form */}
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Log Today's Metrics</SectionLabel>

        {/* Date */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              marginBottom: 6,
              fontFamily: "var(--mono)",
            }}
          >
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ ...inputStyle, colorScheme: "dark" }}
          />
        </div>

        {/* Metric inputs — 2x2 grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {METRICS.map(
            ({ key, label, unit, color, placeholder, icon: Icon }) => (
              <div key={key}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 9,
                    color: "rgba(255,255,255,0.4)",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    marginBottom: 6,
                    fontFamily: "var(--mono)",
                  }}
                >
                  <Icon size={10} color={color} strokeWidth={2} />
                  {label} ({unit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder={placeholder}
                  value={vals[key]}
                  onChange={(e) =>
                    setVals((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  style={{
                    ...inputStyle,
                    borderColor: vals[key]
                      ? `${color}40`
                      : "rgba(255,255,255,0.1)",
                  }}
                />
              </div>
            ),
          )}
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              marginBottom: 6,
              fontFamily: "var(--mono)",
            }}
          >
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. After morning coffee, before workout..."
            style={inputStyle}
          />
        </div>

        {/* Save */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "11px 24px",
              background: "var(--accent)",
              border: "none",
              borderRadius: 8,
              color: "#000",
              fontFamily: "var(--mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Metrics"}
          </button>
          {saved && (
            <span
              style={{
                fontSize: 11,
                color: "var(--green)",
                fontFamily: "var(--mono)",
              }}
            >
              ✓ Saved
            </span>
          )}
        </div>
      </Card>

      {/* History table */}
      <Card>
        <SectionLabel>History (Last 30 days)</SectionLabel>
        {logs.length === 0 ? (
          <EmptyState message="No metrics logged yet — add your first entry above" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "var(--mono)",
                fontSize: 12,
              }}
            >
              <thead>
                <tr>
                  {[
                    "Date",
                    "HRV (ms)",
                    "Resting HR",
                    "VO2 Max",
                    "Body Fat %",
                    "Notes",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        fontSize: 9,
                        color: "rgba(255,255,255,0.3)",
                        letterSpacing: "1.5px",
                        textTransform: "uppercase",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom:
                        i < logs.length - 1
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "none",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 12px",
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
                      {log.date}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        color: log.hrv ? "#E8FF47" : "rgba(255,255,255,0.2)",
                      }}
                    >
                      {log.hrv ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        color: log.resting_hr
                          ? "#FF4444"
                          : "rgba(255,255,255,0.2)",
                      }}
                    >
                      {log.resting_hr ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        color: log.vo2max ? "#00E676" : "rgba(255,255,255,0.2)",
                      }}
                    >
                      {log.vo2max ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        color: log.body_fat
                          ? "#A78BFA"
                          : "rgba(255,255,255,0.2)",
                      }}
                    >
                      {log.body_fat ? `${log.body_fat}%` : "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        color: "rgba(255,255,255,0.4)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {log.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Reference ranges */}
      <Card>
        <SectionLabel>Reference Ranges</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            {
              metric: "HRV",
              color: "#E8FF47",
              ranges: [
                {
                  label: "Low",
                  range: "< 20ms",
                  note: "High stress / poor recovery",
                },
                {
                  label: "Average",
                  range: "20–60ms",
                  note: "Normal for most adults",
                },
                {
                  label: "High",
                  range: "> 60ms",
                  note: "Excellent recovery / fitness",
                },
              ],
            },
            {
              metric: "Resting HR",
              color: "#FF4444",
              ranges: [
                { label: "Athlete", range: "< 50 bpm", note: "Highly trained" },
                {
                  label: "Good",
                  range: "50–70 bpm",
                  note: "Normal healthy adult",
                },
                {
                  label: "High",
                  range: "> 80 bpm",
                  note: "Consider reducing stress/caffeine",
                },
              ],
            },
            {
              metric: "VO2 Max",
              color: "#00E676",
              ranges: [
                { label: "Poor", range: "< 35", note: "Below average" },
                { label: "Good", range: "45–55", note: "Above average" },
                {
                  label: "Elite",
                  range: "> 60",
                  note: "Competitive athlete level",
                },
              ],
            },
          ].map(({ metric, color, ranges }) => (
            <div
              key={metric}
              style={{
                padding: "12px 14px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--mono)",
                  color,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                {metric}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {ranges.map(({ label, range, note }) => (
                  <div key={label}>
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--mono)",
                        color: "rgba(255,255,255,0.7)",
                        marginBottom: 2,
                      }}
                    >
                      {label}: <span style={{ color }}>{range}</span>
                    </div>
                    <div
                      style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}
                    >
                      {note}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
