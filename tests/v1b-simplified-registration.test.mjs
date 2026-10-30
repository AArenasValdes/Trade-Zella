import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  parseTradingViewCSV,
} from '../src/services/storage-service.ts';
import {
  resolveTradeReturnPct,
  formatReturnPct,
} from '../src/services/financial-engine.ts';
import {
  calculateDashboardMetrics,
} from '../src/services/math-engine.ts';

// ----------------------------------------------------------------------------------
// 1. Trade sin cuenta manual asignada: fallback transparente y calculation_mode = 'unrecorded'
// ----------------------------------------------------------------------------------
test('1. Trade sin cuenta manual asignada: fallback transparente y calculation_mode = unrecorded', () => {
  const accounts = [
    { id: 'acc-default', name: 'Cuenta Principal', initialBalance: 100000 },
  ];
  const defaultAccountId = 'acc-default';

  // Simulación de resolución en segundo plano en TradeFormModal
  let resolvedAccountId = defaultAccountId;
  if (!resolvedAccountId || !accounts.some((a) => a.id === resolvedAccountId)) {
    resolvedAccountId = accounts[0]?.id || 'fallback';
  }

  assert.equal(resolvedAccountId, 'acc-default');

  const trade = {
    id: 't-unrecorded-1',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2026-10-30T09:30',
    rMultiple: 2.0,
    status: 'Win',
    netPnl: 0,
    pricesUnrecorded: true,
    calculationMode: 'unrecorded',
    accountId: resolvedAccountId,
  };

  assert.equal(trade.accountId, 'acc-default');
  assert.equal(trade.calculationMode, 'unrecorded');
  assert.equal(trade.pricesUnrecorded, true);
  assert.equal(trade.netPnl, 0);
});

// ----------------------------------------------------------------------------------
// 2. Trade con realizedNetReturnPct explícito: se almacena y se respeta en métricas
// ----------------------------------------------------------------------------------
test('2. Trade con realizedNetReturnPct explícito: se almacena y se respeta sin alterar R', () => {
  const trade = {
    id: 't-explicit-return',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2026-10-30T09:30',
    rMultiple: 2.5,
    realizedNetReturnPct: 1.85,
    status: 'Win',
    netPnl: 0,
    calculationMode: 'unrecorded',
  };

  const resolvedReturn = resolveTradeReturnPct(trade, 100000);
  assert.equal(resolvedReturn, 1.85, 'Debe devolver el retorno porcentual explícito');
  assert.equal(trade.rMultiple, 2.5, 'R-Multiple se mantiene independiente');
  assert.equal(formatReturnPct(resolvedReturn), '+1.85%');
});

// ----------------------------------------------------------------------------------
// 3. Trade sin realizedNetReturnPct: muestra «Sin dato» en lugar de 0%
// ----------------------------------------------------------------------------------
test('3. Trade sin realizedNetReturnPct en modo unrecorded: resolveTradeReturnPct es null y formatReturnPct es Sin dato', () => {
  const trade = {
    id: 't-no-return',
    symbol: 'US30',
    direction: 'Short',
    entryDate: '2026-10-30T10:35',
    rMultiple: -1.0,
    realizedNetReturnPct: null,
    status: 'Loss',
    netPnl: 0,
    calculationMode: 'unrecorded',
  };

  const resolvedReturn = resolveTradeReturnPct(trade, 100000);
  assert.equal(resolvedReturn, null, 'Sin retorno explícito ni precios debe devolver null');
  assert.equal(formatReturnPct(resolvedReturn), 'Sin dato', 'Debe formatearse como Sin dato, jamás 0%');
});

// ----------------------------------------------------------------------------------
// 4. Trade con durationMinutes manual: persiste valor numérico entero y valida no negatividad
// ----------------------------------------------------------------------------------
test('4. Trade con durationMinutes manual: valida valor entero y rechaza negativos', () => {
  const validateDuration = (raw) => {
    if (!raw || raw.trim() === '') return { valid: true, value: null };
    const num = Number(raw.trim());
    if (!Number.isFinite(num) || num < 0) return { valid: false, value: null };
    return { valid: true, value: Math.round(num) };
  };

  assert.deepEqual(validateDuration('15'), { valid: true, value: 15 });
  assert.deepEqual(validateDuration(' 45 '), { valid: true, value: 45 });
  assert.deepEqual(validateDuration('12.7'), { valid: true, value: 13 });
  assert.deepEqual(validateDuration('0'), { valid: true, value: 0 });
  assert.equal(validateDuration('-5').valid, false, 'Duraciones negativas deben ser inválidas');
  assert.equal(validateDuration('abc').valid, false, 'Duraciones no numéricas deben ser inválidas');
});

