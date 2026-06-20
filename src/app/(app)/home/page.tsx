"use client";

import { useState, useEffect, useRef } from "react";
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

const HERO_MODES = [
  {
    key: "run",
    label: "RUN",
    color: "var(--green)",
    colorHex: "#4ade80",
    quotes: [
      "Run until the doubt runs out.",
      "Every mile is a conversation with your limits.",
      "The road doesn't care about excuses.",
    ],
  },
  {
    key: "lift",
    label: "LIFT",
    color: "var(--purple)",
    colorHex: "#a855f7",
    quotes: [
      "The bar never lies.",
      "Iron is the great equalizer.",
      "Progress is measured in plates, not promises.",
    ],
  },
  {
    key: "study",
    label: "STUDY",
    color: "var(--yellow)",
    colorHex: "#eab308",
    quotes: [
      "Knowledge compounds like muscle.",
      "The mind is the ultimate performance edge.",
      "Read. Adapt. Execute.",
    ],
  },
] as const;

function RunFigure() {
  return (
    <svg
      viewBox="0 0 120 130"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="hero-run-fig"
      style={{ width: "100%", height: "100%" }}
    >
      {/* Head */}
      <circle cx="68" cy="20" r="11" />
      {/* Body — leaning forward */}
      <line x1="68" y1="31" x2="58" y2="70" />
      {/* Leading arm (right, reaching forward) */}
      <line x1="63" y1="47" x2="86" y2="37" />
      {/* Trailing arm (left, swinging back) */}
      <line x1="63" y1="47" x2="42" y2="43" />
      {/* Leading leg (left, kicked forward) — two-segment */}
      <line x1="58" y1="70" x2="36" y2="90" />
      <line x1="36" y1="90" x2="22" y2="118" />
      {/* Trailing leg (right, pushed back) */}
      <line x1="58" y1="70" x2="76" y2="85" />
      <line x1="76" y1="85" x2="90" y2="112" />
      {/* Speed lines */}
      <line x1="4" y1="52" x2="24" y2="52" strokeWidth="1.5" strokeOpacity="0.45" />
      <line x1="4" y1="62" x2="19" y2="62" strokeWidth="1.5" strokeOpacity="0.3" />
      <line x1="4" y1="72" x2="26" y2="72" strokeWidth="1.5" strokeOpacity="0.18" />
    </svg>
  );
}

function LiftFigure() {
  return (
    <svg
      viewBox="0 0 120 130"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="hero-lift-fig"
      style={{ width: "100%", height: "100%" }}
    >
      {/* Barbell bar */}
      <line x1="6" y1="16" x2="114" y2="16" strokeWidth="3" />
      {/* Large plates left */}
      <rect x="4" y="7" width="6" height="18" rx="1.5" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="11" y="10" width="4" height="12" rx="1" fill="currentColor" stroke="none" opacity="0.55" />
      {/* Large plates right */}
      <rect x="110" y="7" width="6" height="18" rx="1.5" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="105" y="10" width="4" height="12" rx="1" fill="currentColor" stroke="none" opacity="0.55" />
      {/* Head */}
      <circle cx="60" cy="42" r="11" />
      {/* Body */}
      <line x1="60" y1="53" x2="60" y2="90" />
      {/* Left arm up — two-segment */}
      <line x1="60" y1="64" x2="30" y2="34" />
      <line x1="30" y1="34" x2="22" y2="16" />
      {/* Right arm up — two-segment */}
      <line x1="60" y1="64" x2="90" y2="34" />
      <line x1="90" y1="34" x2="98" y2="16" />
      {/* Left leg */}
      <line x1="60" y1="90" x2="36" y2="122" />
      {/* Right leg */}
      <line x1="60" y1="90" x2="84" y2="122" />
    </svg>
  );
}

