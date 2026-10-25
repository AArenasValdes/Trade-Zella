import type { Trade, PropAccount } from '../types/trading.ts';
import { calculateOperationalWindowStats } from './date-time-service.ts';
import type {
  OperationalWindowStatItem,
} from './date-time-service.ts';

export interface ConsolidatedReturnResult {
  returnPct: number | null;
  totalNetPnl: number;
  totalReferenceCapital: number;
  isValid: boolean;
  accountCount: number;
  errorReason?: string;
}

export interface EquityPointPct {
  tradeIndex: number;
  tradeLabel: string;
  date: string;
  time: string;
  symbol: string;
  direction?: string;
  pnl: number;
  tradeReturnPct: number | null;
  cumulativePnl: number;
  cumulativeReturnPct: number;
  equity: number;
  drawdownPct: number;
}

export interface PercentageEquityCurveResult {
  points: EquityPointPct[];
  maxDrawdownPct: number | null;
  currentReturnPct: number | null;
  peakReturnPct: number | null;
  bestTradeReturnPct: number | null;
  worstTradeReturnPct: number | null;
  referenceCapital: number;
  isValid: boolean;
}

export interface OperationalWindowReturnItem extends OperationalWindowStatItem {
  returnPct: number | null;
}

export interface OperationalWindowReturnSummary {
  windows: OperationalWindowReturnItem[];
  includedTradesCount: number;
  excludedTradesCount: number;
  totalTradesCount: number;
}

export interface WeekdayReturnItem {
  day: string;
  dayIndex: number;
  pnl: number;
  returnPct: number | null;
  trades: number;
}

/**
 * Calculates the percentage return of an individual trade based on its account's initial capital.
 * Formula: tradeReturnPct = (trade.netPnl / account.initialBalance) * 100
 */
export function calculateTradeReturnPct(
  netPnl: number,
  initialBalance: number | undefined | null
): number | null {
  if (
    initialBalance === undefined ||
    initialBalance === null ||
    !Number.isFinite(initialBalance) ||
    initialBalance <= 0 ||
    !Number.isFinite(netPnl)
  ) {
    return null;
  }
  return (netPnl / initialBalance) * 100;
}

/**
 * Resolves the relevant accounts and calculates consolidated return.
 * - Single account scope: sum(netPnl) / account.initialBalance * 100
 * - Multi-account scope ("All"): sum(netPnl) / sum(initialBalances) * 100
 *
 * Strictly enforces that percentages from different accounts are never summed directly.
 * If any trade lacks a valid account with positive capital, marks calculation as invalid (no fabricated denominators).
 */
