import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runMonteCarloSimulation,
  filterMonteCarloTrades,
  createMulberry32,
  calculatePercentile,
  normalizeSeed,
  MIN_MONTE_CARLO_SAMPLE_SIZE,
} from '../src/services/monte-carlo-service.ts';

function createMockTrade(overrides = {}) {
  return {
    id: `trade-${Math.random().toString(36).substring(2, 9)}`,
    symbol: 'NQ',
    direction: 'Long',
    entryDate: '2026-10-15T09:45:00',
    entryPrice: 19850,
    exitPrice: 19900,
    stopLoss: 19800,
    takeProfit: 19950,
    size: 1,
    grossPnl: 1000,
    commission: 4,
    netPnl: 996,
    plannedRR: 2,
    rMultiple: 2,
    status: 'Win',
    killzone: 'NY Open 09:30 AM (09:30-10:30)',
    pdArrays: ['Breaker Block'],
    checklistCompleted: [],
    setupGrade: 'A+',
    dailyBias: 'Bullish',
    dolTarget: 'Prev High',
    timeframe: '5m',
    followedPlan: true,
    psychologyTag: 'A+ Alineado al Contexto HTF',
    accountId: 'acc-1',
    sourceType: 'real',
    hasDataConflict: false,
    rUnrecorded: false,
    ...overrides,
  };
}

test('1. PRNG determinista: Mulberry32 produce secuencias 100% idénticas con la misma semilla', () => {
  const seed = 12345;
  const rng1 = createMulberry32(seed);
  const rng2 = createMulberry32(seed);

  const seq1 = Array.from({ length: 10 }, () => rng1());
  const seq2 = Array.from({ length: 10 }, () => rng2());

  assert.deepEqual(seq1, seq2);
  assert.equal(seq1.length, 10);
  assert.ok(seq1.every((v) => v >= 0 && v < 1));

  // Diferente semilla produce secuencias distintas
  const rng3 = createMulberry32(99999);
  const seq3 = Array.from({ length: 10 }, () => rng3());
  assert.notDeepEqual(seq1, seq3);
});

test('2. Reproducibilidad Monte Carlo: mismos parámetros y semilla generan métricas idénticas al 100%', () => {
  // Generar 25 operaciones con R variado
  const trades = Array.from({ length: 25 }, (_, i) =>
    createMockTrade({
      id: `t-${i}`,
      rMultiple: i % 2 === 0 ? 2.5 : -1.0,
      sourceType: 'real',
    })
  );

  const config = {
    environment: 'real',
    model: 'All',
    horizon: 50,
    iterations: 500,
    seed: 42,
  };

  const sim1 = runMonteCarloSimulation(trades, config);
  const sim2 = runMonteCarloSimulation(trades, config);

  assert.equal(sim1.status, 'success');
  assert.equal(sim2.status, 'success');

  // Comprobar que los resultados son idénticos
  assert.equal(sim1.metrics.cumulativeR.p5, sim2.metrics.cumulativeR.p5);
  assert.equal(sim1.metrics.cumulativeR.p50, sim2.metrics.cumulativeR.p50);
  assert.equal(sim1.metrics.cumulativeR.p95, sim2.metrics.cumulativeR.p95);
  assert.equal(sim1.metrics.maxDrawdownR.p50, sim2.metrics.maxDrawdownR.p50);
  assert.equal(sim1.metrics.maxDrawdownR.worst, sim2.metrics.maxDrawdownR.worst);
  assert.equal(sim1.metrics.maxLossStreak.p95, sim2.metrics.maxLossStreak.p95);
  assert.deepEqual(sim1.trajectory, sim2.trajectory);
  assert.deepEqual(sim1.distribution, sim2.distribution);
});

test('3. Cambio de semilla genera trayectorias estocásticas distintas pero coherentes', () => {
  const trades = Array.from({ length: 30 }, (_, i) =>
    createMockTrade({
      id: `t-${i}`,
      rMultiple: (i % 3 === 0) ? 3.0 : (i % 3 === 1) ? -1.0 : 1.5,
      sourceType: 'real',
    })
  );

  const configA = { environment: 'real', model: 'All', horizon: 50, iterations: 300, seed: 101 };
  const configB = { environment: 'real', model: 'All', horizon: 50, iterations: 300, seed: 202 };

  const simA = runMonteCarloSimulation(trades, configA);
  const simB = runMonteCarloSimulation(trades, configB);

  assert.equal(simA.status, 'success');
  assert.equal(simB.status, 'success');

  // Ambas deben tener las mismas estadísticas muestrales de origen
  assert.equal(simA.sampleStats.winRate, simB.sampleStats.winRate);
  assert.equal(simA.sampleStats.expectancyR, simB.sampleStats.expectancyR);

  // Pero los percentiles estocásticos de trayectoria deben diferir ligeramente
  assert.notEqual(simA.trajectory[50].p50, simB.trajectory[50].p50);
});

