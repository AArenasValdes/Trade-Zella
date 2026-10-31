import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateConsolidatedReturnPct,
  calculatePercentageEquityCurve,
  calculateAvgWinReturnPct,
} from '../src/services/financial-engine.ts';

import {
  calculateDashboardMetrics,
  autoCalculateTradeMath,
  calculateTheoreticalInstrumentPnl,
} from '../src/services/math-engine.ts';

import {
  createInitialTradeFormState,
  resolveTradeFormSubmission,
} from '../src/services/trade-form-service.ts';

import {
  parseTradingViewCSV,
  validateBackupPayload,
} from '../src/services/storage-service.ts';

import { getInstrumentSpec } from '../src/config/ict-constants.ts';

// ----------------------------------------------------------------------------------
// 1. Edición de operación perdedora histórica (SL, -1.25R, -$185.50) cambiando solo notas
// ----------------------------------------------------------------------------------
test('1. Edición de operación perdedora histórica (SL, -1.25R, -$185.50): cambiar solo notas/emoción/duración conserva cifras íntegras', () => {
  const losingHistoricalTrade = {
    id: 't-audited-sl-1',
    symbol: 'NQ',
    direction: 'Short',
    entryDate: '2025-05-12T09:35:00',
    timePrecision: 'exact',
    operationalWindow: 'window_1',
    entryPrice: 21500,
    exitPrice: 21508.55,
    stopLoss: 21508.55,
    takeProfit: 21480,
    size: 1,
    grossPnl: -171.00,
    commission: 14.50,
    commissionUnmeasured: false,
    netPnl: -185.50,
    plannedRR: 2.0,
    rMultiple: -1.25,
    status: 'Loss',
    calculationMode: 'monetary',
    pnlProvenance: 'audited',
    pricesUnrecorded: false,
    realizedNetReturnPct: -0.1855,
    durationMinutes: 12,
    killzone: 'NY Open 09:30 AM (09:30-10:30)',
    pdArrays: ['Breaker Block'],
    checklistCompleted: ['Dirección Mayor alineada en Diario (1D) y 4H'],
    setupGrade: 'B',
    dailyBias: 'Bearish',
    dolTarget: 'SSL',
    timeframe: '5m',
    followedPlan: true,
    riskPercentUsed: 1.0,
    htfAligned: ['1D', '4H'],
    psychologyTag: 'A+ Alineado al Contexto HTF',
    notes: 'Nota original del SL',
    accountId: 'acc-1',
  };

  // 1) Precarga real mediante createInitialTradeFormState (precarga Math.abs(-1.25) -> '1.25' y outcomeMode -> 'SL')
  const formState = createInitialTradeFormState(losingHistoricalTrade, '');
  assert.equal(formState.rMultiple, '1.25');
  assert.equal(formState.outcomeMode, 'SL');

  // 2) Martín modifica exclusivamente nota, emoción y duración
  formState.notes = 'Nota revisada tras cierre semanal';
  formState.psychologyTag = 'Contra Contexto Mayor';
  formState.durationMinutes = '18';

  // 3) Resolución real con resolveTradeFormSubmission
  const result = resolveTradeFormSubmission(formState, losingHistoricalTrade, 'acc-1');
  assert.equal(result.error, undefined);
  assert.equal(result.isFinancialChange, false, 'No debe detectar cambio financiero al editar nota/emoción/duración en un trade SL');
  assert.ok(result.payload);

  assert.equal(result.payload.rMultiple, -1.25, 'Debe conservar rMultiple = -1.25');
  assert.equal(result.payload.netPnl, -185.50, 'Debe conservar netPnl auditado = -$185.50');
  assert.equal(result.payload.grossPnl, -171.00, 'Debe conservar grossPnl = -$171.00');
  assert.equal(result.payload.commission, 14.50, 'Debe conservar commission = $14.50');
  assert.equal(result.payload.commissionUnmeasured, false);
  assert.equal(result.payload.calculationMode, 'monetary');
  assert.equal(result.payload.pnlProvenance, 'audited');
  assert.equal(result.payload.notes, 'Nota revisada tras cierre semanal');
  assert.equal(result.payload.psychologyTag, 'Contra Contexto Mayor');
  assert.equal(result.payload.durationMinutes, 18);
});

