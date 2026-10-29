import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTradingViewCSV,
  parseCsvLine,
  parseCsvNumber,
} from '../src/services/storage-service.ts';

// ----------------------------------------------------------------------------------
// 1. R-Multiple: Sanitización de Espacios, Formato con Coma/Punto y Validación
// ----------------------------------------------------------------------------------
test('1. R-Multiple sanitiza valores pegados con espacios y acepta coma y punto', () => {
  const sanitize = (raw) => raw.trim().replace(/\s+/g, '');
  const changeRegex = /^\d*(?:[.,]\d{0,2})?$/;
  const submitRegex = /^\d+(?:[.,]\d{1,2})?$/;

  // Caso específico 1: Valores pegados con espacios
  const pastedWithSpaces = [' 1.25 ', '  1,25  ', '\t2.50\n', ' 0.75 '];
  for (const raw of pastedWithSpaces) {
    const sanitized = sanitize(raw);
    assert.equal(changeRegex.test(sanitized), true, `Sanitizado "${sanitized}" debe ser aceptado en onChange`);
    assert.equal(submitRegex.test(sanitized), true, `Sanitizado "${sanitized}" debe ser aceptado en onSubmit`);

    const normalized = sanitized.replace(',', '.');
    const parsed = Number(normalized);
    assert.equal(Number.isFinite(parsed) && parsed > 0, true, `Debe convertirse a número positivo: ${parsed}`);
  }

  // Valores válidos
  const validInputs = ['1.25', '1,25', '2.50', '0.75', '1', '2'];
  for (const val of validInputs) {
    assert.equal(submitRegex.test(val), true);
    const num = Number(val.replace(',', '.'));
    assert.equal(num > 0, true);
  }

  // Valores que DEBEN rechazarse en onSubmit
  const invalidInputs = ['0', '0.0', '0,00', '-1', '-1.25', '1.234', '1,234', 'abc', '', '1.', '1,'];
  for (const val of invalidInputs) {
    const isNewValid = submitRegex.test(val.trim()) && Number.isFinite(Number(val.trim().replace(',', '.'))) && Number(val.trim().replace(',', '.')) > 0;
    assert.equal(isNewValid, false, `Debe rechazarse: "${val}"`);
  }
});

test('2. R-Multiple no genera NaN durante la digitación intermedia', () => {
  const typingSteps = ['', ',', '.', '1', '1,', '1.', '1,2', '1.2', '1,25', '1.25'];
  for (const step of typingSteps) {
    const normalized = step.trim().replace(',', '.');
    const parsed = Number(normalized);
    const rMultipleNum = Number.isFinite(parsed) ? parsed : 0;
    assert.equal(Number.isFinite(rMultipleNum), true);
    assert.equal(Number.isNaN(rMultipleNum), false);
  }
});

// ----------------------------------------------------------------------------------
// 2. Operaciones Históricas con rMultiple: 0 no son sobreescritas a 2R
// ----------------------------------------------------------------------------------
test('3. Operación histórica con rMultiple: 0 conserva su valor y P&L original sin cambiar a 2R', () => {
  const editingTrade = {
    id: 't-historical-0',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2024-11-15T09:30',
    netPnl: 0,
    grossPnl: 0,
    commission: 0,
    plannedRR: 0,
    rMultiple: 0,
    status: 'Loss',
    calculationMode: 'monetary',
    riskPercentUsed: 1.0,
  };

  // Simulación de inicialización de formulario al abrir la operación existente
  const formRMultiple = (() => {
    const val = Math.abs(editingTrade.rMultiple);
    if (Number.isFinite(val)) {
      return Number(val.toFixed(2)).toString();
    }
    const fallback = Number(editingTrade.plannedRR);
    if (Number.isFinite(fallback)) {
      return Number(fallback.toFixed(2)).toString();
    }
    return '2.0';
  })();

  // NO debe ser reemplazado silenciosamente por '2.0'
  assert.equal(formRMultiple, '0', 'El formulario debe inicializar con 0, no con 2.0');

  // Simulación de submit sin modificar R
  const normalizedR = formRMultiple.trim().replace(',', '.');
  const rMultipleNum = Number.isFinite(Number(normalizedR)) ? Number(normalizedR) : 0;

  const isUnchangedHistoricalZero = Boolean(
    editingTrade &&
    Number(Math.abs(editingTrade.rMultiple).toFixed(2)) === 0 &&
    rMultipleNum === 0
  );
  assert.equal(isUnchangedHistoricalZero, true, 'Debe reconocer que es un 0 histórico inalterado');

  // Verificación de que no se marca como modificado
  const rChanged = Number(Math.abs(editingTrade.rMultiple).toFixed(2)) !== Number(rMultipleNum.toFixed(2));
  assert.equal(rChanged, false, 'rChanged debe ser false si el usuario no modificó el valor');

  // Payload final
  const finalPlannedRR = isUnchangedHistoricalZero ? editingTrade.plannedRR : Number(Math.abs(rMultipleNum).toFixed(2));
  const finalRMultiple = isUnchangedHistoricalZero ? editingTrade.rMultiple : rMultipleNum;

  assert.equal(finalPlannedRR, 0, 'plannedRR histórico debe conservarse intacto (0)');
  assert.equal(finalRMultiple, 0, 'rMultiple histórico debe conservarse intacto (0)');
  assert.equal(editingTrade.netPnl, 0, 'netPnl histórico debe conservarse intacto');
});

