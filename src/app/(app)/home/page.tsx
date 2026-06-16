// src/app/(app)/home/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Apple,
  Bot,
  Target,
  Dumbbell,
  CalendarDays,
  HeartPulse,
  Trophy,
} from "lucide-react";

export const dynamic = "force-dynamic";

const SHORTCUTS: { href: string; label: string; icon: React.ElementType }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/nutrition", label: "Nutrition", icon: Apple },
  { href: "/coach", label: "Coach", icon: Bot },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/log", label: "Log", icon: Dumbbell },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/metrics", label: "Metrics", icon: HeartPulse },
  { href: "/records", label: "Records", icon: Trophy },
];

const RING_POSITIONS = [
  { top: 8, left: 188 },
  { top: 61, left: 315 },
  { top: 188, left: 368 },
  { top: 315, left: 315 },
  { top: 368, left: 188 },
  { top: 315, left: 61 },
  { top: 188, left: 8 },
  { top: 61, left: 61 },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

const nameGradient: React.CSSProperties = {
  background:
    "linear-gradient(90deg, var(--accent), var(--purple), var(--green))",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

export default function HomePage() {
  const sb = createClient();
  const [name, setName] = useState("there");
  const [greeting, setGreeting] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setGreeting(getGreeting());
    async function load() {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb
        .from("profiles")
        .select("name")
        .eq("user_id", user.id)
        .maybeSingle();
      const profileName = (data as { name: string | null } | null)?.name;
      setName(profileName?.trim() || user.email?.split("@")[0] || "there");
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--mono)",
          fontSize: 13,
          padding: 40,
          textAlign: "center",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <>
      <style>{`
        .home-root { display: flex; align-items: center; justify-content: center; min-height: calc(100vh - 80px); }
        .home-desktop-only { display: block; }
        .home-mobile-only { display: none; }
        .home-ring-node {
          position: absolute;
          width: 84px;
          height: 84px;
          border-radius: 50%;
          background: var(--surface);
          border: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          text-decoration: none;
          color: var(--text-muted);
          transition: all 0.2s ease;
        }
        .home-ring-node:hover {
          border-color: var(--accent);
          color: var(--accent);
          box-shadow: 0 0 20px var(--accent-glow);
          transform: scale(1.08);
        }
        @media (max-width: 768px) {
          .home-root { min-height: calc(100dvh - 130px); }
          .home-desktop-only { display: none !important; }
          .home-mobile-only { display: block !important; width: 100%; }
        }
      `}</style>

      <div className="home-root">
        <div className="home-desktop-only">
          <div
            style={{
              position: "relative",
              width: 460,
              height: 460,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 140,
                left: 140,
                width: 180,
                height: 180,
                borderRadius: "50%",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 20px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.4 }}>
                <span style={{ color: "var(--text)" }}>{greeting}, </span>
                <span style={nameGradient}>{name}</span>
              </div>
            </div>
            {SHORTCUTS.map((s, i) => {
              const Icon = s.icon;
              const pos = RING_POSITIONS[i];
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className="home-ring-node"
                  style={{ top: pos.top, left: pos.left }}
                >
                  <Icon size={20} strokeWidth={1.75} />
                  <span style={{ fontSize: 10, fontFamily: "var(--mono)" }}>
                    {s.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="home-mobile-only">
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 26, fontWeight: 800 }}>
              <span style={{ color: "var(--text)" }}>{greeting}, </span>
              <span style={nameGradient}>{name}</span>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
            }}
          >
            {SHORTCUTS.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "16px 6px",
                    borderRadius: 12,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    textDecoration: "none",
                    color: "var(--text-muted)",
                  }}
                >
                  <Icon size={20} strokeWidth={1.75} />
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--mono)",
                      textAlign: "center",
                    }}
                  >
                    {s.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
