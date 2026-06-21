// src/app/(app)/nutrition/my-foods/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Card, SectionLabel, EmptyState } from "@/components/ui";
import {
  BookmarkCheck,
  Pencil,
  Trash2,
  Check,
  X,
  Plus,
  Search,
  ChevronLeft,
} from "lucide-react";

export const dynamic = "force-dynamic";

type UserFoodRow = {
  id: number;
  name: string;
  aliases: string[];
  serving_desc: string;
  serving_grams: number;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
  times_used: number;
  confidence: string;
  created_at: string;
  last_used_at: string;
};

const BLANK: Omit<
  UserFoodRow,
  "id" | "created_at" | "last_used_at" | "times_used" | "confidence"
> = {
  name: "",
  aliases: [],
  serving_desc: "1 serving",
  serving_grams: 100,
  calories_per_100g: 0,
  protein_per_100g: 0,
  carbs_per_100g: 0,
  fat_per_100g: 0,
  fiber_per_100g: 0,
};

const FIELD_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  outline: "none",
  fontFamily: "var(--mono)",
  fontSize: 12,
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 9,
  color: "var(--text-dim)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontFamily: "var(--mono)",
  display: "block",
  marginBottom: 4,
};

function relativeTime(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function NutritionFields({
  draft,
  onChange,
}: {
  draft: Record<string, number>;
  onChange: (key: string, val: number) => void;
}) {
  const fields: { key: string; label: string }[] = [
    { key: "calories_per_100g", label: "kcal" },
    { key: "protein_per_100g", label: "P" },
    { key: "carbs_per_100g", label: "C" },
    { key: "fat_per_100g", label: "F" },
    { key: "fiber_per_100g", label: "Fi" },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 6,
        marginBottom: 10,
      }}
    >
      {fields.map(({ key, label }) => (
        <div key={key}>
          <label style={LABEL_STYLE}>{label}/100g</label>
          <input
            type="number"
            value={draft[key] ?? 0}
            onChange={(e) => onChange(key, parseFloat(e.target.value) || 0)}
            style={FIELD_STYLE}
          />
        </div>
      ))}
    </div>
  );
}

