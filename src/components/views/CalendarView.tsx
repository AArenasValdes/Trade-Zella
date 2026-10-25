"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTrading } from '@/context/TradingContext';
import { TIME_ZONES } from '@/config/time-zones';
import {
  convertTimeBetweenZones,
  extractNyDateKey,
  extractNyTime,
  getDateKeyInTimeZone,
} from '@/services/date-time-service';
import {
  calculateDailyReturnPct,
  calculateMonthlyReturnPct,
  calculateTradeReturnPct,
  formatReturnPct,
} from '@/services/financial-engine';
import type { HTFTimeframe, Killzone, Trade, DailyJournalNote } from '@/types/trading';
import { HTF_TIMEFRAMES, KILLZONES } from '@/config/ict-constants';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  X,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

interface CalendarViewProps {
  onInspectTrade: (trade: Trade) => void;
  onOpenNewTradeForDate: (dateKey: string) => void;
}

const createEmptySessionNote = (date: string): DailyJournalNote => ({
  date,
  preMarketBias: 'Neutral',
  dolTarget: '',
  highImpactNews: '',
  preMarketNotes: '',
  postMarketReview: '',
  followedDailyRules: false,
  timeframeContext: Object.fromEntries(
    HTF_TIMEFRAMES.map((timeframe) => [timeframe, { bias: 'Neutral', notes: '' }])
  ),
  sessionWindow: KILLZONES[0],
  noTrade: false,
  noTradeReason: '',
  completedRuleIds: [],
});

function formatSessionWindowBothZones(date: string, sessionWindow: Killzone): string {
  const range = sessionWindow.match(/\((\d{2}:\d{2})-(\d{2}:\d{2})\)/);
  if (!range) return 'Sin ventana horaria definida';
  const [, startNy, endNy] = range;
  const startLocal = convertTimeBetweenZones(date, startNy, TIME_ZONES.trading, TIME_ZONES.user);
  const endLocal = convertTimeBetweenZones(date, endNy, TIME_ZONES.trading, TIME_ZONES.user);
  return `NY ${startNy}–${endNy} · Chile ${startLocal}–${endLocal}`;
}

