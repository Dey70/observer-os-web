"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useEffect, useState } from "react";

const NAV = [
  {
    path: "/checkin",
    label: "Check-in",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    path: "/log",
    label: "Log Session",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    path: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    path: "/history",
    label: "History",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    path: "/load",
    label: "Load",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    path: "/goals",
    label: "Goals",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
  },
  {
    path: "/coach",
    label: "Coach",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    path: "/profile",
    label: "Profile",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
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
      {/* SIDEBAR */}
      <nav
        id="sidebar"
        style={{
          width: 220,
          flexShrink: 0,
          background: "rgba(8,8,8,0.98)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "22px 18px 16px",
            borderBottom: "1px solid var(--border)",
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
            {/* Logo mark */}
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M1 9 L3.5 9 L5 5 L7 13 L9 2 L11 13 L13 5 L14.5 9 L17 9"
                  stroke="#000"
                  strokeWidth="2"
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
              color: "var(--text-dim)",
              marginBottom: 10,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {userEmail}
          </div>

          {/* Theme toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              cursor: "pointer",
            }}
            onClick={toggleTheme}
          >
            <span
              style={{
                fontSize: 9,
                color: "var(--text-muted)",
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
                transition: "background 0.3s",
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

        {/* Nav */}
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
                  gap: 10,
                  padding: "9px 18px",
                  fontSize: 12,
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  textDecoration: "none",
                  background: active ? "rgba(232,255,71,0.05)" : "none",
                  transition: "all 0.15s",
                  filter: active
                    ? "drop-shadow(0 0 6px rgba(232,255,71,0.3))"
                    : "none",
                }}
              >
                <span
                  style={{
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                    transition: "color 0.15s",
                  }}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{ padding: "14px 18px", borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={signOut}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 10,
              color: "var(--text-dim)",
              background: "none",
              border: "none",
              cursor: "pointer",
              letterSpacing: "1px",
              textTransform: "uppercase",
              padding: 0,
              transition: "color 0.15s",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.color = "var(--text-muted)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.color = "var(--text-dim)")
            }
          >
            <svg
              width="13"
              height="13"
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
          background: "rgba(8,8,8,0.98)",
          borderTop: "1px solid var(--border)",
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
                gap: 4,
                flex: 1,
                padding: "8px 0",
                color: active ? "var(--accent)" : "var(--text-dim)",
                textDecoration: "none",
                fontSize: 8,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                transition: "color 0.15s",
                borderTop: active
                  ? "1px solid var(--accent)"
                  : "1px solid transparent",
              }}
            >
              <span style={{ color: "inherit" }}>{item.icon}</span>
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>

      <style>{`
        @media (max-width: 768px) {
          #sidebar { display: none !important; }
          #mobile-nav { display: flex !important; }
          #main-content { padding: 20px 16px 80px !important; }
        }
      `}</style>
    </div>
  );
}
