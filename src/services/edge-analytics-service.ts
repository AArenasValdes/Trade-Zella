import type {
  Trade,
  PsychologyTag,
} from '../types/trading.ts';
import {
  isTradeIncludedInAggregates,
  hasValidRMultiple,
} from './financial-engine.ts';
import {
  classifyOperationalTimeWindow,
  extractNyDateKey,
} from './date-time-service.ts';

export const PRIMARY_ENTRY_MODELS = [
  'Breaker Block',
  'Key Level',
  'BPR (Balanced Price Range)',
] as const;

export type PrimaryEntryModel =
  | (typeof PRIMARY_ENTRY_MODELS)[number]
  | 'Sin modelo registrado';

export interface EdgeCohortMetrics {
  key: string;
  label: string;
  category: 'model' | 'window' | 'duration' | 'weekday' | 'symbol' | 'psychology' | 'environment';
  maxDrawdownR?: number;
  totalTrades: number; // N
  winsCount: number; // TP
  lossesCount: number; // SL
  winRate: number; // 0 - 100 (%)
  rSampleSize: number; // Count of trades with valid R
  totalR: number;
  avgR: number;
  expectancyR: number;
  profitFactorR: number | null; // null if 0 losses and >0 wins
  avgWinR: number;
  avgLossR: number;
  isSmallSample: boolean; // N < 10
  confidenceWarning?: string;
  tradeIds: string[];
}

export interface ModelComparisonResult {
  breakerBlock: EdgeCohortMetrics;
  keyLevel: EdgeCohortMetrics;
  otherModels: EdgeCohortMetrics[];
  allCohorts: EdgeCohortMetrics[];
  verdict: {
    hasSufficientData: boolean;
    leaderLabel?: string;
    description: string;
  };
}

export interface WindowComparisonResult {
  window1: EdgeCohortMetrics; // 09:30–10:35 NY
  window2: EdgeCohortMetrics; // 10:35–11:00 NY
  outside: EdgeCohortMetrics; // Outside operational window
  exactTimeCount: number;
  windowTimeCount: number;
  allCohorts: EdgeCohortMetrics[];
}

export interface AnalyticsFilters {
  dateFrom: string;
  dateTo: string;
  symbol: string;
  model: string;
  window: string;
  sourceType?: string;
}

export const INITIAL_ANALYTICS_FILTERS: AnalyticsFilters = {
  dateFrom: '',
  dateTo: '',
  symbol: 'All',
  model: 'All',
  window: 'All',
  sourceType: 'All',
};

/**
 * Resolves a single primary model per trade to prevent double-counting across cohorts.
 * Respects the first primary model registered within trade.pdArrays.
 * If none match a known primary entry model, classifies as 'Sin modelo registrado'.
 */
export function resolvePrimaryModel(trade: Trade): PrimaryEntryModel {
  if (!trade.pdArrays || trade.pdArrays.length === 0) {
    return 'Sin modelo registrado';
  }
  for (const item of trade.pdArrays) {
    if ((PRIMARY_ENTRY_MODELS as readonly string[]).includes(item)) {
      return item as PrimaryEntryModel;
    }
  }
  return 'Sin modelo registrado';
}

/**
 * Resolves operational window without fabricating false precision.
 * For window-based trades, honors the recorded operationalWindow.
 * For exact-time trades, classifies using the NY wall-clock entry time.
 */
export function resolveOperationalWindow(trade: Trade): {
  window: 'window_1' | 'window_2' | 'outside';
  isExact: boolean;
} {
  if (trade.timePrecision === 'window') {
    if (trade.operationalWindow === 'window_2') {
      return { window: 'window_2', isExact: false };
    }
    if (trade.operationalWindow === 'window_1') {
      return { window: 'window_1', isExact: false };
    }
    return { window: 'outside', isExact: false };
  }
  const classified = classifyOperationalTimeWindow(trade.entryDate);
  return { window: classified, isExact: true };
}

