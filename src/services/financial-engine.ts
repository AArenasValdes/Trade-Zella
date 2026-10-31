import type {
  Trade,
  PropAccount,
  DataCoverageInfo,
  ReturnBase,
  TradeStatus,
  CalculationMode,
} from '../types/trading.ts';
import { calculateOperationalWindowStats } from './date-time-service.ts';
import type {
  OperationalWindowStatItem,
} from './date-time-service.ts';

export type { DataCoverageInfo, ReturnBase };

export interface ConsolidatedReturnResult {
  returnPct: number | null;
  returnBase: ReturnBase;
  isPartial: boolean;
  includedTradesCount: number;
  excludedTradesCount: number;
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
  returnBase: ReturnBase;
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
  isPartialCurve: boolean;
  includedTradesCount: number;
  excludedTradesCount: number;
  totalTradesCount: number;
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
 * Returns true if the trade does not have unresolved data conflicts and can participate in statistical aggregates.
 */
export function isTradeIncludedInAggregates(
  trade: Pick<Trade, 'hasDataConflict'>
): boolean {
  return !trade.hasDataConflict;
}

/**
 * Returns true if the trade has a valid, recorded R-Multiple (not unrecorded and not conflicted).
 */
export function hasValidRMultiple(
  trade: Pick<Trade, 'rMultiple' | 'rUnrecorded' | 'hasDataConflict'>
): boolean {
  if (trade.hasDataConflict || trade.rUnrecorded) return false;
  return Number.isFinite(trade.rMultiple);
}

/**
 * Detects financial and status contradictions across R-Multiple, Net P&L, Return %, and Status.
 */
export function detectTradeDataConflicts(params: {
  status: TradeStatus;
  rMultiple: number;
  rUnrecorded?: boolean;
  netPnl: number;
  calculationMode?: CalculationMode;
  realizedNetReturnPct?: number | null;
}): string[] {
  const conflicts: string[] = [];
  const { status, rMultiple, rUnrecorded, netPnl, calculationMode, realizedNetReturnPct } = params;

  const hasMonetaryPnl = calculationMode !== 'unrecorded' && Number.isFinite(netPnl) && netPnl !== 0;
  const hasValidR = !rUnrecorded && Number.isFinite(rMultiple) && rMultiple !== 0;
  const hasValidPct =
    realizedNetReturnPct !== null &&
    realizedNetReturnPct !== undefined &&
    Number.isFinite(realizedNetReturnPct) &&
    realizedNetReturnPct !== 0;

  // 1. Status vs Net PnL (for monetary and derived_r trades)
  if (hasMonetaryPnl) {
    if (status === 'Win' && netPnl < 0) {
      conflicts.push(`Resultado TP (Win) en conflicto con P&L monetario negativo (-$${Math.abs(netPnl).toFixed(2)})`);
    } else if (status === 'Loss' && netPnl > 0) {
      conflicts.push(`Resultado SL (Loss) en conflicto con P&L monetario positivo (+$${netPnl.toFixed(2)})`);
    }
  }

  // 2. Status vs R-Multiple
  if (hasValidR) {
    if (status === 'Win' && rMultiple < 0) {
      conflicts.push(`Resultado TP (Win) en conflicto con R negativo (${rMultiple.toFixed(2)}R)`);
    } else if (status === 'Loss' && rMultiple > 0) {
      conflicts.push(`Resultado SL (Loss) en conflicto con R positivo (+${rMultiple.toFixed(2)}R)`);
    }
  }

  // 3. Status vs Realized Return %
  if (hasValidPct) {
    if (status === 'Win' && realizedNetReturnPct < 0) {
      conflicts.push(`Resultado TP (Win) en conflicto con retorno % negativo (${realizedNetReturnPct.toFixed(2)}%)`);
    } else if (status === 'Loss' && realizedNetReturnPct > 0) {
      conflicts.push(`Resultado SL (Loss) en conflicto con retorno % positivo (+${realizedNetReturnPct.toFixed(2)}%)`);
    }
  }

  // 4. Net PnL vs Realized Return %
  if (hasMonetaryPnl && hasValidPct) {
    if (netPnl > 0 && realizedNetReturnPct < 0) {
      conflicts.push(`PnL monetario positivo en conflicto con retorno % negativo (${realizedNetReturnPct.toFixed(2)}%)`);
    } else if (netPnl < 0 && realizedNetReturnPct > 0) {
      conflicts.push(`PnL monetario negativo en conflicto con retorno % positivo (+${realizedNetReturnPct.toFixed(2)}%)`);
    }
  }

  // 5. R-Multiple vs Net PnL
  if (hasValidR && hasMonetaryPnl) {
    if (rMultiple > 0 && netPnl < 0) {
      conflicts.push(`R positivo (+${rMultiple.toFixed(2)}R) en conflicto con P&L monetario negativo (-$${Math.abs(netPnl).toFixed(2)})`);
    } else if (rMultiple < 0 && netPnl > 0) {
      conflicts.push(`R negativo (${rMultiple.toFixed(2)}R) en conflicto con P&L monetario positivo (+$${netPnl.toFixed(2)})`);
    }
  }

  // 6. R-Multiple vs Realized Return %
  if (hasValidR && hasValidPct) {
    if (rMultiple > 0 && realizedNetReturnPct < 0) {
      conflicts.push(`R positivo (+${rMultiple.toFixed(2)}R) en conflicto con retorno % negativo (${realizedNetReturnPct.toFixed(2)}%)`);
    } else if (rMultiple < 0 && realizedNetReturnPct > 0) {
      conflicts.push(`R negativo (${rMultiple.toFixed(2)}R) en conflicto con retorno % positivo (+${realizedNetReturnPct.toFixed(2)}%)`);
    }
  }

  return conflicts;
}

/**
 * Calculates the percentage return of an individual trade based on its account's constant initial capital.
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
 * Resolves the percentage return of a single trade for individual inspection/display:
 * 1. If realizedNetReturnPct is explicitly defined (user entered), returns it directly.
 * 2. If calculationMode === 'unrecorded' and no realizedNetReturnPct was entered, returns null ('Sin dato').
 * 3. For monetary or legacy derived trades, calculates (netPnl / initialBalance) * 100 if verified capital exists.
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
 * Resolves the relevant accounts and calculates consolidated return strictly over constant initial capital.
 * - Excludes trades with unresolved data conflicts (`hasDataConflict === true`).
 * - Filters accounts to only verified accounts with positive initial capital.
 * - Distinguishes between monetary trades and unrecorded trades.
 * - Never sums or mixes standalone percentages without a verified constant initial capital denominator.
 */
export function calculateConsolidatedReturnPct(
  trades: readonly Pick<
    Trade,
    | 'netPnl'
    | 'accountId'
    | 'calculationMode'
    | 'realizedNetReturnPct'
    | 'rMultiple'
    | 'rUnrecorded'
    | 'hasDataConflict'
  >[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): ConsolidatedReturnResult {
  const verifiedAccounts = accounts.filter(
    (a) => a.hasVerifiedBalance !== false && Number.isFinite(a.initialBalance) && a.initialBalance > 0
  );

  const tradesInScope =
    targetAccountId && targetAccountId !== 'All'
      ? trades.filter((t) => t.accountId === targetAccountId)
      : trades;

  const validTrades = tradesInScope.filter(isTradeIncludedInAggregates);
  const conflictedTradesCount = tradesInScope.length - validTrades.length;

  const monetaryTrades = validTrades.filter(
    (t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl)
  );
  const rValidTrades = validTrades.filter(hasValidRMultiple);
  const unrecordedRTradesCount = validTrades.filter((t) => Boolean(t.rUnrecorded)).length;

  const isSingleAccountScope = Boolean(targetAccountId && targetAccountId !== 'All');
  const singleAccount = isSingleAccountScope
    ? verifiedAccounts.find((a) => a.id === targetAccountId)
    : undefined;

  const hasVerifiedReferenceCapital = isSingleAccountScope
    ? Boolean(singleAccount)
    : verifiedAccounts.length > 0;

  const includedTradesCount = hasVerifiedReferenceCapital ? monetaryTrades.length : 0;
  const excludedTradesCount = tradesInScope.length - includedTradesCount;
  const isPartial = tradesInScope.length > 0 && excludedTradesCount > 0;

  const coverage: DataCoverageInfo = {
    totalTrades: tradesInScope.length,
    monetaryTradesCount: monetaryTrades.length,
    returnPctTradesCount: validTrades.filter(
      (t) =>
        t.realizedNetReturnPct !== null &&
        t.realizedNetReturnPct !== undefined &&
        Number.isFinite(t.realizedNetReturnPct)
    ).length,
    unrecordedTradesCount: validTrades.filter((t) => t.calculationMode === 'unrecorded').length,
    rMultipleTradesCount: rValidTrades.length,
    unrecordedRTradesCount,
    conflictedTradesCount,
    includedTradesCount,
    excludedTradesCount,
    isPartialCoverage: isPartial,
    hasVerifiedReferenceCapital,
  };

  // 1. Single Account Scope
  if (isSingleAccountScope) {
    if (!singleAccount) {
      return {
        returnPct: null,
        returnBase: rValidTrades.length > 0 ? 'r_multiple_only' : 'insufficient_data',
        isPartial: true,
        includedTradesCount: 0,
        excludedTradesCount: tradesInScope.length,
        totalNetPnl: null,
        totalReferenceCapital: 0,
        isValid: false,
        accountCount: 0,
        coverage,
        errorReason: 'Cuenta seleccionada sin capital inicial constante verificable',
      };
    }

    const totalNetPnl =
      monetaryTrades.length > 0
        ? monetaryTrades.reduce((sum, t) => sum + t.netPnl, 0)
        : null;

    if (totalNetPnl === null) {
      return {
        returnPct: null,
        returnBase: rValidTrades.length > 0 ? 'r_multiple_only' : 'insufficient_data',
        isPartial: tradesInScope.length > 0,
        includedTradesCount: 0,
        excludedTradesCount: tradesInScope.length,
        totalNetPnl: null,
        totalReferenceCapital: singleAccount.initialBalance,
        isValid: false,
        accountCount: 1,
        coverage,
        errorReason: 'Sin operaciones monetarias para calcular retorno sobre capital inicial constante',
      };
    }

    const returnPct = (totalNetPnl / singleAccount.initialBalance) * 100;

    return {
      returnPct,
      returnBase: 'constant_initial_capital',
      isPartial,
      includedTradesCount: monetaryTrades.length,
      excludedTradesCount,
      totalNetPnl,
      totalReferenceCapital: singleAccount.initialBalance,
      isValid: true,
      accountCount: 1,
      coverage,
    };
  }

  // 2. Portfolio Scope ("All" or undefined targetAccountId)
  const totalNetPnl =
    monetaryTrades.length > 0
      ? monetaryTrades.reduce((sum, t) => sum + t.netPnl, 0)
      : null;

  if (verifiedAccounts.length === 0) {
    return {
      returnPct: null,
      returnBase: rValidTrades.length > 0 ? 'r_multiple_only' : 'insufficient_data',
      isPartial: tradesInScope.length > 0,
      includedTradesCount: 0,
      excludedTradesCount: tradesInScope.length,
      totalNetPnl,
      totalReferenceCapital: 0,
      isValid: false,
      accountCount: 0,
      coverage,
      errorReason: 'No hay cuentas con capital inicial constante verificable',
    };
  }

  const totalReferenceCapital = verifiedAccounts.reduce((sum, a) => sum + a.initialBalance, 0);

  if (totalNetPnl !== null && totalReferenceCapital > 0) {
    const returnPct = (totalNetPnl / totalReferenceCapital) * 100;
    return {
      returnPct,
      returnBase: 'constant_initial_capital',
      isPartial,
      includedTradesCount: monetaryTrades.length,
      excludedTradesCount,
      totalNetPnl,
      totalReferenceCapital,
      isValid: true,
      accountCount: verifiedAccounts.length,
      coverage,
    };
  }

  return {
    returnPct: null,
    returnBase: rValidTrades.length > 0 ? 'r_multiple_only' : 'insufficient_data',
    isPartial: tradesInScope.length > 0,
    includedTradesCount: 0,
    excludedTradesCount: tradesInScope.length,
    totalNetPnl,
    totalReferenceCapital,
    isValid: false,
    accountCount: verifiedAccounts.length,
    coverage,
  };
}

/**
 * Calculates daily percentage return over constant initial reference capital.
 */
export function calculateDailyReturnPct(
  dailyTrades: readonly Pick<
    Trade,
    | 'netPnl'
    | 'accountId'
    | 'calculationMode'
    | 'realizedNetReturnPct'
    | 'rMultiple'
    | 'rUnrecorded'
    | 'hasDataConflict'
  >[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): number | null {
  if (dailyTrades.length === 0) return null;
  return calculateConsolidatedReturnPct(dailyTrades, accounts, targetAccountId).returnPct;
}

/**
 * Calculates monthly percentage return over constant initial reference capital.
 */
export function calculateMonthlyReturnPct(
  monthlyTrades: readonly Pick<
    Trade,
    | 'netPnl'
    | 'accountId'
    | 'calculationMode'
    | 'realizedNetReturnPct'
    | 'rMultiple'
    | 'rUnrecorded'
    | 'hasDataConflict'
  >[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): number | null {
  if (monthlyTrades.length === 0) return null;
  return calculateConsolidatedReturnPct(monthlyTrades, accounts, targetAccountId).returnPct;
}

/**
 * Resolves the constant initial reference capital for the current scope.
 */
function resolveScopeReferenceCapital(
  accounts: readonly PropAccount[],
  targetAccountId?: string
): number {
  const verifiedAccounts = accounts.filter(
    (a) => a.hasVerifiedBalance !== false && Number.isFinite(a.initialBalance) && a.initialBalance > 0
  );
  if (targetAccountId && targetAccountId !== 'All') {
    const acc = verifiedAccounts.find((a) => a.id === targetAccountId);
    return acc ? acc.initialBalance : 0;
  }
  return verifiedAccounts.reduce((sum, a) => sum + a.initialBalance, 0);
}

/**
 * Calculates average win percentage return strictly over constant initial reference capital
 * and only from valid monetary trades (never mixing standalone unrecorded percentages or different denominators).
 */
export function calculateAvgWinReturnPct(
  wins: readonly Pick<
    Trade,
    | 'netPnl'
    | 'accountId'
    | 'calculationMode'
    | 'realizedNetReturnPct'
    | 'rMultiple'
    | 'hasDataConflict'
  >[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): number | null {
  const referenceCapital = resolveScopeReferenceCapital(accounts, targetAccountId);
  if (referenceCapital <= 0) return null;

  const scopeWins = (
    targetAccountId && targetAccountId !== 'All'
      ? wins.filter((w) => w.accountId === targetAccountId)
      : wins
  ).filter(isTradeIncludedInAggregates);

  if (scopeWins.length === 0) return 0;

  const monetaryWins = scopeWins.filter(
    (w) => w.calculationMode !== 'unrecorded' && Number.isFinite(w.netPnl) && w.netPnl > 0
  );
  if (monetaryWins.length === 0) return null;

  const avgWinUsd =
    monetaryWins.reduce((sum, w) => sum + w.netPnl, 0) / monetaryWins.length;
  return (avgWinUsd / referenceCapital) * 100;
}

/**
 * Calculates average loss percentage return (positive absolute percentage) strictly over constant initial reference capital
 * and only from valid monetary trades.
 */
export function calculateAvgLossReturnPct(
  losses: readonly Pick<
    Trade,
    | 'netPnl'
    | 'accountId'
    | 'calculationMode'
    | 'realizedNetReturnPct'
    | 'rMultiple'
    | 'hasDataConflict'
  >[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): number | null {
  const referenceCapital = resolveScopeReferenceCapital(accounts, targetAccountId);
  if (referenceCapital <= 0) return null;

  const scopeLosses = (
    targetAccountId && targetAccountId !== 'All'
      ? losses.filter((l) => l.accountId === targetAccountId)
      : losses
  ).filter(isTradeIncludedInAggregates);

  if (scopeLosses.length === 0) return 0;

  const monetaryLosses = scopeLosses.filter(
    (l) => l.calculationMode !== 'unrecorded' && Number.isFinite(l.netPnl) && l.netPnl < 0
  );
  if (monetaryLosses.length === 0) return null;

  const avgLossUsd =
    Math.abs(monetaryLosses.reduce((sum, l) => sum + l.netPnl, 0)) / monetaryLosses.length;
  return (avgLossUsd / referenceCapital) * 100;
}

/**
 * Calculates statistical expected value per trade as percentage of constant initial balance:
 * expectancyPct = (winRate / 100 * avgWinPct) - ((1 - winRate / 100) * avgLossPct)
 * Must be called with the winRate of the exact same monetary sample used for avgWinPct and avgLossPct.
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
 * Calculates percentage equity curve (over constant initial reference capital) or pure R-Multiple curve.
 * - Excludes trades with `hasDataConflict === true`.
 * - In R-Multiple mode, excludes trades with `rUnrecorded === true`.
 * - In Percentage mode, includes only monetary trades (`calculationMode !== 'unrecorded'`) and marks `isPartialCurve` whenever any trades were excluded.
 */
export function calculatePercentageEquityCurve(
  chronologicalTrades: readonly Trade[],
  accounts: readonly PropAccount[],
  targetAccountId?: string
): PercentageEquityCurveResult {
  const tradesInScope =
    targetAccountId && targetAccountId !== 'All'
      ? chronologicalTrades.filter((t) => t.accountId === targetAccountId)
      : chronologicalTrades;

  const totalTradesCount = tradesInScope.length;
  const validTrades = tradesInScope.filter(isTradeIncludedInAggregates);

  const sortedTrades = [...validTrades].sort(
    (a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id)
  );

  const referenceCapital = resolveScopeReferenceCapital(accounts, targetAccountId);
  const hasMonetaryTrades = sortedTrades.some(
    (t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl) && t.netPnl !== 0
  );

  const canBuildPercentageCurve = referenceCapital > 0 && hasMonetaryTrades;

  if (!canBuildPercentageCurve) {
    // Mode: R-Multiple Cumulative Curve
    const rTrades = sortedTrades.filter(hasValidRMultiple);
    let cumulativeR = 0;
    let peakR = 0;
    let maxDrawdownR = 0;
    let bestTradeR: number | null = null;
    let worstTradeR: number | null = null;

    const points: EquityPointPct[] = [];

    points.push({
      tradeIndex: 0,
      tradeLabel: 'Inicio',
      date: rTrades[0]?.entryDate ? rTrades[0].entryDate.slice(0, 10) : 'Inicio',
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

    for (let i = 0; i < rTrades.length; i++) {
      const t = rTrades[i];
      const r = t.rMultiple;
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

    const excludedTradesCount = totalTradesCount - rTrades.length;

    return {
      curveMode: 'r_multiple',
      returnBase: rTrades.length > 0 ? 'r_multiple_only' : 'insufficient_data',
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
      isValid: rTrades.length > 0,
      isPartialCurve: totalTradesCount > rTrades.length,
      includedTradesCount: rTrades.length,
      excludedTradesCount,
      totalTradesCount,
    };
  }

  // Mode: Percentage Equity Curve over constant initial capital
  const monetaryTradesInCurve = sortedTrades.filter(
    (t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl)
  );

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
    date: monetaryTradesInCurve[0]?.entryDate ? monetaryTradesInCurve[0].entryDate.slice(0, 10) : 'Inicio',
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

  for (let i = 0; i < monetaryTradesInCurve.length; i++) {
    const t = monetaryTradesInCurve[i];
    const isEstimated = t.calculationMode === 'derived_r' || Boolean(t.commissionUnmeasured);
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
    // Strictly use the curve's constant initial reference capital as denominator
    const tradeReturnPct = calculateTradeReturnPct(t.netPnl, referenceCapital);

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
      tradeRMultiple: t.rUnrecorded ? undefined : t.rMultiple,
      cumulativePnl: Number(cumulativePnl.toFixed(2)),
      cumulativeReturnPct: Number(cumulativeReturnPct.toFixed(4)),
      equity: Number(currentEquity.toFixed(2)),
      drawdownPct: Number(drawdownPct.toFixed(4)),
    });
  }

  const currentReturnPct = (cumulativePnl / referenceCapital) * 100;
  const peakReturnPct = ((peakEquity - referenceCapital) / referenceCapital) * 100;
  const excludedTradesCount = totalTradesCount - monetaryTradesInCurve.length;

  return {
    curveMode: 'percentage',
    returnBase: 'constant_initial_capital',
    points,
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    currentReturnPct: Number(currentReturnPct.toFixed(2)),
    peakReturnPct: Number(peakReturnPct.toFixed(2)),
    bestTradeReturnPct: bestTradeReturnPct !== null ? Number(bestTradeReturnPct.toFixed(2)) : null,
    worstTradeReturnPct: worstTradeReturnPct !== null ? Number(worstTradeReturnPct.toFixed(2)) : null,
    referenceCapital,
    isValid: monetaryTradesInCurve.length > 0,
    isPartialCurve: totalTradesCount > monetaryTradesInCurve.length,
    includedTradesCount: monetaryTradesInCurve.length,
    excludedTradesCount,
    totalTradesCount,
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
  const validTrades = trades.filter(isTradeIncludedInAggregates);
  const baseStats = calculateOperationalWindowStats(validTrades);
  const conflictedCount = trades.length - validTrades.length;

  const windows: OperationalWindowReturnItem[] = baseStats.windows.map((w) => {
    const windowTrades = validTrades.filter((t) => {
      if (t.timePrecision === 'window') return false;
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

    const sumR = windowTrades
      .filter(hasValidRMultiple)
      .reduce((acc, t) => acc + t.rMultiple, 0);
    const returnPct =
      windowTrades.length > 0
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
    excludedTradesCount: baseStats.excludedTradesCount + conflictedCount,
    totalTradesCount: trades.length,
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
  const validTrades = trades.filter(isTradeIncludedInAggregates);
  const days = [
    { day: 'Lun', dayIndex: 1 },
    { day: 'Mar', dayIndex: 2 },
    { day: 'Mié', dayIndex: 3 },
    { day: 'Jue', dayIndex: 4 },
    { day: 'Vie', dayIndex: 5 },
  ];

  return days.map(({ day, dayIndex }) => {
    const dayTrades = validTrades.filter((t) => {
      const [year, month, dayNum] = t.entryDate.slice(0, 10).split('-').map(Number);
      const utcDay = new Date(Date.UTC(year, month - 1, dayNum)).getUTCDay();
      return utcDay === dayIndex;
    });

    const monetaryTrades = dayTrades.filter((t) => t.calculationMode !== 'unrecorded');
    const pnl =
      monetaryTrades.length > 0
        ? Number(monetaryTrades.reduce((acc, t) => acc + t.netPnl, 0).toFixed(2))
        : null;

    const sumR = Number(
      dayTrades
        .filter(hasValidRMultiple)
        .reduce((acc, t) => acc + t.rMultiple, 0)
        .toFixed(2)
    );
    const returnPct =
      dayTrades.length > 0
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
