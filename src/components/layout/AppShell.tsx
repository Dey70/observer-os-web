"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useEffect, useState } from "react";

const NAV = [
  { path: "/checkin", label: "Check-in" },
  { path: "/log", label: "Log Session" },
  { path: "/dashboard", label: "Dashboard" },
  { path: "/history", label: "History" },
  { path: "/load", label: "Load" },
  { path: "/goals", label: "Goals" },
  { path: "/coach", label: "Coach" },
  { path: "/profile", label: "Profile" },
];

export default function AppShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sb = createClient();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  async function signOut() {
    await sb.auth.signOut();
    router.push("/auth");
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg)",
        position: "relative",
      }}
    >
      {/* Extra orb — bottom left */}
      <div
        style={{
          position: "fixed",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(0,230,118,0.04) 0%, transparent 65%)",
          bottom: -80,
          left: 80,
          pointerEvents: "none",
          zIndex: 0,
          animation: "orbFloat 12s ease-in-out infinite reverse",
        }}
      />

      {/* SIDEBAR */}
      <nav
        id="sidebar"
        style={{
          width: 220,
          flexShrink: 0,
          background: "rgba(6,6,8,0.92)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 10,
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "22px 18px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 0 16px rgba(232,255,71,0.3)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M1 9 L3.5 9 L5 5 L7 13 L9 2 L11 13 L13 5 L14.5 9 L17 9"
                  stroke="#000"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--accent)",
                  letterSpacing: "2px",
                }}
              >
                OBSERVER OS
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 8,
                  color: "rgba(232,255,71,0.3)",
                  letterSpacing: "1.5px",
                  marginTop: 1,
                }}
              >
                PERFORMANCE AI
              </div>
            </div>
          </div>

          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "rgba(255,255,255,0.25)",
              marginBottom: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {userEmail}
          </div>

          {/* Theme toggle */}
          <div
            onClick={toggleTheme}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "7px 10px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.3)",
                letterSpacing: "1px",
                textTransform: "uppercase",
              }}
            >
              {theme === "dark" ? "Dark Mode" : "Light Mode"}
            </span>
            <div
              style={{
                width: 28,
                height: 15,
                borderRadius: 99,
                background: "var(--accent)",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: "#000",
                  position: "absolute",
                  top: 2,
                  left: theme === "dark" ? 15 : 2,
                  transition: "left 0.2s",
                }}
              />
            </div>
          </div>
        </div>

        {/* Nav items with dots */}
        <div style={{ flex: 1, padding: "10px 0", overflowY: "auto" }}>
          {NAV.map((item) => {
            const active = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 18px",
                  fontSize: 12.5,
                  color: active ? "#F0F0F0" : "rgba(255,255,255,0.3)",
                  textDecoration: "none",
                  background: active ? "rgba(232,255,71,0.06)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {/* Dot indicator */}
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: active
                      ? "var(--accent)"
                      : "rgba(255,255,255,0.1)",
                    boxShadow: active
                      ? "0 0 8px rgba(232,255,71,0.8), 0 0 16px rgba(232,255,71,0.4)"
                      : "none",
                    transition: "all 0.2s",
                  }}
                />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 18px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <button
            onClick={signOut}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 10,
              color: "rgba(255,255,255,0.2)",
              background: "none",
              border: "none",
              cursor: "pointer",
              letterSpacing: "1px",
              textTransform: "uppercase",
              padding: 0,
              transition: "color 0.15s",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,0.45)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,0.2)")
            }
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign Out
          </button>
        </div>
      </nav>

      {/* MAIN */}
      <main
        id="main-content"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 36px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div className="animate-fade-in">{children}</div>
      </main>

      {/* MOBILE NAV */}
      <nav
        id="mobile-nav"
        style={{
          display: "none",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 60,
          background: "rgba(6,6,8,0.95)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          justifyContent: "space-around",
          alignItems: "center",
          zIndex: 100,
          backdropFilter: "blur(20px)",
        }}
      >
        {NAV.slice(0, 6).map((item) => {
          const active = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                flex: 1,
                padding: "8px 0",
                color: active ? "var(--accent)" : "rgba(255,255,255,0.25)",
                textDecoration: "none",
                fontSize: 8,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                transition: "color 0.15s",
                borderTop: active
                  ? "1.5px solid var(--accent)"
                  : "1.5px solid transparent",
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: active ? "var(--accent)" : "transparent",
                  boxShadow: active ? "0 0 6px rgba(232,255,71,0.8)" : "none",
                }}
              />
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
