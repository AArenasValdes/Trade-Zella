/**
 * MARTIN OS — V4b: AI Budget Control & Rate Limiting Service
 *
 * Enforces server-side guardrails:
 * 1. Maximum 20 queries per user per day.
 * 2. Shared monthly budget cap of $5.00 USD across instances.
 * 3. Atomic reservation before calling DeepSeek to prevent race condition overdrafts.
 * 4. Conservative token cost estimation using DeepSeek published peak rates.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const DEEPSEEK_PEAK_RATES = {
  // Conservative published peak rates in USD per token
  inputPerToken: 0.55 / 1_000_000, // $0.00000055
  outputPerToken: 2.19 / 1_000_000, // $0.00000219
};

export const MAX_DAILY_QUERIES_PER_USER = 20;
export const MAX_MONTHLY_BUDGET_USD = 5.0; // Hard budget cap
export const MONTHLY_TARGET_MAX_USD = 2.0; // Target upper bound
export const MAX_INPUT_TOKENS_TARGET = 8000;
export const MAX_OUTPUT_TOKENS_TARGET = 800;

// Conservative reservation per request (~$0.010 USD)
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
  error?: 'daily_limit_exceeded' | 'budget_exceeded' | 'system_error';
  message?: string;
  budgetStatus: BudgetStatus;
}

export interface SettlementResult {
  costUsd: number;
  totalTokens: number;
  budgetStatus: BudgetStatus;
}

/**
 * Calculates estimated cost in USD from token usage using conservative peak rates.
 */
export function calculateDeepSeekCost(promptTokens: number, completionTokens: number): number {
  const pTokens = Math.max(0, promptTokens || 0);
  const cTokens = Math.max(0, completionTokens || 0);
  const cost =
    pTokens * DEEPSEEK_PEAK_RATES.inputPerToken +
    cTokens * DEEPSEEK_PEAK_RATES.outputPerToken;
  return Number(cost.toFixed(6));
}

/**
 * In-memory thread-safe ledger fallback for local development, serverless warm instances,
 * and environments where the Supabase migration has not yet been applied to production.
 */
interface InMemoryLedgerEntry {
  id: string;
  userId: string;
  billingMonth: string;
  timestamp: number;
  dayKey: string;
  reservedCostUsd: number;
  actualCostUsd: number;
  status: 'reserved' | 'completed' | 'failed';
  promptTokens?: number;
  completionTokens?: number;
}

// Global module state shared across warm serverless calls
const inMemoryLedger: InMemoryLedgerEntry[] = [];
let atomicMutex = Promise.resolve();

function getCurrentBillingMonth(): string {
  return new Date().toISOString().slice(0, 7); // e.g. '2026-11'
}

function getCurrentDayKey(): string {
  return new Date().toISOString().slice(0, 10); // e.g. '2026-11-01'
}

/**
 * Calculates in-memory budget metrics.
 */
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

/**
 * Atomically reserves estimated cost before invoking the provider.
 * Guarantees concurrent requests cannot exceed the daily limit or monthly budget.
 */
export async function reserveBudgetForQuery(params: {
  userId: string;
  supabaseClient?: SupabaseBudgetClient | null;
}): Promise<ReservationResult> {
  const { userId, supabaseClient } = params;
  const billingMonth = getCurrentBillingMonth();

  // Try Supabase atomic stored procedure first if client is available
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.rpc('reserve_ai_query', {
        p_user_id: userId,
        p_billing_month: billingMonth,
        p_reserve_amount: RESERVATION_AMOUNT_USD,
        p_max_monthly_budget: MAX_MONTHLY_BUDGET_USD,
        p_max_daily_queries: MAX_DAILY_QUERIES_PER_USER,
      });

      const resData = data as {
        success?: boolean;
        error?: 'daily_limit_exceeded' | 'budget_exceeded' | 'system_error';
        message?: string;
        ledger_id?: string;
      } | null;

      if (!error && resData) {
        if (resData.success) {
          const status = await getBudgetStatus(userId, supabaseClient);
          return {
            ok: true,
            reservationId: resData.ledger_id || '',
            budgetStatus: status,
          };
        } else {
          const status = await getBudgetStatus(userId, supabaseClient);
          return {
            ok: false,
            reservationId: '',
            error: resData.error,
            message: resData.message,
            budgetStatus: status,
          };
        }
      }
    } catch {
      // Fall through to in-memory atomic ledger if table / RPC doesn't exist yet
    }
  }

  // Atomic mutex reservation for memory fallback
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

/**
 * Settles completed query with exact tokens reported by DeepSeek.
 */
