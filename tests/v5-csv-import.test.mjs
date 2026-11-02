import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  buildCsvImportPreview,
  detectCsvFormat,
  mergeCsvTrades,
  suggestCsvColumnMappings,
} from '../src/services/csv-import-service.ts';
import {
  calculateBacktestVsRealComparison,
} from '../src/services/edge-analytics-service.ts';
import { buildAnalystGroundingContext } from '../src/services/ai-analyst-service.ts';
import { filterMonteCarloTrades } from '../src/services/monte-carlo-service.ts';
import { mapTrade, tradeToRow } from '../src/services/cloud-sync-service.ts';
import { validateBackupPayload } from '../src/services/storage-service.ts';

const fixtureDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'csv');
const fixture = (name) => readFileSync(path.join(fixtureDirectory, name), 'utf8');
const accountId = 'account-csv-test';

function preview(csvText, environment, options = {}) {
  const detection = detectCsvFormat(csvText);
  return buildCsvImportPreview({
    csvText,
    environment,
    accountId: options.accountId ?? accountId,
    mappings: { ...suggestCsvColumnMappings(detection.headers), ...options.mappings },
    existingTrades: options.existingTrades ?? [],
    reviewedConflictRows: options.reviewedConflictRows ?? [],
    reviewedFinancialConflictRows: options.reviewedFinancialConflictRows ?? [],
    reviewedPossibleDuplicateRows: options.reviewedPossibleDuplicateRows ?? [],
  });
}

test('Importa CSV de Notion a Backtesting aunque el archivo no tenga columna de entorno', () => {
  const result = preview(fixture('notion-backtesting.csv'), 'backtest');

  assert.equal(result.format, 'notion');
  assert.equal(result.rowCount, 1);
  assert.equal(result.validCount, 1);
  assert.equal(result.rejectedCount, 0);
  assert.equal(result.rows[0].trade.sourceType, 'backtest');
  assert.equal(result.rows[0].trade.entryDate, '2026-02-12T09:32');
  assert.equal(result.rows[0].trade.rMultiple, 2);
  assert.equal(result.rows[0].trade.plannedRR, 0, 'No debe inferir R planificado a partir del R realizado');
  assert.deepEqual(result.rows[0].trade.pdArrays, ['Breaker Block']);
  assert.equal(result.rows[0].trade.psychologyTag, 'FOMO (Perseguir Precio)');
  assert.ok(result.rows[0].trade.notes.startsWith('Entrada desde nivel documentado'));
  assert.equal(result.rows[0].trade.netPnl, 0, 'No debe inventar P&L monetario a partir de R');
});

test('Importa columnas conocidas de TradingView a Real y conserva valores explícitos', () => {
  const result = preview(fixture('tradingview-real.csv'), 'real');
  const trade = result.rows[0].trade;

  assert.equal(result.format, 'tradingview');
  assert.equal(result.validCount, 1);
  assert.equal(trade.sourceType, 'real');
  assert.equal(trade.direction, 'Short');
  assert.equal(trade.entryPrice, 21450);
  assert.equal(trade.exitPrice, 21400);
  assert.equal(trade.rMultiple, -1.25);
  assert.equal(trade.netPnl, -125);
  assert.equal(trade.commission, 2);
});

test('Importa CSV Notion a Demo sin confundir Environment con un campo obligatorio del archivo', () => {
  const result = preview(fixture('notion-demo.csv'), 'demo');

  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].trade.sourceType, 'demo');
  assert.equal(result.rows[0].trade.rMultiple, 1.5);
  assert.deepEqual(result.rows[0].trade.pdArrays, ['Key Level']);
});

test('Rechaza registros incompletos sin fecha, instrumento, dirección o resultado verificable', () => {
  const result = preview(fixture('incomplete.csv'), 'real');

  assert.equal(result.rowCount, 1);
  assert.equal(result.validCount, 0);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.canImport, false);
  assert.ok(result.rows[0].messages.some((message) => /resultado/i.test(message)));
});

