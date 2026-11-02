import type {
  Killzone,
  PDArray,
  PsychologyTag,
  Timeframe,
  Trade,
  TradeDirection,
  TradeSourceType,
  TradeStatus,
} from '../types/trading.ts';
import {
  ENTRY_MODELS,
  KILLZONES,
  PD_ARRAYS,
  PSYCHOLOGY_TAGS,
} from '../config/ict-constants.ts';
import { detectKillzoneFromTime } from './math-engine.ts';
import { generateTradeDeduplicationKey } from './storage-service.ts';
import { isValidDateKey } from './date-time-service.ts';

export type CsvImportEnvironment = Exclude<TradeSourceType, 'unclassified'>;
export type CsvImportFormat = 'notion' | 'tradingview' | 'generic';
export type CsvImportField =
  | 'entryDate'
  | 'symbol'
  | 'direction'
  | 'entryPrice'
  | 'exitPrice'
  | 'stopLoss'
  | 'takeProfit'
  | 'size'
  | 'commission'
  | 'grossPnl'
  | 'netPnl'
  | 'rMultiple'
  | 'plannedRR'
  | 'returnPct'
  | 'status'
  | 'result'
  | 'model'
  | 'killzone'
  | 'psychologyTag'
  | 'notes'
  | 'durationMinutes'
  | 'timeframe'
  | 'sourceEnvironment'
  | 'dolTarget';

export interface CsvFormatDetection {
  format: CsvImportFormat;
  delimiter: ',' | ';' | '\t';
  headers: string[];
  samples: Record<string, string>;
  rowCount: number;
  warnings: string[];
}

export interface CsvImportRow {
  rowNumber: number;
  status: 'ready' | 'duplicate' | 'rejected' | 'conflict';
  reviewed: boolean;
  trade?: Trade;
  sourceEnvironment?: string;
  messages: string[];
}

export interface CsvImportPreview {
  format: CsvImportFormat;
  headers: string[];
  rowCount: number;
  validCount: number;
  rejectedCount: number;
  duplicateCount: number;
  conflictCount: number;
  unreviewedConflictCount: number;
  warningCount: number;
  canImport: boolean;
  warnings: string[];
  rows: CsvImportRow[];
  tradesToImport: Trade[];
}

interface CsvRecord {
  rowNumber: number;
  values: string[];
}

interface ParsedCsv {
  headers: string[];
  records: CsvRecord[];
  delimiter: ',' | ';' | '\t';
  warnings: string[];
}

interface ParsedDate {
  entryDate: string;
  hasTime: boolean;
  explicitTimezone?: string;
  warning?: string;
}

const FIELD_LABELS: Record<CsvImportField, string> = {
  entryDate: 'Fecha y hora',
  symbol: 'Instrumento',
  direction: 'Dirección',
  entryPrice: 'Precio de entrada',
  exitPrice: 'Precio de salida',
  stopLoss: 'Stop loss',
  takeProfit: 'Take profit',
  size: 'Tamaño',
  commission: 'Comisión',
  grossPnl: 'P&L bruto',
  netPnl: 'P&L neto',
  rMultiple: 'R-Multiple',
  plannedRR: 'R planificado',
  returnPct: 'Retorno %',
  status: 'Resultado (TP/SL)',
  result: 'Resultado (detectar)',
  model: 'Modelo ICT',
  killzone: 'Killzone',
  psychologyTag: 'Etiqueta psicológica',
  notes: 'Notas',
  durationMinutes: 'Duración (minutos)',
  timeframe: 'Temporalidad',
  sourceEnvironment: 'Entorno de origen',
  dolTarget: 'Objetivo DOL',
};

