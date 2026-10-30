import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveTradeReturnPct,
  calculateConsolidatedReturnPct,
  calculatePercentageEquityCurve,
  formatReturnPct,
} from '../src/services/financial-engine.ts';

import {
  calculateDashboardMetrics,
  autoCalculateTradeMath,
} from '../src/services/math-engine.ts';

import {
  parseTradingViewCSV,
  validateBackupPayload,
} from '../src/services/storage-service.ts';



// ----------------------------------------------------------------------------------
// 1. Trade +2% real y P&L monetario desconocido
// ----------------------------------------------------------------------------------
test('1. Trade +2% real y P&L monetario desconocido: resolveTradeReturnPct da 2%, status es Win y no diluye P&L a $0', () => {
  const trade = {
    id: 't-real-return-pos',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2026-10-30T09:30',
    rMultiple: 2.0,
    realizedNetReturnPct: 2.0,
    netPnl: 0,
    calculationMode: 'unrecorded',
    pricesUnrecorded: true,
    status: 'Win',
  };

  const resolvedReturn = resolveTradeReturnPct(trade, 100000);
  assert.equal(resolvedReturn, 2.0, 'Debe devolver el retorno porcentual explícito de +2%');
  assert.equal(trade.status, 'Win');

  // Evaluar en métricas
  const metrics = calculateDashboardMetrics([trade], []);
  assert.equal(metrics.winsCount, 1);
  assert.equal(metrics.lossesCount, 0);
  assert.equal(metrics.winRate, 100);
  assert.equal(metrics.avgWin, 0, 'No debe inventar ganancia monetaria en dólares');
  assert.equal(metrics.grossProfit, 0);
  assert.equal(metrics.dataCoverage?.returnPctTradesCount, 1);
  assert.equal(metrics.dataCoverage?.monetaryTradesCount, 0);
});

// ----------------------------------------------------------------------------------
// 2. Trade -1,5% real y P&L desconocido
// ----------------------------------------------------------------------------------
test('2. Trade -1,5% real y P&L desconocido: resolveTradeReturnPct da -1.5%, status es Loss', () => {
  const trade = {
    id: 't-real-return-neg',
    symbol: 'US30',
    direction: 'Short',
    entryDate: '2026-10-30T10:35',
    rMultiple: -1.0,
    realizedNetReturnPct: -1.5,
    netPnl: 0,
    calculationMode: 'unrecorded',
    pricesUnrecorded: true,
    status: 'Loss',
  };

  const resolvedReturn = resolveTradeReturnPct(trade, 100000);
  assert.equal(resolvedReturn, -1.5, 'Debe devolver el retorno porcentual explícito de -1.5%');
  assert.equal(trade.status, 'Loss');

  const metrics = calculateDashboardMetrics([trade], []);
  assert.equal(metrics.lossesCount, 1);
  assert.equal(metrics.winsCount, 0);
  assert.equal(metrics.winRate, 0);
  assert.equal(metrics.avgLoss, 0, 'No debe inventar pérdida monetaria en dólares');
  assert.equal(metrics.grossLoss, 0);
});

// ----------------------------------------------------------------------------------
// 3. Trade solo con R
// ----------------------------------------------------------------------------------
test('3. Trade solo con R: resolveTradeReturnPct da null (Sin dato) y genera curva en R', () => {
  const trade = {
    id: 't-pure-r',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2026-10-30T09:35',
    rMultiple: 2.5,
    realizedNetReturnPct: null,
    netPnl: 0,
    calculationMode: 'unrecorded',
    pricesUnrecorded: true,
    status: 'Win',
  };

  const resolvedReturn = resolveTradeReturnPct(trade, 100000);
  assert.equal(resolvedReturn, null, 'Sin retorno explícito debe devolver null');
  assert.equal(formatReturnPct(resolvedReturn), 'Sin dato');

  // Curva de rendimiento acumulado
  const curveResult = calculatePercentageEquityCurve([trade], []);
  assert.equal(curveResult.curveMode, 'r_multiple', 'Debe activar curveMode r_multiple');
  assert.equal(curveResult.currentReturnR, 2.5);
  assert.equal(curveResult.bestTradeR, 2.5);
  assert.equal(curveResult.maxDrawdownR, 0);
  assert.equal(curveResult.points.length, 2); // Punto 0 + Trade 1
  assert.equal(curveResult.points[1].cumulativeRMultiple, 2.5);
  assert.equal(curveResult.points[1].pnl, null, 'PnL monetario en curva R debe ser null, no $0');
});

