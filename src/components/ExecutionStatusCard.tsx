"use client";

/**
 * ExecutionStatusCard — Phase 6A
 *
 * Displays today's execution status, this week's adherence, and the next
 * automatic adjustment (if any). Receives a pre-computed ExecutionSummary
 * from the parent page; performs no data fetching or computation of its own.
 */

import type { ExecutionDayStatus, ExecutionStatus, ExecutionSummary } from "@/lib/adaptiveExecution";

// ── Status meta ─────────────────────────────────────────────────────────────

const STATUS_META: Record<ExecutionStatus, { label: string; color: string }> = {
  planned:     { label: "PLANNED",     color: "var(--text-muted)" },
  in_progress: { label: "IN PROGRESS", color: "var(--yellow)"     },
  completed:   { label: "COMPLETED",   color: "var(--green)"      },
  skipped:     { label: "SKIPPED",     color: "var(--red)"        },
  rescheduled: { label: "RESCHEDULED", color: "var(--accent)"     },
  cancelled:   { label: "CANCELLED",   color: "var(--purple)"     },
};

function StatusPill({ status }: { status: ExecutionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        fontFamily:    "var(--mono)",
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: "0.10em",
        color:         meta.color,
        border:        `1px solid ${meta.color}55`,
        borderRadius:  4,
        padding:       "2px 8px",
      }}
    >
      {meta.label}
    </span>
  );
}

function AdherenceRing({ pct }: { pct: number }) {
  const color = pct >= 80 ? "var(--green)" : pct >= 55 ? "var(--yellow)" : "var(--red)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 90 }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)" }}>
        WEEKLY ADHERENCE
      </span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
        {pct}%
      </span>
      <div style={{ height: 3, background: "var(--border2)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 2, transition: "width 0.9s ease" }} />
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────

interface Props {
  summary: ExecutionSummary;
  today:   ExecutionDayStatus | undefined;
}

export function ExecutionStatusCard({ summary, today }: Props) {
  return (
    <div
      className="dash-card"
      style={{
        background:   "var(--surface)",
        border:       "1px solid var(--border)",
        marginBottom: 12,
        overflow:     "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding:        "12px 20px",
          borderBottom:   "1px solid var(--border2)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          flexWrap:       "wrap",
          gap:            8,
        }}
      >
        <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.20em", color: "var(--text-muted)" }}>
          EXECUTION STATUS
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em" }}>
          {summary.completedSessions} completed · {summary.missedSessions} missed
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 140 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)" }}>
            TODAY
          </span>
          {today ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                {today.plannedLabel}
              </span>
              <StatusPill status={today.status} />
            </div>
          ) : (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>No data</span>
          )}
        </div>

        <AdherenceRing pct={summary.adherencePct} />

        <div style={{ flex: "1 1 220px", minWidth: 220, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--text-dim)" }}>
            NEXT ADJUSTMENT
          </span>
          <span style={{ fontSize: 11, color: summary.replanningRequired ? "var(--text)" : "var(--text-dim)", lineHeight: 1.4 }}>
            {summary.nextAdjustment ?? "No adjustment needed — plan is on track."}
          </span>
        </div>
      </div>
    </div>
  );
}
