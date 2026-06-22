"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { Trophy, Activity, Dumbbell, BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

type PR = {
  id: number;
  type: string;
  metric: string;
  value: number;
  date: string;
};

function fmtDuration(v: number): string {
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const METRIC_META: Record<
  string,
  { label: string; format: (v: number) => string }
> = {
  longest_run: { label: "Longest Run", format: fmtDuration },
  highest_load_run: { label: "Highest Run Load", format: (v) => `${v} pts` },
  longest_lift: { label: "Longest Lift Session", format: fmtDuration },
  highest_load_lift: { label: "Highest Lift Load", format: (v) => `${v} pts` },
  longest_study: { label: "Longest Study Session", format: fmtDuration },
  highest_focus_load: {
    label: "Highest Focus Load",
    format: (v) => `${v} pts`,
  },
  highest_load_study: {
    label: "Highest Study Load",
    format: (v) => `${v} pts`,
  },
  strava_longest_km: {
    label: "Longest Run (Strava)",
    format: (v) => `${v.toFixed(2)} km`,
  },
  strava_best_pace: {
    label: "Best Pace (Strava)",
    format: (v) => {
      const mins = Math.floor(v / 60);
      const secs = Math.round(v % 60);
      return `${mins}:${String(secs).padStart(2, "0")} /km`;
    },
  },
  strava_total_runs: {
    label: "Total Runs",
    format: (v) => String(Math.round(v)),
  },
  strava_total_km: {
    label: "Total Distance",
    format: (v) => `${Math.round(v)} km`,
  },
};

const TYPE_COLOR: Record<string, string> = {
  run: "#00E676",
  lift: "#A78BFA",
  study: "#FFB800",
};

const TYPE_ICON: Record<string, React.ElementType> = {
  run: Activity,
  lift: Dumbbell,
  study: BookOpen,
};

export default function RecordsPage() {
  const sb = createClient();
  const [prs, setPRs] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    const { data } = await (sb as any)
      .from("personal_records")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false });

    setPRs((data ?? []) as PR[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped: Record<string, PR[]> = {};
  for (const pr of prs) {
    if (!grouped[pr.type]) grouped[pr.type] = [];
    grouped[pr.type].push(pr);
  }

  if (loading)
    return (
      <div>
        <PageHeader title="PERSONAL RECORDS" subtitle="Your all-time bests" />
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
        title="PERSONAL RECORDS"
        subtitle="Auto-detected from your sessions"
      />

      {prs.length === 0 ? (
        <Card>
          <EmptyState message="No records yet — log sessions to start tracking PRs" />
        </Card>
      ) : (
        Object.entries(grouped).map(([type, records]) => {
          const Icon = TYPE_ICON[type] ?? Activity;
          const color = TYPE_COLOR[type] ?? "var(--accent)";
          return (
            <Card key={type} style={{ marginBottom: 16 }}>
              {/* Type header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${color}15`,
                    border: `1px solid ${color}30`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={18} color={color} strokeWidth={1.75} />
                </div>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 13,
                    fontWeight: 700,
                    color,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {type}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {records.map((pr) => {
                  const meta = METRIC_META[pr.metric];
                  if (!meta) return null;
                  return (
                    <div
                      key={pr.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 14px",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 10,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Trophy size={14} color="#FFB800" strokeWidth={1.75} />
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--text)",
                              fontWeight: 500,
                            }}
                          >
                            {meta.label}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--text-dim)",
                              fontFamily: "var(--mono)",
                              marginTop: 2,
                            }}
                          >
                            Set on {pr.date}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#FFB800",
                        }}
                      >
                        {meta.format(pr.value)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