// ----------------------------------------------------------------------------------
// 2. Separar modificación/eliminación de realizedNetReturnPct y modificación de P&L
// ----------------------------------------------------------------------------------
test('2. Editar o limpiar realizedNetReturnPct no recalcula P&L ni comisiones y permite persistir null', () => {
  const auditedTradeWithPct = {
    id: 't-audited-pct-1',
    symbol: 'NQ',
    direction: 'Long',
    entryDate: '2025-05-10T09:30:00',
    entryPrice: 21500,
    exitPrice: 21510,
    stopLoss: 21490,
    takeProfit: 21530,
    size: 1,
    grossPnl: 200,
    commission: 14.50,
    commissionUnmeasured: false,
    netPnl: 185.50,
    plannedRR: 2.0,
    rMultiple: 1.0,
    realizedNetReturnPct: 1.85,
    status: 'Win',
    calculationMode: 'monetary',
    pnlProvenance: 'audited',
    pricesUnrecorded: false,
    killzone: 'NY Open 09:30 AM (09:30-10:30)',
    pdArrays: ['Breaker Block'],
    checklistCompleted: [],
    setupGrade: 'A+',
    dailyBias: 'Bullish',
    dolTarget: 'BSL',
    timeframe: '15m',
    followedPlan: true,
    psychologyTag: 'A+ Alineado al Contexto HTF',
    notes: 'Con porcentaje previo',
    accountId: 'acc-1',
  };

  // Caso A: Modificar realizedNetReturnPct de 1.85% a 1.92%
  const formEditPct = createInitialTradeFormState(auditedTradeWithPct, '');
  formEditPct.realizedNetReturnPct = '1.92';

  const resEdit = resolveTradeFormSubmission(formEditPct, auditedTradeWithPct, 'acc-1');
  assert.equal(resEdit.error, undefined);
  assert.equal(resEdit.isPnlExecutionChange, false, 'Editar porcentaje no es cambio de ejecución P&L');
  assert.equal(resEdit.payload.realizedNetReturnPct, 1.92);
  assert.equal(resEdit.payload.netPnl, 185.50, 'No debe recalcular netPnl ($185.50) a $200.00 teórico');
  assert.equal(resEdit.payload.grossPnl, 200);
  assert.equal(resEdit.payload.commission, 14.50, 'Debe preservar la comisión registrada ($14.50)');
  assert.equal(resEdit.payload.pnlProvenance, 'audited');

  // Caso B: Eliminar/limpiar realizedNetReturnPct ('') -> debe persistir null
  const formClearPct = createInitialTradeFormState(auditedTradeWithPct, '');
  formClearPct.realizedNetReturnPct = '';

  const resClear = resolveTradeFormSubmission(formClearPct, auditedTradeWithPct, 'acc-1');
  assert.equal(resClear.error, undefined);
  assert.equal(resClear.payload.realizedNetReturnPct, null, 'Limpiar el porcentaje debe persistir null en lugar de conservar el valor anterior');
  assert.equal(resClear.payload.netPnl, 185.50, 'Limpiar el porcentaje no debe alterar netPnl');
  assert.equal(resClear.payload.commission, 14.50);
});

