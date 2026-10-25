"use client";

import React, { useState } from 'react';
import { useTrading } from '@/context/TradingContext';
import { calculateDashboardMetrics } from '@/services/math-engine';
import { Plus, Trash2, X, ShieldCheck } from 'lucide-react';

export function AccountsView() {
  const { accounts, trades, addAccount, deleteAccount, theme } = useTrading();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [newAcc, setNewAcc] = useState({
    name: 'Funding Pips 100K',
    firm: 'Funding Pips',
    initialBalance: '100000',
    profitTarget: '8000',
    maxDrawdown: '10000',
    dailyLossLimit: '5000',
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    addAccount({
      name: newAcc.name,
      firm: newAcc.firm,
      initialBalance: parseFloat(newAcc.initialBalance) || 100000,
      profitTarget: parseFloat(newAcc.profitTarget) || 8000,
      maxDrawdown: parseFloat(newAcc.maxDrawdown) || 10000,
      dailyLossLimit: parseFloat(newAcc.dailyLossLimit) || 5000,
    });
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <ShieldCheck className={`w-4 h-4 ${theme.accentTextClass}`} />
            Cuentas de Fondeo & Gestión de Riesgo (Funding Pips)
          </h2>
          <p className="text-xs text-zinc-500">
            Monitoreo en vivo de Profit Target, Max Drawdown y riesgo fijo del 1% al 2%
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer ${theme.buttonClass}`}
        >
          <Plus className="w-4 h-4" /> Añadir Cuenta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {accounts.map((acc) => {
          const accTrades = trades.filter((t) => t.accountId === acc.id);
          const accMetrics = calculateDashboardMetrics(accTrades);
          const currentBalance = acc.initialBalance + accMetrics.netPnl;
          const targetProgress = Math.min(
            Math.max(Math.round((accMetrics.netPnl / acc.profitTarget) * 100), 0),
            100
          );
          const ddUsed = Math.min(
            Math.round((accMetrics.maxDrawdown / acc.maxDrawdown) * 100),
            100
          );
          const risk1Pct = Math.round(currentBalance * 0.01);
          const risk2Pct = Math.round(currentBalance * 0.02);

          return (
            <div
              key={acc.id}
              className="bg-[#111114] rounded-2xl p-6 border border-white/[0.08] space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded ${theme.badgeClass}`}>
                    {acc.firm}
                  </span>
                  <h3 className="text-lg font-bold text-zinc-100 mt-1.5">
                    {acc.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-extrabold tabular-nums text-white">
                    ${currentBalance.toLocaleString('en-US')}
                  </span>
                  {accounts.length > 1 && (
                    <button
                      disabled={trades.some((trade) => trade.accountId === acc.id)}
                      onClick={() => deleteAccount(acc.id)}
                      title={trades.some((trade) => trade.accountId === acc.id)
                        ? 'No se puede eliminar una cuenta que tiene operaciones registradas.'
                        : 'Eliminar cuenta'}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-zinc-900/90 p-3 rounded-xl border border-white/[0.06] flex items-center justify-between text-xs tabular-nums">
                <span className="text-zinc-400 font-medium">
                  Riesgo por Trade (TP / SL Directo):
                </span>
                <span className={`font-bold ${theme.accentTextClass}`}>
                  1% = ${risk1Pct.toLocaleString('en-US')} · 2% = ${risk2Pct.toLocaleString('en-US')}
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-zinc-400">
                    Meta Profit Target (${acc.profitTarget.toLocaleString('en-US')})
                  </span>
                  <span className="font-bold text-emerald-400">
                    {targetProgress}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-white/[0.05]">
                  <div
                    className="h-full bg-emerald-400 transition-all"
                    style={{ width: `${targetProgress}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-zinc-400">
                    Max Drawdown Consumido (${accMetrics.maxDrawdown} de $
                    {acc.maxDrawdown.toLocaleString('en-US')})
                  </span>
                  <span className="font-bold text-rose-400">{ddUsed}%</span>
                </div>
                <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-white/[0.05]">
                  <div
                    className="h-full bg-rose-500 transition-all"
                    style={{ width: `${ddUsed}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/[0.06] text-xs tabular-nums sm:grid-cols-4">
                <div>
                  <span className="text-zinc-500 block">Net P&L</span>
                  <span
                    className={`font-bold ${
                      accMetrics.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ${accMetrics.netPnl}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Win Rate</span>
                  <span className="font-bold text-zinc-200">
                    {accMetrics.winRate}%
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Daily Loss Limit</span>
                  <span className="font-bold text-rose-400">
                    ${acc.dailyLossLimit.toLocaleString('en-US')}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-zinc-500 block">Trades</span>
                  <span className="font-bold text-zinc-200">
                    {accMetrics.totalTrades}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#111114] text-zinc-100 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-white/10">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h3 className="text-base font-bold text-white">
                Añadir Cuenta Prop Firm
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 mt-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Nombre de la Cuenta
                </label>
                <input
                  type="text"
                  required
                  value={newAcc.name}
                  onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })}
                  placeholder="Ej: Funding Pips 100K - Fase 1"
                  className="w-full px-3 py-2 text-sm rounded-xl bg-zinc-900 border border-white/10 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Prop Firm
                  </label>
                  <input
                    type="text"
                    required
                    value={newAcc.firm}
                    onChange={(e) =>
                      setNewAcc({ ...newAcc, firm: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl bg-zinc-900 border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Balance Inicial ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={newAcc.initialBalance}
                    onChange={(e) =>
                      setNewAcc({ ...newAcc, initialBalance: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl bg-zinc-900 border border-white/10 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-emerald-400 mb-1">
                    Profit Target ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={newAcc.profitTarget}
                    onChange={(e) =>
                      setNewAcc({ ...newAcc, profitTarget: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl bg-zinc-900 border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-rose-400 mb-1">
                    Max Drawdown ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={newAcc.maxDrawdown}
                    onChange={(e) =>
                      setNewAcc({ ...newAcc, maxDrawdown: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl bg-zinc-900 border border-white/10 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-400 mb-1">
                    Daily Loss ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={newAcc.dailyLossLimit}
                    onChange={(e) =>
                      setNewAcc({ ...newAcc, dailyLossLimit: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl bg-zinc-900 border border-white/10 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:bg-white/5 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-xs font-bold cursor-pointer ${theme.buttonClass}`}
                >
                  Guardar Cuenta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
