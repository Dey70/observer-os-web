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
        };
        Update: {
          name?: string | null;
          age?: number | null;
          weight_unit?: string;
          split?: string;
          weekly_goal?: number;
          target_weight?: number | null;
          notes?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
