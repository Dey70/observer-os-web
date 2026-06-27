"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDuration, rpeToLabel } from "@/lib/utils";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import type { Session, GrowthLog } from "@/types";
import { Pencil, Trash2, Check, X } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
type ViewMode = "training" | "growth";
type CategoryKey = "study" | "project" | "learning" | "deep_work";

type TrainingEditState = {
  id: number;
  type: "run" | "lift" | "study";
  duration: number;
  rpe: number;
  notes: string;
  date: string;
};

type GrowthEditState = {
  id: string;
  category: CategoryKey;
  title: string;
  duration_min: number;
  focus_score: number;
  output_notes: string;
  date: string;
};

const GROWTH_CATEGORIES: { key: CategoryKey; label: string; color: string; emoji: string }[] = [
  { key: "study",     label: "Study",     color: "var(--accent)",  emoji: "📚" },
  { key: "project",   label: "Project",   color: "var(--green)",   emoji: "🛠️" },
  { key: "learning",  label: "Learning",  color: "var(--purple)",  emoji: "💡" },
  { key: "deep_work", label: "Deep Work", color: "var(--yellow)",  emoji: "🎯" },
];

// ── Shared style helpers ──────────────────────────────────────────────────────

const filterLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  marginBottom: 5,
  fontFamily: "var(--mono)",
};

const editLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 8,
  color: "var(--text-dim)",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  marginBottom: 4,
  fontFamily: "var(--mono)",
};

const deleteConfirmStyle: React.CSSProperties = {
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
};

const editPanelStyle: React.CSSProperties = {
  padding: "14px 12px",
  background: "rgba(232,255,71,0.025)",
  border: "1px solid rgba(232,255,71,0.15)",
  borderTop: "none",
  borderRadius: "0 0 10px 10px",
  animation: "fadeIn 0.15s ease-out",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "5px 12px",
  fontSize: 11,
  fontFamily: "var(--mono)",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.5)",
  borderRadius: 5,
  cursor: "pointer",
};

const countStyle: React.CSSProperties = {
  textAlign: "center",
  marginTop: 12,
  fontSize: 11,
  color: "var(--text-dim)",
  fontFamily: "var(--mono)",
};

const loadingStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--mono)",
  fontSize: 13,
  padding: 20,
};

function rowStyle(isEditing: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 12px",
    background: isEditing ? "rgba(232,255,71,0.04)" : "var(--surface2)",
    border: `1px solid ${isEditing ? "rgba(232,255,71,0.2)" : "var(--border)"}`,
    borderRadius: isEditing ? "10px 10px 0 0" : 8,
    gap: 8,
    transition: "all 0.15s",
  };
}

function badgeStyle(color: string): React.CSSProperties {
  return {
    fontFamily: "var(--mono)",
    fontSize: 9,
    letterSpacing: "0.08em",
    padding: "3px 7px",
    border: `1px solid ${color}`,
    color,
    textTransform: "uppercase",
    flexShrink: 0,
    borderRadius: 4,
  };
}

function iconBtnStyle(active: boolean, danger: boolean): React.CSSProperties {
  return {
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: active
      ? "rgba(232,255,71,0.1)"
      : danger
      ? "rgba(255,68,68,0.1)"
      : "rgba(255,255,255,0.05)",
    border: `1px solid ${active ? "rgba(232,255,71,0.3)" : danger ? "rgba(255,68,68,0.3)" : "rgba(255,255,255,0.08)"}`,
    borderRadius: 6,
    cursor: "pointer",
  };
}

