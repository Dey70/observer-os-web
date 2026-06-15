"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDuration, rpeToLabel } from "@/lib/utils";
import { Card, PageHeader, Field, Select, EmptyState } from "@/components/ui";
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

  // Edit/delete state
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
    padding: "7px 10px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6,
    color: "var(--text)",
    outline: "none",
    fontFamily: "var(--mono)",
    fontSize: 12,
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
                        padding: "12px 14px",
                        background: isEditing
                          ? "rgba(232,255,71,0.04)"
                          : "var(--surface2)",
                        border: `1px solid ${isEditing ? "rgba(232,255,71,0.2)" : "var(--border)"}`,
                        borderRadius: isEditing ? "10px 10px 0 0" : 8,
                        gap: 10,
                        transition: "all 0.15s",
                      }}
                    >
                      {/* Left: type badge + notes */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
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
                            }}
                          >
                            {s.notes || "—"}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--text-dim)",
                              fontFamily: "var(--mono)",
                              marginTop: 1,
                            }}
                          >
                            RPE {s.rpe}/10 · {rpeToLabel(s.rpe)}
                          </div>
                        </div>
                      </div>

                      {/* Right: duration + date + actions */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
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
                              fontSize: 10,
                              color: "var(--text-muted)",
                            }}
                          >
                            {s.date}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={() =>
                              isEditing ? cancelEdit() : startEdit(s)
                            }
                            title={isEditing ? "Cancel edit" : "Edit session"}
                            style={{
                              width: 30,
                              height: 30,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: isEditing
                                ? "rgba(232,255,71,0.1)"
                                : "rgba(255,255,255,0.05)",
                              border: `1px solid ${isEditing ? "rgba(232,255,71,0.3)" : "rgba(255,255,255,0.08)"}`,
                              borderRadius: 6,
                              cursor: "pointer",
                              transition: "all 0.15s",
                            }}
                          >
                            {isEditing ? (
                              <X
                                size={13}
                                color="rgba(232,255,71,0.8)"
                                strokeWidth={2}
                              />
                            ) : (
                              <Pencil
                                size={13}
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
                            title="Delete session"
                            style={{
                              width: 30,
                              height: 30,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: isConfirmingDelete
                                ? "rgba(255,68,68,0.1)"
                                : "rgba(255,255,255,0.05)",
                              border: `1px solid ${isConfirmingDelete ? "rgba(255,68,68,0.3)" : "rgba(255,255,255,0.08)"}`,
                              borderRadius: 6,
                              cursor: "pointer",
                              transition: "all 0.15s",
                            }}
                          >
                            <Trash2
                              size={13}
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

                    {/* Delete confirmation strip */}
                    {isConfirmingDelete && !isEditing && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: "rgba(255,68,68,0.06)",
                          border: "1px solid rgba(255,68,68,0.2)",
                          borderTop: "none",
                          borderRadius: "0 0 8px 8px",
                          animation: "fadeIn 0.15s ease-out",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: "rgba(255,255,255,0.5)",
                            fontFamily: "var(--mono)",
                          }}
                        >
                          Delete this session permanently?
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              padding: "5px 14px",
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
                              padding: "5px 14px",
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
                            {deleting ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Edit panel */}
                    {isEditing && editState && (
                      <div
                        style={{
                          padding: "16px 14px",
                          background: "rgba(232,255,71,0.025)",
                          border: "1px solid rgba(232,255,71,0.15)",
                          borderTop: "none",
                          borderRadius: "0 0 10px 10px",
                          animation: "fadeIn 0.15s ease-out",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                            marginBottom: 10,
                          }}
                        >
                          {/* Date */}
                          <div style={{ flex: "0 0 130px" }}>
                            <label
                              style={{
                                display: "block",
                                fontSize: 9,
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
                              style={{
                                ...inputStyle,
                                colorScheme: "dark",
                                width: "100%",
                              }}
                            />
                          </div>

                          {/* Type */}
                          <div style={{ flex: "0 0 110px" }}>
                            <label
                              style={{
                                display: "block",
                                fontSize: 9,
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
                              style={{
                                ...inputStyle,
                                width: "100%",
                                cursor: "pointer",
                                colorScheme: "dark",
                              }}
                            >
                              <option value="run">Run</option>
                              <option value="lift">Lift</option>
                              <option value="study">Study</option>
                            </select>
                          </div>

                          {/* Duration */}
                          <div style={{ flex: "0 0 100px" }}>
                            <label
                              style={{
                                display: "block",
                                fontSize: 9,
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
                              style={{ ...inputStyle, width: "100%" }}
                            />
                          </div>

                          {/* RPE */}
                          <div style={{ flex: "0 0 80px" }}>
                            <label
                              style={{
                                display: "block",
                                fontSize: 9,
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
                              style={{ ...inputStyle, width: "100%" }}
                            />
                          </div>

                          {/* Notes */}
                          <div style={{ flex: "1 1 200px" }}>
                            <label
                              style={{
                                display: "block",
                                fontSize: 9,
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
                              style={{ ...inputStyle, width: "100%" }}
                            />
                          </div>
                        </div>

                        {/* Save / Cancel */}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "7px 16px",
                              background: saving
                                ? "rgba(232,255,71,0.1)"
                                : "rgba(232,255,71,0.15)",
                              border: "1px solid rgba(232,255,71,0.35)",
                              color: "#E8FF47",
                              fontSize: 11,
                              fontFamily: "var(--mono)",
                              letterSpacing: "0.08em",
                              borderRadius: 6,
                              cursor: saving ? "not-allowed" : "pointer",
                              opacity: saving ? 0.6 : 1,
                            }}
                          >
                            <Check size={12} strokeWidth={2.5} />
                            {saving ? "Saving..." : "Save changes"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            style={{
                              padding: "7px 14px",
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

            {/* Load more */}
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
