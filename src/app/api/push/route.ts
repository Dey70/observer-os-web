import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { subscription, action } = body;

    if (action === "unsubscribe") {
      await supabase.from("push_subscriptions").delete().eq("user_id", user.id);
      return NextResponse.json({ success: true });
    }

    // Subscribe
    const { endpoint, keys } = subscription;
    const { p256dh, auth } = keys;

    await (supabase as any).from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
      },
      { onConflict: "user_id,endpoint" },
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
