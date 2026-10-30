import type {
  Killzone,
  PDArray,
  PsychologyTag,
  HTFTimeframe,
  ICTPlaybook,
  PropAccount,
  Trade,
} from '../types/trading.ts';

export type AccentThemeKey = 'ice' | 'mono' | 'gold';

export interface ThemePalette {
  key: AccentThemeKey;
  label: string;
  primaryHex: string;
  secondaryHex: string;
  buttonClass: string;
  badgeClass: string;
  activeNavClass: string;
  accentTextClass: string;
  ringClass: string;
}

export const THEME_PALETTES: Record<AccentThemeKey, ThemePalette> = {
  ice: {
    key: 'ice',
    label: 'Azul Hielo',
    primaryHex: '#38bdf8',
    secondaryHex: '#0ea5e9',
    buttonClass: 'bg-sky-400 text-zinc-950 hover:bg-sky-300 shadow-lg shadow-sky-500/20',
    badgeClass: 'bg-sky-500/10 text-sky-300 border border-sky-500/20',
    activeNavClass: 'bg-sky-500/10 text-sky-300 border border-sky-500/25 shadow-xs',
    accentTextClass: 'text-sky-400',
    ringClass: 'focus:ring-sky-400',
  },
  mono: {
    key: 'mono',
    label: 'Plata / Blanco',
    primaryHex: '#f4f4f5',
    secondaryHex: '#a1a1aa',
    buttonClass: 'bg-zinc-100 text-zinc-950 hover:bg-white shadow-lg shadow-white/10',
    badgeClass: 'bg-white/10 text-zinc-200 border border-white/15',
    activeNavClass: 'bg-white/10 text-white border border-white/20 shadow-xs',
    accentTextClass: 'text-zinc-100',
    ringClass: 'focus:ring-zinc-300',
  },
  gold: {
    key: 'gold',
    label: 'Ámbar / Oro',
    primaryHex: '#f59e0b',
    secondaryHex: '#d97706',
    buttonClass: 'bg-amber-400 text-zinc-950 hover:bg-amber-300 shadow-lg shadow-amber-500/20',
    badgeClass: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
    activeNavClass: 'bg-amber-500/10 text-amber-300 border border-amber-500/25 shadow-xs',
    accentTextClass: 'text-amber-400',
    ringClass: 'focus:ring-amber-400',
  },
};

export interface MotivationalQuote {
  text: string;
  author: string;
  category: 'Biblia' | 'Mentalidad' | 'Disciplina';
}

export const MARTIN_QUOTES: MotivationalQuote[] = [
  {
    text: 'Disciplina hoy, libertad mañana.',
    author: 'Principio de Constancia',
    category: 'Disciplina',
  },
  {
    text: 'Los planes bien pensados y el arduo trabajo llevan a la prosperidad; los atajos a la carrera conducen a la pobreza.',
    author: 'Proverbios 21:5',
    category: 'Biblia',
  },
  {
    text: 'Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo dondequiera que vayas.',
    author: 'Josué 1:9',
    category: 'Biblia',
  },
  {
    text: 'Aunque la visión tardará aún por un tiempo, se apresura hacia el fin, y no mentirá; aunque tardare, espéralo, porque sin duda vendrá.',
    author: 'Habacuc 2:3',
    category: 'Biblia',
  },
  {
    text: 'El que es fiel en lo muy poco, también en lo más es fiel.',
    author: 'Lucas 16:10',
    category: 'Biblia',
  },
  {
    text: 'Mejor es el que tarda en airarse que el fuerte; y el que se enseñorea de su espíritu, que el que toma una ciudad.',
    author: 'Proverbios 16:32',
    category: 'Biblia',
  },
  {
    text: 'Encomienda a Jehová tus obras, y tus pensamientos serán afirmados.',
    author: 'Proverbios 16:3',
    category: 'Biblia',
  },
  {
    text: 'Todo lo puedo en Cristo que me fortalece.',
    author: 'Filipenses 4:13',
    category: 'Biblia',
  },
  {
    text: 'No necesitas operar todos los días; solo necesitas ejecutar sin dudar cuando 1D, 4H, 2H y 30m están alineados a tu favor.',
    author: 'Regla Operativa de Martín',
    category: 'Mentalidad',
  },
  {
    text: 'Tu trabajo a las 09:30 AM NY es proteger tu capital, respetar tu 1%-2% y aceptar el TP o SL con paz mental.',
    author: 'Mentalidad Institucional',
    category: 'Disciplina',
  },
];

export const HTF_TIMEFRAMES: HTFTimeframe[] = ['1D', '4H', '2H', '30m'];

