// src/app/(app)/nutrition/global-foods/page.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Upload,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";

export const dynamic = "force-dynamic";

type GlobalFoodRow = {
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
};

type CSVRow = {
  food_name: string;
  aliases: string[];
  serving_description: string;
  serving_grams: number;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
};

type ParsedCSV = { valid: CSVRow[]; errors: string[] };
type ImportResult = { imported: number; updated: number; skipped: number };

const REQUIRED_HEADERS = [
  "food_name",
  "aliases",
  "serving_description",
  "serving_grams",
  "kcal_per_100g",
  "protein_per_100g",
  "carbs_per_100g",
  "fat_per_100g",
  "fiber_per_100g",
] as const;

function parseCSVText(text: string): ParsedCSV {
  const valid: CSVRow[] = [];
  const errors: string[] = [];

  // RFC 4180 parser — handles quoted fields with commas inside
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        current.push(field);
        field = "";
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        current.push(field);
        field = "";
        if (current.some((f) => f.trim())) rows.push(current);
        current = [];
      } else {
        field += c;
      }
    }
  }
  current.push(field);
  if (current.some((f) => f.trim())) rows.push(current);

  if (rows.length < 2) {
    errors.push("CSV must have a header row and at least one data row.");
    return { valid, errors };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idx: Record<string, number> = {};
  const missing: string[] = [];
  for (const h of REQUIRED_HEADERS) {
    const i = headers.indexOf(h);
    if (i === -1) missing.push(h);
    else idx[h] = i;
  }
  if (missing.length) {
    errors.push(`Missing columns: ${missing.join(", ")}`);
    return { valid, errors };
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const line = r + 1;
    const name = row[idx.food_name]?.trim();
    if (!name) {
      errors.push(`Row ${line}: food_name is empty`);
      continue;
    }
    const aliasRaw = row[idx.aliases]?.trim() ?? "";
    const aliases = aliasRaw
      ? aliasRaw.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean)
      : [];
    const servingGrams = parseFloat(row[idx.serving_grams]);
    if (isNaN(servingGrams) || servingGrams <= 0) {
      errors.push(`Row ${line} (${name}): serving_grams must be > 0`);
      continue;
    }
    const kcal = parseFloat(row[idx.kcal_per_100g]);
    if (isNaN(kcal) || kcal < 0) {
      errors.push(`Row ${line} (${name}): kcal_per_100g must be ≥ 0`);
      continue;
    }
    const n = (key: string) => {
      const v = parseFloat(row[idx[key]]);
      return isNaN(v) ? 0 : Math.max(0, v);
    };
    valid.push({
      food_name: name,
      aliases,
      serving_description: row[idx.serving_description]?.trim() || "1 serving",
      serving_grams: servingGrams,
      kcal_per_100g: kcal,
      protein_per_100g: n("protein_per_100g"),
      carbs_per_100g: n("carbs_per_100g"),
      fat_per_100g: n("fat_per_100g"),
      fiber_per_100g: n("fiber_per_100g"),
    });
  }
  return { valid, errors };
}

const BLANK: Omit<
  GlobalFoodRow,
  "id" | "created_at" | "times_used" | "confidence"
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

