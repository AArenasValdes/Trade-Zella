"use client";

import React, { useMemo } from 'react';
import { useTrading } from '@/context/TradingContext';
import {
  calculatePercentageEquityCurve,
  calculateOperationalWindowReturnStats,
  calculateWeekdayReturnStats,
  formatReturnPct,
  OperationalWindowReturnItem,
  EquityPointPct,
  WeekdayReturnItem,
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
} from 'lucide-react';

export function DashboardView() {
  const { trades, accounts, metrics, theme } = useTrading();

  const equityResult = useMemo(() => {
    return calculatePercentageEquityCurve(trades, accounts);
  }, [trades, accounts]);

  const operationalWindowStats = useMemo(() => {
    return calculateOperationalWindowReturnStats(trades, accounts);
  }, [trades, accounts]);

  const weekdayStats = useMemo(() => {
    return calculateWeekdayReturnStats(trades, accounts);
  }, [trades, accounts]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Tarjeta 1: Retorno Neto % */}
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
                : 'text-zinc-400'
            }`}
          >
            {formatReturnPct(metrics.netReturnPct)}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-400">
            <span>{metrics.totalTrades} ejecuciones</span>
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${theme.badgeClass}`}>
              Exp: {formatReturnPct(metrics.expectancyPct, { fallback: 'Sin datos' })}
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
              W/L: {metrics.winLossRatio}
            </span>
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-zinc-100 tabular-nums">
            {metrics.profitFactor}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs tabular-nums">
            <span className="text-emerald-400 font-medium">
              +${metrics.grossProfit.toLocaleString('en-US')}
            </span>
            <span className="text-rose-400 font-medium">
              -${metrics.grossLoss.toLocaleString('en-US')}
            </span>
          </div>
        </div>

        {/* Tarjeta 4: Avg R-Multiple con Avg TP% / Avg SL% */}
        <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] hover:border-white/[0.15] transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Avg R-Multiple
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              Plan: {metrics.planComplianceRate}%
            </span>
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-zinc-100 tabular-nums">
            {metrics.avgRMultiple > 0
              ? `+${metrics.avgRMultiple}R`
              : `${metrics.avgRMultiple}R`}
          </div>
          <div className="mt-2.5 text-xs text-zinc-400 flex justify-between tabular-nums">
            <span>Avg TP: {formatReturnPct(metrics.avgWinPct, { fallback: `+$${metrics.avgWin}` })}</span>
            <span>Avg SL: -{formatReturnPct(metrics.avgLossPct, { showSign: false, fallback: `$${metrics.avgLoss}` })}</span>
          </div>
        </div>

        {/* Tarjeta 5: Martin Edge Score */}
        <div className="bg-gradient-to-br from-zinc-900 via-[#141418] to-zinc-950 text-white rounded-2xl p-5 border border-white/15 shadow-xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Martin Edge Score
            </span>
            <Award className={`w-4 h-4 ${theme.accentTextClass}`} />
          </div>
          <div className={`text-3xl font-extrabold tracking-tight tabular-nums ${theme.accentTextClass}`}>
            {metrics.zellaScore}
            <span className="text-sm font-normal text-zinc-500">/100</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2">
            Racha actual:{' '}
            <strong className="text-zinc-100">
              {metrics.currentStreak.count} {metrics.currentStreak.type}
            </strong>
          </p>
        </div>
      </div>

      {/* Curva de Equidad Porcentual */}
      <div className="bg-[#111114] rounded-2xl p-6 border border-white/[0.08]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-base font-bold text-zinc-100">
              Curva de Rendimiento Acumulado (% Equity Return)
            </h2>
            <p className="text-xs text-zinc-500">
              Trayectoria de retorno porcentual sobre capital de referencia (orden cronológico NY)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Mejor Trade: {formatReturnPct(equityResult.bestTradeReturnPct, { fallback: '+$0' })}
            </span>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
              Max DD: {equityResult.maxDrawdownPct !== null ? `-${equityResult.maxDrawdownPct.toFixed(2)}%` : 'Sin datos'}
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
                tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val}%`}
              />
              <Tooltip
                labelFormatter={(_label, payload) => {
                  const point = (payload?.[0]?.payload ?? null) as EquityPointPct | null;
                  if (!point) return 'Operación';
                  if (point.tradeIndex === 0) return `Inicio de la curva · ${point.date}`;
                  const timeLabel = point.timePrecision === 'window'
                    ? point.operationalWindow === 'window_2' ? '10:35–11:00' : '09:30–10:35'
                    : point.time;
                  const suffix = point.timePrecision === 'window' ? ' NY (ventana, no hora exacta)' : ' NY';
                  return `${point.date} · ${timeLabel}${suffix} · ${point.symbol}`;
                }}
                contentStyle={{
                  backgroundColor: '#09090b',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#f4f4f5',
                  fontSize: '12px',
                }}
                formatter={(value, name, item) => {
                  const pt = item.payload as EquityPointPct;
                  if (pt.tradeIndex === 0) {
                    return ['0.00% (Inicio sesión)', 'Retorno Acumulado'];
                  }
                  const retStr = formatReturnPct(pt.cumulativeReturnPct);
                  const pnlStr = `${pt.estimatedPnl ? '≈' : ''}${pt.pnl >= 0 ? '+' : '-'}${Math.abs(pt.pnl).toFixed(2)}`;
                  const cumulativePnl = `${pt.cumulativePnl >= 0 ? '+' : '-'}${Math.abs(pt.cumulativePnl).toFixed(2)}`;
                  const tradeRetStr = formatReturnPct(pt.tradeReturnPct);
                  return [
                    `Trade: ${tradeRetStr} (${pnlStr}) · Acumulado: ${retStr} (${cumulativePnl}) · DD: -${pt.drawdownPct.toFixed(2)}%`,
                    'Resultado',
                  ];
                }}
              />
              <Area
                type="linear"
                dataKey="cumulativeReturnPct"
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
        {/* Rendimiento por Ventana Horaria en % */}
        <div className="bg-[#111114] rounded-2xl p-6 border border-white/[0.08] flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="text-base font-bold text-zinc-100">
                Rendimiento por Ventana Horaria (Hora N.Y.)
              </h2>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${theme.badgeClass}`}>
                {operationalWindowStats.includedTradesCount} de {operationalWindowStats.totalTradesCount} trades en ventanas
              </span>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Comparativa de rendimiento en Ventana 1 (09:30 – 10:35) vs Ventana 2 (10:35 – 11:00)
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {operationalWindowStats.windows.map((w) => (
                <div
                  key={w.id}
                  className="rounded-xl border border-white/[0.06] bg-zinc-900/60 p-2.5 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-semibold text-zinc-200 block truncate" title={w.name}>
                      {w.name}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {w.hasData
                        ? `${w.trades} ${w.trades === 1 ? 'trade' : 'trades'} · ${w.winRate}% WR`
                        : 'Sin operaciones (0 trades)'}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    {w.hasData ? (
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          w.returnPct !== null && w.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatReturnPct(w.returnPct)}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-zinc-500 italic">
                        Sin datos
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={operationalWindowStats.windows}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#27272a" />
                <XAxis
                  type="number"
                  tick={{ fill: '#71717a', fontSize: 11 }}
                  tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val}%`}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  width={185}
                  tick={{ fill: '#d4d4d8', fontSize: 11, fontWeight: 600 }}
                  tickFormatter={(val, idx) => {
                    const item = operationalWindowStats.windows[idx];
                    return item ? `${item.shortName} (${item.trades}t)` : val;
                  }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    backgroundColor: '#111114',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#f4f4f5',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
                  }}
                  labelStyle={{ color: '#f4f4f5', marginBottom: '4px', fontWeight: 700 }}
                  itemStyle={{ color: '#d4d4d8' }}
                  formatter={(val, _name, item) => {
                    const data = item.payload as OperationalWindowReturnItem;
                    if (!data.hasData) {
                      return ['Sin operaciones registradas', 'Retorno Neto'];
                    }
                    const retStr = formatReturnPct(data.returnPct);
                    const pnlStr = data.pnl >= 0 ? `+$${data.pnl.toFixed(2)}` : `-$${Math.abs(data.pnl).toFixed(2)}`;
                    return [
                      `${retStr} (${pnlStr} · ${data.trades} ${data.trades === 1 ? 'trade' : 'trades'}, ${data.winRate}% WR)`,
                      'Retorno Neto',
                    ];
                  }}
                />
                <Bar dataKey="returnPct" radius={[0, 8, 8, 0]} barSize={26}>
                  {operationalWindowStats.windows.map((entry) => (
                    <Cell
                      key={entry.id}
                      fill={
                        !entry.hasData
                          ? '#3f3f46'
                          : (entry.returnPct ?? 0) >= 0
                          ? theme.primaryHex
                          : '#f43f5e'
                      }
                      fillOpacity={!entry.hasData ? 0.35 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {operationalWindowStats.excludedTradesCount > 0 && (
            <p className="mt-3 pt-2.5 border-t border-white/[0.06] text-[11px] text-zinc-500">
              Nota: {operationalWindowStats.excludedTradesCount}{' '}
              {operationalWindowStats.excludedTradesCount === 1
                ? 'operación registrada'
                : 'operaciones registradas'}{' '}
              fuera de 09:30–11:00 AM NY (excluida de este gráfico específico, pero contabilizada en los totales del Dashboard y en la Bitácora).
            </p>
          )}
        </div>

        {/* Rendimiento por Día de la Semana en % */}
        <div className="bg-[#111114] rounded-2xl p-6 border border-white/[0.08]">
          <h2 className="text-base font-bold text-zinc-100 mb-1">
            Rendimiento por Día de la Semana (Lunes a Viernes)
          </h2>
          <p className="text-xs text-zinc-500 mb-4">
            Histórico porcentual de todas las operaciones registradas
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#d4d4d8', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#71717a', fontSize: 12 }}
                  tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v}%`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    backgroundColor: '#111114',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#f4f4f5',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
                  }}
                  labelStyle={{ color: '#f4f4f5', marginBottom: '4px' }}
                  itemStyle={{ color: '#d4d4d8' }}
                  formatter={(val, _name, item) => {
                    const row = item.payload as WeekdayReturnItem;
                    const retStr = formatReturnPct(row.returnPct);
                    const pnlStr = row.pnl >= 0 ? `+$${row.pnl.toFixed(2)}` : `-$${Math.abs(row.pnl).toFixed(2)}`;
                    return [`${retStr} (${pnlStr} · ${row.trades} ${row.trades === 1 ? 'trade' : 'trades'})`, 'Retorno Neto'];
                  }}
                />
                <Bar dataKey="returnPct" radius={[8, 8, 0, 0]} barSize={36}>
                  {weekdayStats.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={(entry.returnPct ?? 0) >= 0 ? theme.primaryHex : '#f43f5e'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