test('Rechaza filas con número de celdas distinto para evitar desplazar columnas', () => {
  const result = preview(
    'Date,Symbol,Side,R,Notes\n2026-02-11T09:40,NAS100,Long,1R,nota,celda extra',
    'real'
  );

  assert.equal(result.rejectedCount, 1);
  assert.equal(result.validCount, 0);
  assert.match(result.rows[0].messages[0], /evitar desplazamientos/i);
});

test('Cuenta duplicados internos y contra historial existente sin reemplazar operaciones', () => {
  const allRows = preview(fixture('duplicates.csv'), 'backtest');
  const first = allRows.rows[0].trade;
  const withExisting = preview(fixture('duplicates.csv'), 'backtest', { existingTrades: [first] });

  assert.equal(allRows.validCount, 1);
  assert.equal(allRows.duplicateCount, 1);
  assert.match(allRows.rows[0].trade.id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(withExisting.validCount, 0);
  assert.equal(withExisting.duplicateCount, 2);
  assert.equal(withExisting.tradesToImport.length, 0);
});

test('El ID de origen se delimita por cuenta y persiste con el account_id correcto en Supabase', () => {
  const csvText = fixture('duplicates.csv');
  const firstAccountId = '1f0d4af2-65e2-4b20-9cd0-a22e517f2b7b';
  const secondAccountId = '6bd95dd3-d233-4cb5-a123-9b6f3d0d98c1';
  const firstAccount = preview(csvText, 'real', { accountId: firstAccountId });
  const secondAccount = preview(csvText, 'real', { accountId: secondAccountId });

  assert.equal(firstAccount.validCount, 1);
  assert.equal(secondAccount.validCount, 1);
  assert.equal(firstAccount.duplicateCount, 1);
  assert.equal(secondAccount.duplicateCount, 1);
  assert.notEqual(firstAccount.tradesToImport[0].id, secondAccount.tradesToImport[0].id);

  const row = tradeToRow(firstAccount.tradesToImport[0], null);
  const reloaded = mapTrade(row);
  assert.match(row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(row.account_id, firstAccountId);
  assert.equal(reloaded.id, firstAccount.tradesToImport[0].id);
  assert.equal(reloaded.accountId, firstAccountId);
});

test('Reimportar el mismo ID de origen en la misma cuenta no agrega otra operación', () => {
  const original = preview(fixture('duplicates.csv'), 'real', { accountId });
  const reimport = preview(fixture('duplicates.csv'), 'real', {
    accountId,
    existingTrades: original.tradesToImport,
  });

  assert.equal(original.validCount, 1);
  assert.equal(reimport.duplicateCount, 2);
  assert.equal(reimport.validCount, 0);
  assert.equal(reimport.tradesToImport.length, 0);
  assert.equal(mergeCsvTrades(original.tradesToImport, reimport.tradesToImport).length, 1);
});

test('Detecta semicolon, coma decimal, comillas multilínea y conserva hora con zona sin desplazarla', () => {
  const csvText = fixture('mixed-format.csv');
  const detection = detectCsvFormat(csvText);
  const result = preview(csvText, 'backtest');
  const trade = result.rows[0].trade;

  assert.equal(detection.delimiter, ';');
  assert.equal(result.format, 'notion');
  assert.equal(result.validCount, 1);
  assert.equal(trade.rMultiple, 1.25);
  assert.equal(trade.entryDate, '2026-02-17T09:37');
  assert.match(trade.notes, /Primera línea\nsegunda línea; con separador/);
  assert.ok(result.rows[0].messages.some((message) => /zona horaria/i.test(message)));
  assert.match(trade.notes, /2026-02-17T09:37:00-05:00/);
});

test('Permite mapear manualmente campos desconocidos del CSV a campos Martin OS', () => {
  const csvText = fixture('manual-mapping.csv');
  const detection = detectCsvFormat(csvText);
  const mappings = suggestCsvColumnMappings(detection.headers);
  mappings['Momento de entrada'] = 'entryDate';
  mappings['Contrato'] = 'symbol';
  mappings['Sentido'] = 'direction';
  mappings['Resultado observado'] = 'rMultiple';
  mappings['Mi modelo propio'] = 'model';
  mappings['Diario'] = 'notes';
  const result = buildCsvImportPreview({
    csvText,
    environment: 'backtest',
    accountId,
    mappings,
    existingTrades: [],
  });

  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].trade.symbol, 'NAS100');
  assert.equal(result.rows[0].trade.direction, 'Long');
  assert.equal(result.rows[0].trade.rMultiple, 2);
  assert.deepEqual(result.rows[0].trade.pdArrays, ['Key Level']);
  assert.ok(result.rows[0].trade.notes.startsWith('Setup revisado'));
});