const FIELD_ALIASES: ReadonlyArray<readonly [CsvImportField, readonly string[]]> = [
  ['entryDate', ['date', 'fecha', 'time', 'datetime', 'date time', 'fecha hora', 'fecha y hora', 'entry date', 'entry time', 'open time', 'created time', 'momento de entrada']],
  ['symbol', ['symbol', 'ticker', 'asset', 'instrument', 'instrumento', 'activo', 'par', 'contract', 'contrato']],
  ['direction', ['side', 'direction', 'direccion', 'lado', 'sentido', 'trade direction', 'tipo de operacion']],
  ['entryPrice', ['entry price', 'entry', 'entrada', 'precio entrada', 'precio de entrada', 'open price']],
  ['exitPrice', ['exit price', 'exit', 'salida', 'precio salida', 'precio de salida', 'close price']],
  ['stopLoss', ['stop loss', 'stoploss', 'sl', 'stop']],
  ['takeProfit', ['take profit', 'takeprofit', 'tp', 'target price']],
  ['size', ['size', 'qty', 'quantity', 'lotes', 'contratos', 'position size', 'tamaño']],
  ['commission', ['commission', 'fee', 'fees', 'comision', 'comisiones']],
  ['grossPnl', ['gross pnl', 'gross profit', 'pnl bruto', 'ganancia bruta']],
  ['netPnl', ['net pnl', 'net profit', 'profit', 'pnl', 'p&l', 'ganancia', 'beneficio', 'resultado monetario', 'resultado observado']],
  ['rMultiple', ['r', 'rr', 'r multiple', 'r-multiple', 'r_multiple', 'resultado r', 'result r', 'r value', 'r multiple result', 'r multiple realizado', 'r multiple observado', 'r multiple', 'r multiple final']],
  ['plannedRR', ['planned rr', 'planned r', 'r planificado', 'rr planificado']],
  ['returnPct', ['return', 'return percent', 'return pct', 'return %', 'retorno', 'retorno %', 'porcentaje retorno']],
  ['status', ['status', 'estado', 'outcome', 'win loss', 'resultado operacion']],
  ['result', ['result', 'resultado']],
  ['model', ['model', 'modelo', 'ict model', 'modelo ict', 'pd array', 'setup', 'mi modelo propio']],
  ['killzone', ['killzone', 'kill zone', 'ventana operativa', 'killzone ny']],
  ['psychologyTag', ['psychology', 'psychology tag', 'psychological tag', 'emotion', 'psicologia', 'etiqueta psicologica', 'tag psicologico', 'emocion']],
  ['notes', ['notes', 'note', 'notas', 'nota', 'journal', 'diario', 'comentarios']],
  ['durationMinutes', ['duration', 'duration minutes', 'minutes', 'duracion', 'duracion minutos', 'minutos']],
  ['timeframe', ['timeframe', 'time frame', 'temporalidad', 'marco temporal']],
  ['sourceEnvironment', ['source type', 'source environment', 'environment', 'environment type', 'entorno', 'entorno de origen', 'tipo de entorno', 'tipo de cuenta']],
  ['dolTarget', ['dol', 'target', 'draw on liquidity', 'objetivo dol']],
];

