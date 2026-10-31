import type {
  Trade,
  TradeDirection,
  PsychologyTag,
  PDArray,
  PnlProvenance,
} from '../types/trading.ts';
import {
  extractNyDateKey,
  getCurrentNyDateKey,
  classifyOperationalTimeWindow,
} from './date-time-service.ts';
import { calculateTheoreticalInstrumentPnl } from './math-engine.ts';
import { detectTradeDataConflicts } from './financial-engine.ts';

export { detectTradeDataConflicts };

export interface TradeFormState {
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

export interface TradeFormResolutionResult {
  error?: string;
  payload?: Omit<Trade, 'id'>;
  isFinancialChange: boolean;
  isPnlExecutionChange: boolean;
  isRMultipleChange: boolean;
}

export function resolveInitialTradeWindow(
  editingTrade: Trade | null
): 'window_1' | 'window_2' {
  if (editingTrade?.operationalWindow) {
    return editingTrade.operationalWindow === 'window_2' ? 'window_2' : 'window_1';
  }
  if (editingTrade) {
    return classifyOperationalTimeWindow(editingTrade.entryDate) === 'window_2'
      ? 'window_2'
      : 'window_1';
  }
  return 'window_1';
}

export function createInitialTradeFormState(
  editingTrade: Trade | null,
  initialEntryDate: string = '',
  prefillData?: Partial<Trade> | null
): TradeFormState {
  const initialDateKey = editingTrade
    ? extractNyDateKey(editingTrade.entryDate) || editingTrade.entryDate.slice(0, 10)
    : extractNyDateKey(initialEntryDate) || initialEntryDate.slice(0, 10) || getCurrentNyDateKey();

  const initialWindow = resolveInitialTradeWindow(editingTrade);

  const initialModel: PDArray =
    editingTrade?.pdArrays && editingTrade.pdArrays.length > 0
      ? editingTrade.pdArrays[0]
      : 'Breaker Block';

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
      realizedNetReturnPct:
        editingTrade.realizedNetReturnPct !== null &&
        editingTrade.realizedNetReturnPct !== undefined
          ? Math.abs(editingTrade.realizedNetReturnPct).toString()
          : '',
      durationMinutes:
        editingTrade.durationMinutes !== null &&
        editingTrade.durationMinutes !== undefined
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
}

/**
 * Resolves and validates the TradeFormModal submission into a Trade payload.
 * - Compares signedR against editingTrade.rMultiple so historical losing trades (-R) are protected when editing non-financial fields.
 * - Separates realizedNetReturnPct edits/clearing from P&L calculation (editing or clearing % never recalculates netPnl/grossPnl/commission, and clearing % persists null).
 * - Labels price-derived P&L without measured commissions as 'theoretical', never 'audited'.
 * - Does not invent legacy fields (riskPercentUsed, htfAligned, followedPlan) on new trades while preserving historical values on edit.
 */
export function resolveTradeFormSubmission(
  form: TradeFormState,
  editingTrade: Trade | null,
  resolvedAccountId: string
): TradeFormResolutionResult {
  if (!form.direction) {
    return {
      error: 'Selecciona la dirección de la operación (Long o Short).',
      isFinancialChange: false,
      isPnlExecutionChange: false,
      isRMultipleChange: false,
    };
  }

  const sanitizedRStr = form.rMultiple.trim().replace(/\s+/g, '');
  const normalizedRMultiple = sanitizedRStr.replace(',', '.');
  const parsedRMultiple = Number(normalizedRMultiple);
  const rMultipleNum = Number.isFinite(parsedRMultiple) ? parsedRMultiple : 0;
  const signedR =
    form.outcomeMode === 'TP' ? Math.abs(rMultipleNum) : -Math.abs(rMultipleNum);

  const isUnchangedHistoricalZero = Boolean(
    editingTrade &&
      Number(Math.abs(editingTrade.rMultiple).toFixed(2)) === 0 &&
      rMultipleNum === 0
  );

  if (
    !/^\d+(?:[.,]\d{1,2})?$/.test(sanitizedRStr) ||
    !Number.isFinite(rMultipleNum) ||
    (rMultipleNum <= 0 && !isUnchangedHistoricalZero)
  ) {
    return {
      error: 'Ingresa un R-Multiple positivo con hasta dos decimales (ej: 1,25 o 2.50).',
      isFinancialChange: false,
      isPnlExecutionChange: false,
      isRMultipleChange: false,
    };
  }

  // Validate optional realized return pct (independent of P&L calculation; empty string persists null)
  let finalRealizedReturnPct: number | null = null;
  const trimmedPct = form.realizedNetReturnPct.trim().replace(/\s+/g, '');
  if (trimmedPct !== '') {
    const cleanPctStr = trimmedPct.replace(',', '.');
    const numPct = Number(cleanPctStr);
    if (!Number.isFinite(numPct) || !/^\d+(?:[.,]\d{1,4})?$/.test(trimmedPct)) {
      return {
        error: 'La rentabilidad neta % opcional debe ser un número válido positivo (ej: 1.5 o 2,25).',
        isFinancialChange: false,
        isPnlExecutionChange: false,
        isRMultipleChange: false,
      };
    }
    finalRealizedReturnPct = form.outcomeMode === 'SL' ? -Math.abs(numPct) : Math.abs(numPct);
  }

  // Validate duration: strictly accept integer minutes and reject decimal/negative values
  let finalDurationMinutes: number | null = null;
  if (form.durationMinutes.trim() !== '') {
    const durStr = form.durationMinutes.trim();
    if (!/^\d+$/.test(durStr)) {
      return {
        error: 'La duración debe ser un número entero de minutos sin decimales (ej: 15).',
        isFinancialChange: false,
        isPnlExecutionChange: false,
        isRMultipleChange: false,
      };
    }
    finalDurationMinutes = parseInt(durStr, 10);
  }

  const initialDateKey = editingTrade
    ? extractNyDateKey(editingTrade.entryDate) || editingTrade.entryDate.slice(0, 10)
    : form.dateKey;
  const initialWindow = resolveInitialTradeWindow(editingTrade);

  // Determine timestamp without fabricating false precision
  let finalEntryDate: string;
  let finalTimePrecision: 'exact' | 'window';

  if (
    editingTrade &&
    editingTrade.timePrecision !== 'window' &&
    form.selectedWindow === initialWindow &&
    form.dateKey === initialDateKey
  ) {
    finalEntryDate = editingTrade.entryDate;
    finalTimePrecision = 'exact';
  } else {
    const repTime = form.selectedWindow === 'window_1' ? '09:30:00' : '10:35:00';
    finalEntryDate = `${form.dateKey}T${repTime}`;
    finalTimePrecision = 'window';
  }

  // Parse form input numbers
  const parsedEntry = parseFloat(form.entryPrice) || 0;
  const parsedExit = parseFloat(form.exitPrice) || 0;
  const parsedSL = parseFloat(form.stopLoss) || 0;
  const parsedTP = parseFloat(form.takeProfit) || 0;
  const parsedSize = parseFloat(form.size) || 1;

  // Compare signedR against editingTrade.rMultiple so SL trades (-1.25R) match signedR (-1.25R) when unedited
  const isRMultipleChange = Boolean(
    editingTrade &&
      (Number(signedR.toFixed(2)) !== Number((editingTrade.rMultiple ?? 0).toFixed(2)) ||
        (editingTrade.status === 'Win' ? 'TP' : 'SL') !== form.outcomeMode)
  );

  // Execution changes that affect price-derived P&L (realizedNetReturnPct is strictly excluded!)
  const isPnlExecutionChange = Boolean(
    editingTrade &&
      (form.symbol.trim().toUpperCase() !== editingTrade.symbol.trim().toUpperCase() ||
        form.direction !== editingTrade.direction ||
        parsedEntry !== (editingTrade.entryPrice || 0) ||
        parsedExit !== (editingTrade.exitPrice || 0) ||
        parsedSize !== (editingTrade.size || 1))
  );

  const isStopOrTargetChange = Boolean(
    editingTrade &&
      (parsedSL !== (editingTrade.stopLoss || 0) ||
        parsedTP !== (editingTrade.takeProfit || 0))
  );

  const isFinancialChange = Boolean(
    editingTrade && (isPnlExecutionChange || isRMultipleChange || isStopOrTargetChange)
  );

  let finalNetPnl = 0;
  let finalGrossPnl = 0;
  let finalCommission = 0;
  let finalCommissionUnmeasured = true;
  let finalCalculationMode: 'monetary' | 'derived_r' | 'unrecorded' = 'unrecorded';
  let finalPnlProvenance: PnlProvenance = 'unrecorded';
  let finalPricesUnrecorded = true;
  let finalEntryPrice = 0;
  let finalExitPrice = 0;
  let finalSL = 0;
  let finalTP = 0;
  let finalSize = 1;
  let finalR = Number(signedR.toFixed(2));
  let finalPlannedRR = Number(Math.abs(rMultipleNum).toFixed(2));
  let finalRUnrecorded = false;

  if (editingTrade && !isFinancialChange) {
    // PRESERVE HISTORICAL METRICS INTACT (including when editing notes, emotion, duration, or realizedNetReturnPct)
    finalNetPnl = editingTrade.netPnl;
    finalGrossPnl = editingTrade.grossPnl;
    finalCommission = editingTrade.commission;
    finalCommissionUnmeasured = Boolean(editingTrade.commissionUnmeasured);
    finalCalculationMode = editingTrade.calculationMode || 'monetary';
    finalPnlProvenance =
      editingTrade.pnlProvenance ||
      (finalCalculationMode === 'unrecorded'
        ? 'unrecorded'
        : finalCalculationMode === 'derived_r'
        ? 'derived_r'
        : finalCommissionUnmeasured
        ? 'theoretical'
        : 'audited');
    finalPricesUnrecorded = Boolean(editingTrade.pricesUnrecorded);
    finalEntryPrice = editingTrade.entryPrice;
    finalExitPrice = editingTrade.exitPrice;
    finalSL = editingTrade.stopLoss;
    finalTP = editingTrade.takeProfit;
    finalSize = editingTrade.size;
    finalR = editingTrade.rMultiple;
    finalPlannedRR = editingTrade.plannedRR;
    finalRUnrecorded = Boolean(editingTrade.rUnrecorded);
  } else if (editingTrade && !isPnlExecutionChange) {
    // Only R-Multiple, outcomeMode, SL, or TP changed, while execution prices/size/symbol/direction did NOT change:
    // Preserve audited/historical monetary P&L and commissions while updating R/SL/TP
    finalNetPnl = editingTrade.netPnl;
    finalGrossPnl = editingTrade.grossPnl;
    finalCommission = editingTrade.commission;
    finalCommissionUnmeasured = Boolean(editingTrade.commissionUnmeasured);
    finalCalculationMode = editingTrade.calculationMode || 'monetary';
    finalPnlProvenance =
      editingTrade.pnlProvenance ||
      (finalCalculationMode === 'unrecorded'
        ? 'unrecorded'
        : finalCalculationMode === 'derived_r'
        ? 'derived_r'
        : finalCommissionUnmeasured
        ? 'theoretical'
        : 'audited');
    finalPricesUnrecorded = Boolean(editingTrade.pricesUnrecorded);
    finalEntryPrice = editingTrade.entryPrice;
    finalExitPrice = editingTrade.exitPrice;
    finalSL = parsedSL;
    finalTP = parsedTP;
    finalSize = editingTrade.size;
    finalR = isUnchangedHistoricalZero ? editingTrade.rMultiple : Number(signedR.toFixed(2));
    finalPlannedRR = isUnchangedHistoricalZero
      ? editingTrade.plannedRR
      : Number(Math.abs(rMultipleNum).toFixed(2));
    finalRUnrecorded = isUnchangedHistoricalZero ? Boolean(editingTrade.rUnrecorded) : false;
  } else {
    // New trade or execution prices/size/symbol/direction were explicitly entered/altered
    finalEntryPrice = parsedEntry;
    finalExitPrice = parsedExit;
    finalSL = parsedSL;
    finalTP = parsedTP;
    finalSize = parsedSize;
    finalPricesUnrecorded = !(parsedEntry > 0 && parsedExit > 0);
    finalR =
      isUnchangedHistoricalZero && editingTrade
        ? editingTrade.rMultiple
        : Number(signedR.toFixed(2));
    finalPlannedRR =
      isUnchangedHistoricalZero && editingTrade
        ? editingTrade.plannedRR
        : Number(Math.abs(rMultipleNum).toFixed(2));
    finalRUnrecorded =
      isUnchangedHistoricalZero && editingTrade ? Boolean(editingTrade.rUnrecorded) : false;

    const hasEnteredPrices = parsedEntry > 0 && parsedExit > 0;

    if (hasEnteredPrices) {
      const pnlCalc = calculateTheoreticalInstrumentPnl({
        symbol: form.symbol,
        direction: form.direction as TradeDirection,
        entryPrice: parsedEntry,
        exitPrice: parsedExit,
        size: parsedSize,
        commission: 0,
        hasMeasuredCommission: false,
      });

      if (pnlCalc.verified) {
        finalCalculationMode = 'monetary';
        finalGrossPnl = pnlCalc.grossPnl;
        finalNetPnl = pnlCalc.netPnl;
        finalCommission = 0;
        finalCommissionUnmeasured = true;
        finalPnlProvenance = 'theoretical';
      } else {
        // Unverified spec: do NOT invent generic /pt multiplier as real P&L
        finalCalculationMode = 'unrecorded';
        finalGrossPnl = 0;
        finalNetPnl = 0;
        finalCommission = 0;
        finalCommissionUnmeasured = true;
        finalPnlProvenance = 'unrecorded';
      }
    } else if (editingTrade && editingTrade.calculationMode === 'derived_r') {
      finalCalculationMode = 'derived_r';
      finalNetPnl = editingTrade.netPnl;
      finalGrossPnl = editingTrade.grossPnl;
      finalCommission = editingTrade.commission;
      finalCommissionUnmeasured = Boolean(editingTrade.commissionUnmeasured);
      finalPnlProvenance = 'derived_r';
    } else {
      finalCalculationMode = 'unrecorded';
      finalGrossPnl = 0;
      finalNetPnl = 0;
      finalCommission = 0;
      finalCommissionUnmeasured = true;
      finalPnlProvenance = 'unrecorded';
    }
  }

  // Preserve historic pdArrays elements if editing
  let finalPdArrays: PDArray[];
  if (editingTrade?.pdArrays && editingTrade.pdArrays.length > 0) {
    if (editingTrade.pdArrays.includes(form.selectedModel)) {
      finalPdArrays = editingTrade.pdArrays;
    } else {
      const otherConfluences = editingTrade.pdArrays.slice(1);
      finalPdArrays = [form.selectedModel, ...otherConfluences];
    }
  } else {
    finalPdArrays = [form.selectedModel];
  }

  const finalStatus: 'Win' | 'Loss' = form.outcomeMode === 'TP' ? 'Win' : 'Loss';

  let finalHasDataConflict = false;
  let finalConflictReasons: string[] | undefined = undefined;

  if (editingTrade && !isFinancialChange) {
    // Preserve existing conflict state when editing only non-financial fields (notes, emotions, duration, screenshot)
    finalHasDataConflict = Boolean(editingTrade.hasDataConflict);
    finalConflictReasons = editingTrade.conflictReasons;
  } else {
    // Detect financial contradictions across status, R, P&L and return %
    const detectedConflicts = detectTradeDataConflicts({
      status: finalStatus,
      rMultiple: finalR,
      rUnrecorded: finalRUnrecorded,
      netPnl: finalNetPnl,
      calculationMode: finalCalculationMode,
      realizedNetReturnPct: finalRealizedReturnPct,
    });

    if (detectedConflicts.length > 0) {
      finalHasDataConflict = true;
      finalConflictReasons = detectedConflicts;
    } else {
      finalHasDataConflict = false;
      finalConflictReasons = undefined;
    }
  }

  // Correction 6: Do NOT invent fictitious legacy data (riskPercentUsed: 1.0, htfAligned: 4 TFs, followedPlan: true)
  // on new trades. Preserve existing historical values when editing.
  const payload: Omit<Trade, 'id'> = {
    symbol: form.symbol.trim().toUpperCase(),
    direction: form.direction as TradeDirection,
    entryDate: finalEntryDate,
    timePrecision: finalTimePrecision,
    operationalWindow: form.selectedWindow,
    entryPrice: finalEntryPrice,
    exitPrice: finalExitPrice,
    stopLoss: finalSL,
    takeProfit: finalTP,
    size: finalSize,
    pricesUnrecorded: finalPricesUnrecorded,
    riskPercentUsed: editingTrade ? editingTrade.riskPercentUsed : undefined,
    htfAligned: editingTrade ? (editingTrade.htfAligned ?? []) : [],
    grossPnl: finalGrossPnl,
    commission: finalCommission,
    commissionUnmeasured: finalCommissionUnmeasured,
    netPnl: finalNetPnl,
    plannedRR: finalPlannedRR,
    rMultiple: finalR,
    rUnrecorded: finalRUnrecorded,
    realizedNetReturnPct: finalRealizedReturnPct,
    durationMinutes: finalDurationMinutes,
    status: finalStatus,
    killzone:
      form.selectedWindow === 'window_1'
        ? 'NY Open 09:30 AM (09:30-10:30)'
        : 'NY Mid-Morning (10:30-12:00)',
    playbookId: editingTrade?.playbookId || undefined,
    pdArrays: finalPdArrays,
    checklistCompleted: editingTrade ? (editingTrade.checklistCompleted ?? []) : [],
    setupGrade: editingTrade ? (editingTrade.setupGrade || 'Sin evaluar') : 'Sin evaluar',
    dailyBias: editingTrade ? (editingTrade.dailyBias || 'Neutral') : 'Neutral',
    dolTarget: editingTrade ? (editingTrade.dolTarget ?? '') : '',
    timeframe: editingTrade?.timeframe || '15m',
    followedPlan: editingTrade ? Boolean(editingTrade.followedPlan) : false,
    planUnrecorded: editingTrade ? Boolean(editingTrade.planUnrecorded) : true,
    psychologyTag: form.psychologyTag,
    tradingViewUrl: form.tradingViewUrl || undefined,
    screenshotDataUrl: form.screenshotDataUrl || undefined,
    notes: form.notes,
    accountId: resolvedAccountId,
    calculationMode: finalCalculationMode,
    pnlProvenance: finalPnlProvenance,
    hasDataConflict: finalHasDataConflict,
    conflictReasons: finalConflictReasons,
  };

  return {
    payload,
    isFinancialChange,
    isPnlExecutionChange,
    isRMultipleChange,
  };
}
