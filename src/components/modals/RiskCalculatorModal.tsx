"use client";

import React, { useState, useMemo } from 'react';
import { useTrading } from '@/context/TradingContext';
import { INSTRUMENT_SPECS } from '@/config/ict-constants';
import { calculatePositionSize } from '@/services/math-engine';
import { TradeDirection } from '@/types/trading';
import { X, Calculator, ArrowRight } from 'lucide-react';

interface RiskCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyToNewTrade: (prefill: {
    symbol: string;
    direction: TradeDirection;
    entryPrice: string;
    stopLoss: string;
    takeProfit: string;
    size: string;
    accountId: string;
  }) => void;
}

export function RiskCalculatorModal({
  isOpen,
  onClose,
  onApplyToNewTrade,
}: RiskCalculatorModalProps) {
  const { accounts, trades, theme } = useTrading();

  const [selectedAccId, setSelectedAccId] = useState(accounts[0]?.id || 'acc-1');
  const [symbol, setSymbol] = useState('NQ1!');
  const [riskPercent, setRiskPercent] = useState('1');
  const [entryPrice, setEntryPrice] = useState('21450');
  const [stopLossPrice, setStopLossPrice] = useState('21430');

  const currentAccountBalance = useMemo(() => {
    const acc = accounts.find((a) => a.id === selectedAccId);
    if (!acc) return 50000;
    const net = trades
      .filter((t) => t.accountId === selectedAccId)
      .reduce((s, t) => s + t.netPnl, 0);
    return acc.initialBalance + net;
  }, [accounts, trades, selectedAccId]);

  const result = useMemo(() => {
    return calculatePositionSize({
      accountBalance: currentAccountBalance,
      riskPercent: parseFloat(riskPercent) || 0,
      entryPrice: parseFloat(entryPrice) || 0,
      stopLossPrice: parseFloat(stopLossPrice) || 0,
      symbol,
    });
  }, [currentAccountBalance, riskPercent, entryPrice, stopLossPrice, symbol]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#111114] text-zinc-100 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/[0.1]">
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${theme.badgeClass}`}>
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">
                Calculadora Pre-Trade de Riesgo y Lotaje (ICT)
              </h3>
              <p className="text-xs text-zinc-400">
                Calcula tus contratos/lotes exactos antes de ejecutar en TradingView
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 cursor-pointer"
            aria-label="Cerrar calculadora"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Cuenta (Balance Actual: ${currentAccountBalance.toLocaleString('en-US')})
              </label>
              <select
                value={selectedAccId}
                onChange={(e) => setSelectedAccId(e.target.value)}
                className={`w-full px-3 py-2 text-sm rounded-xl border border-white/10 bg-[#09090B] text-zinc-100 focus:outline-none focus:ring-2 ${theme.ringClass}`}
                style={{ colorScheme: 'dark' }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Activo (TradingView)
              </label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className={`w-full px-3 py-2 text-sm rounded-xl border border-white/10 bg-[#09090B] text-zinc-100 font-semibold focus:outline-none focus:ring-2 ${theme.ringClass}`}
                style={{ colorScheme: 'dark' }}
              >
                {Object.keys(INSTRUMENT_SPECS).map((sym) => (
                  <option key={sym} value={sym}>
                    {sym} — {INSTRUMENT_SPECS[sym].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={`block text-xs font-semibold ${theme.accentTextClass} mb-1`}>
                % Riesgo por Trade
              </label>
              <input
                type="number"
                step="0.1"
                value={riskPercent}
                onChange={(e) => setRiskPercent(e.target.value)}
                className={`w-full px-3 py-2 text-sm rounded-xl border border-white/10 bg-[#09090B] text-zinc-100 font-bold focus:outline-none focus:ring-2 ${theme.ringClass}`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Precio Entrada
              </label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className={`w-full px-3 py-2 text-sm rounded-xl border border-white/10 bg-[#09090B] text-zinc-100 focus:outline-none focus:ring-2 ${theme.ringClass}`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-rose-600 mb-1">
                Precio Stop Loss
              </label>
              <input
                type="number"
                step="any"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(e.target.value)}
                className={`w-full px-3 py-2 text-sm rounded-xl border border-white/10 bg-[#09090B] text-zinc-100 focus:outline-none focus:ring-2 ${theme.ringClass}`}
              />
            </div>
          </div>

          {result ? (
              <div className="p-4 rounded-2xl bg-[#09090B] border border-white/[0.08] text-white space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-zinc-400 block">
                    Tamaño Recomendado ({result.direction})
                  </span>
                  <span className={`text-3xl font-extrabold tabular-nums ${theme.accentTextClass}`}>
                    {result.recommendedSize}{' '}
                    <span className="text-sm font-normal text-slate-300">
                      contratos / lotes
                    </span>
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] uppercase tracking-wider text-zinc-400 block">
                    Riesgo Monetario
                  </span>
                  <span className="text-xl font-bold tabular-nums text-rose-400">
                    -${result.riskDollars}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                <div className="bg-white/[0.04] border border-white/[0.06] p-2 rounded-lg">
                  <span className="text-slate-400 block">Target 1:1 (1R)</span>
                  <strong className="text-white">{result.targets.r1}</strong>
                </div>
                <div className="bg-white/[0.04] border border-white/[0.06] p-2 rounded-lg">
                  <span className="text-slate-400 block">Target 1:2 (2R)</span>
                  <strong className="text-emerald-300">{result.targets.r2}</strong>
                </div>
                <div className="bg-white/[0.04] border border-white/[0.06] p-2 rounded-lg">
                  <span className="text-slate-400 block">Target 1:3 (3R ICT)</span>
                  <strong className="text-emerald-400">{result.targets.r3}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-zinc-400 text-center">
              Ingresa precios distintos de Entrada y Stop Loss para calcular.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-white/[0.06] cursor-pointer"
            >
              Cerrar
            </button>
            {result && (
              <button
                type="button"
                onClick={() => {
                  onApplyToNewTrade({
                    symbol,
                    direction: result.direction,
                    entryPrice,
                    stopLoss: stopLossPrice,
                    takeProfit: result.targets.r3.toString(),
                    size: result.recommendedSize.toString(),
                    accountId: selectedAccId,
                  });
                }}
                className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${theme.buttonClass}`}
              >
                Enviar a Nuevo Trade <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