export type DurationBucket =
  | '< 15 min'
  | '15–30 min'
  | '30–60 min'
  | '> 60 min'
  | 'Sin duración registrada';

/**
 * Classifies trade duration in minutes into discrete buckets.
 * Missing or null durations are categorized as 'Sin duración registrada', NEVER as 0 min.
 */
export function resolveDurationBucket(durationMinutes?: number | null): DurationBucket {
  if (
    durationMinutes === null ||
    durationMinutes === undefined ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes < 0
  ) {
    return 'Sin duración registrada';
  }
  if (durationMinutes < 15) return '< 15 min';
  if (durationMinutes <= 30) return '15–30 min';
  if (durationMinutes <= 60) return '30–60 min';
  return '> 60 min';
}

/**
 * Calculates standardized mathematical and R-Multiple metrics for a cohort of trades.
 * Excludes conflicted trades (hasDataConflict === true).
 * Excludes unrecorded R trades (rUnrecorded === true) from R-Multiple averages/expectancy.
 */
export function calculateCohortMetrics(
  key: string,
  label: string,
  category: EdgeCohortMetrics['category'],
  trades: readonly Trade[]
): EdgeCohortMetrics {
  const validTrades = trades.filter(isTradeIncludedInAggregates);
  const totalTrades = validTrades.length;
  const wins = validTrades.filter((t) => t.status === 'Win');
  const losses = validTrades.filter((t) => t.status === 'Loss');
  const winsCount = wins.length;
  const lossesCount = losses.length;
  const winRate =
    totalTrades > 0 ? Number(((winsCount / totalTrades) * 100).toFixed(1)) : 0;

  const rTrades = validTrades.filter(hasValidRMultiple);
  const rSampleSize = rTrades.length;

  let totalR = 0;
  let avgR = 0;
  let expectancyR = 0;
  let profitFactorR: number | null = null;
  let avgWinR = 0;
  let avgLossR = 0;
  let maxDrawdownR = 0;

  if (rSampleSize > 0) {
    const rWins = rTrades.filter((t) => t.rMultiple > 0);
    const rLosses = rTrades.filter((t) => t.rMultiple < 0);
    const sumWinR = rWins.reduce((acc, t) => acc + t.rMultiple, 0);
    const sumLossR = Math.abs(rLosses.reduce((acc, t) => acc + t.rMultiple, 0));

    avgWinR = rWins.length > 0 ? Number((sumWinR / rWins.length).toFixed(2)) : 0;
    avgLossR = rLosses.length > 0 ? Number((sumLossR / rLosses.length).toFixed(2)) : 0;

    const winProbability = rWins.length / rSampleSize;
    const lossProbability = rLosses.length / rSampleSize;
    expectancyR = Number(((winProbability * avgWinR) - (lossProbability * avgLossR)).toFixed(2));

    profitFactorR =
      sumLossR === 0
        ? sumWinR > 0
          ? null // infinite
          : 0
        : Number((sumWinR / sumLossR).toFixed(2));

    totalR = Number(rTrades.reduce((acc, t) => acc + t.rMultiple, 0).toFixed(2));
    avgR = Number((totalR / rSampleSize).toFixed(2));

    // Calculate max drawdown in R sequentially
    const sortedRTrades = [...rTrades].sort(
      (a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id)
    );
    let peakR = 0;
    let runningR = 0;
    let maxDDR = 0;
    for (const t of sortedRTrades) {
      runningR += t.rMultiple;
      if (runningR > peakR) {
        peakR = runningR;
      }
      const currentDD = peakR - runningR;
      if (currentDD > maxDDR) {
        maxDDR = currentDD;
      }
    }
    maxDrawdownR = Number(maxDDR.toFixed(2));
  }

  const isSmallSample = totalTrades < 10;
  let confidenceWarning: string | undefined;
  if (totalTrades === 0) {
    confidenceWarning = 'Sin operaciones registradas para este criterio.';
  } else if (totalTrades < 5) {
    confidenceWarning = `Muestra muy reducida (n=${totalTrades}) — no estadísticamente significativa.`;
  } else if (totalTrades < 10) {
    confidenceWarning = `Muestra pequeña (n=${totalTrades}) — interpretar con cautela.`;
  }

  return {
    key,
    label,
    category,
    totalTrades,
    winsCount,
    lossesCount,
    winRate,
    rSampleSize,
    totalR,
    avgR,
    expectancyR,
    profitFactorR,
    maxDrawdownR,
    avgWinR,
    avgLossR,
    isSmallSample,
    confidenceWarning,
    tradeIds: validTrades.map((t) => t.id),
  };
}