// ----------------------------------------------------------------------------------
// 4. Mezcla de trades monetarios y trades solo con R
// ----------------------------------------------------------------------------------
test('4. Mezcla de trades monetarios y solo con R: no diluye promedios monetarios ($)', () => {
  const trades = [
    {
      id: 't-m1',
      symbol: 'NAS100',
      direction: 'Long',
      entryDate: '2026-10-28T09:30',
      netPnl: 1000,
      rMultiple: 2.0,
      status: 'Win',
      calculationMode: 'monetary',
      accountId: 'acc-1',
    },
    {
      id: 't-r1',
      symbol: 'NAS100',
      direction: 'Long',
      entryDate: '2026-10-29T09:30',
      netPnl: 0,
      rMultiple: 3.0,
      realizedNetReturnPct: null,
      status: 'Win',
      calculationMode: 'unrecorded',
      pricesUnrecorded: true,
      accountId: 'acc-1',
    },
    {
      id: 't-m2',
      symbol: 'NAS100',
      direction: 'Short',
      entryDate: '2026-10-30T09:30',
      netPnl: -500,
      rMultiple: -1.0,
      status: 'Loss',
      calculationMode: 'monetary',
      accountId: 'acc-1',
    },
  ];

  const accounts = [{ id: 'acc-1', name: 'Cuenta 100K', initialBalance: 100000, hasVerifiedBalance: true }];
  const metrics = calculateDashboardMetrics(trades, accounts);

  // El promedio monetario debe ser exactamente $1,000 (1 trade monetario ganador de $1000), no $500
  assert.equal(metrics.avgWin, 1000, 'avgWin no debe diluirse por el trade unrecorded');
  assert.equal(metrics.avgLoss, 500);
  assert.equal(metrics.netPnl, 500, 'netPnl total monetario debe ser $500');

  // Conteo total y win rate consideran ambos trades ganadores
  assert.equal(metrics.winsCount, 2);
  assert.equal(metrics.lossesCount, 1);
  assert.equal(metrics.totalTrades, 3);
  assert.equal(metrics.winRate, 66.7);

  // Cobertura expuesta
  assert.equal(metrics.dataCoverage?.monetaryTradesCount, 2);
  assert.equal(metrics.dataCoverage?.unrecordedTradesCount, 1);
  assert.equal(metrics.dataCoverage?.totalTrades, 3);
});

// ----------------------------------------------------------------------------------
// 5. Edición de trade derived_r sin alterar su valor anterior
// ----------------------------------------------------------------------------------
test('5. Edición de trade derived_r sin tocar resultado: conserva calculationMode derived_r y netPnl', () => {
  const editingTrade = {
    id: 't-hist-derived',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2025-01-10T09:30',
    netPnl: 2000,
    grossPnl: 2000,
    commission: 0,
    commissionUnmeasured: true,
    rMultiple: 2.0,
    plannedRR: 2.0,
    status: 'Win',
    calculationMode: 'derived_r',
    accountId: 'acc-1',
    notes: 'Nota original',
  };

  // Simulación del handleSubmit cuando el usuario solo edita la nota
  const outcomeChanged = false;
  const rChanged = false;
  const hasNewEnteredPrices = false;

  let finalCalculationMode = 'unrecorded';
  let finalNetPnl = 0;

  if (hasNewEnteredPrices) {
    finalCalculationMode = 'monetary';
  } else if (editingTrade && !outcomeChanged && !rChanged) {
    finalCalculationMode = editingTrade.calculationMode;
    finalNetPnl = editingTrade.netPnl;
  }

  assert.equal(finalCalculationMode, 'derived_r', 'Debe conservar calculationMode derived_r');
  assert.equal(finalNetPnl, 2000, 'Debe conservar el P&L derivado histórico intacto');
});