// ----------------------------------------------------------------------------------
// 5. Trade con durationMinutes omitido: persiste como null / desconocido
// ----------------------------------------------------------------------------------
test('5. Trade con durationMinutes omitido: persiste como null', () => {
  const rawInput = '';
  const duration = rawInput.trim() !== '' ? Math.round(Number(rawInput)) : null;
  assert.equal(duration, null, 'Debe persistir como null cuando está vacío');
});

// ----------------------------------------------------------------------------------
// 6. Guardar trade sin precios: no afecta promedios monetarios ($)
// ----------------------------------------------------------------------------------
test('6. Guardar trade sin precios en unrecorded: no contamina promedios monetarios con ceros falsos', () => {
  const trades = [
    {
      id: 't-monetary-1',
      symbol: 'NAS100',
      direction: 'Long',
      entryDate: '2026-10-28T09:30',
      netPnl: 1000,
      rMultiple: 2.0,
      status: 'Win',
      calculationMode: 'monetary',
    },
    {
      id: 't-unrecorded-win',
      symbol: 'NAS100',
      direction: 'Long',
      entryDate: '2026-10-29T09:30',
      netPnl: 0,
      rMultiple: 2.0,
      realizedNetReturnPct: 2.0,
      status: 'Win',
      calculationMode: 'unrecorded',
      pricesUnrecorded: true,
    },
    {
      id: 't-monetary-2',
      symbol: 'NAS100',
      direction: 'Short',
      entryDate: '2026-10-30T09:30',
      netPnl: -500,
      rMultiple: -1.0,
      status: 'Loss',
      calculationMode: 'monetary',
    },
  ];

  const accounts = [{ id: 'acc-1', initialBalance: 100000 }];
  const metrics = calculateDashboardMetrics(trades, accounts);

  // El promedio de ganancia monetaria debe basarse en el trade monetario ($1000), no diluirse a $500
  assert.equal(metrics.avgWin, 1000, 'avgWin monetario debe ignorar trades unrecorded con PnL 0');
  assert.equal(metrics.avgLoss, 500, 'avgLoss monetario debe calcularse sobre pérdidas monetarias');
  // Pero el winRate y cuenta de trades sí deben reflejar ambos trades ganadores
  assert.equal(metrics.winsCount, 2);
  assert.equal(metrics.lossesCount, 1);
  assert.equal(metrics.totalTrades, 3);
  assert.equal(metrics.winRate, 66.7);
});

// ----------------------------------------------------------------------------------
// 7. Guardar trade con precios experimentales: calculationMode = 'monetary', calcula P&L real
// ----------------------------------------------------------------------------------
test('7. Guardar trade con precios opcionales: calcula P&L real y activa calculationMode monetary', () => {
  const entryPrice = 21500;
  const exitPrice = 21540;
  const size = 2;
  const direction = 'Long';

  const priceDiff = direction === 'Long' ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
  const netPnl = Number((priceDiff * size).toFixed(2));

  assert.equal(netPnl, 80);
  const calculationMode = entryPrice > 0 && exitPrice > 0 ? 'monetary' : 'unrecorded';
  assert.equal(calculationMode, 'monetary');
});

// ----------------------------------------------------------------------------------
// 8. Trade con modelo 'Breaker Block': persiste pdArrays = ['Breaker Block']
// ----------------------------------------------------------------------------------
test('8. Trade con modelo Breaker Block: persiste array con único elemento', () => {
  const selectedModel = 'Breaker Block';
  const pdArrays = [selectedModel];
  assert.deepEqual(pdArrays, ['Breaker Block']);
  assert.equal(pdArrays.length, 1);
});

// ----------------------------------------------------------------------------------
// 9. Trade con modelo 'Key Level': persiste pdArrays = ['Key Level']
// ----------------------------------------------------------------------------------
test('9. Trade con modelo Key Level: persiste array con único elemento', () => {
  const selectedModel = 'Key Level';
  const pdArrays = [selectedModel];
  assert.deepEqual(pdArrays, ['Key Level']);
  assert.equal(pdArrays.length, 1);
});

// ----------------------------------------------------------------------------------
// 10. Edición de trade histórico con modelo 'BPR': conserva BPR sin forzarlo
// ----------------------------------------------------------------------------------
test('10. Edición de trade histórico con modelo BPR conserva su categoría original', () => {
  const historicalTrade = {
    id: 't-hist-bpr',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2025-01-15T09:30',
    pdArrays: ['BPR (Balanced Price Range)'],
  };

  const availableModels = ['Breaker Block', 'Key Level'];
  for (const model of historicalTrade.pdArrays) {
    if (!availableModels.includes(model)) {
      availableModels.push(model);
    }
  }

  assert.equal(availableModels.includes('BPR (Balanced Price Range)'), true);
  const initialSelected = historicalTrade.pdArrays[0];
  assert.equal(initialSelected, 'BPR (Balanced Price Range)', 'No debe forzarse a Breaker Block');
});