// ----------------------------------------------------------------------------------
// 3. Importar CSV sin R-Multiple sin inventar +2R ni -1R
// ----------------------------------------------------------------------------------
test('3. Importar CSV con porcentaje, PnL o status pero sin R-Multiple: no inventa +2R ni -1R y no contamina expectativa en R', () => {
  const csvText = `symbol,direction,time,pnl,return %,status
NAS100,Long,2026-10-28T09:35,500,0.50,Win
US30,Short,2026-10-29T09:40,-250,-0.25,Loss
NQ,Long,2026-10-30T09:45,,,Win
`;

  const imported = parseTradingViewCSV(csvText, 'acc-1');
  assert.equal(imported.length, 3);

  // Ninguno tenía columna R ni precios con Stop Loss para calcular R:
  for (const t of imported) {
    assert.equal(t.rUnrecorded, true, `Trade ${t.symbol} sin R debe marcarse rUnrecorded=true`);
    assert.equal(t.rMultiple, 0, `Trade ${t.symbol} no debe inventar +2R ni -1R`);
    assert.equal(t.plannedRR, 0, `Trade ${t.symbol} no debe inventar plannedRR=2`);
  }

  // Combinar con un trade que SÍ tiene R-Multiple real (+1.5R)
  const tradeWithRealR = {
    ...imported[0],
    id: 't-real-r',
    rMultiple: 1.5,
    rUnrecorded: false,
  };

  const accounts = [{ id: 'acc-1', name: 'Cuenta 100K', initialBalance: 100000, hasVerifiedBalance: true }];
  const metrics = calculateDashboardMetrics([...imported, tradeWithRealR], accounts, 'acc-1');

  // La muestra en R debe ser exclusivamente 1 (el trade con R real), sin contaminarse con los 3 trades rUnrecorded
  assert.equal(metrics.rSampleSize, 1, 'Solo el trade con R medido debe entrar en rSampleSize');
  assert.equal(metrics.expectancyR, 1.5, 'La expectativa en R debe ser 1.50R sin diluirse con 0R ni inventar +2R/-1R');
  assert.equal(metrics.avgRMultiple, 1.5);
  assert.equal(metrics.dataCoverage?.unrecordedRTradesCount, 3);
  assert.equal(metrics.dataCoverage?.rMultipleTradesCount, 1);

  // Y en modo curva R (sin capital de referencia), solo traza el trade con R real
  const rCurve = calculatePercentageEquityCurve([...imported, tradeWithRealR], []);
  assert.equal(rCurve.curveMode, 'r_multiple');
  assert.equal(rCurve.includedTradesCount, 1);
  assert.equal(rCurve.excludedTradesCount, 3);
  assert.equal(rCurve.isPartialCurve, true);
  assert.equal(rCurve.currentReturnR, 1.5);
});

// ----------------------------------------------------------------------------------
// 4. Importar CSV contradictorio sin contaminar métricas ni agregados
// ----------------------------------------------------------------------------------
test('4. Importar CSV contradictorio: marca hasDataConflict=true y excluye el registro de todos los agregados hasta resolverse', () => {
  const csvText = `symbol,direction,time,r,pnl,return %,status
NAS100,Long,2026-10-28T09:35,,,,
US30,Short,2026-10-29T10:00,2.00,-150,-0.15,Loss
MNQ,Long,2026-10-30T10:35,1.50,300,0.30,Win
`;

  const parsed = parseTradingViewCSV(csvText, 'acc-1');
  // Fila 1 vacía se rechaza; Fila 2 (US30 contradictoria) y Fila 3 (MNQ válida) se importan
  assert.equal(parsed.length, 2);

  const conflictedTrade = parsed.find((t) => t.symbol === 'US30');
  const validTrade = parsed.find((t) => t.symbol === 'MNQ');

  assert.ok(conflictedTrade);
  assert.equal(conflictedTrade.hasDataConflict, true, 'El registro contradictorio debe tener hasDataConflict=true');
  assert.ok(Array.isArray(conflictedTrade.conflictReasons) && conflictedTrade.conflictReasons.length > 0);

  assert.ok(validTrade);
  assert.equal(validTrade.hasDataConflict, false);

  const accounts = [{ id: 'acc-1', name: 'Cuenta 100K', initialBalance: 100000, hasVerifiedBalance: true }];
  const metrics = calculateDashboardMetrics(parsed, accounts, 'acc-1');

  // El trade contradictorio (US30) debe estar excluido de todos los agregados:
  assert.equal(metrics.totalTrades, 1, 'Solo el trade válido debe contarse en totalTrades agregados');
  assert.equal(metrics.netPnl, 300, 'El PnL negativo del registro contradictorio no debe contaminar netPnl');
  assert.equal(metrics.expectancyR, 1.5, 'El R del registro contradictorio no debe contaminar expectancyR');
  assert.equal(metrics.dataCoverage?.conflictedTradesCount, 1);
  assert.equal(metrics.dataCoverage?.isPartialCoverage, true);

  const consolidated = calculateConsolidatedReturnPct(parsed, accounts, 'acc-1');
  assert.equal(consolidated.returnPct, 0.3, 'Retorno consolidado debe ser +0.30% (solo MNQ)');
  assert.equal(consolidated.isPartial, true);
  assert.equal(consolidated.includedTradesCount, 1);
  assert.equal(consolidated.excludedTradesCount, 1);
});