test('Rechaza fechas ambiguas y fechas sin hora para no persistir medianoche como hora exacta', () => {
  const ambiguous = preview(
    'Date,Symbol,Side,R-Multiple,Killzone\n02/03/2026,NAS100,Long,1R,NY Open 09:30 AM (09:30-10:30)',
    'real'
  );
  const dateOnly = preview(
    'Date,Symbol,Side,R-Multiple,Killzone\n2026-02-20,NAS100,Long,1R,NY Mid-Morning (10:30-12:00)',
    'real'
  );

  assert.equal(ambiguous.rejectedCount, 1);
  assert.ok(ambiguous.rows[0].messages.some((message) => /ambigua/i.test(message)));
  assert.equal(dateOnly.validCount, 0);
  assert.equal(dateOnly.rejectedCount, 1);
  assert.equal(dateOnly.rows[0].trade, undefined);
  assert.match(dateOnly.rows[0].messages.join(' '), /no incluye hora.*no se importa/i);
});

test('No descarta como duplicados dos operaciones sin precios con fecha, instrumento y dirección iguales', () => {
  const csvText = [
    'Date,Symbol,Side,R-Multiple,Killzone',
    '2026-02-20T09:35,NAS100,Long,2R,NY Open 09:30 AM (09:30-10:30)',
    '2026-02-20T10:02,NAS100,Long,-1R,NY Open 09:30 AM (09:30-10:30)',
  ].join('\n');
  const pending = preview(csvText, 'backtest');
  const reviewed = preview(csvText, 'backtest', { reviewedPossibleDuplicateRows: [2, 3] });

  assert.equal(pending.duplicateCount, 0);
  assert.equal(pending.possibleDuplicateCount, 1);
  assert.equal(pending.validCount, 1);
  assert.equal(pending.canImport, false);
  assert.equal(reviewed.validCount, 2);
  assert.equal(reviewed.tradesToImport.length, 2);
  assert.deepEqual(reviewed.tradesToImport.map((trade) => trade.rMultiple), [2, -1]);
  assert.equal(mergeCsvTrades([], reviewed.tradesToImport).length, 2);
});

test('Contradicciones entre R, P&L, retorno y Win/Loss quedan marcadas y excluidas de agregados, Monte Carlo e IA', () => {
  const result = preview(
    'Date,Symbol,Side,R-Multiple,Net PnL,Return %,Status,Killzone\n2026-02-22T09:40,NAS100,Long,2R,-500,-2.5%,Win,NY Open 09:30 AM (09:30-10:30)',
    'real',
    { reviewedFinancialConflictRows: [2] }
  );
  const contradicted = result.tradesToImport[0];
  const reloaded = mapTrade({ ...tradeToRow(contradicted, null), id: contradicted.id, account_id: contradicted.accountId });

  assert.equal(result.financialConflictCount, 1);
  assert.equal(contradicted.hasDataConflict, true);
  assert.ok(contradicted.conflictReasons.length >= 3);
  assert.equal(reloaded.hasDataConflict, true);
  assert.deepEqual(reloaded.conflictReasons, contradicted.conflictReasons);
  assert.equal(filterMonteCarloTrades([reloaded], 'real').validTrades.length, 0);
  assert.equal(buildAnalystGroundingContext([reloaded], 'real').sampleSummary.totalTrades, 0);
  assert.equal(calculateBacktestVsRealComparison([reloaded]).realCohort.totalTrades, 0);
});

