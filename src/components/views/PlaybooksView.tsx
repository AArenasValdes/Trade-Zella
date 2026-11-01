"use client";

import React, { useMemo } from 'react';
import { useTrading } from '@/context/TradingContext';
import { PD_ARRAYS } from '@/config/ict-constants';
import { SetupGrade } from '@/types/trading';
import { calculateConsolidatedReturnPct, formatReturnPct } from '@/services/financial-engine';
import { Layers, CheckCircle2 } from 'lucide-react';

export function PlaybooksView() {
  const { trades, accounts, playbooks, theme } = useTrading();

  const playbookStats = useMemo(() => {
    return playbooks.map((pb) => {
      const pbTrades = trades.filter((t) => t.playbookId === pb.id);
      const pnl = pbTrades.reduce((acc, t) => acc + t.netPnl, 0);
      const wins = pbTrades.filter((t) => t.netPnl > 0).length;
      const wr = pbTrades.length > 0 ? Math.round((wins / pbTrades.length) * 100) : 0;
      const avgR =
        pbTrades.length > 0
          ? Number(
              (pbTrades.reduce((a, b) => a + b.rMultiple, 0) / pbTrades.length).toFixed(2)
            )
          : 0;
      const returnPct = pbTrades.length > 0
        ? calculateConsolidatedReturnPct(pbTrades, accounts).returnPct
        : 0;
      return {
        ...pb,
        tradesCount: pbTrades.length,
        pnl: Number(pnl.toFixed(2)),
        returnPct,
        winRate: wr,
        avgR,
      };
    });
  }, [trades, accounts, playbooks]);

  const gradeStats = useMemo(() => {
    const grades: SetupGrade[] = ['A+', 'B', 'C', 'FOMO', 'Sin evaluar'];
    return grades.map((g) => {
      const gTrades = trades.filter((t) => (t.setupGrade || 'Sin evaluar') === g);
      const pnl = gTrades.reduce((acc, t) => acc + t.netPnl, 0);
      const wins = gTrades.filter((t) => t.netPnl > 0).length;
      const wr = gTrades.length > 0 ? Math.round((wins / gTrades.length) * 100) : 0;
      const returnPct = gTrades.length > 0
        ? calculateConsolidatedReturnPct(gTrades, accounts).returnPct
        : 0;
      return {
        grade: g,
        count: gTrades.length,
        pnl: Number(pnl.toFixed(2)),
        returnPct,
        winRate: wr,
      };
    });
  }, [trades, accounts]);

  const pdArrayStats = useMemo(() => {
    return PD_ARRAYS.map((pd) => {
      const pdTrades = trades.filter((t) => t.pdArrays.includes(pd));
      const pnl = pdTrades.reduce((acc, t) => acc + t.netPnl, 0);
      const wins = pdTrades.filter((t) => t.netPnl > 0).length;
      const avgR =
        pdTrades.length > 0
          ? Number(
              (pdTrades.reduce((a, b) => a + b.rMultiple, 0) / pdTrades.length).toFixed(2)
            )
          : 0;
      const wr = pdTrades.length > 0 ? Math.round((wins / pdTrades.length) * 100) : 0;
      const returnPct = pdTrades.length > 0
        ? calculateConsolidatedReturnPct(pdTrades, accounts).returnPct
        : 0;
      return {
        name: pd,
        pnl: Number(pnl.toFixed(2)),
        returnPct,
        trades: pdTrades.length,
        winRate: wr,
        avgR,
      };
    }).sort((a, b) => (b.returnPct ?? b.pnl) - (a.returnPct ?? a.pnl));
  }, [trades, accounts]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {gradeStats.map((item) => (
          <div
            key={item.grade}
            className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08]"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Alineación {item.grade}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${theme.badgeClass}`}>
                {item.count} trades
              </span>
            </div>
            <div
              className={`text-2xl font-extrabold tabular-nums ${
                item.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {formatReturnPct(item.returnPct, { fallback: item.pnl >= 0 ? `+$${item.pnl}` : `-$${Math.abs(item.pnl)}` })}
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              Win Rate: <strong className="text-zinc-100">{item.winRate}%</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[#111114] rounded-2xl p-6 border border-white/[0.08]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Layers className={`w-4 h-4 ${theme.accentTextClass}`} />
              Estadísticas
            </h2>
            <p className="text-xs text-zinc-500">
              Revisa resultados por escenario y confluencia en tus operaciones registradas.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {playbookStats.length === 0 && (
            <p className="md:col-span-2 rounded-xl border border-dashed border-white/[0.12] p-5 text-sm text-zinc-400">
              No hay escenarios guardados. Puedes crear los tuyos cuando quieras.
            </p>
          )}
          {playbookStats.map((pb) => (
            <div
              key={pb.id}
              className="p-5 rounded-2xl border border-white/[0.08] bg-zinc-900/40 flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${theme.badgeClass}`}>
                      {pb.defaultKillzone}
                    </span>
                    <h3 className="text-base font-bold text-zinc-100 mt-1.5">
                      {pb.name}
                    </h3>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 mt-1">{pb.description}</p>

                <div className="mt-3 space-y-1.5">
                  {pb.rules.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-zinc-300"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.06] text-xs tabular-nums sm:grid-cols-3">
                <div>
                  <span className="text-zinc-500 block">Retorno ({pb.tradesCount}t)</span>
                  <strong
                    className={`text-sm ${
                      pb.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatReturnPct(pb.returnPct, { fallback: pb.pnl >= 0 ? `+$${pb.pnl}` : `-$${Math.abs(pb.pnl)}` })}
                  </strong>
                </div>
                <div>
                  <span className="text-zinc-500 block">Win Rate</span>
                  <strong className="text-sm text-zinc-100">{pb.winRate}%</strong>
                </div>
                <div className="text-right">
                  <span className="text-zinc-500 block">Avg R</span>
                  <strong className={`text-sm ${theme.accentTextClass}`}>{pb.avgR}R</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#111114] rounded-2xl p-6 border border-white/[0.08]">
        <h2 className="text-base font-bold text-zinc-100 mb-1">
          Efectividad por Confluencia / Lectura de Sesión
        </h2>
        <p className="text-xs text-zinc-500 mb-5">
          Resultados estadísticos de cada confluencia presente en tus ejecuciones
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pdArrayStats.map((pd) => (
            <div
              key={pd.name}
              className="p-4 rounded-xl border border-white/[0.07] bg-zinc-900/40 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-zinc-100">{pd.name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${theme.badgeClass}`}>
                  {pd.trades} trades
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06] tabular-nums sm:grid-cols-3">
                <div>
                  <span className="text-[11px] text-zinc-500 block">Retorno</span>
                  <span
                    className={`text-sm font-extrabold ${
                      pd.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatReturnPct(pd.returnPct, { fallback: pd.pnl >= 0 ? `+$${pd.pnl}` : `-$${Math.abs(pd.pnl)}` })}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-500 block">Win Rate</span>
                  <span className="text-sm font-bold text-zinc-200">{pd.winRate}%</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-zinc-500 block">Avg R</span>
                  <span className={`text-sm font-bold ${theme.accentTextClass}`}>{pd.avgR}R</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