// ----------------------------------------------------------------------------------
// 5. Cálculo por precios para NQ, MNQ, ES, MES, XAUUSD, EURUSD y bloqueo de no verificados
// ----------------------------------------------------------------------------------
test('5. Cálculo por precios para NQ, MNQ, ES, MES, XAUUSD, EURUSD y bloqueo de no verificados (provenance theoretical vs audited)', () => {
  // 1) NQ: $20/punto (tick 0.25 = $5). Long 21500 -> 21525 (25 pts), 2 contratos = +$1,000.00
  const nq = calculateTheoreticalInstrumentPnl({
    symbol: 'NQ',
    direction: 'Long',
    entryPrice: 21500,
    exitPrice: 21525,
    size: 2,
  });
  assert.equal(nq.verified, true);
  assert.equal(nq.grossPnl, 1000.00);
  assert.equal(nq.provenance, 'theoretical', 'Sin comisiones medidas debe etiquetarse como theoretical, nunca audited');

  // 2) MNQ: $2/punto (tick 0.25 = $0.50). Short 21500 -> 21450 (50 pts), 3 contratos = +$300.00
  const mnq = calculateTheoreticalInstrumentPnl({
    symbol: 'MNQ',
    direction: 'Short',
    entryPrice: 21500,
    exitPrice: 21450,
    size: 3,
  });
  assert.equal(mnq.verified, true);
  assert.equal(mnq.grossPnl, 300.00);
  assert.equal(mnq.provenance, 'theoretical');

  // 3) ES: $50/punto (tick 0.25 = $12.50). Long 6000 -> 6010.50 (10.5 pts), 1 contrato = +$525.00
  const es = calculateTheoreticalInstrumentPnl({
    symbol: 'ES',
    direction: 'Long',
    entryPrice: 6000,
    exitPrice: 6010.5,
    size: 1,
  });
  assert.equal(es.verified, true);
  assert.equal(es.grossPnl, 525.00);

  // 4) MES: $5/punto (tick 0.25 = $1.25). Short 6000 -> 6010 (-10 pts), 2 contratos = -$100.00
  const mes = calculateTheoreticalInstrumentPnl({
    symbol: 'MES',
    direction: 'Short',
    entryPrice: 6000,
    exitPrice: 6010,
    size: 2,
  });
  assert.equal(mes.verified, true);
  assert.equal(mes.grossPnl, -100.00);

  // 5) XAUUSD: 100 oz por lote ($100 por cada $1.00 de movimiento). Long 2850.00 -> 2855.50 (+5.50), 1 lote = +$550.00
  const xau = calculateTheoreticalInstrumentPnl({
    symbol: 'XAUUSD',
    direction: 'Long',
    entryPrice: 2850.0,
    exitPrice: 2855.5,
    size: 1,
  });
  assert.equal(xau.verified, true);
  assert.equal(xau.grossPnl, 550.00);

  // 6) EURUSD: Lote estándar = 100,000 unidades (1 pip = 0.0001 = $10/pip por lote).
  // Long 1.0800 -> 1.0850 (50 pips = 0.0050), 1 lote = +$500.00 (JAMÁS $0.05!)
  const eurusd = calculateTheoreticalInstrumentPnl({
    symbol: 'EURUSD',
    direction: 'Long',
    entryPrice: 1.0800,
    exitPrice: 1.0850,
    size: 1,
  });
  assert.equal(eurusd.verified, true);
  assert.equal(eurusd.pointValue, 100000);
  assert.equal(eurusd.tickSize, 0.0001);
  assert.equal(eurusd.tickValue, 10);
  assert.equal(eurusd.grossPnl, 500.00, '50 pips en 1 lote estándar de EURUSD deben ser $500.00, no $0.05');
  assert.equal(eurusd.provenance, 'theoretical');

  // 7) Instrumento no verificado: bloqueado (verified=false, grossPnl=0, netPnl=0, provenance='unrecorded')
  const unknownSpec = getInstrumentSpec('UNKNOWN_COIN_XYZ');
  assert.equal(unknownSpec.verified, false);

  const unknownCalc = autoCalculateTradeMath({
    symbol: 'UNKNOWN_COIN_XYZ',
    entryPrice: 100,
    exitPrice: 110,
    stopLoss: 95,
    takeProfit: 120,
    size: 1,
    commission: 0,
    direction: 'Long',
  });
  assert.equal(unknownCalc.verifiedSpec, false);
  assert.equal(unknownCalc.grossPnl, 0);
  assert.equal(unknownCalc.netPnl, 0);
  assert.equal(unknownCalc.pnlProvenance, 'unrecorded');
});