/**
 * Filter trades by date range, symbol, model, and operational window.
 * Strictly excludes conflicted trades.
 */
export function filterAnalyticsTrades(
  trades: readonly Trade[],
  filters: AnalyticsFilters
): Trade[] {
  return trades.filter((t) => {
    if (t.hasDataConflict) return false;

    if (filters.symbol && filters.symbol !== 'All') {
      if (t.symbol.trim().toUpperCase() !== filters.symbol.trim().toUpperCase()) {
        return false;
      }
    }

    if (filters.model && filters.model !== 'All') {
      const primary = resolvePrimaryModel(t);
      if (primary !== filters.model) return false;
    }

    if (filters.window && filters.window !== 'All') {
      const { window } = resolveOperationalWindow(t);
      if (window !== filters.window) return false;
    }

    if (filters.sourceType && filters.sourceType !== 'All') {
      const src = t.sourceType || 'unclassified';
      if (src !== filters.sourceType) return false;
    }

    const tradeDate = extractNyDateKey(t.entryDate) || t.entryDate.slice(0, 10);
    if (filters.dateFrom && tradeDate < filters.dateFrom) return false;
    if (filters.dateTo && tradeDate > filters.dateTo) return false;

    return true;
  });
}

/**
 * Model comparison: Breaker Block vs Key Level (and other single-primary cohorts).
 * Enforces rule: single primary model per trade, no double counting.
 * Issues warning when sample size is insufficient to proclaim a superior model.
 */
export function calculateModelComparison(
  trades: readonly Trade[]
): ModelComparisonResult {
  const validTrades = trades.filter(isTradeIncludedInAggregates);

  const bbTrades = validTrades.filter((t) => resolvePrimaryModel(t) === 'Breaker Block');
  const klTrades = validTrades.filter((t) => resolvePrimaryModel(t) === 'Key Level');
  const bprTrades = validTrades.filter((t) => resolvePrimaryModel(t) === 'BPR (Balanced Price Range)');
  const unclassifiedTrades = validTrades.filter((t) => resolvePrimaryModel(t) === 'Sin modelo registrado');

  const breakerBlock = calculateCohortMetrics('breaker_block', 'Breaker Block', 'model', bbTrades);
  const keyLevel = calculateCohortMetrics('key_level', 'Key Level', 'model', klTrades);
  const bpr = calculateCohortMetrics('bpr', 'BPR (Balanced Price Range)', 'model', bprTrades);
  const unclassified = calculateCohortMetrics('unclassified_model', 'Sin modelo registrado', 'model', unclassifiedTrades);

  const otherModels = [bpr, unclassified].filter((m) => m.totalTrades > 0);
  const allCohorts = [breakerBlock, keyLevel, ...otherModels];

  // Statistical confidence and objective comparison: requires >= 10 trades with known R
  const hasSufficientData =
    breakerBlock.rSampleSize >= 10 && keyLevel.rSampleSize >= 10;
  let verdictDescription = '';
  let leaderLabel: string | undefined;

  if (breakerBlock.totalTrades === 0 && keyLevel.totalTrades === 0) {
    verdictDescription =
      'Sin operaciones registradas para Breaker Block o Key Level en la muestra seleccionada.';
  } else if (breakerBlock.rSampleSize === 0 && keyLevel.rSampleSize === 0) {
    verdictDescription =
      'Sin operaciones con R conocido para evaluar y comparar expectativas matemáticas.';
  } else if (!hasSufficientData) {
    verdictDescription = `Muestra insuficiente de operaciones con R conocido para evaluar expectativa matemática y concluir ventaja estadística (Breaker Block n_R=${breakerBlock.rSampleSize}, Key Level n_R=${keyLevel.rSampleSize}). Se requiere un mínimo de 10 operaciones con R por cohorte.`;
  } else {
    // Both have >= 10 trades with known R: compare expectancy
    if (breakerBlock.expectancyR > keyLevel.expectancyR) {
      leaderLabel = 'Breaker Block';
      verdictDescription = `Breaker Block muestra mayor expectativa matemática (${breakerBlock.expectancyR > 0 ? '+' : ''}${breakerBlock.expectancyR}R vs ${keyLevel.expectancyR > 0 ? '+' : ''}${keyLevel.expectancyR}R de Key Level) con n_R=${breakerBlock.rSampleSize} trades evaluados.`;
    } else if (keyLevel.expectancyR > breakerBlock.expectancyR) {
      leaderLabel = 'Key Level';
      verdictDescription = `Key Level muestra mayor expectativa matemática (${keyLevel.expectancyR > 0 ? '+' : ''}${keyLevel.expectancyR}R vs ${breakerBlock.expectancyR > 0 ? '+' : ''}${breakerBlock.expectancyR}R de Breaker Block) con n_R=${keyLevel.rSampleSize} trades evaluados.`;
    } else {
      verdictDescription = `Ambos modelos presentan expectativa matemática idéntica (${breakerBlock.expectancyR}R) en la muestra evaluada (n_R=${breakerBlock.rSampleSize}).`;
    }
  }

  return {
    breakerBlock,
    keyLevel,
    otherModels,
    allCohorts,
    verdict: {
      hasSufficientData,
      leaderLabel,
      description: verdictDescription,
    },
  };
}

