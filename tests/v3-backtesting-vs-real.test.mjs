import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateCohortMetrics,
  calculateBacktestVsRealComparison,
} from '../src/services/edge-analytics-service.ts';
import {
  createInitialTradeFormState,
  resolveTradeFormSubmission,
} from '../src/services/trade-form-service.ts';
import {
  parseTradingViewCSV,
  generateTradeDeduplicationKey,
} from '../src/services/storage-service.ts';
import { mapTrade, tradeToRow } from '../src/services/cloud-sync-service.ts';

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
    psychologyTag: 'A+ Disciplinado',
    accountId: 'acc-1',
    timePrecision: 'exact',
    calculationMode: 'unrecorded',
    hasDataConflict: false,
    rUnrecorded: false,
    durationMinutes: 20,
    sourceType: 'real',
    ...overrides,
  };
}

test('1. Preservación histórica: las operaciones legacy sin source_type se mapean a unclassified sin asumir que son reales', () => {
  // Legacy Supabase row without source_type or with null
  const legacyRow = {
    id: 'row-legacy-1',
    user_id: 'usr-1',
    account_id: 'acc-1',
    symbol: 'NAS100',
    direction: 'Long',
    entry_date: '2026-09-01T09:35:00Z',
    entry_price: 19500,
    exit_price: 19600,
    net_pnl: 250,
    status: 'Win',
    r_multiple: 2,
    source_type: null, // or undefined
  };

  const mappedTrade = mapTrade(legacyRow);
  assert.equal(
    mappedTrade.sourceType,
    'unclassified',
    'Las operaciones históricas sin clasificar deben asignarse a "unclassified" y nunca asumirse reales'
  );

  // Conversion back to row preserves source_type
  const backToRow = tradeToRow(mappedTrade, 'usr-1');
  assert.equal(backToRow.source_type, 'unclassified');
});

test('2. Formulario: createInitialTradeFormState respeta el sourceType existente y asigna real a nuevas operaciones', () => {
  // Editing existing backtest trade
  const existingBacktestTrade = makeTrade({
    sourceType: 'backtest',
    notes: 'Prueba en backtesting',
  });
  const formStateBacktest = createInitialTradeFormState(existingBacktestTrade);
  assert.equal(formStateBacktest.sourceType, 'backtest');

  // Editing existing unclassified trade
  const existingUnclassifiedTrade = makeTrade({
    sourceType: 'unclassified',
  });
  const formStateUnclassified = createInitialTradeFormState(existingUnclassifiedTrade);
  assert.equal(formStateUnclassified.sourceType, 'unclassified');

  // New trade from scratch
  const newFormState = createInitialTradeFormState();
  assert.equal(newFormState.sourceType, 'real', 'Las nuevas operaciones registradas manualmente por defecto son real');

  // Submission preserves or updates sourceType
  const resolved = resolveTradeFormSubmission(
    {
      ...newFormState,
      symbol: 'NQ',
      direction: 'Long',
      entryDate: '2026-10-31T09:35',
      sourceType: 'demo',
    },
    null,
    'acc-1'
  );

  assert.equal(resolved.payload?.sourceType, 'demo');
});

test('3. Deduplicación e importación de CSV de Backtesting', () => {
  const csvContent = `Date,Symbol,Side,Entry Price,Exit Price,R-Multiple,Result,Net PnL
2026-10-15 09:32,NAS100,Long,20100,20200,2,Win,200
2026-10-15 10:40,US500,Short,5800,5820,-1,Loss,-100
2026-10-15 09:32,NAS100,Long,20100,20200,2,Win,200`; // Duplicate row in CSV

  const existingTrade = makeTrade({
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2026-10-15T09:32:00.000Z',
    entryPrice: 20100,
    exitPrice: 20200,
    sourceType: 'backtest',
  });

  // First import: should parse and assign backtest sourceType
  const importedFirstTime = parseTradingViewCSV(csvContent, 'acc-1', 'backtest');
  assert.equal(importedFirstTime.length, 2, 'Debe ignorar el trade duplicado dentro del mismo CSV');
  assert.equal(importedFirstTime[0].sourceType, 'backtest');
  assert.equal(importedFirstTime[1].sourceType, 'backtest');

  // Second import providing existing trades: should deduplicate against existing
  const importedWithExisting = parseTradingViewCSV(csvContent, 'acc-1', 'backtest', [existingTrade]);
  // Row 1 matches existingTrade, Row 2 is new, Row 3 is duplicate of Row 1
  assert.equal(importedWithExisting.length, 1, 'Debe descartar operaciones ya existentes en el registro');
  assert.equal(importedWithExisting[0].symbol, 'US500');

  // Verify deduplication key stability
  const key1 = generateTradeDeduplicationKey(existingTrade);
  const key2 = generateTradeDeduplicationKey({
    symbol: 'nas100 ',
    direction: 'long',
    entryDate: '2026-10-15T09:32:00.000Z',
    entryPrice: 20100,
    exitPrice: 20200,
    sourceType: 'backtest',
  });
  assert.equal(key1, key2, 'El hash de deduplicación debe ser insensible a mayúsculas y espacios');
});