// ----------------------------------------------------------------------------------
// 6. Creación de nuevo trade V1b sin poblar campos legacy como hechos
// ----------------------------------------------------------------------------------
test('6. Creación de nuevo trade V1b no inventa datos ficticios en campos legacy (riskPercentUsed, htfAligned, followedPlan)', () => {
  const newForm = createInitialTradeFormState(null, '2026-10-30');
  newForm.symbol = 'NAS100';
  newForm.direction = 'Long';
  newForm.outcomeMode = 'TP';
  newForm.rMultiple = '2.0';
  newForm.selectedModel = 'Breaker Block';

  const result = resolveTradeFormSubmission(newForm, null, 'acc-1');
  assert.equal(result.error, undefined);
  assert.ok(result.payload);

  // Verificar que NO se inventan valores ficticios de V1a
  assert.equal(result.payload.riskPercentUsed, undefined, 'No debe inventar riskPercentUsed = 1.0');
  assert.deepEqual(result.payload.htfAligned, [], 'No debe inventar htfAligned = [1D, 4H, 2H, 30m]');
  assert.equal(result.payload.followedPlan, false, 'No debe inventar followedPlan = true');
  assert.equal(result.payload.planUnrecorded, true, 'Debe marcar planUnrecorded = true');
  assert.deepEqual(result.payload.checklistCompleted, [], 'No debe poblar checklistCompleted ficticio');
  assert.equal(result.payload.setupGrade, 'Sin evaluar', 'No debe inventar setupGrade = A+');
  assert.equal(result.payload.dolTarget, '', 'No debe inventar dolTarget');

  // Y al calcular métricas sobre este trade nuevo, planComplianceRate no se distorsiona como 100% falso
  const metrics = calculateDashboardMetrics([{ ...result.payload, id: 't-new-v1b' }], []);
  assert.equal(metrics.planComplianceRate, 0);
});

