"use client";

import React, { useState } from 'react';
import { Trade } from '@/types/trading';
import { useTrading } from '@/context/TradingContext';
import { resolveTradeImage } from '@/services/storage-service';
import { calculateTradeReturnPct, formatReturnPct } from '@/services/financial-engine';
import {
  X,
  ExternalLink,
  Trash2,
  Edit3,
  CheckCircle2,
  Maximize2,
} from 'lucide-react';

interface TradeInspectorDrawerProps {
  trade: Trade | null;
  onClose: () => void;
  onEdit: (trade: Trade) => void;
}

export function TradeInspectorDrawer({
  trade,
  onClose,
  onEdit,
}: TradeInspectorDrawerProps) {
  const { accounts, playbooks, deleteTrade, theme } = useTrading();
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  if (!trade) return null;

  const imageUrl = resolveTradeImage(trade);
  const targetAccount = accounts.find((a) => a.id === trade.accountId);
  const accountName = targetAccount?.name || trade.accountId;
  const playbookName = playbooks.find((p) => p.id === trade.playbookId)?.name || 'Setup Personalizado';
  const tradeReturnPct = calculateTradeReturnPct(trade.netPnl, targetAccount?.initialBalance);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 flex justify-end"
        onClick={onClose}
      >
        <div
          className="w-full max-w-xl bg-[#111114] text-zinc-100 h-full shadow-2xl border-l border-white/[0.1] p-4 sm:p-6 overflow-y-auto flex flex-col justify-between"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${theme.accentTextClass}`}>
                    {accountName}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-xs text-zinc-400">
                    {trade.entryDate.slice(0, 10)}
                    {trade.timePrecision === 'window'
                      ? ` · Ventana ${trade.operationalWindow === 'window_2' ? '2 (10:35–11:00)' : '1 (09:30–10:35)'}`
                      : ` · ${trade.entryDate.split('T')[1]?.slice(0, 5) || ''} NY`}
                  </span>
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-white/[0.06] text-zinc-300 border border-white/[0.08]">
                    Grade: {trade.setupGrade || 'Sin evaluar'}
                  </span>
                </div>
                <h3 className="text-xl font-extrabold text-zinc-100 flex flex-wrap items-center gap-2 mt-1">
                  <span>{trade.symbol} ({trade.direction})</span>
                  <span
                    className={`text-base px-2.5 py-0.5 rounded-full font-bold tabular-nums ${
                      trade.netPnl >= 0
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {formatReturnPct(tradeReturnPct, {
                      fallback: trade.netPnl >= 0 ? `+$${trade.netPnl.toFixed(2)}` : `-$${Math.abs(trade.netPnl).toFixed(2)}`,
                    })}
                  </span>
                  <span className="text-xs text-zinc-400 font-normal">
                    ({trade.calculationMode === 'derived_r' ? '~' : ''}
                    {trade.netPnl >= 0 ? `+$${trade.netPnl.toFixed(2)}` : `-$${Math.abs(trade.netPnl).toFixed(2)}`} USD
                    {trade.calculationMode === 'derived_r' ? ' derivado' : ''})
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-900 border border-white/10 text-zinc-400 font-normal">
                    {trade.commissionUnmeasured ? 'Comisión: No medida' : `Comisión: $${trade.commission.toFixed(2)}`}
                  </span>
                </h3>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white cursor-pointer"
                aria-label="Cerrar detalle de operación"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-[#09090B] p-4 rounded-xl border border-white/[0.08] text-xs tabular-nums sm:grid-cols-4">
              {trade.pricesUnrecorded ? (
                <div className="col-span-2 sm:col-span-4 text-center py-1 text-zinc-400 text-xs flex items-center justify-between">
                  <span>Captura basada en Riesgo ({trade.riskPercentUsed || 1.0}%) y R-Multiple</span>
                  <strong className={`text-sm ${theme.accentTextClass}`}>{trade.rMultiple}R</strong>
                </div>
              ) : (
                <>
                  <div>
                    <span className="text-zinc-500 block">Entrada</span>
                    <strong className="text-zinc-100 text-sm">{trade.entryPrice > 0 ? trade.entryPrice : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Salida</span>
                    <strong className="text-zinc-100 text-sm">{trade.exitPrice > 0 ? trade.exitPrice : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Stop Loss</span>
                    <strong className="text-rose-400 text-sm">{trade.stopLoss > 0 ? trade.stopLoss : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">R-Multiple</span>
                    <strong className={`text-sm ${theme.accentTextClass}`}>{trade.rMultiple}R</strong>
                  </div>
                </>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Gráfico de la Ejecución
                </span>
                <div className="flex items-center gap-3">
                  {imageUrl && (
                    <button
                      onClick={() => setIsZoomOpen(true)}
                      className={`text-xs font-semibold ${theme.accentTextClass} hover:underline flex items-center gap-1 cursor-pointer`}
                    >
                      <Maximize2 className="w-3.5 h-3.5" /> Pantalla Completa
                    </button>
                  )}
                  {trade.tradingViewUrl && (
                    <a
                      href={trade.tradingViewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-zinc-400 hover:text-zinc-100 hover:underline flex items-center gap-1"
                    >
                      TradingView <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {imageUrl ? (
                <div
                  onClick={() => setIsZoomOpen(true)}
                  className="rounded-xl overflow-hidden border border-white/[0.08] bg-black cursor-zoom-in"
                >
                  <img
                    src={imageUrl}
                    alt="Trade Chart"
                    className="w-full h-auto object-contain max-h-80"
                  />
                </div>
              ) : (
                <div className="h-36 rounded-xl border border-dashed border-white/[0.12] flex flex-col items-center justify-center text-xs text-zinc-500 bg-[#09090B]">
                  <span>Sin captura de gráfico adjunta</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                  Playbook & Killzone
                </span>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-lg bg-white/[0.06] text-zinc-200 border border-white/[0.08] text-xs font-semibold">
                    {playbookName}
                  </span>
                  <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${theme.badgeClass}`}>
                    {trade.killzone}
                  </span>
                  {trade.dolTarget && (
                    <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs font-semibold">
                      DOL: {trade.dolTarget}
                    </span>
                  )}
                </div>
              </div>

              {trade.checklistCompleted && trade.checklistCompleted.length > 0 && (
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                    Reglas ICT Cumplidas ({trade.checklistCompleted.length})
                  </span>
                  <div className="space-y-1 bg-[#09090B] p-3 rounded-xl border border-white/[0.08]">
                    {trade.checklistCompleted.map((rule) => (
                      <div
                        key={rule}
                        className="flex items-center gap-2 text-xs text-zinc-300"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>{rule}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                  Notas y Psicología ({trade.psychologyTag})
                </span>
                <div className="p-4 rounded-xl bg-[#09090B] border border-white/[0.08] text-sm text-zinc-300 whitespace-pre-wrap">
                  {trade.notes || 'Sin notas registradas.'}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.08] flex justify-between">
            <button
              onClick={() => {
                deleteTrade(trade.id);
                onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" /> Eliminar
            </button>
            <button
              onClick={() => onEdit(trade)}
              className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${theme.buttonClass}`}
            >
              <Edit3 className="w-4 h-4" /> Editar Trade
            </button>
          </div>
        </div>
      </div>

      {isZoomOpen && imageUrl && (
        <div
          onClick={() => setIsZoomOpen(false)}
          className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center p-6 cursor-zoom-out"
        >
          <img
            src={imageUrl}
            alt="Fullscreen Chart"
            className="max-w-full max-h-full rounded-xl shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
