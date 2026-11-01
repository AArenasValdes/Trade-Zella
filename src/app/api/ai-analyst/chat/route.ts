import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createClient as createDirectSupabase } from '@supabase/supabase-js';
import { getSupabaseConfig, hasSupabaseConfig } from '@/lib/supabase/config';
import { mapTrade, type TradeRow } from '@/services/cloud-sync-service';
import {
  reserveBudgetForQuery,
  settleCompletedQuery,
  refundFailedQuery,
  getBudgetStatus,
} from '@/services/ai-budget-service';
import {
  buildAnalystGroundingContext,
  callDeepSeekFlash,
  extractReferencedTradeIds,
} from '@/services/ai-analyst-service';
import type { Trade, TradeSourceType } from '@/types/trading';

/**
 * Resolves the authenticated user from cookies or Authorization Bearer header.
 */
async function resolveAuthUser(req: NextRequest) {
  // 1. Try Bearer token from header
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

  // 2. Try cookie session
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user) {
      return { user, supabase };
    }
  } catch {
    // Supabase cookies not configured or invalid
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

export async function POST(req: NextRequest) {
  // 1. Authenticate user
  const { user, supabase } = await resolveAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Inicia sesión en Martin OS para consultar al Analista IA.' },
      { status: 401 }
    );
  }

  // 2. Validate input body
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Cuerpo de solicitud JSON inválido.' },
      { status: 400 }
    );
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length < 2) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Por favor escribe una pregunta para el analista.' },
      { status: 400 }
    );
  }

  if (message.length > 1000) {
    return NextResponse.json(
      { error: 'bad_request', message: 'La pregunta excede el límite de 1.000 caracteres.' },
      { status: 400 }
    );
  }

  const targetEnv: TradeSourceType | 'All' =
    body.environment === 'real' ||
    body.environment === 'backtest' ||
    body.environment === 'demo' ||
    body.environment === 'unclassified'
      ? body.environment
      : 'All';

  // 3. Atomically check and reserve budget before calling DeepSeek
  const reservation = await reserveBudgetForQuery({
    userId: user.id,
    supabaseClient: supabase,
  });

  if (!reservation.ok) {
    return NextResponse.json(
      {
        error: reservation.error,
        message: reservation.message,
        budget: reservation.budgetStatus,
      },
      { status: 429 }
    );
  }

  // 4. Verify API key configuration on server
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    await refundFailedQuery({
      reservationId: reservation.reservationId,
      userId: user.id,
      supabaseClient: supabase,
      reason: 'api_key_missing',
    });

    return NextResponse.json(
      {
        error: 'api_key_missing',
        message:
          'DEEPSEEK_API_KEY no está configurada en las variables de entorno del servidor. Configura la clave para activar las respuestas en vivo.',
        budget: reservation.budgetStatus,
      },
      { status: 503 }
    );
  }

  // 5. Query user's trades securely on server (tenant-isolated by user_id)
  let trades: Trade[] = [];
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false });

      if (!error && Array.isArray(data)) {
        trades = (data as TradeRow[]).map((row) => mapTrade(row));
      }
    }
  } catch {
    // If Supabase query fails, continue with empty or partial trades
  }

  // 6. Build grounding context using verified calculation engines
  const { systemPrompt, tradeLookup } = buildAnalystGroundingContext(trades, targetEnv);

  // 7. Single call to DeepSeek Flash (no tool loops, thinking disabled, max 800 tokens)
  try {
    const chatResult = await callDeepSeekFlash({
      apiKey,
      systemPrompt,
      userMessage: message,
    });

    // 8. Settle reservation with exact token counts and peak rates
    const settlement = await settleCompletedQuery({
      reservationId: reservation.reservationId,
      userId: user.id,
      promptTokens: chatResult.promptTokens,
      completionTokens: chatResult.completionTokens,
      queryPreview: message,
      supabaseClient: supabase,
    });

    // Extract trade references that actually exist in user's trades
    const availableIds = new Set(tradeLookup.keys());
    const referencedTradeIds = extractReferencedTradeIds(chatResult.answer, availableIds);

    return NextResponse.json({
      answer: chatResult.answer,
      referencedTradeIds,
      usage: {
        promptTokens: chatResult.promptTokens,
        completionTokens: chatResult.completionTokens,
        totalTokens: chatResult.totalTokens,
        estimatedCostUsd: settlement.costUsd,
      },
      budget: settlement.budgetStatus,
    });
  } catch (err: unknown) {
    const errorObj = err as Error;
    const errorMessage = errorObj?.message || 'Error al comunicarse con el proveedor DeepSeek Flash.';

    // Refund reservation on any failure
    await refundFailedQuery({
      reservationId: reservation.reservationId,
      userId: user.id,
      supabaseClient: supabase,
      reason: errorMessage,
    });

    const isQuotaOrBalance =
      errorMessage.includes('saldo') ||
      errorMessage.includes('cuota') ||
      errorMessage.includes('402') ||
      errorMessage.includes('429');

    return NextResponse.json(
      {
        error: isQuotaOrBalance ? 'provider_quota_exhausted' : 'provider_error',
        message: errorMessage,
        budget: reservation.budgetStatus,
      },
      { status: isQuotaOrBalance ? 429 : 502 }
    );
  }
}
