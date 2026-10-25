
// src/lib/ict-engine.ts

export type Killzone =
  | 'London Open (02:00-05:00)'
  | 'NY Open / Macro (08:30-10:00)'
  | 'NY AM Silver Bullet (10:00-11:00)'
  | 'NY Lunch (12:00-13:00)'
  | 'NY PM Silver Bullet (14:00-15:00)'
  | 'Asia Range (20:00-00:00)'
  | 'Out of Killzone';

export type PDArray =
  | 'FVG (Fair Value Gap)'
  | 'IFVG (Inversion FVG)'
  | 'Order Block (+OB / -OB)'
  | 'Breaker Block'
  | 'Liquidity Sweep (BSL/SSL)'
  | 'SMT Divergence'
  | 'OTE (62% - 79%)'
  | 'Judas Swing'
  | 'BPR (Balanced Price Range)';

export type PsychologyTag =
  | 'A+ Setup (Disciplinado)'
  | 'Entrada Anticipada'
  | 'Salida por Miedo'
  | 'FOMO (Perseguir Precio)'
  | 'Revenge Trade'
  | 'Overtrading'
  | 'Stop Loss Movido';

export type TradeDirection = 'Long' | 'Short';
export type TradeStatus = 'Win' | 'Loss';
export type DailyBias = 'Bullish' | 'Bearish' | 'Neutral';
export type TradeTimeframe = '1m' | '3m' | '5m' | '15m' | '1H';

export interface PropAccount {
  id: string;
  name: string;           // Ej: "Topstep 50K"
  firm: string;           // Ej: "Topstep", "FTMO", "Apex", "Personal"
  initialBalance: number; // Ej: 50000
  profitTarget: number;   // Ej: 3000
  maxDrawdown: number;    // Ej: 2000
  dailyLossLimit: number; // Ej: 1000
}

export interface Trade {
  id: string;
  symbol: string;
  direction: TradeDirection;
  entryDate: string;      // YYYY-MM-DDTHH:mm
  exitDate?: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;           // Contratos o Lotes
  grossPnl: number;
  commission: number;
  netPnl: number;
  plannedRR: number;      // RR proyectado según TP y SL
  rMultiple: number;      // R real obtenido al cerrar
  status: TradeStatus;
  // Campos exclusivos ICT
  killzone: Killzone;
  pdArrays: PDArray[];
  dailyBias: DailyBias;
  dolTarget: string;      // Draw on Liquidity (Ej: "PDH", "PDL", "London High", "Equal Highs")
  timeframe: TradeTimeframe;
  followedPlan: boolean;
  psychologyTag: PsychologyTag;
  tradingViewUrl?: string;
  notes?: string;
  accountId: string;
}

// Multiplicadores estándar por punto/unidad en TradingView (Futuros, Forex, Metales)
export const INSTRUMENT_SPECS: Record<string, { pointValue: number; label: string }> = {
  'NQ1!': { pointValue: 20, label: 'E-mini Nasdaq ($20/pt)' },
  'NQ': { pointValue: 20, label: 'E-mini Nasdaq ($20/pt)' },
  'MNQ1!': { pointValue: 2, label: 'Micro Nasdaq ($2/pt)' },
  'MNQ': { pointValue: 2, label: 'Micro Nasdaq ($2/pt)' },
  'ES1!': { pointValue: 50, label: 'E-mini S&P 500 ($50/pt)' },
  'ES': { pointValue: 50, label: 'E-mini S&P 500 ($50/pt)' },
  'MES1!': { pointValue: 5, label: 'Micro S&P 500 ($5/pt)' },
  'MES': { pointValue: 5, label: 'Micro S&P 500 ($5/pt)' },
  'YM1!': { pointValue: 5, label: 'Mini Dow ($5/pt)' },
  'XAUUSD': { pointValue: 100, label: 'Oro Spot ($100/lote por $1)' },
  'GC1!': { pointValue: 100, label: 'Futuros Oro ($100/pt)' },
  'EURUSD': { pointValue: 100000, label: 'EUR/USD ($10/pip por lote)' },
  'GBPUSD': { pointValue: 100000, label: 'GBP/USD ($10/pip por lote)' },
  'US30': { pointValue: 1, label: 'US30 CFD ($1/pt)' },
  'NAS100': { pointValue: 1, label: 'NAS100 CFD ($1/pt)' },
};

