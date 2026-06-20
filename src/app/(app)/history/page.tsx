"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDuration, rpeToLabel } from "@/lib/utils";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import type { Session } from "@/types";
import { Pencil, Trash2, Check, X } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type EditState = {
  id: number;
  type: "run" | "lift" | "study";
  duration: number;
  rpe: number;
  notes: string;
  date: string;
};

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

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

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
  useEffect(() => {
    if (page > 0) load();
  }, [page]);

  function startEdit(s: Session) {
    setConfirmDeleteId(null);
    setEditingId(s.id);
    setEditState({
      id: s.id,
      type: s.type,
      duration: s.duration,
      rpe: s.rpe,
      notes: s.notes ?? "",
      date: s.date,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditState(null);
  }

  async function saveEdit() {
    if (!editState) return;
    setSaving(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    await (sb as any)
      .from("sessions")
      .update({
        type: editState.type,
        duration: editState.duration,
        rpe: editState.rpe,
        notes: editState.notes.trim() || null,
        date: editState.date,
      })
      .eq("id", editState.id)
      .eq("user_id", user.id);
    setSaving(false);
    setEditingId(null);
    setEditState(null);
    load(true);
  }

  async function deleteSession(id: number) {
    setDeleting(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setDeleting(false);
      return;
    }
    await (sb as any)
      .from("sessions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    setDeleting(false);
    setConfirmDeleteId(null);
    load(true);
  }

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

  const inputStyle: React.CSSProperties = {
    padding: "8px 10px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6,
    color: "var(--text)",
    outline: "none",
    fontFamily: "var(--mono)",
    fontSize: 12,
    width: "100%",
    boxSizing: "border-box",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    colorScheme: "dark",
    cursor: "pointer",
  };

  return (
    <div>
      <PageHeader
        title="SESSION HISTORY"
        subtitle={`${total} total sessions`}
      />

      {/* Filters — stacked on mobile */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Type filter */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                marginBottom: 5,
                fontFamily: "var(--mono)",
              }}
            >
              TYPE
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              style={selectStyle}
            >
              <option value="all">All Types</option>
              <option value="run">Run</option>
              <option value="lift">Lift</option>
              <option value="study">Study</option>
            </select>
          </div>

          {/* Date range — stacked, each full width */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                marginBottom: 5,
                fontFamily: "var(--mono)",
              }}
            >
              FROM
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                ...inputStyle,
                colorScheme: "dark",
                display: "block",
                width: "100%",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 9,
                color: "var(--text-muted)",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                marginBottom: 5,
                fontFamily: "var(--mono)",
              }}
            >
              TO
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                ...inputStyle,
                colorScheme: "dark",
                display: "block",
                width: "100%",
              }}
            />
          </div>

          {/* Clear */}
          <button
            onClick={() => {
              setTypeFilter("all");
              setDateFrom("");
              setDateTo("");
            }}
            style={{
              padding: "8px",
              border: "1px solid var(--border2)",
              fontSize: 11,
              color: "var(--text-muted)",
              background: "none",
              cursor: "pointer",
              fontFamily: "var(--mono)",
              letterSpacing: "0.05em",
              borderRadius: 6,
            }}
          >
            Clear Filters
          </button>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sessions.map((s) => {
                const isEditing = editingId === s.id;
                const isConfirmingDelete = confirmDeleteId === s.id;

                return (
                  <div key={s.id}>
                    {/* Main row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 12px",
                        background: isEditing
                          ? "rgba(232,255,71,0.04)"
                          : "var(--surface2)",
                        border: `1px solid ${isEditing ? "rgba(232,255,71,0.2)" : "var(--border)"}`,
                        borderRadius: isEditing ? "10px 10px 0 0" : 8,
                        gap: 8,
                        transition: "all 0.15s",
                      }}
                    >
                      {/* Left */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 9,
                            letterSpacing: "0.08em",
                            padding: "3px 7px",
                            border: `1px solid ${typeColor[s.type]}`,
                            color: typeColor[s.type],
                            textTransform: "uppercase",
                            flexShrink: 0,
                            borderRadius: 4,
                          }}
                        >
                          {typeEmoji[s.type]} {s.type}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--text)",
                              wordBreak: "break-word",
                              lineHeight: 1.3,
                            }}
                          >
                            {s.notes || "—"}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--text-dim)",
                              fontFamily: "var(--mono)",
                              marginTop: 2,
                            }}
                          >
                            RPE {s.rpe}/10 · {rpeToLabel(s.rpe)}
                          </div>
                        </div>
                      </div>

                      {/* Right */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexShrink: 0,
                        }}
                      >
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            {formatDuration(s.duration)}
                          </div>
                          <div
                            style={{
                              fontFamily: "var(--mono)",
                              fontSize: 9,
                              color: "var(--text-muted)",
                            }}
                          >
                            {s.date}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={() =>
                              isEditing ? cancelEdit() : startEdit(s)
                            }
                            style={{
                              width: 36,
                              height: 36,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: isEditing
                                ? "rgba(232,255,71,0.1)"
                                : "rgba(255,255,255,0.05)",
                              border: `1px solid ${isEditing ? "rgba(232,255,71,0.3)" : "rgba(255,255,255,0.08)"}`,
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            {isEditing ? (
                              <X
                                size={14}
                                color="rgba(232,255,71,0.8)"
                                strokeWidth={2}
                              />
                            ) : (
                              <Pencil
                                size={14}
                                color="rgba(255,255,255,0.4)"
                                strokeWidth={1.75}
                              />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              if (isEditing) cancelEdit();
                              setConfirmDeleteId(
                                isConfirmingDelete ? null : s.id,
                              );
                            }}
                            style={{
                              width: 36,
                              height: 36,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: isConfirmingDelete
                                ? "rgba(255,68,68,0.1)"
                                : "rgba(255,255,255,0.05)",
                              border: `1px solid ${isConfirmingDelete ? "rgba(255,68,68,0.3)" : "rgba(255,255,255,0.08)"}`,
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            <Trash2
                              size={14}
                              color={
                                isConfirmingDelete
                                  ? "var(--red)"
                                  : "rgba(255,255,255,0.4)"
                              }
                              strokeWidth={1.75}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Delete confirmation */}
                    {isConfirmingDelete && !isEditing && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          background: "rgba(255,68,68,0.06)",
                          border: "1px solid rgba(255,68,68,0.2)",
                          borderTop: "none",
                          borderRadius: "0 0 8px 8px",
                          animation: "fadeIn 0.15s ease-out",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: "rgba(255,255,255,0.5)",
                            fontFamily: "var(--mono)",
                          }}
                        >
                          Delete permanently?
                        </span>
                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              padding: "5px 12px",
                              fontSize: 11,
                              fontFamily: "var(--mono)",
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              color: "rgba(255,255,255,0.5)",
                              borderRadius: 5,
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => deleteSession(s.id)}
                            disabled={deleting}
                            style={{
                              padding: "5px 12px",
                              fontSize: 11,
                              fontFamily: "var(--mono)",
                              background: "rgba(255,68,68,0.15)",
                              border: "1px solid rgba(255,68,68,0.35)",
                              color: "var(--red)",
                              borderRadius: 5,
                              cursor: deleting ? "not-allowed" : "pointer",
                              opacity: deleting ? 0.6 : 1,
                            }}
                          >
                            {deleting ? "..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Edit panel */}
                    {isEditing && editState && (
                      <div
                        style={{
                          padding: "14px 12px",
                          background: "rgba(232,255,71,0.025)",
                          border: "1px solid rgba(232,255,71,0.15)",
                          borderTop: "none",
                          borderRadius: "0 0 10px 10px",
                          animation: "fadeIn 0.15s ease-out",
                        }}
                      >
                        {/* Row 1: Date + Type */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 8,
                            marginBottom: 8,
                          }}
                        >
                          <div>
                            <label
                              style={{
                                display: "block",
                                fontSize: 8,
                                color: "var(--text-dim)",
                                letterSpacing: "1.5px",
                                textTransform: "uppercase",
                                marginBottom: 4,
                                fontFamily: "var(--mono)",
                              }}
                            >
                              Date
                            </label>
                            <input
                              type="date"
                              value={editState.date}
                              onChange={(e) =>
                                setEditState({
                                  ...editState,
                                  date: e.target.value,
                                })
                              }
                              style={{ ...inputStyle, colorScheme: "dark" }}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                display: "block",
                                fontSize: 8,
                                color: "var(--text-dim)",
                                letterSpacing: "1.5px",
                                textTransform: "uppercase",
                                marginBottom: 4,
                                fontFamily: "var(--mono)",
                              }}
                            >
                              Type
                            </label>
                            <select
                              value={editState.type}
                              onChange={(e) =>
                                setEditState({
                                  ...editState,
                                  type: e.target.value as any,
                                })
                              }
                              style={selectStyle}
                            >
                              <option value="run">Run</option>
                              <option value="lift">Lift</option>
                              <option value="study">Study</option>
                            </select>
                          </div>
                        </div>

                        {/* Row 2: Duration + RPE */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 8,
                            marginBottom: 8,
                          }}
                        >
                          <div>
                            <label
                              style={{
                                display: "block",
                                fontSize: 8,
                                color: "var(--text-dim)",
                                letterSpacing: "1.5px",
                                textTransform: "uppercase",
                                marginBottom: 4,
                                fontFamily: "var(--mono)",
                              }}
                            >
                              Duration (min)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={600}
                              value={editState.duration}
                              onChange={(e) =>
                                setEditState({
                                  ...editState,
                                  duration: parseInt(e.target.value) || 0,
                                })
                              }
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                display: "block",
                                fontSize: 8,
                                color: "var(--text-dim)",
                                letterSpacing: "1.5px",
                                textTransform: "uppercase",
                                marginBottom: 4,
                                fontFamily: "var(--mono)",
                              }}
                            >
                              RPE (1–10)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={editState.rpe}
                              onChange={(e) =>
                                setEditState({
                                  ...editState,
                                  rpe: parseInt(e.target.value) || 5,
                                })
                              }
                              style={inputStyle}
                            />
                          </div>
                        </div>

                        {/* Row 3: Notes */}
                        <div style={{ marginBottom: 10 }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: 8,
                              color: "var(--text-dim)",
                              letterSpacing: "1.5px",
                              textTransform: "uppercase",
                              marginBottom: 4,
                              fontFamily: "var(--mono)",
                            }}
                          >
                            Notes
                          </label>
                          <input
                            type="text"
                            value={editState.notes}
                            onChange={(e) =>
                              setEditState({
                                ...editState,
                                notes: e.target.value,
                              })
                            }
                            placeholder="How did it go?"
                            style={inputStyle}
                          />
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "7px 14px",
                              background: "rgba(232,255,71,0.15)",
                              border: "1px solid rgba(232,255,71,0.35)",
                              color: "#E8FF47",
                              fontSize: 11,
                              fontFamily: "var(--mono)",
                              borderRadius: 6,
                              cursor: saving ? "not-allowed" : "pointer",
                              opacity: saving ? 0.6 : 1,
                            }}
                          >
                            <Check size={11} strokeWidth={2.5} />
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            style={{
                              padding: "7px 12px",
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              color: "rgba(255,255,255,0.4)",
                              fontSize: 11,
                              fontFamily: "var(--mono)",
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={loading}
                  style={{
                    padding: "10px 24px",
                    border: "1px solid var(--border2)",
                    fontSize: 12,
                    color: "var(--text-muted)",
                    background: "none",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: "var(--mono)",
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
