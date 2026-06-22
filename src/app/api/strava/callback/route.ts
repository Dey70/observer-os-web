import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { exchangeCodeForToken } from "@/lib/strava";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // User denied access on Strava's side
  if (error === "access_denied") {
    return NextResponse.redirect(`${APP_URL}/settings?strava=denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${APP_URL}/settings?strava=error`);
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get("strava_oauth_state")?.value;
  cookieStore.delete("strava_oauth_state");

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${APP_URL}/settings?strava=error`);
  }

  // Verify user is still authenticated
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${APP_URL}/auth`);
  }

  // Exchange code for tokens
  let tokenData;
  try {
    tokenData = await exchangeCodeForToken(code);
  } catch {
    return NextResponse.redirect(`${APP_URL}/settings?strava=error`);
  }

  const { athlete, access_token, refresh_token, expires_at } = tokenData;

  // Upsert connection (one per user)
  const { error: upsertErr } = await (supabase as any)
    .from("strava_connections")
    .upsert(
      {
        user_id: user.id,
        athlete_id: athlete.id,
        athlete_name: `${athlete.firstname} ${athlete.lastname}`.trim(),
        athlete_avatar: athlete.profile_medium ?? null,
        access_token,
        refresh_token,
        expires_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (upsertErr) {
    return NextResponse.redirect(`${APP_URL}/settings?strava=error`);
  }

  return NextResponse.redirect(`${APP_URL}/settings?strava=connected`);
}
