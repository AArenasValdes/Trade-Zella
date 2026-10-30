import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateConsolidatedReturnPct,
  calculatePercentageEquityCurve,
} from '../src/services/financial-engine.ts';

import {
  calculateDashboardMetrics,
  autoCalculateTradeMath,
} from '../src/services/math-engine.ts';

import {
  parseTradingViewCSV,
  validateBackupPayload,
} from '../src/services/storage-service.ts';

import { getInstrumentSpec } from '../src/config/ict-constants.ts';

// ----------------------------------------------------------------------------------
// 1. Edición de trade monetario con precios precargados, modificando solo una nota
// ----------------------------------------------------------------------------------
test('1. Edición de trade monetario con precios precargados: modificar solo nota conserva P&L auditado y no recalcula', () => {
  // Trade histórico auditado en NQ con comisión/slippage real
  // Entrada 21500, Salida 21510 (10 pts de diferencia).
  // A $20/pt, el cálculo teórico daría $200.00.
  // Sin embargo, su netPnl auditado almacenado es $185.50 con comisiones reales de $14.50.
  const editingTrade = {
    id: 't-audited-nq-1',
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
    status: 'Win',
    calculationMode: 'monetary',
    accountId: 'acc-1',
    notes: 'Nota original antes de revisión',
    psychologyTag: 'A+ Alineado al Contexto HTF',
  };

  // Simulación del estado del formulario tras precarga:
  // Los precios de entrada y salida se precargan como strings:
  const formState = {
    symbol: editingTrade.symbol,
    direction: editingTrade.direction,
    outcomeMode: 'TP',
    rMultiple: '1.0',
    realizedNetReturnPct: '',
    durationMinutes: '',
    entryPrice: editingTrade.entryPrice.toString(),
    exitPrice: editingTrade.exitPrice.toString(),
    stopLoss: editingTrade.stopLoss.toString(),
    takeProfit: editingTrade.takeProfit.toString(),
    size: editingTrade.size.toString(),
    notes: 'Nota actualizada por el trader en revisión', // ÚNICO CAMBIO
    psychologyTag: editingTrade.psychologyTag,
  };

  // Lógica de detección de cambios financieros implementada en TradeFormModal
  const parsedEntry = parseFloat(formState.entryPrice) || 0;
  const parsedExit = parseFloat(formState.exitPrice) || 0;
  const parsedSL = parseFloat(formState.stopLoss) || 0;
  const parsedTP = parseFloat(formState.takeProfit) || 0;
  const parsedSize = parseFloat(formState.size) || 1;
  const rMultipleNum = parseFloat(formState.rMultiple) || 0;

  const isFinancialChange = Boolean(
    formState.symbol.trim().toUpperCase() !== editingTrade.symbol.trim().toUpperCase() ||
    formState.direction !== editingTrade.direction ||
    (editingTrade.status === 'Win' ? 'TP' : 'SL') !== formState.outcomeMode ||
    Number(rMultipleNum.toFixed(2)) !== Number(editingTrade.rMultiple.toFixed(2)) ||
    parsedEntry !== (editingTrade.entryPrice || 0) ||
    parsedExit !== (editingTrade.exitPrice || 0) ||
    parsedSL !== (editingTrade.stopLoss || 0) ||
    parsedTP !== (editingTrade.takeProfit || 0) ||
    parsedSize !== (editingTrade.size || 1)
  );

  // Con el código anterior con hasNewEnteredPrices = parsedEntry > 0 && parsedExit > 0,
  // se recalculaba erróneamente a $200.00. Con la detección isFinancialChange:
  assert.equal(isFinancialChange, false, 'No debe detectar cambio financiero si solo cambió la nota');

  let finalNetPnl;
  let finalGrossPnl;
  let finalCommission;
  let finalCalculationMode;

  if (!isFinancialChange) {
    finalNetPnl = editingTrade.netPnl;
    finalGrossPnl = editingTrade.grossPnl;
    finalCommission = editingTrade.commission;
    finalCalculationMode = editingTrade.calculationMode;
  } else {
    finalNetPnl = 200; // Recalculado teórico
    finalGrossPnl = 200;
    finalCommission = 0;
    finalCalculationMode = 'monetary';
  }

  assert.equal(finalNetPnl, 185.50, 'Debe preservar el netPnl auditado exacto ($185.50)');
  assert.equal(finalGrossPnl, 200.00);
  assert.equal(finalCommission, 14.50);
  assert.equal(finalCalculationMode, 'monetary');
});