export default function MyFoodsPage() {
  const sb = createClient();
  const [foods, setFoods] = useState<UserFoodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<UserFoodRow | null>(null);
  const [editAliases, setEditAliases] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addDraft, setAddDraft] = useState({ ...BLANK });
  const [addAliases, setAddAliases] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const { data } = await (sb as any)
      .from("user_foods")
      .select("*")
      .eq("user_id", user.id)
      .order("times_used", { ascending: false });
    setFoods((data ?? []) as UserFoodRow[]);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = search.trim()
    ? foods.filter((f) => {
        const q = search.toLowerCase().trim();
        return (
          f.name.includes(q) || f.aliases.some((a) => a.includes(q))
        );
      })
    : foods;

  const totalUses = foods.reduce((s, f) => s + f.times_used, 0);
  const verifiedCount = foods.filter((f) => f.confidence === "verified").length;

  function startEdit(food: UserFoodRow) {
    setEditingId(food.id);
    setEditDraft({ ...food });
    setEditAliases(food.aliases.join(", "));
    setDeletingId(null);
    setShowAdd(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setEditAliases("");
  }

  async function saveEdit() {
    if (!editDraft) return;
    setSaving(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const aliases = editAliases
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    await (sb as any)
      .from("user_foods")
      .update({
        name: editDraft.name.toLowerCase().trim(),
        aliases,
        serving_desc: editDraft.serving_desc,
        serving_grams: editDraft.serving_grams,
        calories_per_100g: editDraft.calories_per_100g,
        protein_per_100g: editDraft.protein_per_100g,
        carbs_per_100g: editDraft.carbs_per_100g,
        fat_per_100g: editDraft.fat_per_100g,
        fiber_per_100g: editDraft.fiber_per_100g,
      })
      .eq("id", editDraft.id)
      .eq("user_id", user.id);
    cancelEdit();
    await load();
    setSaving(false);
  }

  async function deleteFood(id: number) {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    await (sb as any)
      .from("user_foods")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    setDeletingId(null);
    load();
  }

  async function addFood() {
    if (!addDraft.name.trim() || addDraft.calories_per_100g <= 0) return;
    setSaving(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    const aliases = addAliases
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    await (sb as any).from("user_foods").insert({
      user_id: user.id,
      name: addDraft.name.toLowerCase().trim(),
      aliases,
      serving_desc: addDraft.serving_desc,
      serving_grams: addDraft.serving_grams,
      calories_per_100g: addDraft.calories_per_100g,
      protein_per_100g: addDraft.protein_per_100g,
      carbs_per_100g: addDraft.carbs_per_100g,
      fat_per_100g: addDraft.fat_per_100g,
      fiber_per_100g: addDraft.fiber_per_100g,
      confidence: "verified",
      times_used: 0,
    });
    setShowAdd(false);
    setAddDraft({ ...BLANK });
    setAddAliases("");
    await load();
    setSaving(false);
  }

  if (loading)
    return (
      <div>
        <PageHeader
          title="MY FOODS"
          subtitle="Observer's memory of your food environment"
        />
        <div
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--mono)",
            fontSize: 13,
          }}
        >
          Loading…
        </div>
      </div>
    );

  return (
    <div style={{ maxWidth: 760 }}>
      <Link
        href="/nutrition"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          color: "var(--text-dim)",
          fontFamily: "var(--mono)",
          textDecoration: "none",
          marginBottom: 8,
        }}
      >
        <ChevronLeft size={12} /> Nutrition
      </Link>

      <PageHeader
        title="MY FOODS"
        subtitle="Observer's memory of your food environment"
      />

      {/* Analytics bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {[
          { value: foods.length, label: "Foods saved" },
          { value: verifiedCount, label: "Verified" },
          { value: totalUses, label: "Total uses" },
        ].map(({ value, label }) => (
          <div
            key={label}
            style={{
              padding: "12px 14px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--purple)",
              }}
            >
              {value}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                marginTop: 2,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontFamily: "var(--mono)",
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            size={12}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-dim)",
              pointerEvents: "none",
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search foods or aliases…"
            style={{
              ...FIELD_STYLE,
              paddingLeft: 28,
              borderRadius: 8,
              padding: "8px 10px 8px 28px",
            }}
          />
        </div>
        <button
          onClick={() => {
            setShowAdd((v) => !v);
            setEditingId(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "8px 14px",
            background: showAdd ? "var(--surface2)" : "var(--purple)",
            border: showAdd ? "1px solid var(--border)" : "none",
            borderRadius: 8,
            color: showAdd ? "var(--text-muted)" : "var(--bg)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {showAdd ? <X size={12} /> : <Plus size={12} />}
          {showAdd ? "Cancel" : "Add Food"}
        </button>
      </div>

      {/* Add food form */}
      {showAdd && (
        <Card style={{ borderColor: "var(--purple)", marginBottom: 14 }}>
          <SectionLabel>Add New Food</SectionLabel>
          <div style={{ marginBottom: 8 }}>
            <label style={LABEL_STYLE}>Food name (used as lookup key)</label>
            <input
              value={addDraft.name}
              onChange={(e) =>
                setAddDraft({ ...addDraft, name: e.target.value })
              }
              placeholder="e.g. hostel dal"
              style={FIELD_STYLE}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={LABEL_STYLE}>
              Aliases — comma-separated alternative names
            </label>
            <input
              value={addAliases}
              onChange={(e) => setAddAliases(e.target.value)}
              placeholder="e.g. mess dal, yellow dal, dal"
              style={FIELD_STYLE}
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div>
              <label style={LABEL_STYLE}>Serving description</label>
              <input
                value={addDraft.serving_desc}
                onChange={(e) =>
                  setAddDraft({ ...addDraft, serving_desc: e.target.value })
                }
                style={FIELD_STYLE}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Serving grams</label>
              <input
                type="number"
                value={addDraft.serving_grams}
                onChange={(e) =>
                  setAddDraft({
                    ...addDraft,
                    serving_grams: parseFloat(e.target.value) || 100,
                  })
                }
                style={FIELD_STYLE}
              />
            </div>
          </div>
          <NutritionFields
            draft={addDraft as unknown as Record<string, number>}
            onChange={(key, val) =>
              setAddDraft((prev) => ({ ...prev, [key]: val }))
            }
          />
          <button
            onClick={addFood}
            disabled={
              saving || !addDraft.name.trim() || addDraft.calories_per_100g <= 0
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 14px",
              background:
                saving || !addDraft.name.trim() || addDraft.calories_per_100g <= 0
                  ? "var(--surface2)"
                  : "var(--purple)",
              border: "none",
              borderRadius: 6,
              color:
                saving || !addDraft.name.trim() || addDraft.calories_per_100g <= 0
                  ? "var(--text-dim)"
                  : "var(--bg)",
              fontFamily: "var(--mono)",
              fontSize: 11,
              fontWeight: 700,
              cursor:
                saving || !addDraft.name.trim() || addDraft.calories_per_100g <= 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            <Check size={11} strokeWidth={2.5} /> Save Food
          </button>
        </Card>
      )}

      {/* Food list */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            message={
              search
                ? `No foods matching "${search}"`
                : "No foods saved yet — pin foods while logging to build your library"
            }
          />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((food) => (
            <Card
              key={food.id}
              style={{
                borderColor:
                  editingId === food.id ? "var(--purple)" : undefined,
              }}
            >
              {editingId === food.id && editDraft ? (
                /* ── Edit form ── */
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={LABEL_STYLE}>Food name</label>
                    <input
                      value={editDraft.name}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, name: e.target.value })
                      }
                      style={FIELD_STYLE}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={LABEL_STYLE}>
                      Aliases — comma-separated
                    </label>
                    <input
                      value={editAliases}
                      onChange={(e) => setEditAliases(e.target.value)}
                      placeholder="e.g. mess dal, yellow dal"
                      style={FIELD_STYLE}
                    />
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <label style={LABEL_STYLE}>Serving description</label>
                      <input
                        value={editDraft.serving_desc}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            serving_desc: e.target.value,
                          })
                        }
                        style={FIELD_STYLE}
                      />
                    </div>
                    <div>
                      <label style={LABEL_STYLE}>Serving grams</label>
                      <input
                        type="number"
                        value={editDraft.serving_grams}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            serving_grams: parseFloat(e.target.value) || 100,
                          })
                        }
                        style={FIELD_STYLE}
                      />
                    </div>
                  </div>
                  <NutritionFields
                    draft={editDraft as unknown as Record<string, number>}
                    onChange={(key, val) =>
                      setEditDraft((prev) =>
                        prev ? { ...prev, [key]: val } : prev,
                      )
                    }
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "6px 12px",
                        background: "var(--accent-dim)",
                        border: "1px solid var(--accent)",
                        borderRadius: 6,
                        color: "var(--accent)",
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        cursor: saving ? "not-allowed" : "pointer",
                      }}
                    >
                      <Check size={11} strokeWidth={2.5} /> Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      style={{
                        padding: "6px 12px",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        color: "var(--text-muted)",
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Food card ── */
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {/* Name + badge */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          color: "var(--text)",
                          textTransform: "capitalize",
                          fontWeight: 500,
                        }}
                      >
                        {food.name}
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          fontSize: 9,
                          fontFamily: "var(--mono)",
                          color: "var(--purple)",
                          border: "1px solid var(--purple)60",
                          borderRadius: 4,
                          padding: "1px 5px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        <BookmarkCheck size={8} strokeWidth={2} />
                        {food.confidence === "verified" ? "Verified" : "Learned"}
                      </span>
                    </div>

                    {/* Aliases */}
                    {food.aliases.length > 0 && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-dim)",
                          fontFamily: "var(--mono)",
                          marginTop: 2,
                        }}
                      >
                        also: {food.aliases.join(", ")}
                      </div>
                    )}

                    {/* Per-serving macros */}
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-dim)",
                        fontFamily: "var(--mono)",
                        marginTop: 4,
                      }}
                    >
                      {food.serving_desc} ({food.serving_grams}g) &middot;{" "}
                      {Math.round(
                        (food.calories_per_100g * food.serving_grams) / 100,
                      )}{" "}
                      kcal &middot; P
                      {Math.round(
                        (food.protein_per_100g * food.serving_grams) / 10,
                      ) / 10}{" "}
                      C
                      {Math.round(
                        (food.carbs_per_100g * food.serving_grams) / 10,
                      ) / 10}{" "}
                      F
                      {Math.round(
                        (food.fat_per_100g * food.serving_grams) / 10,
                      ) / 10}
                    </div>

                    {/* Usage stats */}
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        fontFamily: "var(--mono)",
                        marginTop: 2,
                      }}
                    >
                      Used {food.times_used}&times; &middot; last{" "}
                      {relativeTime(food.last_used_at)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => startEdit(food)}
                      title="Edit"
                      style={{
                        width: 26,
                        height: 26,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "transparent",
                        border: "1px solid var(--border2)",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      <Pencil size={11} color="var(--text-muted)" strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() =>
                        deletingId === food.id
                          ? deleteFood(food.id)
                          : setDeletingId(food.id)
                      }
                      title={
                        deletingId === food.id
                          ? "Click again to confirm"
                          : "Delete"
                      }
                      style={{
                        width: 26,
                        height: 26,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background:
                          deletingId === food.id
                            ? "color-mix(in srgb, var(--red) 15%, transparent)"
                            : "transparent",
                        border: `1px solid ${deletingId === food.id ? "var(--red)" : "var(--border2)"}`,
                        borderRadius: 6,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <Trash2
                        size={11}
                        color={
                          deletingId === food.id
                            ? "var(--red)"
                            : "var(--text-dim)"
                        }
                        strokeWidth={1.75}
                      />
                    </button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 480px) {
          .my-foods-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