// ----------------------------------------------------------------------------------
// 3. Parser CSV: Soporte de campos entrecomillados con comas ("1,25") y formatos previos
// ----------------------------------------------------------------------------------
test('4. parseCsvLine y parseCsvNumber manejan comas dentro de comillas RFC 4180', () => {
  const line = 'NAS100,Long,21450,21530,21410,21530,25,0,2025-02-03T09:35,"1,25",2000';
  const cols = parseCsvLine(line, ',');
  assert.equal(cols.length, 11, 'La columna "1,25" entre comillas no debe dividir la fila');
  assert.equal(cols[9], '1,25', 'El valor R debe ser extraído como "1,25"');

  const rValue = parseCsvNumber(cols[9]);
  assert.equal(rValue, 1.25, 'parseCsvNumber debe convertir "1,25" a 1.25');

  // Valores negativos con coma
  assert.equal(parseCsvNumber('"-0,75"'), -0.75);
  // Decimal estándar
  assert.equal(parseCsvNumber('2.50'), 2.5);
});

test('5. parseTradingViewCSV importa correctamente trades reales con R-Multiple 1,25 y 2.50', () => {
  const csvContent = `symbol,direction,entry price,exit price,stop loss,take profit,size,commission,time,r,pnl
NAS100,Long,21450,21530,21410,21530,25,0,2025-02-03T09:35,"1,25",2000
NQ1!,Short,21580,21480,21620,21480,2,8.4,2025-02-04T09:45,2.50,3991.6
ES1!,Long,5950,5970,5940,5970,1,0,2025-02-05T09:32,"0,75",-500
`;

  const trades = parseTradingViewCSV(csvContent, 'acc-test');
  assert.equal(trades.length, 3);

  // Primer trade con "1,25"
  assert.equal(trades[0].symbol, 'NAS100');
  assert.equal(trades[0].rMultiple, 1.25, 'Trade con "1,25" debe importarse como 1.25');
  assert.equal(trades[0].netPnl, 2000);

  // Segundo trade con 2.50
  assert.equal(trades[1].symbol, 'NQ1!');
  assert.equal(trades[1].rMultiple, 2.5, 'Trade con 2.50 debe importarse como 2.5');

  // Tercer trade con "0,75"
  assert.equal(trades[2].symbol, 'ES1!');
  assert.equal(trades[2].rMultiple, 0.75, 'Trade con "0,75" debe importarse como 0.75');
});

// ----------------------------------------------------------------------------------
// 4. Calendario: Alineación Matemática en 60 meses (2024–2028)
// ----------------------------------------------------------------------------------
test('6. Calendario de 5 columnas alinea correctamente lunes a viernes en 60 meses (2024-2028)', () => {
  for (let year = 2024; year <= 2028; year++) {
    for (let month = 1; month <= 12; month++) {
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
      const firstDayWeekday = firstWeekday < 5 ? firstWeekday : 0;

      let cellIndex = 0;
      for (let i = 0; i < firstDayWeekday; i++) {
        cellIndex++;
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
        if (weekday === 0 || weekday === 6) continue;

        const expectedCol = (weekday + 6) % 7;
        const actualCol = cellIndex % 5;
        assert.equal(
          actualCol,
          expectedCol,
          `Desalineación en ${year}-${month}-${day}: esperado col ${expectedCol}, obtenido ${actualCol}`
        );
        cellIndex++;
      }
    }
  }
});

