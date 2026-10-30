"use client";

import React, { useState } from 'react';
import { useTrading } from '@/context/TradingContext';
import {
  Trade,
  TradeDirection,
  PsychologyTag,
  PDArray,
} from '@/types/trading';
import {
  INSTRUMENT_SPECS,
  PSYCHOLOGY_TAGS,
} from '@/config/ict-constants';
import {
  extractNyDateKey,
  getCurrentNyDateKey,
  classifyOperationalTimeWindow,
} from '@/services/date-time-service';
import {
  X,
  ClipboardPaste,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface TradeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTrade: Trade | null;
  initialEntryDate: string;
  prefillData?: Partial<Trade> | null;
}

interface TradeFormState {
  dateKey: string;
  symbol: string;
  direction: TradeDirection | '';
  selectedWindow: 'window_1' | 'window_2';
  outcomeMode: 'TP' | 'SL';
  rMultiple: string;
  realizedNetReturnPct: string;
  durationMinutes: string;
  selectedModel: PDArray;
  psychologyTag: PsychologyTag;
  tradingViewUrl: string;
  screenshotDataUrl: string;
  notes: string;
  // Optional experimental prices
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  exitPrice: string;
  size: string;
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

  const initialDateKey = editingTrade
    ? extractNyDateKey(editingTrade.entryDate) || editingTrade.entryDate.slice(0, 10)
    : extractNyDateKey(initialEntryDate) || initialEntryDate.slice(0, 10) || getCurrentNyDateKey();

  // Initial window determination
  const initialWindow: 'window_1' | 'window_2' = editingTrade?.operationalWindow
    ? editingTrade.operationalWindow === 'window_2'
      ? 'window_2'
      : 'window_1'
    : editingTrade
    ? classifyOperationalTimeWindow(editingTrade.entryDate) === 'window_2'
      ? 'window_2'
      : 'window_1'
    : 'window_1';

  // Determine initial model (preserving historical models if editing)
  const initialModel: PDArray = (() => {
    if (editingTrade?.pdArrays && editingTrade.pdArrays.length > 0) {
      return editingTrade.pdArrays[0];
    }
    return 'Breaker Block';
  })();

  const [form, setForm] = useState<TradeFormState>(() => {
    if (editingTrade) {
      return {
        dateKey: initialDateKey,
        symbol: editingTrade.symbol,
        direction: editingTrade.direction,
        selectedWindow: initialWindow,
        outcomeMode: editingTrade.status === 'Win' ? 'TP' : 'SL',
        rMultiple: (() => {
          const val = Math.abs(editingTrade.rMultiple);
          if (Number.isFinite(val)) {
            return Number(val.toFixed(2)).toString();
          }
          const fallback = Number(editingTrade.plannedRR);
          if (Number.isFinite(fallback)) {
            return Number(fallback.toFixed(2)).toString();
          }
          return '2.0';
        })(),
        realizedNetReturnPct: editingTrade.realizedNetReturnPct !== null && editingTrade.realizedNetReturnPct !== undefined
          ? Math.abs(editingTrade.realizedNetReturnPct).toString()
          : '',
        durationMinutes: editingTrade.durationMinutes !== null && editingTrade.durationMinutes !== undefined
          ? editingTrade.durationMinutes.toString()
          : '',
        selectedModel: initialModel,
        psychologyTag: editingTrade.psychologyTag,
        tradingViewUrl: editingTrade.tradingViewUrl || '',
        screenshotDataUrl: editingTrade.screenshotDataUrl || '',
        notes: editingTrade.notes || '',
        entryPrice: editingTrade.entryPrice > 0 ? editingTrade.entryPrice.toString() : '',
        stopLoss: editingTrade.stopLoss > 0 ? editingTrade.stopLoss.toString() : '',
        takeProfit: editingTrade.takeProfit > 0 ? editingTrade.takeProfit.toString() : '',
        exitPrice: editingTrade.exitPrice > 0 ? editingTrade.exitPrice.toString() : '',
        size: editingTrade.size > 0 ? editingTrade.size.toString() : '1',
      };
    }

    return {
      dateKey: initialDateKey,
      symbol: prefillData?.symbol || 'NAS100',
      direction: prefillData?.direction || '',
      selectedWindow: 'window_1',
      outcomeMode: 'TP',
      rMultiple: '2.0',
      realizedNetReturnPct: '',
      durationMinutes: '',
      selectedModel: 'Breaker Block',
      psychologyTag: 'Sin clasificar',
      tradingViewUrl: '',
      screenshotDataUrl: '',
      notes: '',
      entryPrice: '',
      stopLoss: '',
      takeProfit: '',
      exitPrice: '',
      size: '1',
    };
  });

