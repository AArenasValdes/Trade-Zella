"use client";

import React, { useState } from 'react';
import { useTrading, resolveTargetAccount } from '@/context/TradingContext';
import {
  Trade,
  TradeDirection,
  PsychologyTag,
  PDArray,
} from '@/types/trading';
import {
  INSTRUMENT_SPECS,
  PSYCHOLOGY_TAGS,
  ICT_CHECKLIST_ITEMS,
} from '@/config/ict-constants';
import { calculateSetupGrade } from '@/services/math-engine';
import {
  extractNyDateKey,
  getCurrentNyDateKey,
  classifyOperationalTimeWindow,
} from '@/services/date-time-service';
import {
  X,
  ClipboardPaste,
  CheckSquare,
  Image as ImageIcon,
  AlertTriangle,
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
  symbol: string;
  direction: TradeDirection | '';
  selectedWindow: 'window_1' | 'window_2';
  riskPercentUsed: '1.0' | '1.5' | '2.0';
  outcomeMode: 'TP' | 'SL';
  rMultiple: string;
  playbookId: string;
  pdArrays: PDArray[];
  checklistCompleted: string[];
  dailyBias: 'Bullish' | 'Bearish' | 'Neutral';
  dolTarget: string;
  followedPlan: boolean;
  psychologyTag: PsychologyTag;
  tradingViewUrl: string;
  screenshotDataUrl: string;
  notes: string;
  // Optional secondary prices
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
    dailyNotes,
    defaultAccountId,
    setDefaultAccountId,
    addTrade,
    updateTrade,
    addAccount,
    saveDailyNote,
    theme,
  } = useTrading();

  const [formError, setFormError] = useState<string | null>(null);
  const [resolveNoTradeConfirmed, setResolveNoTradeConfirmed] = useState(false);
  const [pendingDefaultAccount, setPendingDefaultAccount] = useState<string>('');
  const [newAccName, setNewAccName] = useState('Cuenta Principal');
  const [newAccFirm, setNewAccFirm] = useState('Funding Pips');
  const [newAccBalance, setNewAccBalance] = useState('100000');
  const [showOptionalPrices, setShowOptionalPrices] = useState(
    Boolean(editingTrade && (editingTrade.entryPrice > 0 || editingTrade.exitPrice > 0))
  );

  const entryDateKey = editingTrade
    ? extractNyDateKey(editingTrade.entryDate)
    : extractNyDateKey(initialEntryDate) || getCurrentNyDateKey();

  const conflictingDailyNote =
    entryDateKey && dailyNotes[entryDateKey]?.noTrade
      ? dailyNotes[entryDateKey]
      : null;

  // Resolve target account according to strict multi-account policy
  const accountResolution = resolveTargetAccount(
    accounts,
    defaultAccountId,
    editingTrade?.accountId
  );
  const targetAccount = accountResolution.account;

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

  const isHistoricalMonetary = Boolean(
    editingTrade && editingTrade.calculationMode !== 'derived_r'
  );

  const [form, setForm] = useState<TradeFormState>(() => {
    if (editingTrade) {
      return {
        symbol: editingTrade.symbol,
        direction: editingTrade.direction,
        selectedWindow: initialWindow,
        riskPercentUsed: (
          editingTrade.riskPercentUsed === 1.5
            ? '1.5'
            : editingTrade.riskPercentUsed === 2
            ? '2.0'
            : '1.0'
        ) as '1.0' | '1.5' | '2.0',
        outcomeMode: editingTrade.status === 'Win' ? 'TP' : 'SL',
        rMultiple: Math.abs(editingTrade.rMultiple).toString() || '2.0',
        playbookId: editingTrade.playbookId || '',
        pdArrays: editingTrade.pdArrays || [],
        checklistCompleted: editingTrade.checklistCompleted || [],
        dailyBias: editingTrade.dailyBias || 'Neutral',
        dolTarget: editingTrade.dolTarget || '',
        followedPlan: editingTrade.followedPlan,
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
      symbol: prefillData?.symbol || 'NAS100',
      direction: prefillData?.direction || '',
      selectedWindow: 'window_1',
      riskPercentUsed: '1.0',
      outcomeMode: 'TP',
      rMultiple: '2.0',
      playbookId: '',
      pdArrays: [],
      checklistCompleted: [],
      dailyBias: 'Neutral',
      dolTarget: '',
      followedPlan: false,
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

  // Calculate real-time derived return % and derived Net P&L
  const riskNum = parseFloat(form.riskPercentUsed) || 1.0;
  const rMultipleNum = parseFloat(form.rMultiple) || 0;
  const signedR = form.outcomeMode === 'TP' ? Math.abs(rMultipleNum) : -Math.abs(rMultipleNum);
  const derivedReturnPct = Number((riskNum * signedR).toFixed(2));
  const derivedPnl =
    targetAccount && targetAccount.initialBalance > 0
      ? Number((targetAccount.initialBalance * (derivedReturnPct / 100)).toFixed(2))
      : null;

  const currentGrade = calculateSetupGrade(form.checklistCompleted, form.followedPlan);

  const toggleModel = (model: PDArray) => {
    setForm((prev) => ({
      ...prev,
      pdArrays: prev.pdArrays.includes(model)
        ? prev.pdArrays.filter((m) => m !== model)
        : [...prev.pdArrays, model],
    }));
  };

  const toggleChecklist = (item: string) => {
    setForm((prev) => ({
      ...prev,
      checklistCompleted: prev.checklistCompleted.includes(item)
        ? prev.checklistCompleted.filter((i) => i !== item)
        : [...prev.checklistCompleted, item],
    }));
  };

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

    if (!targetAccount || targetAccount.initialBalance <= 0) {
      setFormError(
        'No se encontró una cuenta operativa válida con capital de referencia. Configura una cuenta predeterminada antes de registrar operaciones.'
      );
      return;
    }

    if (!form.direction) {
      setFormError('Selecciona la dirección de la operación (Long o Short).');
      return;
    }

    if (rMultipleNum <= 0) {
      setFormError('Ingresa un valor de R-Multiple válido mayor a 0 (ej: 2.0 o 1.0).');
      return;
    }

    if (conflictingDailyNote && !resolveNoTradeConfirmed) {
      setFormError(
        `El día ${entryDateKey} está marcado como «No Trade». Confirma desmarcar «No Trade» en el aviso antes de guardar.`
      );
      return;
    }

    if (conflictingDailyNote && resolveNoTradeConfirmed) {
      saveDailyNote({
        ...conflictingDailyNote,
        noTrade: false,
      });
    }

    // Determine timestamp without fabricating false precision:
    // If editing a historical trade with exact recorded time, preserve its exact entryDate unless window was explicitly changed
    let finalEntryDate: string;
    let finalTimePrecision: 'exact' | 'window';

    if (editingTrade && editingTrade.timePrecision !== 'window' && form.selectedWindow === initialWindow) {
      finalEntryDate = editingTrade.entryDate;
      finalTimePrecision = 'exact';
    } else {
      const repTime = form.selectedWindow === 'window_1' ? '09:30:00' : '10:35:00';
      finalEntryDate = `${entryDateKey}T${repTime}`;
      finalTimePrecision = 'window';
    }

    // Determine financial figures without overwriting historical audited P&L unless modified
    let finalNetPnl: number;
    let finalCalculationMode: 'monetary' | 'derived_r';
    let finalCommission: number;
    let finalCommissionUnmeasured: boolean;

    if (isHistoricalMonetary && editingTrade) {
      // Check if user changed risk or R-multiple
      const riskChanged = editingTrade.riskPercentUsed !== riskNum;
      const rChanged = Math.abs(editingTrade.rMultiple) !== rMultipleNum;
      const outcomeChanged = (editingTrade.status === 'Win' ? 'TP' : 'SL') !== form.outcomeMode;

      if (!riskChanged && !rChanged && !outcomeChanged) {
        // Preserve exact historical monetary figures
        finalNetPnl = editingTrade.netPnl;
        finalCalculationMode = 'monetary';
        finalCommission = editingTrade.commission;
        finalCommissionUnmeasured = Boolean(editingTrade.commissionUnmeasured);
      } else {
        // User explicitly updated risk / outcome / R-Multiple
        finalNetPnl = derivedPnl ?? 0;
        finalCalculationMode = 'derived_r';
        finalCommission = 0;
        finalCommissionUnmeasured = true;
      }
    } else {
      finalNetPnl = derivedPnl ?? 0;
      finalCalculationMode = 'derived_r';
      finalCommission = 0;
      finalCommissionUnmeasured = true;
    }

    const hasEnteredPrices =
      parseFloat(form.entryPrice) > 0 ||
      parseFloat(form.exitPrice) > 0 ||
      parseFloat(form.stopLoss) > 0 ||
      parseFloat(form.takeProfit) > 0;

    const payload: Omit<Trade, 'id'> = {
      symbol: form.symbol.toUpperCase(),
      direction: form.direction as TradeDirection,
      entryDate: finalEntryDate,
      timePrecision: finalTimePrecision,
      operationalWindow: form.selectedWindow,
      entryPrice: hasEnteredPrices ? parseFloat(form.entryPrice) || 0 : (editingTrade?.entryPrice || 0),
      exitPrice: hasEnteredPrices ? parseFloat(form.exitPrice) || 0 : (editingTrade?.exitPrice || 0),
      stopLoss: hasEnteredPrices ? parseFloat(form.stopLoss) || 0 : (editingTrade?.stopLoss || 0),
      takeProfit: hasEnteredPrices ? parseFloat(form.takeProfit) || 0 : (editingTrade?.takeProfit || 0),
      size: hasEnteredPrices ? parseFloat(form.size) || 1 : (editingTrade?.size || 1),
      pricesUnrecorded: !hasEnteredPrices && !(editingTrade && editingTrade.entryPrice > 0),
      riskPercentUsed: riskNum,
      htfAligned: editingTrade?.htfAligned || ['1D', '4H', '2H', '30m'],
      grossPnl: finalNetPnl + finalCommission,
      commission: finalCommission,
      commissionUnmeasured: finalCommissionUnmeasured,
      netPnl: finalNetPnl,
      plannedRR: Math.abs(rMultipleNum),
      rMultiple: signedR,
      status: form.outcomeMode === 'TP' ? 'Win' : 'Loss',
      killzone:
        form.selectedWindow === 'window_1'
          ? 'NY Open 09:30 AM (09:30-10:30)'
          : 'NY Mid-Morning (10:30-12:00)',
      playbookId: form.playbookId || undefined,
      pdArrays: form.pdArrays,
      checklistCompleted: form.checklistCompleted,
      setupGrade: currentGrade,
      dailyBias: form.dailyBias,
      dolTarget: form.dolTarget,
      timeframe: editingTrade?.timeframe || '5m',
      followedPlan: form.followedPlan,
      psychologyTag: form.psychologyTag,
      tradingViewUrl: form.tradingViewUrl || undefined,
      screenshotDataUrl: form.screenshotDataUrl || undefined,
      notes: form.notes,
      accountId: targetAccount.id,
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
      <div className="bg-[#111114] text-zinc-100 rounded-2xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl border border-white/[0.1] max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.08]">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base sm:text-lg font-bold text-zinc-100">
              {editingTrade ? 'Editar Operación' : 'Registrar Operación'}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-900 border border-white/10 text-zinc-300">
              Fecha: {entryDateKey}
            </span>
            {targetAccount && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${theme.badgeClass}`}>
                {targetAccount.name}
              </span>
            )}
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                currentGrade === 'Sin evaluar'
                  ? 'bg-zinc-500/10 text-zinc-400'
                  : currentGrade === 'A+'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : currentGrade === 'B'
                  ? 'bg-amber-500/10 text-amber-300'
                  : 'bg-rose-500/10 text-rose-400'
              }`}
            >
              Alineación: {currentGrade}
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

          {/* Account Resolution Alerts & Setup */}
          {accountResolution.status === 'multiple_without_default' && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-xs">
              <strong className="block text-amber-200">
                Selecciona tu Cuenta Operativa Predeterminada
              </strong>
              <p className="text-amber-200/90 text-[11px]">
                Tienes varias cuentas operativas registradas. Para evitar asignaciones arbitrarias, confirma cuál utilizarás como predeterminada:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <select
                  value={pendingDefaultAccount}
                  onChange={(e) => setPendingDefaultAccount(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl bg-zinc-900 border border-white/20 text-zinc-100"
                >
                  <option value="">-- Elige una cuenta --</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (${acc.initialBalance.toLocaleString('en-US')})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!pendingDefaultAccount}
                  onClick={() => {
                    if (pendingDefaultAccount) {
                      setDefaultAccountId(pendingDefaultAccount);
                      setFormError(null);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold ${theme.buttonClass} disabled:opacity-40 cursor-pointer`}
                >
                  Establecer como Predeterminada
                </button>
              </div>
            </div>
          )}

          {accountResolution.status === 'no_account' && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3 text-xs">
              <div>
                <strong className="block text-amber-100 text-sm font-bold">
                  Configura tu Cuenta Operativa
                </strong>
                <p className="text-amber-200/90 text-xs mt-0.5">
                  No tienes ninguna cuenta registrada. Define tu capital base para calcular retornos y gestionar el riesgo sin salir del formulario.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-amber-200/90 mb-1">
                    Nombre de la Cuenta
                  </label>
                  <input
                    type="text"
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                    placeholder="Ej: Cuenta Principal"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/20 text-zinc-100 text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-amber-200/90 mb-1">
                    Empresa / Broker
                  </label>
                  <input
                    type="text"
                    value={newAccFirm}
                    onChange={(e) => setNewAccFirm(e.target.value)}
                    placeholder="Ej: Funding Pips"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/20 text-zinc-100 text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-amber-200/90 mb-1">
                    Capital Inicial (USD)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={newAccBalance}
                    onChange={(e) => setNewAccBalance(e.target.value)}
                    placeholder="100000"
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/20 text-zinc-100 text-xs font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-400">
                  Parámetros calculados: DD Máx 10%, Límite Diario 5%, Target 8%.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const balance = parseFloat(newAccBalance) || 100000;
                    const created = addAccount({
                      name: newAccName.trim() || 'Cuenta Principal',
                      firm: newAccFirm.trim() || 'Funding Pips',
                      initialBalance: balance,
                      profitTarget: balance * 0.08,
                      maxDrawdown: balance * 0.10,
                      dailyLossLimit: balance * 0.05,
                    });
                    setDefaultAccountId(created.id);
                    setFormError(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold ${theme.buttonClass} cursor-pointer shadow-lg`}
                >
                  Crear Cuenta y Continuar
                </button>
              </div>
            </div>
          )}

          {conflictingDailyNote && (
            <div
              role="alert"
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-2"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-amber-100">
                    Advertencia: El día {entryDateKey} está marcado como «No Trade»
                  </strong>
                  <p className="text-amber-200/90 mt-0.5">
                    {conflictingDailyNote.noTradeReason
                      ? `Motivo registrado: "${conflictingDailyNote.noTradeReason}". `
                      : ''}
                    Tus notas pre-mercado y plan diario se conservarán intactos, pero debes confirmar levantar «No Trade» para guardar.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 font-semibold text-amber-100 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={resolveNoTradeConfirmed}
                  onChange={(e) => {
                    setResolveNoTradeConfirmed(e.target.checked);
                    if (e.target.checked) setFormError(null);
                  }}
                  className="accent-amber-400"
                />
                Confirmo levantar el estado «No Trade» en {entryDateKey} al guardar.
              </label>
            </div>
          )}

          {/* 1. Risk and Outcome Strip */}
          <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-300">Riesgo:</span>
              {(['1.0', '1.5', '2.0'] as const).map((pct) => (
                <button
                  type="button"
                  key={pct}
                  onClick={() => setForm((prev) => ({ ...prev, riskPercentUsed: pct }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    form.riskPercentUsed === pct
                      ? theme.buttonClass
                      : 'bg-white/[0.06] text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {pct}% Riesgo
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-300">Resultado:</span>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, outcomeMode: 'TP' }))}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  form.outcomeMode === 'SL'
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                    : 'bg-white/[0.06] text-zinc-400 hover:bg-white/10'
                }`}
              >
                SL Hit
              </button>
            </div>
          </div>

          {/* 2. Primary Capture Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-[#09090B] p-3.5 rounded-xl border border-white/[0.08]">
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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-zinc-300">
                  R-Multiple Obtenido
                </label>
                <span
                  className={`text-[11px] font-bold font-mono ${
                    derivedReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {derivedReturnPct >= 0 ? `+${derivedReturnPct.toFixed(2)}%` : `${derivedReturnPct.toFixed(2)}%`}
                </span>
              </div>
              <input
                type="number"
                step="0.1"
                min="0.1"
                required
                value={form.rMultiple}
                onChange={(e) => setForm({ ...form, rMultiple: e.target.value })}
                placeholder="Ej: 2.0 o 1.0"
                className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-zinc-900 text-zinc-100 font-bold font-mono focus:outline-none focus:ring-2 ${theme.ringClass}`}
              />
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                {derivedPnl !== null
                  ? `~${derivedPnl >= 0 ? `+$${derivedPnl.toFixed(2)}` : `-$${Math.abs(derivedPnl).toFixed(2)}`} USD derivado`
                  : 'Calculado sobre capital'}
              </span>
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
                <option value="window_1">NY Open 09:30–10:35</option>
                <option value="window_2">NY Open 10:35–11:00</option>
              </select>
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Ventana declarada para analítica
              </span>
            </div>
          </div>

          {/* 3. Entry Models (Modelos de entrada) & Context */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#09090B] p-4 rounded-xl border border-white/[0.08]">
            <div>
              <label className={`text-xs font-bold ${theme.accentTextClass} mb-2 flex items-center gap-1.5`}>
                <CheckSquare className="w-4 h-4" />
                Checklist de Contexto Multi-Timeframe
              </label>
              <div className="space-y-1.5">
                {ICT_CHECKLIST_ITEMS.map((item) => {
                  const checked = form.checklistCompleted.includes(item);
                  return (
                    <label
                      key={item}
                      className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChecklist(item)}
                        className={`rounded ${theme.accentTextClass}`}
                      />
                      {item}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Modelos de entrada
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'BPR (Balanced Price Range)' as PDArray, label: 'BPR' },
                    { key: 'Breaker Block' as PDArray, label: 'Breaker Block' },
                    { key: 'Key Level' as PDArray, label: 'Key Level' },
                  ].map(({ key, label }) => {
                    const active = form.pdArrays.includes(key);
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => toggleModel(key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          active
                            ? theme.buttonClass
                            : 'bg-zinc-900 border border-white/10 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Target Liquidez (DOL)
                  </label>
                  <input
                    type="text"
                    value={form.dolTarget}
                    onChange={(e) => setForm({ ...form, dolTarget: e.target.value })}
                    placeholder="High/Low Diario, 4H, 30m..."
                    className={`w-full px-2.5 py-1.5 text-xs bg-[#111114] text-zinc-100 rounded-lg border border-white/10 focus:outline-none focus:ring-2 ${theme.ringClass}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Ejecución / Disciplina
                  </label>
                  <select
                    value={form.psychologyTag}
                    onChange={(e) =>
                      setForm({ ...form, psychologyTag: e.target.value as PsychologyTag })
                    }
                    className={`w-full px-2.5 py-1.5 text-xs bg-[#09090B] text-zinc-100 rounded-lg border border-white/10 focus:outline-none focus:ring-2 ${theme.ringClass}`}
                  >
                    {PSYCHOLOGY_TAGS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Optional Execution Prices (Collapsible) */}
          <div className="rounded-xl border border-white/[0.06] bg-zinc-950/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOptionalPrices((prev) => !prev)}
              className="w-full px-3.5 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 flex items-center justify-between cursor-pointer"
            >
              <span>Precios de Ejecución (Opcional — no afectan el cálculo financiero)</span>
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

          {/* 5. Chart Capture and Notes */}
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
                className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-[#09090B] text-zinc-100 focus:outline-none focus:ring-2 ${theme.ringClass}`}
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
                Bitácora de Sesión
              </label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notas de contexto, confirmación en 15m/5m y gestión de la operación..."
                className={`w-full px-3 py-2 text-xs rounded-xl border border-white/10 bg-[#09090B] text-zinc-100 focus:outline-none focus:ring-2 ${theme.ringClass}`}
              />
            </div>
          </div>

          {/* 6. Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.followedPlan}
                onChange={(e) => setForm({ ...form, followedPlan: e.target.checked })}
                className={`rounded ${theme.accentTextClass}`}
              />
              Respeté el plan y acepté TP o SL sin dudar
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-white/[0.06] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!targetAccount}
                className={`px-5 py-2 rounded-xl text-xs font-semibold shadow-md cursor-pointer ${theme.buttonClass} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {editingTrade ? 'Guardar Cambios' : 'Registrar Operación'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
