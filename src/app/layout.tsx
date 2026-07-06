// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Mukta } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

// Loaded upfront (small, fixed set) so the Indian full-aesthetic theme has
// no runtime font-loading flicker when switched to. Mukta was chosen over
// more decorative options like Baloo 2 because this UI leans on 10-13px
// labels everywhere — Mukta is a warm, humanist sans built as the Latin
// companion to a Devanagari family, and stays crisp at small sizes where
// rounder display faces turn mushy. Exposed as --font-indian; indian.css
// points --sans/--soft at it so it cascades with zero component changes.
const mukta = Mukta({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-indian",
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
    <html lang="en" className={mukta.variable}>
      <head>
        {/*
          Applies the user's saved theme before first paint so there's no
          flash of the default dark theme. Mirrors THEME_IDS in
          src/lib/themes.ts — keep the fallback list there in sync since a
          plain script can't import a TS module.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t&&["dark","light","indian"].indexOf(t)!==-1){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`,
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