  // Available models for selection: Breaker Block, Key Level, plus historical model if editing
  const availableModels: PDArray[] = ['Breaker Block', 'Key Level'];
  if (editingTrade?.pdArrays) {
    for (const model of editingTrade.pdArrays) {
      if (!availableModels.includes(model)) {
        availableModels.push(model);
      }
    }
  }

  const normalizedRMultiple = form.rMultiple.trim().replace(',', '.');
  const parsedRMultiple = Number(normalizedRMultiple);
  const rMultipleNum = Number.isFinite(parsedRMultiple) ? parsedRMultiple : 0;
  const signedR = form.outcomeMode === 'TP' ? Math.abs(rMultipleNum) : -Math.abs(rMultipleNum);

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

    // Resolve target account transparently in the background
    let resolvedAccountId = editingTrade?.accountId || defaultAccountId;
    if (!resolvedAccountId || !accounts.some((a) => a.id === resolvedAccountId)) {
      if (accounts.length > 0) {
        resolvedAccountId = accounts[0].id;
      } else {
        const fallbackAcc = addAccount({
          name: 'Cuenta Principal',
          firm: 'Martin OS Trading',
          initialBalance: 100000,
          profitTarget: 8000,
          maxDrawdown: 10000,
          dailyLossLimit: 5000,
        });
        resolvedAccountId = fallbackAcc.id;
      }
    }

    if (!form.direction) {
      setFormError('Selecciona la dirección de la operación (Long o Short).');
      return;
    }

    const isUnchangedHistoricalZero = Boolean(
      editingTrade &&
      Number(Math.abs(editingTrade.rMultiple).toFixed(2)) === 0 &&
      rMultipleNum === 0
    );

    if (!/^\d+(?:[.,]\d{1,2})?$/.test(form.rMultiple.trim()) || !Number.isFinite(rMultipleNum) || (rMultipleNum <= 0 && !isUnchangedHistoricalZero)) {
      setFormError('Ingresa un R-Multiple positivo con hasta dos decimales (ej: 1,25 o 2.50).');
      return;
    }

    // Validate optional realized return pct
    let finalRealizedReturnPct: number | null = null;
    if (form.realizedNetReturnPct.trim() !== '') {
      const cleanPctStr = form.realizedNetReturnPct.trim().replace(',', '.');
      const numPct = Number(cleanPctStr);
      if (!Number.isFinite(numPct) || !/^\d+(?:[.,]\d{1,4})?$/.test(form.realizedNetReturnPct.trim())) {
        setFormError('La rentabilidad neta % opcional debe ser un número válido positivo (ej: 1.5 o 2,25).');
        return;
      }
      finalRealizedReturnPct = form.outcomeMode === 'SL' ? -Math.abs(numPct) : Math.abs(numPct);
    }

    // Validate optional duration
    let finalDurationMinutes: number | null = null;
    if (form.durationMinutes.trim() !== '') {
      const numDur = Number(form.durationMinutes.trim());
      if (!Number.isFinite(numDur) || numDur < 0) {
        setFormError('La duración debe ser un número entero mayor o igual a 0 minutos.');
        return;
      }
      finalDurationMinutes = Math.round(numDur);
    }

    // Determine timestamp without fabricating false precision
    let finalEntryDate: string;
    let finalTimePrecision: 'exact' | 'window';

    if (editingTrade && editingTrade.timePrecision !== 'window' && form.selectedWindow === initialWindow && form.dateKey === initialDateKey) {
      finalEntryDate = editingTrade.entryDate;
      finalTimePrecision = 'exact';
    } else {
      const repTime = form.selectedWindow === 'window_1' ? '09:30:00' : '10:35:00';
      finalEntryDate = `${form.dateKey}T${repTime}`;
      finalTimePrecision = 'window';
    }

    // Check optional experimental prices
    const parsedEntry = parseFloat(form.entryPrice) || 0;
    const parsedExit = parseFloat(form.exitPrice) || 0;
    const parsedSL = parseFloat(form.stopLoss) || 0;
    const parsedTP = parseFloat(form.takeProfit) || 0;
    const parsedSize = parseFloat(form.size) || 1;

    const hasEnteredPrices = parsedEntry > 0 && parsedExit > 0;