function saveBtnStyle(disabled: boolean): React.CSSProperties {
  return {
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
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function deleteBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "5px 12px",
    fontSize: 11,
    fontFamily: "var(--mono)",
    background: "rgba(255,68,68,0.15)",
    border: "1px solid rgba(255,68,68,0.35)",
    color: "var(--red)",
    borderRadius: 5,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function loadMoreBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 24px",
    border: "1px solid var(--border2)",
    fontSize: 12,
    color: "var(--text-muted)",
    background: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "var(--mono)",
    opacity: disabled ? 0.5 : 1,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const sb = createClient();
  const [viewMode, setViewMode] = useState<ViewMode>("training");

  // ── Training state ────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<Session[]>([]);
  const [trainingLoading, setTrainingLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | "run" | "lift" | "study">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<TrainingEditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Growth state ──────────────────────────────────────────────────────────
  const [growthLogs, setGrowthLogs] = useState<GrowthLog[]>([]);
  const [growthLoading, setGrowthLoading] = useState(true);
  const [growthCatFilter, setGrowthCatFilter] = useState<"all" | CategoryKey>("all");
  const [growthDateFrom, setGrowthDateFrom] = useState("");
  const [growthDateTo, setGrowthDateTo] = useState("");
  const [growthPage, setGrowthPage] = useState(0);
  const [growthHasMore, setGrowthHasMore] = useState(false);
  const [growthTotal, setGrowthTotal] = useState(0);
  const [growthEditingId, setGrowthEditingId] = useState<string | null>(null);
  const [growthEditState, setGrowthEditState] = useState<GrowthEditState | null>(null);
  const [growthSaving, setGrowthSaving] = useState(false);
  const [growthConfirmDeleteId, setGrowthConfirmDeleteId] = useState<string | null>(null);
  const [growthDeleting, setGrowthDeleting] = useState(false);

  // ── Training: load ────────────────────────────────────────────────────────
  const loadTraining = useCallback(
    async (reset = false) => {
      setTrainingLoading(true);
      const { data: { user } } = await sb.auth.getUser();
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
        setSessions((prev) => currentPage === 0 ? sessionData : [...prev, ...sessionData]);
      }
      setTotal(count ?? 0);
      setHasMore((currentPage + 1) * PAGE_SIZE < (count ?? 0));
      setTrainingLoading(false);
    },
    [typeFilter, dateFrom, dateTo, page],
  );

  // ── Growth: load ──────────────────────────────────────────────────────────
  const loadGrowth = useCallback(
    async (reset = false) => {
      setGrowthLoading(true);
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      const currentPage = reset ? 0 : growthPage;
      let query = sb
        .from("growth_logs")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (growthCatFilter !== "all") query = query.eq("category", growthCatFilter);
      if (growthDateFrom) query = query.gte("date", growthDateFrom);
      if (growthDateTo) query = query.lte("date", growthDateTo);

      const { data, count } = await query;
      const logs = (data ?? []) as GrowthLog[];

      if (reset) {
        setGrowthLogs(logs);
        setGrowthPage(0);
      } else {
        setGrowthLogs((prev) => currentPage === 0 ? logs : [...prev, ...logs]);
      }
      setGrowthTotal(count ?? 0);
      setGrowthHasMore((currentPage + 1) * PAGE_SIZE < (count ?? 0));
      setGrowthLoading(false);
    },
    [growthCatFilter, growthDateFrom, growthDateTo, growthPage],
  );

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { setPage(0); loadTraining(true); }, [typeFilter, dateFrom, dateTo]);
  useEffect(() => { if (page > 0) loadTraining(); }, [page]);

  useEffect(() => { setGrowthPage(0); loadGrowth(true); }, [growthCatFilter, growthDateFrom, growthDateTo]);
  useEffect(() => { if (growthPage > 0) loadGrowth(); }, [growthPage]);

  // ── Training: edit / delete ───────────────────────────────────────────────
  function startEdit(s: Session) {
    setConfirmDeleteId(null);
    setEditingId(s.id);
    setEditState({ id: s.id, type: s.type, duration: s.duration, rpe: s.rpe, notes: s.notes ?? "", date: s.date });
  }
  function cancelEdit() { setEditingId(null); setEditState(null); }
  async function saveEdit() {
    if (!editState) return;
    setSaving(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setSaving(false); return; }
    await (sb as any).from("sessions").update({
      type: editState.type, duration: editState.duration,
      rpe: editState.rpe, notes: editState.notes.trim() || null, date: editState.date,
    }).eq("id", editState.id).eq("user_id", user.id);
    setSaving(false); setEditingId(null); setEditState(null);
    loadTraining(true);
  }
  async function deleteSession(id: number) {
    setDeleting(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setDeleting(false); return; }
    await (sb as any).from("sessions").delete().eq("id", id).eq("user_id", user.id);
    setDeleting(false); setConfirmDeleteId(null);
    loadTraining(true);
  }

  // ── Growth: edit / delete ─────────────────────────────────────────────────
  function startGrowthEdit(g: GrowthLog) {
    setGrowthConfirmDeleteId(null);
    setGrowthEditingId(g.id);
    setGrowthEditState({
      id: g.id, category: g.category, title: g.title,
      duration_min: g.duration_min, focus_score: g.focus_score ?? 5,
      output_notes: g.output_notes ?? "", date: g.date,
    });
  }
  function cancelGrowthEdit() { setGrowthEditingId(null); setGrowthEditState(null); }
  async function saveGrowthEdit() {
    if (!growthEditState) return;
    setGrowthSaving(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setGrowthSaving(false); return; }
    await (sb as any).from("growth_logs").update({
      category: growthEditState.category, title: growthEditState.title,
      duration_min: growthEditState.duration_min, focus_score: growthEditState.focus_score,
      output_notes: growthEditState.output_notes.trim() || null, date: growthEditState.date,
    }).eq("id", growthEditState.id).eq("user_id", user.id);
    setGrowthSaving(false); setGrowthEditingId(null); setGrowthEditState(null);
    loadGrowth(true);
  }
  async function deleteGrowthLog(id: string) {
    setGrowthDeleting(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setGrowthDeleting(false); return; }
    await (sb as any).from("growth_logs").delete().eq("id", id).eq("user_id", user.id);
    setGrowthDeleting(false); setGrowthConfirmDeleteId(null);
    loadGrowth(true);
  }

  // ── Shared input styles ───────────────────────────────────────────────────
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
  const selectStyle: React.CSSProperties = { ...inputStyle, colorScheme: "dark", cursor: "pointer" };

  const typeColor: Record<string, string> = { run: "var(--green)", lift: "var(--purple)", study: "var(--yellow)" };
  const typeEmoji: Record<string, string> = { run: "🏃", lift: "🏋", study: "📚" };

  const currentTotal = viewMode === "training" ? total : growthTotal;

  return (
    <div>
      <PageHeader title="SESSION HISTORY" subtitle={`${currentTotal} total sessions`} />

      {/* View toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["training", "growth"] as ViewMode[]).map((v) => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            style={{
              flex: 1,
              padding: "10px",
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "1px",
              textTransform: "uppercase",
              background: viewMode === v ? "rgba(232,255,71,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${viewMode === v ? "rgba(232,255,71,0.35)" : "var(--border)"}`,
              color: viewMode === v ? "#E8FF47" : "var(--text-muted)",
              borderRadius: 8,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {v === "training" ? "🏋 Training" : "📚 Growth"}
          </button>
        ))}
      </div>

      {viewMode === "training" ? (
        /* ── TRAINING VIEW ─────────────────────────────────────────────── */
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={filterLabelStyle}>TYPE</label>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} style={selectStyle}>
                  <option value="all">All Types</option>
                  <option value="run">Run</option>
                  <option value="lift">Lift</option>
                  <option value="study">Study</option>
                </select>
              </div>
              <div>
                <label style={filterLabelStyle}>FROM</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...inputStyle, colorScheme: "dark", display: "block", width: "100%" }} />
              </div>
              <div>
                <label style={filterLabelStyle}>TO</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...inputStyle, colorScheme: "dark", display: "block", width: "100%" }} />
              </div>
              <button
                onClick={() => { setTypeFilter("all"); setDateFrom(""); setDateTo(""); }}
                style={{ padding: "8px", border: "1px solid var(--border2)", fontSize: 11, color: "var(--text-muted)", background: "none", cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.05em", borderRadius: 6 }}
              >
                Clear Filters
              </button>
            </div>
          </Card>

          <Card>
            {trainingLoading && sessions.length === 0 ? (
              <div style={loadingStyle}>Loading...</div>
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
                        <div style={rowStyle(isEditing)}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
                            <span style={badgeStyle(typeColor[s.type])}>
                              {typeEmoji[s.type]} {s.type}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: "var(--text)", wordBreak: "break-word", lineHeight: 1.3 }}>
                                {s.notes || "—"}
                              </div>
                              <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)", marginTop: 2 }}>
                                RPE {s.rpe}/10 · {rpeToLabel(s.rpe)}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 }}>
                                {formatDuration(s.duration)}
                              </div>
                              <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-muted)" }}>
                                {s.date}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => isEditing ? cancelEdit() : startEdit(s)} style={iconBtnStyle(isEditing, false)}>
                                {isEditing
                                  ? <X size={14} color="rgba(232,255,71,0.8)" strokeWidth={2} />
                                  : <Pencil size={14} color="rgba(255,255,255,0.4)" strokeWidth={1.75} />}
                              </button>
                              <button onClick={() => { if (isEditing) cancelEdit(); setConfirmDeleteId(isConfirmingDelete ? null : s.id); }} style={iconBtnStyle(false, isConfirmingDelete)}>
                                <Trash2 size={14} color={isConfirmingDelete ? "var(--red)" : "rgba(255,255,255,0.4)"} strokeWidth={1.75} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {isConfirmingDelete && !isEditing && (
                          <div style={deleteConfirmStyle}>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "var(--mono)" }}>Delete permanently?</span>
                            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                              <button onClick={() => setConfirmDeleteId(null)} style={cancelBtnStyle}>Cancel</button>
                              <button onClick={() => deleteSession(s.id)} disabled={deleting} style={deleteBtnStyle(deleting)}>
                                {deleting ? "..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        )}

                        {isEditing && editState && (
                          <div style={editPanelStyle}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                              <div>
                                <label style={editLabelStyle}>Date</label>
                                <input type="date" value={editState.date} onChange={(e) => setEditState({ ...editState, date: e.target.value })} style={{ ...inputStyle, colorScheme: "dark" }} />
                              </div>
                              <div>
                                <label style={editLabelStyle}>Type</label>
                                <select value={editState.type} onChange={(e) => setEditState({ ...editState, type: e.target.value as any })} style={selectStyle}>
                                  <option value="run">Run</option>
                                  <option value="lift">Lift</option>
                                  <option value="study">Study</option>
                                </select>
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                              <div>
                                <label style={editLabelStyle}>Duration (min)</label>
                                <input type="number" min={1} max={600} value={editState.duration} onChange={(e) => setEditState({ ...editState, duration: parseInt(e.target.value) || 0 })} style={inputStyle} />
                              </div>
                              <div>
                                <label style={editLabelStyle}>RPE (1–10)</label>
                                <input type="number" min={1} max={10} value={editState.rpe} onChange={(e) => setEditState({ ...editState, rpe: parseInt(e.target.value) || 5 })} style={inputStyle} />
                              </div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <label style={editLabelStyle}>Notes</label>
                              <input type="text" value={editState.notes} onChange={(e) => setEditState({ ...editState, notes: e.target.value })} placeholder="How did it go?" style={inputStyle} />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={saveEdit} disabled={saving} style={saveBtnStyle(saving)}>
                                <Check size={11} strokeWidth={2.5} /> {saving ? "Saving..." : "Save"}
                              </button>
                              <button onClick={cancelEdit} style={cancelBtnStyle}>Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {hasMore && (
                  <div style={{ textAlign: "center", marginTop: 16 }}>
                    <button onClick={() => setPage((p) => p + 1)} disabled={trainingLoading} style={loadMoreBtnStyle(trainingLoading)}>
                      {trainingLoading ? "Loading..." : `Load more (${total - sessions.length} remaining)`}
                    </button>
                  </div>
                )}
                <div style={countStyle}>Showing {sessions.length} of {total} sessions</div>
              </>
            )}
          </Card>
        </>
      ) : (
        /* ── GROWTH VIEW ───────────────────────────────────────────────── */
        <>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={filterLabelStyle}>CATEGORY</label>
                <select value={growthCatFilter} onChange={(e) => setGrowthCatFilter(e.target.value as any)} style={selectStyle}>
                  <option value="all">All Categories</option>
                  {GROWTH_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={filterLabelStyle}>FROM</label>
                <input type="date" value={growthDateFrom} onChange={(e) => setGrowthDateFrom(e.target.value)} style={{ ...inputStyle, colorScheme: "dark", display: "block", width: "100%" }} />
              </div>
              <div>
                <label style={filterLabelStyle}>TO</label>
                <input type="date" value={growthDateTo} onChange={(e) => setGrowthDateTo(e.target.value)} style={{ ...inputStyle, colorScheme: "dark", display: "block", width: "100%" }} />
              </div>
              <button
                onClick={() => { setGrowthCatFilter("all"); setGrowthDateFrom(""); setGrowthDateTo(""); }}
                style={{ padding: "8px", border: "1px solid var(--border2)", fontSize: 11, color: "var(--text-muted)", background: "none", cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.05em", borderRadius: 6 }}
              >
                Clear Filters
              </button>
            </div>
          </Card>

          <Card>
            {growthLoading && growthLogs.length === 0 ? (
              <div style={loadingStyle}>Loading...</div>
            ) : growthLogs.length === 0 ? (
              <EmptyState message="No growth sessions found — try adjusting the filters" />
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {growthLogs.map((g) => {
                    const cat = GROWTH_CATEGORIES.find((c) => c.key === g.category)!;
                    const isEditing = growthEditingId === g.id;
                    const isConfirmingDelete = growthConfirmDeleteId === g.id;
                    return (
                      <div key={g.id}>
                        <div style={rowStyle(isEditing)}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
                            <span style={badgeStyle(cat.color)}>
                              {cat.emoji} {cat.label}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: "var(--text)", wordBreak: "break-word", lineHeight: 1.3 }}>
                                {g.title}
                              </div>
                              {g.output_notes && (
                                <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.4 }}>
                                  {g.output_notes}
                                </div>
                              )}
                              {g.focus_score !== null && (
                                <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)", marginTop: 2 }}>
                                  Focus {g.focus_score}/10
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 }}>
                                {formatDuration(g.duration_min)}
                              </div>
                              <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-muted)" }}>
                                {g.date}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => isEditing ? cancelGrowthEdit() : startGrowthEdit(g)} style={iconBtnStyle(isEditing, false)}>
                                {isEditing
                                  ? <X size={14} color="rgba(232,255,71,0.8)" strokeWidth={2} />
                                  : <Pencil size={14} color="rgba(255,255,255,0.4)" strokeWidth={1.75} />}
                              </button>
                              <button onClick={() => { if (isEditing) cancelGrowthEdit(); setGrowthConfirmDeleteId(isConfirmingDelete ? null : g.id); }} style={iconBtnStyle(false, isConfirmingDelete)}>
                                <Trash2 size={14} color={isConfirmingDelete ? "var(--red)" : "rgba(255,255,255,0.4)"} strokeWidth={1.75} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {isConfirmingDelete && !isEditing && (
                          <div style={deleteConfirmStyle}>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "var(--mono)" }}>Delete permanently?</span>
                            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                              <button onClick={() => setGrowthConfirmDeleteId(null)} style={cancelBtnStyle}>Cancel</button>
                              <button onClick={() => deleteGrowthLog(g.id)} disabled={growthDeleting} style={deleteBtnStyle(growthDeleting)}>
                                {growthDeleting ? "..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        )}

                        {isEditing && growthEditState && (
                          <div style={editPanelStyle}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                              <div>
                                <label style={editLabelStyle}>Date</label>
                                <input type="date" value={growthEditState.date} onChange={(e) => setGrowthEditState({ ...growthEditState, date: e.target.value })} style={{ ...inputStyle, colorScheme: "dark" }} />
                              </div>
                              <div>
                                <label style={editLabelStyle}>Category</label>
                                <select value={growthEditState.category} onChange={(e) => setGrowthEditState({ ...growthEditState, category: e.target.value as CategoryKey })} style={selectStyle}>
                                  {GROWTH_CATEGORIES.map((c) => (
                                    <option key={c.key} value={c.key}>{c.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div style={{ marginBottom: 8 }}>
                              <label style={editLabelStyle}>Title</label>
                              <input type="text" value={growthEditState.title} onChange={(e) => setGrowthEditState({ ...growthEditState, title: e.target.value })} style={inputStyle} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                              <div>
                                <label style={editLabelStyle}>Duration (min)</label>
                                <input type="number" min={1} max={1440} value={growthEditState.duration_min} onChange={(e) => setGrowthEditState({ ...growthEditState, duration_min: parseInt(e.target.value) || 0 })} style={inputStyle} />
                              </div>
                              <div>
                                <label style={editLabelStyle}>Focus (1–10)</label>
                                <input type="number" min={1} max={10} value={growthEditState.focus_score} onChange={(e) => setGrowthEditState({ ...growthEditState, focus_score: parseInt(e.target.value) || 5 })} style={inputStyle} />
                              </div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <label style={editLabelStyle}>Notes</label>
                              <input type="text" value={growthEditState.output_notes} onChange={(e) => setGrowthEditState({ ...growthEditState, output_notes: e.target.value })} placeholder="What did you accomplish?" style={inputStyle} />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={saveGrowthEdit} disabled={growthSaving} style={saveBtnStyle(growthSaving)}>
                                <Check size={11} strokeWidth={2.5} /> {growthSaving ? "Saving..." : "Save"}
                              </button>
                              <button onClick={cancelGrowthEdit} style={cancelBtnStyle}>Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {growthHasMore && (
                  <div style={{ textAlign: "center", marginTop: 16 }}>
                    <button onClick={() => setGrowthPage((p) => p + 1)} disabled={growthLoading} style={loadMoreBtnStyle(growthLoading)}>
                      {growthLoading ? "Loading..." : `Load more (${growthTotal - growthLogs.length} remaining)`}
                    </button>
                  </div>
                )}
                <div style={countStyle}>Showing {growthLogs.length} of {growthTotal} sessions</div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
