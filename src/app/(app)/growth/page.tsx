"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────
type CategoryKey = "study" | "project" | "learning" | "deep_work";

type LogRow = {
  date: string;
  category: CategoryKey;
  duration_min: number;
  focus_score: number | null;
  title?: string;
};

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORIES: { key: CategoryKey; label: string; color: string }[] = [
  { key: "study",     label: "Study",     color: "var(--accent)" },
  { key: "project",   label: "Project",   color: "var(--green)" },
  { key: "learning",  label: "Learning",  color: "var(--purple)" },
  { key: "deep_work", label: "Deep Work", color: "var(--yellow)" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function isoOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
}

function fmtDuration(min: number): string {
  if (min === 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
}

function fmtDurationTooltip(min: number): string {
  if (min === 0) return "No activity";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
}

function fmtHours(min: number, showDash = true): string {
  if (showDash && min === 0) return "—";
  return (min / 60).toFixed(1) + "h";
}

function dayDiff(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

function computeStreaks(logs: Pick<LogRow, "date">[]): { current: number; longest: number } {
  const days = new Set(logs.map((l) => l.date));
  let current = 0;
  const t = new Date();
  while (true) {
    const d = t.toISOString().split("T")[0];
    if (!days.has(d)) break;
    current++;
    t.setDate(t.getDate() - 1);
  }
  const sorted = [...days].sort();
  let longest = 0, run = 0, prev = "";
  for (const d of sorted) {
    run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest };
}

function heatColor(min: number): string {
  if (min === 0) return "var(--surface2)";
  if (min <= 30) return "rgba(232,255,71,0.15)";
  if (min <= 60) return "rgba(232,255,71,0.35)";
  if (min <= 120) return "rgba(232,255,71,0.65)";
  return "var(--accent)";
}

type HourMilestones = { h10: string | null; h50: string | null; h100: string | null; h200: string | null };

function computeHourMilestones(logs: LogRow[]): HourMilestones {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  const r: HourMilestones = { h10: null, h50: null, h100: null, h200: null };
  for (const log of sorted) {
    cum += log.duration_min;
    if (!r.h10 && cum >= 600) r.h10 = log.date;
    if (!r.h50 && cum >= 3000) r.h50 = log.date;
    if (!r.h100 && cum >= 6000) r.h100 = log.date;
    if (!r.h200 && cum >= 12000) r.h200 = log.date;
  }
  return r;
}

type Insight = { title: string; body: string; color: string };

function buildInsights(all: LogRow[], currentStreak: number, longestStreak: number): Insight[] {
  const insights: Insight[] = [];
  const totalMin = all.reduce((s, l) => s + l.duration_min, 0);
  if (totalMin === 0) return insights;

  const since7   = isoOffset(-7);
  const since14  = isoOffset(-14);
  const since21  = isoOffset(-21);
  const tomorrow = isoOffset(1);

  const catMin = new Map<CategoryKey, number>();
  for (const cat of CATEGORIES) catMin.set(cat.key, 0);
  for (const log of all) catMin.set(log.category, (catMin.get(log.category) ?? 0) + log.duration_min);

  // Rule 1: dominant category (always)
  const dominant = CATEGORIES.reduce((a, b) => (catMin.get(a.key) ?? 0) >= (catMin.get(b.key) ?? 0) ? a : b);
  const domPct = Math.round((catMin.get(dominant.key) ?? 0) / totalMin * 100);
  insights.push({
    title: `${dominant.label} leads your growth`,
    body: `${dominant.label} accounts for ${domPct}% of all logged growth time.`,
    color: dominant.color,
  });

  // Rule 2: deep work trend
  const dwCurr = all.filter(l => l.category === "deep_work" && l.date >= since7 && l.date < tomorrow).reduce((s, l) => s + l.duration_min, 0);
  const dwPrev = all.filter(l => l.category === "deep_work" && l.date >= since14 && l.date < since7).reduce((s, l) => s + l.duration_min, 0);
  if (dwPrev > 0 && insights.length < 6) {
    const pct = Math.round((dwCurr - dwPrev) / dwPrev * 100);
    if (dwCurr > dwPrev * 1.1) {
      insights.push({ title: "Deep Work is accelerating", body: `Up ${pct}% this week vs last. Your capacity for sustained focus is growing.`, color: "var(--green)" });
    } else if (dwCurr < dwPrev * 0.9) {
      insights.push({ title: "Deep Work has dropped", body: `Down ${Math.abs(pct)}% this week. Consider blocking dedicated time tomorrow.`, color: "var(--red)" });
    }
  }

  // Rule 3: persistently declining category (3 weekly buckets)
  if (insights.length < 6) {
    for (const cat of CATEGORIES) {
      const w3 = all.filter(l => l.category === cat.key && l.date >= since21 && l.date < since14).reduce((s, l) => s + l.duration_min, 0);
      const w2 = all.filter(l => l.category === cat.key && l.date >= since14 && l.date < since7).reduce((s, l) => s + l.duration_min, 0);
      const w1 = all.filter(l => l.category === cat.key && l.date >= since7 && l.date < tomorrow).reduce((s, l) => s + l.duration_min, 0);
      if (w3 > 0 && w2 < w3 * 0.8 && w1 < w2 * 0.8) {
        insights.push({ title: `${cat.label} has declined for three weeks`, body: `${cat.label} has trended down every week. A rebalance may help.`, color: "var(--yellow)" });
        break;
      }
    }
  }

  // Rule 4: best day of week
  if (insights.length < 6) {
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const byDay = Array(7).fill(0) as number[];
    for (const log of all) {
      byDay[new Date(log.date + "T12:00:00").getDay()] += log.duration_min;
    }
    const bestDow = byDay.indexOf(Math.max(...byDay));
    if (byDay[bestDow] > 0) {
      insights.push({ title: `You grow most on ${DAYS[bestDow]}s`, body: `${DAYS[bestDow]} is consistently your highest-volume growth day.`, color: "var(--accent)" });
    }
  }

  // Rule 5: streak momentum
  if (insights.length < 6) {
    if (currentStreak >= 7) {
      insights.push({ title: `${currentStreak}-day streak active`, body: `You have logged growth every day for ${currentStreak} days. Keep it going.`, color: "var(--accent)" });
    } else if (currentStreak === 0 && longestStreak >= 7) {
      insights.push({ title: "Streak broken — time to restart", body: `Your longest streak was ${longestStreak} days. One session today resets it.`, color: "var(--yellow)" });
    }
  }

  // Rule 6: high focus sessions
  if (insights.length < 6) {
    const highFocus = all.filter(l => (l.focus_score ?? 0) >= 8).length;
    if (highFocus >= 5) {
      insights.push({ title: "Strong focus profile", body: `${highFocus} sessions rated 8+ focus. You work with intent.`, color: "var(--green)" });
    }
  }

  // Minimum 3: pad with 2nd/3rd category stats
  if (insights.length < 3) {
    const rest = CATEGORIES
      .filter(c => c.key !== dominant.key)
      .sort((a, b) => (catMin.get(b.key) ?? 0) - (catMin.get(a.key) ?? 0));
    for (const cat of rest) {
      if (insights.length >= 3) break;
      const m = catMin.get(cat.key) ?? 0;
      if (m > 0) {
        const p = Math.round(m / totalMin * 100);
        insights.push({ title: `${cat.label} is your #${insights.length + 1} category`, body: `${cat.label} makes up ${p}% of total growth time — ${fmtHours(m, false)} logged.`, color: cat.color });
      }
    }
  }

  return insights.slice(0, 6);
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function GrowthPage() {
  const sb = createClient();
  const [recent, setRecent] = useState<LogRow[]>([]);
  const [all, setAll]       = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [width, setWidth]   = useState(1200);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWidth(window.innerWidth);
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const load = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setLoading(false); return; }

    const since90 = isoOffset(-90);

    const [{ data: recentData }, { data: allData }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("growth_logs")
        .select("date, category, duration_min, focus_score, title")
        .eq("user_id", user.id)
        .gte("date", since90)
        .order("date", { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb as any).from("growth_logs")
        .select("date, category, duration_min, focus_score")
        .eq("user_id", user.id)
        .order("date"),
    ]);

    let allLogs = (allData ?? []) as LogRow[];

    // Legacy fallback: sessions(type='study') if no growth_logs exist
    if (allLogs.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: studySessions } = await (sb as any)
        .from("sessions")
        .select("date, duration")
        .eq("user_id", user.id)
        .eq("type", "study")
        .order("date");
      if (studySessions) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allLogs = (studySessions as any[]).map((s) => ({
          date:         s.date as string,
          category:     "study" as CategoryKey,
          duration_min: (s.duration as number) ?? 0,
          focus_score:  null,
        }));
      }
    }

    setRecent((recentData ?? []) as LogRow[]);
    setAll(allLogs);
    setLoading(false);
  }, [sb]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const today    = isoOffset(0);
  const tomorrow = isoOffset(1);
  const since7   = isoOffset(-7);
  const since14  = isoOffset(-14);
  const isMobile = width <= 480;

  const totalAllMinutes  = all.reduce((s, l) => s + l.duration_min, 0);
  const totalAllSessions = all.length;

  const focusScores = all.filter(l => l.focus_score !== null).map(l => l.focus_score as number);
  const avgFocusAll = focusScores.length
    ? Math.round(focusScores.reduce((s, v) => s + v, 0) / focusScores.length * 10) / 10
    : null;

  const thisWeekMin = all.filter(l => l.date >= since7 && l.date < tomorrow).reduce((s, l) => s + l.duration_min, 0);

  const { current: currentStreak, longest: longestStreak } =
    totalAllSessions > 0 ? computeStreaks(all) : { current: 0, longest: 0 };

  const activeDays90  = new Set(all.filter(l => l.date >= isoOffset(-90)).map(l => l.date)).size;
  const activeDaysPct = Math.round(activeDays90 / 90 * 100);

  const firstDate       = all.length > 0 ? all[0].date : null;
  const totalSpanDays   = firstDate ? Math.max(1, dayDiff(firstDate, today) + 1) : 1;
  const dailyAvgMin     = totalAllMinutes / totalSpanDays;
  const weeklyAvgMin    = dailyAvgMin * 7;

  // Per-category all-time totals
  const catTotals = new Map<CategoryKey, number>();
  for (const cat of CATEGORIES) catTotals.set(cat.key, 0);
  for (const log of all) catTotals.set(log.category, (catTotals.get(log.category) ?? 0) + log.duration_min);

  // Per-category avg focus
  const catFocusAvg = new Map<CategoryKey, number | null>();
  for (const cat of CATEGORIES) {
    const sc = all.filter(l => l.category === cat.key && l.focus_score !== null).map(l => l.focus_score as number);
    catFocusAvg.set(cat.key, sc.length ? Math.round(sc.reduce((s, v) => s + v, 0) / sc.length * 10) / 10 : null);
  }

  // Records
  const longestSession   = all.length > 0 ? all.reduce((b, l) => l.duration_min > b.duration_min ? l : b) : null;
  const bestFocusSession = all.filter(l => l.focus_score !== null).reduce<LogRow | null>((b, l) => !b || (l.focus_score ?? 0) > (b.focus_score ?? 0) ? l : b, null);
  const minutesByDate    = new Map<string, number>();
  for (const log of all) minutesByDate.set(log.date, (minutesByDate.get(log.date) ?? 0) + log.duration_min);
  let bestDay = { date: "", minutes: 0 };
  for (const [date, min] of minutesByDate) if (min > bestDay.minutes) bestDay = { date, minutes: min };

  // Weekly intelligence text
  const weeklyInsight = (() => {
    if (thisWeekMin === 0) return "No growth logged this week. Block time today to start your streak.";
    const h = thisWeekMin / 60;
    if (h >= 15) return `Exceptional week — ${h.toFixed(1)}h of deliberate growth logged.`;
    const activeCats = CATEGORIES.filter(c => all.filter(l => l.category === c.key && l.date >= since7).length > 0);
    if (activeCats.length === 4) return "All four growth categories active this week. Well-rounded deliberate practice.";
    const topCat = CATEGORIES.map(c => ({ ...c, min: all.filter(l => l.category === c.key && l.date >= since7).reduce((s, l) => s + l.duration_min, 0) }))
      .reduce((a, b) => a.min >= b.min ? a : b);
    if (topCat.min === 0) return "Growth logged this week. Keep building the habit.";
    return `Strong ${topCat.label.toLowerCase()} focus this week — ${fmtHours(topCat.min, false)} logged.`;
  })();

  // ── Section 07: Heatmap ───────────────────────────────────────────────────
  const cellCount = isMobile ? 56 : 91;
  const weekCount = isMobile ? 8 : 13;
  const sqGap     = 3;

  const byDateMap = new Map<string, { minutes: number; sessions: number }>();
  for (const log of recent) {
    const e = byDateMap.get(log.date) ?? { minutes: 0, sessions: 0 };
    e.minutes += log.duration_min;
    e.sessions += 1;
    byDateMap.set(log.date, e);
  }
  const cells = Array.from({ length: cellCount }, (_, i) => {
    const date = isoOffset(i - (cellCount - 1));
    return { date, ...(byDateMap.get(date) ?? { minutes: 0, sessions: 0 }) };
  });
  const heatWeeks = Array.from({ length: weekCount }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  const monthLabels = new Map<number, string>();
  for (let i = 0; i < cellCount; i++) {
    const d = new Date(cells[i].date + "T12:00:00");
    if (d.getDate() === 1) monthLabels.set(Math.floor(i / 7), d.toLocaleString("en-US", { month: "short" }));
  }

  // ── Section 09: Category trends ───────────────────────────────────────────
  const catTrends = CATEGORIES.map(cat => {
    const currMin = all.filter(l => l.category === cat.key && l.date >= since7  && l.date < tomorrow).reduce((s, l) => s + l.duration_min, 0);
    const prevMin = all.filter(l => l.category === cat.key && l.date >= since14 && l.date < since7).reduce((s, l) => s + l.duration_min, 0);
    const pct     = prevMin === 0 ? (currMin > 0 ? 100 : 0) : Math.round((currMin - prevMin) / prevMin * 100);
    return { ...cat, currMin, prevMin, pct };
  });

  // ── Section 10: Monthly timeline ──────────────────────────────────────────
  const monthlyRows = (() => {
    const rows = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (5 - i));
      const key   = d.toISOString().slice(0, 7);
      const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
      return { key, label, minutes: 0, isCurrent: key === today.slice(0, 7) };
    });
    for (const log of all) {
      const key = log.date.slice(0, 7);
      const row = rows.find(r => r.key === key);
      if (row) row.minutes += log.duration_min;
    }
    return rows.reverse();
  })();
  const maxMonthMin = Math.max(...monthlyRows.map(r => r.minutes), 1);

  // ── Section 11: Milestones ────────────────────────────────────────────────
  const hourMilestones  = computeHourMilestones(all);
  const maxFocusScore   = focusScores.length ? Math.max(...focusScores) : null;
  const longestDeepWork = all.filter(l => l.category === "deep_work").reduce((b, l) => l.duration_min > b ? l.duration_min : b, 0);

  type MilestoneItem = { id: string; label: string; desc: string; unlocked: boolean; dateAchieved: string | null; progress: { current: number; target: number } | null };

  const milestones: MilestoneItem[] = [
    { id: "first_session", label: "First Growth Session", desc: "Logged your first growth session", unlocked: totalAllSessions >= 1,   dateAchieved: firstDate, progress: null },
    { id: "hours_10",      label: "10 Hours Logged",      desc: "Accumulated 10 hours of growth",  unlocked: totalAllMinutes >= 600,  dateAchieved: hourMilestones.h10,  progress: totalAllMinutes < 600  ? { current: totalAllMinutes, target: 600  } : null },
    { id: "hours_50",      label: "50 Hours Logged",      desc: "Accumulated 50 hours of growth",  unlocked: totalAllMinutes >= 3000, dateAchieved: hourMilestones.h50,  progress: totalAllMinutes < 3000 ? { current: totalAllMinutes, target: 3000 } : null },
    { id: "hours_100",     label: "100 Hours Logged",     desc: "Accumulated 100 hours of growth", unlocked: totalAllMinutes >= 6000, dateAchieved: hourMilestones.h100, progress: totalAllMinutes < 6000 ? { current: totalAllMinutes, target: 6000 } : null },
    { id: "streak_7",      label: "7-Day Streak",         desc: "7 consecutive growth days",       unlocked: longestStreak >= 7,      dateAchieved: null, progress: longestStreak < 7  ? { current: longestStreak, target: 7  } : null },
    { id: "streak_30",     label: "30-Day Streak",        desc: "30 consecutive growth days",      unlocked: longestStreak >= 30,     dateAchieved: null, progress: longestStreak < 30 ? { current: longestStreak, target: 30 } : null },
    { id: "focus_peak",    label: "Peak Focus",           desc: "A session with focus score 10",   unlocked: maxFocusScore === 10,    dateAchieved: maxFocusScore === 10 ? (all.find(l => l.focus_score === 10)?.date ?? null) : null, progress: null },
    { id: "deep_work_2h",  label: "Marathon Deep Work",   desc: "Single deep work session ≥ 2h",   unlocked: longestDeepWork >= 120,  dateAchieved: longestDeepWork >= 120 ? (all.find(l => l.category === "deep_work" && l.duration_min >= 120)?.date ?? null) : null, progress: null },
  ];

  const sortedMilestones = [
    ...milestones.filter(m => m.unlocked).sort((a, b) => (b.dateAchieved ?? "").localeCompare(a.dateAchieved ?? "")),
    ...milestones.filter(m => !m.unlocked).sort((a, b) => {
      const pa = a.progress ? a.progress.current / a.progress.target : 0;
      const pb = b.progress ? b.progress.current / b.progress.target : 0;
      return pb - pa;
    }),
  ];

  // ── Section 12: Insights ──────────────────────────────────────────────────
  const insights = buildInsights(all, currentStreak, longestStreak);

  // ── Loading / empty ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <PageHeader title="GROWTH ANALYTICS" subtitle="Deliberate cognitive development" />
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: 13 }}>Loading...</div>
      </div>
    );
  }

  if (totalAllSessions === 0) {
    return (
      <div>
        <PageHeader title="GROWTH ANALYTICS" subtitle="Deliberate cognitive development" />
        <EmptyState message="No growth sessions logged yet — add your first session to begin tracking" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <style>{`
        .gr-5 { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
        .gr-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
        .gr-2 { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
        @media(max-width:900px){
          .gr-5{grid-template-columns:repeat(3,1fr);}
          .gr-4{grid-template-columns:repeat(2,1fr);}
        }
        @media(max-width:640px){
          .gr-5{grid-template-columns:repeat(2,1fr);}
          .gr-4{grid-template-columns:1fr;}
          .gr-2{grid-template-columns:1fr;}
        }
      `}</style>

      <PageHeader title="GROWTH ANALYTICS" subtitle="Deliberate cognitive development" />

      {/* 01 — Overview ───────────────────────────────────────────────────── */}
      <div className="gr-5" style={{ marginBottom: 16 }}>
        {[
          { label: "Total Hours",  value: fmtHours(totalAllMinutes, false), color: "var(--accent)", sub: "all time" },
          { label: "This Week",    value: fmtHours(thisWeekMin,     false), color: "var(--green)",  sub: "last 7 days" },
          { label: "Sessions",     value: String(totalAllSessions),          color: "var(--text)",   sub: "all time" },
          { label: "Avg Focus",    value: avgFocusAll !== null ? `${avgFocusAll}/10` : "—", color: "var(--purple)", sub: "all sessions" },
          { label: "Streak",       value: currentStreak > 0 ? `${currentStreak}d` : "—", color: currentStreak >= 7 ? "var(--accent)" : "var(--text)", sub: "current" },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 6 }}>{label}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* 02 — Category Distribution ─────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Category Distribution</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {CATEGORIES.map(cat => {
            const min = catTotals.get(cat.key) ?? 0;
            const pct = totalAllMinutes > 0 ? min / totalAllMinutes : 0;
            return (
              <div key={cat.key}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{cat.label}</span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>{Math.round(pct * 100)}%</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: cat.color, minWidth: 40, textAlign: "right" }}>{fmtHours(min)}</span>
                  </div>
                </div>
                <div style={{ height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct * 100}%`, background: cat.color, borderRadius: 2, transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 03 — Focus Analytics ───────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Focus Analytics</div>
        {avgFocusAll === null ? (
          <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>No focus scores logged yet.</div>
        ) : (
          <div className="gr-4">
            {CATEGORIES.map(cat => {
              const avg = catFocusAvg.get(cat.key);
              return (
                <div key={cat.key} style={{ background: "var(--surface2)", borderRadius: "var(--radius-md)", padding: 14, border: "1px solid var(--border)" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, color: avg !== null ? cat.color : "var(--text-dim)", lineHeight: 1 }}>{avg !== null ? avg : "—"}</div>
                  <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 8 }}>{cat.label}</div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>avg focus / 10</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 04 — Growth Records ────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Growth Records</div>
        <div className="gr-4">
          {[
            { label: "Longest Session", value: longestSession ? fmtDuration(longestSession.duration_min) : "—", sub: longestSession?.date ?? "—" },
            { label: "Longest Streak",  value: longestStreak > 0 ? `${longestStreak} days` : "—",              sub: "consecutive days" },
            { label: "Best Focus",      value: bestFocusSession ? `${bestFocusSession.focus_score}/10` : "—",   sub: bestFocusSession?.date ?? "—" },
            { label: "Best Day",        value: bestDay.minutes > 0 ? fmtHours(bestDay.minutes, false) : "—",   sub: bestDay.date || "—" },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ background: "var(--surface2)", borderRadius: "var(--radius-md)", padding: 14, border: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 8 }}>{label}</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 05 — Recent Sessions ───────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Recent Sessions</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {recent.slice(0, 8).map((log, i) => {
            const cat = CATEGORIES.find(c => c.key === log.category);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < Math.min(recent.length, 8) - 1 ? "1px solid var(--border)" : "none", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: cat?.color ?? "var(--text-dim)" }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.title ?? cat?.label ?? log.category}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)", marginTop: 2 }}>{log.date}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  {log.focus_score !== null && (
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--mono)" }}>{log.focus_score}/10</div>
                  )}
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: cat?.color ?? "var(--text)" }}>{fmtDuration(log.duration_min)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 06 — Growth Intelligence ───────────────────────────────────────── */}
      <div style={{ padding: "16px 20px", marginBottom: 16, background: "var(--surface)", borderRadius: 10, border: "1px solid var(--accent-dim)", display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0, paddingTop: 1 }}>This Week</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>{weeklyInsight}</div>
      </div>

      {/* 07 — 90-Day Growth Heatmap ─────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {isMobile ? "8-Week" : "90-Day"} Growth Heatmap
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {[
              { label: "0",   color: "var(--surface2)" },
              { label: "30m", color: "rgba(232,255,71,0.15)" },
              { label: "1h",  color: "rgba(232,255,71,0.35)" },
              { label: "2h",  color: "rgba(232,255,71,0.65)" },
              { label: "2h+", color: "var(--accent)" },
            ].map(({ label, color }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
                <div style={{ fontSize: 8, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Month labels row */}
        <div style={{ display: "flex", gap: sqGap, marginBottom: 5, width: "100%" }}>
          {Array.from({ length: weekCount }, (_, wi) => (
            <div key={wi} style={{ flex: 1, minWidth: 0, fontSize: 9, color: "var(--text-dim)", fontFamily: "var(--mono)", overflow: "visible", whiteSpace: "nowrap" }}>
              {monthLabels.get(wi) ?? ""}
            </div>
          ))}
        </div>

        {/* Heatmap grid — flex columns stretch to fill card width */}
        <div role="grid" aria-label={`${isMobile ? "8-week" : "90-day"} growth activity`} style={{ display: "flex", gap: sqGap, width: "100%" }}>
          {heatWeeks.map((week, wi) => (
            <div key={wi} style={{ flex: 1, display: "flex", flexDirection: "column", gap: sqGap }}>
              {week.map((cell) => {
                const isToday = cell.date === today;
                const d       = new Date(cell.date + "T12:00:00");
                const dateLbl = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                const tip     = cell.minutes > 0
                  ? `${dateLbl}\n${fmtDurationTooltip(cell.minutes)}\n${cell.sessions} session${cell.sessions !== 1 ? "s" : ""}`
                  : `${dateLbl}\nNo activity`;
                return (
                  <div
                    key={cell.date}
                    role="gridcell"
                    aria-label={`${dateLbl}: ${cell.minutes > 0 ? fmtDurationTooltip(cell.minutes) : "no activity"}`}
                    title={tip}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      background: heatColor(cell.minutes),
                      borderRadius: 3,
                      cursor: "default",
                      outline: isToday ? "1.5px solid var(--accent)" : "none",
                      outlineOffset: isToday ? "1.5px" : "0",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      {/* 08 — Consistency Analytics ─────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Consistency</div>
        <div className="gr-5">
          {[
            { key: "cur",    label: "Current Streak", value: currentStreak > 0 ? `${currentStreak}` : "0",       sub: "days",          color: currentStreak >= 7 ? "var(--accent)" : "var(--text)", hi: currentStreak >= 7 },
            { key: "lng",    label: "Longest Streak", value: longestStreak > 0  ? `${longestStreak}` : "0",      sub: "days",          color: longestStreak >= 7 ? "var(--accent)" : "var(--text)", hi: currentStreak >= 7 && longestStreak >= 7 },
            { key: "act",    label: "Active Days",    value: `${activeDaysPct}%`,                                  sub: "last 90 days",  color: "var(--text)", hi: false },
            { key: "daily",  label: "Daily Avg",      value: dailyAvgMin >= 1 ? fmtHours(dailyAvgMin, false) : "—", sub: "per day",     color: "var(--text)", hi: false },
            { key: "weekly", label: "Weekly Avg",     value: weeklyAvgMin >= 1 ? fmtHours(weeklyAvgMin, false) : "—", sub: "per week", color: "var(--text)", hi: false },
          ].map(({ key, label, value, sub, color, hi }) => (
            <div key={key} style={{ background: hi ? "var(--accent-dim)" : "var(--surface2)", borderRadius: "var(--radius-md)", padding: 14, border: `1px solid ${hi ? "rgba(232,255,71,0.2)" : "var(--border)"}` }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>{sub}</div>
              <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 6 }}>{label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 09 — Category Trends ───────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Category Trends</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>last 7 days vs prior 7</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {catTrends.map((cat, i) => {
            const up   = cat.pct > 5;
            const down = cat.pct < -5;
            const tc   = up ? "var(--green)" : down ? "var(--red)" : "var(--text-dim)";
            const icon = up ? "▲" : down ? "▼" : "→";
            const txt  = up ? `+${cat.pct}%` : down ? `${cat.pct}%` : "Stable";
            const bg   = up ? "rgba(0,230,118,0.1)" : down ? "rgba(255,68,68,0.1)" : "rgba(255,255,255,0.04)";
            return (
              <div key={cat.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < catTrends.length - 1 ? "1px solid var(--border)" : "none" }}>
                <div style={{ flex: "0 0 80px", fontSize: 13, color: "var(--text-muted)" }}>{cat.label}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700, color: "var(--text)", width: 50 }}>
                  {cat.currMin > 0 ? fmtHours(cat.currMin) : "—"}
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 4, backgroundColor: bg }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: tc }}>{icon} {txt}</span>
                </div>
                <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                  prev {cat.prevMin > 0 ? fmtHours(cat.prevMin) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 10 — Monthly Growth Timeline ───────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Monthly Timeline</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {monthlyRows.map((row) => (
            <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: "0 0 140px", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                {row.isCurrent && (
                  <span style={{ fontSize: 8, color: "var(--accent)", fontFamily: "var(--mono)", border: "1px solid rgba(232,255,71,0.3)", borderRadius: 3, padding: "1px 4px", letterSpacing: "0.08em", flexShrink: 0 }}>NOW</span>
                )}
              </div>
              <div style={{ flex: 1, height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(row.minutes / maxMonthMin) * 100}%`, background: row.isCurrent ? "var(--accent)" : "rgba(232,255,71,0.5)", borderRadius: 2, transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
              </div>
              <div style={{ flex: "0 0 46px", textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: row.minutes > 0 ? "var(--text)" : "var(--text-dim)" }}>
                {fmtHours(row.minutes)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 11 — Growth Milestones ─────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Milestones</div>
        <div className="gr-2">
          {sortedMilestones.map((m) => (
            <div key={m.id} style={{ background: "var(--surface2)", borderRadius: "var(--radius-md)", padding: 14, border: `1px solid ${m.unlocked ? "rgba(232,255,71,0.15)" : "var(--border)"}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, flexShrink: 0, marginTop: 1, color: m.unlocked ? "var(--accent)" : "var(--text-dim)" }}>
                  {m.unlocked ? "✓" : "○"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: m.unlocked ? "var(--text)" : "var(--text-muted)" }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{m.desc}</div>
                  {m.unlocked && m.dateAchieved && (
                    <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)", marginTop: 6 }}>{m.dateAchieved}</div>
                  )}
                  {!m.unlocked && m.progress && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                          {m.id.startsWith("hours")
                            ? `${fmtHours(m.progress.current, false)} / ${fmtHours(m.progress.target, false)}`
                            : `${m.progress.current} / ${m.progress.target} days`}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                          {Math.round(m.progress.current / m.progress.target * 100)}%
                        </span>
                      </div>
                      <div style={{ height: 3, background: "var(--surface)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, m.progress.current / m.progress.target * 100)}%`, background: "rgba(232,255,71,0.4)", borderRadius: 2 }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 12 — Insights ──────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Insights</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>Generated from your growth patterns</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {insights.map((ins, i) => (
            <div
              key={i}
              style={{
                borderLeft: `2px solid ${ins.color}`,
                paddingLeft: 12,
                paddingTop: 4,
                paddingBottom: i < insights.length - 1 ? 16 : 4,
                marginBottom: i < insights.length - 1 ? 4 : 0,
                borderBottom: i < insights.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>{ins.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.6 }}>{ins.body}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
