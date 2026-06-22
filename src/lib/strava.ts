import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcIntensityFactor,
  calcRunTSS,
  calcTRIMP,
  calcSessionTSSProxy,
} from "@/lib/trainingLoad";

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

// Only these become sessions (type = 'run')
const RUN_SPORT_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

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
  sessionsCreated: number;
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

  // 6. Fetch threshold pace for TSS calculation (default 5:30/km = 330 s/km)
  const { data: profileData } = await supabase
    .from("profiles")
    .select("threshold_pace_seconds")
    .eq("user_id", userId)
    .maybeSingle();
  const thresholdPace = (profileData as any)?.threshold_pace_seconds ?? 330;

  // 7. Auto-create sessions + training_metrics for run-type activities.
  //    This step is fully idempotent: it always fetches existing sessions first
  //    and uses strava_activity_id as the dedup key for training_metrics so
  //    re-syncing never creates duplicate rows or inflated TSS values.
  let sessionsCreated = 0;
  const runActivities = relevant.filter((a) =>
    RUN_SPORT_TYPES.has(a.sport_type ?? a.type),
  );

  if (runActivities.length > 0) {
    const stravaIds = runActivities.map((a) => a.id);

    // Find which activities already have a session
    const { data: existingSessionData } = await supabase
      .from("sessions")
      .select("strava_activity_id")
      .eq("user_id", userId)
      .in("strava_activity_id", stravaIds);

    const existingIds = new Set(
      ((existingSessionData ?? []) as { strava_activity_id: number }[]).map(
        (s) => Number(s.strava_activity_id),
      ),
    );

    const sessionRowsToInsert = runActivities
      .filter((a) => !existingIds.has(a.id))
      .map((a) => {
        const distKm = (a.distance ?? 0) > 0 ? a.distance / 1000 : 0;
        const durationMin = Math.max(1, Math.round((a.moving_time ?? 0) / 60));
        const paceSecPerKm =
          distKm > 0 ? Math.round((a.moving_time ?? 0) / distKm) : null;
        return {
          user_id: userId,
          date: a.start_date_local.split("T")[0],
          type: "run" as const,
          duration: durationMin,
          rpe: 7,
          notes: `${a.name}${distKm > 0 ? ` · ${distKm.toFixed(2)} km` : ""}`,
          strava_activity_id: a.id,
          distance_meters: (a.distance ?? 0) > 0 ? a.distance : null,
          pace_per_km_seconds: paceSecPerKm,
          calories_burned: a.calories ?? null,
        };
      });

    if (sessionRowsToInsert.length > 0) {
      await supabase.from("sessions").insert(sessionRowsToInsert);
      sessionsCreated = sessionRowsToInsert.length;
    }

    // Fetch ALL sessions for these activities (existing + newly inserted).
    // This ensures training_metrics are created for old sessions that were
    // synced before Phase 2B existed (they had no metrics row yet).
    const { data: allSessionData } = await supabase
      .from("sessions")
      .select("id, strava_activity_id, duration, rpe, date, pace_per_km_seconds")
      .eq("user_id", userId)
      .in("strava_activity_id", stravaIds);

    const sessionByStravaId = new Map(
      (
        (allSessionData ?? []) as {
          id: number;
          strava_activity_id: number;
          duration: number;
          rpe: number;
          date: string;
          pace_per_km_seconds: number | null;
        }[]
      ).map((s) => [Number(s.strava_activity_id), s]),
    );

    // Build metric rows using raw Strava moving_time (avoids rounding from
    // the minutes-stored duration field) and tag with strava_activity_id so
    // the upsert is idempotent even if sessions were somehow duplicated.
    const metricRows = runActivities
      .filter((a) => sessionByStravaId.has(a.id))
      .map((a) => {
        const sess = sessionByStravaId.get(a.id)!;
        const distKm = (a.distance ?? 0) > 0 ? a.distance / 1000 : 0;
        const movingTimeSec = a.moving_time ?? 0;
        const paceSecPerKm = distKm > 0 ? Math.round(movingTimeSec / distKm) : null;

        let tss: number;
        let trimp: number;

        if (paceSecPerKm && paceSecPerKm > 0) {
          const IF = calcIntensityFactor(paceSecPerKm, thresholdPace);
          // Use raw moving_time (seconds) directly — avoids the rounding error
          // that comes from converting the stored duration (minutes) back to seconds.
          tss = calcRunTSS(movingTimeSec, paceSecPerKm, thresholdPace);
          trimp = calcTRIMP(movingTimeSec, IF);
        } else {
          tss = calcSessionTSSProxy(sess.duration, sess.rpe);
          trimp = Math.round(sess.duration * (sess.rpe / 10));
        }

        return {
          user_id: userId,
          session_id: sess.id,
          strava_activity_id: a.id,
          activity_date: a.start_date_local.split("T")[0],
          trimp,
          tss,
          pace_seconds_per_km: paceSecPerKm ?? null,
          load_score: tss,
          source: "strava",
        };
      });

    if (metricRows.length > 0) {
      await (supabase as any)
        .from("training_metrics")
        .upsert(metricRows, { onConflict: "user_id,session_id" });
    }
  }

  // 7b. Comprehensive backfill: create sessions + training_metrics for every
  //     running_activity that is missing them.
  //
  //     The previous approach sourced from sessions WHERE strava_activity_id IS NOT NULL,
  //     but most historical sessions were created before Phase 2A (strava_activity_id
  //     column) was applied — they have NULL. With only 6 sessions for 30 running_activities,
  //     most activities had no session at all and the backfill was a no-op.
  //
  //     This version sources directly from running_activities, creates missing sessions,
  //     then upserts training_metrics. Fully idempotent on subsequent syncs.
  {
    type RaRow = {
      strava_activity_id: number;
      activity_name: string;
      moving_time_seconds: number;
      distance_meters: number;
      activity_date: string;
    };
    type SessRow = {
      id: number;
      strava_activity_id: number | null;
      duration: number;
      rpe: number;
      date: string;
      pace_per_km_seconds: number | null;
    };

    // All historical run activities
    const { data: allRaRaw } = await supabase
      .from("running_activities")
      .select("strava_activity_id, activity_name, moving_time_seconds, distance_meters, activity_date")
      .eq("user_id", userId)
      .in("activity_type", ["Run", "TrailRun", "VirtualRun"]);

    const allRa = (allRaRaw ?? []) as RaRow[];
    if (allRa.length === 0) return { inserted: relevant.length, fetched: activities.length, sessionsCreated };

    // Which activities already have training_metrics?
    const { data: existingMetricRaw } = await (supabase as any)
      .from("training_metrics")
      .select("strava_activity_id")
      .eq("user_id", userId)
      .not("strava_activity_id", "is", null);

    const coveredIds = new Set(
      ((existingMetricRaw ?? []) as { strava_activity_id: number }[]).map(
        (m) => Number(m.strava_activity_id),
      ),
    );

    const raToBackfill = allRa.filter((ra) => !coveredIds.has(Number(ra.strava_activity_id)));
    if (raToBackfill.length === 0) {
      // All activities already have metrics — fast path out
    } else {
      const backfillRaIds = raToBackfill.map((ra) => ra.strava_activity_id);

      // Find existing sessions by strava_activity_id (post-Phase 2A sessions)
      const { data: sessByStravaRaw } = await supabase
        .from("sessions")
        .select("id, strava_activity_id, duration, rpe, date, pace_per_km_seconds")
        .eq("user_id", userId)
        .in("strava_activity_id", backfillRaIds);

      const sessionByStravaId = new Map<number, SessRow>(
        ((sessByStravaRaw ?? []) as SessRow[]).map((s) => [Number(s.strava_activity_id), s]),
      );

      // For activities still without a session, look up by date (pre-Phase 2A sessions)
      const datesNeeded = raToBackfill
        .filter((ra) => !sessionByStravaId.has(Number(ra.strava_activity_id)))
        .map((ra) => ra.activity_date);

      if (datesNeeded.length > 0) {
        const { data: sessByDateRaw } = await supabase
          .from("sessions")
          .select("id, strava_activity_id, duration, rpe, date, pace_per_km_seconds")
          .eq("user_id", userId)
          .eq("type", "run")
          .in("date", datesNeeded)
          .order("id");

        const sessionByDate = new Map<string, SessRow>();
        for (const s of (sessByDateRaw ?? []) as SessRow[]) {
          if (!sessionByDate.has(s.date)) sessionByDate.set(s.date, s);
        }

        // Activities still without any session → create sessions now
        const raToCreate = raToBackfill.filter(
          (ra) =>
            !sessionByStravaId.has(Number(ra.strava_activity_id)) &&
            !sessionByDate.has(ra.activity_date),
        );

        if (raToCreate.length > 0) {
          const newSessionRows = raToCreate.map((ra) => {
            const distKm = (ra.distance_meters ?? 0) > 0 ? ra.distance_meters / 1000 : 0;
            const durationMin = Math.max(1, Math.round((ra.moving_time_seconds ?? 0) / 60));
            const paceSecPerKm =
              distKm > 0 ? Math.round((ra.moving_time_seconds ?? 0) / distKm) : null;
            return {
              user_id: userId,
              date: ra.activity_date,
              type: "run" as const,
              duration: durationMin,
              rpe: 7,
              notes: `${ra.activity_name}${distKm > 0 ? ` · ${distKm.toFixed(2)} km` : ""}`,
              strava_activity_id: ra.strava_activity_id,
              distance_meters: (ra.distance_meters ?? 0) > 0 ? ra.distance_meters : null,
              pace_per_km_seconds: paceSecPerKm,
            };
          });

          const { data: createdSessions } = await supabase
            .from("sessions")
            .insert(newSessionRows)
            .select("id, strava_activity_id, duration, rpe, date, pace_per_km_seconds");

          for (const s of (createdSessions ?? []) as SessRow[]) {
            if (s.strava_activity_id) {
              sessionByStravaId.set(Number(s.strava_activity_id), s);
            }
          }
        }

        // Merge date-based sessions into the strava_activity_id map
        for (const ra of raToBackfill) {
          if (!sessionByStravaId.has(Number(ra.strava_activity_id))) {
            const byDate = sessionByDate.get(ra.activity_date);
            if (byDate) sessionByStravaId.set(Number(ra.strava_activity_id), byDate);
          }
        }
      }

      // Build and upsert training_metrics rows
      const usedSessionIds = new Set<number>();
      const backfillRows = raToBackfill
        .map((ra) => {
          const sess = sessionByStravaId.get(Number(ra.strava_activity_id));
          if (!sess || usedSessionIds.has(sess.id)) return null;
          usedSessionIds.add(sess.id);

          const distKm = (ra.distance_meters ?? 0) > 0 ? ra.distance_meters / 1000 : 0;
          const movingTimeSec = ra.moving_time_seconds ?? 0;
          const paceSecPerKm = distKm > 0 ? Math.round(movingTimeSec / distKm) : null;

          let tss: number;
          let trimp: number;
          if (paceSecPerKm && paceSecPerKm > 0) {
            const IF = calcIntensityFactor(paceSecPerKm, thresholdPace);
            tss = calcRunTSS(movingTimeSec, paceSecPerKm, thresholdPace);
            trimp = calcTRIMP(movingTimeSec, IF);
          } else {
            tss = calcSessionTSSProxy(sess.duration, sess.rpe);
            trimp = Math.round(sess.duration * (sess.rpe / 10));
          }

          return {
            user_id: userId,
            session_id: sess.id,
            strava_activity_id: Number(ra.strava_activity_id),
            activity_date: ra.activity_date,
            trimp,
            tss,
            pace_seconds_per_km: paceSecPerKm ?? null,
            load_score: tss,
            source: "strava",
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (backfillRows.length > 0) {
        await (supabase as any)
          .from("training_metrics")
          .upsert(backfillRows, { onConflict: "user_id,session_id" });
      }
    }
  }

  // 8. Sync Strava-derived personal records from all-time run history
  const { data: allRunData } = await supabase
    .from("running_activities")
    .select("distance_meters, moving_time_seconds, activity_date, activity_type")
    .eq("user_id", userId)
    .in("activity_type", ["Run", "TrailRun", "VirtualRun"]);

  const allRuns = ((allRunData ?? []) as {
    distance_meters: number;
    moving_time_seconds: number;
    activity_date: string;
    activity_type: string;
  }[]).filter((r) => r.distance_meters > 0 && r.moving_time_seconds > 0);

  if (allRuns.length > 0) {
    const today = new Date().toISOString().split("T")[0];

    const longestRun = allRuns.reduce((best, r) =>
      r.distance_meters > best.distance_meters ? r : best,
    );

    const paceRuns = allRuns.filter((r) => r.distance_meters >= 1000);
    const bestPaceRun =
      paceRuns.length > 0
        ? paceRuns.reduce((best, r) => {
            const pace = r.moving_time_seconds / (r.distance_meters / 1000);
            const bestPace = best.moving_time_seconds / (best.distance_meters / 1000);
            return pace < bestPace ? r : best;
          })
        : null;

    const totalKm = allRuns.reduce((sum, r) => sum + r.distance_meters / 1000, 0);

    const recordsToUpsert = [
      {
        user_id: userId,
        type: "run",
        metric: "strava_longest_km",
        value: Math.round((longestRun.distance_meters / 1000) * 100) / 100,
        date: longestRun.activity_date,
      },
      {
        user_id: userId,
        type: "run",
        metric: "strava_total_runs",
        value: allRuns.length,
        date: today,
      },
      {
        user_id: userId,
        type: "run",
        metric: "strava_total_km",
        value: Math.round(totalKm * 10) / 10,
        date: today,
      },
    ];

    if (bestPaceRun) {
      recordsToUpsert.push({
        user_id: userId,
        type: "run",
        metric: "strava_best_pace",
        value: Math.round(
          bestPaceRun.moving_time_seconds / (bestPaceRun.distance_meters / 1000),
        ),
        date: bestPaceRun.activity_date,
      });
    }

    for (const record of recordsToUpsert) {
      await (supabase as any)
        .from("personal_records")
        .upsert(record, { onConflict: "user_id,type,metric" });
    }
  }

  // 9. Update last_synced_at
  await supabase
    .from("strava_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { inserted: relevant.length, fetched: activities.length, sessionsCreated };
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
