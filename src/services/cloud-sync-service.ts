import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DailyJournalNote,
  HTFTimeframe,
  ICTPlaybook,
  Killzone,
  MarketBias,
  PDArray,
  PersonalTradingRule,
  PropAccount,
  Trade,
  TradeDirection,
  TradeStatus,
  Timeframe,
  SetupGrade,
  PsychologyTag,
} from '@/types/trading';

export interface TradingSnapshot {
  trades: Trade[];
  accounts: PropAccount[];
  playbooks: ICTPlaybook[];
  dailyNotes: Record<string, DailyJournalNote>;
  personalRules: PersonalTradingRule[];
}

interface AccountRow {
  id: string;
  name: string;
  firm: string;
  initial_balance: number;
  profit_target: number;
  max_drawdown: number;
  daily_loss_limit: number;
  is_technical?: boolean;
  has_verified_balance?: boolean;
}

interface PlaybookRow {
  id: string;
  name: string;
  description: string;
  default_killzone: string;
  required_pd_arrays: string[];
  rules: string[];
}

interface TradeRow {
  id: string;
  account_id: string;
  playbook_id: string | null;
  symbol: string;
  direction: string;
  entry_date: string;
  entry_price: number;
  exit_price: number;
  stop_loss: number;
  take_profit: number;
  size: number;
  risk_percent_used: number | null;
  htf_aligned: string[];
  gross_pnl: number;
  commission: number;
  net_pnl: number;
  planned_rr: number;
  r_multiple: number;
  status: string;
  killzone: string;
  pd_arrays: string[];
  checklist_completed: string[];
  setup_grade: string;
  daily_bias: string;
  dol_target: string;
  timeframe: string;
  followed_plan: boolean;
  psychology_tag: string;
  trading_view_url: string | null;
  screenshot_path: string | null;
  notes: string | null;
  time_precision?: string | null;
  operational_window?: string | null;
  calculation_mode?: string | null;
  commission_unmeasured?: boolean | null;
  prices_unrecorded?: boolean | null;
  realized_net_return_pct?: number | null;
  duration_minutes?: number | null;
}

interface NoteRow {
  note_date: string;
  pre_market_bias: string;
  dol_target: string;
  high_impact_news: string;
  pre_market_notes: string;
  post_market_review: string;
  followed_daily_rules: boolean;
  timeframe_context: unknown;
  session_window: string | null;
  no_trade: boolean;
  no_trade_reason: string;
  completed_rule_ids: string[];
}

interface RuleRow {
  id: string;
  rule_text: string;
  sort_order: number;
}

const isOneOf = <T extends string>(value: string, allowed: readonly T[]): value is T =>
  allowed.includes(value as T);

const KILLZONES: readonly Killzone[] = [
  'NY Open 09:30 AM (09:30-10:30)',
  'NY Pre-Open / Macro (08:30-09:30)',
  'NY Mid-Morning (10:30-12:00)',
  'NY PM Session (13:30-16:00)',
  'London / Pre-NY (02:00-08:30)',
  'Out of NY Window',
];
const PD_ARRAYS: readonly PDArray[] = [
  'Contexto HTF (1D/4H/2H/30m)', 'FVG (Fair Value Gap)', 'IFVG (Inversion FVG)',
  'Order Block (+OB / -OB)', 'Breaker Block', 'Liquidity Sweep (BSL/SSL)',
  'SMT Divergence', 'OTE (62% - 79%)', 'BPR (Balanced Price Range)',
  'Key Level',
];
const TIMEFRAMES: readonly Timeframe[] = ['15m', '5m', '30m', '2H', '4H', '1D', '1m', '3m'];
const HTF_TIMEFRAMES: readonly HTFTimeframe[] = ['1D', '4H', '2H', '30m'];
const BIASES: readonly MarketBias[] = ['Bullish', 'Bearish', 'Neutral'];
const GRADES: readonly SetupGrade[] = ['A+', 'B', 'C', 'FOMO', 'Sin evaluar'];
const PSYCHOLOGY: readonly PsychologyTag[] = [
  'A+ Alineado al Contexto HTF', 'Contra Contexto Mayor', 'Entrada Anticipada (Antes de 9:30)',
  'FOMO (Perseguir Precio)', 'Revenge Trade', 'Overtrading',
  'Regla Violada (Cerrado antes de TP/SL)', 'Sin clasificar',
];

const cleanStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function mapTrade(row: TradeRow, signedScreenshotUrl?: string): Trade {
  return {
    id: row.id,
    accountId: row.account_id,
    playbookId: row.playbook_id ?? undefined,
    symbol: row.symbol,
    direction: (row.direction === 'Short' ? 'Short' : 'Long') as TradeDirection,
    // Keep the New York wall-clock value; do not parse and convert this timestamp.
    entryDate: row.entry_date.replace(' ', 'T').slice(0, 16),
    entryPrice: Number(row.entry_price),
    exitPrice: Number(row.exit_price),
    stopLoss: Number(row.stop_loss),
    takeProfit: Number(row.take_profit),
    size: Number(row.size),
    riskPercentUsed: row.risk_percent_used == null ? undefined : Number(row.risk_percent_used),
    htfAligned: cleanStringArray(row.htf_aligned).filter((item): item is HTFTimeframe =>
      isOneOf(item, HTF_TIMEFRAMES),
    ),
    grossPnl: Number(row.gross_pnl),
    commission: Number(row.commission),
    netPnl: Number(row.net_pnl),
    plannedRR: Number(row.planned_rr),
    rMultiple: Number(row.r_multiple),
    status: (row.status === 'Win' ? 'Win' : 'Loss') as TradeStatus,
    killzone: (isOneOf(row.killzone, KILLZONES) ? row.killzone : 'Out of NY Window'),
    pdArrays: cleanStringArray(row.pd_arrays).filter((item): item is PDArray => isOneOf(item, PD_ARRAYS)),
    checklistCompleted: cleanStringArray(row.checklist_completed),
    setupGrade: (isOneOf(row.setup_grade, GRADES) ? row.setup_grade : 'Sin evaluar'),
    dailyBias: (isOneOf(row.daily_bias, BIASES) ? row.daily_bias : 'Neutral'),
    dolTarget: row.dol_target,
    timeframe: (isOneOf(row.timeframe, TIMEFRAMES) ? row.timeframe : '5m'),
    followedPlan: row.followed_plan,
    psychologyTag: (isOneOf(row.psychology_tag, PSYCHOLOGY) ? row.psychology_tag : 'Sin clasificar'),
    tradingViewUrl: row.trading_view_url ?? undefined,
    screenshotDataUrl: signedScreenshotUrl,
    screenshotStoragePath: row.screenshot_path ?? undefined,
    notes: row.notes ?? undefined,
    timePrecision: row.time_precision === 'window' ? 'window' : 'exact',
    operationalWindow: (row.operational_window === 'window_1' || row.operational_window === 'window_2' || row.operational_window === 'outside')
      ? row.operational_window
      : undefined,
    calculationMode: (row.calculation_mode === 'unrecorded'
      ? 'unrecorded'
      : row.calculation_mode === 'derived_r'
      ? 'derived_r'
      : 'monetary'),
    commissionUnmeasured: Boolean(row.commission_unmeasured),
    pricesUnrecorded: Boolean(row.prices_unrecorded),
    realizedNetReturnPct: row.realized_net_return_pct != null ? Number(row.realized_net_return_pct) : null,
    durationMinutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
  };
}

function mapNote(row: NoteRow): DailyJournalNote {
  const context = row.timeframe_context && typeof row.timeframe_context === 'object'
    ? row.timeframe_context as Record<string, unknown>
    : {};
  const timeframeContext: DailyJournalNote['timeframeContext'] = {};
  for (const timeframe of HTF_TIMEFRAMES) {
    const entry = context[timeframe];
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.notes === 'string' && typeof candidate.bias === 'string' && isOneOf(candidate.bias, BIASES)) {
      timeframeContext[timeframe] = { bias: candidate.bias, notes: candidate.notes };
    }
  }

  return {
    date: row.note_date,
    preMarketBias: isOneOf(row.pre_market_bias, BIASES) ? row.pre_market_bias : 'Neutral',
    dolTarget: row.dol_target,
    highImpactNews: row.high_impact_news,
    preMarketNotes: row.pre_market_notes,
    postMarketReview: row.post_market_review,
    followedDailyRules: row.followed_daily_rules,
    timeframeContext,
    sessionWindow: row.session_window && isOneOf(row.session_window, KILLZONES)
      ? row.session_window
      : undefined,
    noTrade: row.no_trade,
    noTradeReason: row.no_trade_reason,
    completedRuleIds: cleanStringArray(row.completed_rule_ids),
  };
}

