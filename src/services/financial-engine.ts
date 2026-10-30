import type { Trade, PropAccount } from '../types/trading.ts';
import { calculateOperationalWindowStats } from './date-time-service.ts';
import type {
  OperationalWindowStatItem,
} from './date-time-service.ts';

export interface DataCoverageInfo {
  totalTrades: number;
  monetaryTradesCount: number;
  returnPctTradesCount: number;
  unrecordedTradesCount: number;
  hasVerifiedReferenceCapital: boolean;
}

export interface ConsolidatedReturnResult {
  returnPct: number | null;
  totalNetPnl: number | null;
  totalReferenceCapital: number;
  isValid: boolean;
  accountCount: number;
  coverage: DataCoverageInfo;
  errorReason?: string;
}

export interface EquityPointPct {
  tradeIndex: number;
  tradeLabel: string;
  date: string;
  time: string;
  timePrecision?: Trade['timePrecision'];
  operationalWindow?: Trade['operationalWindow'];
  estimatedPnl?: boolean;
  hasEstimatedInCumulative?: boolean;
  symbol: string;
  direction?: string;
  pnl: number | null;
  tradeReturnPct: number | null;
  tradeRMultiple?: number;
  cumulativePnl: number | null;
  cumulativeReturnPct: number | null;
  cumulativeRMultiple?: number;
  equity: number | null;
  drawdownPct: number | null;
  drawdownR?: number;
}

export interface PercentageEquityCurveResult {
  curveMode: 'percentage' | 'r_multiple';
  points: EquityPointPct[];
  maxDrawdownPct: number | null;
  maxDrawdownR?: number | null;
  currentReturnPct: number | null;
  currentReturnR?: number | null;
  peakReturnPct: number | null;
  peakReturnR?: number | null;
  bestTradeReturnPct: number | null;
  bestTradeR?: number | null;
  worstTradeReturnPct: number | null;
  worstTradeR?: number | null;
  referenceCapital: number;
  isValid: boolean;
}