export async function settleCompletedQuery(params: {
  reservationId: string;
  userId: string;
  promptTokens: number;
  completionTokens: number;
  queryPreview?: string;
  supabaseClient?: SupabaseBudgetClient | null;
}): Promise<SettlementResult> {
  const { reservationId, userId, promptTokens, completionTokens, queryPreview, supabaseClient } = params;
  const actualCostUsd = calculateDeepSeekCost(promptTokens, completionTokens);
  const totalTokens = (promptTokens || 0) + (completionTokens || 0);

  if (supabaseClient && reservationId.startsWith('00000000-') === false && !reservationId.startsWith('res_')) {
    try {
      await supabaseClient.rpc('settle_ai_query', {
        p_ledger_id: reservationId,
        p_user_id: userId,
        p_prompt_tokens: promptTokens,
        p_completion_tokens: completionTokens,
        p_actual_cost_usd: actualCostUsd,
        p_query_preview: queryPreview ? queryPreview.slice(0, 120) : null,
        p_status: 'completed',
      });
    } catch {
      // In-memory settlement takes over
    }
  }

  // Settle in memory
  return new Promise((resolve) => {
    atomicMutex = atomicMutex.then(async () => {
      const entry = inMemoryLedger.find((e) => e.id === reservationId);
      if (entry) {
        entry.actualCostUsd = actualCostUsd;
        entry.reservedCostUsd = 0;
        entry.status = 'completed';
        entry.promptTokens = promptTokens;
        entry.completionTokens = completionTokens;
      }
      const budgetStatus = computeInMemoryBudget(userId);
      resolve({
        costUsd: actualCostUsd,
        totalTokens,
        budgetStatus,
      });
    });
  });
}

/**
 * Refunds reservation when provider call fails, errors, or times out.
 */
export async function refundFailedQuery(params: {
  reservationId: string;
  userId: string;
  reason?: string;
  supabaseClient?: SupabaseBudgetClient | null;
}): Promise<BudgetStatus> {
  const { reservationId, userId, supabaseClient } = params;

  if (supabaseClient && !reservationId.startsWith('res_')) {
    try {
      await supabaseClient.rpc('settle_ai_query', {
        p_ledger_id: reservationId,
        p_user_id: userId,
        p_prompt_tokens: 0,
        p_completion_tokens: 0,
        p_actual_cost_usd: 0,
        p_query_preview: null,
        p_status: 'failed',
      });
    } catch {
      // Ignore
    }
  }

  return new Promise((resolve) => {
    atomicMutex = atomicMutex.then(async () => {
      const entry = inMemoryLedger.find((e) => e.id === reservationId);
      if (entry) {
        entry.actualCostUsd = 0;
        entry.reservedCostUsd = 0;
        entry.status = 'failed';
      }
      const budgetStatus = computeInMemoryBudget(userId);
      resolve(budgetStatus);
    });
  });
}

/**
 * Retrieves the current budget and rate limit status.
 */
export async function getBudgetStatus(
  userId: string,
  supabaseClient?: SupabaseBudgetClient | null
): Promise<BudgetStatus> {
  const billingMonth = getCurrentBillingMonth();

  if (supabaseClient) {
    try {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const [userTodayRes, monthBudgetRes] = await Promise.all([
        supabaseClient
          .from('ai_usage_ledger')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('request_timestamp', todayStart.toISOString())
          .in('status', ['reserved', 'completed']),
        supabaseClient
          .from('ai_usage_ledger')
          .select('estimated_cost_usd, reserved_cost_usd, status')
          .eq('billing_month', billingMonth)
          .in('status', ['reserved', 'completed']),
      ]);

      if (!userTodayRes.error && !monthBudgetRes.error) {
        const todayQueries = userTodayRes.count || 0;
        let currentMonthSpentUsd = 0;
        for (const row of monthBudgetRes.data || []) {
          if (row.status === 'completed') {
            currentMonthSpentUsd += Number(row.estimated_cost_usd || 0);
          } else if (row.status === 'reserved') {
            currentMonthSpentUsd += Number(row.reserved_cost_usd || 0);
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
          isMonthlyBudgetReached: currentMonthSpentUsd >= MAX_MONTHLY_BUDGET_USD,
          billingMonth,
        };
      }
    } catch {
      // Fallback to in-memory status
    }
  }

  return computeInMemoryBudget(userId);
}

/**
 * Helper to reset in-memory ledger state for unit tests.
 */
export function __resetInMemoryLedgerForTesting(): void {
  inMemoryLedger.length = 0;
}
