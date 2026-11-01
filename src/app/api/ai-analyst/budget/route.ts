import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createClient as createDirectSupabase } from '@supabase/supabase-js';
import { getSupabaseConfig, hasSupabaseConfig } from '@/lib/supabase/config';
import { getBudgetStatus } from '@/services/ai-budget-service';

async function resolveAuthUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ') && hasSupabaseConfig()) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const { url, publishableKey } = getSupabaseConfig();
      const directClient = createDirectSupabase(url, publishableKey, {
        auth: { persistSession: false },
      });
      const { data, error } = await directClient.auth.getUser(token);
      if (!error && data?.user) {
        return { user: data.user, supabase: directClient };
      }
    }
  }

  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user) {
      return { user, supabase };
    }
  } catch {
    // Session not found
  }

  return { user: null, supabase: null };
}

export async function GET(req: NextRequest) {
  const { user, supabase } = await resolveAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Inicia sesión en Martin OS para consultar el presupuesto de IA.' },
      { status: 401 }
    );
  }

  const budget = await getBudgetStatus(user.id, supabase);
  return NextResponse.json({ budget });
}
