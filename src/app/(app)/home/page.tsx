"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { calcReadiness, calcCheckinStreak, calcSessionStreak } from "@/lib/utils";
import { calcBMR } from "@/lib/nutritionEngine";
import type { DailyLog, Session, WeightLog, Goal } from "@/types";
import {
  LayoutDashboard,
  Apple,
  Bot,
  Target,
  Dumbbell,
  CalendarDays,
  HeartPulse,
  Trophy,
  Moon,
  Flame,
  Scale,
  ChevronRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/nutrition", label: "Nutrition", icon: Apple },
  { href: "/coach", label: "Coach", icon: Bot },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/log", label: "Log", icon: Dumbbell },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/metrics", label: "Metrics", icon: HeartPulse },
  { href: "/records", label: "Records", icon: Trophy },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function WelcomeBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "16px 20px",
        marginBottom: 20,
        border: "1px solid var(--accent)",
        background: "var(--accent-dim)",
        borderRadius: "var(--radius-xl)",
        flexWrap: "wrap",
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--accent)",
            marginBottom: 4,
          }}
        >
          Welcome to Observer OS
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Set up your profile so targets, coaching, and tracking actually reflect you.
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <Link
          href="/profile"
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            background: "var(--accent)",
            color: "var(--bg)",
            fontFamily: "var(--mono)",
            fontSize: 12,
            fontWeight: 700,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Complete profile
        </Link>
        <button
          onClick={onDismiss}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-dim)",
            fontSize: 12,
            fontFamily: "var(--mono)",
            cursor: "pointer",
          }}
        >
          Later
        </button>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  color,
  href,
  progress,
  empty,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  href?: string;
  progress?: number;
  empty?: string;
}) {
  const inner = (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        padding: "20px 20px 16px",
        position: "relative",
        overflow: "hidden",
        height: "100%",
        boxSizing: "border-box",
        transition: "border-color 0.15s, transform 0.15s",
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = color ?? "var(--accent)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: color ?? "var(--accent)",
          borderRadius: "12px 12px 0 0",
        }}
      />
      <div
        style={{
          fontSize: 9,
          color: "var(--text-muted)",
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          fontFamily: "var(--mono)",
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      {empty ? (
        <div
          style={{
            fontSize: 13,
            color: "var(--text-dim)",
            fontFamily: "var(--mono)",
            lineHeight: 1.5,
          }}
        >
          {empty}
        </div>
      ) : (
        <>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 28,
              fontWeight: 700,
              color: color ?? "var(--text)",
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            {value}
          </div>
          {sub && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "var(--mono)",
              }}
            >
              {sub}
            </div>
          )}
          {progress !== undefined && (
            <div
              style={{
                marginTop: 10,
                height: 4,
                background: "var(--border)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(100, Math.max(0, progress))}%`,
                  background: color ?? "var(--accent)",
                  borderRadius: 4,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", display: "block" }}>
        {inner}
      </Link>
    );
  }
  return inner;
}

export default function HomePage() {
  const sb = createClient();
  const [name, setName] = useState("there");
  const [greeting, setGreeting] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [todayLog, setTodayLog] = useState<DailyLog | null>(null);
  const [todayCals, setTodayCals] = useState<number | null>(null);
  const [calTarget, setCalTarget] = useState<number | null>(null);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null);
  const [checkinStreak, setCheckinStreak] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [todaySessionCount, setTodaySessionCount] = useState(0);

  useEffect(() => {
    setGreeting(getGreeting());
    setDateStr(formatDate());

    async function load() {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) return;

      const todayStr = new Date().toISOString().split("T")[0];
      const since14 = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];

      const [
        { data: profileData },
        { data: todayLogData },
        { data: nutritionData },
        { data: weightData },
        { data: goalData },
        { data: recentLogs },
        { data: recentSessions },
        { data: todaySessions },
      ] = await Promise.all([
        sb.from("profiles").select("name, age, height_cm, sex, nutrition_goal_type").eq("user_id", user.id).maybeSingle(),
        sb.from("daily_logs").select("*").eq("user_id", user.id).eq("date", todayStr).maybeSingle(),
        sb.from("nutrition_logs").select("calories").eq("user_id", user.id).eq("date", todayStr),
        sb.from("weight_logs").select("weight").eq("user_id", user.id).order("date", { ascending: false }).limit(7),
        sb.from("goals").select("*").eq("user_id", user.id).eq("active", true).order("created_at", { ascending: false }).limit(1),
        sb.from("daily_logs").select("*").eq("user_id", user.id).gte("date", since14).order("date"),
        sb.from("sessions").select("*").eq("user_id", user.id).gte("date", since14).order("date", { ascending: false }),
        sb.from("sessions").select("id").eq("user_id", user.id).eq("date", todayStr),
      ]);

      const profile = profileData as { name: string | null; age: number | null; height_cm: number | null; sex: string | null; nutrition_goal_type: string | null } | null;
      setName(profile?.name?.trim() || user.email?.split("@")[0] || "there");

      const missingProfile = !profile?.age || !profile?.height_cm || !profile?.sex;
      const missingWeight = !weightData || weightData.length === 0;
      setNeedsOnboarding(missingProfile || missingWeight);

      setTodayLog(todayLogData ? (todayLogData as unknown as DailyLog) : null);

      const nutRows = (nutritionData ?? []) as { calories: number }[];
      const cals = nutRows.reduce((s, r) => s + (r.calories ?? 0), 0);
      setTodayCals(nutRows.length > 0 ? cals : null);

      const wArr = (weightData ?? []) as WeightLog[];
      setLatestWeight(wArr[0]?.weight ?? null);

      if (profile?.age && profile?.height_cm && profile?.sex && wArr[0]?.weight) {
        const bmr = calcBMR(
          profile.sex as "male" | "female",
          wArr[0].weight,
          profile.height_cm,
          profile.age,
        );
        setCalTarget(Math.round(bmr * 1.55));
      }

      setActiveGoal(goalData && goalData.length > 0 ? (goalData[0] as Goal) : null);
      setCheckinStreak(calcCheckinStreak((recentLogs ?? []) as DailyLog[]));
      setSessionStreak(calcSessionStreak((recentSessions ?? []) as Session[]));
      setTodaySessionCount((todaySessions ?? []).length);

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

  const readiness =
    todayLog
      ? calcReadiness(
          todayLog.sleep_quality,
          todayLog.soreness,
          todayLog.fatigue,
          todayLog.mood,
          todayLog.energy,
        )
      : null;

  const sleepVal = todayLog
    ? `${(todayLog.sleep_hours + (todayLog.nap_hours ?? 0)).toFixed(1)}h`
    : "—";

  const calVal = todayCals !== null ? `${Math.round(todayCals).toLocaleString()}` : "—";
  const calSub = calTarget
    ? todayCals !== null
      ? `of ${calTarget.toLocaleString()} kcal target`
      : `target ${calTarget.toLocaleString()} kcal`
    : todayCals !== null
      ? "kcal logged today"
      : "no food logged today";
  const calProgress = calTarget && todayCals !== null ? (todayCals / calTarget) * 100 : undefined;

  const weightVal = latestWeight ? `${latestWeight} kg` : "—";

  let goalVal = "—";
  let goalSub = "";
  let goalProgress: number | undefined;
  if (activeGoal) {
    const pct = activeGoal.target_value !== 0
      ? Math.round((activeGoal.current_value / activeGoal.target_value) * 100)
      : 0;
    goalVal = `${activeGoal.current_value} ${activeGoal.unit}`;
    goalSub = `→ ${activeGoal.target_value} ${activeGoal.unit}`;
    goalProgress = pct;
  }

  return (
    <>
      <style>{`
        .home-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
        .home-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
        .home-nav { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; }
        .home-action-btn {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 6px; padding: 18px 12px; border-radius: var(--radius-xl);
          border: 1px solid var(--border); background: var(--surface);
          color: var(--text-muted); font-family: var(--mono); font-size: 12px;
          font-weight: 600; letter-spacing: 0.04em; text-decoration: none;
          text-transform: uppercase; transition: all 0.15s; cursor: pointer;
        }
        .home-action-btn:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-2px); }
        .home-action-btn.primary { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
        .home-action-btn.primary:hover { box-shadow: 0 0 20px var(--accent-glow); }
        .home-nav-item {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          padding: 12px 4px; border-radius: var(--radius-md);
          border: 1px solid var(--border); background: var(--surface);
          text-decoration: none; color: var(--text-dim); font-family: var(--mono);
          font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase;
          transition: all 0.15s;
        }
        .home-nav-item:hover { border-color: var(--accent); color: var(--accent); }
        @media (max-width: 768px) {
          .home-grid { grid-template-columns: repeat(2, 1fr); }
          .home-actions { grid-template-columns: repeat(1, 1fr); gap: 10px; }
          .home-nav { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {needsOnboarding && !bannerDismissed && (
          <WelcomeBanner onDismiss={() => setBannerDismissed(true)} />
        )}

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 24,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, marginBottom: 4 }}>
              <span style={{ color: "var(--text)" }}>{greeting}, </span>
              <span
                style={{
                  background: "linear-gradient(90deg, var(--accent), var(--purple), var(--green))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {name}
              </span>
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--text-muted)",
                letterSpacing: "0.05em",
              }}
            >
              {dateStr}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            {readiness ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: `1px solid ${readiness.color}`,
                  background: `${readiness.color}18`,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: readiness.color,
                    boxShadow: `0 0 6px ${readiness.color}`,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: readiness.color,
                  }}
                >
                  {readiness.label}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: readiness.color, fontWeight: 700 }}>
                  {readiness.score}
                </span>
              </div>
            ) : (
              <Link
                href="/log"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "1px solid var(--border2)",
                  background: "var(--surface)",
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  textDecoration: "none",
                  letterSpacing: "0.06em",
                }}
              >
                No check-in today · Log now
                <ChevronRight size={12} />
              </Link>
            )}
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", textAlign: "right" }}>
              {checkinStreak > 0 && (
                <span style={{ marginRight: 10 }}>
                  {checkinStreak >= 3 ? "🔥" : "•"} {checkinStreak}d check-in streak
                </span>
              )}
              {sessionStreak > 0 && (
                <span>
                  {sessionStreak >= 3 ? "🔥" : "•"} {sessionStreak}d session streak
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="home-grid">
          <StatTile
            label="Sleep"
            value={sleepVal}
            sub={todayLog ? "last night" : "not logged yet"}
            color="var(--accent)"
            href="/log"
            empty={!todayLog ? "Check in to log sleep" : undefined}
          />
          <StatTile
            label="Calories"
            value={calVal}
            sub={calSub}
            color="var(--red)"
            href="/nutrition"
            progress={calProgress}
          />
          <StatTile
            label="Weight"
            value={weightVal}
            sub={latestWeight ? "latest logged" : "not logged yet"}
            color="var(--purple)"
            href="/dashboard"
          />
          <StatTile
            label={activeGoal ? activeGoal.title : "Active Goal"}
            value={goalVal}
            sub={goalSub || undefined}
            color="var(--green)"
            href="/goals"
            progress={goalProgress}
            empty={!activeGoal ? "No active goal set" : undefined}
          />
        </div>

        {/* Quick actions */}
        <div className="home-actions">
          <Link href="/log" className="home-action-btn primary">
            <Dumbbell size={18} strokeWidth={1.75} />
            Log Workout
          </Link>
          <Link href="/nutrition" className="home-action-btn">
            <Apple size={18} strokeWidth={1.75} />
            Log Food
          </Link>
          <Link href="/coach" className="home-action-btn">
            <Bot size={18} strokeWidth={1.75} />
            Ask Coach
          </Link>
        </div>

        {/* Today summary strip */}
        {(todaySessionCount > 0 || todayLog) && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 20,
              padding: "10px 16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--text-dim)",
                marginRight: 4,
              }}
            >
              Today
            </span>
            {todaySessionCount > 0 && (
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--accent)",
                  padding: "2px 8px",
                  border: "1px solid var(--accent)",
                  borderRadius: 4,
                }}
              >
                {todaySessionCount} session{todaySessionCount !== 1 ? "s" : ""} logged
              </span>
            )}
            {todayLog && (
              <>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)" }}>
                  Mood {todayLog.mood}/10
                </span>
                <span style={{ color: "var(--border2)", fontSize: 10 }}>·</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-muted)" }}>
                  Energy {todayLog.energy}/10
                </span>
              </>
            )}
          </div>
        )}

        {/* Nav shortcuts */}
        <div
          style={{
            fontSize: 9,
            fontFamily: "var(--mono)",
            color: "var(--text-dim)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Sections
        </div>
        <div className="home-nav">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href} className="home-nav-item">
                <Icon size={16} strokeWidth={1.75} />
                {n.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