/**
 * Window comparison: 09:30–10:35 NY vs 10:35–11:00 NY vs outside.
 * Accurately tracks exact vs window precision without fabricating timestamps.
 */
export function calculateWindowComparison(
  trades: readonly Trade[]
): WindowComparisonResult {
  const validTrades = trades.filter(isTradeIncludedInAggregates);

  const w1Trades: Trade[] = [];
  const w2Trades: Trade[] = [];
  const outsideTrades: Trade[] = [];

  let exactTimeCount = 0;
  let windowTimeCount = 0;

  for (const t of validTrades) {
    const { window, isExact } = resolveOperationalWindow(t);
    if (isExact) exactTimeCount++;
    else windowTimeCount++;

    if (window === 'window_1') w1Trades.push(t);
    else if (window === 'window_2') w2Trades.push(t);
    else outsideTrades.push(t);
  }

  const window1 = calculateCohortMetrics(
    'window_1',
    'Apertura NY (09:30–10:35)',
    'window',
    w1Trades
  );
  const window2 = calculateCohortMetrics(
    'window_2',
    'Media Mañana NY (10:35–11:00)',
    'window',
    w2Trades
  );
  const outside = calculateCohortMetrics(
    'outside',
    'Fuera de Ventana Operativa',
    'window',
    outsideTrades
  );

  return {
    window1,
    window2,
    outside,
    exactTimeCount,
    windowTimeCount,
    allCohorts: [window1, window2, outside],
  };
}

/**
 * Calculates cohorts by duration in minutes.
 * Ensures trades without duration appear in 'Sin duración registrada' rather than 0 min.
 */
export function calculateDurationBreakdown(
  trades: readonly Trade[]
): EdgeCohortMetrics[] {
  const validTrades = trades.filter(isTradeIncludedInAggregates);
  const buckets: Record<DurationBucket, Trade[]> = {
    '< 15 min': [],
    '15–30 min': [],
    '30–60 min': [],
    '> 60 min': [],
    'Sin duración registrada': [],
  };

  for (const t of validTrades) {
    const b = resolveDurationBucket(t.durationMinutes);
    buckets[b].push(t);
  }

  const order: DurationBucket[] = [
    '< 15 min',
    '15–30 min',
    '30–60 min',
    '> 60 min',
    'Sin duración registrada',
  ];

  return order.map((b) =>
    calculateCohortMetrics(`duration_${b.replace(/\s+/g, '_')}`, b, 'duration', buckets[b])
  );
}