export function CalendarView({
  onInspectTrade,
  onOpenNewTradeForDate,
}: CalendarViewProps) {
  const {
    trades,
    accounts,
    dailyNotes,
    personalRules,
    saveDailyNote,
    addPersonalRule,
    updatePersonalRule,
    deletePersonalRule,
    theme,
  } = useTrading();
  const [calMonth, setCalMonth] = useState<string | null>(null);
  const [todayDate, setTodayDate] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showNoTradeWarning, setShowNoTradeWarning] = useState(false);
  const previousTodayDate = useRef<string | null>(null);

  useEffect(() => {
    const syncCurrentDate = () => {
      const dateKey = getDateKeyInTimeZone(new Date(), TIME_ZONES.user);
      setTodayDate(dateKey);
      setCalMonth((currentMonth) => {
        const previousMonth = previousTodayDate.current?.slice(0, 7);
        const isFollowingToday = currentMonth === null || currentMonth === previousMonth;
        return isFollowingToday ? dateKey.slice(0, 7) : currentMonth;
      });
      previousTodayDate.current = dateKey;
    };

    syncCurrentDate();
    const intervalId = window.setInterval(syncCurrentDate, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const [noteForm, setNoteForm] = useState<DailyJournalNote>(() => createEmptySessionNote(''));
  const [newRuleText, setNewRuleText] = useState('');

  const calendarData = useMemo(() => {
    const map: Record<
      string,
      { pnl: number; returnPct: number | null; count: number; wins: number; trades: Trade[] }
    > = {};
    trades.forEach((t) => {
      const day = extractNyDateKey(t.entryDate) || t.entryDate.slice(0, 10);
      if (!map[day]) map[day] = { pnl: 0, returnPct: null, count: 0, wins: 0, trades: [] };
      map[day].pnl = Number((map[day].pnl + t.netPnl).toFixed(2));
      map[day].count += 1;
      if (t.netPnl > 0) map[day].wins += 1;
      map[day].trades.push(t);
    });

    Object.values(map).forEach((entry) => {
      entry.trades.sort(
        (a, b) => a.entryDate.localeCompare(b.entryDate) || a.id.localeCompare(b.id)
      );
      entry.returnPct = calculateDailyReturnPct(entry.trades, accounts);
    });

    if (!calMonth) {
      return {
        map,
        daysInMonth: 0,
        firstDayWeekday: 0,
        monthlyPnl: 0,
        monthlyReturnPct: null as number | null,
        greenDays: 0,
        redDays: 0,
      };
    }

    const [year, month] = calMonth.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstDayWeekday =
      (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

    let monthlyPnl = 0;
    let greenDays = 0;
    let redDays = 0;
    const monthlyTrades: Trade[] = [];

    Object.entries(map).forEach(([dateKey, info]) => {
      if (dateKey.startsWith(calMonth)) {
        monthlyPnl += info.pnl;
        monthlyTrades.push(...info.trades);
        if (info.pnl > 0) greenDays++;
        else if (info.pnl < 0) redDays++;
      }
    });

    const monthlyReturnPct = calculateMonthlyReturnPct(monthlyTrades, accounts);

    return {
      map,
      daysInMonth,
      firstDayWeekday,
      monthlyPnl: Number(monthlyPnl.toFixed(2)),
      monthlyReturnPct,
      greenDays,
      redDays,
    };
  }, [trades, accounts, calMonth]);

  const changeMonth = (delta: number) => {
    if (!calMonth) return;
    const [y, m] = calMonth.split('-').map(Number);
    const nextDate = new Date(Date.UTC(y, m - 1 + delta, 1));
    const ny = nextDate.getUTCFullYear();
    const nm = String(nextDate.getUTCMonth() + 1).padStart(2, '0');
    setCalMonth(`${ny}-${nm}`);
  };

  const handleDayClick = (dateStr: string) => {
    setSelectedDay(dateStr);
    setShowNoTradeWarning(false);
    const existing = dailyNotes[dateStr];
    setNoteForm({
      ...createEmptySessionNote(dateStr),
      ...existing,
      date: dateStr,
      timeframeContext: {
        ...createEmptySessionNote(dateStr).timeframeContext,
        ...existing?.timeframeContext,
      },
      completedRuleIds: existing?.completedRuleIds || [],
    });
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    saveDailyNote({
      ...noteForm,
      followedDailyRules:
        personalRules.length > 0 &&
        personalRules.every((rule) => noteForm.completedRuleIds?.includes(rule.id)),
    });
    setSelectedDay(null);
    setShowNoTradeWarning(false);
  };

  const selectedDayInfo = selectedDay ? calendarData.map[selectedDay] : undefined;
  const selectedDayTrades = selectedDayInfo?.trades || [];
  const selectedDayPnl = selectedDayInfo?.pnl || 0;
  const selectedDayReturnPct = selectedDayInfo?.returnPct ?? null;
  const isSelectedDayNoTrade = Boolean(
    (selectedDay && dailyNotes[selectedDay]?.noTrade) || noteForm.noTrade
  );

  const handleRegisterExecutionClick = () => {
    if (!selectedDay) return;
    if (isSelectedDayNoTrade) {
      setShowNoTradeWarning(true);
      return;
    }
    onOpenNewTradeForDate(selectedDay);
  };

  const handleConfirmRegisterOverNoTrade = () => {
    if (!selectedDay) return;
    setShowNoTradeWarning(false);
    setNoteForm((prev) => ({ ...prev, noTrade: false }));
    onOpenNewTradeForDate(selectedDay);
  };

  if (!calMonth || !todayDate) {
    return (
      <div
        aria-busy="true"
        aria-label="Sincronizando fecha del calendario"
        className="min-h-[28rem] rounded-2xl border border-white/[0.08] bg-[#111114]"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#111114] rounded-2xl p-6 border border-white/[0.08]">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <CalendarIcon className={`w-4 h-4 ${theme.accentTextClass}`} />
              Calendario Operativo NY — {calMonth}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => changeMonth(-1)}
                aria-label="Mes anterior"
                className="p-1.5 rounded-lg bg-zinc-900 border border-white/[0.08] text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => changeMonth(1)}
                aria-label="Mes siguiente"
                className="p-1.5 rounded-lg bg-zinc-900 border border-white/[0.08] text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs text-zinc-500">
              (Selecciona cualquier día para ver el detalle, registrar ejecuciones o anotar tu Plan Pre-Mercado)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-bold tabular-nums sm:gap-4">
            <span
              className={`px-3 py-1 rounded-lg border ${
                calendarData.monthlyPnl > 0
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : calendarData.monthlyPnl < 0
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  : 'bg-zinc-800/40 text-zinc-300 border-white/10'
              }`}
            >
              Retorno Mes: {formatReturnPct(calendarData.monthlyReturnPct, { fallback: `${calendarData.monthlyPnl >= 0 ? '+' : ''}$${calendarData.monthlyPnl}` })}
            </span>
            <span className="text-emerald-400">
              {calendarData.greenDays} Días TP
            </span>
            <span className="text-rose-400">
              {calendarData.redDays} Días SL
            </span>
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[640px] grid-cols-7 gap-2.5">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
              <div
                key={d}
                className="text-center text-xs font-bold uppercase tracking-wider text-zinc-500 py-1"
              >
                {d}
              </div>
            ))}

            {Array.from({ length: calendarData.firstDayWeekday }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-28 rounded-xl bg-zinc-950/40" />
            ))}

            {Array.from({ length: calendarData.daysInMonth }, (_, i) => {
              const dayNum = String(i + 1).padStart(2, '0');
              const dateStr = `${calMonth}-${dayNum}`;
              const isToday = dateStr === todayDate;
              const dayData = calendarData.map[dateStr];
              const hasNote = Boolean(dailyNotes[dateStr]);
              const markedNoTrade = Boolean(dailyNotes[dateStr]?.noTrade);

              return (
                <div
                  key={dateStr}
                  onClick={() => handleDayClick(dateStr)}
                  aria-current={isToday ? 'date' : undefined}
                  title={isToday ? 'Hoy en Chile' : undefined}
                  style={
                    isToday
                      ? {
                          borderColor: theme.primaryHex,
                          boxShadow: `0 0 0 1px ${theme.primaryHex}66`,
                        }
                      : undefined
                  }
                  className={`h-28 rounded-xl p-2.5 border transition-all flex flex-col justify-between cursor-pointer hover:border-white/30 ${
                    !dayData
                      ? 'bg-zinc-900/40 border-white/[0.05] text-zinc-500'
                      : dayData.pnl > 0
                      ? 'bg-emerald-500/10 border-emerald-500/25'
                      : dayData.pnl < 0
                      ? 'bg-rose-500/10 border-rose-500/25'
                      : 'bg-zinc-800/40 border-white/[0.1]'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                      {i + 1}
                      {isToday && (
                        <span className={`text-[9px] uppercase tracking-wider ${theme.accentTextClass}`}>
                          Hoy
                        </span>
                      )}
                      {hasNote && (
                        <span title="Contiene Nota Pre-Market">
                          <BookOpen
                            aria-hidden="true"
                            className={`w-3.5 h-3.5 ${theme.accentTextClass}`}
                          />
                        </span>
                      )}
                    </span>
                    {markedNoTrade && (
                      <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[8px] font-bold text-amber-300">
                        Sin trade
                      </span>
                    )}
                    {dayData && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-zinc-300 border border-white/[0.06]">
                        {dayData.count}t
                      </span>
                    )}
                  </div>

                  {dayData && (
                    <div className="text-right">
                      <div
                        className={`text-sm font-extrabold tabular-nums ${
                          dayData.pnl > 0
                            ? 'text-emerald-400'
                            : dayData.pnl < 0
                            ? 'text-rose-400'
                            : 'text-zinc-300'
                        }`}
                      >
                        {formatReturnPct(dayData.returnPct, {
                          fallback: dayData.pnl >= 0 ? `+$${dayData.pnl.toFixed(0)}` : `-$${Math.abs(dayData.pnl).toFixed(0)}`,
                        })}
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        {Math.round((dayData.wins / dayData.count) * 100)}% WR
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedDay && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#111114] text-zinc-100 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Notebook Diario NY — {selectedDay}
                </h3>
                <p className="text-xs text-zinc-400">
                  Preparación de Contexto Mayor (1D·4H·2H·30m) y registro de ejecuciones del día
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedDay(null);
                  setShowNoTradeWarning(false);
                }}
                aria-label="Cerrar detalle del día"
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-white/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-zinc-950/60 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-200 block">
                    Ejecuciones del Día ({selectedDayTrades.length})
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {selectedDayTrades.length === 0
                      ? `Sin operaciones registradas en ${selectedDay}`
                      : `Retorno Día: ${formatReturnPct(selectedDayReturnPct)} (${
                          selectedDayPnl >= 0
                            ? `+$${selectedDayPnl.toFixed(2)}`
                            : `-$${Math.abs(selectedDayPnl).toFixed(2)}`
                        } USD) · Selecciona una operación para inspeccionar o editar`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRegisterExecutionClick}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${theme.buttonClass}`}
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  Registrar ejecución
                </button>
              </div>

              {showNoTradeWarning && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-2.5"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <strong className="block text-amber-100">
                        Este día ({selectedDay}) está marcado como «No Trade» (Hoy decidí no operar)
                      </strong>
                      <p className="text-amber-200/90 leading-relaxed">
                        {noteForm.noTradeReason || dailyNotes[selectedDay]?.noTradeReason
                          ? `Motivo registrado: "${noteForm.noTradeReason || dailyNotes[selectedDay]?.noTradeReason}". `
                          : ''}
                        Tus notas pre-mercado, lectura HTF y revisión post-sesión se conservarán intactas. ¿Deseas abrir el formulario de registro y resolver el estado «No Trade» al guardar la ejecución?
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNoTradeWarning(false)}
                      className="px-3 py-1.5 rounded-lg border border-white/10 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800 font-semibold cursor-pointer"
                    >
                      Mantener «No Trade»
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmRegisterOverNoTrade}
                      className="px-3 py-1.5 rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 font-bold cursor-pointer"
                    >
                      Continuar al registro
                    </button>
                  </div>
                </div>
              )}

              {selectedDayTrades.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {selectedDayTrades.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedDay(null);
                        setShowNoTradeWarning(false);
                        onInspectTrade(t);
                      }}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] cursor-pointer text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-zinc-400">
                          {t.timePrecision === 'window'
                            ? `${t.operationalWindow === 'window_2' ? '10:35–11:00' : '09:30–10:35'} NY (Ventana)`
                            : `${extractNyTime(t.entryDate)} NY`}
                        </span>
                        <strong className="text-white">{t.symbol}</strong>
                        <span className="px-2 py-0.5 rounded bg-black/50 text-zinc-300 font-semibold">
                          {t.direction}
                        </span>
                        <span className="text-zinc-400">{t.killzone}</span>
                      </div>
                      <span
                        className={`font-bold tabular-nums ${
                          t.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatReturnPct(
                          calculateTradeReturnPct(
                            t.netPnl,
                            accounts.find((a) => a.id === t.accountId)?.initialBalance
                          ),
                          { fallback: t.netPnl >= 0 ? `+$${t.netPnl}` : `-$${Math.abs(t.netPnl)}` }
                        )}{' '}
                        ({t.rMultiple}R)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleSaveNote} className="space-y-3">
              <p className="text-xs text-zinc-400">
                Fecha de sesión seleccionada: <strong className="text-zinc-200">{selectedDay}</strong>
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Dirección HTF (1D/4H)
                  </label>
                  <select
                    value={noteForm.preMarketBias}
                    onChange={(e) =>
                      setNoteForm({
                        ...noteForm,
                        preMarketBias: e.target.value as DailyJournalNote['preMarketBias'],
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/10 text-zinc-100"
                  >
                    <option value="Bullish">Bullish (Alcista)</option>
                    <option value="Bearish">Bearish (Bajista)</option>
                    <option value="Neutral">Neutral / Rango</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Target Liquidez (DOL)
                  </label>
                  <input
                    type="text"
                    value={noteForm.dolTarget}
                    onChange={(e) =>
                      setNoteForm({ ...noteForm, dolTarget: e.target.value })
                    }
                    placeholder="Ej: PDH 21580 / Low 4H"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/10 text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-rose-400 mb-1">
                    Noticias NY (08:30 / 10:00)
                  </label>
                  <input
                    type="text"
                    value={noteForm.highImpactNews}
                    onChange={(e) =>
                      setNoteForm({
                        ...noteForm,
                        highImpactNews: e.target.value,
                      })
                    }
                    placeholder="Ej: CPI 8:30 / FOMC"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/10 text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">Ventana de operación (NY)</label>
                  <select
                    value={noteForm.sessionWindow || KILLZONES[0]}
                    onChange={(e) => setNoteForm((prev) => ({ ...prev, sessionWindow: e.target.value as Killzone }))}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
                  >
                    {KILLZONES.map((window) => <option key={window} value={window}>{window}</option>)}
                  </select>
                  <p className="mt-1 text-[11px] text-zinc-500">{formatSessionWindowBothZones(selectedDay || noteForm.date, noteForm.sessionWindow || KILLZONES[0])}</p>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                    <input
                      type="checkbox"
                      checked={Boolean(noteForm.noTrade)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (!checked) setShowNoTradeWarning(false);
                        setNoteForm((prev) => ({
                          ...prev,
                          noTrade: checked,
                          noTradeReason: checked ? prev.noTradeReason : '',
                        }));
                      }}
                      className="accent-amber-400"
                    />
                    Hoy decidí no operar
                  </label>
                  <select
                    value={noteForm.noTradeReason || ''}
                    disabled={!noteForm.noTrade}
                    onChange={(e) => setNoteForm((prev) => ({ ...prev, noTradeReason: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 disabled:opacity-40"
                  >
                    <option value="">Motivo (opcional)</option>
                    <option value="No apareció un setup válido">No apareció un setup válido</option>
                    <option value="Contexto HTF desalineado">Contexto HTF desalineado</option>
                    <option value="Fuera de mi ventana NY">Fuera de mi ventana NY</option>
                    <option value="Límite de riesgo o cuenta">Límite de riesgo o cuenta</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>

              <section className="space-y-2 rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3">
                <div>
                  <h4 className="text-xs font-bold text-zinc-200">Lectura por temporalidad</h4>
                  <p className="text-[11px] text-zinc-500">Tu criterio para cada marco. No hay una dirección predeterminada.</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {HTF_TIMEFRAMES.map((timeframe: HTFTimeframe) => {
                    const entry = noteForm.timeframeContext?.[timeframe] || { bias: 'Neutral' as const, notes: '' };
                    return (
                      <div key={timeframe} className="rounded-lg border border-white/[0.06] p-2.5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <strong className="text-xs text-zinc-200">{timeframe}</strong>
                          <select
                            aria-label={`Sesgo ${timeframe}`}
                            value={entry.bias}
                            onChange={(e) => setNoteForm((prev) => ({
                              ...prev,
                              timeframeContext: {
                                ...prev.timeframeContext,
                                [timeframe]: { ...entry, bias: e.target.value as DailyJournalNote['preMarketBias'] },
                              },
                            }))}
                            className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100"
                          >
                            <option value="Neutral">Neutral</option>
                            <option value="Bullish">Alcista</option>
                            <option value="Bearish">Bajista</option>
                          </select>
                        </div>
                        <input
                          value={entry.notes}
                          onChange={(e) => setNoteForm((prev) => ({
                            ...prev,
                            timeframeContext: {
                              ...prev.timeframeContext,
                              [timeframe]: { ...entry, notes: e.target.value },
                            },
                          }))}
                          placeholder="Nivel o lectura (opcional)"
                          className="w-full rounded-lg border border-white/10 bg-[#09090B] px-2.5 py-2 text-xs text-zinc-100"
                        />
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2 rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3">
                <div>
                  <h4 className="text-xs font-bold text-zinc-200">Mis reglas personales</h4>
                  <p className="text-[11px] text-zinc-500">Son opcionales y editables. Márcalas para esta sesión si las cumpliste.</p>
                </div>
                {personalRules.length === 0 ? (
                  <p className="text-xs text-zinc-500">Aún no agregas reglas; puedes dejar esta parte vacía.</p>
                ) : (
                  <div className="space-y-2">
                    {personalRules.map((rule) => (
                      <div key={rule.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={noteForm.completedRuleIds?.includes(rule.id) || false}
                          onChange={(e) => setNoteForm((prev) => {
                            const completed = new Set(prev.completedRuleIds || []);
                            if (e.target.checked) completed.add(rule.id);
                            else completed.delete(rule.id);
                            return { ...prev, completedRuleIds: Array.from(completed) };
                          })}
                          aria-label={`Marcar regla cumplida: ${rule.text}`}
                          className="accent-emerald-400"
                        />
                        <input
                          value={rule.text}
                          onChange={(e) => updatePersonalRule(rule.id, e.target.value)}
                          aria-label="Editar regla personal"
                          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#09090B] px-2.5 py-2 text-xs text-zinc-100"
                        />
                        <button type="button" onClick={() => deletePersonalRule(rule.id)} aria-label="Eliminar regla" className="rounded-lg p-2 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={newRuleText}
                    onChange={(e) => setNewRuleText(e.target.value)}
                    placeholder="Escribe una regla propia"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#09090B] px-2.5 py-2 text-xs text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => { addPersonalRule(newRuleText); setNewRuleText(''); }}
                    disabled={!newRuleText.trim()}
                    className="rounded-lg border border-white/[0.08] px-3 text-xs font-semibold text-zinc-200 disabled:opacity-40"
                  >
                    <Plus className="mr-1 inline h-3.5 w-3.5" />Agregar
                  </button>
                </div>
              </section>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Lectura Pre-Mercado (1D · 4H · 2H · 30m)
                </label>
                <textarea
                  rows={3}
                  value={noteForm.preMarketNotes}
                  onChange={(e) =>
                    setNoteForm({ ...noteForm, preMarketNotes: e.target.value })
                  }
                  placeholder="¿Qué escenario esperas en la apertura de las 9:30 AM NY?"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/10 text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Conclusión Post-Sesión (Gestión en 15m/5m y Psicología)
                </label>
                <textarea
                  rows={3}
                  value={noteForm.postMarketReview}
                  onChange={(e) =>
                    setNoteForm({
                      ...noteForm,
                      postMarketReview: e.target.value,
                    })
                  }
                  placeholder="¿Esperaste la alineación completa y respetaste TP/SL directo?"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/10 text-zinc-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDay(null);
                    setShowNoTradeWarning(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:bg-white/5 cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${theme.buttonClass}`}
                >
                  <Save className="w-3.5 h-3.5" /> Guardar Notebook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