const TIMEFRAMES: readonly Timeframe[] = ['15m', '5m', '30m', '2H', '4H', '1D', '1m', '3m'];
const SOURCE_LABELS: Record<CsvImportEnvironment, string[]> = {
  real: ['real', 'live', 'cuenta real', 'operativa real'],
  backtest: ['backtest', 'backtesting', 'simulado', 'simulacion', 'simulation', 'historico simulado'],
  demo: ['demo', 'paper', 'practice', 'practica', 'simulador demo'],
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCsvRows(csvText: string, delimiter: string): string[][] {
  const text = csvText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if (char === '\n' && !quoted) {
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error('El CSV contiene una comilla sin cerrar.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  }
  return rows;
}

function countDelimiters(headerLine: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < headerLine.length; index += 1) {
    if (headerLine[index] === '"') {
      if (quoted && headerLine[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (headerLine[index] === delimiter && !quoted) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(csvText: string): ',' | ';' | '\t' {
  const firstLine = csvText.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const candidates: Array<',' | ';' | '\t'> = [',', ';', '\t'];
  return candidates.reduce((best, candidate) =>
    countDelimiters(firstLine, candidate) > countDelimiters(firstLine, best) ? candidate : best
  , ',');
}

function detectFormat(headers: string[]): CsvImportFormat {
  const normalized = headers.map(normalizeHeader);
  const has = (...names: string[]) => names.some((name) => normalized.includes(name));
  if ((has('symbol', 'ticker') && has('side', 'direction') && has('time', 'date', 'entry price', 'exit price', 'profit')) || has('tradingview id', 'order id')) {
    return 'tradingview';
  }
  if (has('name', 'created time', 'last edited time') ||
      (has('date', 'fecha', 'entry date', 'fecha hora') && has('asset', 'instrument', 'instrumento', 'activo', 'ticker')) ||
      (has('notas', 'notes', 'modelo ict') && has('date', 'fecha', 'entry date', 'fecha hora'))) {
    return 'notion';
  }
  return 'generic';
}

function parseDocument(csvText: string): ParsedCsv {
  const delimiter = detectDelimiter(csvText);
  const rawRows = parseCsvRows(csvText, delimiter);
  if (rawRows.length === 0) throw new Error('El archivo CSV está vacío.');

  const headers = rawRows[0].map((value) => value.trim().replace(/^\uFEFF/, ''));
  if (headers.length < 2 || headers.every((header) => !header)) {
    throw new Error('No se reconocieron encabezados en el CSV.');
  }
  const normalizedHeaders = headers.map(normalizeHeader);
  if (normalizedHeaders.some((header) => !header)) {
    throw new Error('El CSV tiene columnas sin nombre; asigna un encabezado antes de importar.');
  }
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error('El CSV contiene encabezados duplicados que no se pueden mapear con seguridad.');
  }

  const warnings: string[] = [];
  const records = rawRows.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      warnings.push(`Fila ${index + 2}: contiene ${values.length} celdas para ${headers.length} columnas.`);
    }
    return { rowNumber: index + 2, values };
  });
  return { headers, records, delimiter, warnings };
}

export function detectCsvFormat(csvText: string): CsvFormatDetection {
  const parsed = parseDocument(csvText);
  const paddedRows = parsed.records.filter((record) => record.values.length !== parsed.headers.length);
  return {
    format: detectFormat(parsed.headers),
    delimiter: parsed.delimiter,
    headers: parsed.headers,
    samples: Object.fromEntries(parsed.headers.map((header, index) => [header, parsed.records[0]?.values[index]?.trim() ?? ''])),
    rowCount: parsed.records.length,
    warnings: paddedRows.map((record) => `Fila ${record.rowNumber}: cantidad de celdas distinta al encabezado.`),
  };
}

export function getCsvImportFieldLabels(): Record<CsvImportField, string> {
  return { ...FIELD_LABELS };
}

export function suggestCsvColumnMappings(headers: readonly string[]): Record<string, CsvImportField | ''> {
  const result: Record<string, CsvImportField | ''> = {};
  const used = new Set<CsvImportField>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    const candidate = FIELD_ALIASES.find(([, aliases]) => aliases.some((alias) => normalizeHeader(alias) === normalized))?.[0] ?? '';
    if (candidate && !used.has(candidate)) {
      result[header] = candidate;
      used.add(candidate);
    } else {
      result[header] = '';
    }
  }
  return result;
}

function cellsForField(
  record: CsvRecord,
  headers: readonly string[],
  mappings: Record<string, CsvImportField | ''>,
  field: CsvImportField
): string[] {
  return headers.flatMap((header, index) => mappings[header] === field ? [record.values[index]?.trim() ?? ''] : []);
}

function valueForField(
  record: CsvRecord,
  headers: readonly string[],
  mappings: Record<string, CsvImportField | ''>,
  field: CsvImportField
): string {
  return cellsForField(record, headers, mappings, field).find((value) => value !== '') ?? '';
}

function parseDirection(rawValue: string): TradeDirection | null {
  const value = normalizeHeader(rawValue);
  if (['long', 'buy', 'compra', 'comprar', 'largo'].includes(value)) return 'Long';
  if (['short', 'sell', 'venta', 'vender', 'corto'].includes(value)) return 'Short';
  return null;
}

function parseStatus(rawValue: string): TradeStatus | null {
  const value = normalizeHeader(rawValue);
  if (['win', 'won', 'tp', 'take profit', 'ganada', 'ganador', 'profit', 'victoria'].includes(value)) return 'Win';
  if (['loss', 'lost', 'sl', 'stop loss', 'perdida', 'perdedor', 'loss trade'].includes(value)) return 'Loss';
  return null;
}

function parseNumber(rawValue: string, allowR = false): number | null {
  let value = rawValue.trim().replace(/[\s$€£¥]/g, '');
  if (!value) return null;
  if (allowR) value = value.replace(/r$/i, '');
  const parenthesesNegative = value.startsWith('(') && value.endsWith(')');
  if (parenthesesNegative) value = `-${value.slice(1, -1)}`;
  value = value.replace(/[^\d,.+-]/g, '');
  if (!value || !/[0-9]/.test(value)) return null;

  const commaCount = (value.match(/,/g) ?? []).length;
  const dotCount = (value.match(/\./g) ?? []).length;
  if (commaCount > 0 && dotCount > 0) {
    const lastComma = value.lastIndexOf(',');
    const lastDot = value.lastIndexOf('.');
    value = lastComma > lastDot
      ? value.replace(/\./g, '').replace(',', '.')
      : value.replace(/,/g, '');
  } else if (commaCount > 1) {
    const groups = value.split(',');
    if (groups.slice(1).every((group) => group.length === 3)) value = groups.join('');
    else return null;
  } else if (commaCount === 1) {
    const [whole, fraction = ''] = value.split(',');
    if (fraction.length === 3 && whole.replace(/^[+-]/, '').length > 0 && !allowR) return null;
    value = `${whole}.${fraction}`;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseDate(rawValue: string): ParsedDate | null {
  const value = rawValue.trim();
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/i);
  if (iso) {
    const [, year, month, day, hour, minute, , timezone] = iso;
    const dateKey = `${year}-${month}-${day}`;
    if (!isValidDateKey(dateKey)) return null;
    if (hour === undefined) return { entryDate: dateKey, hasTime: false };
    const hours = Number(hour);
    const minutes = Number(minute);
    if (hours > 23 || minutes > 59) return null;
    const explicitTimezone = timezone?.toUpperCase();
    return {
      entryDate: `${dateKey}T${hour}:${minute}`,
      hasTime: true,
      explicitTimezone,
      warning: explicitTimezone
        ? `La fecha trae zona horaria ${explicitTimezone}; se conserva la hora escrita como hora de operación y no se convierte a Nueva York.`
        : undefined,
    };
  }

  const numericDate = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i);
  if (numericDate) {
    const [, first, second, year, rawHour, minute, meridiem] = numericDate;
    const a = Number(first);
    const b = Number(second);
    if (a <= 12 && b <= 12) return null;
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    let hour = rawHour === undefined ? undefined : Number(rawHour);
    if (hour !== undefined && meridiem) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (meridiem.toUpperCase() === 'PM' ? 12 : 0);
    }
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!isValidDateKey(dateKey) || (hour !== undefined && hour > 23)) return null;
    return {
      entryDate: hour === undefined ? dateKey : `${dateKey}T${String(hour).padStart(2, '0')}:${minute}`,
      hasTime: hour !== undefined,
      warning: `La fecha numérica se interpretó por sus valores no ambiguos (${a > 12 ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}); revisa la vista previa.`,
    };
  }

  const monthNames: Record<string, string> = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03', apr: '04', april: '04',
    may: '05', jun: '06', june: '06', jul: '07', july: '07', aug: '08', august: '08', sep: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
  };
  const englishDate = value.match(/^(?:(\w+)\s+(\d{1,2}),?\s+(\d{4})|(\d{1,2})\s+(\w+)\s+(\d{4}))(?:[ T](\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i);
  if (englishDate) {
    const monthName = (englishDate[1] ?? englishDate[5]).toLowerCase();
    const month = monthNames[monthName];
    const day = Number(englishDate[2] ?? englishDate[4]);
    const year = englishDate[3] ?? englishDate[6];
    let hour = englishDate[7] === undefined ? undefined : Number(englishDate[7]);
    const minute = englishDate[8] ?? '00';
    const meridiem = englishDate[9];
    if (!month || !year) return null;
    if (hour !== undefined && meridiem) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (meridiem.toUpperCase() === 'PM' ? 12 : 0);
    }
    const dateKey = `${year}-${month}-${String(day).padStart(2, '0')}`;
    if (!isValidDateKey(dateKey) || (hour !== undefined && hour > 23)) return null;
    return {
      entryDate: hour === undefined ? dateKey : `${dateKey}T${String(hour).padStart(2, '0')}:${minute}`,
      hasTime: hour !== undefined,
    };
  }
  return null;
}

