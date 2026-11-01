import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createClient as createDirectSupabase, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig, hasSupabaseConfig } from '@/lib/supabase/config';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBudgetStatus } from '@/services/ai-budget-service';

async function resolveAuthUser(req: NextRequest): Promise<{
  user: { id: string; email?: string } | null;
  userClient: SupabaseClient | null;
}> {
  const authHeader = req.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Bearer ') && hasSupabaseConfig()) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const { url, publishableKey } = getSupabaseConfig();
      const userClient = createDirectSupabase(url, publishableKey, {
        auth: { persistSession: false },
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });

      const { data, error } = await userClient.auth.getUser(token);
      if (!error && data?.user) {
        return { user: data.user, userClient };
      }
    }
  }

  try {
    const serverClient = await createServerSupabase();
    const { data: { user }, error } = await serverClient.auth.getUser();
    if (!error && user) {
      return { user, userClient: serverClient };
    }
  } catch {
    // Session not found
  }

  return { user: null, userClient: null };
}

export async function GET(req: NextRequest) {
  const { user } = await resolveAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Inicia sesión en Martin OS para consultar el presupuesto de IA.' },
      { status: 401 }
    );
  }

  const adminClient = createAdminClient();
  const budget = await getBudgetStatus(user.id, adminClient);
  return NextResponse.json({ budget });
}