test('Fecha y hora exactas mantienen su precisión al persistir y recargar desde Supabase', () => {
  const imported = preview(fixture('notion-backtesting.csv'), 'backtest').tradesToImport[0];
  const row = tradeToRow(imported, null);
  const reloaded = mapTrade({ ...row, id: imported.id, account_id: imported.accountId });

  assert.match(imported.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(row.entry_date, '2026-02-12 09:32');
  assert.equal(row.time_precision, 'exact');
  assert.equal(reloaded.entryDate, '2026-02-12T09:32');
  assert.equal(reloaded.timePrecision, 'exact');
});

test('No inventa un modelo ICT ni una etiqueta psicológica desconocidos; conserva sus textos originales', () => {
  const result = preview(
    'Date,Symbol,Side,R,Model,Psychology\n2026-02-21T09:40:00,NAS100,Long,1R,My Proprietary Setup,High Conviction',
    'demo'
  );
  const trade = result.rows[0].trade;

  assert.equal(result.validCount, 1);
  assert.deepEqual(trade.pdArrays, []);
  assert.equal(trade.psychologyTag, 'Sin clasificar');
  assert.match(trade.notes, /My Proprietary Setup/);
  assert.match(trade.notes, /High Conviction/);
  assert.ok(result.rows[0].messages.length >= 2);
});

test('Bloquea entorno explícito contradictorio hasta que la fila quede revisada', () => {
  const csvText = fixture('notion-demo.csv');
  const blocked = preview(csvText, 'backtest');
  const reviewed = preview(csvText, 'backtest', { reviewedConflictRows: [2] });

  assert.equal(blocked.conflictCount, 1);
  assert.equal(blocked.canImport, false);
  assert.equal(blocked.tradesToImport.length, 0);
  assert.equal(reviewed.conflictCount, 1);
  assert.equal(reviewed.unreviewedConflictCount, 0);
  assert.equal(reviewed.canImport, true);
  assert.equal(reviewed.tradesToImport[0].sourceType, 'backtest');
});

test('La importación mantiene entornos segregados en estadísticas y contexto del Analista IA', () => {
  const imported = [
    ...preview(fixture('notion-backtesting.csv'), 'backtest').tradesToImport,
    ...preview(fixture('tradingview-real.csv'), 'real').tradesToImport,
    ...preview(fixture('notion-demo.csv'), 'demo').tradesToImport,
  ];
  const comparison = calculateBacktestVsRealComparison(imported);
  const aiContext = buildAnalystGroundingContext(imported, 'demo');

  assert.equal(comparison.backtestCohort.totalTrades, 1);
  assert.equal(comparison.realCohort.totalTrades, 1);
  assert.equal(aiContext.sampleSummary.totalTrades, 1);
  assert.equal(aiContext.sampleSummary.validRTrades, 1);
  assert.match(aiContext.systemPrompt, /ENTORNO ACTIVO ANALIZADO: DEMO/);
  assert.match(aiContext.systemPrompt, /\+1\.50R/);
});

test('El archivo CSV se puede restaurar dentro del backup v3 sin cambiar su contrato', () => {
  const trade = preview(fixture('notion-backtesting.csv'), 'backtest').tradesToImport[0];
  assert.equal(validateBackupPayload({
    version: '3.0',
    exportedAt: '2026-02-20T00:00:00.000Z',
    trades: [trade],
    accounts: [],
    playbooks: [],
    dailyNotes: {},
  }), true);
});
