import type { Trade, PropAccount, DailyJournalNote, ICTPlaybook, PersonalTradingRule } from '../types/trading.ts';
import {
  autoCalculateTradeMath,
  detectKillzoneFromTime,
} from './math-engine.ts';
import { ICT_CHECKLIST_ITEMS } from '../config/ict-constants.ts';

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
  const normalized = clean.includes(',') && !clean.includes('.')
    ? clean.replace(',', '.')
    : clean.replace(/,/g, '');
  const val = parseFloat(normalized);
  return Number.isFinite(val) ? val : NaN;
}

// Soporta CSV exportado de Notion y de TradingView (con soporte para comas decimales y campos entrecomillados)
export function parseTradingViewCSV(csvText: string, targetAccountId: string): Trade[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase());
  const imported: Trade[] = [];

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
    const commission = parseCsvNumber(row['commission'] || row['fee']) || 0;
    const rawDate =
      row['time'] ||
      row['date'] ||
      row['fecha'] ||
      row['entry time'] ||
      new Date().toISOString().slice(0, 16);
    const formattedDate = rawDate.includes('T')
      ? rawDate.slice(0, 16)
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
    });

    const explicitPnl = parseCsvNumber(
      row['pnl'] || row['profit'] || row['net pnl'] || row['resultado'] || row['ganancia']
    );
    const finalNetPnl = !isNaN(explicitPnl) ? explicitPnl : calc.netPnl;
    const explicitR = parseCsvNumber(
      row['r'] || row['rr'] || row['r-multiple'] || row['r multiple'] || row['r_multiple']
    );
    const explicitReturnPct = parseCsvNumber(
      row['return'] || row['retorno'] || row['%'] || row['return %'] || row['retorno %']
    );
    const explicitDuration = parseCsvNumber(
      row['duration'] || row['duracion'] || row['minutes'] || row['minutos']
    );

    const hasPrices = entryPrice > 0 || exitPrice > 0;

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
      riskPercentUsed: 1.0,
      htfAligned: ['1D', '4H', '2H', '30m'],
      grossPnl: Number((finalNetPnl + commission).toFixed(2)),
      commission,
      netPnl: finalNetPnl,
      plannedRR: calc.plannedRR || 2,
      rMultiple: !isNaN(explicitR) ? explicitR : calc.rMultiple || (finalNetPnl > 0 ? 2 : -1),
      status: finalNetPnl > 0 ? 'Win' : 'Loss',
      killzone: detectKillzoneFromTime(formattedDate),
      pdArrays: ['Contexto HTF (1D/4H/2H/30m)'],
      checklistCompleted: ICT_CHECKLIST_ITEMS,
      setupGrade: 'A+',
      dailyBias: direction === 'Long' ? 'Bullish' : 'Bearish',
      dolTarget: row['dol'] || row['target'] || 'HTF Liquidity',
      timeframe: '15m',
      followedPlan: true,
      psychologyTag: 'A+ Alineado al Contexto HTF',
      notes: row['notes'] || row['notas'] || 'Importado desde CSV (Notion / TradingView)',
      accountId: targetAccountId,
      calculationMode: hasPrices || !isNaN(explicitPnl) ? 'monetary' : 'unrecorded',
      pricesUnrecorded: !hasPrices,
      realizedNetReturnPct: !isNaN(explicitReturnPct) ? explicitReturnPct : null,
      durationMinutes: !isNaN(explicitDuration) && explicitDuration >= 0 ? Math.round(explicitDuration) : null,
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