test('4. Cálculo riguroso de Max Drawdown en R dentro de calculateCohortMetrics', () => {
  // Sequence of R results: +2, -1, -1, -1, +3, -1, +1
  // Cumulative R:
  // t0: 0
  // t1 (+2): cum=2, peak=2, dd=0
  // t2 (-1): cum=1, peak=2, dd=1
  // t3 (-1): cum=0, peak=2, dd=2
  // t4 (-1): cum=-1, peak=2, dd=3 (peak 2 - cum -1 = 3)
  // t5 (+3): cum=2, peak=2, dd=0
  // t6 (-1): cum=1, peak=2, dd=1
  // Max DD = 3R
  const trades = [
    makeTrade({ entryDate: '2026-10-01T09:35', rMultiple: 2, status: 'Win' }),
    makeTrade({ entryDate: '2026-10-02T09:35', rMultiple: -1, status: 'Loss' }),
    makeTrade({ entryDate: '2026-10-03T09:35', rMultiple: -1, status: 'Loss' }),
    makeTrade({ entryDate: '2026-10-04T09:35', rMultiple: -1, status: 'Loss' }),
    makeTrade({ entryDate: '2026-10-05T09:35', rMultiple: 3, status: 'Win' }),
    makeTrade({ entryDate: '2026-10-06T09:35', rMultiple: -1, status: 'Loss' }),
  ];

  const metrics = calculateCohortMetrics('test-dd', 'Test DD', 'model', trades);
  assert.equal(metrics.maxDrawdownR, 3, 'El Max Drawdown en R debe ser exactamente 3R');
});

test('5. calculateBacktestVsRealComparison segrega correctamente Real vs Backtesting sin contaminación', () => {
  const realTrades = [
    makeTrade({ id: 'r1', sourceType: 'real', rMultiple: 2, status: 'Win' }),
    makeTrade({ id: 'r2', sourceType: 'real', rMultiple: -1, status: 'Loss' }),
    makeTrade({ id: 'r3', sourceType: 'real', rMultiple: 3, status: 'Win' }),
  ];

  const backtestTrades = [
    makeTrade({ id: 'b1', sourceType: 'backtest', rMultiple: 2, status: 'Win' }),
    makeTrade({ id: 'b2', sourceType: 'backtest', rMultiple: 2, status: 'Win' }),
    makeTrade({ id: 'b3', sourceType: 'backtest', rMultiple: -1, status: 'Loss' }),
    makeTrade({ id: 'b4', sourceType: 'backtest', rMultiple: 1.5, status: 'Win' }),
  ];

  const demoTrades = [
    makeTrade({ id: 'd1', sourceType: 'demo', rMultiple: 1, status: 'Win' }),
  ];

  const legacyTrades = [
    makeTrade({ id: 'l1', sourceType: 'unclassified', rMultiple: 1, status: 'Win' }),
  ];

  const allTrades = [...realTrades, ...backtestTrades, ...demoTrades, ...legacyTrades];

  const comparison = calculateBacktestVsRealComparison(allTrades);

  // Separation check
  assert.equal(comparison.realCohort.totalTrades, 3);
  assert.equal(comparison.backtestCohort.totalTrades, 4);
  assert.equal(comparison.demoCohort.totalTrades, 1);
  assert.equal(comparison.unclassifiedCohort.totalTrades, 1);

  // Real win rate: 2 wins of 3 = 66.7%
  assert.equal(comparison.realCohort.winRate, 66.7);
  // Backtest win rate: 3 wins of 4 = 75.0%
  assert.equal(comparison.backtestCohort.winRate, 75);

  // Win rate delta: 66.7 - 75 = -8.3%
  assert.equal(comparison.delta.winRateDelta, -8.3);
  assert.equal(comparison.delta.sampleRatio, 0.75);
});

