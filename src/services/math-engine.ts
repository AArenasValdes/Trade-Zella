import type {
  Trade,
  PropAccount,
  Killzone,
  TradeDirection,
  SetupGrade,
  DashboardMetrics,
  RiskCalculationInput,
  RiskCalculationResult,
  PnlProvenance,
} from '../types/trading.ts';
import { getInstrumentSpec, ICT_CHECKLIST_ITEMS } from '../config/ict-constants.ts';
import {
  calculateConsolidatedReturnPct,
  calculateAvgWinReturnPct,
  calculateAvgLossReturnPct,
  calculateExpectancyReturnPct,
  calculatePercentageEquityCurve,
  isTradeIncludedInAggregates,
  hasValidRMultiple,
} from './financial-engine.ts';

export function detectKillzoneFromTime(dateTimeStr: string): Killzone {
  if (!dateTimeStr) return 'NY Open 09:30 AM (09:30-10:30)';
  const timePart = dateTimeStr.includes('T')
    ? dateTimeStr.split('T')[1]
    : dateTimeStr.split(' ')[1];
  if (!timePart) return 'NY Open 09:30 AM (09:30-10:30)';

  const [hourStr, minStr] = timePart.split(':');
  const totalMinutes = parseInt(hourStr, 10) * 60 + parseInt(minStr || '0', 10);

  if (totalMinutes >= 510 && totalMinutes < 570) return 'NY Pre-Open / Macro (08:30-09:30)';
  if (totalMinutes >= 570 && totalMinutes <= 630) return 'NY Open 09:30 AM (09:30-10:30)';
  if (totalMinutes > 630 && totalMinutes <= 720) return 'NY Mid-Morning (10:30-12:00)';
  if (totalMinutes >= 810 && totalMinutes <= 960) return 'NY PM Session (13:30-16:00)';
  if (totalMinutes >= 120 && totalMinutes < 510) return 'London / Pre-NY (02:00-08:30)';

  return 'Out of NY Window';
}

export function calculateSetupGrade(
  completedItems: string[],
  followedPlan: boolean
): SetupGrade {
  if (completedItems.length === 0) return 'Sin evaluar';
  if (!followedPlan || completedItems.length <= 1) return 'FOMO';
  const ratio = completedItems.length / ICT_CHECKLIST_ITEMS.length;
  if (ratio >= 0.8) return 'A+';
  if (ratio >= 0.5) return 'B';
  return 'C';
}

export interface TheoreticalInstrumentPnlResult {
  grossPnl: number;
  netPnl: number;
  pointValue: number;
  contractSize: number;
  tickSize: number;
  tickValue: number;
  unitLabel: string;
  verified: boolean;
  provenance: PnlProvenance;
}

/**
 * Calculates theoretical price-derived P&L for an instrument only if its specification
 * (contractSize, tickSize, tickValue, pointValue) is verified and prices/size are valid.
 * Never labels price-derived P&L without measured commissions as 'audited'.
 */
export function calculateTheoreticalInstrumentPnl(params: {
  symbol: string;
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number;
  size: number;
  commission?: number;
  hasMeasuredCommission?: boolean;
}): TheoreticalInstrumentPnlResult {
  const {
    symbol,
    direction,
    entryPrice,
    exitPrice,
    size,
    commission = 0,
    hasMeasuredCommission = false,
  } = params;
  const spec = getInstrumentSpec(symbol);

  if (
    !spec.verified ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(exitPrice) ||
    !Number.isFinite(size) ||
    entryPrice <= 0 ||
    exitPrice <= 0 ||
    size <= 0 ||
    spec.tickSize <= 0 ||
    spec.tickValue <= 0
  ) {
    return {
      grossPnl: 0,
      netPnl: 0,
      pointValue: spec.pointValue,
      contractSize: spec.contractSize,
      tickSize: spec.tickSize,
      tickValue: spec.tickValue,
      unitLabel: spec.unitLabel,
      verified: false,
      provenance: 'unrecorded',
    };
  }

  const priceDiff = direction === 'Long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  const ticks = priceDiff / spec.tickSize;
  const grossPnl = Number((ticks * spec.tickValue * size).toFixed(2));
  const netPnl = Number((grossPnl - commission).toFixed(2));

  return {
    grossPnl,
    netPnl,
    pointValue: spec.pointValue,
    contractSize: spec.contractSize,
    tickSize: spec.tickSize,
    tickValue: spec.tickValue,
    unitLabel: spec.unitLabel,
    verified: true,
    provenance: hasMeasuredCommission ? 'audited' : 'theoretical',
  };
}

