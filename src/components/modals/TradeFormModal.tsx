"use client";

import React, { useState } from 'react';
import { useTrading } from '@/context/TradingContext';
import {
  Trade,
  TradeDirection,
  PsychologyTag,
  PDArray,
  TradeSourceType,
} from '@/types/trading';
import {
  INSTRUMENT_SPECS,
  PSYCHOLOGY_TAGS,
  getInstrumentSpec,
} from '@/config/ict-constants';
import {
  TradeFormState,
  createInitialTradeFormState,
  resolveTradeFormSubmission,
} from '@/services/trade-form-service';
import {
  X,
  ClipboardPaste,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export { createInitialTradeFormState, resolveTradeFormSubmission };
export type { TradeFormState };

interface TradeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTrade: Trade | null;
  initialEntryDate: string;
  prefillData?: Partial<Trade> | null;
}

export function TradeFormModal({ isOpen, ...props }: TradeFormModalProps) {
  if (!isOpen) return null;

  const formKey = props.editingTrade
    ? `trade-${props.editingTrade.id}`
    : `new-${props.initialEntryDate}-${JSON.stringify(props.prefillData ?? null)}`;

  return <TradeFormModalContent key={formKey} {...props} />;
}

function TradeFormModalContent({
  onClose,
  editingTrade,
  initialEntryDate,
  prefillData,
}: Omit<TradeFormModalProps, 'isOpen'>) {
  const {
    accounts,
    defaultAccountId,
    addTrade,
    updateTrade,
    addAccount,
    theme,
  } = useTrading();

  const [formError, setFormError] = useState<string | null>(null);
  const [showOptionalPrices, setShowOptionalPrices] = useState(
    Boolean(editingTrade && (editingTrade.entryPrice > 0 || editingTrade.exitPrice > 0))
  );

  const [form, setForm] = useState<TradeFormState>(() =>
    createInitialTradeFormState(editingTrade, initialEntryDate, prefillData)
  );

  // Available models for selection: Breaker Block, Key Level, plus historical model if editing
  const availableModels: PDArray[] = ['Breaker Block', 'Key Level'];
  if (editingTrade?.pdArrays) {
    for (const model of editingTrade.pdArrays) {
      if (!availableModels.includes(model)) {
        availableModels.push(model);
      }
    }
  }

  const instrumentSpec = getInstrumentSpec(form.symbol);

  const handlePasteClipboardImage = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (evt) => {
          setForm((prev) => ({
            ...prev,
            screenshotDataUrl: evt.target?.result as string,
          }));
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setForm((prev) => ({
        ...prev,
        screenshotDataUrl: evt.target?.result as string,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Resolve target account without inventing fictitious capital
    let resolvedAccountId = editingTrade?.accountId || defaultAccountId;
    if (!resolvedAccountId || !accounts.some((a) => a.id === resolvedAccountId)) {
      if (accounts.length > 0) {
        resolvedAccountId = accounts[0].id;
      } else {
        // Technical account without declared capital (initialBalance = 0)
        const technicalAcc = addAccount({
          name: 'Bitácora Personal',
          firm: 'Personal',
          initialBalance: 0,
          profitTarget: 0,
          maxDrawdown: 0,
          dailyLossLimit: 0,
          isTechnical: true,
          hasVerifiedBalance: false,
        });
        resolvedAccountId = technicalAcc.id;
      }
    }

    const resolution = resolveTradeFormSubmission(form, editingTrade, resolvedAccountId);
    if (resolution.error || !resolution.payload) {
      setFormError(resolution.error || 'Error al validar los datos de la operación.');
      return;
    }

    if (editingTrade) {
      updateTrade({ ...resolution.payload, id: editingTrade.id });
    } else {
      addTrade(resolution.payload);
    }
    onClose();
  };

  return (
    <div
      onPaste={handlePasteClipboardImage}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-[#111114] text-zinc-100 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-white/[0.1] max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.08]">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base sm:text-lg font-bold text-zinc-100">
              {editingTrade ? 'Editar Operación' : 'Registrar Operación'}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-900 border border-white/10 text-zinc-300">
              {form.dateKey}
            </span>
          </div>

          <button
            onClick={onClose}
            aria-label="Cerrar formulario"
            className="p-1.5 rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-300"
            >
              {formError}
            </div>
          )}

          {/* 1. Datos Principales */}
          <div className="space-y-3 bg-[#09090B] p-4 rounded-xl border border-white/[0.08]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Datos Principales
            </h4>

            {/* Selector de Entorno: Real, Demo, Backtesting */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Entorno de Ejecución
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {[
                  { id: 'real', label: 'Real', desc: 'Capital en vivo' },
                  { id: 'demo', label: 'Demo', desc: 'Simulación' },
                  { id: 'backtest', label: 'Backtesting', desc: 'Histórico' },
                ].map((item) => {
                  const active = form.sourceType === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setForm((prev) => ({ ...prev, sourceType: item.id as TradeSourceType }))}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center border ${
                        active
                          ? 'bg-zinc-800 border-white/30 text-white shadow-sm'
                          : 'bg-zinc-900/60 border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                      }`}
                    >
                      <div>{item.label}</div>
                      <span className="text-[10px] text-zinc-500 font-normal block">{item.desc}</span>
                    </button>
                  );
                })}
                {editingTrade && (!editingTrade.sourceType || editingTrade.sourceType === 'unclassified') && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, sourceType: 'unclassified' }))}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center border ${
                      form.sourceType === 'unclassified'
                        ? 'bg-zinc-800 border-white/30 text-zinc-300 shadow-sm'
                        : 'bg-zinc-900/60 border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
                    }`}
                  >
                    <div>Sin clasificar</div>
                    <span className="text-[10px] text-zinc-500 font-normal block">Histórico</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Fecha de operación
                </label>
                <input
                  type="date"
                  required
                  value={form.dateKey}
                  onChange={(e) => setForm({ ...form, dateKey: e.target.value })}
                  className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-zinc-900 text-zinc-100 font-bold focus:outline-none focus:ring-2 ${theme.ringClass}`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Activo
                </label>
                <select
                  value={form.symbol}
                  onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                  className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-zinc-900 text-zinc-100 font-bold focus:outline-none focus:ring-2 ${theme.ringClass}`}
                >
                  {Object.keys(INSTRUMENT_SPECS).map((sym) => (
                    <option key={sym} value={sym}>
                      {sym} — {INSTRUMENT_SPECS[sym].label.split(' (')[0]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Dirección
                </label>
                <select
                  required
                  value={form.direction}
                  onChange={(e) =>
                    setForm({ ...form, direction: e.target.value as TradeDirection })
                  }
                  className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-zinc-900 text-zinc-100 font-semibold focus:outline-none focus:ring-2 ${theme.ringClass}`}
                >
                  <option value="" disabled>Selecciona dirección</option>
                  <option value="Long">Long (Compra)</option>
                  <option value="Short">Short (Venta)</option>
                </select>
              </div>

              <div>
                <label className={`block text-xs font-semibold ${theme.accentTextClass} mb-1`}>
                  Ventana Horaria NY
                </label>
                <select
                  value={form.selectedWindow}
                  onChange={(e) =>
                    setForm({ ...form, selectedWindow: e.target.value as 'window_1' | 'window_2' })
                  }
                  className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-zinc-900 font-bold text-zinc-100 focus:outline-none focus:ring-2 ${theme.ringClass}`}
                >
                  <option value="window_1">09:30–10:35 NY</option>
                  <option value="window_2">10:35–11:00 NY</option>
                </select>
              </div>
            </div>

            {/* Modelo de entrada y Resultado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Modelo de Entrada (Único)
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableModels.map((model) => {
                    const isSelected = form.selectedModel === model;
                    return (
                      <button
                        type="button"
                        key={model}
                        onClick={() => setForm((prev) => ({ ...prev, selectedModel: model }))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? theme.buttonClass
                            : 'bg-zinc-900 border border-white/10 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {model.split(' (')[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Resultado
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, outcomeMode: 'TP' }))}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      form.outcomeMode === 'TP'
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'bg-white/[0.06] text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    TP Hit
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, outcomeMode: 'SL' }))}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      form.outcomeMode === 'SL'
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                        : 'bg-white/[0.06] text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    SL Hit
                  </button>
                </div>
              </div>
            </div>

            {/* R-Multiple */}
            <div className="pt-1">
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                R-Multiple Obtenido
              </label>
              <div className="max-w-xs">
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={form.rMultiple}
                  onChange={(e) => {
                    const sanitized = e.target.value.trim().replace(/\s+/g, '');
                    if (/^\d*(?:[.,]\d{0,2})?$/.test(sanitized)) {
                      setForm((prev) => ({ ...prev, rMultiple: sanitized }));
                    }
                  }}
                  placeholder="Ej: 1,25 o 2.50"
                  className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-zinc-900 text-zinc-100 font-bold font-mono focus:outline-none focus:ring-2 ${theme.ringClass}`}
                />
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Métrica independiente en R (sin asumir 1% de riesgo).
                </span>
              </div>
            </div>
          </div>

          {/* 2. Resultado Económico y Duración */}
          <div className="space-y-3 bg-[#09090B] p-4 rounded-xl border border-white/[0.08]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Resultado Económico & Duración (Opcionales)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Rentabilidad neta % (Opcional)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.realizedNetReturnPct}
                  onChange={(e) => {
                    const sanitized = e.target.value.trim().replace(/\s+/g, '');
                    if (/^\d*(?:[.,]\d{0,4})?$/.test(sanitized)) {
                      setForm((prev) => ({ ...prev, realizedNetReturnPct: sanitized }));
                    }
                  }}
                  placeholder="Ej: 1.50 (dejar vacío si es desconocido)"
                  className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-zinc-900 text-zinc-100 font-mono focus:outline-none focus:ring-2 ${theme.ringClass}`}
                />
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Si se omite o limpia, se preservará como &quot;Sin dato&quot; (`null`) sin alterar P&amp;L.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Duración del Trade en minutos (Opcional)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.durationMinutes}
                  onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                  placeholder="Ej: 15 (minutos enteros)"
                  className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-zinc-900 text-zinc-100 font-mono focus:outline-none focus:ring-2 ${theme.ringClass}`}
                />
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Duración manual en minutos enteros. Si se deja vacía, se almacena desconocida.
                </span>
              </div>
            </div>
          </div>

          {/* 3. Otros Datos (Emocional, Gráfico, Notas) */}
          <div className="space-y-3 bg-[#09090B] p-4 rounded-xl border border-white/[0.08]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Psicología, Captura & Notas
            </h4>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Estado Emocional / Disciplina
              </label>
              <select
                value={form.psychologyTag}
                onChange={(e) =>
                  setForm({ ...form, psychologyTag: e.target.value as PsychologyTag })
                }
                className={`w-full px-3 py-2 text-xs bg-zinc-900 text-zinc-100 rounded-xl border border-white/10 focus:outline-none focus:ring-2 ${theme.ringClass}`}
              >
                {PSYCHOLOGY_TAGS.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-300">
                  Captura de TradingView
                </label>
                <input
                  type="url"
                  value={form.tradingViewUrl}
                  onChange={(e) => setForm({ ...form, tradingViewUrl: e.target.value })}
                  placeholder="https://www.tradingview.com/x/..."
                  className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-zinc-900 text-zinc-100 focus:outline-none focus:ring-2 ${theme.ringClass}`}
                />
                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer">
                    <ImageIcon className={`w-3.5 h-3.5 ${theme.accentTextClass}`} />
                    Subir Imagen
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileUpload}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <ClipboardPaste className="w-3.5 h-3.5" /> O presiona Ctrl+V
                  </span>
                </div>
                {form.screenshotDataUrl && (
                  <div className="flex items-center justify-between bg-emerald-500/10 px-3 py-1.5 rounded-lg text-xs text-emerald-300 font-semibold border border-emerald-500/20">
                    <span>Captura lista para guardar</span>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, screenshotDataUrl: '' })}
                      className="text-rose-400 underline cursor-pointer text-xs"
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Notas Libres
                </label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Comentarios sobre el trade, confirmación o gestión..."
                  className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-zinc-900 text-zinc-100 focus:outline-none focus:ring-2 ${theme.ringClass}`}
                />
              </div>
            </div>
          </div>

          {/* 4. Precios de Ejecución Opcionales (Experimental y Plegable) */}
          <div className="rounded-xl border border-white/[0.06] bg-zinc-950/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOptionalPrices((prev) => !prev)}
              className="w-full px-3.5 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 flex items-center justify-between cursor-pointer"
            >
              <span>
                Precios de Ejecución (Opcional — experimental) · {instrumentSpec.label}
              </span>
              {showOptionalPrices ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showOptionalPrices && (
              <div className="space-y-2 p-3 pt-0 border-t border-white/[0.04]">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Precio Entrada</label>
                    <input
                      type="number"
                      step="any"
                      value={form.entryPrice}
                      onChange={(e) => setForm({ ...form, entryPrice: e.target.value })}
                      placeholder="Opcional"
                      className="w-full px-2 py-1 text-xs bg-zinc-900 text-zinc-200 rounded-lg border border-white/10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-rose-500 mb-0.5">Stop Loss</label>
                    <input
                      type="number"
                      step="any"
                      value={form.stopLoss}
                      onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
                      placeholder="Opcional"
                      className="w-full px-2 py-1 text-xs bg-zinc-900 text-zinc-200 rounded-lg border border-white/10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-emerald-500 mb-0.5">Take Profit</label>
                    <input
                      type="number"
                      step="any"
                      value={form.takeProfit}
                      onChange={(e) => setForm({ ...form, takeProfit: e.target.value })}
                      placeholder="Opcional"
                      className="w-full px-2 py-1 text-xs bg-zinc-900 text-zinc-200 rounded-lg border border-white/10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Precio Salida</label>
                    <input
                      type="number"
                      step="any"
                      value={form.exitPrice}
                      onChange={(e) => setForm({ ...form, exitPrice: e.target.value })}
                      placeholder="Opcional"
                      className="w-full px-2 py-1 text-xs bg-zinc-900 text-zinc-200 rounded-lg border border-white/10"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Lotes / Contratos</label>
                    <input
                      type="number"
                      step="any"
                      value={form.size}
                      onChange={(e) => setForm({ ...form, size: e.target.value })}
                      placeholder="1"
                      className="w-full px-2 py-1 text-xs bg-zinc-900 text-zinc-200 rounded-lg border border-white/10"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Especificación: {instrumentSpec.unitLabel} — P&amp;L derivado de precios es teórico (sin comisiones ni slippage medidos).
                </p>
              </div>
            )}
          </div>

          {/* 5. Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-white/[0.06] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={`px-5 py-2 rounded-xl text-xs font-semibold shadow-md cursor-pointer ${theme.buttonClass}`}
            >
              {editingTrade ? 'Guardar Cambios' : 'Registrar Operación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
