import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase admin client. Uses SERVICE_ROLE_KEY which bypasses RLS.
 * Never expose this to the browser. Only import from server-side files
 * (server actions, route handlers, server components).
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