// Detecta automáticamente la Killzone ICT según la hora (asumiendo hora NY ingresada por el trader)
export function detectKillzoneFromTime(dateTimeStr: string): Killzone {
  if (!dateTimeStr) return 'Out of Killzone';
  const timePart = dateTimeStr.includes('T')
    ? dateTimeStr.split('T')[1]
    : dateTimeStr.split(' ')[1];
  if (!timePart) return 'Out of Killzone';

  const [hourStr, minStr] = timePart.split(':');
  const totalMinutes = parseInt(hourStr, 10) * 60 + parseInt(minStr || '0', 10);

  // 02:00 (120) a 05:00 (300)
  if (totalMinutes >= 120 && totalMinutes <= 300) return 'London Open (02:00-05:00)';
  // 08:30 (510) a 09:59 (599)
  if (totalMinutes >= 510 && totalMinutes < 600) return 'NY Open / Macro (08:30-10:00)';
  // 10:00 (600) a 11:00 (660) -> NY AM Silver Bullet
  if (totalMinutes >= 600 && totalMinutes <= 660) return 'NY AM Silver Bullet (10:00-11:00)';
  // 12:00 (720) a 13:00 (780)
  if (totalMinutes >= 720 && totalMinutes <= 780) return 'NY Lunch (12:00-13:00)';
  // 14:00 (840) a 15:00 (900) -> NY PM Silver Bullet
  if (totalMinutes >= 840 && totalMinutes <= 900) return 'NY PM Silver Bullet (14:00-15:00)';
  // 20:00 (1200) a 23:59 (1439)
  if (totalMinutes >= 1200) return 'Asia Range (20:00-00:00)';

  return 'Out of Killzone';
}

// Calcula automáticamente Dirección, R-Multiple, RR Planeado y P&L desde los precios
export function autoCalculateTradeMath(params: {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  commission: number;
  direction?: TradeDirection;
}) {
  const { symbol, entryPrice, exitPrice, stopLoss, takeProfit, size, commission } = params;
  const cleanSymbol = symbol.trim().toUpperCase();

  // Inferir dirección si hay Stop Loss o Take Profit
  let direction: TradeDirection = params.direction || 'Long';
  if (stopLoss > 0 && entryPrice > 0) {
    direction = stopLoss < entryPrice ? 'Long' : 'Short';
  } else if (takeProfit > 0 && entryPrice > 0) {
    direction = takeProfit > entryPrice ? 'Long' : 'Short';
  }

  const multiplier = INSTRUMENT_SPECS[cleanSymbol]?.pointValue ?? 1;

  // Diferencia de puntos ganados/perdidos
  const priceDiff =
    direction === 'Long' ? exitPrice - entryPrice : entryPrice - exitPrice;

  const riskPerUnit =
    stopLoss > 0 ? Math.abs(entryPrice - stopLoss) : 0;

  const rewardPlannedPerUnit =
    takeProfit > 0
      ? direction === 'Long'
        ? takeProfit - entryPrice
        : entryPrice - takeProfit
      : 0;

  // R-Multiple Real y RR Planeado
  const rMultiple =
    riskPerUnit > 0 ? Number((priceDiff / riskPerUnit).toFixed(2)) : 0;
  const plannedRR =
    riskPerUnit > 0 && rewardPlannedPerUnit > 0
      ? Number((rewardPlannedPerUnit / riskPerUnit).toFixed(2))
      : 0;

  const grossPnl = Number((priceDiff * multiplier * size).toFixed(2));
  const netPnl = Number((grossPnl - commission).toFixed(2));

  return {
    direction,
    rMultiple,
    plannedRR,
    grossPnl,
    netPnl,
    pointValue: multiplier,
  };
}