/**
 * Calculates cohorts by weekday (Lunes a Viernes, plus Fin de Semana if present).
 */
export function calculateWeekdayBreakdown(
  trades: readonly Trade[]
): EdgeCohortMetrics[] {
  const validTrades = trades.filter(isTradeIncludedInAggregates);
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const buckets: Record<string, Trade[]> = {
    Lunes: [],
    Martes: [],
    Miércoles: [],
    Jueves: [],
    Viernes: [],
  };
  const weekendTrades: Trade[] = [];

  for (const t of validTrades) {
    const dateKey = extractNyDateKey(t.entryDate) || t.entryDate.slice(0, 10);
    const [year, month, day] = dateKey.split('-').map(Number);
    if (!year || !month || !day) continue;
    const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const name = dayNames[utcDay];

    if (utcDay === 0 || utcDay === 6) {
      weekendTrades.push(t);
    } else if (buckets[name]) {
      buckets[name].push(t);
    }
  }

  const result: EdgeCohortMetrics[] = [
    calculateCohortMetrics('day_1', 'Lunes', 'weekday', buckets['Lunes']),
    calculateCohortMetrics('day_2', 'Martes', 'weekday', buckets['Martes']),
    calculateCohortMetrics('day_3', 'Miércoles', 'weekday', buckets['Miércoles']),
    calculateCohortMetrics('day_4', 'Jueves', 'weekday', buckets['Jueves']),
    calculateCohortMetrics('day_5', 'Viernes', 'weekday', buckets['Viernes']),
  ];

  if (weekendTrades.length > 0) {
    result.push(
      calculateCohortMetrics('day_weekend', 'Fin de Semana (Histórico)', 'weekday', weekendTrades)
    );
  }

  return result;
}

/**
 * Calculates cohorts by active trading asset / symbol.
 */
export function calculateSymbolBreakdown(
  trades: readonly Trade[]
): EdgeCohortMetrics[] {
  const validTrades = trades.filter(isTradeIncludedInAggregates);
  const symbols = Array.from(new Set(validTrades.map((t) => t.symbol.trim().toUpperCase()))).sort();

  return symbols.map((sym) => {
    const symTrades = validTrades.filter((t) => t.symbol.trim().toUpperCase() === sym);
    return calculateCohortMetrics(`sym_${sym}`, sym, 'symbol', symTrades);
  });
}

/**
 * Calculates cohorts by psychological and contextual tags.
 */
export function calculatePsychologyBreakdown(
  trades: readonly Trade[]
): EdgeCohortMetrics[] {
  const validTrades = trades.filter(isTradeIncludedInAggregates);
  const predefinedTags: PsychologyTag[] = [
    'A+ Alineado al Contexto HTF',
    'Contra Contexto Mayor',
    'Entrada Anticipada (Antes de 9:30)',
    'FOMO (Perseguir Precio)',
    'Revenge Trade',
    'Overtrading',
    'Regla Violada (Cerrado antes de TP/SL)',
    'Sin clasificar',
  ];

  const encounteredTags = new Set<string>();
  for (const t of validTrades) {
    if (t.psychologyTag && t.psychologyTag.trim()) {
      encounteredTags.add(t.psychologyTag.trim());
    } else {
      encounteredTags.add('Sin clasificar');
    }
  }

  const allTags = [
    ...predefinedTags.filter((t) => encounteredTags.has(t)),
    ...Array.from(encounteredTags).filter((t) => !predefinedTags.includes(t as PsychologyTag)),
  ];

  return allTags.map((tag) => {
    const tagTrades = validTrades.filter((t) => {
      const actual = t.psychologyTag?.trim() || 'Sin clasificar';
      return actual === tag;
    });
    return calculateCohortMetrics(`psy_${tag.replace(/\s+/g, '_')}`, tag, 'psychology', tagTrades);
  });
}


