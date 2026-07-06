// src/lib/supabase/database.types.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      daily_logs: {
        Row: {
          id: number;
          user_id: string;
          date: string;
          sleep_hours: number;
          sleep_quality: number;
          soreness: number;
          fatigue: number;
          mood: number;
          energy: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          date: string;
          sleep_hours: number;
          sleep_quality: number;
          soreness: number;
          fatigue: number;
          mood: number;
          energy: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          sleep_hours?: number;
          sleep_quality?: number;
          soreness?: number;
          fatigue?: number;
          mood?: number;
          energy?: number;
          notes?: string | null;
        };
      };
      sessions: {
        Row: {
          id: number;
          user_id: string;
          date: string;
          type: "run" | "lift" | "study";
          duration: number;
          rpe: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          date: string;
          type: "run" | "lift" | "study";
          duration: number;
          rpe: number;
          notes?: string | null;
        };
        Update: {
          type?: "run" | "lift" | "study";
          duration?: number;
          rpe?: number;
          notes?: string | null;
        };
      };
      weight_logs: {
        Row: {
          id: number;
          user_id: string;
          date: string;
          weight: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          date: string;
          weight: number;
        };
        Update: {
          weight?: number;
        };
      };
      water_logs: {
        Row: {
          id: number;
          user_id: string;
          date: string;
          amount_ml: number;
          logged_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          date: string;
          amount_ml: number;
          logged_at?: string;
        };
        Update: {
          amount_ml?: number;
        };
      };
      goals: {
        Row: {
          id: number;
          user_id: string;
          type: string;
          title: string;
          target_value: number;
          current_value: number;
          unit: string;
          deadline: string | null;
          active: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          type: string;
          title: string;
          target_value: number;
          current_value: number;
          unit: string;
          deadline?: string | null;
          active?: boolean;
        };
        Update: {
          type?: string;
          title?: string;
          target_value?: number;
          current_value?: number;
          unit?: string;
          deadline?: string | null;
          active?: boolean;
        };
      };
      training_plans: {
        Row: {
          id: number;
          user_id: string;
          week_start: string;
          plan: Json;
          notes: string;
          generated_at: string;
        };
        Insert: {
          user_id: string;
          week_start: string;
          plan: Json;
          notes: string;
          generated_at?: string;
        };
        Update: {
          plan?: Json;
          notes?: string;
          generated_at?: string;
        };
      };
      body_metrics: {
        Row: {
          id: number;
          user_id: string;
          date: string;
          hrv: number | null;
          resting_hr: number | null;
          vo2max: number | null;
          body_fat: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          date: string;
          hrv?: number | null;
          resting_hr?: number | null;
          vo2max?: number | null;
          body_fat?: number | null;
          notes?: string | null;
        };
        Update: {
          hrv?: number | null;
          resting_hr?: number | null;
          vo2max?: number | null;
          body_fat?: number | null;
          notes?: string | null;
        };
      };
      profiles: {
        Row: {
          id: number;
          user_id: string;
          name: string | null;
          age: number | null;
          weight_unit: string;
          split: string;
          weekly_goal: number;
          target_weight: number | null;
          notes: string | null;
          sex: "male" | "female" | null;
          height_cm: number | null;
          nutrition_goal_type:
            | "bulk"
            | "cut"
            | "maintain"
            | "recomp"
            | "endurance"
            | null;
          auto_adjust_macros: boolean | null;
          latitude: number | null;
          longitude: number | null;
          city_name: string | null;
          theme: "dark" | "light" | "indian" | "japanese" | "scandinavian" | "nord" | "dracula";
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name?: string | null;
          age?: number | null;
          weight_unit?: string;
          split?: string;
          weekly_goal?: number;
          target_weight?: number | null;
          notes?: string | null;
          sex?: "male" | "female" | null;
          height_cm?: number | null;
          nutrition_goal_type?:
            | "bulk"
            | "cut"
            | "maintain"
            | "recomp"
            | "endurance"
            | null;
          auto_adjust_macros?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          city_name?: string | null;
          theme?: "dark" | "light" | "indian" | "japanese" | "scandinavian" | "nord" | "dracula";
        };
        Update: {
          name?: string | null;
          age?: number | null;
          weight_unit?: string;
          split?: string;
          weekly_goal?: number;
          target_weight?: number | null;
          notes?: string | null;
          sex?: "male" | "female" | null;
          height_cm?: number | null;
          nutrition_goal_type?:
            | "bulk"
            | "cut"
            | "maintain"
            | "recomp"
            | "endurance"
            | null;
          auto_adjust_macros?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          city_name?: string | null;
          theme?: "dark" | "light" | "indian" | "japanese" | "scandinavian" | "nord" | "dracula";
        };
      };
      nutrition_logs: {
        Row: {
          id: number;
          user_id: string;
          meal_group_id: string;
          date: string;
          logged_at: string;
          meal_type: "breakfast" | "lunch" | "dinner" | "snack" | "junk";
          item_name: string;
          portion_desc: string | null;
          raw_input: string | null;
          source: "off" | "usda" | "ai" | "manual";
          confidence: "high" | "medium" | "low";
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          fiber: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          meal_group_id?: string;
          date: string;
          meal_type?: "breakfast" | "lunch" | "dinner" | "snack" | "junk";
          item_name: string;
          portion_desc?: string | null;
          raw_input?: string | null;
          source?: "off" | "usda" | "ai" | "manual";
          confidence?: "high" | "medium" | "low";
          calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
          fiber?: number;
        };
        Update: {
          meal_type?: "breakfast" | "lunch" | "dinner" | "snack" | "junk";
          item_name?: string;
          portion_desc?: string | null;
          calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
          fiber?: number;
        };
      };
      strava_connections: {
        Row: {
          id: string;
          user_id: string;
          athlete_id: number;
          athlete_name: string | null;
          athlete_avatar: string | null;
          access_token: string;
          refresh_token: string;
          expires_at: number;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          athlete_id: number;
          athlete_name?: string | null;
          athlete_avatar?: string | null;
          access_token: string;
          refresh_token: string;
          expires_at: number;
          last_synced_at?: string | null;
          updated_at?: string;
        };
        Update: {
          athlete_name?: string | null;
          athlete_avatar?: string | null;
          access_token?: string;
          refresh_token?: string;
          expires_at?: number;
          last_synced_at?: string | null;
          updated_at?: string;
        };
      };
      running_activities: {
        Row: {
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
        };
        Insert: {
          user_id: string;
          strava_activity_id: number;
          activity_name: string;
          activity_type?: string;
          distance_meters?: number;
          moving_time_seconds?: number;
          elapsed_time_seconds?: number;
          calories?: number | null;
          average_speed?: number | null;
          max_speed?: number | null;
          elevation_gain?: number | null;
          activity_date: string;
          source?: string;
        };
        Update: {
          activity_name?: string;
          activity_type?: string;
          distance_meters?: number;
          moving_time_seconds?: number;
          elapsed_time_seconds?: number;
          calories?: number | null;
          average_speed?: number | null;
          max_speed?: number | null;
          elevation_gain?: number | null;
        };
      };
      daily_steps: {
        Row: {
          id: string;
          user_id: string;
          date: string;
          steps: number;
          source: string;
          synced_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          date: string;
          steps: number;
          source?: string;
          synced_at?: string;
        };
        Update: {
          date?: string;
          steps?: number;
          source?: string;
          synced_at?: string;
        };
      };
      food_cache: {
        Row: {
          id: number;
          query_normalized: string;
          source: "off" | "usda" | "ai";
          calories_per_100g: number;
          protein_per_100g: number;
          carbs_per_100g: number;
          fat_per_100g: number;
          fiber_per_100g: number;
          last_used_at: string;
          created_at: string;
        };
        Insert: {
          query_normalized: string;
          source: "off" | "usda" | "ai";
          calories_per_100g: number;
          protein_per_100g?: number;
          carbs_per_100g?: number;
          fat_per_100g?: number;
          fiber_per_100g?: number;
          last_used_at?: string;
        };
        Update: {
          source?: "off" | "usda" | "ai";
          calories_per_100g?: number;
          protein_per_100g?: number;
          carbs_per_100g?: number;
          fat_per_100g?: number;
          fiber_per_100g?: number;
          last_used_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
