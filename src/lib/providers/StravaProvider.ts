import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityProvider, ProviderStatus, SyncResult } from "./ActivityProvider";
import { syncActivities } from "@/lib/strava";

export class StravaProvider implements ActivityProvider {
  readonly id = "strava";
  readonly displayName = "Strava";

  constructor(private readonly supabase: SupabaseClient) {}

  async sync(userId: string): Promise<SyncResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return syncActivities(userId, this.supabase as any);
  }

  async disconnect(userId: string): Promise<void> {
    await this.supabase
      .from("strava_connections")
      .delete()
      .eq("user_id", userId);
  }

  async getStatus(userId: string): Promise<ProviderStatus | null> {
    const { data: conn } = await this.supabase
      .from("strava_connections")
      .select("athlete_name, athlete_avatar, last_synced_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!conn) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (this.supabase as any)
      .from("running_activities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    return {
      connected: true,
      athleteName: (conn as any).athlete_name ?? undefined,
      athleteAvatar: (conn as any).athlete_avatar ?? undefined,
      lastSyncedAt: (conn as any).last_synced_at ?? undefined,
      activityCount: count ?? 0,
    };
  }
}