function StudyFigure() {
  return (
    <svg
      viewBox="0 0 120 130"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="hero-study-fig"
      style={{ width: "100%", height: "100%" }}
    >
      {/* Head slightly tilted toward screen */}
      <circle cx="60" cy="22" r="11" />
      {/* Glasses */}
      <line x1="52" y1="20" x2="57" y2="20" strokeWidth="1.5" strokeOpacity="0.7" />
      <line x1="63" y1="20" x2="68" y2="20" strokeWidth="1.5" strokeOpacity="0.7" />
      {/* Body */}
      <line x1="60" y1="33" x2="60" y2="58" />
      {/* Left arm on desk */}
      <line x1="60" y1="46" x2="32" y2="60" />
      {/* Right arm on desk */}
      <line x1="60" y1="46" x2="88" y2="60" />
      {/* Laptop screen */}
      <rect x="16" y="54" width="88" height="52" rx="4" />
      {/* Screen glow fill */}
      <rect x="16" y="54" width="88" height="52" rx="4" fill="currentColor" opacity="0.04" stroke="none" />
      {/* Code lines on screen */}
      <line x1="26" y1="67" x2="70" y2="67" strokeWidth="1.5" strokeOpacity="0.5" />
      <line x1="26" y1="75" x2="88" y2="75" strokeWidth="1.5" strokeOpacity="0.5" />
      <line x1="26" y1="83" x2="58" y2="83" strokeWidth="1.5" strokeOpacity="0.5" />
      <line x1="26" y1="91" x2="78" y2="91" strokeWidth="1.5" strokeOpacity="0.5" />
      {/* Blinking cursor on screen */}
      <rect x="26" y="97" width="7" height="2.5" rx="1" fill="currentColor" opacity="0.7" stroke="none" className="hero-cursor" />
      {/* Laptop base */}
      <line x1="10" y1="106" x2="110" y2="106" strokeWidth="3" />
      <line x1="6" y1="111" x2="114" y2="111" strokeWidth="2" strokeOpacity="0.4" />
    </svg>
  );
}