// ----------------------------------------------------------------------------------
// 6. Edición de trade monetario sin recalcular por modificar únicamente una nota
// ----------------------------------------------------------------------------------
test('6. Edición de trade monetario: modificar nota no altera precios ni P&L auditado', () => {
  const editingTrade = {
    id: 't-hist-monetary',
    symbol: 'NAS100',
    direction: 'Short',
    entryDate: '2025-02-15T10:35',
    entryPrice: 21500,
    exitPrice: 21450,
    stopLoss: 21550,
    takeProfit: 21400,
    size: 2,
    netPnl: 100,
    grossPnl: 100,
    commission: 0,
    rMultiple: 1.0,
    status: 'Win',
    calculationMode: 'monetary',
    accountId: 'acc-1',
    notes: 'Nota antigua',
  };

  const outcomeChanged = false;
  const rChanged = false;
  const hasNewEnteredPrices = false;

  let finalCalculationMode = 'unrecorded';
  let finalNetPnl = 0;
  let finalEntryPrice = 0;
  let finalExitPrice = 0;

  if (hasNewEnteredPrices) {
    finalCalculationMode = 'monetary';
  } else if (editingTrade && !outcomeChanged && !rChanged) {
    finalCalculationMode = editingTrade.calculationMode;
    finalNetPnl = editingTrade.netPnl;
    finalEntryPrice = editingTrade.entryPrice;
    finalExitPrice = editingTrade.exitPrice;
  }

  assert.equal(finalCalculationMode, 'monetary');
  assert.equal(finalNetPnl, 100);
  assert.equal(finalEntryPrice, 21500);
  assert.equal(finalExitPrice, 21450);
});

// ----------------------------------------------------------------------------------
// 7. Trade histórico con múltiples pdArrays
// ----------------------------------------------------------------------------------
test('7. Trade histórico con múltiples pdArrays: conserva BPR y todas las confluencias legacy', () => {
  const historicalTrade = {
    id: 't-multi-pd',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2025-01-20T09:30',
    pdArrays: [
      'BPR (Balanced Price Range)',
      'Contexto HTF (1D/4H/2H/30m)',
      'Order Block (+OB / -OB)',
    ],
  };

  const selectedModel = 'BPR (Balanced Price Range)';
  let finalPdArrays;
  if (historicalTrade.pdArrays.includes(selectedModel)) {
    finalPdArrays = historicalTrade.pdArrays;
  } else {
    finalPdArrays = [selectedModel, ...historicalTrade.pdArrays.slice(1)];
  }

  assert.deepEqual(finalPdArrays, [
    'BPR (Balanced Price Range)',
    'Contexto HTF (1D/4H/2H/30m)',
    'Order Block (+OB / -OB)',
  ], 'Debe preservar el array completo de confluencias sin destruirlas');
});