export interface EnvironmentDelta {
  winRateDelta: number; // real.winRate - backtest.winRate
  expectancyRDelta: number; // real.expectancyR - backtest.expectancyR
  avgRDelta: number; // real.avgR - backtest.avgR
  drawdownRDelta: number; // (real.maxDrawdownR ?? 0) - (backtest.maxDrawdownR ?? 0)
  profitFactorDelta: number | null;
  sampleRatio: number; // real.totalTrades / backtest.totalTrades
}

export interface BacktestVsRealModelComparison {
  model: PrimaryEntryModel;
  realCohort: EdgeCohortMetrics;
  backtestCohort: EdgeCohortMetrics;
  hasData: boolean;
  hasSufficientData: boolean;
  delta: {
    winRateDelta: number;
    expectancyRDelta: number;
    drawdownRDelta: number;
  };
}

export interface BacktestVsRealWindowComparison {
  windowKey: 'window_1' | 'window_2' | 'outside';
  windowLabel: string;
  realCohort: EdgeCohortMetrics;
  backtestCohort: EdgeCohortMetrics;
  hasData: boolean;
  hasSufficientData: boolean;
}

export interface BacktestVsRealSymbolComparison {
  symbol: string;
  realCohort: EdgeCohortMetrics;
  backtestCohort: EdgeCohortMetrics;
  hasData: boolean;
  hasSufficientData: boolean;
}

export interface BacktestVsRealComparisonResult {
  realCohort: EdgeCohortMetrics;
  backtestCohort: EdgeCohortMetrics;
  demoCohort: EdgeCohortMetrics;
  unclassifiedCohort: EdgeCohortMetrics;
  delta: EnvironmentDelta;
  verdict: {
    hasSufficientData: boolean;
    status: 'optimal' | 'degraded' | 'insufficient_sample' | 'no_data';
    title: string;
    description: string;
  };
  modelComparisons: BacktestVsRealModelComparison[];
  windowComparisons: BacktestVsRealWindowComparison[];
  symbolComparisons: BacktestVsRealSymbolComparison[];
  allCohorts: EdgeCohortMetrics[];
}

/**
 * Compares Backtesting vs Real operational performance without mixing populations.
 * Assesses Win Rate, Expectancy in R, Drawdown in R, and sample size sufficiency.
 */