// Convierte un link de TradingView (https://www.tradingview.com/x/ABCD123/) en la URL directa de la imagen PNG
export function resolveTradingViewImage(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.match(/\.(png|jpg|jpeg|webp)$/i)) return trimmed;

  const match = trimmed.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/);
  if (match && match[1]) {
    const code = match[1];
    const firstChar = code.charAt(0).toLowerCase();
    return `https://s3.tradingview.com/snapshots/${firstChar}/${code}.png`;
  }
  return null;
}

export interface DashboardMetrics {
  netPnl: number;
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
  winLossRatio: number;
  expectancy: number;
  avgRMultiple: number;
  maxDrawdown: number;
  bestTrade: number;
  worstTrade: number;
  currentStreak: { type: 'Win' | 'Loss' | 'None'; count: number };
  planComplianceRate: number;
  zellaScore: number;
  radarData: { metric: string; score: number; fullMark: number }[];
}

export function calculateMetrics(trades: Trade[]): DashboardMetrics {
  if (trades.length === 0) {
    return {
      netPnl: 0, grossProfit: 0, grossLoss: 0, totalCommissions: 0,
      totalTrades: 0, winsCount: 0, lossesCount: 0,
      winRate: 0, profitFactor: 0, avgWin: 0, avgLoss: 0,
      winLossRatio: 0, expectancy: 0, avgRMultiple: 0, maxDrawdown: 0,
      bestTrade: 0, worstTrade: 0, currentStreak: { type: 'None', count: 0 },
      planComplianceRate: 0, zellaScore: 0,
      radarData: [
        { metric: 'Win Rate', score: 0, fullMark: 100 },
        { metric: 'Profit Factor', score: 0, fullMark: 100 },
        { metric: 'R-Multiple', score: 0, fullMark: 100 },
        { metric: 'Disciplina ICT', score: 0, fullMark: 100 },
        { metric: 'Risk Control', score: 0, fullMark: 100 },
      ],
    };
  }

  // Ordenar cronológicamente de más antiguo a más reciente para rachas y drawdown
  const sorted = [...trades].sort(
    (a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id)
  );

  const wins = sorted.filter((t) => t.netPnl > 0);
  const losses = sorted.filter((t) => t.netPnl < 0);

  const netPnl = Number(sorted.reduce((acc, t) => acc + t.netPnl, 0).toFixed(2));
  const grossProfit = Number(wins.reduce((acc, t) => acc + t.netPnl, 0).toFixed(2));
  const grossLoss = Number(Math.abs(losses.reduce((acc, t) => acc + t.netPnl, 0)).toFixed(2));
  const totalCommissions = Number(sorted.reduce((acc, t) => acc + (t.commission || 0), 0).toFixed(2));

  const totalTrades = sorted.length;
  const winRate = Number(((wins.length / totalTrades) * 100).toFixed(1));
  const lossRate = losses.length / totalTrades;

  const profitFactor =
    grossLoss === 0
      ? grossProfit > 0 ? 10.0 : 0
      : Number((grossProfit / grossLoss).toFixed(2));

  const avgWin = wins.length > 0 ? Number((grossProfit / wins.length).toFixed(2)) : 0;
  const avgLoss = losses.length > 0 ? Number((grossLoss / losses.length).toFixed(2)) : 0;
  const winLossRatio = avgLoss === 0 ? (avgWin > 0 ? 5.0 : 0) : Number((avgWin / avgLoss).toFixed(2));

  const expectancy = Number((((winRate / 100) * avgWin) - (lossRate * avgLoss)).toFixed(2));
  const avgRMultiple = Number((sorted.reduce((acc, t) => acc + t.rMultiple, 0) / totalTrades).toFixed(2));

  // Cálculo de Max Drawdown y mejor/peor trade
  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  let bestTrade = 0;
  let worstTrade = 0;

  sorted.forEach((t) => {
    equity += t.netPnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (t.netPnl > bestTrade) bestTrade = t.netPnl;
    if (t.netPnl < worstTrade) worstTrade = t.netPnl;
  });

  // Racha actual
  let streakType: 'Win' | 'Loss' | 'None' = 'None';
  let streakCount = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const t = sorted[i];
    const currentType = t.netPnl > 0 ? 'Win' : t.netPnl < 0 ? 'Loss' : 'None';
    if (currentType === 'None') continue;
    if (streakType === 'None') {
      streakType = currentType;
      streakCount = 1;
    } else if (streakType === currentType) {
      streakCount++;
    } else {
      break;
    }
  }

  const planComplianceRate = Number(
    ((sorted.filter((t) => t.followedPlan).length / totalTrades) * 100).toFixed(1)
  );

  // Puntuaciones normalizadas (0 a 100) para el Zella Score y el Gráfico Radar
  const wrScore = Math.min(Math.round((winRate / 65) * 100), 100);
  const pfScore = Math.min(Math.round((profitFactor / 2.8) * 100), 100);
  const rrScore = Math.min(Math.max(Math.round(((avgRMultiple + 1) / 3.5) * 100), 10), 100);
  const riskScore = maxDrawdown === 0 ? 100 : Math.max(100 - Math.round((maxDrawdown / (grossProfit || 1000)) * 60), 20);
  const zellaScore = Math.round(
    wrScore * 0.25 + pfScore * 0.25 + rrScore * 0.2 + planComplianceRate * 0.2 + riskScore * 0.1
  );

  return {
    netPnl,
    grossProfit,
    grossLoss,
    totalCommissions,
    totalTrades,
    winsCount: wins.length,
    lossesCount: losses.length,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    winLossRatio,
    expectancy,
    avgRMultiple,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    bestTrade,
    worstTrade,
    currentStreak: { type: streakType, count: streakCount },
    planComplianceRate,
    zellaScore,
    radarData: [
      { metric: 'Win Rate', score: wrScore, fullMark: 100 },
      { metric: 'Profit Factor', score: pfScore, fullMark: 100 },
      { metric: 'R-Multiple', score: rrScore, fullMark: 100 },
      { metric: 'Disciplina ICT', score: Math.round(planComplianceRate), fullMark: 100 },
      { metric: 'Risk Control', score: riskScore, fullMark: 100 },
    ],
  };
}

