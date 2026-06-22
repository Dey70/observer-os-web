import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: conn } = await (supabase as any)
    .from("strava_connections")
    .select("athlete_id, athlete_name, athlete_avatar, last_synced_at, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ connected: false });
  }

  const { count } = await (supabase as any)
    .from("running_activities")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // This week's distance
  const weekStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return d.toISOString().split("T")[0];
  })();

  const { data: weekActivities } = await (supabase as any)
    .from("running_activities")
    .select("distance_meters, activity_type, activity_date, moving_time_seconds")
    .eq("user_id", user.id)
    .gte("activity_date", weekStart)
    .order("activity_date", { ascending: false });

  const weekKm = (weekActivities ?? []).reduce(
    (sum: number, a: { distance_meters: number }) => sum + a.distance_meters,
    0,
  ) / 1000;

  return NextResponse.json({
    connected: true,
    athlete_name: conn.athlete_name,
    athlete_avatar: conn.athlete_avatar,
    last_synced_at: conn.last_synced_at,
    connected_since: conn.created_at,
    activity_count: count ?? 0,
    week_km: Math.round(weekKm * 10) / 10,
    week_activities: weekActivities ?? [],
  });
}
