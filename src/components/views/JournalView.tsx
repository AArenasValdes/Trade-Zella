"use client";

import React, { useState, useMemo } from 'react';
import { useTrading } from '@/context/TradingContext';
import type { Trade, TradeFilters } from '@/types/trading';
import { resolveTradeImage } from '@/services/storage-service';
import { resolveTradeReturnPct, formatReturnPct } from '@/services/financial-engine';
import { KILLZONES } from '@/config/ict-constants';
import {
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Edit3,
  Trash2,
  Filter,
  RotateCcw,
} from 'lucide-react';

interface JournalViewProps {
  onInspectTrade: (trade: Trade) => void;
  onEditTrade: (trade: Trade) => void;
}

type TradeSort = 'date' | 'return-desc' | 'return-asc' | 'pnl-desc' | 'pnl-asc' | 'r-desc';

export function JournalView({ onInspectTrade, onEditTrade }: JournalViewProps) {
  const {
    trades,
    filteredTrades,
    accounts,
    playbooks,
    filters,
    setFilters,
    resetFilters,
    deleteTrade,
    theme,
  } = useTrading();

  const [sortBy, setSortBy] = useState<TradeSort>('date');

  const hasActiveFilters =
    filters.accountId !== 'All' ||
    filters.killzone !== 'All' ||
    filters.direction !== 'All' ||
    filters.status !== 'All' ||
    filters.playbookId !== 'All' ||
    filters.symbol !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  const sortedTrades = useMemo(() => {
    const copy = [...filteredTrades];
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    if (sortBy === 'return-desc' || sortBy === 'pnl-desc') {
      return copy.sort((a, b) => {
        const retA = resolveTradeReturnPct(a, accountMap.get(a.accountId)?.initialBalance) ?? -Infinity;
        const retB = resolveTradeReturnPct(b, accountMap.get(b.accountId)?.initialBalance) ?? -Infinity;
        if (retB !== retA) return retB - retA;
        return b.netPnl - a.netPnl || b.id.localeCompare(a.id);
      });
    }
    if (sortBy === 'return-asc' || sortBy === 'pnl-asc') {
      return copy.sort((a, b) => {
        const retA = resolveTradeReturnPct(a, accountMap.get(a.accountId)?.initialBalance) ?? Infinity;
        const retB = resolveTradeReturnPct(b, accountMap.get(b.accountId)?.initialBalance) ?? Infinity;
        if (retA !== retB) return retA - retB;
        return a.netPnl - b.netPnl || a.id.localeCompare(b.id);
      });
    }
    if (sortBy === 'r-desc') {
      return copy.sort((a, b) => b.rMultiple - a.rMultiple || b.id.localeCompare(a.id));
    }
    return copy.sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.id.localeCompare(a.id));
  }, [filteredTrades, accounts, sortBy]);

  const getAccountName = (id: string) =>
    accounts.find((a) => a.id === id)?.name || id;

  return (
    <div className="space-y-4">
      <div className="bg-[#111114] rounded-2xl p-4 sm:p-5 border border-white/[0.08] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Filtros de Bitácora
            </span>
            <span className="text-[11px] text-zinc-500 hidden sm:inline">
              (Afectan exclusivamente el listado de operaciones inferior)
            </span>
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 px-3 py-1 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={filters.symbol}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, symbol: e.target.value }))
              }
              placeholder="Buscar símbolo (NAS100, NQ)..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-white/20"
            >
            </input>
          </div>

          <select
            value={filters.accountId}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, accountId: e.target.value }))
            }
            className="px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-200 font-medium focus:outline-none"
          >
            <option value="All">Cuenta: Todas ({accounts.length})</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>

          <select
            value={filters.killzone}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, killzone: e.target.value }))
            }
            className="px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-200 font-medium focus:outline-none"
          >
            <option value="All">Ventana NY: Todas</option>
            {KILLZONES.map((kz) => (
              <option key={kz} value={kz}>
                {kz}
              </option>
            ))}
          </select>

          <select
            value={filters.direction}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                direction: e.target.value as TradeFilters['direction'],
              }))
            }
            className="px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-200 font-medium focus:outline-none"
          >
            <option value="All">Dirección: Todas</option>
            <option value="Long">Solo Compras (Long)</option>
            <option value="Short">Solo Ventas (Short)</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: e.target.value as TradeFilters['status'],
              }))
            }
            className="px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-200 font-medium focus:outline-none"
          >
            <option value="All">Resultado: Todos</option>
            <option value="Win">Solo TP (Ganadoras)</option>
            <option value="Loss">Solo SL (Perdedoras)</option>
          </select>

          <select
            value={filters.playbookId}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, playbookId: e.target.value }))
            }
            className="px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-200 font-medium focus:outline-none"
          >
            <option value="All">Escenario: Todos</option>
            {playbooks.map((pb) => (
              <option key={pb.id} value={pb.id}>
                {pb.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/[0.08] rounded-xl px-3 py-1.5">
            <span className="text-[11px] text-zinc-500 shrink-0">Desde:</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
              }
              className="bg-transparent text-xs text-zinc-200 w-full focus:outline-none"
              title="Desde fecha"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as TradeSort)}
            className={`px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/15 font-semibold focus:outline-none ${theme.accentTextClass}`}
          >
            <option value="date">Ordenar: Más Recientes</option>
            <option value="return-desc">Mayor Retorno (%)</option>
            <option value="return-asc">Menor Retorno (%)</option>
            <option value="r-desc">Mayor R-Multiple</option>
          </select>
        </div>
      </div>

      <div className="bg-[#111114] rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              Bitácora de Ejecuciones
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-white/[0.08]">
                {hasActiveFilters
                  ? `${sortedTrades.length} de ${trades.length} registros`
                  : `${trades.length} registros`}
              </span>
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Haz clic en cualquier operación para inspeccionar el gráfico de TradingView y las notas de sesión
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-900/50">
                <th className="py-3.5 px-5">Fecha NY / Activo</th>
                <th className="py-3.5 px-4">Lado</th>
                <th className="py-3.5 px-4">Contexto HTF</th>
                <th className="py-3.5 px-4">Ventana NY</th>
                <th className="py-3.5 px-4">Confluencias & DOL</th>
                <th className="py-3.5 px-4">Disciplina</th>
                <th className="py-3.5 px-4 text-right">Riesgo / R</th>
                <th className="py-3.5 px-5 text-right">Retorno (%)</th>
                <th className="py-3.5 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05] text-sm">
              {sortedTrades.map((trade) => {
                const hasImg = Boolean(resolveTradeImage(trade));
                return (
                  <tr
                    key={trade.id}
                    onClick={() => onInspectTrade(trade)}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <td className="py-4 px-5">
                      <div className="font-bold text-zinc-100 flex items-center gap-2">
                        {trade.symbol}
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/[0.06]">
                          {trade.timeframe}
                        </span>
                        {trade.durationMinutes !== null && trade.durationMinutes !== undefined && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-white/[0.06]">
                            {trade.durationMinutes} min
                          </span>
                        )}
                        {trade.hasDataConflict && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> En revisión
                          </span>
                        )}
                        {hasImg && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${theme.badgeClass}`}>
                            <Eye className="w-3 h-3" /> Chart
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 tabular-nums mt-0.5">
                        {trade.timePrecision === 'window'
                          ? `${trade.entryDate.slice(0, 10)} · ${trade.operationalWindow === 'window_2' ? '10:35–11:00' : '09:30–10:35'} NY (Ventana)`
                          : trade.entryDate.replace('T', ' ')}{' '}
                        · {getAccountName(trade.accountId)}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                          trade.direction === 'Long'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {trade.direction === 'Long' ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        )}
                        {trade.direction}
                      </span>
                    </td>

                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-extrabold ${
                            trade.setupGrade === 'A+'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : trade.setupGrade === 'Sin evaluar' || !trade.setupGrade
                              ? 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                              : trade.setupGrade === 'B'
                              ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {trade.setupGrade || 'Sin evaluar'}
                        </span>
                        {trade.htfAligned && trade.htfAligned.length > 0 && (
                          <span className="text-[11px] text-zinc-400 font-mono">
                            {trade.htfAligned.join('·')}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <span
                        title={trade.killzone}
                        className="inline-flex max-w-full items-center whitespace-normal break-words rounded-md border bg-zinc-900 px-2 py-1 text-xs font-semibold leading-4"
                        style={{
                          color: theme.primaryHex,
                          borderColor: `${theme.primaryHex}66`,
                        }}
                      >
                        {trade.killzone.split(' (')[0]}
                      </span>
                    </td>

                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {trade.pdArrays.map((pd) => (
                          <span
                            key={pd}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-900 border border-white/[0.06] text-zinc-300"
                          >
                            {pd.split(' (')[0]}
                          </span>
                        ))}
                      </div>
                      {trade.dolTarget && (
                        <span className="text-[11px] text-zinc-500 block mt-1">
                          DOL: <strong className="text-zinc-300">{trade.dolTarget}</strong>
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-4">
                      {trade.followedPlan ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {trade.psychologyTag}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" /> {trade.psychologyTag}
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-4 text-right font-mono tabular-nums">
                      <div className="font-bold text-zinc-200">
                        {trade.rUnrecorded
                          ? 'Sin R'
                          : trade.rMultiple > 0
                          ? `+${trade.rMultiple}R`
                          : `${trade.rMultiple}R`}
                      </div>
                      {trade.riskPercentUsed && (
                        <span className="text-[10px] text-zinc-500">
                          Riesgo: {trade.riskPercentUsed}%
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-5 text-right">
                      {(() => {
                        const acc = accounts.find((a) => a.id === trade.accountId);
                        const retPct = resolveTradeReturnPct(trade, acc?.initialBalance);
                        const isUnrecorded = trade.calculationMode === 'unrecorded';
                        const isTheoretical =
                          !isUnrecorded &&
                          trade.calculationMode === 'monetary' &&
                          (trade.commissionUnmeasured || trade.pnlProvenance === 'theoretical');
                        const isPositive = retPct !== null ? retPct >= 0 : (trade.status === 'Win' || trade.netPnl >= 0);

                        return (
                          <>
                            <span
                              className={`font-extrabold tabular-nums text-base block ${
                                retPct === null && isUnrecorded
                                  ? 'text-zinc-500'
                                  : isPositive
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {retPct !== null
                                ? formatReturnPct(retPct)
                                : isUnrecorded
                                ? 'Sin dato'
                                : formatReturnPct(null, {
                                    fallback: trade.netPnl >= 0 ? `+$${trade.netPnl.toFixed(2)}` : `-$${Math.abs(trade.netPnl).toFixed(2)}`,
                                  })}
                            </span>
                            <span className="text-[11px] text-zinc-500 tabular-nums">
                              {isUnrecorded ? (
                                'Sin dato'
                              ) : (
                                <>
                                  {trade.calculationMode === 'derived_r' || isTheoretical ? '~' : ''}
                                  {trade.netPnl >= 0
                                    ? `+$${trade.netPnl.toFixed(2)}`
                                    : `-$${Math.abs(trade.netPnl).toFixed(2)}`}
                                  {trade.calculationMode === 'derived_r'
                                    ? ' (derivado)'
                                    : isTheoretical
                                    ? ' (teórico)'
                                    : ''}
                                </>
                              )}
                            </span>
                          </>
                        );
                      })()}
                    </td>

                    <td
                      className="py-4 px-4 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onEditTrade(trade)}
                          className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteTrade(trade.id)}
                          className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