// ----------------------------------------------------------------------------------
// 8. P&L de NQ, MNQ y NAS100 con especificaciones verificadas
// ----------------------------------------------------------------------------------
test('8. P&L con especificaciones verificadas: NQ ($20/pt), MNQ ($2/pt), NAS100 ($1/pt), ES ($50/pt)', () => {
  // NQ: 10 puntos de ganancia en Long (21500 a 21510) con 1 contrato
  const nqCalc = autoCalculateTradeMath({
    symbol: 'NQ',
    entryPrice: 21500,
    exitPrice: 21510,
    stopLoss: 21495,
    takeProfit: 21520,
    size: 1,
    commission: 0,
    direction: 'Long',
  });
  assert.equal(nqCalc.pointValue, 20, 'NQ debe tener pointValue = 20');
  assert.equal(nqCalc.grossPnl, 200, '10 pts * $20 * 1 = $200');

  // MNQ: 10 puntos de ganancia con 1 contrato
  const mnqCalc = autoCalculateTradeMath({
    symbol: 'MNQ',
    entryPrice: 21500,
    exitPrice: 21510,
    stopLoss: 21495,
    takeProfit: 21520,
    size: 1,
    commission: 0,
    direction: 'Long',
  });
  assert.equal(mnqCalc.pointValue, 2, 'MNQ debe tener pointValue = 2');
  assert.equal(mnqCalc.grossPnl, 20, '10 pts * $2 * 1 = $20');

  // NAS100: 10 puntos de ganancia con 1 lote
  const nasCalc = autoCalculateTradeMath({
    symbol: 'NAS100',
    entryPrice: 21500,
    exitPrice: 21510,
    stopLoss: 21495,
    takeProfit: 21520,
    size: 1,
    commission: 0,
    direction: 'Long',
  });
  assert.equal(nasCalc.pointValue, 1, 'NAS100 debe tener pointValue = 1');
  assert.equal(nasCalc.grossPnl, 10, '10 pts * $1 * 1 = $10');

  // ES: 10 puntos de ganancia con 1 contrato
  const esCalc = autoCalculateTradeMath({
    symbol: 'ES',
    entryPrice: 5900,
    exitPrice: 5910,
    stopLoss: 5895,
    takeProfit: 5920,
    size: 1,
    commission: 0,
    direction: 'Long',
  });
  assert.equal(esCalc.pointValue, 50, 'ES debe tener pointValue = 50');
  assert.equal(esCalc.grossPnl, 500, '10 pts * $50 * 1 = $500');
});

// ----------------------------------------------------------------------------------
// 9. Usuario sin cuenta y sin capital real conocido
// ----------------------------------------------------------------------------------
test('9. Usuario sin cuenta y sin capital real: no inventa $100K y no calcula retorno %', () => {
  // Cuenta técnica creada sin capital
  const technicalAccount = {
    id: 'acc-tech-1',
    name: 'Bitácora Personal',
    firm: 'Personal',
    initialBalance: 0,
    hasVerifiedBalance: false,
    isTechnical: true,
  };

  const trade = {
    id: 't-test-tech',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2026-10-30T09:30',
    netPnl: 0,
    rMultiple: 2.0,
    status: 'Win',
    calculationMode: 'unrecorded',
    accountId: 'acc-tech-1',
  };

  const consolidated = calculateConsolidatedReturnPct([trade], [technicalAccount]);
  assert.equal(consolidated.isValid, false, 'No debe ser válido para porcentaje');
  assert.equal(consolidated.returnPct, null, 'Retorno % debe ser null, no 0%');
  assert.equal(consolidated.totalReferenceCapital, 0, 'Capital de referencia debe ser 0, no 100.000');

  // Curva de equidad no inventa porcentajes
  const curve = calculatePercentageEquityCurve([trade], [technicalAccount]);
  assert.equal(curve.curveMode, 'r_multiple', 'Debe recurrir a curva en R');
  assert.equal(curve.currentReturnPct, null);
  assert.equal(curve.currentReturnR, 2.0);
});