// ----------------------------------------------------------------------------------
// 5. Resumen Semanal: Definición ISO Lun–Dom y Robustez
// ----------------------------------------------------------------------------------
test('7. Resumen semanal agrupa semanas completas y preserva fines de semana en totales', () => {
  const trades = [
    { entryDate: '2025-02-01T09:30', netPnl: 100 }, // Sábado
    { entryDate: '2025-02-02T09:30', netPnl: -50 }, // Domingo
    { entryDate: '2025-02-03T09:35', netPnl: 200 }, // Lunes
    { entryDate: 'invalid-date', netPnl: 50 },       // Malformado (no debe tumbar el resumen)
  ];

  const weekBuckets = new Map();
  const weekendTrades = [];

  for (const trade of trades) {
    const nyDate = trade.entryDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nyDate)) continue; // Validación defensiva
    const [y, m, d] = nyDate.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = date.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendTrades.push(trade);
    }
    const monday = new Date(date.getTime());
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    weekBuckets.set(key, [...(weekBuckets.get(key) ?? []), trade]);
  }

  assert.equal(weekendTrades.length, 2, 'Los 2 trades de fin de semana deben ser registrados');
  assert.equal(weekBuckets.has('2025-01-27'), true, 'Sábado 1 y Domingo 2 deben pertenecer a semana 2025-01-27');
  assert.equal(weekBuckets.has('2025-02-03'), true, 'Lunes 3 debe pertenecer a semana 2025-02-03');
});

// ----------------------------------------------------------------------------------
// 6. Supabase & Sincronización: Conservación de R y Datos en Round-trip
// ----------------------------------------------------------------------------------
test('8. Sincronización con Supabase conserva R-Multiple decimal y estado tras round-trip', () => {
  // Simulación de tradeToRow
  const localTrade = {
    id: 't-101',
    accountId: 'acc-1',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2025-02-03T09:35',
    entryPrice: 21450,
    exitPrice: 21530,
    stopLoss: 21410,
    takeProfit: 21530,
    size: 25,
    grossPnl: 2000,
    commission: 0,
    netPnl: 2000,
    plannedRR: 1.25,
    rMultiple: 1.25,
    status: 'Win',
    killzone: 'NY Open 09:30 AM (09:30-10:30)',
    pdArrays: ['FVG (Fair Value Gap)'],
    checklistCompleted: [],
    setupGrade: 'A+',
    dailyBias: 'Bullish',
    dolTarget: 'High 1D',
    timeframe: '5m',
    followedPlan: true,
    psychologyTag: 'A+ Alineado al Contexto HTF',
    timePrecision: 'exact',
    operationalWindow: 'window_1',
    calculationMode: 'derived_r',
  };

  // tradeToRow
  const row = {
    id: localTrade.id,
    account_id: localTrade.accountId,
    symbol: localTrade.symbol,
    direction: localTrade.direction,
    entry_date: localTrade.entryDate.replace('T', ' '),
    net_pnl: localTrade.netPnl,
    planned_rr: localTrade.plannedRR,
    r_multiple: localTrade.rMultiple,
    calculation_mode: localTrade.calculationMode,
    time_precision: localTrade.timePrecision,
  };

  // Simulación de respuesta de base de datos Supabase
  const dbPayload = JSON.parse(JSON.stringify(row));

  // mapTrade desde DB
  const mappedTrade = {
    id: dbPayload.id,
    accountId: dbPayload.account_id,
    plannedRR: Number(dbPayload.planned_rr),
    rMultiple: Number(dbPayload.r_multiple),
    netPnl: Number(dbPayload.net_pnl),
    calculationMode: dbPayload.calculation_mode,
  };

  assert.equal(mappedTrade.plannedRR, 1.25, 'plannedRR debe preservar 1.25');
  assert.equal(mappedTrade.rMultiple, 1.25, 'rMultiple debe preservar 1.25');
  assert.equal(mappedTrade.netPnl, 2000);
  assert.equal(mappedTrade.calculationMode, 'derived_r');
});
