import type {
  Trade,
  PropAccount,
  DailyJournalNote,
  ICTPlaybook,
  PersonalTradingRule,
  PnlProvenance,
  TradeSourceType,
} from '../types/trading.ts';
import {
  autoCalculateTradeMath,
  detectKillzoneFromTime,
} from './math-engine.ts';

export const STORAGE_KEYS = {
  TRADES: 'zella_ict_trades_v3',
  ACCOUNTS: 'zella_ict_accounts_v3',
  PLAYBOOKS: 'zella_ict_playbooks_v3',
  DAILY_NOTES: 'zella_ict_daily_notes_v3',
  PERSONAL_RULES: 'zella_ict_personal_rules_v1',
  DEFAULT_ACCOUNT: 'zella_ict_default_account_v1',
};

export function resolveTradeImage(trade: {
  screenshotDataUrl?: string;
  tradingViewUrl?: string;
}): string | null {
  if (trade.screenshotDataUrl && trade.screenshotDataUrl.startsWith('data:image/')) {
    return trade.screenshotDataUrl;
  }
  if (!trade.tradingViewUrl) return null;
  const trimmed = trade.tradingViewUrl.trim();
  if (trimmed.match(/\.(png|jpg|jpeg|webp)$/i)) return trimmed;

  const match = trimmed.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/);
  if (match && match[1]) {
    const code = match[1];
    const firstChar = code.charAt(0).toLowerCase();
    return `https://s3.tradingview.com/snapshots/${firstChar}/${code}.png`;
  }
  return null;
}

/**
 * Splits a CSV line according to RFC 4180 rules, properly handling fields
 * enclosed in double quotes that contain commas (such as "1,25").
 */
export function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, '').trim());
  return result;
}

/**
 * Parses numeric values from CSV cells, supporting both dot and comma decimal separators
 * (e.g. "1,25" -> 1.25, "-0,75" -> -0.75, "2.50" -> 2.5).
 */
export function parseCsvNumber(raw: string | undefined): number {
  if (!raw) return NaN;
  const clean = raw.trim().replace(/^"|"$/g, '').trim();
  if (!clean) return NaN;
  const normalized =
    clean.includes(',') && !clean.includes('.')
      ? clean.replace(',', '.')
      : clean.replace(/,/g, '');
  const val = parseFloat(normalized);
  return Number.isFinite(val) ? val : NaN;
}

export function generateTradeDeduplicationKey(trade: {
  entryDate: string;
  symbol: string;
  direction: string;
  entryPrice?: number;
  exitPrice?: number;
  sourceType?: string;
}): string {
  const datePart = trade.entryDate.replace(' ', 'T').slice(0, 16);
  const symPart = trade.symbol.trim().toUpperCase();
  const dirPart = (trade.direction || '').trim().toLowerCase();
  const entryPart = Number(trade.entryPrice || 0).toFixed(4);
  const exitPart = Number(trade.exitPrice || 0).toFixed(4);
  const srcPart = (trade.sourceType || 'unclassified').trim().toLowerCase();
  return `${datePart}_${symPart}_${dirPart}_${entryPart}_${exitPart}_${srcPart}`;
}