function parseEnvironment(rawValue: string): CsvImportEnvironment | null {
  const value = normalizeHeader(rawValue);
  if (!value) return null;
  for (const environment of Object.keys(SOURCE_LABELS) as CsvImportEnvironment[]) {
    if (SOURCE_LABELS[environment].some((label) => normalizeHeader(label) === value)) return environment;
  }
  return null;
}

function parseEnum<T extends string>(rawValue: string, values: readonly T[]): T | null {
  const normalized = normalizeHeader(rawValue);
  return values.find((value) => normalizeHeader(value) === normalized) ?? null;
}

function parseModel(rawValue: string): { values: PDArray[]; unknown: string[] } {
  const values: PDArray[] = [];
  const unknown: string[] = [];
  const parts = rawValue.split(/\s*[|;]\s*/).flatMap((part) => part.split(/\s*,\s*/)).filter(Boolean);
  for (const part of parts) {
    const match = [...ENTRY_MODELS, ...PD_ARRAYS].find((value) => normalizeHeader(value) === normalizeHeader(part));
    if (match && !values.includes(match)) values.push(match);
    else if (!match) unknown.push(part.trim());
  }
  return { values, unknown };
}

function parseTimeframe(rawValue: string): Timeframe | null {
  return TIMEFRAMES.find((value) => value.toLowerCase() === rawValue.trim().toLowerCase()) ?? null;
}