async function signedScreenshot(client: SupabaseClient, path: string | null) {
  if (!path) return undefined;
  const { data, error } = await client.storage.from('trade-screenshots').createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function loadTradingSnapshot(client: SupabaseClient): Promise<TradingSnapshot> {
  const [accountsResult, playbooksResult, tradesResult, notesResult, rulesResult] = await Promise.all([
    client.from('trading_accounts').select('*'),
    client.from('playbooks').select('*'),
    client.from('trades').select('*').order('entry_date', { ascending: false }),
    client.from('daily_journal_notes').select('*').order('note_date', { ascending: false }),
    client.from('personal_trading_rules').select('*').order('sort_order', { ascending: true }),
  ]);
  for (const result of [accountsResult, playbooksResult, tradesResult, notesResult, rulesResult]) {
    if (result.error) throw result.error;
  }

  const tradeRows = (tradesResult.data ?? []) as unknown as TradeRow[];
  const trades = await Promise.all(tradeRows.map(async (row) => {
    const imageUrl = await signedScreenshot(client, row.screenshot_path);
    return mapTrade(row, imageUrl);
  }));

  return {
    accounts: ((accountsResult.data ?? []) as unknown as AccountRow[]).map((row) => ({
      id: row.id, name: row.name, firm: row.firm,
      initialBalance: Number(row.initial_balance), profitTarget: Number(row.profit_target),
      maxDrawdown: Number(row.max_drawdown), dailyLossLimit: Number(row.daily_loss_limit),
      isTechnical: Boolean(row.is_technical),
      hasVerifiedBalance: row.has_verified_balance !== undefined ? Boolean(row.has_verified_balance) : (Number(row.initial_balance) > 0),
    })),
    playbooks: ((playbooksResult.data ?? []) as unknown as PlaybookRow[]).map((row) => ({
      id: row.id, name: row.name, description: row.description,
      defaultKillzone: isOneOf(row.default_killzone, KILLZONES) ? row.default_killzone : 'Out of NY Window',
      requiredPdArrays: cleanStringArray(row.required_pd_arrays).filter((item): item is PDArray => isOneOf(item, PD_ARRAYS)),
      rules: cleanStringArray(row.rules),
    })),
    trades,
    dailyNotes: Object.fromEntries(((notesResult.data ?? []) as unknown as NoteRow[]).map((row) => {
      const note = mapNote(row);
      return [note.date, note];
    })),
    personalRules: ((rulesResult.data ?? []) as unknown as RuleRow[]).map((row) => ({
      id: row.id, text: row.rule_text,
    })),
  };
}

function tradeToRow(trade: Trade, screenshotPath: string | null) {
  return {
    id: trade.id, account_id: trade.accountId, playbook_id: trade.playbookId || null,
    symbol: trade.symbol, direction: trade.direction,
    entry_date: trade.entryDate.replace('T', ' '),
    entry_price: trade.entryPrice, exit_price: trade.exitPrice, stop_loss: trade.stopLoss,
    take_profit: trade.takeProfit, size: trade.size, risk_percent_used: trade.riskPercentUsed ?? null,
    htf_aligned: trade.htfAligned ?? [], gross_pnl: trade.grossPnl, commission: trade.commission,
    net_pnl: trade.netPnl, planned_rr: trade.plannedRR, r_multiple: trade.rMultiple,
    status: trade.status, killzone: trade.killzone, pd_arrays: trade.pdArrays,
    checklist_completed: trade.checklistCompleted, setup_grade: trade.setupGrade,
    daily_bias: trade.dailyBias, dol_target: trade.dolTarget, timeframe: trade.timeframe,
    followed_plan: trade.followedPlan, psychology_tag: trade.psychologyTag,
    trading_view_url: trade.tradingViewUrl ?? null, screenshot_path: screenshotPath,
    notes: trade.notes ?? null,
    time_precision: trade.timePrecision ?? 'exact',
    operational_window: trade.operationalWindow ?? null,
    calculation_mode: trade.calculationMode ?? (trade.pricesUnrecorded ? 'unrecorded' : 'monetary'),
    commission_unmeasured: trade.commissionUnmeasured ?? false,
    prices_unrecorded: trade.pricesUnrecorded ?? false,
    realized_net_return_pct: trade.realizedNetReturnPct ?? null,
    duration_minutes: trade.durationMinutes ?? null,
  };
}

async function uploadScreenshot(client: SupabaseClient, userId: string, trade: Trade) {
  const dataUrl = trade.screenshotDataUrl;
  if (!dataUrl?.startsWith('data:image/')) return trade.screenshotStoragePath ?? null;

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const path = `${userId}/${trade.id}/evidence`;
  const { error } = await client.storage.from('trade-screenshots').upload(path, blob, {
    upsert: true,
    contentType: blob.type,
  });
  if (error) throw error;
  return path;
}

function getChanged<T>(before: T[], after: T[], getId: (value: T) => string) {
  const previous = new Map(before.map((item) => [getId(item), JSON.stringify(item)]));
  return after.filter((item) => previous.get(getId(item)) !== JSON.stringify(item));
}

function getDeleted<T>(before: T[], after: T[], getId: (value: T) => string) {
  const currentIds = new Set(after.map(getId));
  return before.map(getId).filter((id) => !currentIds.has(id));
}

async function upsertOrDelete(
  client: SupabaseClient,
  table: string,
  changedRows: Record<string, unknown>[],
  deletedIds: string[],
  idColumn = 'id',
) {
  if (changedRows.length) {
    const { error } = await client.from(table).upsert(changedRows);
    if (error) throw error;
  }
  if (deletedIds.length) {
    const { error } = await client.from(table).delete().in(idColumn, deletedIds);
    if (error) throw error;
  }
}

export async function syncTradingChanges(
  client: SupabaseClient,
  userId: string,
  before: TradingSnapshot,
  after: TradingSnapshot,
) {
  const changedAccounts = getChanged(before.accounts, after.accounts, (row) => row.id).map((row) => ({
    id: row.id, name: row.name, firm: row.firm, initial_balance: row.initialBalance,
    profit_target: row.profitTarget, max_drawdown: row.maxDrawdown, daily_loss_limit: row.dailyLossLimit,
    is_technical: row.isTechnical ?? false,
    has_verified_balance: row.hasVerifiedBalance ?? true,
  }));
  const changedPlaybooks = getChanged(before.playbooks, after.playbooks, (row) => row.id).map((row) => ({
    id: row.id, name: row.name, description: row.description,
    default_killzone: row.defaultKillzone, required_pd_arrays: row.requiredPdArrays, rules: row.rules,
  }));
  const changedTrades = await Promise.all(getChanged(before.trades, after.trades, (row) => row.id).map(async (row) => {
    const screenshotPath = await uploadScreenshot(client, userId, row);
    return tradeToRow(row, screenshotPath);
  }));
  const changedNotes = getChanged(Object.values(before.dailyNotes), Object.values(after.dailyNotes), (row) => row.date).map((row) => ({
    note_date: row.date, pre_market_bias: row.preMarketBias, dol_target: row.dolTarget,
    high_impact_news: row.highImpactNews, pre_market_notes: row.preMarketNotes,
    post_market_review: row.postMarketReview, followed_daily_rules: row.followedDailyRules,
    timeframe_context: row.timeframeContext ?? {}, session_window: row.sessionWindow ?? null,
    no_trade: row.noTrade ?? false, no_trade_reason: row.noTradeReason ?? '',
    completed_rule_ids: row.completedRuleIds ?? [],
  }));
  const changedRules = getChanged(before.personalRules, after.personalRules, (row) => row.id).map((row, index) => ({
    id: row.id, rule_text: row.text, sort_order: index,
  }));

  await upsertOrDelete(client, 'trading_accounts', changedAccounts,
    getDeleted(before.accounts, after.accounts, (row) => row.id));
  await upsertOrDelete(client, 'playbooks', changedPlaybooks,
    getDeleted(before.playbooks, after.playbooks, (row) => row.id));
  await upsertOrDelete(client, 'trades', changedTrades,
    getDeleted(before.trades, after.trades, (row) => row.id));
  await upsertOrDelete(client, 'daily_journal_notes', changedNotes,
    getDeleted(Object.values(before.dailyNotes), Object.values(after.dailyNotes), (row) => row.date), 'note_date');
  await upsertOrDelete(client, 'personal_trading_rules', changedRules,
    getDeleted(before.personalRules, after.personalRules, (row) => row.id));

  const nextTradesById = new Map(after.trades.map((trade) => [trade.id, trade]));
  const staleScreenshotPaths = before.trades.flatMap((trade) => {
    if (!trade.screenshotStoragePath) return [];
    const nextTrade = nextTradesById.get(trade.id);
    if (!nextTrade || (!nextTrade.screenshotStoragePath && !nextTrade.screenshotDataUrl?.startsWith('data:image/'))) {
      return [trade.screenshotStoragePath];
    }
    return [];
  });
  if (staleScreenshotPaths.length) {
    const { error } = await client.storage.from('trade-screenshots').remove(staleScreenshotPaths);
    if (error) throw error;
  }
}

export function mergeTradingSnapshots(local: TradingSnapshot, remote: TradingSnapshot): TradingSnapshot {
  const mergeById = <T extends { id: string }>(older: T[], newer: T[]) => {
    const merged = new Map(older.map((row) => [row.id, row]));
    newer.forEach((row) => merged.set(row.id, row));
    return [...merged.values()];
  };
  const dailyNotes = { ...local.dailyNotes, ...remote.dailyNotes };
  return {
    accounts: mergeById(local.accounts, remote.accounts),
    playbooks: mergeById(local.playbooks, remote.playbooks),
    trades: mergeById(local.trades, remote.trades),
    dailyNotes,
    personalRules: mergeById(local.personalRules, remote.personalRules),
  };
}
