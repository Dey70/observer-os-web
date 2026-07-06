export type SkipReason =
  | "fatigue"
  | "injury"
  | "busy"
  | "travel"
  | "motivation"
  | "weather"
  | "unknown";

export interface SessionSkipReason {
  id:         string;
  user_id:    string;
  date:       string;
  reason:     SkipReason;
  created_at: string;
}

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

export interface StravaConnection {
  id: string;
  user_id: string;
  athlete_id: number;
  athlete_name: string | null;
  athlete_avatar: string | null;
  last_synced_at: string | null;
  connected_since: string;
  activity_count: number;
  week_km: number;
  week_activities: RunningActivity[];
}

export interface RunningActivity {
  id: string;
  user_id: string;
  strava_activity_id: number;
  activity_name: string;
  activity_type: string;
  distance_meters: number;
  moving_time_seconds: number;
  elapsed_time_seconds: number;
  calories: number | null;
  average_speed: number | null;
  max_speed: number | null;
  elevation_gain: number | null;
  activity_date: string;
  source: string;
  created_at: string;
}

export interface DailyStep {
  id: string;
  user_id: string;
  date: string;
  steps: number;
  source: string;
  synced_at: string;
  created_at: string;
}

export interface TrainingMetric {
  id: string;
  user_id: string;
  session_id: number;
  activity_date: string;
  trimp: number;
  tss: number;
  pace_seconds_per_km: number | null;
  load_score: number;
  source: string;
  created_at: string;
}

export interface GrowthLog {
  id: string;
  user_id: string;
  date: string;
  category: "study" | "project" | "learning" | "deep_work";
  title: string;
  duration_min: number;
  focus_score: number | null;
  output_notes: string | null;
  tags: string[] | null;
  created_at: string;
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