function deterministicId(key: string): string {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `csv-${(hash >>> 0).toString(16)}`;
}

function appendNotes(notes: string, entries: string[]): string {
  const additions = entries.filter(Boolean);
  return [notes.trim(), ...additions].filter(Boolean).join('\n');
}

function createTrade(
  record: CsvRecord,
  headers: readonly string[],
  mappings: Record<string, CsvImportField | ''>,
  environment: CsvImportEnvironment,
  accountId: string
): { trade: Trade | null; messages: string[]; sourceEnvironment?: string; environmentConflict?: boolean } {
  const messages: string[] = [];
  const rawDate = valueForField(record, headers, mappings, 'entryDate');
  const date = parseDate(rawDate);
  const symbol = valueForField(record, headers, mappings, 'symbol').trim();
  const rawDirection = valueForField(record, headers, mappings, 'direction');
  const direction = parseDirection(rawDirection);
  const rawStatus = valueForField(record, headers, mappings, 'status');
  const explicitStatus = parseStatus(rawStatus);
  const rawResult = valueForField(record, headers, mappings, 'result');
  const resultStatus = parseStatus(rawResult);
  const resultR = /r\s*$/i.test(rawResult) ? parseNumber(rawResult, true) : null;
  const resultMoney = /[$€£¥]/.test(rawResult) ? parseNumber(rawResult) : null;
  const explicitRText = valueForField(record, headers, mappings, 'rMultiple');
  const explicitR = explicitRText ? parseNumber(explicitRText, true) : resultR;
  const plannedRRText = valueForField(record, headers, mappings, 'plannedRR');
  const plannedRR = plannedRRText ? parseNumber(plannedRRText, true) : null;
  const rawNetPnl = valueForField(record, headers, mappings, 'netPnl');
  const explicitNetPnl = rawNetPnl ? parseNumber(rawNetPnl) : resultMoney;
  const rawReturn = valueForField(record, headers, mappings, 'returnPct');
  const returnPct = rawReturn ? parseNumber(rawReturn) : null;
  const inferredResultStatus = explicitStatus ?? resultStatus ??
    (explicitR !== null && explicitR !== 0 ? (explicitR > 0 ? 'Win' : 'Loss') : null) ??
    (explicitNetPnl !== null && explicitNetPnl !== 0 ? (explicitNetPnl > 0 ? 'Win' : 'Loss') : null) ??
    (returnPct !== null && returnPct !== 0 ? (returnPct > 0 ? 'Win' : 'Loss') : null);

  if (!date) messages.push(rawDate ? 'Fecha inválida o ambigua; corrige el formato antes de importar.' : 'Falta la fecha de la operación.');
  if (!symbol) messages.push('Falta el instrumento; no se asigna NAS100 por defecto.');
  if (!direction) messages.push('Falta una dirección Long/Short reconocible; no se asigna una dirección por defecto.');
  if (!inferredResultStatus) messages.push('Falta un resultado verificable (R, P&L, retorno o TP/SL).');
  if (rawStatus && !explicitStatus) messages.push(`Resultado no reconocido: ${rawStatus}.`);
  if (rawResult && resultR === null && resultMoney === null && !resultStatus && explicitR === null && explicitNetPnl === null) {
    messages.push(`El campo Resultado es ambiguo o no reconocido: ${rawResult}. Mapea la columna a R-Multiple, P&L o Resultado (TP/SL).`);
  }

  const rawSource = valueForField(record, headers, mappings, 'sourceEnvironment');
  const sourceEnvironment = rawSource.trim() || undefined;
  const parsedSource = rawSource ? parseEnvironment(rawSource) : null;
  const isEnvironmentConflict = Boolean(rawSource && (!parsedSource || parsedSource !== environment));
  if (rawSource && !parsedSource) messages.push(`Entorno de origen no reconocido: ${rawSource}. Revisa esta fila antes de asignarla a ${environment}.`);
  else if (parsedSource && parsedSource !== environment) messages.push(`Conflicto de entorno: CSV indica ${parsedSource}; selector indica ${environment}.`);

  if (!date || !symbol || !direction || !inferredResultStatus) {
    return { trade: null, messages, sourceEnvironment };
  }

  const entryPrice = parseNumber(valueForField(record, headers, mappings, 'entryPrice'));
  const exitPrice = parseNumber(valueForField(record, headers, mappings, 'exitPrice'));
  const stopLoss = parseNumber(valueForField(record, headers, mappings, 'stopLoss'));
  const takeProfit = parseNumber(valueForField(record, headers, mappings, 'takeProfit'));
  const size = parseNumber(valueForField(record, headers, mappings, 'size'));
  const commissionText = valueForField(record, headers, mappings, 'commission');
  const commission = commissionText ? parseNumber(commissionText) : null;
  const grossPnlText = valueForField(record, headers, mappings, 'grossPnl');
  const grossPnl = grossPnlText ? parseNumber(grossPnlText) : null;
  const modelText = valueForField(record, headers, mappings, 'model');
  const model = parseModel(modelText);
  const rawKillzone = valueForField(record, headers, mappings, 'killzone');
  const explicitKillzone = parseEnum(rawKillzone, KILLZONES);
  const rawPsychology = valueForField(record, headers, mappings, 'psychologyTag');
  const explicitPsychology = parseEnum(rawPsychology, PSYCHOLOGY_TAGS);
  const rawTimeframe = valueForField(record, headers, mappings, 'timeframe');
  const timeframe = parseTimeframe(rawTimeframe);
  const rawDuration = valueForField(record, headers, mappings, 'durationMinutes');
  const duration = rawDuration ? parseNumber(rawDuration) : null;
  const baseNotes = valueForField(record, headers, mappings, 'notes');
  const preservationNotes: string[] = [];

  if (date.warning) messages.push(date.warning);
  if (date.explicitTimezone) preservationNotes.push(`Fecha/hora original CSV (zona explícita, hora conservada): ${rawDate}`);
  if (!date.hasTime && !explicitKillzone) {
    messages.push('Falta hora y killzone; no se puede asignar una ventana operativa sin inventarla. Mapea una killzone para esta fila.');
    return { trade: null, messages, sourceEnvironment };
  }

  const killzone: Killzone = explicitKillzone ?? detectKillzoneFromTime(date.entryDate);
  if (date.hasTime && !explicitKillzone) {
    messages.push('Killzone inferida con la hora escrita en el CSV como hora de Nueva York; no se aplicó conversión horaria.');
  }
  if (rawKillzone && !explicitKillzone) {
    messages.push(`Killzone no reconocida: ${rawKillzone}; se usó la hora solo cuando estaba disponible.`);
    preservationNotes.push(`Killzone original CSV: ${rawKillzone}`);
  }
  if (model.unknown.length > 0) {
    messages.push(`Modelo ICT no reconocido y no clasificado: ${model.unknown.join(', ')}.`);
    preservationNotes.push(`Modelo ICT original CSV: ${model.unknown.join(', ')}`);
  }
  if (rawPsychology && !explicitPsychology) {
    messages.push(`Etiqueta psicológica no reconocida y no clasificada: ${rawPsychology}.`);
    preservationNotes.push(`Etiqueta psicológica original CSV: ${rawPsychology}`);
  }
  if (rawTimeframe && !timeframe) {
    messages.push(`Temporalidad no reconocida: ${rawTimeframe}; se conserva en notas.`);
    preservationNotes.push(`Temporalidad original CSV: ${rawTimeframe}`);
  }
  if (!rawTimeframe) {
    preservationNotes.push('Temporalidad ausente en CSV; se asignó 15m solo por requisito técnico y no como dato registrado.');
  }

  const mappedHeaders = new Set(Object.entries(mappings).filter(([, field]) => field !== '').map(([header]) => header));
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    const rawValue = record.values[index]?.trim() ?? '';
    if (rawValue && !mappedHeaders.has(header)) {
      preservationNotes.push(`CSV ${header}: ${rawValue}`);
      messages.push(`Columna sin mapear guardada en notas: ${header}.`);
    }
  }

  if (commissionText && commission === null) messages.push(`Comisión no numérica: ${commissionText}.`);
  if (grossPnlText && grossPnl === null) messages.push(`P&L bruto no numérico: ${grossPnlText}.`);
  if (rawDuration && (!Number.isInteger(duration) || (duration ?? -1) < 0)) messages.push(`Duración no reconocida: ${rawDuration}.`);
  if (size === null) messages.push('Tamaño ausente; se conserva como 0 sin inferir contratos.');
  if (timeframe === null) messages.push('Temporalidad ausente; Martin OS requiere 15m como valor técnico y se deja constancia en notas.');

  const entryPriceValue = entryPrice ?? 0;
  const exitPriceValue = exitPrice ?? 0;
  const stopLossValue = stopLoss ?? 0;
  const takeProfitValue = takeProfit ?? 0;
  const netPnlValue = explicitNetPnl ?? 0;
  const grossPnlValue = grossPnl ?? 0;
  const rMultiple = explicitR ?? 0;
  const baseDateKey = date.entryDate;
  const deduplicationKey = generateTradeDeduplicationKey({
    entryDate: baseDateKey,
    symbol,
    direction,
    entryPrice: entryPriceValue,
    exitPrice: exitPriceValue,
    sourceType: environment,
  });
  const trade: Trade = {
    id: deterministicId(deduplicationKey),
    symbol,
    direction,
    entryDate: date.entryDate,
    entryPrice: entryPriceValue,
    exitPrice: exitPriceValue,
    stopLoss: stopLossValue,
    takeProfit: takeProfitValue,
    size: size ?? 0,
    riskPercentUsed: undefined,
    htfAligned: [],
    grossPnl: grossPnlValue,
    commission: commission ?? 0,
    commissionUnmeasured: commission === null,
    netPnl: netPnlValue,
    plannedRR: plannedRR ?? 0,
    rMultiple,
    rUnrecorded: explicitR === null,
    status: inferredResultStatus,
    killzone,
    pdArrays: model.values,
    checklistCompleted: [],
    setupGrade: 'Sin evaluar',
    dailyBias: 'Neutral',
    dolTarget: valueForField(record, headers, mappings, 'dolTarget'),
    timeframe: timeframe ?? '15m',
    followedPlan: false,
    planUnrecorded: true,
    psychologyTag: explicitPsychology ?? 'Sin clasificar',
    notes: appendNotes(baseNotes, preservationNotes),
    accountId,
    timePrecision: date.hasTime ? 'exact' : undefined,
    calculationMode: explicitNetPnl !== null || grossPnl !== null ? 'monetary' : 'unrecorded',
    pnlProvenance: explicitNetPnl !== null ? 'audited' : grossPnl !== null ? 'audited' : 'unrecorded',
    pricesUnrecorded: entryPrice === null || exitPrice === null,
    realizedNetReturnPct: returnPct,
    durationMinutes: Number.isInteger(duration) ? duration : null,
    sourceType: environment,
  };
  return { trade, messages, sourceEnvironment, ...(isEnvironmentConflict ? { environmentConflict: true } : {}) };
}

