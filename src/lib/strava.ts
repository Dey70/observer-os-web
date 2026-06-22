import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Strava API Types ─────────────────────────────────────────────────────────

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile_medium: string; // avatar URL
}

export interface StravaTokenResponse {
  token_type: string;
  expires_at: number; // Unix timestamp
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete: StravaAthlete;
}

export interface StravaRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;       // deprecated but still populated
  sport_type: string; // Run, TrailRun, Ride, Walk, etc.
  distance: number;   // meters
  moving_time: number;    // seconds
  elapsed_time: number;   // seconds
  total_elevation_gain: number;
  calories: number;
  average_speed: number;  // m/s
  max_speed: number;      // m/s
  start_date: string;       // ISO, UTC
  start_date_local: string; // ISO, athlete's local time
}

export interface StravaConnection {
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
}

export interface RunningActivityRow {
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

// ─── Constants ────────────────────────────────────────────────────────────────

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// Sport types we track as training activities
const TRACKED_SPORT_TYPES = new Set([
  "Run", "TrailRun", "VirtualRun",
  "Walk", "Hike",
  "Ride", "VirtualRide", "MountainBikeRide",
]);

// ─── OAuth ────────────────────────────────────────────────────────────────────

export function getStravaAuthUrl(state: string): string {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId) throw new Error("STRAVA_CLIENT_ID is not set");
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not set");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
    state,
  });
  return `${STRAVA_AUTH_URL}?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token exchange failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<StravaTokenResponse>;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<StravaRefreshResponse> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token refresh failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<StravaRefreshResponse>;
}

// ─── Activities ───────────────────────────────────────────────────────────────

export async function fetchActivities(
  accessToken: string,
  opts: { after?: number; page?: number; perPage?: number } = {},
): Promise<StravaActivity[]> {
  const { after, page = 1, perPage = 100 } = opts;
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (after !== undefined) params.set("after", String(after));

  const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava activities fetch failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<StravaActivity[]>;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export interface SyncResult {
  inserted: number;
  fetched: number;
}

export async function syncActivities(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<SyncResult> {
  // 1. Load the stored connection
  const { data: conn, error: connErr } = await supabase
    .from("strava_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (connErr || !conn) {
    throw new Error("No Strava connection found for this user.");
  }

  // 2. Auto-refresh token if within 60 s of expiry
  let accessToken: string = conn.access_token;
  if (Math.floor(Date.now() / 1000) > conn.expires_at - 60) {
    const refreshed = await refreshAccessToken(conn.refresh_token);
    accessToken = refreshed.access_token;
    await supabase
      .from("strava_connections")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: refreshed.expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  // 3. Use the most recent stored activity date as a cursor
  const { data: latestRow } = await supabase
    .from("running_activities")
    .select("activity_date")
    .eq("user_id", userId)
    .order("activity_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Subtract one day from the cursor so we don't miss same-day activities
  let after: number | undefined;
  if (latestRow?.activity_date) {
    const d = new Date(latestRow.activity_date + "T00:00:00Z");
    d.setDate(d.getDate() - 1);
    after = Math.floor(d.getTime() / 1000);
  }

  // 4. Fetch from Strava
  const activities = await fetchActivities(accessToken, { after });

  // 5. Filter and map
  const relevant = activities.filter(
    (a) => TRACKED_SPORT_TYPES.has(a.sport_type ?? a.type),
  );

  if (relevant.length > 0) {
    const rows = relevant.map((a) => ({
      user_id: userId,
      strava_activity_id: a.id,
      activity_name: a.name,
      activity_type: a.sport_type ?? a.type,
      distance_meters: a.distance ?? 0,
      moving_time_seconds: a.moving_time ?? 0,
      elapsed_time_seconds: a.elapsed_time ?? 0,
      calories: a.calories ?? null,
      average_speed: a.average_speed ?? null,
      max_speed: a.max_speed ?? null,
      elevation_gain: a.total_elevation_gain ?? null,
      activity_date: a.start_date_local.split("T")[0],
      source: "strava",
    }));

    await supabase
      .from("running_activities")
      .upsert(rows, {
        onConflict: "user_id,strava_activity_id",
        ignoreDuplicates: true,
      });
  }

  // 6. Update last_synced_at
  await supabase
    .from("strava_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { inserted: relevant.length, fetched: activities.length };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatPace(metersPerSecond: number): string {
  if (!metersPerSecond || metersPerSecond <= 0) return "—";
  const minPerKm = 1000 / 60 / metersPerSecond;
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, "0")} /km`;
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "0 min";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(2);
}

export function activityTypeLabel(sportType: string): string {
  const map: Record<string, string> = {
    Run: "Run", TrailRun: "Trail Run", VirtualRun: "Virtual Run",
    Walk: "Walk", Hike: "Hike",
    Ride: "Ride", VirtualRide: "Virtual Ride", MountainBikeRide: "MTB",
  };
  return map[sportType] ?? sportType;
}

export function activityTypeColor(sportType: string): string {
  if (sportType.includes("Run") || sportType === "Walk" || sportType === "Hike") {
    return "var(--green)";
  }
  if (sportType.includes("Ride")) {
    return "var(--yellow)";
  }
  return "var(--accent)";
}
