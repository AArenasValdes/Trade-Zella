"use client";

import React, { useState, useEffect } from 'react';
import { useTrading } from '@/context/TradingContext';
import { THEME_PALETTES, AccentThemeKey } from '@/config/ict-constants';
import { TIME_ZONES } from '@/config/time-zones';
import { formatClockTime, getTimePartsInTimeZone } from '@/services/date-time-service';
import { ActiveTab } from '@/components/layout/Sidebar';
import {
  Palette,
  Sparkles,
  RefreshCw,
  Menu,
  LogOut,
  Cloud,
} from 'lucide-react';

interface TopbarProps {
  activeTab: ActiveTab;
  onToggleMobileNav: () => void;
  signedInEmail: string;
  onSignOut: () => void;
  localOnly?: boolean;
}

export function Topbar({ activeTab, onToggleMobileNav, signedInEmail, onSignOut, localOnly = false }: TopbarProps) {
  const {
    accentTheme,
    setAccentTheme,
    theme,
    currentQuote,
    nextQuote,
    cloudSyncStatus,
    retryCloudSync,
  } = useTrading();

  const [nyTime, setNyTime] = useState<string>('');
  const [chileTime, setChileTime] = useState<string>('');
  const [isNyOpenWindow, setIsNyOpenWindow] = useState<boolean>(false);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const nyParts = getTimePartsInTimeZone(now, TIME_ZONES.trading);
      const chileParts = getTimePartsInTimeZone(now, TIME_ZONES.user);
      setNyTime(formatClockTime(nyParts));
      setChileTime(formatClockTime(chileParts));

      const mins = nyParts.hour * 60 + nyParts.minute;
      setIsNyOpenWindow(mins >= 570 && mins <= 720);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const cycleTheme = () => {
    const order: AccentThemeKey[] = ['ice', 'mono', 'gold'];
    const next = order[(order.indexOf(accentTheme) + 1) % order.length];
    setAccentTheme(next);
  };

  return (
    <header className="bg-[#09090B]/95 backdrop-blur-xl border-b border-white/[0.08] px-4 py-3 sm:px-6 lg:px-8 sticky top-0 z-10 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button onClick={onToggleMobileNav} aria-label="Abrir navegación" className="shrink-0 rounded-lg border border-white/[0.08] bg-zinc-900 p-2 text-zinc-300 md:hidden">
            <Menu className="h-4 w-4" />
          </button>
          <h1 className="min-w-0 text-sm font-bold text-zinc-100 tracking-tight sm:text-base">
            {activeTab === 'dashboard' && 'Dashboard & Ratios'}
            {activeTab === 'calendar' && 'Calendario'}
            {activeTab === 'analytics' && 'Análisis de Edge & Estadísticas'}
            {activeTab === 'monte-carlo' && 'Simulador Monte Carlo'}
            {activeTab === 'playbooks' && 'Playbooks & Setups'}
          </h1>

          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-xl bg-zinc-900 border border-white/[0.08] px-2 py-1 text-[10px] font-mono sm:gap-2 sm:rounded-full sm:px-3 sm:text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isNyOpenWindow ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-zinc-400">CHILE:</span>
            <strong className="text-zinc-100 tabular-nums">{chileTime || '--:--:--'}</strong>
            <span aria-hidden="true" className="text-zinc-600">/</span>
            <span className="text-zinc-400">NY:</span>
            <strong className="text-zinc-100 tabular-nums">{nyTime || '--:--:--'}</strong>
            <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">
              {isNyOpenWindow ? '· Ventana 9:30 Activa' : '· Fuera de Apertura'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cycleTheme}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-2 cursor-pointer transition-colors"
            title="Cambiar Color de Acento del Sistema"
          >
            <Palette className={`w-3.5 h-3.5 ${theme.accentTextClass}`} />
            <span>{THEME_PALETTES[accentTheme].label}</span>
          </button>

          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-zinc-900 px-2.5 py-1.5">
            {localOnly ? (
              <span className="text-[10px] text-zinc-400">Solo este navegador</span>
            ) : (
              <>
                <span className={`flex items-center gap-1 text-[10px] ${cloudSyncStatus === 'error' ? 'text-amber-300' : cloudSyncStatus === 'synced' ? 'text-emerald-300' : 'text-zinc-500'}`}>
                  <Cloud className="h-3 w-3" />
                  {cloudSyncStatus === 'synced' ? 'Guardado' : cloudSyncStatus === 'loading' ? 'Sincronizando' : 'Sin conexión'}
                </span>
                {cloudSyncStatus === 'error' && (
                  <button
                    aria-label="Reintentar sincronización"
                    className="rounded-md p-1 text-amber-300 transition hover:bg-white/10"
                    onClick={retryCloudSync}
                    title="Reintentar sincronización"
                    type="button"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                )}
                <span className="max-w-36 truncate text-[11px] text-zinc-400" title={signedInEmail}>{signedInEmail}</span>
                <button
                  aria-label="Cerrar sesión"
                  className="rounded-md p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                  onClick={onSignOut}
                  title="Cerrar sesión"
                  type="button"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 bg-zinc-900/60 border border-white/[0.06] rounded-xl px-3 py-2 text-xs sm:px-4 sm:py-1.5">
        <div className="flex items-center gap-2.5 min-w-0 truncate">
          <Sparkles className={`w-3.5 h-3.5 shrink-0 ${theme.accentTextClass}`} />
          <span className="text-zinc-200 italic font-medium truncate">
            &ldquo;{currentQuote.text}&rdquo;
          </span>
          <span className={`text-[11px] font-bold shrink-0 ${theme.accentTextClass}`}>
            — {currentQuote.author}
          </span>
        </div>
        <button
          onClick={nextQuote}
          className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-100 flex items-center gap-1 shrink-0 ml-4 cursor-pointer transition-colors"
          title="Siguiente frase"
        >
          <RefreshCw className="w-3 h-3" /><span className="hidden sm:inline">Siguiente</span>
        </button>
      </div>
    </header>
  );
}