export function buildCsvImportPreview(input: {
  csvText: string;
  environment: CsvImportEnvironment;
  accountId: string;
  mappings: Record<string, CsvImportField | ''>;
  existingTrades: readonly Trade[];
  reviewedConflictRows?: readonly number[];
}): CsvImportPreview {
  const parsed = parseDocument(input.csvText);
  const format = detectFormat(parsed.headers);
  const reviewedRows = new Set(input.reviewedConflictRows ?? []);
  const seenKeys = new Set(input.existingTrades.map((trade) => generateTradeDeduplicationKey(trade)));
  const rows: CsvImportRow[] = parsed.records.map((record) => {
    if (record.values.length !== parsed.headers.length) {
      return {
        rowNumber: record.rowNumber,
        status: 'rejected',
        reviewed: false,
        messages: [`Fila mal formada: contiene ${record.values.length} celdas para ${parsed.headers.length} columnas; se excluye para evitar desplazamientos de datos.`],
      };
    }
    const created = createTrade(record, parsed.headers, input.mappings, input.environment, input.accountId);
    const conflict = Boolean(created.environmentConflict);
    const reviewed = conflict && reviewedRows.has(record.rowNumber);
    if (!created.trade) {
      return {
        rowNumber: record.rowNumber,
        status: 'rejected',
        reviewed: false,
        sourceEnvironment: created.sourceEnvironment,
        messages: created.messages,
      };
    }
    const key = generateTradeDeduplicationKey(created.trade);
    if (seenKeys.has(key)) {
      return {
        rowNumber: record.rowNumber,
        status: 'duplicate',
        reviewed: false,
        trade: created.trade,
        sourceEnvironment: created.sourceEnvironment,
        messages: [...created.messages, 'Operación duplicada dentro del archivo o en el historial; se preserva la existente.'],
      };
    }
    seenKeys.add(key);
    return {
      rowNumber: record.rowNumber,
      status: conflict ? 'conflict' : 'ready',
      reviewed,
      trade: created.trade,
      sourceEnvironment: created.sourceEnvironment,
      messages: created.messages,
    };
  });

  const validCount = rows.filter((row) => row.status === 'ready' || (row.status === 'conflict' && row.reviewed)).length;
  const rejectedCount = rows.filter((row) => row.status === 'rejected').length;
  const duplicateCount = rows.filter((row) => row.status === 'duplicate').length;
  const conflictCount = rows.filter((row) => row.status === 'conflict').length;
  const unreviewedConflictCount = rows.filter((row) => row.status === 'conflict' && !row.reviewed).length;
  const warnings = [...parsed.warnings, ...rows.flatMap((row) => row.messages)];
  const tradesToImport = rows
    .filter((row) => row.status === 'ready' || (row.status === 'conflict' && row.reviewed))
    .flatMap((row) => row.trade ? [row.trade] : []);

  return {
    format,
    headers: parsed.headers,
    rowCount: parsed.records.length,
    validCount,
    rejectedCount,
    duplicateCount,
    conflictCount,
    unreviewedConflictCount,
    warningCount: warnings.length,
    canImport: validCount > 0 && unreviewedConflictCount === 0,
    warnings,
    rows,
    tradesToImport,
  };
}

export function mergeCsvTrades(existingTrades: readonly Trade[], importedTrades: readonly Trade[]): Trade[] {
  const seenKeys = new Set(existingTrades.map((trade) => generateTradeDeduplicationKey(trade)));
  const additions: Trade[] = [];
  for (const trade of importedTrades) {
    const key = generateTradeDeduplicationKey(trade);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    additions.push(trade);
  }
  return additions.length > 0 ? [...additions, ...existingTrades] : [...existingTrades];
}

export function getCsvImportFields(): CsvImportField[] {
  return Object.keys(FIELD_LABELS) as CsvImportField[];
}

export function parseCsvImportEnvironment(value: string): CsvImportEnvironment | null {
  return parseEnvironment(value);
}

export function parseCsvImportEnumValues(): {
  killzones: readonly Killzone[];
  models: readonly PDArray[];
  psychologyTags: readonly PsychologyTag[];
} {
  return { killzones: KILLZONES, models: PD_ARRAYS, psychologyTags: PSYCHOLOGY_TAGS };
}

export function getCsvImportFieldLabel(field: CsvImportField): string {
  return FIELD_LABELS[field];
}
