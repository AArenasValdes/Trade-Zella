/**
 * MARTIN OS — V4b: AI Budget Control & Rate Limiting Service
 *
 * Enforces server-side guardrails:
 * 1. Maximum 20 queries per user per day.
 * 2. Shared monthly budget hard cap of $5.00 USD across instances.
 * 3. Atomic reservation via PostgreSQL transactional locking before calling DeepSeek.
 * 4. Fail-closed behavior: In production, any database/RPC failure blocks DeepSeek calls.
 * 5. Distinct official rates ($0.30/$1.20 per 1M) vs conservative reservation buffer ($0.010 USD).
 * 6. Strict confirmation of RPC settlement and refund responses (no silent success).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// Official DeepSeek published rates (cache miss)
export const DEEPSEEK_OFFICIAL_RATES = {
  inputPerToken: 0.30 / 1_000_000,   // $0.00000030 / token ($0.30 por 1M)
  outputPerToken: 1.20 / 1_000_000,  // $0.00000120 / token ($1.20 por 1M)
  inputPerMillion: 0.30,
  outputPerMillion: 1.20,
};

// Conservative safety buffer rates (used for reservation ceiling)
export const DEEPSEEK_SAFETY_BUFFER_RATES = {
  inputPerToken: 0.55 / 1_000_000,   // $0.00000055 / token ($0.55 por 1M)
  outputPerToken: 2.19 / 1_000_000,  // $0.00000219 / token ($2.19 por 1M)
  inputPerMillion: 0.55,
  outputPerMillion: 2.19,
};

export const MAX_DAILY_QUERIES_PER_USER = 20;
export const MAX_MONTHLY_BUDGET_USD = 5.0; // Hard budget cap
export const MONTHLY_TARGET_MAX_USD = 2.0; // Expected monthly target
export const MAX_INPUT_TOKENS_TARGET = 8000;
export const MAX_OUTPUT_TOKENS_TARGET = 800;

// Conservative upfront reservation per query ($0.010 USD covers max 8k in + 800 out)
export const RESERVATION_AMOUNT_USD = 0.01;

export type SupabaseBudgetClient = SupabaseClient;

export interface BudgetStatus {
  todayQueries: number;
  maxDailyQueries: number;
  currentMonthSpentUsd: number;
  maxMonthlyBudgetUsd: number;
  remainingBudgetUsd: number;
  isDailyLimitReached: boolean;
  isMonthlyBudgetReached: boolean;
  billingMonth: string;
}

export interface ReservationResult {
  ok: boolean;
  reservationId: string;
  error?: 'daily_limit_exceeded' | 'budget_exceeded' | 'budget_unavailable' | 'invalid_user';
  message?: string;
  budgetStatus: BudgetStatus;
}

export interface SettlementResult {
  ok: boolean;
  costUsd: number;
  totalTokens: number;
  error?: string;
  budgetStatus: BudgetStatus;
}

export interface RefundResult {
  ok: boolean;
  error?: string;
  budgetStatus: BudgetStatus;
}

/**
 * Calculates cost in USD from token counts.
 * Defaults to official published rates ($0.30/M in, $1.20/M out).
 */
export function calculateDeepSeekCost(
  promptTokens: number,
  completionTokens: number,
  mode: 'official' | 'conservative' = 'official'
): number {
  const rates = mode === 'official' ? DEEPSEEK_OFFICIAL_RATES : DEEPSEEK_SAFETY_BUFFER_RATES;
  const pTokens = Math.max(0, promptTokens || 0);
  const cTokens = Math.max(0, completionTokens || 0);
  const cost =
    pTokens * rates.inputPerToken +
    cTokens * rates.outputPerToken;
  return Number(cost.toFixed(6));
}

export function getCurrentBillingMonth(): string {
  return new Date().toISOString().slice(0, 7); // e.g. '2026-11'
}

function getCurrentDayKey(): string {
  return new Date().toISOString().slice(0, 10); // e.g. '2026-11-01'
}

// ---------------------------------------------------------------------------
// In-Memory Test Mock Ledger (RESTRICTED TO TEST RUNNERS)
// ---------------------------------------------------------------------------
interface InMemoryLedgerEntry {
  id: string;
  userId: string;
  billingMonth: string;
  timestamp: number;
  dayKey: string;
  reservedCostUsd: number;
  actualCostUsd: number;
  status: 'reserved' | 'completed' | 'refunded' | 'failed';
  promptTokens?: number;
  completionTokens?: number;
}