export function calculateBacktestVsRealComparison(
  trades: readonly Trade[]
): BacktestVsRealComparisonResult {
  const validTrades = trades.filter(isTradeIncludedInAggregates);

  const realTrades = validTrades.filter((t) => t.sourceType === 'real');
  const backtestTrades = validTrades.filter((t) => t.sourceType === 'backtest');
  const demoTrades = validTrades.filter((t) => t.sourceType === 'demo');
  const unclassifiedTrades = validTrades.filter(
    (t) => !t.sourceType || t.sourceType === 'unclassified'
  );

  const realCohort = calculateCohortMetrics(
    'env_real',
    'Real (Capital en Vivo)',
    'environment',
    realTrades
  );
  const backtestCohort = calculateCohortMetrics(
    'env_backtest',
    'Backtesting (Simulado)',
    'environment',
    backtestTrades
  );
  const demoCohort = calculateCohortMetrics(
    'env_demo',
    'Demo',
    'environment',
    demoTrades
  );
  const unclassifiedCohort = calculateCohortMetrics(
    'env_unclassified',
    'Sin clasificar (Histórico)',
    'environment',
    unclassifiedTrades
  );

  const winRateDelta = Number((realCohort.winRate - backtestCohort.winRate).toFixed(1));
  const expectancyRDelta = Number(
    (realCohort.expectancyR - backtestCohort.expectancyR).toFixed(2)
  );
  const avgRDelta = Number((realCohort.avgR - backtestCohort.avgR).toFixed(2));
  const drawdownRDelta = Number(
    ((realCohort.maxDrawdownR ?? 0) - (backtestCohort.maxDrawdownR ?? 0)).toFixed(2)
  );

  const profitFactorDelta =
    realCohort.profitFactorR !== null && backtestCohort.profitFactorR !== null
      ? Number((realCohort.profitFactorR - backtestCohort.profitFactorR).toFixed(2))
      : null;

  const sampleRatio =
    backtestCohort.totalTrades > 0
      ? Number((realCohort.totalTrades / backtestCohort.totalTrades).toFixed(2))
      : 0;

  const delta: EnvironmentDelta = {
    winRateDelta,
    expectancyRDelta,
    avgRDelta,
    drawdownRDelta,
    profitFactorDelta,
    sampleRatio,
  };

  // Statistical confidence evaluation (N_R >= 10 in both environments)
  const hasSufficientData =
    realCohort.rSampleSize >= 10 && backtestCohort.rSampleSize >= 10;
  let verdictStatus: 'optimal' | 'degraded' | 'insufficient_sample' | 'no_data' =
    'insufficient_sample';
  let verdictTitle = '';
  let verdictDescription = '';

  if (realCohort.totalTrades === 0 && backtestCohort.totalTrades === 0) {
    verdictStatus = 'no_data';
    verdictTitle = 'Sin operaciones para comparar';
    verdictDescription =
      'No se registran operaciones en Real ni en Backtesting en la muestra actual.';
  } else if (!hasSufficientData) {
    verdictStatus = 'insufficient_sample';
    verdictTitle = 'Muestra preliminar (datos limitados para comparación)';
    verdictDescription = `Registros actuales con R: Real n_R=${realCohort.rSampleSize}, Backtesting n_R=${backtestCohort.rSampleSize}. Se requieren al menos 10 operaciones por entorno para trazar una comparación descriptiva inicial. Todo dato actual es referencial.`;
  } else {
    // Both have >= 10 trades with valid R - provide a descriptive, preliminary diagnosis without over-claiming statistical certainty
    if (expectancyRDelta >= 0) {
      verdictStatus = 'optimal';
      verdictTitle = 'Diagnóstico descriptivo preliminar: expectativa alineada';
      verdictDescription = `En la muestra registrada (Real n_R=${realCohort.rSampleSize}, Backtesting n_R=${backtestCohort.rSampleSize}), la expectativa en Real es de ${realCohort.expectancyR > 0 ? '+' : ''}${realCohort.expectancyR}R frente a ${backtestCohort.expectancyR > 0 ? '+' : ''}${backtestCohort.expectancyR}R en Backtesting (delta: ${expectancyRDelta > 0 ? '+' : ''}${expectancyRDelta}R; delta Max DD: ${drawdownRDelta > 0 ? '+' : ''}${drawdownRDelta}R). Corresponde a una comparación descriptiva preliminar sujeta a la ampliación de la muestra.`;
    } else {
      verdictStatus = 'degraded';
      verdictTitle = 'Diagnóstico descriptivo preliminar: menor expectativa en Real';
      verdictDescription = `En la muestra registrada (Real n_R=${realCohort.rSampleSize}, Backtesting n_R=${backtestCohort.rSampleSize}), la expectativa en Real registra ${realCohort.expectancyR > 0 ? '+' : ''}${realCohort.expectancyR}R frente a ${backtestCohort.expectancyR > 0 ? '+' : ''}${backtestCohort.expectancyR}R en Backtesting (diferencia: ${expectancyRDelta}R; delta Max DD: ${drawdownRDelta > 0 ? '+' : ''}${drawdownRDelta}R). Lectura preliminar descriptiva orientada a auditar la fidelidad de ejecución.`;
    }
  }

  // Model comparisons (Breaker Block, Key Level, BPR)
  const modelsToCompare: PrimaryEntryModel[] = [
    'Breaker Block',
    'Key Level',
    'BPR (Balanced Price Range)',
  ];
  const modelComparisons: BacktestVsRealModelComparison[] = modelsToCompare.map((model) => {
    const realMTrades = realTrades.filter((t) => resolvePrimaryModel(t) === model);
    const btMTrades = backtestTrades.filter((t) => resolvePrimaryModel(t) === model);
    const rC = calculateCohortMetrics(`bvr_real_${model}`, `${model} (Real)`, 'model', realMTrades);
    const bC = calculateCohortMetrics(`bvr_bt_${model}`, `${model} (Backtest)`, 'model', btMTrades);
    return {
      model,
      realCohort: rC,
      backtestCohort: bC,
      hasData: rC.totalTrades > 0 || bC.totalTrades > 0,
      hasSufficientData: rC.rSampleSize >= 10 && bC.rSampleSize >= 10,
      delta: {
        winRateDelta: Number((rC.winRate - bC.winRate).toFixed(1)),
        expectancyRDelta: Number((rC.expectancyR - bC.expectancyR).toFixed(2)),
        drawdownRDelta: Number(((rC.maxDrawdownR ?? 0) - (bC.maxDrawdownR ?? 0)).toFixed(2)),
      },
    };
  });

  // Window comparisons
  const windowKeys: Array<'window_1' | 'window_2' | 'outside'> = [
    'window_1',
    'window_2',
    'outside',
  ];
  const windowLabels = {
    window_1: '09:30–10:35 NY (Ventana 1)',
    window_2: '10:35–11:00 NY (Ventana 2)',
    outside: 'Fuera de Ventana NY',
  };
  const windowComparisons: BacktestVsRealWindowComparison[] = windowKeys.map((wKey) => {
    const realWTrades = realTrades.filter((t) => resolveOperationalWindow(t).window === wKey);
    const btWTrades = backtestTrades.filter((t) => resolveOperationalWindow(t).window === wKey);
    const rC = calculateCohortMetrics(`bvr_real_win_${wKey}`, `${windowLabels[wKey]} (Real)`, 'window', realWTrades);
    const bC = calculateCohortMetrics(`bvr_bt_win_${wKey}`, `${windowLabels[wKey]} (Backtest)`, 'window', btWTrades);
    return {
      windowKey: wKey,
      windowLabel: windowLabels[wKey],
      realCohort: rC,
      backtestCohort: bC,
      hasData: rC.totalTrades > 0 || bC.totalTrades > 0,
      hasSufficientData: rC.rSampleSize >= 10 && bC.rSampleSize >= 10,
    };
  });

  // Symbol comparisons
  const symbols = Array.from(
    new Set([
      ...realTrades.map((t) => t.symbol.trim().toUpperCase()),
      ...backtestTrades.map((t) => t.symbol.trim().toUpperCase()),
    ])
  ).sort();
  const symbolComparisons: BacktestVsRealSymbolComparison[] = symbols.map((sym) => {
    const realSTrades = realTrades.filter((t) => t.symbol.trim().toUpperCase() === sym);
    const btSTrades = backtestTrades.filter((t) => t.symbol.trim().toUpperCase() === sym);
    const rC = calculateCohortMetrics(`bvr_real_sym_${sym}`, `${sym} (Real)`, 'symbol', realSTrades);
    const bC = calculateCohortMetrics(`bvr_bt_sym_${sym}`, `${sym} (Backtest)`, 'symbol', btSTrades);
    return {
      symbol: sym,
      realCohort: rC,
      backtestCohort: bC,
      hasData: rC.totalTrades > 0 || bC.totalTrades > 0,
      hasSufficientData: rC.rSampleSize >= 10 && bC.rSampleSize >= 10,
    };
  });

  return {
    realCohort,
    backtestCohort,
    demoCohort,
    unclassifiedCohort,
    delta,
    verdict: {
      hasSufficientData,
      status: verdictStatus,
      title: verdictTitle,
      description: verdictDescription,
    },
    modelComparisons,
    windowComparisons,
    symbolComparisons,
    allCohorts: [realCohort, backtestCohort, demoCohort, unclassifiedCohort],
  };
}
