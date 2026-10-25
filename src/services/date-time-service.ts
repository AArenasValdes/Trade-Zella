export interface ZonedTimeParts {
  hour: number;
  minute: number;
  second: number;
}

export const DEFAULT_NY_ENTRY_TIME = '09:30';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WALL_CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?$/;

export type OperationalTimeWindowId = 'window_1' | 'window_2' | 'outside';

export interface OperationalTimeWindowDefinition {
  id: 'window_1' | 'window_2';
  label: string;
  shortLabel: string;
  rangeLabel: string;
  startSeconds: number;
  endSeconds: number;
}

export const OPERATIONAL_TIME_WINDOWS: readonly OperationalTimeWindowDefinition[] = [
  {
    id: 'window_1',
    label: 'Trades 9:30 AM – 10:35 AM',
    shortLabel: '9:30 AM – 10:35 AM',
    rangeLabel: '09:30 – 10:35 NY',
    startSeconds: 9 * 3600 + 30 * 60, // 09:30:00 (inclusive)
    endSeconds: 10 * 3600 + 35 * 60,  // 10:35:00 (exclusive)
  },
  {
    id: 'window_2',
    label: 'Trades 10:35 AM – 11:00 AM',
    shortLabel: '10:35 AM – 11:00 AM',
    rangeLabel: '10:35 – 11:00 NY',
    startSeconds: 10 * 3600 + 35 * 60, // 10:35:00 (inclusive)
    endSeconds: 11 * 3600,             // 11:00:00 (exclusive)
  },
];

export interface OperationalWindowTradeInput {
  entryDate: string;
  netPnl: number;
}

export interface OperationalWindowStatItem {
  id: 'window_1' | 'window_2';
  name: string;
  shortName: string;
  rangeLabel: string;
  axisLabel: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  hasData: boolean;
}

export interface OperationalWindowStatsSummary {
  windows: OperationalWindowStatItem[];
  includedTradesCount: number;
  excludedTradesCount: number;
  totalTradesCount: number;
}

