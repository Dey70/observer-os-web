// src/lib/themes.ts
//
// Single source of truth for every theme in Observer OS. Every UI that
// lists themes (sidebar swatches, Settings picker) maps over THEMES —
// never hardcode a theme list anywhere else.
//
// ── Adding a new theme later ────────────────────────────────────────────
// 1. Add a CSS file under src/styles/themes/<id>.css that defines the FULL
//    variable set from globals.css (no partial overrides) under
//    `[data-theme="<id>"] { ... }`, plus any decorative rules scoped to
//    that selector (e.g. body::before pattern, .glass ornamentation).
//    Import the file from src/app/globals.css.
// 2. If the theme needs a decorative overlay beyond CSS (an SVG motif,
//    etc.), add a component under src/components/theme-decorations/ and
//    register it in the THEME_DECORATIONS map in that folder's index.ts.
//    Pure palette-swap themes map to `null` there.
// 3. Add one entry to the THEMES array below.
// 4. Update the Supabase CHECK constraint (see
//    supabase/migrations/20260706_theme_system.sql for the pattern) and
//    the `theme` field's union type in src/lib/supabase/database.types.ts.
// ─────────────────────────────────────────────────────────────────────────

export interface ThemeDefinition {
  /** Matches the `data-theme` attribute value and the Supabase `theme` enum. */
  id: string;
  label: string;
  /** "palette" = colors only. "full-aesthetic" = colors + fonts + decoration. */
  category: "palette" | "full-aesthetic";
  /** Hex swatch background, for picker previews. */
  previewBg: string;
  /** Hex swatch accent, for picker previews. */
  previewAccent: string;
  description: string;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "dark",
    label: "Dark",
    category: "palette",
    previewBg: "#060608",
    previewAccent: "#E8FF47",
    description: "Default — near-black with an electric lime accent.",
  },
  {
    id: "light",
    label: "Light",
    category: "palette",
    previewBg: "#F4F4F0",
    previewAccent: "#5B8A00",
    description: "Bright, paper-toned surface with a muted olive accent.",
  },
  {
    id: "indian",
    label: "Indian",
    category: "full-aesthetic",
    previewBg: "#1A0A0E",
    previewAccent: "#FF9933",
    description:
      "Deep maroon with saffron and temple-gold, warm Mukta typography, and a paisley motif.",
  },
  {
    id: "japanese",
    label: "Japanese",
    category: "full-aesthetic",
    previewBg: "#14100D",
    previewAccent: "#3B5787",
    description:
      "Sumi-ink black with aizome indigo and vermillion, a Mincho serif, and a seigaiha wave pattern.",
  },
  {
    id: "scandinavian",
    label: "Scandinavian",
    category: "full-aesthetic",
    previewBg: "#F2EFEA",
    previewAccent: "#7A9471",
    description:
      "Linen-white with sage and muted heather, a geometric grotesk font, and a folk chevron pattern.",
  },
  {
    id: "nord",
    label: "Nord",
    category: "palette",
    previewBg: "#2E3440",
    previewAccent: "#88C0D0",
    description: "The arctic blue-grey palette from the Nord color scheme.",
  },
  {
    id: "dracula",
    label: "Dracula",
    category: "palette",
    previewBg: "#282A36",
    previewAccent: "#BD93F9",
    description: "The classic purple-and-pink-on-slate Dracula color scheme.",
  },
];

export const DEFAULT_THEME = "dark";

export const THEME_IDS = THEMES.map((t) => t.id);

export function isThemeId(value: string | null | undefined): value is string {
  return !!value && THEME_IDS.includes(value);
}