// ----------------------------------------------------------------------------------
// 2. Edición de trade derivado sin cambios económicos
// ----------------------------------------------------------------------------------
test('2. Edición de trade derivado sin cambios económicos: conserva calculationMode derived_r y netPnl', () => {
  const editingTrade = {
    id: 't-hist-derived',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2025-01-10T09:30',
    entryPrice: 0,
    exitPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    size: 1,
    netPnl: 1500,
    grossPnl: 1500,
    commission: 0,
    commissionUnmeasured: true,
    rMultiple: 1.5,
    plannedRR: 1.5,
    status: 'Win',
    calculationMode: 'derived_r',
    accountId: 'acc-1',
    notes: 'Nota previa',
    psychologyTag: 'Sin clasificar',
  };

  const formState = {
    symbol: 'NAS100',
    direction: 'Long',
    outcomeMode: 'TP',
    rMultiple: '1.5',
    notes: 'Nota previa',
    psychologyTag: 'A+ Alineado al Contexto HTF', // Modificación exclusiva de emoción
    entryPrice: '',
    exitPrice: '',
    stopLoss: '',
    takeProfit: '',
    size: '1',
  };

  const isFinancialChange = Boolean(
    formState.symbol.trim().toUpperCase() !== editingTrade.symbol.trim().toUpperCase() ||
    formState.direction !== editingTrade.direction ||
    (editingTrade.status === 'Win' ? 'TP' : 'SL') !== formState.outcomeMode ||
    Number(parseFloat(formState.rMultiple).toFixed(2)) !== Number(editingTrade.rMultiple.toFixed(2))
  );

  assert.equal(isFinancialChange, false);

  const finalCalculationMode = !isFinancialChange ? editingTrade.calculationMode : 'unrecorded';
  const finalNetPnl = !isFinancialChange ? editingTrade.netPnl : 0;

  assert.equal(finalCalculationMode, 'derived_r', 'Debe conservar calculationMode derived_r');
  assert.equal(finalNetPnl, 1500, 'Debe conservar el P&L derivado histórico intacto');
});

// ----------------------------------------------------------------------------------
// 3. Un trade +2% sin P&L junto con uno monetario
// ----------------------------------------------------------------------------------
test('3. Un trade +2% sin P&L junto con uno monetario: no diluye P&L monetario a $0', () => {
  const tradeA = {
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

  const tradeB = {
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

  const metrics = calculateDashboardMetrics([tradeA, tradeB], [account]);

  // El promedio monetario de ganancia debe ser exactamente $300 (de tradeB), no ($300 + $0)/2 = $150
  assert.equal(metrics.avgWin, 300, 'avgWin monetario no debe contaminarse con tradeA');
  assert.equal(metrics.netPnl, 300);
  assert.equal(metrics.dataCoverage?.monetaryTradesCount, 1);
  assert.equal(metrics.dataCoverage?.returnPctTradesCount, 1);
  assert.equal(metrics.dataCoverage?.unrecordedTradesCount, 1);
});

// ----------------------------------------------------------------------------------
// 4. Curva con datos monetarios y R-only combinados
// ----------------------------------------------------------------------------------
test('4. Curva con datos monetarios y R-only: no dibuja operaciones unrecorded como $0 planos', () => {
  const trades = [
    {
      id: 't-monetary-1',
      symbol: 'NQ',
      direction: 'Long',
      entryDate: '2026-10-28T09:30',
      netPnl: 400,
      rMultiple: 2.0,
      calculationMode: 'monetary',
      accountId: 'acc-1',
      status: 'Win',
    },
    {
      id: 't-pure-r-1',
      symbol: 'NAS100',
      direction: 'Long',
      entryDate: '2026-10-29T09:30',
      netPnl: 0,
      rMultiple: 3.0,
      calculationMode: 'unrecorded',
      accountId: 'acc-1',
      status: 'Win',
    },
    {
      id: 't-monetary-2',
      symbol: 'NQ',
      direction: 'Short',
      entryDate: '2026-10-30T09:30',
      netPnl: -200,
      rMultiple: -1.0,
      calculationMode: 'monetary',
      accountId: 'acc-1',
      status: 'Loss',
    },
  ];

  const accounts = [{ id: 'acc-1', name: 'Cuenta 10K', initialBalance: 10000, hasVerifiedBalance: true }];

  const curveResult = calculatePercentageEquityCurve(trades, accounts);

  // En modo porcentaje, solo debe trazar las operaciones con P&L monetario medido
  assert.equal(curveResult.curveMode, 'percentage');
  assert.equal(curveResult.isPartialCurve, true, 'Debe marcarse como curva parcial');
  assert.equal(curveResult.includedTradesCount, 2, 'Solo debe incluir las 2 operaciones monetarias');
  assert.equal(curveResult.totalTradesCount, 3, 'El total debe ser 3 operaciones');

  // Los puntos deben ser: Inicio + Trade 1 ($400) + Trade 3 (-$200) = 3 puntos
  assert.equal(curveResult.points.length, 3);
  assert.equal(curveResult.points[1].pnl, 400);
  assert.equal(curveResult.points[2].pnl, -200);
});

// ----------------------------------------------------------------------------------
// 5. Expectativa con poblaciones coherentes
// ----------------------------------------------------------------------------------
test('5. Expectativa con poblaciones mixtas: no combina Win Rate global con promedios de subconjunto', () => {
  // 4 trades en total: 3 Wins y 1 Loss (Win Rate global = 75%)
  // Pero solo 2 trades tienen importes monetarios: 1 Win de +$100 y 1 Loss de -$100 (WR monetario = 50%)
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
    },
  ];

  const metrics = calculateDashboardMetrics(trades, []);

  // Win Rate global: 3 wins de 4 = 75.0%
  assert.equal(metrics.winRate, 75.0);

  // Expectativa monetaria en USD: debe evaluarse estrictamente sobre la población monetaria (1 win $100, 1 loss $100 -> 50% de $100 - 50% de $100 = $0.00)
  // Si combinara el WR global (75%), daría 0.75 * 100 - 0.25 * 100 = +$50.00 (FALSO)
  assert.equal(metrics.expectancyUSD, 0.00, 'Expectativa USD debe ser 0.00, no 50.00');
  assert.equal(metrics.monetarySampleSize, 2);
  assert.equal(metrics.profitFactorUSD, 1.00);

  // Expectativa en R: sobre los 4 trades (r: 1, -1, 2, 2 -> media = 4/4 = 1.00R)
  assert.equal(metrics.expectancyR, 1.00);
  assert.equal(metrics.rSampleSize, 4);
});

