"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTrading } from '@/context/TradingContext';
import { TIME_ZONES } from '@/config/time-zones';
import {
  extractNyDateKey,
  extractNyTime,
  getDateKeyInTimeZone,
  isValidDateKey,
} from '@/services/date-time-service';
import {
  calculateDailyReturnPct,
  calculateMonthlyReturnPct,
  resolveTradeReturnPct,
  formatReturnPct,
  isTradeIncludedInAggregates,
  hasValidRMultiple,
} from '@/services/financial-engine';
import type { Trade } from '@/types/trading';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
} from 'lucide-react';

interface CalendarViewProps {
  onInspectTrade: (trade: Trade) => void;
  onOpenNewTradeForDate: (dateKey: string) => void;
}

export function CalendarView({
  onInspectTrade,
  onOpenNewTradeForDate,
}: CalendarViewProps) {
  const {
    trades,
    accounts,
    theme,
  } = useTrading();
  const [calMonth, setCalMonth] = useState<string | null>(null);
  const [todayDate, setTodayDate] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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

  const calendarData = useMemo(() => {
    const map: Record<
      string,
      { pnl: number; sumR: number; hasMonetary: boolean; returnPct: number | null; count: number; wins: number; trades: Trade[] }
    > = {};
    trades.forEach((t) => {
      const day = extractNyDateKey(t.entryDate) || t.entryDate.slice(0, 10);
      if (!map[day]) map[day] = { pnl: 0, sumR: 0, hasMonetary: false, returnPct: null, count: 0, wins: 0, trades: [] };
      map[day].trades.push(t);
      if (!isTradeIncludedInAggregates(t)) return;
      if (t.calculationMode !== 'unrecorded') {
        map[day].pnl = Number((map[day].pnl + t.netPnl).toFixed(2));
        map[day].hasMonetary = true;
      }
      if (hasValidRMultiple(t)) {
        map[day].sumR = Number((map[day].sumR + t.rMultiple).toFixed(2));
      }
      map[day].count += 1;
      if (t.status === 'Win' || t.netPnl > 0) map[day].wins += 1;
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
        monthlySumR: 0,
        hasMonthlyMonetary: false,
        monthlyReturnPct: null as number | null,
        greenDays: 0,
        redDays: 0,
        weeklySummaries: [] as Array<{weekStart: string; weekEnd: string; count: number; returnPct: number | null; pnl: number; hasMonetary: boolean; sumR: number}>,
        weekendTrades: [] as Trade[],
      };
    }

    const [year, month] = calMonth.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const firstDayWeekday = firstWeekday < 5 ? firstWeekday : 0;

    let monthlyPnl = 0;
    let monthlySumR = 0;
    let hasMonthlyMonetary = false;
    let greenDays = 0;
    let redDays = 0;
    const monthlyTrades: Trade[] = [];

    Object.entries(map).forEach(([dateKey, info]) => {
      if (dateKey.startsWith(calMonth)) {
        if (info.hasMonetary) {
          monthlyPnl += info.pnl;
          hasMonthlyMonetary = true;
        }
        monthlySumR += info.sumR;
        monthlyTrades.push(...info.trades);

        const isGreen = info.returnPct !== null ? info.returnPct > 0 : (info.hasMonetary ? info.pnl > 0 : info.sumR > 0);
        const isRed = info.returnPct !== null ? info.returnPct < 0 : (info.hasMonetary ? info.pnl < 0 : info.sumR < 0);
        if (isGreen) greenDays++;
        else if (isRed) redDays++;
      }
    });

    const monthlyReturnPct = calculateMonthlyReturnPct(monthlyTrades, accounts);

    const weekBuckets = new Map<string, Trade[]>();
    const weekendTrades: Trade[] = [];
    for (const trade of monthlyTrades) {
      if (!isTradeIncludedInAggregates(trade)) continue;
      const nyDate = extractNyDateKey(trade.entryDate) || trade.entryDate.slice(0, 10);
      if (!isValidDateKey(nyDate)) continue;
      const [tradeYear, tradeMonth, tradeDay] = nyDate.split('-').map(Number);
      const tradeDate = new Date(Date.UTC(tradeYear, tradeMonth - 1, tradeDay));
      const dayOfWeek = tradeDate.getUTCDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendTrades.push(trade);
      }
      const monday = new Date(tradeDate.getTime());
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      weekBuckets.set(key, [...(weekBuckets.get(key) ?? []), trade]);
    }

    const weeklySummaries = Array.from(weekBuckets, ([weekStart, weeklyTrades]) => {
      const [sy, sm, sd] = weekStart.split('-').map(Number);
      const mon = new Date(Date.UTC(sy, sm - 1, sd));
      const sun = new Date(mon.getTime() + 6 * 86400000);
      const weekEnd = sun.toISOString().slice(0, 10);
      const monetary = weeklyTrades.filter((t) => t.calculationMode !== 'unrecorded');
      const pnl = monetary.reduce((sum, trade) => sum + trade.netPnl, 0);
      const sumR = Number(
        weeklyTrades
          .filter(hasValidRMultiple)
          .reduce((sum, trade) => sum + trade.rMultiple, 0)
          .toFixed(2)
      );

      return {
        weekStart,
        weekEnd,
        count: weeklyTrades.length,
        returnPct: calculateMonthlyReturnPct(weeklyTrades, accounts),
        pnl: Number(pnl.toFixed(2)),
        hasMonetary: monetary.length > 0,
        sumR,
      };
    }).sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    return {
      map,
      daysInMonth,
      firstDayWeekday,
      monthlyPnl: Number(monthlyPnl.toFixed(2)),
      monthlySumR: Number(monthlySumR.toFixed(2)),
      hasMonthlyMonetary,
      monthlyReturnPct,
      greenDays,
      redDays,
      weeklySummaries,
      weekendTrades,
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
  };

  const selectedDayInfo = selectedDay ? calendarData.map[selectedDay] : undefined;
  const selectedDayTrades = selectedDayInfo?.trades || [];
  const selectedDayPnl = selectedDayInfo?.pnl || 0;
  const selectedDayReturnPct = selectedDayInfo?.returnPct ?? null;

  if (!calMonth || !todayDate) {
    return (
      <div
        aria-busy="true"
        aria-label="Sincronizando fecha del calendario"
        className="min-h-[28rem] rounded-2xl border border-white/[0.08] bg-[#111114]"
      />
    );
  }

  const isMonthlyGreen = calendarData.monthlyReturnPct !== null
    ? calendarData.monthlyReturnPct > 0
    : calendarData.hasMonthlyMonetary
    ? calendarData.monthlyPnl > 0
    : calendarData.monthlySumR > 0;

  const isMonthlyRed = calendarData.monthlyReturnPct !== null
    ? calendarData.monthlyReturnPct < 0
    : calendarData.hasMonthlyMonetary
    ? calendarData.monthlyPnl < 0
    : calendarData.monthlySumR < 0;

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
              Selecciona un día para inspeccionar operaciones o pulsa + para registrar una nueva.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-bold tabular-nums sm:gap-4">
            <span
              className={`px-3 py-1 rounded-lg border ${
                isMonthlyGreen
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : isMonthlyRed
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  : 'bg-zinc-800/40 text-zinc-300 border-white/10'
              }`}
            >
              Retorno Mes:{' '}
              {calendarData.monthlyReturnPct !== null
                ? formatReturnPct(calendarData.monthlyReturnPct)
                : calendarData.hasMonthlyMonetary && calendarData.monthlyPnl !== 0
                ? `${calendarData.monthlyPnl >= 0 ? '+' : '-'}$${Math.abs(calendarData.monthlyPnl).toFixed(2)} USD`
                : `${calendarData.monthlySumR >= 0 ? '+' : ''}${calendarData.monthlySumR.toFixed(2)}R`}
            </span>
            <span className="text-emerald-400">
              {calendarData.greenDays} Días TP
            </span>
            <span className="text-rose-400">
              {calendarData.redDays} Días SL
            </span>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-white/[0.07] bg-zinc-950/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Rendimiento semanal (fecha NY)
            </h3>
            <span className="text-[11px] text-zinc-500">
              Operaciones correspondientes a este mes (semanas Lun–Dom)
            </span>
          </div>
          {calendarData.weeklySummaries.length === 0 ? (
            <p className="text-xs text-zinc-500">Sin operaciones registradas este mes.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {calendarData.weeklySummaries.map((week) => {
                const isWeekGreen = week.returnPct !== null ? week.returnPct > 0 : (week.hasMonetary ? week.pnl > 0 : week.sumR > 0);
                const isWeekRed = week.returnPct !== null ? week.returnPct < 0 : (week.hasMonetary ? week.pnl < 0 : week.sumR < 0);

                return (
                  <div key={week.weekStart} className="rounded-lg border border-white/[0.07] bg-zinc-900/60 p-2.5">
                    <p className="text-[11px] text-zinc-400">
                      Semana {week.weekStart.slice(8, 10)}/{week.weekStart.slice(5, 7)} – {week.weekEnd.slice(8, 10)}/{week.weekEnd.slice(5, 7)}
                    </p>
                    <strong className={`text-sm tabular-nums ${isWeekGreen ? 'text-emerald-400' : isWeekRed ? 'text-rose-400' : 'text-zinc-300'}`}>
                      {week.returnPct !== null
                        ? formatReturnPct(week.returnPct)
                        : week.hasMonetary && week.pnl !== 0
                        ? `${week.pnl >= 0 ? '+' : '-'}$${Math.abs(week.pnl).toFixed(2)}`
                        : `${week.sumR >= 0 ? '+' : ''}${week.sumR.toFixed(2)}R`}
                    </strong>
                    <p className="text-[10px] text-zinc-500">{week.count} {week.count === 1 ? 'trade' : 'trades'}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[500px] grid-cols-5 gap-2.5">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map((d) => (
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
              const [year, month] = calMonth.split('-').map(Number);
              const weekday = new Date(Date.UTC(year, month - 1, i + 1)).getUTCDay();
              if (weekday === 0 || weekday === 6) return null;
              const dayNum = String(i + 1).padStart(2, '0');
              const dateStr = `${calMonth}-${dayNum}`;
              const isToday = dateStr === todayDate;
              const dayData = calendarData.map[dateStr];

              const hasTrades = Boolean(dayData && dayData.count > 0);
              const isGreen = Boolean(dayData && (dayData.returnPct !== null ? dayData.returnPct > 0 : (dayData.hasMonetary ? dayData.pnl > 0 : dayData.sumR > 0)));
              const isRed = Boolean(dayData && (dayData.returnPct !== null ? dayData.returnPct < 0 : (dayData.hasMonetary ? dayData.pnl < 0 : dayData.sumR < 0)));

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
                    !hasTrades
                      ? 'bg-zinc-900/40 border-white/[0.05] text-zinc-500'
                      : isGreen
                      ? 'bg-emerald-500/10 border-emerald-500/25'
                      : isRed
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
                    </span>
                    <div className="flex items-center gap-1">
                      {dayData && dayData.count > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-zinc-300 border border-white/[0.06]">
                          {dayData.count}t
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label={`Registrar operación del ${dateStr}`}
                        title="Registrar operación"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenNewTradeForDate(dateStr);
                        }}
                        className={`rounded-lg border border-white/10 bg-zinc-800 p-1 text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 ${theme.ringClass}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {dayData && dayData.count > 0 && (
                    <div className="text-right">
                      <div
                        className={`text-sm font-extrabold tabular-nums ${
                          isGreen
                            ? 'text-emerald-400'
                            : isRed
                            ? 'text-rose-400'
                            : 'text-zinc-300'
                        }`}
                      >
                        {dayData.returnPct !== null
                          ? formatReturnPct(dayData.returnPct)
                          : dayData.hasMonetary && dayData.pnl !== 0
                          ? `${dayData.pnl >= 0 ? '+' : '-'}$${Math.abs(dayData.pnl).toFixed(0)}`
                          : `${dayData.sumR >= 0 ? '+' : ''}${dayData.sumR.toFixed(2)}R`}
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
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
          <p>Sábados y domingos se ocultan en la cuadrícula, pero las operaciones históricas de esos días siguen incluidas en los totales mensuales y semanales.</p>
          {calendarData.weekendTrades.length > 0 && (
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-300 font-medium">
              {calendarData.weekendTrades.length} trade(s) en fin de semana este mes
            </span>
          )}
        </div>
      </div>

      {selectedDay && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#111114] text-zinc-100 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Operaciones del Día NY — {selectedDay}
                </h3>
                <p className="text-xs text-zinc-400">
                  Inspecciona las operaciones ejecutadas en esta jornada o registra una nueva.
                </p>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
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
                      : `Retorno Día: ${
                          selectedDayReturnPct !== null
                            ? formatReturnPct(selectedDayReturnPct)
                            : selectedDayInfo?.hasMonetary && selectedDayPnl !== 0
                            ? `${selectedDayPnl >= 0 ? '+' : ''}$${selectedDayPnl.toFixed(2)} USD`
                            : `${(selectedDayInfo?.sumR ?? 0) >= 0 ? '+' : ''}${(selectedDayInfo?.sumR ?? 0).toFixed(2)}R`
                        } · Selecciona una operación para inspeccionarla`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const day = selectedDay;
                    setSelectedDay(null);
                    onOpenNewTradeForDate(day);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${theme.buttonClass}`}
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  Registrar operación
                </button>
              </div>

              {selectedDayTrades.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  {selectedDayTrades.map((t) => {
                    const acc = accounts.find((a) => a.id === t.accountId);
                    const retPct = resolveTradeReturnPct(t, acc?.initialBalance);
                    const isUnrecorded = t.calculationMode === 'unrecorded';

                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          setSelectedDay(null);
                          onInspectTrade(t);
                        }}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] cursor-pointer text-xs transition-colors"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-zinc-400">
                            {t.timePrecision === 'window'
                              ? `${t.operationalWindow === 'window_2' ? '10:35–11:00' : '09:30–10:35'} NY`
                              : `${extractNyTime(t.entryDate)} NY`}
                          </span>
                          <strong className="text-white">{t.symbol}</strong>
                          <span className="px-2 py-0.5 rounded bg-black/50 text-zinc-300 font-semibold">
                            {t.direction}
                          </span>
                          <span className="text-zinc-400">{t.pdArrays?.[0] || t.killzone}</span>
                          {t.durationMinutes && (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {t.durationMinutes} min
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span
                            className={`font-bold tabular-nums block ${
                              t.status === 'Win' || t.netPnl > 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {t.rUnrecorded
                              ? 'Sin R'
                              : t.rMultiple > 0
                              ? `+${t.rMultiple}R`
                              : `${t.rMultiple}R`}
                            {retPct !== null && (
                              <span className="ml-1 text-[11px] font-normal text-zinc-400">
                                ({formatReturnPct(retPct)})
                              </span>
                            )}
                          </span>
                          {!isUnrecorded && t.netPnl !== 0 ? (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {t.calculationMode === 'derived_r' || t.commissionUnmeasured ? '~' : ''}
                              {t.netPnl >= 0 ? `+$${t.netPnl.toFixed(2)}` : `-$${Math.abs(t.netPnl).toFixed(2)}`} USD
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              (Métrica en R)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 py-6 text-center">
                  No hay operaciones registradas en este día.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:bg-white/5 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