export function autoCalculateTradeMath(params: {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  commission: number;
  direction?: TradeDirection;
  hasMeasuredCommission?: boolean;
}) {
  const {
    symbol,
    entryPrice,
    exitPrice,
    stopLoss,
    takeProfit,
    size,
    commission,
    hasMeasuredCommission = false,
  } = params;
  const cleanSymbol = symbol.trim().toUpperCase();

  let direction: TradeDirection = params.direction || 'Long';
  if (stopLoss > 0 && entryPrice > 0) {
    direction = stopLoss < entryPrice ? 'Long' : 'Short';
  } else if (takeProfit > 0 && entryPrice > 0) {
    direction = takeProfit > entryPrice ? 'Long' : 'Short';
  }

  const spec = getInstrumentSpec(cleanSymbol);
  const priceDiff = direction === 'Long' ? exitPrice - entryPrice : entryPrice - exitPrice;
  const riskPerUnit = stopLoss > 0 ? Math.abs(entryPrice - stopLoss) : 0;

  const rewardPlannedPerUnit =
    takeProfit > 0
      ? direction === 'Long'
        ? takeProfit - entryPrice
        : entryPrice - takeProfit
      : 0;

  const rMultiple = riskPerUnit > 0 ? Number((priceDiff / riskPerUnit).toFixed(2)) : 0;
  const plannedRR =
    riskPerUnit > 0 && rewardPlannedPerUnit > 0
      ? Number((rewardPlannedPerUnit / riskPerUnit).toFixed(2))
      : 0;

  const pnlCalc = calculateTheoreticalInstrumentPnl({
    symbol: cleanSymbol,
    direction,
    entryPrice,
    exitPrice,
    size,
    commission,
    hasMeasuredCommission: hasMeasuredCommission || commission > 0,
  });

  return {
    direction,
    rMultiple,
    plannedRR,
    grossPnl: pnlCalc.grossPnl,
    netPnl: pnlCalc.netPnl,
    pointValue: spec.pointValue,
    contractSize: spec.contractSize,
    tickSize: spec.tickSize,
    tickValue: spec.tickValue,
    unitLabel: spec.unitLabel,
    verifiedSpec: spec.verified,
    specLabel: spec.label,
    pnlProvenance: pnlCalc.provenance,
  };
}

export function calculatePositionSize(
  input: RiskCalculationInput
): RiskCalculationResult | null {
  const { accountBalance, riskPercent, entryPrice, stopLossPrice, symbol } = input;
  const stopDistance = Math.abs(entryPrice - stopLossPrice);
  if (accountBalance <= 0 || riskPercent <= 0 || stopDistance <= 0) return null;

  const cleanSymbol = symbol.trim().toUpperCase();
  const spec = getInstrumentSpec(cleanSymbol);
  const pointValue = spec.pointValue;
  const riskDollars = Number(((accountBalance * riskPercent) / 100).toFixed(2));
  const dollarRiskPerUnit = stopDistance * pointValue;

  const rawSize = riskDollars / dollarRiskPerUnit;
  const recommendedSize = Number(rawSize.toFixed(2));

  const direction: TradeDirection = stopLossPrice < entryPrice ? 'Long' : 'Short';
  const sign = direction === 'Long' ? 1 : -1;

  return {
    riskDollars,
    stopDistancePoints: Number(stopDistance.toFixed(4)),
    pointValue,
    recommendedSize,
    direction,
    targets: {
      r1: Number((entryPrice + sign * stopDistance * 1).toFixed(4)),
      r2: Number((entryPrice + sign * stopDistance * 2).toFixed(4)),
      r3: Number((entryPrice + sign * stopDistance * 3).toFixed(4)),
    },
  };
}

