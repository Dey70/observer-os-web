import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import AppShell from "@/components/layout/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
    return <div>{children}</div>;
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  return <AppShell userEmail={user.email ?? ""}>{children}</AppShell>;
}
