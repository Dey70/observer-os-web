import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStravaAuthUrl } from "@/lib/strava";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = crypto.randomUUID();

  // Store state in a short-lived httpOnly cookie for CSRF validation
  const cookieStore = await cookies();
  cookieStore.set("strava_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  let authUrl: string;
  try {
    authUrl = getStravaAuthUrl(state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Configuration error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.redirect(authUrl);
}