test('6. Diagnóstico de muestra: advierte insuficiencia cuando N_R < 10 y valida concordancia cuando N_R >= 10', () => {
  // Case A: Small sample (N_R < 10)
  const smallReal = Array.from({ length: 5 }, () =>
    makeTrade({ sourceType: 'real', rMultiple: 2, status: 'Win' })
  );
  const smallBT = Array.from({ length: 6 }, () =>
    makeTrade({ sourceType: 'backtest', rMultiple: 2, status: 'Win' })
  );

  const compSmall = calculateBacktestVsRealComparison([...smallReal, ...smallBT]);
  assert.equal(compSmall.verdict.hasSufficientData, false);
  assert.equal(compSmall.verdict.status, 'insufficient_sample');
  assert.match(compSmall.verdict.description, /mínimo de 10 operaciones/i);

  // Case B: Sufficient sample (N_R = 10 each) with high concordance
  const largeReal = Array.from({ length: 10 }, (_, i) =>
    makeTrade({ sourceType: 'real', rMultiple: i < 6 ? 2 : -1, status: i < 6 ? 'Win' : 'Loss' })
  );
  const largeBT = Array.from({ length: 10 }, (_, i) =>
    makeTrade({ sourceType: 'backtest', rMultiple: i < 6 ? 2 : -1, status: i < 6 ? 'Win' : 'Loss' })
  );

  const compLarge = calculateBacktestVsRealComparison([...largeReal, ...largeBT]);
  assert.equal(compLarge.verdict.hasSufficientData, true);
  assert.equal(compLarge.verdict.status, 'optimal');
  assert.match(compLarge.verdict.title, /Alta concordancia/i);
});

test('7. Desglose por modelo y ventana operativa en Backtesting vs Real sin doble conteo', () => {
  const trades = [
    // Breaker Block Real
    makeTrade({ sourceType: 'real', pdArrays: ['Breaker Block'], rMultiple: 2, status: 'Win', entryDate: '2026-10-24T09:35:00' }),
    // Breaker Block Backtest
    makeTrade({ sourceType: 'backtest', pdArrays: ['Breaker Block'], rMultiple: 2, status: 'Win', entryDate: '2026-10-24T09:35:00' }),
    // Key Level Real
    makeTrade({ sourceType: 'real', pdArrays: ['Key Level'], rMultiple: -1, status: 'Loss', entryDate: '2026-10-24T10:40:00' }),
    // Key Level Backtest
    makeTrade({ sourceType: 'backtest', pdArrays: ['Key Level'], rMultiple: 2, status: 'Win', entryDate: '2026-10-24T10:40:00' }),
  ];

  const comparison = calculateBacktestVsRealComparison(trades);

  // Breaker Block comparison
  const bbComp = comparison.modelComparisons.find((m) => m.model === 'Breaker Block');
  assert.ok(bbComp, 'Debe incluir Breaker Block');
  assert.equal(bbComp.realCohort.totalTrades, 1);
  assert.equal(bbComp.backtestCohort.totalTrades, 1);
  assert.equal(bbComp.delta.winRateDelta, 0);

  // Window 1 comparison (09:35 is window_1)
  const w1Comp = comparison.windowComparisons.find((w) => w.windowKey === 'window_1');
  assert.ok(w1Comp);
  assert.equal(w1Comp.realCohort.totalTrades, 1);
  assert.equal(w1Comp.backtestCohort.totalTrades, 1);

  // Window 2 comparison (10:40 is window_2)
  const w2Comp = comparison.windowComparisons.find((w) => w.windowKey === 'window_2');
  assert.ok(w2Comp);
  assert.equal(w2Comp.realCohort.totalTrades, 1);
  assert.equal(w2Comp.backtestCohort.totalTrades, 1);
});

test('8. Migración SQL V3: integridad, no destructividad y valor por defecto unclassified', () => {
  const migrationPath = path.resolve('supabase/migrations/20261101140000_v3_backtesting_vs_real.sql');
  assert.ok(fs.existsSync(migrationPath), 'El archivo de migración V3 debe existir');

  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /add column if not exists source_type/i, 'La columna debe ser agregada con if not exists');
  assert.match(sql, /default\s+'unclassified'/i, 'El valor por defecto debe ser "unclassified"');
  assert.match(sql, /'real',\s*'demo',\s*'backtest',\s*'unclassified'/i, 'Check constraint debe incluir los 4 entornos válidos');
  assert.match(sql, /create index if not exists idx_trades_source_type/i, 'Debe crear un índice para queries eficientes');
});