function confidenceBadge(confidence: string): { label: string; color: string } {
  if (confidence === "imported") return { label: "Imported", color: "var(--accent)" };
  return { label: "Verified", color: "var(--purple)" };
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

export default function GlobalFoodsPage() {
  const sb = createClient();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [foods, setFoods] = useState<GlobalFoodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<GlobalFoodRow | null>(null);
  const [editAliases, setEditAliases] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addDraft, setAddDraft] = useState({ ...BLANK });
  const [addAliases, setAddAliases] = useState("");
  const [saving, setSaving] = useState(false);
  // CSV import state
  const [showImport, setShowImport] = useState(false);
  const [csvPreview, setCsvPreview] = useState<ParsedCSV | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    const { data: adminRow } = await (sb as any)
      .from("app_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const admin = !!adminRow;
    setIsAdmin(admin);
    setCheckingAccess(false);
    if (!admin) {
      setLoading(false);
      return;
    }

    const { data } = await (sb as any)
      .from("global_foods")
      .select("*")
      .order("times_used", { ascending: false });
    setFoods((data ?? []) as GlobalFoodRow[]);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = search.trim()
    ? foods.filter((f) => {
        const q = search.toLowerCase().trim();
        return f.name.includes(q) || f.aliases.some((a) => a.includes(q));
      })
    : foods;

  const totalUses = foods.reduce((s, f) => s + f.times_used, 0);

  function startEdit(food: GlobalFoodRow) {
    setEditingId(food.id);
    setEditDraft({ ...food });
    setEditAliases(food.aliases.join(", "));
    setDeletingId(null);
    setShowAdd(false);
    setShowImport(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setEditAliases("");
  }

  async function saveEdit() {
    if (!editDraft) return;
    setSaving(true);
    const aliases = editAliases
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    await (sb as any)
      .from("global_foods")
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
        updated_at: new Date().toISOString(),
      })
      .eq("id", editDraft.id);
    cancelEdit();
    await load();
    setSaving(false);
  }

  async function deleteFood(id: number) {
    await (sb as any).from("global_foods").delete().eq("id", id);
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
    await (sb as any).from("global_foods").insert({
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
      created_by: user.id,
    });
    setShowAdd(false);
    setAddDraft({ ...BLANK });
    setAddAliases("");
    await load();
    setSaving(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvPreview(parseCSVText(text));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function runImport() {
    if (!csvPreview || csvPreview.valid.length === 0) return;
    setImporting(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setImporting(false);
      return;
    }

    // Fetch existing to preserve times_used and detect new vs updated
    const { data: existing } = await (sb as any)
      .from("global_foods")
      .select("name, times_used");
    const existingMap = new Map<string, number>(
      (existing ?? []).map((f: any) => [f.name, f.times_used]),
    );

    let imported = 0;
    let updated = 0;
    const upsertRows = csvPreview.valid.map((row) => {
      const normalizedName = row.food_name.toLowerCase().trim();
      if (existingMap.has(normalizedName)) updated++;
      else imported++;
      return {
        name: normalizedName,
        aliases: row.aliases,
        serving_desc: row.serving_description,
        serving_grams: row.serving_grams,
        calories_per_100g: row.kcal_per_100g,
        protein_per_100g: row.protein_per_100g,
        carbs_per_100g: row.carbs_per_100g,
        fat_per_100g: row.fat_per_100g,
        fiber_per_100g: row.fiber_per_100g,
        confidence: "imported" as const,
        times_used: existingMap.get(normalizedName) ?? 0,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      };
    });

    await (sb as any)
      .from("global_foods")
      .upsert(upsertRows, { onConflict: "name" });

    setImportResult({ imported, updated, skipped: csvPreview.errors.length });
    setCsvPreview(null);
    setShowImport(false);
    await load();
    setImporting(false);
  }

  if (checkingAccess || loading)
    return (
      <div>
        <PageHeader
          title="GLOBAL FOODS"
          subtitle="Shared nutrition database — admin only"
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

  if (!isAdmin)
    return (
      <div>
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
        <PageHeader title="GLOBAL FOODS" subtitle="Shared nutrition database" />
        <Card>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <ShieldAlert
              size={16}
              color="var(--yellow)"
              strokeWidth={1.75}
              style={{ marginTop: 1, flexShrink: 0 }}
            />
            <div style={{ fontSize: 13, color: "var(--text)" }}>
              This page manages the shared food database used by every
              account and is restricted to admins.
            </div>
          </div>
        </Card>
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
        title="GLOBAL FOODS"
        subtitle="Shared nutrition database — visible to every user"
      />

      {/* Analytics bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {[
          { value: foods.length, label: "Foods in database" },
          { value: totalUses, label: "Total uses (all users)" },
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

      {/* Import result banner */}
      {importResult && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px",
            background: "color-mix(in srgb, var(--accent) 10%, transparent)",
            border: "1px solid var(--accent)50",
            borderRadius: 10,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--text)",
            }}
          >
            <CheckCircle2 size={14} color="var(--accent)" />
            Import complete &middot;{" "}
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>
              {importResult.imported} new
            </span>
            {importResult.updated > 0 && (
              <>
                {" "}
                &middot;{" "}
                <span style={{ color: "var(--yellow)", fontWeight: 700 }}>
                  {importResult.updated} updated
                </span>
              </>
            )}
            {importResult.skipped > 0 && (
              <>
                {" "}
                &middot;{" "}
                <span style={{ color: "var(--text-muted)" }}>
                  {importResult.skipped} skipped
                </span>
              </>
            )}
          </div>
          <button
            onClick={() => setImportResult(null)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-dim)",
              padding: 0,
              lineHeight: 1,
            }}
          >
            <X size={13} />
          </button>
        </div>
      )}

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
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        <button
          onClick={() => {
            setShowImport((v) => !v);
            setShowAdd(false);
            setCsvPreview(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "8px 14px",
            background: showImport ? "var(--surface2)" : "transparent",
            border: showImport
              ? "1px solid var(--border)"
              : "1px solid var(--accent)80",
            borderRadius: 8,
            color: showImport ? "var(--text-muted)" : "var(--accent)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {showImport ? <X size={12} /> : <Upload size={12} />}
          {showImport ? "Cancel" : "Import CSV"}
        </button>
        <button
          onClick={() => {
            setShowAdd((v) => !v);
            setShowImport(false);
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

      {/* CSV Import panel */}
      {showImport && (
        <Card style={{ borderColor: "var(--accent)60", marginBottom: 14 }}>
          <SectionLabel>Import CSV</SectionLabel>
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--mono)",
              color: "var(--text-dim)",
              marginBottom: 12,
              lineHeight: 1.6,
            }}
          >
            Required columns:{" "}
            <code
              style={{
                background: "var(--surface2)",
                padding: "1px 5px",
                borderRadius: 3,
                fontSize: 10,
              }}
            >
              food_name, aliases, serving_description, serving_grams,
              kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
              fiber_per_100g
            </code>
            <br />
            Aliases: comma-separated inside quotes.{" "}
            <em>
              This writes to the shared database — every user's lookups use
              it immediately. Existing foods will be updated, usage counts
              preserved.
            </em>
          </div>

          {!csvPreview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 20px",
                background: "var(--surface2)",
                border: "1.5px dashed var(--border2)",
                borderRadius: 10,
                color: "var(--text-dim)",
                fontFamily: "var(--mono)",
                fontSize: 12,
                cursor: "pointer",
                width: "100%",
                justifyContent: "center",
                transition: "border-color 0.15s",
              }}
            >
              <Upload size={14} />
              Click to select a CSV file
            </button>
          ) : (
            <div>
              {/* Preview summary */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: csvPreview.errors.length ? 12 : 0,
                }}
              >
                {csvPreview.valid.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontFamily: "var(--mono)",
                      color: "var(--accent)",
                    }}
                  >
                    <CheckCircle2 size={13} />
                    {csvPreview.valid.length} food
                    {csvPreview.valid.length !== 1 ? "s" : ""} ready
                  </div>
                )}
                {csvPreview.errors.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontFamily: "var(--mono)",
                      color: "var(--yellow)",
                    }}
                  >
                    <AlertCircle size={13} />
                    {csvPreview.errors.length} row
                    {csvPreview.errors.length !== 1 ? "s" : ""} skipped
                  </div>
                )}
              </div>

              {/* Error list */}
              {csvPreview.errors.length > 0 && (
                <div
                  style={{
                    padding: "8px 10px",
                    background:
                      "color-mix(in srgb, var(--yellow) 8%, transparent)",
                    border: "1px solid var(--yellow)40",
                    borderRadius: 7,
                    marginBottom: 12,
                  }}
                >
                  {csvPreview.errors.map((e, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        color: "var(--text-dim)",
                        lineHeight: 1.7,
                      }}
                    >
                      {e}
                    </div>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {csvPreview.valid.length > 0 && (
                  <button
                    onClick={runImport}
                    disabled={importing}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 16px",
                      background: importing ? "var(--surface2)" : "var(--accent)",
                      border: "none",
                      borderRadius: 7,
                      color: importing ? "var(--text-dim)" : "var(--bg)",
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: importing ? "not-allowed" : "pointer",
                    }}
                  >
                    <Check size={11} strokeWidth={2.5} />
                    {importing
                      ? "Importing…"
                      : `Import ${csvPreview.valid.length} Food${csvPreview.valid.length !== 1 ? "s" : ""}`}
                  </button>
                )}
                <button
                  onClick={() => {
                    setCsvPreview(null);
                    fileInputRef.current?.click();
                  }}
                  style={{
                    padding: "7px 12px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 7,
                    color: "var(--text-muted)",
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Choose different file
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

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
                : "No global foods yet — add one or import a CSV"
            }
          />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((food) => {
            const badge = confidenceBadge(food.confidence);
            return (
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
                            color: badge.color,
                            border: `1px solid ${badge.color}60`,
                            borderRadius: 4,
                            padding: "1px 5px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          <BookmarkCheck size={8} strokeWidth={2} />
                          {badge.label}
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
                        Used {food.times_used}&times; across all users
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
                        <Pencil
                          size={11}
                          color="var(--text-muted)"
                          strokeWidth={1.75}
                        />
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
            );
          })}
        </div>
      )}
    </div>
  );
}