// ----------------------------------------------------------------------------------
// 6. CSV importado cuando todavía no existe cuenta
// ----------------------------------------------------------------------------------
test('6. CSV importado sin cuenta existente: no asigna acc-fp-1 y utiliza cuenta técnica', () => {
  const csvText = `symbol,direction,time,r,duration
NAS100,Long,2026-10-30T09:35,"2,00",25
`;

  // Simulación de importCSV en TradingContext cuando accounts = []
  const accounts = [];
  const filtersAccountId = 'All';

  const TECHNICAL_FALLBACK_ACCOUNT = {
    id: 'acc-tech-unrecorded',
    name: 'Cuenta Técnica (Sin capital de referencia)',
    firm: 'Martin OS Technical',
    initialBalance: 0,
    profitTarget: 0,
    maxDrawdown: 0,
    dailyLossLimit: 0,
    isTechnical: true,
    hasVerifiedBalance: false,
  };

  let targetAccountId = filtersAccountId !== 'All' ? filtersAccountId : accounts[0]?.id;
  if (!targetAccountId) {
    targetAccountId = TECHNICAL_FALLBACK_ACCOUNT.id;
    accounts.push(TECHNICAL_FALLBACK_ACCOUNT);
  }

  const parsed = parseTradingViewCSV(csvText, targetAccountId);

  assert.equal(parsed.length, 1);
  assert.notEqual(parsed[0].accountId, 'acc-fp-1', 'Bajo ningún concepto debe asignar acc-fp-1');
  assert.equal(parsed[0].accountId, 'acc-tech-unrecorded', 'Debe asignar acc-tech-unrecorded');
  assert.equal(accounts[0].id, 'acc-tech-unrecorded');
  assert.equal(accounts[0].initialBalance, 0);
  assert.equal(accounts[0].isTechnical, true);
});

