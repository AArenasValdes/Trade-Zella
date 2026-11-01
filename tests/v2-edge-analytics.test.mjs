import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePrimaryModel,
  resolveOperationalWindow,
  resolveDurationBucket,
  calculateCohortMetrics,
  calculateModelComparison,
  calculateWindowComparison,
  calculateDurationBreakdown,
  calculateWeekdayBreakdown,
  calculateSymbolBreakdown,
  calculatePsychologyBreakdown,
  filterAnalyticsTrades,
} from '../src/services/edge-analytics-service.ts';

// Helper to craft mock trades
function makeTrade(overrides = {}) {
  return {
    id: 'tr-' + Math.random().toString(36).slice(2, 8),
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2026-10-24T09:35:00',
    entryPrice: 20000,
    exitPrice: 20100,
    stopLoss: 19950,
    takeProfit: 20100,
    size: 1,
    grossPnl: 100,
    commission: 0,
    netPnl: 100,
    plannedRR: 2,
    rMultiple: 2,
    status: 'Win',
    killzone: 'NY Open 09:30 AM (09:30-10:30)',
    pdArrays: ['Breaker Block'],
    checklistCompleted: [],
    setupGrade: 'A+',
    dailyBias: 'Bullish',
    dolTarget: 'High Diario',
    timeframe: '5m',
    followedPlan: true,
    psychologyTag: 'A+ Alineado al Contexto HTF',
    accountId: 'acc-1',
    timePrecision: 'exact',
    calculationMode: 'unrecorded',
    hasDataConflict: false,
    rUnrecorded: false,
    durationMinutes: 25,
    ...overrides,
  };
}

test('1. resolvePrimaryModel selecciona un único modelo principal sin duplicación respetando el primer registrado', () => {
  // Trade with Key Level registered first, followed by Breaker Block
  const multiTradeKL = makeTrade({
    pdArrays: ['Key Level', 'Breaker Block', 'FVG (Fair Value Gap)'],
  });
  // Should resolve to Key Level because it is the first primary model in pdArrays
  assert.equal(resolvePrimaryModel(multiTradeKL), 'Key Level');

  // Trade with Breaker Block registered first, followed by Key Level
  const multiTradeBB = makeTrade({
    pdArrays: ['Breaker Block', 'Key Level', 'FVG (Fair Value Gap)'],
  });
  assert.equal(resolvePrimaryModel(multiTradeBB), 'Breaker Block');

  // Trade with other confluences preceding the primary model
  const klTrade = makeTrade({
    pdArrays: ['Liquidity Sweep (BSL/SSL)', 'Key Level'],
  });
  assert.equal(resolvePrimaryModel(klTrade), 'Key Level');

  // Trade with only BPR
  const bprTrade = makeTrade({
    pdArrays: ['BPR (Balanced Price Range)'],
  });
  assert.equal(resolvePrimaryModel(bprTrade), 'BPR (Balanced Price Range)');

  // Trade with other confluences but no entry model
  const otherTrade = makeTrade({
    pdArrays: ['Order Block (+OB / -OB)', 'FVG (Fair Value Gap)'],
  });
  assert.equal(resolvePrimaryModel(otherTrade), 'Sin modelo registrado');

  // Trade with empty pdArrays
  const emptyTrade = makeTrade({ pdArrays: [] });
  assert.equal(resolvePrimaryModel(emptyTrade), 'Sin modelo registrado');
});

test('2. resolveDurationBucket clasifica correctamente y trata datos faltantes como Sin registrar, nunca 0', () => {
  assert.equal(resolveDurationBucket(10), '< 15 min');
  assert.equal(resolveDurationBucket(15), '15–30 min');
  assert.equal(resolveDurationBucket(30), '15–30 min');
  assert.equal(resolveDurationBucket(45), '30–60 min');
  assert.equal(resolveDurationBucket(60), '30–60 min');
  assert.equal(resolveDurationBucket(90), '> 60 min');

  // Missing values
  assert.equal(resolveDurationBucket(null), 'Sin duración registrada');
  assert.equal(resolveDurationBucket(undefined), 'Sin duración registrada');
  assert.equal(resolveDurationBucket(-5), 'Sin duración registrada');
});

test('3. resolveOperationalWindow respeta timePrecision=window sin inferir horas ficticias', () => {
  // Window precision trade
  const windowTrade = makeTrade({
    timePrecision: 'window',
    operationalWindow: 'window_2',
    entryDate: '2026-10-24T10:35:00',
  });
  const resWin = resolveOperationalWindow(windowTrade);
  assert.equal(resWin.isExact, false);
  assert.equal(resWin.window, 'window_2');

  // Exact precision trade at 09:32
  const exactTrade1 = makeTrade({
    timePrecision: 'exact',
    entryDate: '2026-10-24T09:32:00',
  });
  const resExact1 = resolveOperationalWindow(exactTrade1);
  assert.equal(resExact1.isExact, true);
  assert.equal(resExact1.window, 'window_1');

  // Exact precision trade at 10:45
  const exactTrade2 = makeTrade({
    timePrecision: 'exact',
    entryDate: '2026-10-24T10:45:00',
  });
  const resExact2 = resolveOperationalWindow(exactTrade2);
  assert.equal(resExact2.isExact, true);
  assert.equal(resExact2.window, 'window_2');

  // Exact trade outside window (e.g. 13:30)
  const exactTradeOutside = makeTrade({
    timePrecision: 'exact',
    entryDate: '2026-10-24T13:30:00',
  });
  const resOutside = resolveOperationalWindow(exactTradeOutside);
  assert.equal(resOutside.window, 'outside');
});