// ----------------------------------------------------------------------------------
// 7. Retornos porcentuales agregados: base explícita de capital inicial constante y no mezcla
// ----------------------------------------------------------------------------------
test('7. Retornos porcentuales agregados definen base constant_initial_capital y no mezclan bases incompatibles', () => {
  const tradePctOnly = {
    id: 't-pct-only',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2026-10-29T09:30',
    netPnl: 0,
    rMultiple: 2.0,
    realizedNetReturnPct: 2.0,
    calculationMode: 'unrecorded',
    status: 'Win',
    accountId: 'acc-verified',
  };

  const tradeMonetary = {
    id: 't-monetary',
    symbol: 'NQ',
    direction: 'Long',
    entryDate: '2026-10-30T09:30',
    netPnl: 300,
    rMultiple: 1.5,
    realizedNetReturnPct: null,
    calculationMode: 'monetary',
    status: 'Win',
    accountId: 'acc-verified',
  };

  const account = {
    id: 'acc-verified',
    name: 'Cuenta $10,000',
    initialBalance: 10000,
    hasVerifiedBalance: true,
  };

  const consolidated = calculateConsolidatedReturnPct([tradePctOnly, tradeMonetary], [account], 'acc-verified');
  assert.equal(consolidated.returnBase, 'constant_initial_capital');
  assert.equal(consolidated.returnPct, 3.0, 'Retorno consolidado sobre capital constante ($300 / $10,000 = 3.0%)');
  assert.equal(consolidated.isPartial, true, 'Debe marcarse como parcial porque tradePctOnly no tiene P&L monetario');
  assert.equal(consolidated.includedTradesCount, 1);
  assert.equal(consolidated.excludedTradesCount, 1);

  // avgWinReturnPct tampoco debe mezclar el 2.0% sin base monetaria con el 3.0% sobre capital constante ($300 / $10,000)
  const avgWinPct = calculateAvgWinReturnPct([tradePctOnly, tradeMonetary], [account], 'acc-verified');
  assert.equal(avgWinPct, 3.0, 'avgWinReturnPct debe calcularse estrictamente sobre la muestra monetaria y capital inicial constante');

  // Si solo existen trades unrecorded con porcentajes sueltos en una cuenta técnica sin capital, no debe sumarlos
  const techAccount = {
    id: 'acc-tech',
    name: 'Cuenta Técnica',
    initialBalance: 0,
    hasVerifiedBalance: false,
    isTechnical: true,
  };
  const unrecordedTrades = [
    { ...tradePctOnly, id: 'u1', accountId: 'acc-tech', realizedNetReturnPct: 1.5 },
    { ...tradePctOnly, id: 'u2', accountId: 'acc-tech', realizedNetReturnPct: 2.0 },
  ];
  const unrecordedConsolidated = calculateConsolidatedReturnPct(unrecordedTrades, [techAccount], 'acc-tech');
  assert.equal(unrecordedConsolidated.isValid, false);
  assert.equal(unrecordedConsolidated.returnPct, null, 'No debe sumar porcentajes aislados sin capital inicial constante verificable');
  assert.equal(unrecordedConsolidated.returnBase, 'r_multiple_only');
});