export interface OperationalWindowReturnItem extends OperationalWindowStatItem {
  returnPct: number | null;
  sumR: number;
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
  pnl: number | null;
  returnPct: number | null;
  sumR: number;
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
 * Resolves the percentage return of a trade according to the V1b contract:
 * 1. If realizedNetReturnPct is explicitly defined (user entered), returns it directly.
 * 2. If calculationMode === 'unrecorded' and no realizedNetReturnPct was entered, returns null ('Sin dato').
 * 3. For monetary or legacy derived trades, calculates (netPnl / initialBalance) * 100 if capital exists.
 */
export function resolveTradeReturnPct(
  trade: Pick<Trade, 'netPnl' | 'calculationMode' | 'realizedNetReturnPct'>,
  initialBalance?: number | null
): number | null {
  if (
    trade.realizedNetReturnPct !== undefined &&
    trade.realizedNetReturnPct !== null &&
    Number.isFinite(trade.realizedNetReturnPct)
  ) {
    return trade.realizedNetReturnPct;
  }
  if (trade.calculationMode === 'unrecorded') {
    return null;
  }
  return calculateTradeReturnPct(trade.netPnl, initialBalance);
}

/**
 * Resolves the relevant accounts and calculates consolidated return.
 * - Filters accounts to only verified accounts with positive initial capital.
 * - Distinguishes between monetary trades and unrecorded trades.
 * - Never sums percentages from different capital bases without mathematical validity.
 */
export function calculateConsolidatedReturnPct(
  trades: readonly Pick<Trade, 'netPnl' | 'accountId' | 'calculationMode' | 'realizedNetReturnPct' | 'rMultiple'>[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): ConsolidatedReturnResult {
  const verifiedAccounts = accounts.filter(
    (a) => a.hasVerifiedBalance !== false && Number.isFinite(a.initialBalance) && a.initialBalance > 0
  );

  const coverage: DataCoverageInfo = {
    totalTrades: trades.length,
    monetaryTradesCount: trades.filter((t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl)).length,
    returnPctTradesCount: trades.filter((t) => t.realizedNetReturnPct !== null && t.realizedNetReturnPct !== undefined).length,
    unrecordedTradesCount: trades.filter((t) => t.calculationMode === 'unrecorded').length,
    hasVerifiedReferenceCapital: verifiedAccounts.length > 0,
  };

  // 1. Single Account Scope
  if (targetAccountId && targetAccountId !== 'All') {
    const singleAccount = verifiedAccounts.find((a) => a.id === targetAccountId);
    const tradesInScope = trades.filter((t) => t.accountId === targetAccountId);

    if (!singleAccount) {
      // Check if explicit realizedNetReturnPct exists on trades in this technical account
      const explicitPctTrades = tradesInScope.filter(
        (t) => t.realizedNetReturnPct !== null && t.realizedNetReturnPct !== undefined
      );

      // If all trades have explicit return %, within single account they can be aggregated
      if (tradesInScope.length > 0 && explicitPctTrades.length === tradesInScope.length) {
        const sumPct = explicitPctTrades.reduce((acc, t) => acc + (t.realizedNetReturnPct || 0), 0);
        return {
          returnPct: Number(sumPct.toFixed(4)),
          totalNetPnl: null,
          totalReferenceCapital: 0,
          isValid: true,
          accountCount: 1,
          coverage,
        };
      }

      return {
        returnPct: null,
        totalNetPnl: null,
        totalReferenceCapital: 0,
        isValid: false,
        accountCount: 0,
        coverage,
        errorReason: 'Cuenta seleccionada sin capital inicial positivo verificable',
      };
    }

    const monetaryTrades = tradesInScope.filter((t) => t.calculationMode !== 'unrecorded');
    const totalNetPnl = monetaryTrades.length > 0
      ? monetaryTrades.reduce((sum, t) => sum + (Number.isFinite(t.netPnl) ? t.netPnl : 0), 0)
      : null;

    let returnPct: number | null = null;
    if (totalNetPnl !== null) {
      returnPct = (totalNetPnl / singleAccount.initialBalance) * 100;
    } else {
      const explicitPctTrades = tradesInScope.filter(
        (t) => t.realizedNetReturnPct !== null && t.realizedNetReturnPct !== undefined
      );
      if (explicitPctTrades.length === tradesInScope.length && tradesInScope.length > 0) {
        returnPct = explicitPctTrades.reduce((acc, t) => acc + (t.realizedNetReturnPct || 0), 0);
      }
    }

    return {
      returnPct,
      totalNetPnl,
      totalReferenceCapital: singleAccount.initialBalance,
      isValid: true,
      accountCount: 1,
      coverage,
    };
  }

  // 2. Portfolio Scope ("All" or undefined targetAccountId)
  const monetaryTrades = trades.filter((t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl));
  const totalNetPnl = monetaryTrades.length > 0
    ? monetaryTrades.reduce((sum, t) => sum + t.netPnl, 0)
    : null;

  if (verifiedAccounts.length === 0) {
    // Check if trades have explicit return % on a single underlying account
    const uniqueAccountIds = Array.from(new Set(trades.map((t) => t.accountId).filter(Boolean)));
    const explicitPctTrades = trades.filter(
      (t) => t.realizedNetReturnPct !== null && t.realizedNetReturnPct !== undefined
    );

    if (uniqueAccountIds.length <= 1 && trades.length > 0 && explicitPctTrades.length === trades.length) {
      const sumPct = explicitPctTrades.reduce((acc, t) => acc + (t.realizedNetReturnPct || 0), 0);
      return {
        returnPct: Number(sumPct.toFixed(4)),
        totalNetPnl: null,
        totalReferenceCapital: 0,
        isValid: true,
        accountCount: uniqueAccountIds.length,
        coverage,
      };
    }

    return {
      returnPct: null,
      totalNetPnl,
      totalReferenceCapital: 0,
      isValid: false,
      accountCount: 0,
      coverage,
      errorReason: 'No hay cuentas con capital de referencia verificable',
    };
  }

  const totalReferenceCapital = verifiedAccounts.reduce((sum, a) => sum + a.initialBalance, 0);

  if (totalNetPnl !== null && totalReferenceCapital > 0) {
    const returnPct = (totalNetPnl / totalReferenceCapital) * 100;
    return {
      returnPct,
      totalNetPnl,
      totalReferenceCapital,
      isValid: true,
      accountCount: verifiedAccounts.length,
      coverage,
    };
  }

  return {
    returnPct: null,
    totalNetPnl,
    totalReferenceCapital,
    isValid: false,
    accountCount: verifiedAccounts.length,
    coverage,
  };
}

/**
 * Calculates daily percentage return over initial reference capital.
 */
export function calculateDailyReturnPct(
  dailyTrades: readonly Pick<Trade, 'netPnl' | 'accountId' | 'calculationMode' | 'realizedNetReturnPct' | 'rMultiple'>[],
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
  monthlyTrades: readonly Pick<Trade, 'netPnl' | 'accountId' | 'calculationMode' | 'realizedNetReturnPct' | 'rMultiple'>[],
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
  wins: readonly Pick<Trade, 'netPnl' | 'accountId' | 'calculationMode' | 'realizedNetReturnPct' | 'rMultiple'>[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): number | null {
  const scopeWins = targetAccountId && targetAccountId !== 'All'
    ? wins.filter((w) => w.accountId === targetAccountId)
    : wins;
  if (scopeWins.length === 0) return 0;
  const verifiedAccounts = accounts.filter((a) => a.hasVerifiedBalance !== false && a.initialBalance > 0);
  const accountMap = new Map<string, PropAccount>(verifiedAccounts.map((a) => [a.id, a]));

  const validReturns: number[] = [];
  for (const w of scopeWins) {
    const acc = w.accountId ? accountMap.get(w.accountId) : undefined;
    const ret = resolveTradeReturnPct(w, acc?.initialBalance);
    if (ret !== null && Number.isFinite(ret)) {
      validReturns.push(ret);
    }
  }

  if (validReturns.length === 0) return null;
  return validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;
}

/**
 * Calculates average loss percentage return (positive absolute percentage, e.g. 1.25%).
 */
export function calculateAvgLossReturnPct(
  losses: readonly Pick<Trade, 'netPnl' | 'accountId' | 'calculationMode' | 'realizedNetReturnPct' | 'rMultiple'>[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): number | null {
  const scopeLosses = targetAccountId && targetAccountId !== 'All'
    ? losses.filter((l) => l.accountId === targetAccountId)
    : losses;
  if (scopeLosses.length === 0) return 0;
  const verifiedAccounts = accounts.filter((a) => a.hasVerifiedBalance !== false && a.initialBalance > 0);
  const accountMap = new Map<string, PropAccount>(verifiedAccounts.map((a) => [a.id, a]));

  const validReturns: number[] = [];
  for (const l of scopeLosses) {
    const acc = l.accountId ? accountMap.get(l.accountId) : undefined;
    const ret = resolveTradeReturnPct(l, acc?.initialBalance);
    if (ret !== null && Number.isFinite(ret)) {
      validReturns.push(Math.abs(ret));
    }
  }

  if (validReturns.length === 0) return null;
  return validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;
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
 * Calculates percentage equity curve or pure R-Multiple curve.
 * If verified reference capital exists, builds the percentage equity curve.
 * If verified capital is absent or trades are unrecorded, builds a pure R-Multiple cumulative curve.
 * Never mixes the two representations or plots unrecorded trades as flat $0!
 */
export function calculatePercentageEquityCurve(
  chronologicalTrades: readonly Trade[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): PercentageEquityCurveResult {
  const verifiedAccounts = accounts.filter(
    (a) => a.hasVerifiedBalance !== false && Number.isFinite(a.initialBalance) && a.initialBalance > 0
  );
  const accountMap = new Map<string, PropAccount>(verifiedAccounts.map((a) => [a.id, a]));

  const tradesInScope = targetAccountId && targetAccountId !== 'All'
    ? chronologicalTrades.filter((t) => t.accountId === targetAccountId)
    : chronologicalTrades;

  const sortedTrades = [...tradesInScope].sort(
    (a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id)
  );

  const hasMonetaryTrades = sortedTrades.some(
    (t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl) && t.netPnl !== 0
  );

  // Check if we can build a valid percentage curve
  const canBuildPercentageCurve = verifiedAccounts.length > 0 && hasMonetaryTrades;

  if (!canBuildPercentageCurve) {
    // Mode: R-Multiple Cumulative Curve
    let cumulativeR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    let bestTradeR: number | null = null;
    let worstTradeR: number | null = null;

    const points: EquityPointPct[] = [];

    // Point 0: Start at 0R
    points.push({
      tradeIndex: 0,
      tradeLabel: 'Inicio',
      date: sortedTrades[0]?.entryDate ? sortedTrades[0].entryDate.slice(0, 10) : 'Inicio',
      time: '00:00',
      symbol: '',
      pnl: null,
      tradeReturnPct: null,
      tradeRMultiple: 0,
      cumulativePnl: null,
      cumulativeReturnPct: null,
      cumulativeRMultiple: 0,
      equity: null,
      drawdownPct: null,
      drawdownR: 0,
    });

    for (let i = 0; i < sortedTrades.length; i++) {
      const t = sortedTrades[i];
      const r = Number.isFinite(t.rMultiple) ? t.rMultiple : 0;
      cumulativeR += r;

      if (cumulativeR > peakR) {
        peakR = cumulativeR;
      }

      const ddR = peakR - cumulativeR;
      if (ddR > maxDrawdownR) {
        maxDrawdownR = ddR;
      }

      if (bestTradeR === null || r > bestTradeR) {
        bestTradeR = r;
      }
      if (worstTradeR === null || r < worstTradeR) {
        worstTradeR = r;
      }

      const date = t.entryDate.slice(0, 10);
      const time = t.entryDate.includes('T') ? t.entryDate.split('T')[1].slice(0, 5) : '';

      points.push({
        tradeIndex: i + 1,
        tradeLabel: `#${i + 1}`,
        date,
        time,
        timePrecision: t.timePrecision,
        operationalWindow: t.operationalWindow,
        symbol: t.symbol,
        direction: t.direction,
        pnl: t.calculationMode !== 'unrecorded' ? t.netPnl : null,
        tradeReturnPct: t.realizedNetReturnPct ?? null,
        tradeRMultiple: r,
        cumulativePnl: null,
        cumulativeReturnPct: null,
        cumulativeRMultiple: Number(cumulativeR.toFixed(2)),
        equity: null,
        drawdownPct: null,
        drawdownR: Number(ddR.toFixed(2)),
      });
    }

    return {
      curveMode: 'r_multiple',
      points,
      maxDrawdownPct: null,
      maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
      currentReturnPct: null,
      currentReturnR: Number(cumulativeR.toFixed(2)),
      peakReturnPct: null,
      peakReturnR: Number(peakR.toFixed(2)),
      bestTradeReturnPct: null,
      bestTradeR,
      worstTradeReturnPct: null,
      worstTradeR,
      referenceCapital: 0,
      isValid: sortedTrades.length > 0,
    };
  }

  // Mode: Percentage Equity Curve
  const referenceCapital = verifiedAccounts.reduce((sum, a) => sum + a.initialBalance, 0);
  let cumulativePnl = 0;
  let hasEstimatedInCumulative = false;
  let peakEquity = referenceCapital;
  let maxDrawdownPct = 0;
  let bestTradeReturnPct: number | null = null;
  let worstTradeReturnPct: number | null = null;

  const points: EquityPointPct[] = [];

  points.push({
    tradeIndex: 0,
    tradeLabel: 'Inicio',
    date: sortedTrades[0]?.entryDate ? sortedTrades[0].entryDate.slice(0, 10) : 'Inicio',
    time: '00:00',
    symbol: '',
    pnl: 0,
    tradeReturnPct: 0,
    tradeRMultiple: 0,
    cumulativePnl: 0,
    cumulativeReturnPct: 0,
    cumulativeRMultiple: 0,
    equity: referenceCapital,
    drawdownPct: 0,
  });

  for (let i = 0; i < sortedTrades.length; i++) {
    const t = sortedTrades[i];
    const isEstimated = t.calculationMode === 'derived_r';
    if (isEstimated) {
      hasEstimatedInCumulative = true;
    }
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
    const tradeReturnPct = resolveTradeReturnPct(t, tradeInitialBalance);

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
      timePrecision: t.timePrecision,
      operationalWindow: t.operationalWindow,
      estimatedPnl: isEstimated,
      hasEstimatedInCumulative,
      symbol: t.symbol,
      direction: t.direction,
      pnl: t.netPnl,
      tradeReturnPct,
      tradeRMultiple: t.rMultiple,
      cumulativePnl: Number(cumulativePnl.toFixed(2)),
      cumulativeReturnPct: Number(cumulativeReturnPct.toFixed(4)),
      equity: Number(currentEquity.toFixed(2)),
      drawdownPct: Number(drawdownPct.toFixed(4)),
    });
  }

  const currentReturnPct = (cumulativePnl / referenceCapital) * 100;
  const peakReturnPct = ((peakEquity - referenceCapital) / referenceCapital) * 100;

  return {
    curveMode: 'percentage',
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
 * Calculates operational window statistics with percentage returns and R totals.
 */
export function calculateOperationalWindowReturnStats(
  trades: readonly Trade[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): OperationalWindowReturnSummary {
  const baseStats = calculateOperationalWindowStats(trades);

  const windows: OperationalWindowReturnItem[] = baseStats.windows.map((w) => {
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

    const sumR = windowTrades.reduce((acc, t) => acc + (Number.isFinite(t.rMultiple) ? t.rMultiple : 0), 0);
    const returnPct = windowTrades.length > 0
      ? calculateConsolidatedReturnPct(windowTrades, accounts, targetAccountId).returnPct
      : null;

    return {
      ...w,
      returnPct: returnPct !== null ? Number(returnPct.toFixed(2)) : null,
      sumR: Number(sumR.toFixed(2)),
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
 * Calculates weekday statistics (Lun - Vie) with percentage returns and R totals.
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

    const monetaryTrades = dayTrades.filter((t) => t.calculationMode !== 'unrecorded');
    const pnl = monetaryTrades.length > 0
      ? Number(monetaryTrades.reduce((acc, t) => acc + t.netPnl, 0).toFixed(2))
      : null;

    const sumR = Number(dayTrades.reduce((acc, t) => acc + (Number.isFinite(t.rMultiple) ? t.rMultiple : 0), 0).toFixed(2));
    const returnPct = dayTrades.length > 0
      ? calculateConsolidatedReturnPct(dayTrades, accounts, targetAccountId).returnPct
      : null;

    return {
      day,
      dayIndex,
      pnl,
      returnPct: returnPct !== null ? Number(returnPct.toFixed(2)) : null,
      sumR,
      trades: dayTrades.length,
    };
  });
}

/**
 * Consistent percentage return formatter:
 * e.g. +2.00%, -1.25%, 0.00%, or "Sin dato"
 */
export function formatReturnPct(
  value: number | null | undefined,
  options?: {
    showSign?: boolean;
    digits?: number;
    fallback?: string;
  }
): string {
  const { showSign = true, digits = 2, fallback = 'Sin dato' } = options || {};

  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Number(value.toFixed(digits));
  const sign = showSign && rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(digits)}%`;
}