export const KILLZONES: Killzone[] = [
  'NY Open 09:30 AM (09:30-10:30)',
  'NY Pre-Open / Macro (08:30-09:30)',
  'NY Mid-Morning (10:30-12:00)',
  'NY PM Session (13:30-16:00)',
  'London / Pre-NY (02:00-08:30)',
  'Out of NY Window',
];

export const PD_ARRAYS: PDArray[] = [
  'Contexto HTF (1D/4H/2H/30m)',
  'Liquidity Sweep (BSL/SSL)',
  'FVG (Fair Value Gap)',
  'IFVG (Inversion FVG)',
  'Order Block (+OB / -OB)',
  'Breaker Block',
  'SMT Divergence',
  'OTE (62% - 79%)',
  'BPR (Balanced Price Range)',
  'Key Level',
];

export const ENTRY_MODELS: PDArray[] = [
  'BPR (Balanced Price Range)',
  'Breaker Block',
  'Key Level',
];

export const PSYCHOLOGY_TAGS: PsychologyTag[] = [
  'A+ Alineado al Contexto HTF',
  'Contra Contexto Mayor',
  'Entrada Anticipada (Antes de 9:30)',
  'FOMO (Perseguir Precio)',
  'Revenge Trade',
  'Overtrading',
  'Regla Violada (Cerrado antes de TP/SL)',
  'Sin clasificar',
];

export const ICT_CHECKLIST_ITEMS: string[] = [
  'Dirección Mayor alineada en Diario (1D) y 4H',
  'Flujo intermedio confirmado en 2H y 30m',
  'Entrada y gestión ejecutada en 15m / 5m',
  'Operación en Ventana NY / Apertura 09:30 AM (Hora NY)',
  'Riesgo fijo respetado entre 1% y 2% de la cuenta',
  'Ejecución estricta TP o SL (Sin parciales ni Break Even)',
];

export const INSTRUMENT_SPECS: Record<
  string,
  { pointValue: number; label: string; category: 'Futures' | 'Forex' | 'Metals' | 'Indices' }
> = {
  NAS100: { pointValue: 1, label: 'NAS100 CFD ($1/pt por lote)', category: 'Indices' },
  NQ: { pointValue: 20, label: 'E-mini Nasdaq Futuros ($20/pt)', category: 'Futures' },
  'NQ1!': { pointValue: 20, label: 'Contrato Actual NQ Futuros ($20/pt)', category: 'Futures' },
  MNQ: { pointValue: 2, label: 'Micro NQ Futuros ($2/pt)', category: 'Futures' },
  'MNQ1!': { pointValue: 2, label: 'Micro NQ Futuros ($2/pt)', category: 'Futures' },
  ES: { pointValue: 50, label: 'E-mini S&P 500 Futuros ($50/pt)', category: 'Futures' },
  'ES1!': { pointValue: 50, label: 'E-mini S&P 500 Futuros ($50/pt)', category: 'Futures' },
  MES: { pointValue: 5, label: 'Micro E-mini S&P 500 Futuros ($5/pt)', category: 'Futures' },
  'MES1!': { pointValue: 5, label: 'Micro E-mini S&P 500 Futuros ($5/pt)', category: 'Futures' },
  US30: { pointValue: 1, label: 'US30 CFD ($1/pt)', category: 'Indices' },
  SP500: { pointValue: 1, label: 'S&P 500 CFD ($1/pt)', category: 'Indices' },
  XAUUSD: { pointValue: 100, label: 'Oro Spot ($100/lote por $1)', category: 'Metals' },
  EURUSD: { pointValue: 10, label: 'EUR/USD Forex ($10/pip)', category: 'Forex' },
};

export function getInstrumentSpec(symbol: string): {
  pointValue: number;
  label: string;
  category: 'Futures' | 'Forex' | 'Metals' | 'Indices' | 'Custom';
  verified: boolean;
} {
  const clean = symbol.trim().toUpperCase();
  if (INSTRUMENT_SPECS[clean]) {
    return { ...INSTRUMENT_SPECS[clean], verified: true };
  }
  if (clean.endsWith('1!')) {
    const base = clean.slice(0, -2);
    if (INSTRUMENT_SPECS[base]) {
      return { ...INSTRUMENT_SPECS[base], verified: true };
    }
  } else {
    const with1 = `${clean}1!`;
    if (INSTRUMENT_SPECS[with1]) {
      return { ...INSTRUMENT_SPECS[with1], verified: true };
    }
  }
  return {
    pointValue: 1,
    label: `${clean} (Genérico $1/pt no auditado)`,
    category: 'Custom',
    verified: false,
  };
}

