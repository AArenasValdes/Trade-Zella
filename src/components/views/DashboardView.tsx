"use client";

import React, { useMemo } from 'react';
import { useTrading } from '@/context/TradingContext';
import { calculateDashboardMetrics } from '@/services/math-engine';
import {
  calculatePercentageEquityCurve,
  calculateOperationalWindowReturnStats,
  calculateWeekdayReturnStats,
  formatReturnPct,
  EquityPointPct,
} from '@/services/financial-engine';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  Target,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
} from 'lucide-react';

interface CustomEquityTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: EquityPointPct }>;
  curveMode?: 'percentage' | 'r_multiple';
}

function CustomEquityTooltip({ active, payload, curveMode = 'percentage' }: CustomEquityTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;

  const isRMode = curveMode === 'r_multiple';

  if (pt.tradeIndex === 0) {
    return (
      <div className="rounded-xl border border-white/15 bg-[#09090b]/95 p-3 text-xs shadow-2xl backdrop-blur-md">
        <p className="font-semibold text-zinc-300">Punto Inicial · {pt.date}</p>
        <p className="text-[11px] text-zinc-500 mt-1">
          {isRMode ? 'Retorno Acumulado: 0.00R' : 'Retorno Acumulado: 0.00%'}
        </p>
      </div>
    );
  }

  const isWindow = pt.timePrecision === 'window';
  const timeDisplay = isWindow
    ? pt.operationalWindow === 'window_2'
      ? '10:35–11:00 NY (Ventana 2)'
      : pt.operationalWindow === 'outside'
      ? 'Fuera de ventana NY'
      : '09:30–10:35 NY (Ventana 1)'
    : pt.time ? `${pt.time} NY` : 'Sin hora registrada';

  return (
    <div className="min-w-[270px] rounded-xl border border-white/15 bg-[#09090b]/95 p-3.5 text-xs shadow-2xl backdrop-blur-md space-y-2.5">
      <div className="border-b border-white/[0.08] pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-zinc-100 flex items-center gap-1.5">
            <span className="text-zinc-400">Trade {pt.tradeLabel}</span>
            <span>·</span>
            <span>{pt.symbol}</span>
            {pt.direction && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${pt.direction === 'Long' ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                {pt.direction}
              </span>
            )}
          </span>
          <span className="text-[11px] text-zinc-400 font-mono">{pt.date}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500">Horario:</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isWindow ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-sky-500/10 text-sky-300 border border-sky-500/20'}`}>
              {timeDisplay}
            </span>
          </div>
          {pt.sourceType && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
              pt.sourceType === 'real'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                : pt.sourceType === 'backtest'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                : pt.sourceType === 'demo'
                ? 'bg-purple-500/10 text-purple-400 border-purple-500/25'
                : 'bg-zinc-800 text-zinc-400 border-white/10'
            }`}>
              {pt.sourceType === 'real' ? 'Real' : pt.sourceType === 'backtest' ? 'Backtest' : pt.sourceType === 'demo' ? 'Demo' : 'Sin clasificar'}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {/* Resultado en R o % */}
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Resultado Individual:</span>
          <span className={`font-mono font-bold ${
            (pt.tradeRMultiple ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {pt.tradeRMultiple !== undefined ? `${pt.tradeRMultiple > 0 ? '+' : ''}${pt.tradeRMultiple}R` : 'Sin dato'}
            {pt.tradeReturnPct !== null && ` (${formatReturnPct(pt.tradeReturnPct)})`}
          </span>
        </div>

        {/* Acumulado */}
        <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
          <span className="text-zinc-400">Retorno Acumulado:</span>
          <span className={`font-mono font-bold ${
            isRMode
              ? (pt.cumulativeRMultiple ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              : (pt.cumulativeReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {isRMode
              ? `${(pt.cumulativeRMultiple ?? 0) >= 0 ? '+' : ''}${pt.cumulativeRMultiple ?? 0}R`
              : formatReturnPct(pt.cumulativeReturnPct)}
          </span>
        </div>

        {/* Drawdown */}
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Drawdown:</span>
          <span className="font-mono font-bold text-rose-400">
            {isRMode
              ? `-${(pt.drawdownR ?? 0).toFixed(2)}R`
              : pt.drawdownPct !== null ? `-${pt.drawdownPct.toFixed(2)}%` : 'Sin datos'}
          </span>
        </div>

        {/* P&L monetario si existe */}
        {pt.pnl !== null && pt.pnl !== 0 && (
          <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
            <span className="text-zinc-400">P&L Monetario:</span>
            <span className={`font-mono font-bold ${pt.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {pt.pnl >= 0 ? '+' : '-'}${Math.abs(pt.pnl).toFixed(2)} USD
              {pt.estimatedPnl ? ' (derivado)' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function DashboardView() {
  const { trades, accounts, theme } = useTrading();
  type EnvFilterType = 'real' | 'demo' | 'backtest' | 'unclassified';
  const [envFilter, setEnvFilter] = React.useState<EnvFilterType>('real');

  const unclassifiedCount = useMemo(
    () => trades.filter((t) => !t.sourceType || t.sourceType === 'unclassified').length,
    [trades]
  );

  const dashboardTrades = useMemo(() => {
    return trades.filter((t) => (t.sourceType || 'unclassified') === envFilter);
  }, [trades, envFilter]);

  const metrics = useMemo(() => {
    return calculateDashboardMetrics(dashboardTrades, accounts);
  }, [dashboardTrades, accounts]);

  const equityResult = useMemo(() => {
    return calculatePercentageEquityCurve(dashboardTrades, accounts);
  }, [dashboardTrades, accounts]);

  const operationalWindowStats = useMemo(() => {
    return calculateOperationalWindowReturnStats(dashboardTrades, accounts);
  }, [dashboardTrades, accounts]);

  const weekdayStats = useMemo(() => {
    return calculateWeekdayReturnStats(dashboardTrades, accounts);
  }, [dashboardTrades, accounts]);

  const isRMode = equityResult.curveMode === 'r_multiple';

  return (
    <div className="space-y-6">
      {/* Selector de Entorno: Real (por defecto), Demo, Backtest, Sin clasificar */}
      <div className="bg-[#111114] p-3 rounded-2xl border border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Entorno:
          </span>
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'real', label: 'Real', count: trades.filter((t) => t.sourceType === 'real').length },
              { id: 'demo', label: 'Demo', count: trades.filter((t) => t.sourceType === 'demo').length },
              { id: 'backtest', label: 'Backtesting', count: trades.filter((t) => t.sourceType === 'backtest').length },
              { id: 'unclassified', label: 'Sin clasificar', count: unclassifiedCount },
            ].map((item) => {
              const active = envFilter === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setEnvFilter(item.id as EnvFilterType)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                    active
                      ? theme.buttonClass
                      : 'bg-zinc-900 border border-white/[0.06] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {item.label} ({item.count})
                </button>
              );
            })}
          </div>
        </div>

        {unclassifiedCount > 0 && envFilter !== 'unclassified' && (
          <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>
              Tienes <strong>{unclassifiedCount}</strong> registros históricos en «Sin clasificar».
            </span>
            <button
              type="button"
              onClick={() => setEnvFilter('unclassified')}
              className="text-amber-200 underline hover:text-white font-semibold cursor-pointer ml-1"
            >
              Ver registros históricos →
            </button>
          </div>
        )}

        {envFilter === 'unclassified' && (
          <div className="flex items-center gap-2 text-xs text-zinc-300 bg-zinc-900 border border-white/[0.08] px-3 py-1.5 rounded-xl">
            <span>
              Viendo registros históricos sin clasificar ({unclassifiedCount} ops). Rentabilidad aislada.
            </span>
            <button
              type="button"
              onClick={() => setEnvFilter('real')}
              className="text-emerald-400 underline hover:text-emerald-300 font-semibold cursor-pointer ml-1"
            >
              Volver a Real →
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Tarjeta 1: Retorno Neto */}
        <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] hover:border-white/[0.15] transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              RETORNO NETO
            </span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div
            className={`text-2xl font-extrabold tracking-tight tabular-nums ${
              metrics.netReturnPct !== null && metrics.netReturnPct !== undefined
                ? metrics.netReturnPct >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
                : (metrics.totalRMultiple ?? 0) >= 0
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {metrics.netReturnPct !== null && metrics.netReturnPct !== undefined
              ? formatReturnPct(metrics.netReturnPct)
              : metrics.totalRMultiple !== undefined && metrics.totalRMultiple !== 0
              ? `${metrics.totalRMultiple > 0 ? '+' : ''}${metrics.totalRMultiple}R`
              : 'Sin dato'}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-400">
            <span>{metrics.totalTrades} ejecuciones</span>
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${theme.badgeClass}`}>
              {metrics.dataCoverage?.monetaryTradesCount && metrics.dataCoverage.monetaryTradesCount > 0
                ? `${metrics.dataCoverage.monetaryTradesCount} con P&L $`
                : '100% en R'}
            </span>
          </div>
        </div>

        {/* Tarjeta 2: Win Rate */}
        <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] hover:border-white/[0.15] transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Win Rate ({metrics.winsCount}TP / {metrics.lossesCount}SL)
            </span>
            <Target className={`w-4 h-4 ${theme.accentTextClass}`} />
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-zinc-100 tabular-nums">
            {metrics.winRate}%
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] tabular-nums">
            <span className="flex items-center text-emerald-400 font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5" /> Long: {metrics.longStats.winRate}%
            </span>
            <span className="flex items-center text-rose-400 font-semibold">
              <ArrowDownRight className="w-3.5 h-3.5" /> Short: {metrics.shortStats.winRate}%
            </span>
          </div>
        </div>

        {/* Tarjeta 3: Profit Factor */}
        <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] hover:border-white/[0.15] transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Profit Factor
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${theme.badgeClass}`}>
              {metrics.profitFactorUSD !== undefined && metrics.profitFactorUSD !== null
                ? `USD (n=${metrics.monetarySampleSize})`
                : metrics.profitFactorR !== undefined && metrics.profitFactorR !== null
                ? `R (n=${metrics.rSampleSize})`
                : 'Sin datos'}
            </span>
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-zinc-100 tabular-nums">
            {metrics.profitFactorUSD !== undefined && metrics.profitFactorUSD !== null
              ? metrics.profitFactorUSD
              : metrics.profitFactorR !== undefined && metrics.profitFactorR !== null
              ? metrics.profitFactorR
              : 'N/A'}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs tabular-nums">
            {metrics.grossProfit > 0 || metrics.grossLoss > 0 ? (
              <>
                <span className="text-emerald-400 font-medium">
                  +${metrics.grossProfit.toLocaleString('en-US')}
                </span>
                <span className="text-rose-400 font-medium">
                  -${metrics.grossLoss.toLocaleString('en-US')}
                </span>
              </>
            ) : (
              <span className="text-zinc-500 text-[11px]">Calculado sobre R</span>
            )}
          </div>
        </div>

        {/* Tarjeta 4: Avg R-Multiple */}
        <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] hover:border-white/[0.15] transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Avg R-Multiple
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${theme.badgeClass}`}>
              R-Multiple
            </span>
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-zinc-100 tabular-nums">
            {metrics.avgRMultiple > 0
              ? `+${metrics.avgRMultiple}R`
              : `${metrics.avgRMultiple}R`}
          </div>
          <div className="mt-2.5 text-xs text-zinc-400 flex justify-between tabular-nums">
            <span>Avg TP: {metrics.avgWin > 0 ? `+$${metrics.avgWin}` : `${(metrics.avgRMultiple > 0 ? metrics.avgRMultiple : 2)}R`}</span>
            <span>Avg SL: {metrics.avgLoss > 0 ? `-$${metrics.avgLoss}` : '1.0R'}</span>
          </div>
        </div>

        {/* Tarjeta 5: Racha Actual */}
        <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] hover:border-white/[0.15] transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Racha Actual
            </span>
            <Award className={`w-4 h-4 ${theme.accentTextClass}`} />
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-zinc-100 tabular-nums">
            {metrics.currentStreak.count > 0
              ? `${metrics.currentStreak.count} ${metrics.currentStreak.type === 'Win' ? 'TP' : 'SL'}`
              : '0'}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-400 tabular-nums">
            <span>Victorias: {metrics.winsCount}</span>
            <span>Derrotas: {metrics.lossesCount}</span>
          </div>
        </div>
      </div>

      {/* Curva de Rendimiento Acumulado */}
      <div className="bg-[#111114] rounded-2xl p-6 border border-white/[0.08]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              {isRMode
                ? 'Curva de Rendimiento Acumulado (R-Multiple)'
                : 'Curva de Rendimiento Acumulado (% Equity Return)'}
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${theme.badgeClass}`}>
                {isRMode ? 'Métrica Independiente R' : '% sobre Capital'}
              </span>
              {equityResult.isPartialCurve && (
                <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Curva Parcial ({equityResult.includedTradesCount}/{equityResult.totalTradesCount} ops)
                </span>
              )}
            </h2>
            <p className="text-xs text-zinc-500">
              {isRMode
                ? 'Trayectoria acumulada en R-Multiple sin conversiones ficticias a dólares (orden cronológico NY)'
                : 'Trayectoria de retorno porcentual sobre capital de referencia (orden cronológico NY)'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Mejor Trade:{' '}
              {isRMode
                ? equityResult.bestTradeR != null
                  ? `${equityResult.bestTradeR > 0 ? '+' : ''}${equityResult.bestTradeR}R`
                  : 'Sin datos'
                : formatReturnPct(equityResult.bestTradeReturnPct, { fallback: 'Sin datos' })}
            </span>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
              Max DD:{' '}
              {isRMode
                ? equityResult.maxDrawdownR != null
                  ? `-${equityResult.maxDrawdownR}R`
                  : '0R'
                : equityResult.maxDrawdownPct !== null
                ? `-${equityResult.maxDrawdownPct.toFixed(2)}%`
                : 'Sin datos'}
            </span>
          </div>
        </div>

        <div className="h-80 sm:h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityResult.points}>
              <defs>
                <linearGradient id="colorEquityDark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={theme.primaryHex} stopOpacity={0.32} />
                  <stop offset="95%" stopColor={theme.primaryHex} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#71717a', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#71717a', fontSize: 12 }}
                tickFormatter={(val) => (isRMode ? `${val >= 0 ? '+' : ''}${val}R` : `${val >= 0 ? '+' : ''}${val}%`)}
              />
              <Tooltip content={<CustomEquityTooltip curveMode={equityResult.curveMode} />} />
              <Area
                type="linear"
                dataKey={isRMode ? 'cumulativeRMultiple' : 'cumulativeReturnPct'}
                stroke={theme.primaryHex}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorEquityDark)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rendimiento por Ventana Horaria */}
        <div className="bg-[#111114] rounded-2xl p-6 border border-white/[0.08] flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="text-base font-bold text-zinc-100">
                Rendimiento por Ventana Horaria (Hora N.Y.)
              </h2>
              <span className="text-[11px] text-zinc-500 font-mono">
                {operationalWindowStats.includedTradesCount} de {operationalWindowStats.totalTradesCount} ejecuciones
              </span>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Distribución de resultados en ventanas operativas
            </p>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={operationalWindowStats.windows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#a1a1aa', fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val}`}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const item = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-white/10 bg-[#09090b]/95 p-3 text-xs shadow-xl backdrop-blur-md">
                          <p className="font-bold text-zinc-200">{item.name}</p>
                          <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{item.rangeNy}</p>
                          <div className="mt-2 space-y-1">
                            <p className="text-zinc-300">
                              Resultado R:{' '}
                              <strong className={item.sumR >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {item.sumR >= 0 ? `+${item.sumR}` : item.sumR}R
                              </strong>
                            </p>
                            {item.returnPct !== null && (
                              <p className="text-zinc-300">
                                Retorno %:{' '}
                                <strong className={item.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {formatReturnPct(item.returnPct)}
                                </strong>
                              </p>
                            )}
                            <p className="text-zinc-400 text-[11px]">{item.trades} trades · {item.winRate}% WR</p>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="sumR" radius={[6, 6, 0, 0]}>
                    {operationalWindowStats.windows.map((entry, index) => (
                      <Cell
                        key={`cell-window-${index}`}
                        fill={entry.sumR >= 0 ? '#10b981' : '#f43f5e'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Rendimiento por Día de la Semana */}
        <div className="bg-[#111114] rounded-2xl p-6 border border-white/[0.08] flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="text-base font-bold text-zinc-100">
                Rendimiento por Día de la Semana (Fecha N.Y.)
              </h2>
              <span className="text-[11px] text-zinc-500 font-mono">
                Lunes a Viernes
              </span>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Rentabilidad acumulada por día operativo
            </p>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayStats}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#a1a1aa', fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val}`}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const item = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-white/10 bg-[#09090b]/95 p-3 text-xs shadow-xl backdrop-blur-md">
                          <p className="font-bold text-zinc-200">Día {item.day}</p>
                          <div className="mt-2 space-y-1">
                            <p className="text-zinc-300">
                              Resultado R:{' '}
                              <strong className={item.sumR >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {item.sumR >= 0 ? `+${item.sumR}` : item.sumR}R
                              </strong>
                            </p>
                            {item.returnPct !== null && (
                              <p className="text-zinc-300">
                                Retorno %:{' '}
                                <strong className={item.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                  {formatReturnPct(item.returnPct)}
                                </strong>
                              </p>
                            )}
                            {item.pnl !== null && item.pnl !== 0 && (
                              <p className="text-zinc-300">
                                P&L: <strong className={item.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>${item.pnl} USD</strong>
                              </p>
                            )}
                            <p className="text-zinc-400 text-[11px]">{item.trades} trades</p>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="sumR" radius={[6, 6, 0, 0]}>
                    {weekdayStats.map((entry, index) => (
                      <Cell
                        key={`cell-weekday-${index}`}
                        fill={entry.sumR >= 0 ? '#10b981' : '#f43f5e'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
