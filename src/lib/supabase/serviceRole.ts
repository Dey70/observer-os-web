import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Server-only client authenticated with the service role key — bypasses RLS.
// Only use this where there is no user session to satisfy RLS policies
// (e.g. webhook/automation endpoints authenticated by a static secret).
// SUPABASE_SERVICE_ROLE_KEY must never be prefixed with NEXT_PUBLIC_.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