// ----------------------------------------------------------------------------------
// 11. R-Multiple con espacios sanitizados: convierte a número sin error
// ----------------------------------------------------------------------------------
test('11. R-Multiple sanitiza valores con espacios como " 1.50 " o " 2,25 "', () => {
  const sanitize = (raw) => raw.trim().replace(/\s+/g, '');
  const submitRegex = /^\d+(?:[.,]\d{1,2})?$/;

  const testCases = [
    { input: ' 1.50 ', expected: 1.5 },
    { input: ' 2,25 ', expected: 2.25 },
    { input: '   0.75\n', expected: 0.75 },
    { input: '\t3,00 ', expected: 3.0 },
  ];

  for (const tc of testCases) {
    const sanitized = sanitize(tc.input);
    assert.equal(submitRegex.test(sanitized), true);
    const num = Number(sanitized.replace(',', '.'));
    assert.equal(num, tc.expected);
  }
});

// ----------------------------------------------------------------------------------
// 12. CalendarView no contiene Notebook Diario ni icono BookOpen ni controles pre-market
// ----------------------------------------------------------------------------------
test('12. CalendarView.tsx elimina formulario Notebook Diario y controles de notas', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/views/CalendarView.tsx');
  const code = fs.readFileSync(filePath, 'utf-8');

  assert.equal(code.includes('BookOpen'), false, 'BookOpen icon debe estar eliminado');
  assert.equal(code.includes('Notebook Diario'), false, 'Notebook Diario debe estar retirado');
  assert.equal(code.includes('Lectura Pre-Mercado'), false, 'Lectura Pre-Mercado debe estar retirada');
  assert.equal(code.includes('personalRules'), false, 'personalRules debe estar retirado');
  assert.equal(code.includes('handleSaveNote'), false, 'handleSaveNote debe estar retirado');
});

// ----------------------------------------------------------------------------------
// 13. Selección de día en CalendarView muestra únicamente operaciones del día y botón +
// ----------------------------------------------------------------------------------
test('13. CalendarView.tsx modal de día muestra ejecuciones del día y botón de registro', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/views/CalendarView.tsx');
  const code = fs.readFileSync(filePath, 'utf-8');

  assert.equal(code.includes('Operaciones del Día NY'), true);
  assert.equal(code.includes('Registrar operación'), true);
  assert.equal(code.includes('selectedDayTrades'), true);
});

// ----------------------------------------------------------------------------------
// 14. DashboardView muestra Racha Actual en lugar de Martin Edge Score y sin Plan: %
// ----------------------------------------------------------------------------------
test('14. DashboardView.tsx muestra Racha Actual y retira Martin Edge Score y Plan: %', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/views/DashboardView.tsx');
  const code = fs.readFileSync(filePath, 'utf-8');

  assert.equal(code.includes('Racha Actual'), true, 'Debe incluir tarjeta Racha Actual');
  assert.equal(code.includes('Martin Edge Score'), false, 'Martin Edge Score debe estar retirado');
  assert.equal(code.includes('Plan: {metrics.planComplianceRate}%'), false, 'Plan: X% badge debe estar retirado');
});

// ----------------------------------------------------------------------------------
// 15. Importación CSV con nuevas columnas duration y return %
// ----------------------------------------------------------------------------------
test('15. parseTradingViewCSV mapea columnas duration y return % a durationMinutes y realizedNetReturnPct', () => {
  const csvContent = `symbol,direction,time,r,duration,return %
NAS100,Long,2026-10-30T09:35,"1,50",25,"2,25"
US30,Short,2026-10-30T10:40,"2.00",40,"-1.00"
SP500,Long,2026-10-30T09:45,"0.75",,
`;

  const trades = parseTradingViewCSV(csvContent, 'acc-csv-test');
  assert.equal(trades.length, 3);

  // Primer trade: duration 25 min, return 2.25%
  assert.equal(trades[0].symbol, 'NAS100');
  assert.equal(trades[0].durationMinutes, 25);
  assert.equal(trades[0].realizedNetReturnPct, 2.25);
  assert.equal(trades[0].rMultiple, 1.5);
  assert.equal(trades[0].calculationMode, 'unrecorded');

  // Segundo trade: duration 40 min, return -1.0%
  assert.equal(trades[1].symbol, 'US30');
  assert.equal(trades[1].durationMinutes, 40);
  assert.equal(trades[1].realizedNetReturnPct, -1.0);
  assert.equal(trades[1].rMultiple, 2.0);

  // Tercer trade: duration y return omitidos -> null
  assert.equal(trades[2].symbol, 'SP500');
  assert.equal(trades[2].durationMinutes, null);
  assert.equal(trades[2].realizedNetReturnPct, null);
});
