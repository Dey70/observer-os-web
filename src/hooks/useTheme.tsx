// src/hooks/useTheme.tsx
//
// Single source of truth for the active theme at runtime. AppShell mounts
// <ThemeProvider> once near the root; every other consumer (sidebar
// swatches, the Settings page picker) reads/writes through useTheme()
// instead of re-fetching the profile or re-subscribing to localStorage.
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_THEME, isThemeId } from "@/lib/themes";

interface ThemeContextValue {
  theme: string;
  setTheme: (next: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Starts at DEFAULT_THEME to match the server-rendered output — the
  // <html> element's *color* is corrected before paint by the inline
  // script in layout.tsx (paired with suppressHydrationWarning there), but
  // React state can't be corrected pre-hydration the same way. Deeper
  // consumers (ThemeDecorations, the active swatch) depend on this state,
  // so a lazy localStorage-read initializer here would make their first
  // client render diverge from the server-rendered tree and trigger a
  // hydration mismatch. Reading localStorage in the effect below means
  // those consumers pop in a beat after mount instead — an acceptable
  // trade-off since the color scheme itself never flashes.
  const [theme, setThemeState] = useState(DEFAULT_THEME);
  const supabase = createClient();

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above; this is the localStorage/Supabase reconciliation pass, not a derived-state anti-pattern.
    if (isThemeId(stored)) setThemeState(stored);

    // Reconciles with the Supabase profile once the user loads (e.g. a
    // theme picked on another device).
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("theme")
        .eq("user_id", data.user.id)
        .maybeSingle<{ theme: string }>();
      if (profile && isThemeId(profile.theme)) {
        setThemeState(profile.theme);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const setTheme = useCallback((next: string) => {
    if (!isThemeId(next)) return;
    setThemeState(next);
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("profiles")
        .upsert({ user_id: data.user.id, theme: next }, { onConflict: "user_id" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }
  return ctx;
}