test('4. calculateCohortMetrics excluye hasDataConflict=true y excluye rUnrecorded=true de cálculos R', () => {
  const trades = [
    makeTrade({ id: 't1', status: 'Win', rMultiple: 2, rUnrecorded: false }),
    makeTrade({ id: 't2', status: 'Loss', rMultiple: -1, rUnrecorded: false }),
    makeTrade({ id: 't3', status: 'Win', rMultiple: 0, rUnrecorded: true }), // R unrecorded
    makeTrade({ id: 't4', status: 'Win', rMultiple: 10, hasDataConflict: true }), // Conflicted -> completely excluded
  ];

  const metrics = calculateCohortMetrics('test', 'Test Cohort', 'model', trades);

  // Total valid trades participating: t1, t2, t3 (t4 excluded due to conflict)
  assert.equal(metrics.totalTrades, 3);
  assert.equal(metrics.winsCount, 2);
  assert.equal(metrics.lossesCount, 1);
  assert.equal(metrics.winRate, 66.7);

  // rSampleSize should be 2 (t1 and t2 only; t3 is rUnrecorded)
  assert.equal(metrics.rSampleSize, 2);
  assert.equal(metrics.totalR, 1.0); // 2 + (-1) = 1.0
  assert.equal(metrics.avgR, 0.5); // 1.0 / 2 = 0.5
  assert.equal(metrics.avgWinR, 2.0);
  assert.equal(metrics.avgLossR, 1.0);
  // Expectancy: (1/2 * 2.0) - (1/2 * 1.0) = 1.0 - 0.5 = 0.50R
  assert.equal(metrics.expectancyR, 0.5);
  // Profit factor R: 2 / 1 = 2.0
  assert.equal(metrics.profitFactorR, 2.0);

  // Small sample flag
  assert.equal(metrics.isSmallSample, true);
  assert.match(metrics.confidenceWarning, /Muestra muy reducida/);
});

test('5. calculateModelComparison no proclama superioridad con muestra pequeña (< 10 trades con R)', () => {
  const trades = [
    // 3 Breaker Block trades (all wins)
    makeTrade({ pdArrays: ['Breaker Block'], status: 'Win', rMultiple: 2 }),
    makeTrade({ pdArrays: ['Breaker Block'], status: 'Win', rMultiple: 2 }),
    makeTrade({ pdArrays: ['Breaker Block'], status: 'Win', rMultiple: 2 }),
    // 2 Key Level trades (1 win, 1 loss)
    makeTrade({ pdArrays: ['Key Level'], status: 'Win', rMultiple: 3 }),
    makeTrade({ pdArrays: ['Key Level'], status: 'Loss', rMultiple: -1 }),
  ];

  const comparison = calculateModelComparison(trades);

  assert.equal(comparison.breakerBlock.totalTrades, 3);
  assert.equal(comparison.breakerBlock.rSampleSize, 3);
  assert.equal(comparison.breakerBlock.winRate, 100);
  assert.equal(comparison.keyLevel.totalTrades, 2);
  assert.equal(comparison.keyLevel.rSampleSize, 2);
  assert.equal(comparison.keyLevel.winRate, 50);

  // Must NOT proclaim Breaker Block as statistically superior due to small sample
  assert.equal(comparison.verdict.hasSufficientData, false);
  assert.equal(comparison.verdict.leaderLabel, undefined);
  assert.match(comparison.verdict.description, /Muestra insuficiente de operaciones con R conocido/);

  // When trades have totalTrades >= 10 but rSampleSize < 10 (e.g. rUnrecorded)
  const tradesWithUnrecorded = [
    ...Array(10).fill(null).map(() => makeTrade({ pdArrays: ['Breaker Block'], status: 'Win', rUnrecorded: true })),
    ...Array(10).fill(null).map(() => makeTrade({ pdArrays: ['Key Level'], status: 'Win', rMultiple: 2 })),
  ];
  const comparisonUnrecorded = calculateModelComparison(tradesWithUnrecorded);
  assert.equal(comparisonUnrecorded.breakerBlock.totalTrades, 10);
  assert.equal(comparisonUnrecorded.breakerBlock.rSampleSize, 0);
  assert.equal(comparisonUnrecorded.verdict.hasSufficientData, false);
  assert.equal(comparisonUnrecorded.verdict.leaderLabel, undefined);
});