test('4. Umbral de tamaño muestral: < 20 operaciones retorna insufficient_data sin generar simulaciones engañosas', () => {
  // 19 operaciones (justo debajo del límite de 20)
  const trades19 = Array.from({ length: 19 }, (_, i) =>
    createMockTrade({ id: `t-${i}`, rMultiple: 2.0, sourceType: 'real' })
  );

  const result19 = runMonteCarloSimulation(trades19, {
    environment: 'real',
    model: 'All',
    horizon: 50,
    iterations: 500,
    seed: 42,
  });

  assert.equal(result19.status, 'insufficient_data');
  assert.equal(result19.sampleSize, 19);
  assert.equal(result19.minRequired, 20);
  assert.ok(result19.reason.includes('Se requiere un mínimo de 20 operaciones'));
  assert.ok(result19.sampleNotice.includes('mínimo operativo de visualización técnica'));

  // 20 operaciones (exactamente en el umbral mínimo)
  const trades20 = Array.from({ length: 20 }, (_, i) =>
    createMockTrade({ id: `t-${i}`, rMultiple: i % 2 === 0 ? 2 : -1, sourceType: 'real' })
  );

  const result20 = runMonteCarloSimulation(trades20, {
    environment: 'real',
    model: 'All',
    horizon: 50,
    iterations: 500,
    seed: 42,
  });

  assert.equal(result20.status, 'success');
  assert.equal(result20.sampleSize, 20);
  assert.equal(result20.metrics.cumulativeR.p50 !== undefined, true);
});

test('5. Segregación estricta por entorno: no combina operaciones de Real con Backtesting, Demo ni Unclassified', () => {
  const mixedTrades = [
    ...Array.from({ length: 25 }, (_, i) => createMockTrade({ id: `real-${i}`, rMultiple: 2.0, sourceType: 'real' })),
    ...Array.from({ length: 15 }, (_, i) => createMockTrade({ id: `bt-${i}`, rMultiple: 5.0, sourceType: 'backtest' })),
    ...Array.from({ length: 10 }, (_, i) => createMockTrade({ id: `demo-${i}`, rMultiple: -1.0, sourceType: 'demo' })),
    ...Array.from({ length: 5 }, (_, i) => createMockTrade({ id: `uncl-${i}`, rMultiple: 1.0, sourceType: 'unclassified' })),
  ];

  // Simular solo Real
  const realRes = runMonteCarloSimulation(mixedTrades, {
    environment: 'real',
    model: 'All',
    horizon: 50,
    iterations: 500,
    seed: 42,
  });
  assert.equal(realRes.status, 'success');
  assert.equal(realRes.sampleSize, 25);
  // El sample de Real tiene 100% de operaciones de +2.0R, no contaminado con los 5.0R de backtest ni -1.0R de demo
  assert.equal(realRes.sampleStats.avgWinR, 2.0);
  assert.equal(realRes.sampleStats.winRate, 100);

  // Simular Backtest (tiene solo 15 ops -> debe dar insuficiente_data)
  const btRes = runMonteCarloSimulation(mixedTrades, {
    environment: 'backtest',
    model: 'All',
    horizon: 50,
    iterations: 500,
    seed: 42,
  });
  assert.equal(btRes.status, 'insufficient_data');
  assert.equal(btRes.sampleSize, 15);
});

test('6. Integridad de datos: excluye operaciones con hasDataConflict=true y rUnrecorded=true', () => {
  const trades = [
    // 15 válidas
    ...Array.from({ length: 15 }, (_, i) => createMockTrade({ id: `valid-${i}`, rMultiple: 2.0, sourceType: 'real' })),
    // 5 con conflicto de datos
    ...Array.from({ length: 5 }, (_, i) => createMockTrade({ id: `conf-${i}`, rMultiple: 3.0, hasDataConflict: true, sourceType: 'real' })),
    // 5 con R sin registrar
    ...Array.from({ length: 5 }, (_, i) => createMockTrade({ id: `unrec-${i}`, rMultiple: 0, rUnrecorded: true, sourceType: 'real' })),
  ];

  const res = runMonteCarloSimulation(trades, {
    environment: 'real',
    model: 'All',
    horizon: 50,
    iterations: 500,
    seed: 42,
  });

  // Solo deben considerarse las 15 válidas, resultando en datos insuficientes (< 20)
  assert.equal(res.status, 'insufficient_data');
  assert.equal(res.sampleSize, 15);
  assert.equal(res.totalCohortTrades, 25);
});