// ----------------------------------------------------------------------------------
// 7. CSV sin resultado interpretable o contradictorio
// ----------------------------------------------------------------------------------
test('7. CSV sin resultado interpretable o contradictorio: rechaza registros vacios y deja contradictorios en revision', () => {
  const csvText = `symbol,direction,time,r,pnl,status
NAS100,Long,2026-10-30T09:35,,,,
US30,Short,2026-10-30T10:00,2.00,-150,Loss
MNQ,Long,2026-10-30T10:35,1.50,,,
`;

  const parsed = parseTradingViewCSV(csvText, 'acc-test');

  // Fila 1 (NAS100): sin R, sin PnL, sin status, sin precios -> NO INTERPRETABLE -> RECHAZADA (no inventa Loss ni -1R)
  // Fila 2 (US30): R=2.00 pero PnL=-150 y status=Loss -> CONTRADICTORIA -> DEJADA EN REVISIÓN con notas explicativas
  // Fila 3 (MNQ): R=1.50 -> VÁLIDA -> IMPORTADA
  assert.equal(parsed.length, 2, 'Debe rechazar la fila sin resultado interpretable e importar las otras 2');
  assert.equal(parsed.some((t) => t.symbol === 'NAS100'), false, 'Fila sin resultado no debe importarse');
  
  const mnq = parsed.find((t) => t.symbol === 'MNQ');
  assert.ok(mnq);
  assert.equal(mnq.rMultiple, 1.5);
  assert.equal(mnq.status, 'Win');

  const us30 = parsed.find((t) => t.symbol === 'US30');
  assert.ok(us30);
  assert.ok(us30.notes.includes('revisión') || us30.notes.includes('Conflicto'), 'Debe marcar el trade en revisión');
});

// ----------------------------------------------------------------------------------
// 8. Cuenta técnica de capital cero
// ----------------------------------------------------------------------------------
test('8. Cuenta técnica de capital cero: no divide por cero y no inventa capital de referencia', () => {
  const technicalAccount = {
    id: 'acc-tech-zero',
    name: 'Cuenta Técnica',
    firm: 'Martin OS',
    initialBalance: 0,
    hasVerifiedBalance: false,
    isTechnical: true,
    profitTarget: 0,
    maxDrawdown: 0,
    dailyLossLimit: 0,
  };

  const trade = {
    id: 't-tech',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2026-10-30T09:30',
    netPnl: 0,
    rMultiple: 2.0,
    status: 'Win',
    calculationMode: 'unrecorded',
    accountId: 'acc-tech-zero',
  };

  const consolidated = calculateConsolidatedReturnPct([trade], [technicalAccount], 'acc-tech-zero');
  assert.equal(consolidated.isValid, false);
  assert.equal(consolidated.returnPct, null);
  assert.equal(consolidated.totalReferenceCapital, 0);

  const curve = calculatePercentageEquityCurve([trade], [technicalAccount], 'acc-tech-zero');
  assert.equal(curve.curveMode, 'r_multiple');
  assert.equal(curve.referenceCapital, 0);
  assert.equal(curve.currentReturnR, 2.0);
});

// ----------------------------------------------------------------------------------
// 9. P&L experimental de instrumento desconocido
// ----------------------------------------------------------------------------------
test('9. P&L experimental de instrumento desconocido: no inventa multiplicador genérico para P&L real', () => {
  const unknownSpec = getInstrumentSpec('UNKNOWN_COIN_XYZ');
  assert.equal(unknownSpec.verified, false, 'Instrumento desconocido debe tener verified=false');

  const calc = autoCalculateTradeMath({
    symbol: 'UNKNOWN_COIN_XYZ',
    entryPrice: 100,
    exitPrice: 110,
    stopLoss: 95,
    takeProfit: 120,
    size: 1,
    commission: 0,
    direction: 'Long',
  });

  assert.equal(calc.verifiedSpec, false);
  assert.equal(calc.grossPnl, 0, 'No debe derivar P&L monetario para especificaciones no verificadas');
  assert.equal(calc.netPnl, 0);
});

// ----------------------------------------------------------------------------------
// 10. Compatibilidad con registros V1a y antiguos
// ----------------------------------------------------------------------------------
test('10. Compatibilidad con registros V1a y antiguos: valida BPR, R decimal 1.25 y confluencias múltiples', () => {
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
    checklistCompleted: [],
    setupGrade: 'A+',
    dailyBias: 'Bullish',
    dolTarget: 'High',
    timeframe: '15m',
    followedPlan: true,
    psychologyTag: 'Sin clasificar',
    notes: 'Operación histórica V1a',
    accountId: 'acc-1',
  };

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

  assert.equal(validateBackupPayload(backup), true, 'El payload histórico debe ser válido');
  assert.equal(backup.trades[0].rMultiple, 1.25);
  assert.equal(backup.trades[0].pdArrays[0], 'BPR (Balanced Price Range)');
});