// ----------------------------------------------------------------------------------
// 8. Curva con datos monetarios y R-only combinados + Expectativa coherente
// ----------------------------------------------------------------------------------
test('8. Curva con datos monetarios y R-only y Expectativa con poblaciones coherentes', () => {
  const trades = [
    {
      id: 't-m-win',
      symbol: 'NQ',
      direction: 'Long',
      entryDate: '2026-10-27T09:30',
      netPnl: 100,
      rMultiple: 1.0,
      calculationMode: 'monetary',
      status: 'Win',
      accountId: 'acc-1',
    },
    {
      id: 't-m-loss',
      symbol: 'NQ',
      direction: 'Short',
      entryDate: '2026-10-28T09:30',
      netPnl: -100,
      rMultiple: -1.0,
      calculationMode: 'monetary',
      status: 'Loss',
      accountId: 'acc-1',
    },
    {
      id: 't-r-win1',
      symbol: 'NAS100',
      direction: 'Long',
      entryDate: '2026-10-29T09:30',
      netPnl: 0,
      rMultiple: 2.0,
      calculationMode: 'unrecorded',
      status: 'Win',
      accountId: 'acc-1',
    },
    {
      id: 't-r-win2',
      symbol: 'NAS100',
      direction: 'Long',
      entryDate: '2026-10-30T09:30',
      netPnl: 0,
      rMultiple: 2.0,
      calculationMode: 'unrecorded',
      status: 'Win',
      accountId: 'acc-1',
    },
  ];

  const accounts = [{ id: 'acc-1', name: 'Cuenta 10K', initialBalance: 10000, hasVerifiedBalance: true }];
  const metrics = calculateDashboardMetrics(trades, accounts, 'acc-1');

  assert.equal(metrics.winRate, 75.0);
  assert.equal(metrics.expectancyUSD, 0.00);
  assert.equal(metrics.expectancyPct, 0.00, 'Expectativa % debe usar el WR de la muestra monetaria (50%), dando 0.00%');
  assert.equal(metrics.expectancyR, 1.00);
  assert.equal(metrics.isPartialReturn, true);

  const curveResult = calculatePercentageEquityCurve(trades, accounts, 'acc-1');
  assert.equal(curveResult.curveMode, 'percentage');
  assert.equal(curveResult.returnBase, 'constant_initial_capital');
  assert.equal(curveResult.isPartialCurve, true);
  assert.equal(curveResult.includedTradesCount, 2);
  assert.equal(curveResult.excludedTradesCount, 2);
  assert.equal(curveResult.totalTradesCount, 4);
});

// ----------------------------------------------------------------------------------
// 9. Compatibilidad con registros históricos V1a y antiguos
// ----------------------------------------------------------------------------------
test('9. Compatibilidad con registros V1a y antiguos: conserva BPR, R decimal 1.25, confluencias múltiples y campos legacy', () => {
  const v1aTrade = {
    id: 't-v1a-legacy',
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
    plannedRR: 1.25,
    rMultiple: 1.25,
    status: 'Win',
    killzone: 'NY Open 09:30 AM (09:30-10:30)',
    pdArrays: ['BPR (Balanced Price Range)', 'Contexto HTF (1D/4H/2H/30m)'],
    checklistCompleted: ['Dirección Mayor alineada en Diario (1D) y 4H'],
    setupGrade: 'A+',
    dailyBias: 'Bullish',
    dolTarget: 'High',
    timeframe: '15m',
    followedPlan: true,
    riskPercentUsed: 1.0,
    htfAligned: ['1D', '4H', '2H', '30m'],
    psychologyTag: 'Sin clasificar',
    notes: 'Operación histórica V1a',
    accountId: 'acc-1',
  };

  // Editar nota en V1a trade conserva todos sus campos legacy intactos
  const form = createInitialTradeFormState(v1aTrade, '');
  form.notes = 'Operación histórica V1a revisada';
  const res = resolveTradeFormSubmission(form, v1aTrade, 'acc-1');

  assert.equal(res.error, undefined);
  assert.deepEqual(res.payload.pdArrays, ['BPR (Balanced Price Range)', 'Contexto HTF (1D/4H/2H/30m)']);
  assert.equal(res.payload.riskPercentUsed, 1.0);
  assert.deepEqual(res.payload.htfAligned, ['1D', '4H', '2H', '30m']);
  assert.equal(res.payload.followedPlan, true);
  assert.equal(res.payload.setupGrade, 'A+');

  const backup = {
    version: '1.0',
    exportedAt: '2026-10-30T14:00:00Z',
    trades: [v1aTrade],
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

  assert.equal(validateBackupPayload(backup), true);
});