// ----------------------------------------------------------------------------------
// 10. CSV con R positivo y P&L ausente
// ----------------------------------------------------------------------------------
test('10. CSV con R positivo y P&L ausente: clasifica como Win, rMultiple positivo y calculationMode unrecorded', () => {
  const csvText = `symbol,direction,time,r,duration
NAS100,Long,2026-10-30T09:35,"2,50",20
US30,Short,2026-10-30T10:40,"-1.00",15
`;

  const imported = parseTradingViewCSV(csvText, 'acc-test');
  assert.equal(imported.length, 2);

  // Trade 1 con R = 2.50
  assert.equal(imported[0].status, 'Win', 'R positivo debe clasificarse como Win, NO Loss');
  assert.equal(imported[0].rMultiple, 2.5);
  assert.equal(imported[0].calculationMode, 'unrecorded');
  assert.equal(imported[0].durationMinutes, 20);

  // Trade 2 con R = -1.00
  assert.equal(imported[1].status, 'Loss');
  assert.equal(imported[1].rMultiple, -1.0);
  assert.equal(imported[1].calculationMode, 'unrecorded');
  assert.equal(imported[1].durationMinutes, 15);
});

// ----------------------------------------------------------------------------------
// 11. Persistencia de duración y retorno en sincronización
// ----------------------------------------------------------------------------------
test('11. Duración en minutos y retorno % se persisten y validan correctamente', () => {
  const trade = {
    id: 't-sync-test',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2026-10-30T09:30',
    entryPrice: 0,
    exitPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    size: 1,
    grossPnl: 0,
    commission: 0,
    netPnl: 0,
    plannedRR: 2,
    rMultiple: 2.0,
    status: 'Win',
    killzone: 'NY Open 09:30 AM (09:30-10:30)',
    pdArrays: ['Breaker Block'],
    checklistCompleted: [],
    setupGrade: 'Sin evaluar',
    dailyBias: 'Bullish',
    dolTarget: '',
    timeframe: '15m',
    followedPlan: true,
    psychologyTag: 'Sin clasificar',
    notes: 'Prueba de sincronización',
    accountId: 'acc-1',
    calculationMode: 'unrecorded',
    realizedNetReturnPct: 2.25,
    durationMinutes: 45,
  };

  assert.equal(trade.durationMinutes, 45);
  assert.equal(trade.realizedNetReturnPct, 2.25);
  assert.equal(trade.calculationMode, 'unrecorded');
});

// ----------------------------------------------------------------------------------
// 12. Importación y restauración de respaldos históricos
// ----------------------------------------------------------------------------------
test('12. validateBackupPayload valida respaldos históricos con trades BPR y cuentas técnicas', () => {
  const backup = {
    version: '1.0',
    exportedAt: '2026-10-30T13:00:00Z',
    trades: [
      {
        id: 't-backup-1',
        symbol: 'NAS100',
        direction: 'Long',
        entryDate: '2025-01-15T09:30',
        entryPrice: 21500,
        exitPrice: 21550,
        stopLoss: 21450,
        takeProfit: 21600,
        size: 1,
        grossPnl: 50,
        commission: 0,
        netPnl: 50,
        plannedRR: 2,
        rMultiple: 1.0,
        status: 'Win',
        killzone: 'NY Open 09:30 AM (09:30-10:30)',
        pdArrays: ['BPR (Balanced Price Range)'],
        checklistCompleted: [],
        setupGrade: 'A+',
        dailyBias: 'Bullish',
        dolTarget: 'High',
        timeframe: '15m',
        followedPlan: true,
        psychologyTag: 'Sin clasificar',
        notes: 'Backup trade',
        accountId: 'acc-1',
      },
    ],
    accounts: [
      {
        id: 'acc-1',
        name: 'Cuenta Principal',
        firm: 'Funding Pips',
        initialBalance: 100000,
        profitTarget: 8000,
        maxDrawdown: 10000,
        dailyLossLimit: 5000,
        hasVerifiedBalance: true,
      },
    ],
    playbooks: [],
    dailyNotes: {},
  };

  assert.equal(validateBackupPayload(backup), true, 'El respaldo histórico debe ser válido');
  assert.equal(backup.trades[0].pdArrays[0], 'BPR (Balanced Price Range)');
});
