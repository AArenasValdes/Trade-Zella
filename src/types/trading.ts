export type Killzone =
  | 'NY Open 09:30 AM (09:30-10:30)'
  | 'NY Pre-Open / Macro (08:30-09:30)'
  | 'NY Mid-Morning (10:30-12:00)'
  | 'NY PM Session (13:30-16:00)'
  | 'London / Pre-NY (02:00-08:30)'
  | 'Out of NY Window';

export type PDArray =
  | 'Contexto HTF (1D/4H/2H/30m)'
  | 'FVG (Fair Value Gap)'
  | 'IFVG (Inversion FVG)'
  | 'Order Block (+OB / -OB)'
  | 'Breaker Block'
  | 'Liquidity Sweep (BSL/SSL)'
  | 'SMT Divergence'
  | 'OTE (62% - 79%)'
  | 'BPR (Balanced Price Range)'
  | 'Key Level';

export type TimePrecision = 'exact' | 'window';
export type CalculationMode = 'monetary' | 'derived_r' | 'unrecorded';

export type PsychologyTag =
  | 'A+ Alineado al Contexto HTF'
  | 'Contra Contexto Mayor'
  | 'Entrada Anticipada (Antes de 9:30)'
  | 'FOMO (Perseguir Precio)'
  | 'Revenge Trade'
  | 'Overtrading'
  | 'Regla Violada (Cerrado antes de TP/SL)'
  | 'Sin clasificar';

export type HTFTimeframe = '1D' | '4H' | '2H' | '30m';
export type Timeframe = '15m' | '5m' | '30m' | '2H' | '4H' | '1D' | '1m' | '3m';
export type SetupGrade = 'A+' | 'B' | 'C' | 'FOMO' | 'Sin evaluar';
export type TradeDirection = 'Long' | 'Short';
export type TradeStatus = 'Win' | 'Loss';
export type MarketBias = 'Bullish' | 'Bearish' | 'Neutral';

export interface HTFContextEntry {
  bias: MarketBias;
  notes: string;
}

export interface PersonalTradingRule {
  id: string;
  text: string;
}

export interface PropAccount {
  id: string;
  name: string;
  firm: string;
  initialBalance: number;
  profitTarget: number;
  maxDrawdown: number;
  dailyLossLimit: number;
  isTechnical?: boolean;
  hasVerifiedBalance?: boolean;
}

export interface ICTPlaybook {
  id: string;
  name: string;
  description: string;
  defaultKillzone: Killzone;
  requiredPdArrays: PDArray[];
  rules: string[];
}

export interface DailyJournalNote {
  date: string;
  preMarketBias: MarketBias;
  dolTarget: string;
  highImpactNews: string;
  preMarketNotes: string;
  postMarketReview: string;
  followedDailyRules: boolean;
  timeframeContext?: Partial<Record<HTFTimeframe, HTFContextEntry>>;
  sessionWindow?: Killzone;
  noTrade?: boolean;
  noTradeReason?: string;
  completedRuleIds?: string[];
}

export interface Trade {
  id: string;
  symbol: string;
  direction: TradeDirection;
  entryDate: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  riskPercentUsed?: number;
  htfAligned?: HTFTimeframe[];
  grossPnl: number;
  commission: number;
  netPnl: number;
  plannedRR: number;
  rMultiple: number;
  status: TradeStatus;
  killzone: Killzone;
  playbookId?: string;
  pdArrays: PDArray[];
  checklistCompleted: string[];
  setupGrade: SetupGrade;
  dailyBias: 'Bullish' | 'Bearish' | 'Neutral';
  dolTarget: string;
  timeframe: Timeframe;
  followedPlan: boolean;
  psychologyTag: PsychologyTag;
  tradingViewUrl?: string;
  screenshotDataUrl?: string;
  screenshotStoragePath?: string;
  notes?: string;
  accountId: string;
  timePrecision?: TimePrecision;
  operationalWindow?: 'window_1' | 'window_2' | 'outside';
  calculationMode?: CalculationMode;
  commissionUnmeasured?: boolean;
  pricesUnrecorded?: boolean;
  realizedNetReturnPct?: number | null;
  durationMinutes?: number | null;
}

export interface TradeFilters {
  accountId: string;
  killzone: string;
  symbol: string;
  direction: 'All' | TradeDirection;
  status: 'All' | TradeStatus;
  playbookId: string;
  dateFrom: string;
  dateTo: string;
}

export interface DataCoverageInfo {
  totalTrades: number;
  monetaryTradesCount: number;
  returnPctTradesCount: number;
  unrecordedTradesCount: number;
  hasVerifiedReferenceCapital: boolean;
}

export interface DashboardMetrics {
  netPnl: number;
  netReturnPct?: number | null;
  grossProfit: number;
  grossLoss: number;
  totalCommissions: number;
  totalTrades: number;
  winsCount: number;
  lossesCount: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgWinPct?: number | null;
  avgLossPct?: number | null;
  winLossRatio: number;
  expectancy: number;
  expectancyPct?: number | null;
  profitFactorUSD?: number | null;
  profitFactorR?: number | null;
  expectancyUSD?: number | null;
  expectancyR?: number | null;
  monetarySampleSize?: number;
  rSampleSize?: number;
  avgRMultiple: number;
  maxDrawdown: number;
  maxDrawdownPct?: number | null;
  bestTrade: number;
  bestTradeReturnPct?: number | null;
  worstTrade: number;
  worstTradeReturnPct?: number | null;
  referenceCapital?: number;
  currentStreak: { type: 'Win' | 'Loss' | 'None'; count: number };
  planComplianceRate: number;
  zellaScore: number;
  longStats: { count: number; winRate: number; netPnl: number };
  shortStats: { count: number; winRate: number; netPnl: number };
  radarData: { metric: string; score: number; fullMark: number }[];
  dataCoverage?: DataCoverageInfo;
  curveMode?: 'percentage' | 'r_multiple';
  totalRMultiple?: number;
}

export interface RiskCalculationInput {
  accountBalance: number;
  riskPercent: number;
  entryPrice: number;
  stopLossPrice: number;
  symbol: string;
}

export interface RiskCalculationResult {
  riskDollars: number;
  stopDistancePoints: number;
  pointValue: number;
  recommendedSize: number;
  direction: TradeDirection;
  targets: {
    r1: number;
    r2: number;
    r3: number;
  };
}
