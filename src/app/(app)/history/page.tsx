"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDuration, rpeToLabel } from "@/lib/utils";
import { Card, PageHeader, Field, Select, EmptyState } from "@/components/ui";
import type { Session } from "@/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const sb = createClient();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<
    "all" | "run" | "lift" | "study"
  >("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const load = useCallback(
    async (reset = false) => {
      setLoading(true);
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) return;

      const currentPage = reset ? 0 : page;

      let query = sb
        .from("sessions")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (typeFilter !== "all") query = query.eq("type", typeFilter);
      if (dateFrom) query = query.gte("date", dateFrom);
      if (dateTo) query = query.lte("date", dateTo);

      const { data, count } = await query;
      const sessionData = (data ?? []) as Session[];

      if (reset) {
        setSessions(sessionData);
        setPage(0);
      } else {
        setSessions((prev) =>
          currentPage === 0 ? sessionData : [...prev, ...sessionData],
        );
      }

      setTotal(count ?? 0);
      setHasMore((currentPage + 1) * PAGE_SIZE < (count ?? 0));
      setLoading(false);
    },
    [typeFilter, dateFrom, dateTo, page],
  );

  useEffect(() => {
    setPage(0);
    load(true);
  }, [typeFilter, dateFrom, dateTo]);

  function loadMore() {
    setPage((p) => p + 1);
  }

  useEffect(() => {
    if (page > 0) load();
  }, [page]);

  const typeColor: Record<string, string> = {
    run: "var(--green)",
    lift: "var(--purple)",
    study: "var(--yellow)",
  };

  const typeEmoji: Record<string, string> = {
    run: "🏃",
    lift: "🏋",
    study: "📚",
  };

  return (
    <div>
      <PageHeader
        title="SESSION HISTORY"
        subtitle={`${total} total sessions`}
      />

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px" }}>
            <Field label="Type">
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
              >
                <option value="all">All Types</option>
                <option value="run">Run</option>
                <option value="lift">Lift</option>
                <option value="study">Study</option>
              </Select>
            </Field>
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Field label="From">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "var(--bg)",
                  border: "1px solid var(--border2)",
                  color: "var(--text)",
                  outline: "none",
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                }}
              />
            </Field>
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Field label="To">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "var(--bg)",
                  border: "1px solid var(--border2)",
                  color: "var(--text)",
                  outline: "none",
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                }}
              />
            </Field>
          </div>
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "flex-end",
              paddingBottom: 16,
            }}
          >
            <button
              onClick={() => {
                setTypeFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
              style={{
                padding: "9px 16px",
                border: "1px solid var(--border2)",
                fontSize: 11,
                color: "var(--text-muted)",
                background: "none",
                cursor: "pointer",
                fontFamily: "var(--mono)",
                letterSpacing: "0.05em",
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </Card>

      {/* Session list */}
      <Card>
        {loading && sessions.length === 0 ? (
          <div
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--mono)",
              fontSize: 13,
              padding: 20,
            }}
          >
            Loading...
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState message="No sessions found — try adjusting the filters" />
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      flex: 1,
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
                      {typeEmoji[s.type]} {s.type}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text)",
                          marginBottom: 2,
                          wordBreak: "break-word",
                        }}
                      >
                        {s.notes || "—"}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-dim)",
                          fontFamily: "var(--mono)",
                        }}
                      >
                        RPE: {s.rpe}/10 · {rpeToLabel(s.rpe)}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--text)",
                      }}
                    >
                      {formatDuration(s.duration)}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {s.date}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  onClick={loadMore}
                  disabled={loading}
                  style={{
                    padding: "10px 24px",
                    border: "1px solid var(--border2)",
                    fontSize: 12,
                    color: "var(--text-muted)",
                    background: "none",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: "var(--mono)",
                    letterSpacing: "0.06em",
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  {loading
                    ? "Loading..."
                    : `Load more (${total - sessions.length} remaining)`}
                </button>
              </div>
            )}

            <div
              style={{
                textAlign: "center",
                marginTop: 12,
                fontSize: 11,
                color: "var(--text-dim)",
                fontFamily: "var(--mono)",
              }}
            >
              Showing {sessions.length} of {total} sessions
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