export function isValidDateKey(dateKey: string): boolean {
  if (!DATE_KEY_PATTERN.test(dateKey)) return false;
  const [year, month, day] = dateKey.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function isValidWallClockTime(time: string): boolean {
  return WALL_CLOCK_TIME_PATTERN.test(time.trim());
}

export function extractNyDateKey(entryDate: string): string {
  const trimmed = entryDate.trim();
  const candidate = trimmed.slice(0, 10);
  return isValidDateKey(candidate) ? candidate : '';
}

function extractRawTimePart(entryDateOrTime: string): string {
  const trimmed = entryDateOrTime.trim();
  if (!trimmed) return '';
  if (trimmed.includes('T')) {
    return (trimmed.split('T')[1] ?? '').trim();
  }
  if (trimmed.includes(' ')) {
    return (trimmed.split(' ')[1] ?? '').trim();
  }
  if (!DATE_KEY_PATTERN.test(trimmed.slice(0, 10))) {
    return trimmed;
  }
  return '';
}

export function hasExplicitNyTime(entryDateOrTime: string): boolean {
  const rawTime = extractRawTimePart(entryDateOrTime);
  return isValidWallClockTime(rawTime);
}

export function extractNyTime(
  entryDate: string,
  fallbackTime: string = ''
): string {
  const rawTime = extractRawTimePart(entryDate);
  if (isValidWallClockTime(rawTime)) {
    return rawTime.slice(0, 5);
  }
  return fallbackTime && isValidWallClockTime(fallbackTime)
    ? fallbackTime.trim().slice(0, 5)
    : '';
}

export function buildNyEntryDateTime(
  dateKey: string,
  time: string = ''
): string {
  const cleanDate = extractNyDateKey(dateKey);
  if (!cleanDate) return '';
  const trimmedTime = time.trim();
  if (!isValidWallClockTime(trimmedTime)) return '';
  return `${cleanDate}T${trimmedTime.slice(0, 5)}`;
}

export function normalizeNyEntryDateTime(
  entryDate: string,
  fallbackTime: string = ''
): string {
  const dateKey = extractNyDateKey(entryDate);
  if (!dateKey) return '';
  const time = extractNyTime(entryDate, fallbackTime);
  if (!time) return '';
  return buildNyEntryDateTime(dateKey, time);
}

export function parseNyWallClockSeconds(entryDateOrTime: string): number | null {
  const rawTime = extractRawTimePart(entryDateOrTime);
  const match = rawTime.match(WALL_CLOCK_TIME_PATTERN);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? '0');
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Pure classification of New York wall-clock entry time into the two requested operational windows:
 * - window_1: 09:30:00 <= entry < 10:35:00
 * - window_2: 10:35:00 <= entry < 11:00:00
 * - outside:  entry < 09:30:00 or entry >= 11:00:00 (or missing/invalid time)
 */
export function classifyOperationalTimeWindow(
  entryDateOrTime: string
): OperationalTimeWindowId {
  const totalSeconds = parseNyWallClockSeconds(entryDateOrTime);
  if (totalSeconds === null) return 'outside';

  const [window1, window2] = OPERATIONAL_TIME_WINDOWS;
  if (totalSeconds >= window1.startSeconds && totalSeconds < window1.endSeconds) {
    return 'window_1';
  }
  if (totalSeconds >= window2.startSeconds && totalSeconds < window2.endSeconds) {
    return 'window_2';
  }
  return 'outside';
}

export function getOperationalTimeWindowLabel(entryDateOrTime: string): string {
  const windowId = classifyOperationalTimeWindow(entryDateOrTime);
  if (windowId === 'window_1') {
    return 'Trades 9:30 AM – 10:35 AM';
  }
  if (windowId === 'window_2') {
    return 'Trades 10:35 AM – 11:00 AM';
  }
  return 'Fuera de ventana operativa';
}

export function calculateOperationalWindowStats(
  trades: readonly OperationalWindowTradeInput[]
): OperationalWindowStatsSummary {
  const accumulators: Record<
    'window_1' | 'window_2',
    { pnl: number; trades: number; wins: number; losses: number }
  > = {
    window_1: { pnl: 0, trades: 0, wins: 0, losses: 0 },
    window_2: { pnl: 0, trades: 0, wins: 0, losses: 0 },
  };
  let excludedTradesCount = 0;

  for (const trade of trades) {
    const windowId = classifyOperationalTimeWindow(trade.entryDate);
    if (windowId === 'outside') {
      excludedTradesCount += 1;
      continue;
    }
    const bucket = accumulators[windowId];
    bucket.pnl += trade.netPnl;
    bucket.trades += 1;
    if (trade.netPnl > 0) {
      bucket.wins += 1;
    } else {
      bucket.losses += 1;
    }
  }

  const windows: OperationalWindowStatItem[] = OPERATIONAL_TIME_WINDOWS.map((def) => {
    const bucket = accumulators[def.id];
    const hasData = bucket.trades > 0;
    const pnl = hasData ? Number(bucket.pnl.toFixed(2)) : 0;
    const winRate = hasData ? Math.round((bucket.wins / bucket.trades) * 100) : 0;
    return {
      id: def.id,
      name: def.label,
      shortName: def.shortLabel,
      rangeLabel: def.rangeLabel,
      axisLabel: `${def.label} (${bucket.trades}t)`,
      pnl,
      trades: bucket.trades,
      wins: bucket.wins,
      losses: bucket.losses,
      winRate,
      hasData,
    };
  });

  const includedTradesCount = windows.reduce((sum, w) => sum + w.trades, 0);

  return {
    windows,
    includedTradesCount,
    excludedTradesCount,
    totalTradesCount: trades.length,
  };
}

export function getDateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function getCurrentNyDateKey(now: Date = new Date()): string {
  return getDateKeyInTimeZone(now, 'America/New_York');
}

export function getTimePartsInTimeZone(date: Date, timeZone: string): ZonedTimeParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function formatClockTime({ hour, minute, second }: ZonedTimeParts): string {
  return [hour, minute, second].map((value) => String(value).padStart(2, '0')).join(':');
}

export function convertTimeBetweenZones(
  dateKey: string,
  time: string,
  fromTimeZone: string,
  toTimeZone: string
): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = targetUtc;

  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: fromTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const representedUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute)
    );
    const adjustment = targetUtc - representedUtc;
    timestamp += adjustment;
    if (adjustment === 0) break;
  }

  const targetParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: toTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const targetValues = Object.fromEntries(targetParts.map(({ type, value }) => [type, value]));
  return `${targetValues.hour}:${targetValues.minute}`;
}