test('7. Cálculo riguroso de Drawdown en R y rachas de pérdidas', () => {
  // Población conocida: 10 operaciones de -1R y 10 operaciones de +2R
  const trades = [
    ...Array.from({ length: 10 }, (_, i) => createMockTrade({ id: `l-${i}`, rMultiple: -1.0, sourceType: 'real' })),
    ...Array.from({ length: 10 }, (_, i) => createMockTrade({ id: `w-${i}`, rMultiple: 2.0, sourceType: 'real' })),
  ];

  const res = runMonteCarloSimulation(trades, {
    environment: 'real',
    model: 'All',
    horizon: 50,
    iterations: 1000,
    seed: 777,
  });

  assert.equal(res.status, 'success');
  // Drawdown siempre es no-negativo
  assert.ok(res.metrics.maxDrawdownR.p50 >= 0);
  assert.ok(res.metrics.maxDrawdownR.worst >= res.metrics.maxDrawdownR.p95);
  assert.ok(res.metrics.maxDrawdownR.p95 >= res.metrics.maxDrawdownR.p50);

  // Rachas de pérdidas son enteros positivos
  assert.ok(res.metrics.maxLossStreak.p50 >= 1);
  assert.ok(res.metrics.maxLossStreak.worst >= res.metrics.maxLossStreak.p95);
});

test('8. Segregación por modelo operativo (Breaker Block vs Key Level) sin doble conteo', () => {
  const trades = [
    // 22 con Breaker Block
    ...Array.from({ length: 22 }, (_, i) => createMockTrade({
      id: `bb-${i}`,
      pdArrays: ['Breaker Block', 'Key Level'], // resolvePrimaryModel da prioridad al primero: Breaker Block
      rMultiple: 2.5,
      sourceType: 'real',
    })),
    // 15 con Key Level exclusivo
    ...Array.from({ length: 15 }, (_, i) => createMockTrade({
      id: `kl-${i}`,
      pdArrays: ['Key Level'],
      rMultiple: 1.5,
      sourceType: 'real',
    })),
  ];

  // Simulación filtrada por Breaker Block
  const bbRes = runMonteCarloSimulation(trades, {
    environment: 'real',
    model: 'Breaker Block',
    horizon: 50,
    iterations: 500,
    seed: 42,
  });
  assert.equal(bbRes.status, 'success');
  assert.equal(bbRes.sampleSize, 22);
  assert.equal(bbRes.sampleStats.avgWinR, 2.5);

  // Simulación filtrada por Key Level (15 ops -> insuficiente)
  const klRes = runMonteCarloSimulation(trades, {
    environment: 'real',
    model: 'Key Level',
    horizon: 50,
    iterations: 500,
    seed: 42,
  });
  assert.equal(klRes.status, 'insufficient_data');
  assert.equal(klRes.sampleSize, 15);
});

test('9. No asume capital monetario: todas las métricas de percentiles se expresan en R', () => {
  const trades = Array.from({ length: 24 }, (_, i) =>
    createMockTrade({
      id: `t-${i}`,
      rMultiple: i % 3 === 0 ? 3.0 : -1.0,
      sourceType: 'real',
    })
  );

  const res = runMonteCarloSimulation(trades, {
    environment: 'real',
    model: 'All',
    horizon: 50,
    iterations: 500,
    seed: 42,
  });

  assert.equal(res.status, 'success');
  // Asegurar que no hay propiedades de capital o saldo monetario asumido
  assert.equal('ruinProbabilityUsd' in res.metrics, false);
  assert.equal('initialCapital' in res.config, false);
  assert.equal(typeof res.metrics.cumulativeR.p50, 'number');
  assert.equal(typeof res.metrics.maxDrawdownR.p50, 'number');
});

test('10. Funciones auxiliares: normalizeSeed, calculatePercentile, filterMonteCarloTrades y MIN_SAMPLE_SIZE', () => {
  assert.equal(MIN_MONTE_CARLO_SAMPLE_SIZE, 20);

  // normalizeSeed
  assert.equal(normalizeSeed(42), 42);
  assert.equal(normalizeSeed('42'), 42);
  assert.equal(normalizeSeed(''), 42);
  assert.equal(normalizeSeed(null), 42);
  assert.ok(normalizeSeed('custom-seed-key') > 0);

  // calculatePercentile interpolación lineal
  const values = [10, 20, 30, 40, 50];
  assert.equal(calculatePercentile(values, 0), 10);
  assert.equal(calculatePercentile(values, 50), 30);
  assert.equal(calculatePercentile(values, 100), 50);
  assert.equal(calculatePercentile(values, 25), 20);

  // filterMonteCarloTrades
  const testTrades = [
    createMockTrade({ id: 't1', sourceType: 'real', rMultiple: 2 }),
    createMockTrade({ id: 't2', sourceType: 'real', hasDataConflict: true }),
    createMockTrade({ id: 't3', sourceType: 'backtest', rMultiple: 3 }),
  ];
  const filtered = filterMonteCarloTrades(testTrades, 'real', 'All');
  assert.equal(filtered.validTrades.length, 1);
  assert.equal(filtered.totalCohortTrades, 2);
});
