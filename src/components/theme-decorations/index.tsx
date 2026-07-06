// src/components/theme-decorations/index.tsx
//
// Registry of optional per-theme decorative overlays that go beyond CSS
// (SVG motifs, etc). Pure palette-swap themes (dark, light) map to null.
// AppShell renders <ThemeDecorations themeId={theme} /> once near the
// root — it looks up this map and renders the matching component or
// nothing. Add new entries here when step 2 of the "adding a theme"
// checklist in src/lib/themes.ts calls for a decoration component.
import type { ComponentType } from "react";
import IndianMotif from "./IndianMotif";
import EnsoMotif from "./EnsoMotif";
import UpsideDownSpores from "./UpsideDownSpores";
import ComicBurst from "./ComicBurst";
import MysteryEye from "./MysteryEye";
import SpringPetals from "./SpringPetals";
import SummerBubbles from "./SummerBubbles";
import AutumnLeaves from "./AutumnLeaves";
import WinterSnow from "./WinterSnow";

export const THEME_DECORATIONS: Record<string, ComponentType | null> = {
  dark: null,
  light: null,
  indian: IndianMotif,
  japanese: EnsoMotif,
  scandinavian: null,
  nord: null,
  dracula: null,
  spring: SpringPetals,
  summer: SummerBubbles,
  autumn: AutumnLeaves,
  winter: WinterSnow,
  "stranger-things": UpsideDownSpores,
  marvel: ComicBurst,
  "lord-of-mysteries": MysteryEye,
};

export function ThemeDecorations({ themeId }: { themeId: string }) {
  const Decoration = THEME_DECORATIONS[themeId];
  if (!Decoration) return null;
  return <Decoration />;
}