export const INITIAL_ACCOUNTS: PropAccount[] = [
  {
    id: 'acc-1',
    name: 'Topstep 50K - Combine',
    firm: 'Topstep',
    initialBalance: 50000,
    profitTarget: 3000,
    maxDrawdown: 2000,
    dailyLossLimit: 1000,
  },
  {
    id: 'acc-2',
    name: 'FTMO 100K - Funded',
    firm: 'FTMO',
    initialBalance: 100000,
    profitTarget: 10000,
    maxDrawdown: 10000,
    dailyLossLimit: 5000,
  },
];

export const INITIAL_TRADES: Trade[] = [
  {
    id: 't-101',
    symbol: 'NQ1!',
    direction: 'Long',
    entryDate: '2025-02-03T10:14',
    entryPrice: 21450.0,
    exitPrice: 21510.0,
    stopLoss: 21430.0,
    takeProfit: 21510.0,
    size: 2,
    grossPnl: 2400,
    commission: 8.4,
    netPnl: 2391.6,
    plannedRR: 3.0,
    rMultiple: 3.0,
    status: 'Win',
    killzone: 'NY AM Silver Bullet (10:00-11:00)',
    pdArrays: ['Liquidity Sweep (BSL/SSL)', 'FVG (Fair Value Gap)', 'SMT Divergence'],
    dailyBias: 'Bullish',
    dolTarget: 'Previous Day High (PDH)',
    timeframe: '1m',
    followedPlan: true,
    psychologyTag: 'A+ Setup (Disciplinado)',
    tradingViewUrl: 'https://www.tradingview.com/x/example1/',
    notes: 'Sweep del London Low a las 09:50 AM (Macro). Desplazamiento alcista energético dejando FVG de 1m en Silver Bullet. Salida limpia en PDH.',
    accountId: 'acc-1',
  },
  {
    id: 't-102',
    symbol: 'EURUSD',
    direction: 'Short',
    entryDate: '2025-02-04T03:20',
    entryPrice: 1.0845,
    exitPrice: 1.0815,
    stopLoss: 1.0855,
    takeProfit: 1.0815,
    size: 5,
    grossPnl: 1500,
    commission: 15.0,
    netPnl: 1485.0,
    plannedRR: 3.0,
    rMultiple: 3.0,
    status: 'Win',
    killzone: 'London Open (02:00-05:00)',
    pdArrays: ['Judas Swing', 'Order Block (+OB / -OB)', 'OTE (62% - 79%)'],
    dailyBias: 'Bearish',
    dolTarget: 'Asia Low (SSL)',
    timeframe: '5m',
    followedPlan: true,
    psychologyTag: 'A+ Setup (Disciplinado)',
    notes: 'Judas Swing tomando BSL de Asia a las 02:45 AM NY. MSS bajista y retesteo al Bearish OB + OTE.',
    accountId: 'acc-2',
  },
  {
    id: 't-103',
    symbol: 'NQ1!',
    direction: 'Short',
    entryDate: '2025-02-05T09:33',
    entryPrice: 21600.0,
    exitPrice: 21625.0,
    stopLoss: 21625.0,
    takeProfit: 21525.0,
    size: 1,
    grossPnl: -500,
    commission: 4.2,
    netPnl: -504.2,
    plannedRR: 3.0,
    rMultiple: -1.0,
    status: 'Loss',
    killzone: 'NY Open / Macro (08:30-10:00)',
    pdArrays: ['IFVG (Inversion FVG)'],
    dailyBias: 'Bearish',
    dolTarget: 'London Low',
    timeframe: '1m',
    followedPlan: false,
    psychologyTag: 'Entrada Anticipada',
    notes: 'Entré a las 9:33 AM sin esperar a que terminara la manipulación de apertura de las 9:30. Debí esperar la Macro de las 9:50.',
    accountId: 'acc-1',
  },
  {
    id: 't-104',
    symbol: 'XAUUSD',
    direction: 'Long',
    entryDate: '2025-02-06T10:08',
    entryPrice: 2842.0,
    exitPrice: 2856.0,
    stopLoss: 2837.0,
    takeProfit: 2857.0,
    size: 2,
    grossPnl: 2800,
    commission: 14.0,
    netPnl: 2786.0,
    plannedRR: 3.0,
    rMultiple: 2.8,
    status: 'Win',
    killzone: 'NY AM Silver Bullet (10:00-11:00)',
    pdArrays: ['Liquidity Sweep (BSL/SSL)', 'Breaker Block', 'FVG (Fair Value Gap)'],
    dailyBias: 'Bullish',
    dolTarget: 'Weekly High',
    timeframe: '3m',
    followedPlan: true,
    psychologyTag: 'A+ Setup (Disciplinado)',
    notes: 'Unicorn Model (Breaker alcista + FVG superpuestos) después de barrer SSL de las 8:30 AM.',
    accountId: 'acc-2',
  },
  {
    id: 't-105',
    symbol: 'ES1!',
    direction: 'Long',
    entryDate: '2025-02-07T14:15',
    entryPrice: 6080.0,
    exitPrice: 6095.0,
    stopLoss: 6072.5,
    takeProfit: 6095.0,
    size: 2,
    grossPnl: 1500,
    commission: 8.2,
    netPnl: 1491.8,
    plannedRR: 2.0,
    rMultiple: 2.0,
    status: 'Win',
    killzone: 'NY PM Silver Bullet (14:00-15:00)',
    pdArrays: ['FVG (Fair Value Gap)', 'OTE (62% - 79%)'],
    dailyBias: 'Bullish',
    dolTarget: 'AM Session High (BSL)',
    timeframe: '5m',
    followedPlan: true,
    psychologyTag: 'A+ Setup (Disciplinado)',
    notes: 'Continuación de tendencia de la mañana tras retroceso en NY Lunch.',
    accountId: 'acc-1',
  },
];
