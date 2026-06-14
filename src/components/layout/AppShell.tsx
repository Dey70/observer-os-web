"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

const NAV = [
  { path: "/checkin", icon: "☀", label: "Check-in" },
  { path: "/log", icon: "⚡", label: "Log Session" },
  { path: "/dashboard", icon: "📊", label: "Dashboard" },
  { path: "/goals", icon: "🎯", label: "Goals" },
  { path: "/coach", icon: "🤖", label: "Coach" },
  { path: "/profile", icon: "👤", label: "Profile" },
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
      }}
    >
      {/* SIDEBAR */}
      <nav
        id="sidebar"
        style={{
          width: 220,
          flexShrink: 0,
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "24px 20px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.2em",
              color: "var(--accent)",
              textTransform: "uppercase",
            }}
          >
            Observer OS
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 4,
              fontFamily: "var(--mono)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {userEmail}
          </div>
        </div>

        <div style={{ flex: 1, padding: "12px 0" }}>
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
                  padding: "11px 20px",
                  fontSize: 13,
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  textDecoration: "none",
                  borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                  background: active ? "var(--accent-dim)" : "none",
                  transition: "all 0.1s",
                }}
              >
                <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>

        <div
          style={{ padding: "16px 20px", borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={signOut}
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "6px 0",
            }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* MAIN */}
      <main
        id="main-content"
        style={{ flex: 1, overflowY: "auto", padding: "32px 36px" }}
      >
        {children}
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
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          justifyContent: "space-around",
          alignItems: "center",
          zIndex: 100,
        }}
      >
        {NAV.map((item) => {
          const active = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                flex: 1,
                padding: "8px 0",
                color: active ? "var(--accent)" : "var(--text-dim)",
                textDecoration: "none",
                fontSize: 9,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
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