export const DEFAULT_PLAYBOOKS: ICTPlaybook[] = [];

export const DEFAULT_ACCOUNTS: PropAccount[] = [
  {
    id: 'acc-fp-1',
    name: 'Funding Pips 100K (Principal)',
    firm: 'Funding Pips',
    initialBalance: 100000,
    profitTarget: 8000,
    maxDrawdown: 10000,
    dailyLossLimit: 5000,
  },
  {
    id: 'acc-fp-2',
    name: 'Funding Pips 50K',
    firm: 'Funding Pips',
    initialBalance: 50000,
    profitTarget: 4000,
    maxDrawdown: 5000,
    dailyLossLimit: 2500,
  },
];

export const SAMPLE_TRADES: Trade[] = [
  {
    id: 't-101',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2025-02-03T09:35',
    entryPrice: 21450.0,
    exitPrice: 21530.0,
    stopLoss: 21410.0,
    takeProfit: 21530.0,
    size: 25,
    riskPercentUsed: 1.0,
    htfAligned: ['1D', '4H', '2H', '30m'],
    grossPnl: 2000,
    commission: 0,
    netPnl: 2000,
    plannedRR: 2.0,
    rMultiple: 2.0,
    status: 'Win',
    killzone: 'NY Open 09:30 AM (09:30-10:30)',
    pdArrays: ['Contexto HTF (1D/4H/2H/30m)', 'Liquidity Sweep (BSL/SSL)', 'FVG (Fair Value Gap)'],
    checklistCompleted: ICT_CHECKLIST_ITEMS,
    setupGrade: 'A+',
    dailyBias: 'Bullish',
    dolTarget: 'High Diario (1D BSL)',
    timeframe: '5m',
    followedPlan: true,
    psychologyTag: 'A+ Alineado al Contexto HTF',
    notes: 'Contexto alcista en 1D, 4H, 2H y 30m. En la apertura de las 9:30 AM NY barre liquidez previa y da entrada limpia en 5m/15m. 1% de riesgo, TP directo (2R).',
    accountId: 'acc-fp-1',
  },
  {
    id: 't-102',
    symbol: 'NQ1!',
    direction: 'Short',
    entryDate: '2025-02-04T09:45',
    entryPrice: 21580.0,
    exitPrice: 21480.0,
    stopLoss: 21620.0,
    takeProfit: 21480.0,
    size: 2,
    riskPercentUsed: 1.5,
    htfAligned: ['1D', '4H', '2H', '30m'],
    grossPnl: 4000,
    commission: 8.4,
    netPnl: 3991.6,
    plannedRR: 2.5,
    rMultiple: 2.5,
    status: 'Win',
    killzone: 'NY Open 09:30 AM (09:30-10:30)',
    pdArrays: ['Contexto HTF (1D/4H/2H/30m)', 'Order Block (+OB / -OB)'],
    checklistCompleted: ICT_CHECKLIST_ITEMS,
    setupGrade: 'A+',
    dailyBias: 'Bearish',
    dolTarget: 'Low de 4H (SSL)',
    timeframe: '15m',
    followedPlan: true,
    psychologyTag: 'A+ Alineado al Contexto HTF',
    notes: 'Alineación completa bajista en 1D/4H/2H/30m tras apertura NY. Gestión en 15m directo a TP sin tocar SL ni BE.',
    accountId: 'acc-fp-1',
  },
  {
    id: 't-103',
    symbol: 'NAS100',
    direction: 'Long',
    entryDate: '2025-02-05T09:32',
    entryPrice: 21600.0,
    exitPrice: 21560.0,
    stopLoss: 21560.0,
    takeProfit: 21680.0,
    size: 25,
    riskPercentUsed: 1.0,
    htfAligned: ['30m'],
    grossPnl: -1000,
    commission: 0,
    netPnl: -1000,
    plannedRR: 2.0,
    rMultiple: -1.0,
    status: 'Loss',
    killzone: 'NY Open 09:30 AM (09:30-10:30)',
    pdArrays: ['IFVG (Inversion FVG)'],
    checklistCompleted: [ICT_CHECKLIST_ITEMS[3], ICT_CHECKLIST_ITEMS[4]],
    setupGrade: 'C',
    dailyBias: 'Bearish',
    dolTarget: 'High Intradía',
    timeframe: '5m',
    followedPlan: false,
    psychologyTag: 'Contra Contexto Mayor',
    notes: '1D y 4H estaban bajistas pero intenté buscar compra en 5m apenas abrió 9:30. SL directo de -1% (-$1,000).',
    accountId: 'acc-fp-1',
  },
];
