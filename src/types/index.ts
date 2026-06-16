export interface DailyLog {
  id: number;
  user_id: string;
  date: string;
  sleep_hours: number;
  nap_hours?: number;
  sleep_quality: number;
  soreness: number;
  fatigue: number;
  mood: number;
  energy: number;
  notes?: string;
  created_at: string;
}

export interface Session {
  id: number;
  user_id: string;
  date: string;
  type: "run" | "lift" | "study";
  duration: number;
  rpe: number;
  notes?: string;
  created_at: string;
}

export interface WeightLog {
  id: number;
  user_id: string;
  date: string;
  weight: number;
  created_at: string;
}

export interface Goal {
  id: number;
  user_id: string;
  type: string;
  title: string;
  target_value: number;
  current_value: number;
  unit: string;
  deadline?: string;
  active: boolean;
  created_at: string;
}

export interface TrainingPlan {
  id: number;
  user_id: string;
  week_start: string;
  plan: PlanDay[];
  generated_at: string;
  notes: string;
}

export interface PlanDay {
  date: string;
  day: string;
  type: "run" | "lift" | "study" | "rest" | "cross";
  title: string;
  description: string;
  target_duration?: number;
  target_rpe?: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  timestamp?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type ReadinessLevel = "high" | "moderate" | "low";

export interface ReadinessScore {
  score: number;
  level: ReadinessLevel;
  label: string;
  color: string;
}

export interface DashboardStats {
  avgSleep: number;
  avgMood: number;
  avgEnergy: number;
  totalSessions: number;
  avgReadiness: number;
  sessionsByType: { run: number; lift: number; study: number };
  currentWeight?: number;
  weightAvg7d?: number;
}