    let finalNetPnl = 0;
    let finalCalculationMode: 'monetary' | 'derived_r' | 'unrecorded' = 'unrecorded';
    let finalCommission = 0;
    let finalCommissionUnmeasured = true;

    if (hasEnteredPrices) {
      finalCalculationMode = 'monetary';
      const priceDiff = form.direction === 'Long' ? (parsedExit - parsedEntry) : (parsedEntry - parsedExit);
      finalNetPnl = Number((priceDiff * parsedSize).toFixed(2));
      finalCommission = 0;
      finalCommissionUnmeasured = true;
    } else if (editingTrade && editingTrade.calculationMode === 'monetary') {
      // Preserve historical monetary figures if prices weren't re-entered
      finalCalculationMode = 'monetary';
      finalNetPnl = editingTrade.netPnl;
      finalCommission = editingTrade.commission;
      finalCommissionUnmeasured = Boolean(editingTrade.commissionUnmeasured);
    } else {
      // V1b simplified trade without prices: unrecorded monetary figures
      finalCalculationMode = 'unrecorded';
      finalNetPnl = 0;
      finalCommission = 0;
      finalCommissionUnmeasured = true;
    }

    const payload: Omit<Trade, 'id'> = {
      symbol: form.symbol.toUpperCase(),
      direction: form.direction as TradeDirection,
      entryDate: finalEntryDate,
      timePrecision: finalTimePrecision,
      operationalWindow: form.selectedWindow,
      entryPrice: hasEnteredPrices ? parsedEntry : (editingTrade?.entryPrice || 0),
      exitPrice: hasEnteredPrices ? parsedExit : (editingTrade?.exitPrice || 0),
      stopLoss: parsedSL > 0 ? parsedSL : (editingTrade?.stopLoss || 0),
      takeProfit: parsedTP > 0 ? parsedTP : (editingTrade?.takeProfit || 0),
      size: parsedSize > 0 ? parsedSize : (editingTrade?.size || 1),
      pricesUnrecorded: !hasEnteredPrices && !(editingTrade && editingTrade.entryPrice > 0),
      riskPercentUsed: editingTrade?.riskPercentUsed || 1.0,
      htfAligned: editingTrade?.htfAligned || ['1D', '4H', '2H', '30m'],
      grossPnl: finalNetPnl + finalCommission,
      commission: finalCommission,
      commissionUnmeasured: finalCommissionUnmeasured,
      netPnl: finalNetPnl,
      plannedRR: isUnchangedHistoricalZero && editingTrade ? editingTrade.plannedRR : Number(Math.abs(rMultipleNum).toFixed(2)),
      rMultiple: isUnchangedHistoricalZero && editingTrade ? editingTrade.rMultiple : Number(signedR.toFixed(2)),
      realizedNetReturnPct: finalRealizedReturnPct,
      durationMinutes: finalDurationMinutes,
      status: form.outcomeMode === 'TP' ? 'Win' : 'Loss',
      killzone:
        form.selectedWindow === 'window_1'
          ? 'NY Open 09:30 AM (09:30-10:30)'
          : 'NY Mid-Morning (10:30-12:00)',
      playbookId: editingTrade?.playbookId || undefined,
      pdArrays: [form.selectedModel],
      checklistCompleted: editingTrade?.checklistCompleted || [],
      setupGrade: editingTrade?.setupGrade || 'Sin evaluar',
      dailyBias: editingTrade?.dailyBias || 'Neutral',
      dolTarget: editingTrade?.dolTarget || '',
      timeframe: editingTrade?.timeframe || '5m',
      followedPlan: editingTrade?.followedPlan ?? true,
      psychologyTag: form.psychologyTag,
      tradingViewUrl: form.tradingViewUrl || undefined,
      screenshotDataUrl: form.screenshotDataUrl || undefined,
      notes: form.notes,
      accountId: resolvedAccountId,
      calculationMode: finalCalculationMode,
    };

    if (editingTrade) {
      updateTrade({ ...payload, id: editingTrade.id });
    } else {
      addTrade(payload);
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
                  Si se omite, se preservará como &quot;Sin dato&quot; sin inventar 0%.
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
                  placeholder="Ej: 15 (minutos)"
                  className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-zinc-900 text-zinc-100 font-mono focus:outline-none focus:ring-2 ${theme.ringClass}`}
                />
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Duración manual del trade. Si se deja vacía, se almacena desconocida.
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
              <span>Precios de Ejecución (Opcional — experimental)</span>
              {showOptionalPrices ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showOptionalPrices && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 p-3 pt-0 border-t border-white/[0.04]">
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
