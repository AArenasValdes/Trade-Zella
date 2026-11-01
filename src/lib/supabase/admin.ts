import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns a server-only Supabase client with service_role permissions.
 * Used exclusively for administrative operations (AI budget ledger, RPC execution).
 * NEVER expose the service role key to the browser.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
