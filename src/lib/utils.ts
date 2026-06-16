// src/lib/utils.ts
import type {
  DailyLog,
  ReadinessScore,
  DashboardStats,
  Session,
  WeightLog,
} from "@/types";

export function calcReadiness(
  sleepQuality: number,
  soreness: number,
  fatigue: number,
  mood: number,
  energy: number,
): ReadinessScore {
  const score =
    sleepQuality * 0.3 +
    mood * 0.2 +
    energy * 0.2 +
    (10 - soreness) * 0.15 +
    (10 - fatigue) * 0.15;

  const rounded = Math.round(score * 10) / 10;

  if (score >= 8)
    return {
      score: rounded,
      level: "high",
      label: "READY TO PUSH",
      color: "var(--green)",
    };
  if (score >= 5)
    return {
      score: rounded,
      level: "moderate",
      label: "MODERATE",
      color: "var(--yellow)",
    };
  return {
    score: rounded,
    level: "low",
    label: "LOW — PRIORITIZE RECOVERY",
    color: "var(--red)",
  };
}

export function calcDashboardStats(
  logs: DailyLog[],
  sessions: Session[],
  weights: WeightLog[],
): DashboardStats {
  const avg = (arr: number[]) =>
    arr.length
      ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10
      : 0;

  const readinessScores = logs.map(
    (l) =>
      calcReadiness(l.sleep_quality, l.soreness, l.fatigue, l.mood, l.energy)
        .score,
  );

  const byType = { run: 0, lift: 0, study: 0 };
  sessions.forEach((s) => {
    if (s.type in byType) byType[s.type]++;
  });

  return {
    avgSleep: avg(logs.map((l) => l.sleep_hours)),
    avgMood: avg(logs.map((l) => l.mood)),
    avgEnergy: avg(logs.map((l) => l.energy)),
    totalSessions: sessions.length,
    avgReadiness: avg(readinessScores),
    sessionsByType: byType,
    currentWeight: weights[0]?.weight,
    weightAvg7d: avg(weights.slice(0, 7).map((w) => w.weight)),
  };
}

export function calcCheckinStreak(logs: DailyLog[]): number {
  if (!logs.length) return 0;
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const todayStr = new Date().toISOString().split("T")[0];
  const yesterdayStr = new Date(Date.now() - 86400000)
    .toISOString()
    .split("T")[0];

  if (sorted[0].date !== todayStr && sorted[0].date !== yesterdayStr) return 0;

  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const curr = new Date(sorted[i].date);
    const prev = new Date(sorted[i - 1].date);
    const diff = (prev.getTime() - curr.getTime()) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

export function calcSessionStreak(sessions: Session[]): number {
  if (!sessions.length) return 0;
  const uniqueDays = [...new Set(sessions.map((s) => s.date))].sort((a, b) =>
    b.localeCompare(a),
  );
  const todayStr = new Date().toISOString().split("T")[0];
  const yesterdayStr = new Date(Date.now() - 86400000)
    .toISOString()
    .split("T")[0];

  if (uniqueDays[0] !== todayStr && uniqueDays[0] !== yesterdayStr) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const curr = new Date(uniqueDays[i]);
    const prev = new Date(uniqueDays[i - 1]);
    const diff = (prev.getTime() - curr.getTime()) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

export function formatDuration(minutes: number): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function getWeekStart(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export function getLast14Days(): string {
  return new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function isSunday(): boolean {
  return new Date().getDay() === 0;
}

export function effortToRpe(effort: string): number {
  return { easy: 3, medium: 5, hard: 7, vhard: 9 }[effort] ?? 5;
}

export function rpeToLabel(rpe: number): string {
  if (rpe <= 3) return "Easy";
  if (rpe <= 5) return "Medium";
  if (rpe <= 7) return "Hard";
  return "Very Hard";
}

// ── Nutrition: meal type helpers ──
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export function guessMealType(): MealType {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 21) return "dinner";
  return "snack";
}