// Soporta CSV exportado de Notion y de TradingView (con soporte para comas decimales y campos entrecomillados)
export function parseTradingViewCSV(
  csvText: string,
  targetAccountId: string,
  defaultSourceType: TradeSourceType = 'unclassified',
  existingTrades: readonly Trade[] = []
): Trade[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase());
  const imported: Trade[] = [];
  const seenKeys = new Set<string>(
    existingTrades.map((t) => generateTradeDeduplicationKey(t))
  );
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    if (cols.length < 2) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });

    const symbol = (
      row['symbol'] ||
      row['activo'] ||
      row['par'] ||
      row['instrument'] ||
      row['ticker'] ||
      'NAS100'
    ).toUpperCase();

    const rawSide = (
      row['side'] ||
      row['direction'] ||
      row['dirección'] ||
      row['direccion'] ||
      row['tipo'] ||
      row['type'] ||
      'long'
    ).toLowerCase();
    const direction =
      rawSide.includes('short') || rawSide.includes('sell') || rawSide.includes('venta')
        ? 'Short'
        : 'Long';

    const entryPrice =
      parseCsvNumber(row['entry price'] || row['entrada'] || row['entry'] || row['price']) || 0;
    const exitPrice =
      parseCsvNumber(row['exit price'] || row['salida'] || row['exit']) || 0;
    const stopLoss = parseCsvNumber(row['stop loss'] || row['sl']) || 0;
    const takeProfit = parseCsvNumber(row['take profit'] || row['tp']) || 0;
    const size =
      parseCsvNumber(row['qty'] || row['size'] || row['lotes'] || row['contratos']) || 1;
    const rawCommission = parseCsvNumber(row['commission'] || row['fee']);
    const hasMeasuredCommission = !isNaN(rawCommission);
    const commission = hasMeasuredCommission ? rawCommission : 0;

    const rawDate = (
      row['time'] ||
      row['date'] ||
      row['fecha'] ||
      row['entry time'] ||
      new Date().toISOString().slice(0, 16)
    ).trim();
    const formattedDate = rawDate.includes('T')
      ? rawDate.slice(0, 16)
      : rawDate.includes(' ')
      ? (rawDate.replace(' ', 'T').length >= 16
          ? rawDate.replace(' ', 'T').slice(0, 16)
          : `${rawDate.slice(0, 10)}T09:30`)
      : `${rawDate.slice(0, 10)}T09:30`;

    const calc = autoCalculateTradeMath({
      symbol,
      entryPrice,
      exitPrice,
      stopLoss,
      takeProfit,
      size,
      commission,
      direction,
      hasMeasuredCommission,
    });

    const explicitPnl = parseCsvNumber(
      row['pnl'] || row['profit'] || row['net pnl'] || row['resultado'] || row['ganancia']
    );
    const explicitR = parseCsvNumber(
      row['r'] || row['rr'] || row['r-multiple'] || row['r multiple'] || row['r_multiple']
    );
    const explicitReturnPct = parseCsvNumber(
      row['return'] || row['retorno'] || row['%'] || row['return %'] || row['retorno %']
    );

    // Duration: strictly accept integer minutes and reject decimal values without silently rounding
    const rawDurationStr = (
      row['duration'] ||
      row['duracion'] ||
      row['minutes'] ||
      row['minutos'] ||
      ''
    ).trim();
    let finalDuration: number | null = null;
    if (rawDurationStr !== '') {
      if (/^\d+$/.test(rawDurationStr)) {
        finalDuration = parseInt(rawDurationStr, 10);
      } else {
        finalDuration = null;
      }
    }

    const hasPrices = entryPrice > 0 && exitPrice > 0;
    const hasMonetaryResult = !isNaN(explicitPnl) || (hasPrices && calc.verifiedSpec);
    const finalNetPnl = !isNaN(explicitPnl)
      ? explicitPnl
      : hasPrices && calc.verifiedSpec
      ? calc.netPnl
      : 0;    const rawSource = (
      row['source_type'] ||
      row['source'] ||
      row['entorno'] ||
      row['environment'] ||
      row['tipo'] ||
      ''
    ).trim().toLowerCase();
    let sourceType: TradeSourceType = defaultSourceType;
    if (rawSource === 'backtest' || rawSource === 'backtesting' || rawSource === 'simulado' || rawSource === 'sim') {
      sourceType = 'backtest';
    } else if (rawSource === 'demo' || rawSource === 'paper') {
      sourceType = 'demo';
    } else if (rawSource === 'real' || rawSource === 'live' || rawSource === 'cuenta real') {
      sourceType = 'real';
    } else if (rawSource === 'unclassified' || rawSource === 'sin clasificar') {
      sourceType = 'unclassified';
    }

    const dedupKey = generateTradeDeduplicationKey({
      entryDate: formattedDate,
      symbol,
      direction,
      entryPrice,
      exitPrice,
      sourceType,
    });
    if (seenKeys.has(dedupKey)) {
      continue;
    }
    seenKeys.add(dedupKey);

    // Explicit outcome column
    const explicitStatusRaw = (
      row['status'] ||
      row['estado'] ||
      row['outcome'] ||
      row['resultado_operacion'] ||
      ''
    )
      .trim()
      .toLowerCase();
    const explicitStatus: 'Win' | 'Loss' | null =
      explicitStatusRaw === 'win' ||
      explicitStatusRaw === 'tp' ||
      explicitStatusRaw === 'ganada'
        ? 'Win'
        : explicitStatusRaw === 'loss' ||
          explicitStatusRaw === 'sl' ||
          explicitStatusRaw === 'perdida'
        ? 'Loss'
        : null;

    // Check for contradictory signals across R, PnL, Return %, and Status
    const conflicts: string[] = [];
    if (!isNaN(explicitR) && !isNaN(explicitPnl)) {
      if (explicitR > 0 && explicitPnl < 0) {
        conflicts.push('R positivo con PnL negativo');
      } else if (explicitR < 0 && explicitPnl > 0) {
        conflicts.push('R negativo con PnL positivo');
      }
    }
    if (!isNaN(explicitR) && !isNaN(explicitReturnPct)) {
      if (explicitR > 0 && explicitReturnPct < 0) {
        conflicts.push('R positivo con retorno % negativo');
      } else if (explicitR < 0 && explicitReturnPct > 0) {
        conflicts.push('R negativo con retorno % positivo');
      }
    }
    if (!isNaN(explicitPnl) && !isNaN(explicitReturnPct)) {
      if (explicitPnl > 0 && explicitReturnPct < 0) {
        conflicts.push('PnL positivo con retorno % negativo');
      } else if (explicitPnl < 0 && explicitReturnPct > 0) {
        conflicts.push('PnL negativo con retorno % positivo');
      }
    }
    if (explicitStatus && !isNaN(explicitR)) {
      if (explicitStatus === 'Win' && explicitR < 0) {
        conflicts.push('Estado Win con R negativo');
      } else if (explicitStatus === 'Loss' && explicitR > 0) {
        conflicts.push('Estado Loss con R positivo');
      }
    }
    if (explicitStatus && !isNaN(explicitPnl)) {
      if (explicitStatus === 'Win' && explicitPnl < 0) {
        conflicts.push('Estado Win con PnL negativo');
      } else if (explicitStatus === 'Loss' && explicitPnl > 0) {
        conflicts.push('Estado Loss con PnL positivo');
      }
    }
    if (explicitStatus && !isNaN(explicitReturnPct)) {
      if (explicitStatus === 'Win' && explicitReturnPct < 0) {
        conflicts.push('Estado Win con retorno % negativo');
      } else if (explicitStatus === 'Loss' && explicitReturnPct > 0) {
        conflicts.push('Estado Loss con retorno % positivo');
      }
    }

    // Check if row has an interpretable financial result
    const hasInterpretableOutcome =
      (!isNaN(explicitPnl) && explicitPnl !== 0) ||
      (!isNaN(explicitR) && explicitR !== 0) ||
      (!isNaN(explicitReturnPct) && explicitReturnPct !== 0) ||
      explicitStatus !== null ||
      (hasPrices && calc.verifiedSpec && calc.netPnl !== 0);

    // Reject records without interpretable result (do NOT invent Loss or -1R)
    if (!hasInterpretableOutcome) {
      continue;
    }

    let status: 'Win' | 'Loss';
    if (!isNaN(explicitPnl) && explicitPnl !== 0) {
      status = explicitPnl > 0 ? 'Win' : 'Loss';
    } else if (!isNaN(explicitR) && explicitR !== 0) {
      status = explicitR > 0 ? 'Win' : 'Loss';
    } else if (!isNaN(explicitReturnPct) && explicitReturnPct !== 0) {
      status = explicitReturnPct > 0 ? 'Win' : 'Loss';
    } else if (explicitStatus) {
      status = explicitStatus;
    } else {
      status = calc.netPnl > 0 ? 'Win' : 'Loss';
    }

    // Correction 3: Do NOT invent +2R or -1R if CSV only provides percentage, PnL, or status without R!
    const hasKnownR = !isNaN(explicitR) || calc.rMultiple !== 0;
    const finalR = !isNaN(explicitR) ? explicitR : hasKnownR ? calc.rMultiple : 0;
    const finalPlannedRR =
      calc.plannedRR > 0
        ? calc.plannedRR
        : hasKnownR
        ? Number(Math.abs(finalR).toFixed(2))
        : 0;
    const rUnrecorded = !hasKnownR;

    const hasDataConflict = conflicts.length > 0;
    let rowNotes = row['notes'] || row['notas'] || 'Importado desde CSV (Notion / TradingView)';
    if (hasDataConflict) {
      rowNotes = `[Conflicto importación en revisión: ${conflicts.join(', ')}] ${rowNotes}`;
    }

    const pnlProvenance: PnlProvenance = !isNaN(explicitPnl)
      ? 'audited'
      : hasPrices && calc.verifiedSpec
      ? hasMeasuredCommission
        ? 'audited'
        : 'theoretical'
      : 'unrecorded';

    // Correction 6: Do not assign fictitious legacy ICT fields on CSV import
    imported.push({
      id: `imp-${Date.now()}-${i}`,
      symbol,
      direction,
      entryDate: formattedDate,
      entryPrice,
      exitPrice,
      stopLoss,
      takeProfit,
      size,
      riskPercentUsed: undefined,
      htfAligned: [],
      grossPnl: hasMonetaryResult ? Number((finalNetPnl + commission).toFixed(2)) : 0,
      commission,
      commissionUnmeasured: !isNaN(explicitPnl) ? false : !hasMeasuredCommission,
      netPnl: finalNetPnl,
      plannedRR: finalPlannedRR,
      rMultiple: finalR,
      rUnrecorded,
      status,
      killzone: detectKillzoneFromTime(formattedDate),
      pdArrays: [],
      checklistCompleted: [],
      setupGrade: 'Sin evaluar',
      dailyBias: 'Neutral',
      dolTarget: row['dol'] || row['target'] || '',
      timeframe: '15m',
      followedPlan: false,
      planUnrecorded: true,
      psychologyTag: 'Sin clasificar',
      notes: rowNotes,
      accountId: targetAccountId,
      calculationMode: hasMonetaryResult ? 'monetary' : 'unrecorded',
      pnlProvenance,
      pricesUnrecorded: !hasPrices,
      realizedNetReturnPct: !isNaN(explicitReturnPct) ? explicitReturnPct : null,
      durationMinutes: finalDuration,
      hasDataConflict,
      conflictReasons: hasDataConflict ? conflicts : undefined,
      sourceType,
    });
  }

  return imported;
}

export interface BackupPayload {
  version: string;
  exportedAt: string;
  trades: Trade[];
  accounts: PropAccount[];
  playbooks: ICTPlaybook[];
  dailyNotes: Record<string, DailyJournalNote>;
  personalRules?: PersonalTradingRule[];
}

export function validateBackupPayload(data: unknown): data is BackupPayload {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return Array.isArray(obj.trades) && Array.isArray(obj.accounts);
}