const inMemoryLedger: InMemoryLedgerEntry[] = [];
let atomicMutex = Promise.resolve();

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test';
}

function computeInMemoryBudget(userId: string): BudgetStatus {
  const billingMonth = getCurrentBillingMonth();
  const dayKey = getCurrentDayKey();

  let todayQueries = 0;
  let currentMonthSpentUsd = 0;

  for (const entry of inMemoryLedger) {
    if (entry.billingMonth === billingMonth) {
      if (entry.status === 'completed') {
        currentMonthSpentUsd += entry.actualCostUsd;
      } else if (entry.status === 'reserved') {
        currentMonthSpentUsd += entry.reservedCostUsd;
      }
    }

    if (entry.userId === userId && entry.dayKey === dayKey) {
      if (entry.status === 'completed' || entry.status === 'reserved') {
        todayQueries++;
      }
    }
  }

  currentMonthSpentUsd = Number(currentMonthSpentUsd.toFixed(6));
  const remainingBudgetUsd = Math.max(0, Number((MAX_MONTHLY_BUDGET_USD - currentMonthSpentUsd).toFixed(4)));

  return {
    todayQueries,
    maxDailyQueries: MAX_DAILY_QUERIES_PER_USER,
    currentMonthSpentUsd,
    maxMonthlyBudgetUsd: MAX_MONTHLY_BUDGET_USD,
    remainingBudgetUsd,
    isDailyLimitReached: todayQueries >= MAX_DAILY_QUERIES_PER_USER,
    isMonthlyBudgetReached: (currentMonthSpentUsd + RESERVATION_AMOUNT_USD) > MAX_MONTHLY_BUDGET_USD,
    billingMonth,
  };
}

function defaultUnavailableBudgetStatus(billingMonth = getCurrentBillingMonth()): BudgetStatus {
  return {
    todayQueries: 0,
    maxDailyQueries: MAX_DAILY_QUERIES_PER_USER,
    currentMonthSpentUsd: 0,
    maxMonthlyBudgetUsd: MAX_MONTHLY_BUDGET_USD,
    remainingBudgetUsd: 0,
    isDailyLimitReached: false,
    isMonthlyBudgetReached: false,
    billingMonth,
  };
}

/**
 * Atomically reserves budget before invoking DeepSeek.
 * In production: strictly uses PostgreSQL stored procedure with transactional advisory locking.
 * FAIL-CLOSED: If the database is unreachable or client is missing, returns ok=false.
 */
export async function reserveBudgetForQuery(params: {
  userId: string;
  supabaseClient?: SupabaseBudgetClient | null;
  allowTestMemoryFallback?: boolean;
}): Promise<ReservationResult> {
  const { userId, supabaseClient, allowTestMemoryFallback = false } = params;
  const billingMonth = getCurrentBillingMonth();

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.rpc('reserve_ai_query', {
        p_user_id: userId,
        p_billing_month: billingMonth,
        p_reserve_amount: RESERVATION_AMOUNT_USD,
      });

      if (!error && data) {
        const resData = data as {
          success?: boolean;
          error?: 'daily_limit_exceeded' | 'budget_exceeded' | 'invalid_user';
          message?: string;
          ledger_id?: string;
        };

        const budgetStatus = await getBudgetStatus(userId, supabaseClient, allowTestMemoryFallback);

        if (resData.success && resData.ledger_id) {
          return {
            ok: true,
            reservationId: resData.ledger_id,
            budgetStatus,
          };
        }

        return {
          ok: false,
          reservationId: '',
          error: resData.error || 'budget_exceeded',
          message: resData.message || 'No fue posible aprobar la reserva presupuestaria.',
          budgetStatus,
        };
      }
    } catch {
      // Supabase RPC failed
    }
  }

  // Fallback to in-memory ledger ONLY in tests
  if (isTestEnvironment() || allowTestMemoryFallback) {
    return new Promise((resolve) => {
      atomicMutex = atomicMutex.then(async () => {
        const status = computeInMemoryBudget(userId);

        if (status.isDailyLimitReached) {
          resolve({
            ok: false,
            reservationId: '',
            error: 'daily_limit_exceeded',
            message: 'Has alcanzado el límite de 20 consultas diarias. Podrás consultar nuevamente mañana.',
            budgetStatus: status,
          });
          return;
        }

        if (status.isMonthlyBudgetReached) {
          resolve({
            ok: false,
            reservationId: '',
            error: 'budget_exceeded',
            message: 'El presupuesto mensual de IA ($5.00 USD) ha sido alcanzado. Consultas pausadas hasta el próximo mes.',
            budgetStatus: status,
          });
          return;
        }

        const reservationId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        inMemoryLedger.push({
          id: reservationId,
          userId,
          billingMonth,
          timestamp: Date.now(),
          dayKey: getCurrentDayKey(),
          reservedCostUsd: RESERVATION_AMOUNT_USD,
          actualCostUsd: 0,
          status: 'reserved',
        });

        const updatedStatus = computeInMemoryBudget(userId);
        resolve({
          ok: true,
          reservationId,
          budgetStatus: updatedStatus,
        });
      });
    });
  }

  // In production: FAIL-CLOSED. Do NOT call DeepSeek without an approved database reservation.
  return {
    ok: false,
    reservationId: '',
    error: 'budget_unavailable',
    message: 'El sistema de control presupuestario seguro no está disponible o requiere configuración de SUPABASE_SERVICE_ROLE_KEY. Consulta bloqueada preventivamente.',
    budgetStatus: defaultUnavailableBudgetStatus(billingMonth),
  };
}

