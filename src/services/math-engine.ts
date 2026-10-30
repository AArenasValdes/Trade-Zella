import type {
  Trade,
  PropAccount,
  Killzone,
  TradeDirection,
  SetupGrade,
  DashboardMetrics,
  RiskCalculationInput,
  RiskCalculationResult,
} from '../types/trading.ts';
import { INSTRUMENT_SPECS, ICT_CHECKLIST_ITEMS } from '../config/ict-constants.ts';
import {
  calculateConsolidatedReturnPct,
  calculateAvgWinReturnPct,
  calculateAvgLossReturnPct,
  calculateExpectancyReturnPct,
  calculatePercentageEquityCurve,
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

export function autoCalculateTradeMath(params: {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  commission: number;
  direction?: TradeDirection;
}) {
  const { symbol, entryPrice, exitPrice, stopLoss, takeProfit, size, commission } = params;
  const cleanSymbol = symbol.trim().toUpperCase();

  let direction: TradeDirection = params.direction || 'Long';
  if (stopLoss > 0 && entryPrice > 0) {
    direction = stopLoss < entryPrice ? 'Long' : 'Short';
  } else if (takeProfit > 0 && entryPrice > 0) {
    direction = takeProfit > entryPrice ? 'Long' : 'Short';
  }

  const multiplier = INSTRUMENT_SPECS[cleanSymbol]?.pointValue ?? 1;
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

  const grossPnl = Number((priceDiff * multiplier * size).toFixed(2));
  const netPnl = Number((grossPnl - commission).toFixed(2));

  return {
    direction,
    rMultiple,
    plannedRR,
    grossPnl,
    netPnl,
    pointValue: multiplier,
  };
}

export function calculatePositionSize(
  input: RiskCalculationInput
): RiskCalculationResult | null {
  const { accountBalance, riskPercent, entryPrice, stopLossPrice, symbol } = input;
  const stopDistance = Math.abs(entryPrice - stopLossPrice);
  if (accountBalance <= 0 || riskPercent <= 0 || stopDistance <= 0) return null;

  const cleanSymbol = symbol.trim().toUpperCase();
  const pointValue = INSTRUMENT_SPECS[cleanSymbol]?.pointValue ?? 1;
  const riskDollars = Number(((accountBalance * riskPercent) / 100).toFixed(2));
  const dollarRiskPerUnit = stopDistance * pointValue;

  const rawSize = riskDollars / dollarRiskPerUnit;
  const recommendedSize = Number(rawSize.toFixed(2));

  const direction: TradeDirection = stopLossPrice < entryPrice ? 'Long' : 'Short';
  const sign = direction === 'Long' ? 1 : -1;

  return {
    riskDollars,
    stopDistancePoints: Number(stopDistance.toFixed(2)),
    pointValue,
    recommendedSize,
    direction,
    targets: {
      r1: Number((entryPrice + sign * stopDistance * 1).toFixed(2)),
      r2: Number((entryPrice + sign * stopDistance * 2).toFixed(2)),
      r3: Number((entryPrice + sign * stopDistance * 3).toFixed(2)),
    },
  };
}

export function calculateDashboardMetrics(
  trades: Trade[],
  accounts: readonly PropAccount[] = [],
  targetAccountId?: string
): DashboardMetrics {
  if (trades.length === 0) {
    const hasAccounts = accounts.length > 0;
    const refCapital = hasAccounts
      ? accounts.reduce((s, a) => s + (a.initialBalance > 0 ? a.initialBalance : 0), 0)
      : 0;

    return {
      netPnl: 0,
      netReturnPct: hasAccounts ? 0 : null,
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
      maxDrawdownPct: hasAccounts ? 0 : null,
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
    };
  }

  const sorted = [...trades].sort(
    (a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id)
  );
  // Status-based wins and losses (accurate for R-only, % return and monetary trades alike)
  const wins = sorted.filter((t) => t.status === 'Win');
  const losses = sorted.filter((t) => t.status === 'Loss');

  // Monetary calculations are isolated to trades with verified monetary results
  const monetaryTrades = sorted.filter(
    (t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl)
  );
  const monetaryWins = monetaryTrades.filter((t) => t.netPnl > 0);
  const monetaryLosses = monetaryTrades.filter((t) => t.netPnl < 0);

  const netPnl = Number(monetaryTrades.reduce((acc, t) => acc + t.netPnl, 0).toFixed(2));
  const grossProfit = Number(monetaryWins.reduce((acc, t) => acc + t.netPnl, 0).toFixed(2));
  const grossLoss = Number(Math.abs(monetaryLosses.reduce((acc, t) => acc + t.netPnl, 0)).toFixed(2));
  const totalCommissions = Number(
    monetaryTrades.reduce((acc, t) => acc + (t.commission || 0), 0).toFixed(2)
  );

  const totalTrades = sorted.length;
  const winRate = totalTrades > 0 ? Number(((wins.length / totalTrades) * 100).toFixed(1)) : 0;
  const lossRate = totalTrades > 0 ? losses.length / totalTrades : 0;

  // Profit factor: uses monetary figures if available, or R-multiple if purely R-based
  let profitFactor = 0;
  if (grossLoss > 0 || grossProfit > 0) {
    profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 10.0 : 0) : Number((grossProfit / grossLoss).toFixed(2));
  } else {
    const sumWinR = wins.reduce((acc, t) => acc + (t.rMultiple > 0 ? t.rMultiple : 0), 0);
    const sumLossR = Math.abs(losses.reduce((acc, t) => acc + (t.rMultiple < 0 ? t.rMultiple : 0), 0));
    profitFactor = sumLossR === 0 ? (sumWinR > 0 ? 10.0 : 0) : Number((sumWinR / sumLossR).toFixed(2));
  }

  const avgWin = monetaryWins.length > 0 ? Number((grossProfit / monetaryWins.length).toFixed(2)) : 0;
  const avgLoss = monetaryLosses.length > 0 ? Number((grossLoss / monetaryLosses.length).toFixed(2)) : 0;
  const winLossRatio =
    avgLoss === 0 ? (avgWin > 0 ? 5.0 : 0) : Number((avgWin / avgLoss).toFixed(2));

  const expectancy = Number(((winRate / 100) * avgWin - lossRate * avgLoss).toFixed(2));
  const tradesWithR = sorted.filter((t) => Number.isFinite(t.rMultiple));
  const avgRMultiple = tradesWithR.length > 0
    ? Number((tradesWithR.reduce((acc, t) => acc + t.rMultiple, 0) / tradesWithR.length).toFixed(2))
    : 0;

  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  let bestTrade = 0;
  let worstTrade = 0;

  sorted.forEach((t) => {
    equity += t.netPnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (t.netPnl > bestTrade) bestTrade = t.netPnl;
    if (t.netPnl < worstTrade) worstTrade = t.netPnl;
  });

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
    netPnl: Number(longs.filter((t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl)).reduce((a, b) => a + b.netPnl, 0).toFixed(2)),
  };

  const shortStats = {
    count: shorts.length,
    winRate:
      shorts.length > 0
        ? Math.round((shorts.filter((t) => t.status === 'Win').length / shorts.length) * 100)
        : 0,
    netPnl: Number(shorts.filter((t) => t.calculationMode !== 'unrecorded' && Number.isFinite(t.netPnl)).reduce((a, b) => a + b.netPnl, 0).toFixed(2)),
  };

  const planComplianceRate = Number(
    ((sorted.filter((t) => t.followedPlan).length / totalTrades) * 100).toFixed(1)
  );

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

  const consolidated = calculateConsolidatedReturnPct(sorted, accounts, targetAccountId);
  const avgWinPct = calculateAvgWinReturnPct(wins, accounts, targetAccountId);
  const avgLossPct = calculateAvgLossReturnPct(losses, accounts, targetAccountId);
  const expectancyPct = calculateExpectancyReturnPct(winRate, avgWinPct, avgLossPct);
  const equityResult = calculatePercentageEquityCurve(sorted, accounts, targetAccountId);

  return {
    netPnl,
    netReturnPct: consolidated.returnPct !== null ? Number(consolidated.returnPct.toFixed(2)) : null,
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
    avgRMultiple,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
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
  };
}