export function calculateDashboardMetrics(
  trades: Trade[],
  accounts: readonly PropAccount[] = [],
  targetAccountId?: string
): DashboardMetrics {
  const verifiedAccounts = accounts.filter(
    (a) => a.hasVerifiedBalance !== false && Number.isFinite(a.initialBalance) && a.initialBalance > 0
  );
  const refCapital =
    targetAccountId && targetAccountId !== 'All'
      ? verifiedAccounts.find((a) => a.id === targetAccountId)?.initialBalance ?? 0
      : verifiedAccounts.reduce((s, a) => s + a.initialBalance, 0);

  const tradesInScope =
    targetAccountId && targetAccountId !== 'All'
      ? trades.filter((t) => t.accountId === targetAccountId)
      : trades;

  // Exclude contradictory/conflicted trades from statistical aggregates until resolved
  const validTrades = tradesInScope.filter(isTradeIncludedInAggregates);
  const conflictedTradesCount = tradesInScope.length - validTrades.length;

  if (validTrades.length === 0) {
    return {
      netPnl: 0,
      netReturnPct: refCapital > 0 && tradesInScope.length === 0 ? 0 : null,
      returnBase: refCapital > 0 ? 'constant_initial_capital' : 'insufficient_data',
      isPartialReturn: conflictedTradesCount > 0,
      grossProfit: 0,
      grossLoss: 0,
      totalCommissions: 0,
      totalTrades: 0,
      winsCount: 0,
      lossesCount: 0,
      winRate: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      avgWinPct: null,
      avgLossPct: null,
      winLossRatio: 0,
      expectancy: 0,
      expectancyPct: null,
      avgRMultiple: 0,
      maxDrawdown: 0,
      maxDrawdownPct: refCapital > 0 ? 0 : null,
      bestTrade: 0,
      bestTradeReturnPct: null,
      worstTrade: 0,
      worstTradeReturnPct: null,
      referenceCapital: refCapital,
      currentStreak: { type: 'None', count: 0 },
      planComplianceRate: 0,
      zellaScore: 0,
      longStats: { count: 0, winRate: 0, netPnl: 0 },
      shortStats: { count: 0, winRate: 0, netPnl: 0 },
      radarData: [
        { metric: 'Win Rate', score: 0, fullMark: 100 },
        { metric: 'Profit Factor', score: 0, fullMark: 100 },
        { metric: 'R-Multiple', score: 0, fullMark: 100 },
        { metric: 'Contexto HTF', score: 0, fullMark: 100 },
        { metric: 'Risk Control', score: 0, fullMark: 100 },
      ],
      expectancyUSD: null,
      expectancyR: null,
      profitFactorUSD: null,
      profitFactorR: null,
      monetarySampleSize: 0,
      rSampleSize: 0,
      dataCoverage: {
        totalTrades: tradesInScope.length,
        monetaryTradesCount: 0,
        returnPctTradesCount: 0,
        unrecordedTradesCount: 0,
        rMultipleTradesCount: 0,
        unrecordedRTradesCount: 0,
        conflictedTradesCount,
        includedTradesCount: 0,
        excludedTradesCount: tradesInScope.length,
        isPartialCoverage: conflictedTradesCount > 0,
        hasVerifiedReferenceCapital: refCapital > 0,
      },
      curveMode: refCapital > 0 ? 'percentage' : 'r_multiple',
      totalRMultiple: 0,
    };
  }

  const sorted = [...validTrades].sort(
    (a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id)
  );

  const wins = sorted.filter((t) => t.status === 'Win');
  const losses = sorted.filter((t) => t.status === 'Loss');

  // Monetary calculations are isolated to trades with verified monetary results
  const monetaryTrades = sorted.filter(
    (t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl)
  );
  const monetaryWins = monetaryTrades.filter((t) => t.netPnl > 0);
  const monetaryLosses = monetaryTrades.filter((t) => t.netPnl < 0);
  const monetarySampleSize = monetaryTrades.length;

  const netPnl = Number(monetaryTrades.reduce((acc, t) => acc + t.netPnl, 0).toFixed(2));
  const grossProfit = Number(monetaryWins.reduce((acc, t) => acc + t.netPnl, 0).toFixed(2));
  const grossLoss = Number(Math.abs(monetaryLosses.reduce((acc, t) => acc + t.netPnl, 0)).toFixed(2));
  const totalCommissions = Number(
    monetaryTrades.reduce((acc, t) => acc + (t.commission || 0), 0).toFixed(2)
  );

  const totalTrades = sorted.length;
  const winRate = totalTrades > 0 ? Number(((wins.length / totalTrades) * 100).toFixed(1)) : 0;

  // Profit Factor & Expectancy: calculated on strictly coherent populations
  let profitFactorUSD: number | null = null;
  let expectancyUSD: number | null = null;
  let avgWin = 0;
  let avgLoss = 0;

  if (monetarySampleSize > 0) {
    avgWin = monetaryWins.length > 0 ? Number((grossProfit / monetaryWins.length).toFixed(2)) : 0;
    avgLoss = monetaryLosses.length > 0 ? Number((grossLoss / monetaryLosses.length).toFixed(2)) : 0;
    const monetaryWinRate = monetaryWins.length / monetarySampleSize;
    const monetaryLossRate = monetaryLosses.length / monetarySampleSize;
    expectancyUSD = Number(((monetaryWinRate * avgWin) - (monetaryLossRate * avgLoss)).toFixed(2));
    profitFactorUSD = grossLoss === 0
      ? (grossProfit > 0 ? null : 0)
      : Number((grossProfit / grossLoss).toFixed(2));
  }

  // Population R (strictly excludes trades with rUnrecorded === true)
  const rTrades = sorted.filter(hasValidRMultiple);
  const rSampleSize = rTrades.length;
  let profitFactorR: number | null = null;
  let expectancyR: number | null = null;
  let avgRMultiple = 0;
  let totalRMultiple = 0;

  if (rSampleSize > 0) {
    const rWins = rTrades.filter((t) => t.rMultiple > 0);
    const rLosses = rTrades.filter((t) => t.rMultiple < 0);
    const sumWinR = rWins.reduce((acc, t) => acc + t.rMultiple, 0);
    const sumLossR = Math.abs(rLosses.reduce((acc, t) => acc + t.rMultiple, 0));
    const avgWinR = rWins.length > 0 ? sumWinR / rWins.length : 0;
    const avgLossR = rLosses.length > 0 ? sumLossR / rLosses.length : 0;
    const rWinRate = rWins.length / rSampleSize;
    const rLossRate = rLosses.length / rSampleSize;
    expectancyR = Number(((rWinRate * avgWinR) - (rLossRate * avgLossR)).toFixed(2));
    profitFactorR = sumLossR === 0
      ? (sumWinR > 0 ? null : 0)
      : Number((sumWinR / sumLossR).toFixed(2));
    totalRMultiple = Number(rTrades.reduce((acc, t) => acc + t.rMultiple, 0).toFixed(2));
    avgRMultiple = Number((totalRMultiple / rSampleSize).toFixed(2));
  }

  const profitFactor = profitFactorUSD !== null && profitFactorUSD !== undefined
    ? profitFactorUSD
    : (profitFactorR ?? 0);
  const expectancy = expectancyUSD !== null && expectancyUSD !== undefined
    ? expectancyUSD
    : (expectancyR ?? 0);

  const winLossRatio =
    avgLoss === 0 ? (avgWin > 0 ? 5.0 : 0) : Number((avgWin / avgLoss).toFixed(2));

  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  let bestTrade = 0;
  let worstTrade = 0;

  if (monetaryTrades.length > 0) {
    monetaryTrades.forEach((t) => {
      equity += t.netPnl;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDrawdown) maxDrawdown = dd;
      if (t.netPnl > bestTrade) bestTrade = t.netPnl;
      if (t.netPnl < worstTrade) worstTrade = t.netPnl;
    });
  }

  let streakType: 'Win' | 'Loss' | 'None' = 'None';
  let streakCount = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const t = sorted[i];
    const currentType = t.status === 'Win' ? 'Win' : t.status === 'Loss' ? 'Loss' : 'None';
    if (currentType === 'None') continue;
    if (streakType === 'None') {
      streakType = currentType;
      streakCount = 1;
    } else if (streakType === currentType) {
      streakCount++;
    } else {
      break;
    }
  }

  const longs = sorted.filter((t) => t.direction === 'Long');
  const shorts = sorted.filter((t) => t.direction === 'Short');

  const longStats = {
    count: longs.length,
    winRate:
      longs.length > 0
        ? Math.round((longs.filter((t) => t.status === 'Win').length / longs.length) * 100)
        : 0,
    netPnl: Number(
      longs
        .filter((t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl))
        .reduce((a, b) => a + b.netPnl, 0)
        .toFixed(2)
    ),
  };

  const shortStats = {
    count: shorts.length,
    winRate:
      shorts.length > 0
        ? Math.round((shorts.filter((t) => t.status === 'Win').length / shorts.length) * 100)
        : 0,
    netPnl: Number(
      shorts
        .filter((t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl))
        .reduce((a, b) => a + b.netPnl, 0)
        .toFixed(2)
    ),
  };

  // Plan compliance rate is evaluated strictly on trades that recorded plan compliance (!planUnrecorded)
  const planEvaluatedTrades = sorted.filter((t) => !t.planUnrecorded);
  const planComplianceRate =
    planEvaluatedTrades.length > 0
      ? Number(
          (
            (planEvaluatedTrades.filter((t) => t.followedPlan).length /
              planEvaluatedTrades.length) *
            100
          ).toFixed(1)
        )
      : 0;

  const wrScore = Math.min(Math.round((winRate / 65) * 100), 100);
  const pfScore = Math.min(Math.round((profitFactor / 2.8) * 100), 100);
  const rrScore = Math.min(Math.max(Math.round(((avgRMultiple + 1) / 3.5) * 100), 10), 100);
  const riskScore =
    maxDrawdown === 0
      ? 100
      : Math.max(100 - Math.round((maxDrawdown / (grossProfit || 1000)) * 60), 20);

  const zellaScore = Math.round(
    wrScore * 0.25 + pfScore * 0.25 + rrScore * 0.2 + planComplianceRate * 0.2 + riskScore * 0.1
  );

  // Pass tradesInScope to consolidated so coverage reflects conflictedTradesCount accurately
  const consolidated = calculateConsolidatedReturnPct(tradesInScope, accounts, targetAccountId);
  const avgWinPct = calculateAvgWinReturnPct(wins, accounts, targetAccountId);
  const avgLossPct = calculateAvgLossReturnPct(losses, accounts, targetAccountId);

  // Compute expectancyPct strictly on the monetary sample over constant initial capital
  let expectancyPct: number | null = null;
  if (monetarySampleSize > 0 && consolidated.totalReferenceCapital > 0) {
    const monetaryWinRatePct = (monetaryWins.length / monetarySampleSize) * 100;
    const effAvgWinPct = avgWinPct ?? 0;
    const effAvgLossPct = avgLossPct ?? 0;
    expectancyPct = calculateExpectancyReturnPct(
      monetaryWinRatePct,
      effAvgWinPct,
      effAvgLossPct
    );
  }

  const equityResult = calculatePercentageEquityCurve(tradesInScope, accounts, targetAccountId);

  return {
    netPnl,
    netReturnPct: consolidated.returnPct !== null ? Number(consolidated.returnPct.toFixed(2)) : null,
    returnBase: consolidated.returnBase,
    isPartialReturn: consolidated.isPartial,
    grossProfit,
    grossLoss,
    totalCommissions,
    totalTrades,
    winsCount: wins.length,
    lossesCount: losses.length,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    avgWinPct: avgWinPct !== null ? Number(avgWinPct.toFixed(2)) : null,
    avgLossPct: avgLossPct !== null ? Number(avgLossPct.toFixed(2)) : null,
    winLossRatio,
    expectancy,
    expectancyPct,
    expectancyUSD,
    expectancyR,
    profitFactorUSD,
    profitFactorR,
    monetarySampleSize,
    rSampleSize,
    avgRMultiple,
    maxDrawdown:
      equityResult.curveMode === 'percentage'
        ? Number(maxDrawdown.toFixed(2))
        : (equityResult.maxDrawdownR ?? 0),
    maxDrawdownPct: equityResult.maxDrawdownPct,
    bestTrade,
    bestTradeReturnPct: equityResult.bestTradeReturnPct,
    worstTrade,
    worstTradeReturnPct: equityResult.worstTradeReturnPct,
    referenceCapital: consolidated.totalReferenceCapital,
    currentStreak: { type: streakType, count: streakCount },
    planComplianceRate,
    zellaScore,
    longStats,
    shortStats,
    radarData: [
      { metric: 'Win Rate', score: wrScore, fullMark: 100 },
      { metric: 'Profit Factor', score: pfScore, fullMark: 100 },
      { metric: 'R-Multiple', score: rrScore, fullMark: 100 },
      { metric: 'Contexto HTF', score: Math.round(planComplianceRate), fullMark: 100 },
      { metric: 'Risk Control', score: riskScore, fullMark: 100 },
    ],
    dataCoverage: consolidated.coverage,
    curveMode: equityResult.curveMode,
    totalRMultiple,
  };
}