test('6. filterAnalyticsTrades filtra estrictamente por fecha, símbolo, modelo y ventana', () => {
  const trades = [
    makeTrade({ symbol: 'NAS100', pdArrays: ['Breaker Block'], entryDate: '2026-10-20T09:35:00' }),
    makeTrade({ symbol: 'NQ1!', pdArrays: ['Key Level'], entryDate: '2026-10-21T10:40:00' }),
    makeTrade({ symbol: 'NAS100', pdArrays: ['Key Level'], entryDate: '2026-10-22T09:40:00' }),
    makeTrade({ symbol: 'NAS100', pdArrays: ['Breaker Block'], entryDate: '2026-10-23T14:00:00', hasDataConflict: true }),
  ];

  // Filter by symbol NAS100
  const symFiltered = filterAnalyticsTrades(trades, {
    dateFrom: '',
    dateTo: '',
    symbol: 'NAS100',
    model: 'All',
    window: 'All',
  });
  // Should include 2 trades (4th trade excluded due to conflict)
  assert.equal(symFiltered.length, 2);

  // Filter by model Key Level
  const modelFiltered = filterAnalyticsTrades(trades, {
    dateFrom: '',
    dateTo: '',
    symbol: 'All',
    model: 'Key Level',
    window: 'All',
  });
  assert.equal(modelFiltered.length, 2);

  // Filter by date range 2026-10-21 to 2026-10-22
  const dateFiltered = filterAnalyticsTrades(trades, {
    dateFrom: '2026-10-21',
    dateTo: '2026-10-22',
    symbol: 'All',
    model: 'All',
    window: 'All',
  });
  assert.equal(dateFiltered.length, 2);
});

test('7. calculateWindowComparison agrupa 09:30–10:35 vs 10:35–11:00 vs fuera de ventana', () => {
  const trades = [
    makeTrade({ timePrecision: 'exact', entryDate: '2026-10-20T09:32:00', rMultiple: 2, status: 'Win' }),
    makeTrade({ timePrecision: 'window', operationalWindow: 'window_1', entryDate: '2026-10-20T09:30:00', rMultiple: 2, status: 'Win' }),
    makeTrade({ timePrecision: 'exact', entryDate: '2026-10-20T10:40:00', rMultiple: -1, status: 'Loss' }),
    makeTrade({ timePrecision: 'exact', entryDate: '2026-10-20T14:00:00', rMultiple: 1, status: 'Win' }),
  ];

  const windows = calculateWindowComparison(trades);
  assert.equal(windows.window1.totalTrades, 2);
  assert.equal(windows.window1.winsCount, 2);
  assert.equal(windows.window2.totalTrades, 1);
  assert.equal(windows.window2.lossesCount, 1);
  assert.equal(windows.outside.totalTrades, 1);
  assert.equal(windows.exactTimeCount, 3);
  assert.equal(windows.windowTimeCount, 1);
});

test('8. desgloses por duración, día de la semana, símbolo y psicología', () => {
  const trades = [
    makeTrade({ durationMinutes: 10, symbol: 'NAS100', entryDate: '2026-10-19T09:35:00', psychologyTag: 'Paciencia', rMultiple: 2, status: 'Win' }),
    makeTrade({ durationMinutes: 45, symbol: 'ES', entryDate: '2026-10-20T09:40:00', psychologyTag: 'FOMO (Perseguir Precio)', rMultiple: -1, status: 'Loss' }),
    makeTrade({ durationMinutes: null, symbol: 'NAS100', entryDate: '2026-10-21T10:00:00', psychologyTag: null, rMultiple: 1.5, status: 'Win' }),
  ];

  const durationBreakdown = calculateDurationBreakdown(trades);
  assert.equal(durationBreakdown.find((b) => b.label === '< 15 min')?.totalTrades, 1);
  assert.equal(durationBreakdown.find((b) => b.label === '30–60 min')?.totalTrades, 1);
  assert.equal(durationBreakdown.find((b) => b.label === 'Sin duración registrada')?.totalTrades, 1);

  const weekdayBreakdown = calculateWeekdayBreakdown(trades);
  assert.equal(weekdayBreakdown.find((b) => b.label === 'Lunes')?.totalTrades, 1);
  assert.equal(weekdayBreakdown.find((b) => b.label === 'Martes')?.totalTrades, 1);

  const symbolBreakdown = calculateSymbolBreakdown(trades);
  assert.equal(symbolBreakdown.find((b) => b.label === 'NAS100')?.totalTrades, 2);
  assert.equal(symbolBreakdown.find((b) => b.label === 'ES')?.totalTrades, 1);

  const psychologyBreakdown = calculatePsychologyBreakdown(trades);
  assert.equal(psychologyBreakdown.find((b) => b.label === 'Paciencia')?.totalTrades, 1);
  assert.equal(psychologyBreakdown.find((b) => b.label === 'FOMO (Perseguir Precio)')?.totalTrades, 1);
  assert.equal(psychologyBreakdown.find((b) => b.label === 'Sin clasificar')?.totalTrades, 1);
});