/**
 * Settles completed query with exact tokens reported by DeepSeek.
 * Strictly verifies database confirmation (error and data.success).
 * Uses official rates ($0.30/M in, $1.20/M out) for settlement.
 */
export async function settleCompletedQuery(params: {
  reservationId: string;
  userId: string;
  promptTokens: number;
  completionTokens: number;
  queryPreview?: string;
  supabaseClient?: SupabaseBudgetClient | null;
  allowTestMemoryFallback?: boolean;
}): Promise<SettlementResult> {
  const {
    reservationId,
    userId,
    promptTokens,
    completionTokens,
    queryPreview,
    supabaseClient,
    allowTestMemoryFallback = false,
  } = params;

  const actualCostUsd = calculateDeepSeekCost(promptTokens, completionTokens, 'official');
  const totalTokens = (promptTokens || 0) + (completionTokens || 0);

  if (supabaseClient && !reservationId.startsWith('res_')) {
    try {
      const { data, error } = await supabaseClient.rpc('settle_ai_query', {
        p_ledger_id: reservationId,
        p_user_id: userId,
        p_prompt_tokens: promptTokens,
        p_completion_tokens: completionTokens,
        p_actual_cost_usd: actualCostUsd,
        p_query_preview: queryPreview ? queryPreview.slice(0, 120) : null,
        p_status: 'completed',
      });

      const resData = data as { success?: boolean; error?: string; message?: string } | null;

      // EXPLICIT VALIDATION: Never report success if PostgreSQL failed or returned success=false
      if (error || !resData || resData.success !== true) {
        const errorMsg = error?.message || resData?.message || resData?.error || 'Liquidación rechazada por la base de datos.';
        if (!isTestEnvironment() && !allowTestMemoryFallback) {
          const budgetStatus = await getBudgetStatus(userId, supabaseClient, false);
          return {
            ok: false,
            costUsd: 0,
            totalTokens,
            error: errorMsg,
            budgetStatus,
          };
        }
      } else {
        const budgetStatus = await getBudgetStatus(userId, supabaseClient, allowTestMemoryFallback);
        return {
          ok: true,
          costUsd: actualCostUsd,
          totalTokens,
          budgetStatus,
        };
      }
    } catch (err: unknown) {
      if (!isTestEnvironment() && !allowTestMemoryFallback) {
        const errorObj = err as Error;
        const budgetStatus = await getBudgetStatus(userId, supabaseClient, false);
        return {
          ok: false,
          costUsd: 0,
          totalTokens,
          error: errorObj?.message || 'Excepción durante liquidación en PostgreSQL.',
          budgetStatus,
        };
      }
    }
  }

  if (isTestEnvironment() || allowTestMemoryFallback) {
    return new Promise((resolve) => {
      atomicMutex = atomicMutex.then(async () => {
        const entry = inMemoryLedger.find((e) => e.id === reservationId && e.userId === userId);
        if (entry) {
          entry.actualCostUsd = actualCostUsd;
          entry.reservedCostUsd = 0;
          entry.status = 'completed';
          entry.promptTokens = promptTokens;
          entry.completionTokens = completionTokens;
        }
        const budgetStatus = computeInMemoryBudget(userId);
        resolve({
          ok: true,
          costUsd: actualCostUsd,
          totalTokens,
          budgetStatus,
        });
      });
    });
  }

  return {
    ok: false,
    costUsd: 0,
    totalTokens,
    error: 'budget_unavailable',
    budgetStatus: defaultUnavailableBudgetStatus(),
  };
}

