"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import {
  Activity,
  Dumbbell,
  LayoutDashboard,
  Clock,
  BarChart2,
  Target,
  Bot,
  User,
  LogOut,
  Zap,
  CalendarDays,
} from "lucide-react";

const navItems = [
  { href: "/checkin", label: "Check-in", icon: Activity },
  { href: "/log", label: "Log Session", icon: Dumbbell },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: Clock },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/load", label: "Load", icon: BarChart2 },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/coach", label: "Coach", icon: Bot },
  { href: "/profile", label: "Profile", icon: User },
];

// Bottom nav shows the most important 5 items on mobile
const mobileNavItems = [
  { href: "/checkin", label: "Check-in", icon: Activity },
  { href: "/log", label: "Log", icon: Dumbbell },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/coach", label: "Coach", icon: Bot },
  { href: "/profile", label: "Profile", icon: User },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      darkMode ? "dark" : "light",
    );
  }, [darkMode]);

  // Close "more" drawer on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "var(--bg, #060608)",
        color: "#fff",
      }}
    >
      {/* ── DESKTOP SIDEBAR ── */}
      <aside
        id="sidebar"
        style={{
          width: "260px",
          minHeight: "100vh",
          backgroundColor: "rgba(255,255,255,0.02)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          padding: "24px 16px",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "8px",
            padding: "0 8px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              backgroundColor: "#E8FF47",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Zap size={20} color="#060608" strokeWidth={2.5} />
          </div>
          <div>
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "#fff",
                lineHeight: 1,
              }}
            >
              OBSERVER OS
            </div>
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "10px",
                fontWeight: 400,
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.35)",
                marginTop: "3px",
              }}
            >
              PERFORMANCE AI
            </div>
          </div>
        </div>

        {/* Email */}
        {email && (
          <div
            style={{
              padding: "0 8px",
              marginBottom: "20px",
              fontFamily: "Inter, sans-serif",
              fontSize: "12px",
              color: "rgba(255,255,255,0.3)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {email}
          </div>
        )}

        {/* Dark mode toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            marginBottom: "24px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.06)",
            backgroundColor: "rgba(255,255,255,0.03)",
          }}
        >
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "11px",
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            DARK MODE
          </span>
          <button
            onClick={() => setDarkMode(!darkMode)}
            style={{
              width: "40px",
              height: "22px",
              borderRadius: "11px",
              border: "none",
              cursor: "pointer",
              backgroundColor: darkMode ? "#E8FF47" : "rgba(255,255,255,0.15)",
              position: "relative",
              transition: "background-color 0.2s ease",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "3px",
                left: darkMode ? "21px" : "3px",
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                backgroundColor: darkMode ? "#060608" : "#fff",
                transition: "left 0.2s ease",
                display: "block",
              }}
            />
          </button>
        </div>

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  textDecoration: "none",
                  backgroundColor: isActive
                    ? "rgba(232,255,71,0.08)"
                    : "transparent",
                  transition: "all 0.15s ease",
                }}
              >
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.5 : 1.75}
                  color={isActive ? "#E8FF47" : "rgba(255,255,255,0.35)"}
                  style={{
                    flexShrink: 0,
                    filter: isActive
                      ? "drop-shadow(0 0 6px rgba(232,255,71,0.7))"
                      : "none",
                    transition: "all 0.15s ease",
                  }}
                />
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 400,
                    letterSpacing: "0.02em",
                    color: isActive ? "#E8FF47" : "rgba(255,255,255,0.35)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            width: "100%",
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "rgba(255,80,80,0.08)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <LogOut size={15} strokeWidth={1.75} color="rgba(255,255,255,0.25)" />
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "12px",
              letterSpacing: "0.05em",
              color: "rgba(255,255,255,0.25)",
            }}
          >
            SIGN OUT
          </span>
        </button>
      </aside>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav
        id="mobile-nav"
        style={{
          display: "none", // shown via CSS media query
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          flexDirection: "column",
        }}
      >
        {/* "More" drawer — slides up above the tab bar */}
        {moreOpen && (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setMoreOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.6)",
                zIndex: -1,
                animation: "fadeIn 0.15s ease-out",
              }}
            />
            {/* Drawer */}
            <div
              style={{
                background: "rgba(12,12,14,0.97)",
                borderTop: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "20px 20px 0 0",
                padding: "20px 16px 8px",
                backdropFilter: "blur(40px)",
                animation: "slideUp 0.2s cubic-bezier(0.34,1.56,0.64,1)",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 3,
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 99,
                  margin: "0 auto 20px",
                }}
              />

              {/* Extra nav items grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                {[
                  { href: "/history", label: "History", icon: Clock },
                  { href: "/calendar", label: "Calendar", icon: CalendarDays },
                  { href: "/load", label: "Load", icon: BarChart2 },
                  { href: "/goals", label: "Goals", icon: Target },
                ].map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                        padding: "14px 8px",
                        borderRadius: 12,
                        textDecoration: "none",
                        background: isActive
                          ? "rgba(232,255,71,0.08)"
                          : "rgba(255,255,255,0.04)",
                        border: `1px solid ${isActive ? "rgba(232,255,71,0.2)" : "rgba(255,255,255,0.06)"}`,
                      }}
                    >
                      <Icon
                        size={20}
                        strokeWidth={isActive ? 2.5 : 1.75}
                        color={isActive ? "#E8FF47" : "rgba(255,255,255,0.5)"}
                        style={{
                          filter: isActive
                            ? "drop-shadow(0 0 6px rgba(232,255,71,0.7))"
                            : "none",
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: 10,
                          color: isActive ? "#E8FF47" : "rgba(255,255,255,0.4)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {label}
                      </span>
                    </Link>
                  );
                })}
              </div>

              {/* Dark mode + sign out row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 11,
                      color: "rgba(255,255,255,0.4)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    DARK MODE
                  </span>
                  <div
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      background: darkMode
                        ? "#E8FF47"
                        : "rgba(255,255,255,0.15)",
                      position: "relative",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: darkMode ? 18 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: darkMode ? "#060608" : "#fff",
                        transition: "left 0.2s ease",
                        display: "block",
                      }}
                    />
                  </div>
                </button>
                <button
                  onClick={handleSignOut}
                  style={{
                    padding: "12px 16px",
                    background: "rgba(255,80,80,0.06)",
                    border: "1px solid rgba(255,80,80,0.15)",
                    borderRadius: 10,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <LogOut
                    size={14}
                    color="rgba(255,100,100,0.7)"
                    strokeWidth={1.75}
                  />
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 11,
                      color: "rgba(255,100,100,0.7)",
                    }}
                  >
                    OUT
                  </span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(8,8,10,0.95)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {mobileNavItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  padding: "10px 4px",
                  textDecoration: "none",
                  position: "relative",
                }}
              >
                {/* Active indicator pill */}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      top: 6,
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      background: "rgba(232,255,71,0.1)",
                      border: "1px solid rgba(232,255,71,0.15)",
                    }}
                  />
                )}
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 1.75}
                  color={isActive ? "#E8FF47" : "rgba(255,255,255,0.35)"}
                  style={{
                    position: "relative",
                    zIndex: 1,
                    filter: isActive
                      ? "drop-shadow(0 0 6px rgba(232,255,71,0.7))"
                      : "none",
                    transition: "all 0.15s ease",
                  }}
                />
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 9,
                    letterSpacing: "0.05em",
                    color: isActive ? "#E8FF47" : "rgba(255,255,255,0.3)",
                    transition: "color 0.15s ease",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {label}
                </span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "10px 4px",
              background: "none",
              border: "none",
              cursor: "pointer",
              position: "relative",
            }}
          >
            {moreOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 6,
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              />
            )}
            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 3,
                alignItems: "center",
                justifyContent: "center",
                height: 20,
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: moreOpen ? (i === 1 ? 14 : 10) : 14,
                    height: 1.5,
                    background: moreOpen
                      ? "rgba(255,255,255,0.5)"
                      : "rgba(255,255,255,0.35)",
                    borderRadius: 99,
                    transition: "all 0.2s ease",
                    transformOrigin: "center",
                    transform: moreOpen
                      ? i === 0
                        ? "rotate(45deg) translate(3px, 3px)"
                        : i === 2
                          ? "rotate(-45deg) translate(3px, -3px)"
                          : "scaleX(0)"
                      : "none",
                  }}
                />
              ))}
            </div>
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 9,
                letterSpacing: "0.05em",
                color: moreOpen
                  ? "rgba(255,255,255,0.5)"
                  : "rgba(255,255,255,0.3)",
                position: "relative",
                zIndex: 1,
              }}
            >
              More
            </span>
          </button>
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main
        id="main-content"
        style={{
          marginLeft: "260px",
          flex: 1,
          minHeight: "100vh",
          padding: "40px 48px",
          position: "relative",
        }}
      >
        {children}
      </main>
    </div>
  );
}
