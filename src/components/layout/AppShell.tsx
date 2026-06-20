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
  HeartPulse,
  Trophy,
  Apple,
  Settings,
  Home,
} from "lucide-react";

const navItems = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/checkin", label: "Check-in", icon: Activity },
  { href: "/log", label: "Log Session", icon: Dumbbell },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/nutrition", label: "Nutrition", icon: Apple },
  { href: "/history", label: "History", icon: Clock },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/metrics", label: "Metrics", icon: HeartPulse },
  { href: "/records", label: "Records", icon: Trophy },
  { href: "/load", label: "Load", icon: BarChart2 },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/coach", label: "Coach", icon: Bot },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

const mobileNavItems = [
  { href: "/checkin", label: "Check-in", icon: Activity },
  { href: "/log", label: "Log", icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", icon: Apple },
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
        backgroundColor: "var(--bg)",
        color: "var(--text)",
      }}
    >
      {/* ── DESKTOP SIDEBAR ── */}
      <aside
        id="sidebar"
        style={{
          width: "260px",
          minHeight: "100vh",
          backgroundColor: "var(--surface)",
          borderRight: "1px solid var(--border)",
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
              backgroundColor: "var(--accent)",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Zap size={20} color="var(--bg)" strokeWidth={2.5} />
          </div>
          <div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "var(--text)",
                lineHeight: 1,
              }}
            >
              OBSERVER OS
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: "10px",
                fontWeight: 400,
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                marginTop: "3px",
              }}
            >
              PERFORMANCE AI
            </div>
          </div>
        </div>

        {email && (
          <div
            style={{
              padding: "0 8px",
              marginBottom: "20px",
              fontFamily: "var(--sans)",
              fontSize: "12px",
              color: "var(--text-dim)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {email}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            marginBottom: "24px",
            borderRadius: "10px",
            border: "1px solid var(--border2)",
            backgroundColor: "var(--surface2)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: "11px",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
            }}
          >
            {darkMode ? "DARK MODE" : "LIGHT MODE"}
          </span>
          <button
            onClick={() => setDarkMode(!darkMode)}
            style={{
              width: "40px",
              height: "22px",
              borderRadius: "11px",
              border: "none",
              cursor: "pointer",
              backgroundColor: darkMode ? "var(--accent)" : "var(--surface2)",
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
                backgroundColor: darkMode ? "var(--bg)" : "var(--text)",
                transition: "left 0.2s ease",
                display: "block",
              }}
            />
          </button>
        </div>

        <nav
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            overflowY: "auto",
            overflowX: "hidden",
            scrollbarWidth: "thin",
            scrollbarColor: "var(--border) transparent",
            paddingBottom: 8,
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
                    ? "var(--accent-dim)"
                    : "transparent",
                  transition: "all 0.15s ease",
                }}
              >
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.5 : 1.75}
                  color={isActive ? "var(--accent)" : "var(--text-muted)"}
                  style={{
                    flexShrink: 0,
                    filter: isActive
                      ? "drop-shadow(0 0 6px var(--accent-glow))"
                      : "none",
                    transition: "all 0.15s ease",
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 400,
                    letterSpacing: "0.02em",
                    color: isActive ? "var(--accent)" : "var(--text-muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

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
            (e.currentTarget.style.backgroundColor = "var(--red-dim)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <LogOut size={15} strokeWidth={1.75} color="var(--text-dim)" />
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: "12px",
              letterSpacing: "0.05em",
              color: "var(--text-muted)",
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
          display: "none",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          flexDirection: "column",
        }}
      >
        {moreOpen && (
          <>
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
            <div
              style={{
                background: "var(--surface)",
                borderTop: "1px solid var(--border)",
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
                  background: "var(--text-dim)",
                  borderRadius: 99,
                  margin: "0 auto 20px",
                }}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                {[
                  { href: "/home", label: "Home", icon: Home },
                  {
                    href: "/dashboard",
                    label: "Dashboard",
                    icon: LayoutDashboard,
                  },
                  { href: "/history", label: "History", icon: Clock },
                  { href: "/calendar", label: "Calendar", icon: CalendarDays },
                  { href: "/metrics", label: "Metrics", icon: HeartPulse },
                  { href: "/records", label: "Records", icon: Trophy },
                  { href: "/load", label: "Load", icon: BarChart2 },
                  { href: "/goals", label: "Goals", icon: Target },
                  { href: "/settings", label: "Settings", icon: Settings },
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
                          ? "var(--accent-dim)"
                          : "var(--surface2)",
                        border: `1px solid ${isActive ? "var(--accent-dim)" : "var(--border2)"}`,
                      }}
                    >
                      <Icon
                        size={20}
                        strokeWidth={isActive ? 2.5 : 1.75}
                        color={isActive ? "var(--accent)" : "var(--text-muted)"}
                        style={{
                          filter: isActive
                            ? "drop-shadow(0 0 6px var(--accent-glow))"
                            : "none",
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          color: isActive
                            ? "var(--accent)"
                            : "var(--text-muted)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {label}
                      </span>
                    </Link>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    background: "var(--surface2)",
                    border: "1px solid var(--border2)",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {darkMode ? "DARK MODE" : "LIGHT MODE"}
                  </span>
                  <div
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      background: darkMode
                        ? "var(--accent)"
                        : "var(--surface2)",
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
                        background: darkMode ? "var(--bg)" : "var(--text)",
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
                    background: "var(--red-dim)",
                    border: "1px solid var(--red-dim)",
                    borderRadius: 10,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <LogOut size={14} color="var(--red)" strokeWidth={1.75} />
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--red)",
                    }}
                  >
                    OUT
                  </span>
                </button>
              </div>
            </div>
          </>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
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
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      top: 6,
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      background: "var(--accent-dim)",
                      border: "1px solid var(--accent-dim)",
                    }}
                  />
                )}
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 1.75}
                  color={isActive ? "var(--accent)" : "var(--text-muted)"}
                  style={{
                    position: "relative",
                    zIndex: 1,
                    filter: isActive
                      ? "drop-shadow(0 0 6px var(--accent-glow))"
                      : "none",
                    transition: "all 0.15s ease",
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    letterSpacing: "0.05em",
                    color: isActive ? "var(--accent)" : "var(--text-muted)",
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
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
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
                    background: moreOpen ? "var(--text)" : "var(--text-muted)",
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
                fontFamily: "var(--mono)",
                fontSize: 9,
                letterSpacing: "0.05em",
                color: moreOpen ? "var(--text)" : "var(--text-muted)",
                position: "relative",
                zIndex: 1,
              }}
            >
              More
            </span>
          </button>
        </div>
      </nav>

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
        <div
          key={pathname}
          style={{
            animation:
              "pageEnter 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94) both",
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