function HeroCard() {
  const [modeIdx, setModeIdx] = useState(0);
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [charIdx, setCharIdx] = useState(0);
  const isPausedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mode = HERO_MODES[modeIdx];
  const currentQuote = mode.quotes[quoteIdx];

  // Typewriter: reset when quote changes
  useEffect(() => {
    setDisplayText("");
    setCharIdx(0);
  }, [currentQuote]);

  // Typewriter: advance one character at a time
  useEffect(() => {
    if (charIdx >= currentQuote.length) return;
    const t = setTimeout(() => {
      setDisplayText((p) => p + currentQuote[charIdx]);
      setCharIdx((p) => p + 1);
    }, 32);
    return () => clearTimeout(t);
  }, [charIdx, currentQuote]);

  // Auto-advance: next quote → next mode
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPausedRef.current) return;
      setQuoteIdx((q) => {
        const maxQ = HERO_MODES[modeIdx].quotes.length;
        if (q + 1 >= maxQ) {
          setModeIdx((m) => (m + 1) % HERO_MODES.length);
          return 0;
        }
        return q + 1;
      });
    }, 4800);
    return () => clearInterval(interval);
  }, [modeIdx]);

  function selectMode(idx: number) {
    setModeIdx(idx);
    setQuoteIdx(0);
    isPausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      isPausedRef.current = false;
    }, 12000);
  }

  const figures = [<RunFigure key="run" />, <LiftFigure key="lift" />, <StudyFigure key="study" />];

  return (
    <div
      style={{
        position: "relative",
        border: `1px solid ${mode.colorHex}40`,
        borderRadius: "var(--radius-xl)",
        background: `radial-gradient(ellipse at 20% 50%, ${mode.colorHex}0d 0%, var(--surface) 65%)`,
        padding: "24px 28px",
        marginBottom: 20,
        overflow: "hidden",
        transition: "border-color 0.6s ease, background 0.6s ease",
      }}
    >
      {/* Scan-line overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.025) 3px, rgba(0,0,0,0.025) 6px)",
          pointerEvents: "none",
          borderRadius: "inherit",
        }}
      />
      {/* Corner accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${mode.colorHex}cc, transparent 60%)`,
          borderRadius: "inherit",
          transition: "background 0.6s ease",
        }}
      />

      <div className="hero-inner">
        {/* SVG figure panel */}
        <div
          className="hero-figure"
          style={{
            color: mode.color,
            filter: `drop-shadow(0 0 14px ${mode.colorHex}55)`,
            transition: "color 0.6s ease, filter 0.6s ease",
          }}
        >
          {figures[modeIdx]}
        </div>

        {/* Content panel */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {/* Mode badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 11px",
              borderRadius: 4,
              border: `1px solid ${mode.colorHex}88`,
              background: `${mode.colorHex}14`,
              fontFamily: "var(--mono)",
              fontSize: 9,
              letterSpacing: "0.18em",
              color: mode.color,
              textTransform: "uppercase",
              marginBottom: 14,
              width: "fit-content",
              transition: "all 0.5s ease",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: mode.color,
                boxShadow: `0 0 5px ${mode.colorHex}`,
                flexShrink: 0,
              }}
            />
            {mode.label} · PROTOCOL
          </div>

          {/* Typewriter quote */}
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 17,
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.45,
              marginBottom: 16,
              minHeight: 52,
            }}
          >
            &ldquo;{displayText}
            <span className="hero-cursor-blink" style={{ color: mode.color }}>
              |
            </span>
            &rdquo;
          </div>

          {/* Quote progress dots */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, alignItems: "center" }}>
            {mode.quotes.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === quoteIdx ? 18 : 6,
                  height: 4,
                  borderRadius: 2,
                  background: i === quoteIdx ? mode.color : "var(--border2)",
                  transition: "all 0.35s ease",
                }}
              />
            ))}
          </div>

          {/* Mode selector tabs */}
          <div style={{ display: "flex", gap: 6 }}>
            {HERO_MODES.map((m, i) => (
              <button
                key={m.key}
                onClick={() => selectMode(i)}
                style={{
                  padding: "5px 13px",
                  borderRadius: 4,
                  border: `1px solid ${i === modeIdx ? m.colorHex + "cc" : "var(--border)"}`,
                  background: i === modeIdx ? `${m.colorHex}18` : "transparent",
                  color: i === modeIdx ? m.color : "var(--text-dim)",
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  fontWeight: i === modeIdx ? 700 : 400,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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

      const profile = profileData as {
        name: string | null;
        age: number | null;
        height_cm: number | null;
        sex: string | null;
        nutrition_goal_type: string | null;
      } | null;

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

  const readiness = todayLog
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
    const pct =
      activeGoal.target_value !== 0
        ? Math.round((activeGoal.current_value / activeGoal.target_value) * 100)
        : 0;
    goalVal = `${activeGoal.current_value} ${activeGoal.unit}`;
    goalSub = `→ ${activeGoal.target_value} ${activeGoal.unit}`;
    goalProgress = pct;
  }

  return (
    <>
      <style>{`
        /* Layout grids */
        .home-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
        .home-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
        .home-nav { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; }

        /* Quick action buttons */
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

        /* Nav shortcut tiles */
        .home-nav-item {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          padding: 12px 4px; border-radius: var(--radius-md);
          border: 1px solid var(--border); background: var(--surface);
          text-decoration: none; color: var(--text-dim); font-family: var(--mono);
          font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase;
          transition: all 0.15s;
        }
        .home-nav-item:hover { border-color: var(--accent); color: var(--accent); }

        /* Hero card inner layout */
        .hero-inner {
          display: flex; align-items: center; gap: 28px; position: relative; z-index: 1;
        }
        .hero-figure { width: 130px; height: 140px; flex-shrink: 0; }

        /* Hero figure animations */
        .hero-run-fig { animation: heroRunBounce 0.75s ease-in-out infinite; transform-origin: center bottom; }
        .hero-lift-fig { animation: heroLiftPress 1.4s ease-in-out infinite; transform-origin: center bottom; }
        .hero-study-fig { animation: heroStudyNod 3s ease-in-out infinite; transform-origin: center center; }
        .hero-cursor { animation: heroCursorBlink 1.1s step-end infinite; }
        .hero-cursor-blink { animation: heroCursorBlink 0.65s step-end infinite; }

        @keyframes heroRunBounce {
          0%, 100% { transform: translateY(0px) rotate(-1.5deg); }
          50%       { transform: translateY(-6px) rotate(1.5deg); }
        }
        @keyframes heroLiftPress {
          0%        { transform: translateY(0) scaleY(1); }
          30%       { transform: translateY(3px) scaleY(0.97); }
          65%       { transform: translateY(-5px) scaleY(1.02); }
          100%      { transform: translateY(0) scaleY(1); }
        }
        @keyframes heroStudyNod {
          0%, 100%  { transform: translateY(0); }
          50%       { transform: translateY(2px); }
        }
        @keyframes heroCursorBlink {
          0%, 100%  { opacity: 1; }
          50%       { opacity: 0; }
        }

        @media (max-width: 640px) {
          .hero-inner { flex-direction: column; gap: 16px; }
          .hero-figure { width: 100px; height: 110px; }
          .home-grid { grid-template-columns: repeat(2, 1fr); }
          .home-actions { grid-template-columns: repeat(1, 1fr); gap: 10px; }
          .home-nav { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {needsOnboarding && !bannerDismissed && (
          <WelcomeBanner onDismiss={() => setBannerDismissed(true)} />
        )}

        {/* Greeting header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 20,
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

        {/* Hero card */}
        <HeroCard />

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