/**
 * Refunds reservation when provider call fails before execution or API key is missing.
 * Strictly verifies database confirmation (error and data.success).
 */
export async function refundFailedQuery(params: {
  reservationId: string;
  userId: string;
  reason?: string;
  supabaseClient?: SupabaseBudgetClient | null;
  allowTestMemoryFallback?: boolean;
}): Promise<RefundResult> {
  const { reservationId, userId, reason, supabaseClient, allowTestMemoryFallback = false } = params;

  if (supabaseClient && !reservationId.startsWith('res_')) {
    try {
      const { data, error } = await supabaseClient.rpc('settle_ai_query', {
        p_ledger_id: reservationId,
        p_user_id: userId,
        p_prompt_tokens: 0,
        p_completion_tokens: 0,
        p_actual_cost_usd: 0,
        p_query_preview: reason ? reason.slice(0, 120) : null,
        p_status: 'refunded',
      });

      const resData = data as { success?: boolean; error?: string; message?: string } | null;

      if (error || !resData || resData.success !== true) {
        const errorMsg = error?.message || resData?.message || resData?.error || 'Reembolso rechazado por la base de datos.';
        if (!isTestEnvironment() && !allowTestMemoryFallback) {
          const budgetStatus = await getBudgetStatus(userId, supabaseClient, false);
          return {
            ok: false,
            error: errorMsg,
            budgetStatus,
          };
        }
      } else {
        const budgetStatus = await getBudgetStatus(userId, supabaseClient, allowTestMemoryFallback);
        return {
          ok: true,
          budgetStatus,
        };
      }
    } catch (err: unknown) {
      if (!isTestEnvironment() && !allowTestMemoryFallback) {
        const errorObj = err as Error;
        const budgetStatus = await getBudgetStatus(userId, supabaseClient, false);
        return {
          ok: false,
          error: errorObj?.message || 'Excepción durante reembolso en PostgreSQL.',
          budgetStatus,
        };
      }
    }
  }

  if (isTestEnvironment() || allowTestMemoryFallback) {
    return new Promise((resolve) => {
      atomicMutex = atomicMutex.then(async () => {
        const entry = inMemoryLedger.find((e) => e.id === reservationId && e.userId === userId);
        if (entry) {
          entry.actualCostUsd = 0;
          entry.reservedCostUsd = 0;
          entry.status = 'refunded';
        }
        const budgetStatus = computeInMemoryBudget(userId);
        resolve({
          ok: true,
          budgetStatus,
        });
      });
    });
  }

  return {
    ok: false,
    error: 'budget_unavailable',
    budgetStatus: defaultUnavailableBudgetStatus(),
  };
}

/**
 * Retrieves the current budget and rate limit status.
 * Global month budget is aggregated across all users without leaking individual records.
 */
export async function getBudgetStatus(
  userId: string,
  supabaseClient?: SupabaseBudgetClient | null,
  allowTestMemoryFallback = false
): Promise<BudgetStatus> {
  const billingMonth = getCurrentBillingMonth();

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.rpc('get_ai_budget_summary', {
        p_user_id: userId,
        p_billing_month: billingMonth,
      });

      if (!error && data) {
        const summary = data as {
          billing_month: string;
          today_queries: number;
          max_daily_queries: number;
          current_month_spent_usd: number;
          max_monthly_budget_usd: number;
          remaining_budget_usd: number;
          is_daily_limit_reached: boolean;
          is_monthly_budget_reached: boolean;
        };

        return {
          todayQueries: summary.today_queries,
          maxDailyQueries: summary.max_daily_queries,
          currentMonthSpentUsd: Number(Number(summary.current_month_spent_usd).toFixed(6)),
          maxMonthlyBudgetUsd: summary.max_monthly_budget_usd,
          remainingBudgetUsd: Number(Number(summary.remaining_budget_usd).toFixed(4)),
          isDailyLimitReached: summary.is_daily_limit_reached,
          isMonthlyBudgetReached: summary.is_monthly_budget_reached,
          billingMonth: summary.billing_month,
        };
      }
    } catch {
      // Stored proc failed
    }
  }

  if (isTestEnvironment() || allowTestMemoryFallback) {
    return computeInMemoryBudget(userId);
  }

  return defaultUnavailableBudgetStatus(billingMonth);
}

/**
 * Helper to reset in-memory ledger state for unit tests.
 */
export function __resetInMemoryLedgerForTesting(): void {
  inMemoryLedger.length = 0;
}