export function calculateConsolidatedReturnPct(
  trades: readonly { netPnl: number; accountId?: string }[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): ConsolidatedReturnResult {
  if (targetAccountId && targetAccountId !== 'All') {
    const singleAccount = accounts.find((a) => a.id === targetAccountId);
    if (!singleAccount || !Number.isFinite(singleAccount.initialBalance) || singleAccount.initialBalance <= 0) {
      return {
        returnPct: null,
        totalNetPnl: 0,
        totalReferenceCapital: 0,
        isValid: false,
        accountCount: 0,
        errorReason: 'Cuenta seleccionada sin capital inicial positivo verificable',
      };
    }

    const tradesInScope = trades.filter((t) => t.accountId === targetAccountId);
    const totalNetPnl = tradesInScope.reduce((sum, t) => sum + (Number.isFinite(t.netPnl) ? t.netPnl : 0), 0);
    const returnPct = (totalNetPnl / singleAccount.initialBalance) * 100;

    return {
      returnPct,
      totalNetPnl,
      totalReferenceCapital: singleAccount.initialBalance,
      isValid: true,
      accountCount: 1,
    };
  }

  // Global Portfolio Scope ("All" or undefined targetAccountId)
  const totalNetPnl = trades.reduce((sum, t) => sum + (Number.isFinite(t.netPnl) ? t.netPnl : 0), 0);

  if (accounts.length === 0) {
    return {
      returnPct: null,
      totalNetPnl,
      totalReferenceCapital: 0,
      isValid: false,
      accountCount: 0,
      errorReason: 'No hay cuentas operativas configuradas en el portafolio',
    };
  }

  // Validate that all accounts belonging to the portfolio have positive initial capital
  for (const acc of accounts) {
    if (!Number.isFinite(acc.initialBalance) || acc.initialBalance <= 0) {
      return {
        returnPct: null,
        totalNetPnl,
        totalReferenceCapital: 0,
        isValid: false,
        accountCount: accounts.length,
        errorReason: `La cuenta "${acc.name || acc.id}" no tiene capital inicial positivo verificable`,
      };
    }
  }

  const accountMap = new Map<string, PropAccount>();
  for (const acc of accounts) {
    accountMap.set(acc.id, acc);
  }

  // Validate that every trade points to an existing account in the portfolio
  for (const t of trades) {
    if (!t.accountId) {
      return {
        returnPct: null,
        totalNetPnl,
        totalReferenceCapital: 0,
        isValid: false,
        accountCount: accounts.length,
        errorReason: 'Existen operaciones sin cuenta asignada',
      };
    }
    const acc = accountMap.get(t.accountId);
    if (!acc) {
      return {
        returnPct: null,
        totalNetPnl,
        totalReferenceCapital: 0,
        isValid: false,
        accountCount: accounts.length,
        errorReason: `Operación asociada a cuenta inexistente o inválida: "${t.accountId}"`,
      };
    }
  }

  // Reference capital is the fixed sum of initial balances of all portfolio accounts
  // (Each account included exactly once, regardless of trade count)
  const totalReferenceCapital = accounts.reduce(
    (sum, a) => sum + a.initialBalance,
    0
  );

  if (totalReferenceCapital <= 0) {
    return {
      returnPct: null,
      totalNetPnl,
      totalReferenceCapital: 0,
      isValid: false,
      accountCount: accounts.length,
      errorReason: 'El capital total de referencia no es mayor a cero',
    };
  }

  const returnPct = (totalNetPnl / totalReferenceCapital) * 100;
  return {
    returnPct,
    totalNetPnl,
    totalReferenceCapital,
    isValid: true,
    accountCount: accounts.length,
  };
}

/**
 * Calculates daily percentage return over initial reference capital.
 * Returns null if no valid reference capital exists.
 */
export function calculateDailyReturnPct(
  dailyTrades: readonly { netPnl: number; accountId?: string }[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): number | null {
  if (dailyTrades.length === 0) return null;
  return calculateConsolidatedReturnPct(dailyTrades, accounts, targetAccountId).returnPct;
}

/**
 * Calculates monthly percentage return over initial reference capital.
 */
export function calculateMonthlyReturnPct(
  monthlyTrades: readonly { netPnl: number; accountId?: string }[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): number | null {
  if (monthlyTrades.length === 0) return null;
  return calculateConsolidatedReturnPct(monthlyTrades, accounts, targetAccountId).returnPct;
}

/**
 * Calculates average win percentage return.
 */
export function calculateAvgWinReturnPct(
  wins: readonly { netPnl: number; accountId?: string }[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): number | null {
  if (wins.length === 0) return 0;
  const total = calculateConsolidatedReturnPct(wins, accounts, targetAccountId);
  if (total.returnPct === null) return null;
  return total.returnPct / wins.length;
}

/**
 * Calculates average loss percentage return (positive absolute percentage, e.g. 1.25%).
 */
export function calculateAvgLossReturnPct(
  losses: readonly { netPnl: number; accountId?: string }[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): number | null {
  if (losses.length === 0) return 0;
  const total = calculateConsolidatedReturnPct(losses, accounts, targetAccountId);
  if (total.returnPct === null) return null;
  return Math.abs(total.returnPct) / losses.length;
}

/**
 * Calculates statistical expected value per trade as percentage of initial balance:
 * expectancyPct = (winRate / 100 * avgWinPct) - ((1 - winRate / 100) * avgLossPct)
 */
export function calculateExpectancyReturnPct(
  winRatePct: number,
  avgWinPct: number | null,
  avgLossPct: number | null
): number | null {
  if (avgWinPct === null || avgLossPct === null) return null;
  const winRate = winRatePct / 100;
  const lossRate = 1 - winRate;
  return Number((winRate * avgWinPct - lossRate * avgLossPct).toFixed(4));
}

/**
 * Calculates percentage equity curve and peak drawdown percentage.
 * Equity starts at initial capital (point #0: 0% return, 0% drawdown).
 * Peak drawdown formula:
 *   currentEquity = initialBalance + cumulativeNetPnl
 *   drawdownPct = ((peakEquity - currentEquity) / peakEquity) * 100
 */
export function calculatePercentageEquityCurve(
  chronologicalTrades: readonly Trade[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): PercentageEquityCurveResult {
  const consolidated = calculateConsolidatedReturnPct(chronologicalTrades, accounts, targetAccountId);

  if (!consolidated.isValid || consolidated.totalReferenceCapital <= 0) {
    return {
      points: [],
      maxDrawdownPct: null,
      currentReturnPct: null,
      peakReturnPct: null,
      bestTradeReturnPct: null,
      worstTradeReturnPct: null,
      referenceCapital: 0,
      isValid: false,
    };
  }

  const referenceCapital = consolidated.totalReferenceCapital;
  const accountMap = new Map<string, PropAccount>(accounts.map((a) => [a.id, a]));

  const tradesInScope = targetAccountId && targetAccountId !== 'All'
    ? chronologicalTrades.filter((t) => t.accountId === targetAccountId)
    : chronologicalTrades;

  const sortedTrades = [...tradesInScope].sort(
    (a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id)
  );

  let cumulativePnl = 0;
  let peakEquity = referenceCapital;
  let maxDrawdownPct = 0;
  let bestTradeReturnPct: number | null = null;
  let worstTradeReturnPct: number | null = null;

  const points: EquityPointPct[] = [];

  // Point #0: Initial state before any trade executed
  points.push({
    tradeIndex: 0,
    tradeLabel: 'Inicio',
    date: sortedTrades[0]?.entryDate ? sortedTrades[0].entryDate.slice(0, 10) : 'Inicio',
    time: '00:00',
    symbol: '',
    pnl: 0,
    tradeReturnPct: 0,
    cumulativePnl: 0,
    cumulativeReturnPct: 0,
    equity: referenceCapital,
    drawdownPct: 0,
  });

  for (let i = 0; i < sortedTrades.length; i++) {
    const t = sortedTrades[i];
    cumulativePnl += t.netPnl;
    const currentEquity = referenceCapital + cumulativePnl;

    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }

    const drawdownDollars = peakEquity - currentEquity;
    const drawdownPct = peakEquity > 0 ? (drawdownDollars / peakEquity) * 100 : 0;
    if (drawdownPct > maxDrawdownPct) {
      maxDrawdownPct = drawdownPct;
    }

    const cumulativeReturnPct = (cumulativePnl / referenceCapital) * 100;

    const tradeAcc = accountMap.get(t.accountId);
    const tradeInitialBalance = tradeAcc?.initialBalance ?? referenceCapital;
    const tradeReturnPct = calculateTradeReturnPct(t.netPnl, tradeInitialBalance);

    if (tradeReturnPct !== null) {
      if (bestTradeReturnPct === null || tradeReturnPct > bestTradeReturnPct) {
        bestTradeReturnPct = tradeReturnPct;
      }
      if (worstTradeReturnPct === null || tradeReturnPct < worstTradeReturnPct) {
        worstTradeReturnPct = tradeReturnPct;
      }
    }

    const date = t.entryDate.slice(0, 10);
    const time = t.entryDate.includes('T') ? t.entryDate.split('T')[1].slice(0, 5) : '';

    points.push({
      tradeIndex: i + 1,
      tradeLabel: `#${i + 1}`,
      date,
      time,
      symbol: t.symbol,
      direction: t.direction,
      pnl: t.netPnl,
      tradeReturnPct,
      cumulativePnl: Number(cumulativePnl.toFixed(2)),
      cumulativeReturnPct: Number(cumulativeReturnPct.toFixed(4)),
      equity: Number(currentEquity.toFixed(2)),
      drawdownPct: Number(drawdownPct.toFixed(4)),
    });
  }

  const currentReturnPct = (cumulativePnl / referenceCapital) * 100;
  const peakReturnPct = ((peakEquity - referenceCapital) / referenceCapital) * 100;

  return {
    points,
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    currentReturnPct: Number(currentReturnPct.toFixed(2)),
    peakReturnPct: Number(peakReturnPct.toFixed(2)),
    bestTradeReturnPct: bestTradeReturnPct !== null ? Number(bestTradeReturnPct.toFixed(2)) : null,
    worstTradeReturnPct: worstTradeReturnPct !== null ? Number(worstTradeReturnPct.toFixed(2)) : null,
    referenceCapital,
    isValid: true,
  };
}

/**
 * Calculates operational window statistics with percentage returns.
 * Retains exact 9:30–10:35 and 10:35–11:00 NY boundary logic from date-time-service.
 */
export function calculateOperationalWindowReturnStats(
  trades: readonly Trade[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): OperationalWindowReturnSummary {
  const baseStats = calculateOperationalWindowStats(trades);

  const windows: OperationalWindowReturnItem[] = baseStats.windows.map((w) => {
    // Select trades belonging to this window
    // (using the exact classification ID)
    const windowTrades = trades.filter((t) => {
      const parts = t.entryDate.includes('T') ? t.entryDate.split('T')[1] : '';
      if (!parts) return false;
      const [h, m] = parts.split(':').map(Number);
      const s = h * 3600 + m * 60;
      if (w.id === 'window_1') {
        return s >= 34200 && s < 38100;
      }
      if (w.id === 'window_2') {
        return s >= 38100 && s < 39600;
      }
      return false;
    });

    const returnPct = windowTrades.length > 0
      ? calculateConsolidatedReturnPct(windowTrades, accounts, targetAccountId).returnPct
      : (accounts.length > 0 && accounts.every((a) => a.initialBalance > 0) ? 0 : null);

    return {
      ...w,
      returnPct: returnPct !== null ? Number(returnPct.toFixed(2)) : null,
    };
  });

  return {
    windows,
    includedTradesCount: baseStats.includedTradesCount,
    excludedTradesCount: baseStats.excludedTradesCount,
    totalTradesCount: baseStats.totalTradesCount,
  };
}

/**
 * Calculates weekday statistics (Lun - Vie) with percentage returns.
 */
export function calculateWeekdayReturnStats(
  trades: readonly Trade[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): WeekdayReturnItem[] {
  const days = [
    { day: 'Lun', dayIndex: 1 },
    { day: 'Mar', dayIndex: 2 },
    { day: 'Mié', dayIndex: 3 },
    { day: 'Jue', dayIndex: 4 },
    { day: 'Vie', dayIndex: 5 },
  ];

  return days.map(({ day, dayIndex }) => {
    const dayTrades = trades.filter((t) => {
      const [year, month, dayNum] = t.entryDate.slice(0, 10).split('-').map(Number);
      const utcDay = new Date(Date.UTC(year, month - 1, dayNum)).getUTCDay();
      return utcDay === dayIndex;
    });

    const pnl = Number(dayTrades.reduce((acc, t) => acc + t.netPnl, 0).toFixed(2));
    const returnPct = dayTrades.length > 0
      ? calculateConsolidatedReturnPct(dayTrades, accounts, targetAccountId).returnPct
      : (accounts.length > 0 && accounts.every((a) => a.initialBalance > 0) ? 0 : null);

    return {
      day,
      dayIndex,
      pnl,
      returnPct: returnPct !== null ? Number(returnPct.toFixed(2)) : null,
      trades: dayTrades.length,
    };
  });
}

/**
 * Consistent percentage return formatter:
 * e.g. +2.00%, -1.25%, 0.00%, or "Sin capital de ref."
 */
export function formatReturnPct(
  value: number | null | undefined,
  options?: {
    showSign?: boolean;
    digits?: number;
    fallback?: string;
  }
): string {
  const { showSign = true, digits = 2, fallback = 'Sin capital de ref.' } = options || {};

  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Number(value.toFixed(digits));
  const sign = showSign && rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(digits)}%`;
}
