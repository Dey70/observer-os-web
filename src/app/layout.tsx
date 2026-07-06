// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import {
  Mukta,
  Shippori_Mincho,
  Space_Grotesk,
  Oswald,
  Saira_Condensed,
  EB_Garamond,
} from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { DEFAULT_THEME, THEME_IDS } from "@/lib/themes";

// Loaded upfront (small, fixed set) so full-aesthetic themes have no
// runtime font-loading flicker when switched to. Each is exposed as a CSS
// variable that the matching theme's stylesheet points --sans/--soft at,
// so it cascades with zero component changes.

// Mukta was chosen over more decorative options like Baloo 2 because this
// UI leans on 10-13px labels everywhere — it's a warm, humanist sans built
// as the Latin companion to a Devanagari family, and stays crisp at small
// sizes where rounder display faces turn mushy.
const mukta = Mukta({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-indian",
  display: "swap",
});

// Shippori Mincho — a brush-like Mincho serif for the Japanese theme.
// Chosen over rounder options (e.g. Shippori Mincho B1) for a more
// traditional, elegant ink-and-washi feel.
const shipporiMincho = Shippori_Mincho({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-japanese",
  display: "swap",
});

// Space Grotesk — a clean geometric grotesk for the Scandinavian theme,
// in line with the modernist grotesque sans typography common to Nordic
// design. Variable font, so no explicit weight is needed.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-scandi",
  display: "swap",
});

// Oswald — a condensed, cinematic-poster sans for the Stranger Things
// theme. Bold enough to carry the retro-horror mood without tipping into
// an unreadable novelty font (e.g. the show's actual Benguiat-style logo
// face) once applied across body text.
const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-stranger-things",
  display: "swap",
});

// Saira Condensed — a bold, energetic condensed sans for the Marvel
// theme. Chosen over comic-lettering novelty fonts (e.g. Bangers) for the
// same reason as Oswald above: those go illegible fast at 10-13px.
const sairaCondensed = Saira_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-marvel",
  display: "swap",
});

// EB Garamond — a classic literary serif for the Lord of the Mysteries
// theme, evoking Victorian print and tarot-card typography while staying
// fully legible for extended UI text.
const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mysteries",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Observer OS",
  description: "Personal AI performance coach — training, sleep, study",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#060608",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${mukta.variable} ${shipporiMincho.variable} ${spaceGrotesk.variable} ${oswald.variable} ${sairaCondensed.variable} ${ebGaramond.variable}`}
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
    >
      <head>
        {/*
          Applies the user's saved theme before first paint so there's no
          flash of the default dark theme. Reads THEME_IDS from
          src/lib/themes.ts at build time (inlined into the script string
          below, since a plain script can't import a TS module at runtime).
          `data-theme` on <html> has a static default above plus
          suppressHydrationWarning, since this script rewrites it before
          React hydrates — see
          node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
          ("Themes" section) for why this pairing is required in this
          Next.js version.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t&&${JSON.stringify(THEME_IDS)}.indexOf(t)!==-1){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=DM+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon-32.png" sizes="32x32" />
        <link rel="icon" href="/favicon-16.png" sizes="16x16" />
        {/*
          iOS Safari ignores parts of the web manifest spec (e.g. display:
          standalone), so these Apple-specific tags are required for "Add to
          Home Screen" to behave correctly. Next's `appleWebApp.capable`
          metadata field emits an unprefixed "mobile-web-app-capable" tag in
          this Next.js version, not "apple-mobile-web-app-capable", so these
          are added directly rather than via the metadata API.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Observer OS" />
      </head>
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
