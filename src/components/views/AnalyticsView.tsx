"use client";

import React, { useState, useMemo, useRef } from 'react';
import { useTrading } from '@/context/TradingContext';
import type { Trade } from '@/types/trading';
import {
  calculateModelComparison,
  calculateWindowComparison,
  calculateDurationBreakdown,
  calculateWeekdayBreakdown,
  calculateSymbolBreakdown,
  calculatePsychologyBreakdown,
  calculateBacktestVsRealComparison,
  filterAnalyticsTrades,
  resolvePrimaryModel,
  resolveOperationalWindow,
  INITIAL_ANALYTICS_FILTERS,
  type AnalyticsFilters,
  type EdgeCohortMetrics,
  type BacktestVsRealComparisonResult,
} from '@/services/edge-analytics-service';
import {
  Target,
  Clock,
  Calendar,
  Layers,
  Brain,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Eye,
  Filter,
  BarChart2,
  HelpCircle,
  Upload,
  ArrowRightLeft,
  Scale,
  ShieldAlert,
} from 'lucide-react';

interface AnalyticsViewProps {
  onInspectTrade: (trade: Trade) => void;
}

type MainAnalyticsTab = 'edge_v2' | 'backtest_vs_real';
type DimensionTab = 'duration' | 'weekday' | 'symbol' | 'psychology';

export function AnalyticsView({ onInspectTrade }: AnalyticsViewProps) {
  const { trades, playbooks, theme, importBacktestCSV } = useTrading();

  const [mainTab, setMainTab] = useState<MainAnalyticsTab>('edge_v2');
  const [filters, setFilters] = useState<AnalyticsFilters>(INITIAL_ANALYTICS_FILTERS);
  const [selectedCohort, setSelectedCohort] = useState<EdgeCohortMetrics | null>(null);
  const [activeDimension, setActiveDimension] = useState<DimensionTab>('duration');

  // Backtest vs Real drill-down environment filter
  const [bvrFilterEnv, setBvrFilterEnv] = useState<'All' | 'real' | 'backtest' | 'demo' | 'unclassified'>('All');

  // Import feedback
  const [importNotification, setImportNotification] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Available symbols for the filter dropdown
  const availableSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) {
      if (t.symbol) set.add(t.symbol.trim().toUpperCase());
    }
    return Array.from(set).sort();
  }, [trades]);

  // Trades filtered by the top filter bar for V2 edge analytics
  const filteredTrades = useMemo(() => {
    return filterAnalyticsTrades(trades, filters);
  }, [trades, filters]);

  // Model comparison: Breaker Block vs Key Level
  const modelComparison = useMemo(() => {
    return calculateModelComparison(filteredTrades);
  }, [filteredTrades]);

  // Operational windows comparison: 09:30–10:35 vs 10:35–11:00 NY
  const windowComparison = useMemo(() => {
    return calculateWindowComparison(filteredTrades);
  }, [filteredTrades]);

  // Multidimensional breakdowns
  const durationCohorts = useMemo(() => {
    return calculateDurationBreakdown(filteredTrades);
  }, [filteredTrades]);

  const weekdayCohorts = useMemo(() => {
    return calculateWeekdayBreakdown(filteredTrades);
  }, [filteredTrades]);

  const symbolCohorts = useMemo(() => {
    return calculateSymbolBreakdown(filteredTrades);
  }, [filteredTrades]);

  const psychologyCohorts = useMemo(() => {
    return calculatePsychologyBreakdown(filteredTrades);
  }, [filteredTrades]);

  const activeCohortsList = useMemo(() => {
    switch (activeDimension) {
      case 'duration':
        return durationCohorts;
      case 'weekday':
        return weekdayCohorts;
      case 'symbol':
        return symbolCohorts;
      case 'psychology':
        return psychologyCohorts;
      default:
        return durationCohorts;
    }
  }, [activeDimension, durationCohorts, weekdayCohorts, symbolCohorts, psychologyCohorts]);

  // V3 Backtesting vs Real comprehensive comparison
  const bvrComparison: BacktestVsRealComparisonResult = useMemo(() => {
    return calculateBacktestVsRealComparison(trades);
  }, [trades]);

  // Drill-down trades list for V2 (either selected cohort's trades or all filtered trades)
  const supportingTrades = useMemo(() => {
    if (selectedCohort) {
      const idSet = new Set(selectedCohort.tradeIds);
      return filteredTrades.filter((t) => idSet.has(t.id));
    }
    return filteredTrades;
  }, [filteredTrades, selectedCohort]);

  // Trades list for Backtest vs Real drill-down table
  const bvrSupportingTrades = useMemo(() => {
    return trades.filter((t) => {
      if (t.sourceType === undefined && bvrFilterEnv === 'unclassified') return true;
      if (bvrFilterEnv === 'All') return true;
      return (t.sourceType || 'unclassified') === bvrFilterEnv;
    });
  }, [trades, bvrFilterEnv]);

  const hasActiveFilters =
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.symbol !== 'All' ||
    filters.model !== 'All' ||
    filters.window !== 'All' ||
    (filters.sourceType && filters.sourceType !== 'All');

  const resetFilters = () => {
    setFilters(INITIAL_ANALYTICS_FILTERS);
    setSelectedCohort(null);
  };

  const handleSelectCohort = (cohort: EdgeCohortMetrics) => {
    if (selectedCohort?.key === cohort.key) {
      setSelectedCohort(null); // toggle off
    } else {
      setSelectedCohort(cohort);
    }
  };

  const handleBacktestCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text || text.trim() === '') {
          setImportNotification({
            type: 'error',
            message: 'El archivo CSV seleccionado está vacío.',
          });
          return;
        }
        const count = importBacktestCSV(text);
        if (count > 0) {
          setImportNotification({
            type: 'success',
            message: `Se importaron exitosamente ${count} operaciones de backtesting sin duplicados.`,
          });
        } else {
          setImportNotification({
            type: 'warning',
            message: 'No se importaron nuevas operaciones (posibles duplicados o formato no compatible).',
          });
        }
      } catch (err) {
        setImportNotification({
          type: 'error',
          message: `Error al procesar el archivo CSV: ${err instanceof Error ? err.message : 'desconocido'}`,
        });
      }
    };
    reader.onerror = () => {
      setImportNotification({
        type: 'error',
        message: 'Error al leer el archivo en el navegador.',
      });
    };
    reader.readAsText(file);
    // Reset file input value so user can re-upload if needed
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Top Main Navigation Tabs: V2 Edge vs V3 Backtest vs Real */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111114] p-2 sm:p-2.5 rounded-2xl border border-white/[0.08]">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMainTab('edge_v2')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-all ${
              mainTab === 'edge_v2'
                ? theme.activeNavClass
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            Análisis de Modelos y Edge (V2)
          </button>

          <button
            onClick={() => setMainTab('backtest_vs_real')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-all ${
              mainTab === 'backtest_vs_real'
                ? theme.activeNavClass
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            Backtesting vs Real (V3)
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 px-2">
          <span>Real: {bvrComparison.realCohort.totalTrades}</span>
          <span className="text-zinc-600">·</span>
          <span>BT: {bvrComparison.backtestCohort.totalTrades}</span>
          <span className="text-zinc-600">·</span>
          <span>Demo: {bvrComparison.demoCohort.totalTrades}</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: V2 EDGE ANALYTICS & OPERATIONAL MODELS                             */}
      {/* ========================================================================= */}
      {mainTab === 'edge_v2' && (
        <div className="space-y-6">
          {/* Header & Filter Bar */}
          <div className="bg-[#111114] rounded-2xl p-4 sm:p-6 border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart2 className={`w-5 h-5 ${theme.accentTextClass}`} />
                  <h2 className="text-base sm:text-lg font-bold text-zinc-100 tracking-tight">
                    Análisis Operativo & Estadísticas de Edge (V2)
                  </h2>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Estudio de ventaja estadística por modelo, horario de Nueva York, duración y psicología con trazabilidad trade a trade.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/[0.08] text-zinc-400">
                  N = {filteredTrades.length} ops válidas
                </span>
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 px-3 py-1 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restablecer filtros
                  </button>
                )}
              </div>
            </div>

            {/* Filter Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/[0.08] rounded-xl px-3 py-1.5">
                <span className="text-[11px] text-zinc-500 shrink-0">Desde:</span>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                  className="bg-transparent text-xs text-zinc-200 w-full focus:outline-none"
                  title="Fecha inicial"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/[0.08] rounded-xl px-3 py-1.5">
                <span className="text-[11px] text-zinc-500 shrink-0">Hasta:</span>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                  className="bg-transparent text-xs text-zinc-200 w-full focus:outline-none"
                  title="Fecha final"
                />
              </div>

              <select
                value={filters.sourceType || 'All'}
                onChange={(e) => setFilters((prev) => ({ ...prev, sourceType: e.target.value }))}
                className="px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-200 font-medium focus:outline-none"
              >
                <option value="All">Entorno: Todos</option>
                <option value="real">Real</option>
                <option value="backtest">Backtesting</option>
                <option value="demo">Demo</option>
                <option value="unclassified">Sin clasificar</option>
              </select>

              <select
                value={filters.symbol}
                onChange={(e) => setFilters((prev) => ({ ...prev, symbol: e.target.value }))}
                className="px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-200 font-medium focus:outline-none"
              >
                <option value="All">Activo: Todos ({availableSymbols.length})</option>
                {availableSymbols.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                value={filters.model}
                onChange={(e) => setFilters((prev) => ({ ...prev, model: e.target.value }))}
                className="px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-200 font-medium focus:outline-none"
              >
                <option value="All">Modelo: Todos</option>
                <option value="Breaker Block">Breaker Block</option>
                <option value="Key Level">Key Level</option>
                <option value="BPR (Balanced Price Range)">BPR</option>
                <option value="Sin modelo registrado">Sin modelo</option>
              </select>

              <select
                value={filters.window}
                onChange={(e) => setFilters((prev) => ({ ...prev, window: e.target.value }))}
                className="px-3 py-2 text-xs rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-200 font-medium focus:outline-none"
              >
                <option value="All">Ventana NY: Todas</option>
                <option value="window_1">Ventana 1 (09:30–10:35)</option>
                <option value="window_2">Ventana 2 (10:35–11:00)</option>
                <option value="outside">Fuera de Ventana</option>
              </select>
            </div>
          </div>

          {/* Section 1: Comparativa Principal: Breaker Block vs Key Level */}
          <div className="bg-[#111114] rounded-2xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Target className={`w-4 h-4 ${theme.accentTextClass}`} />
                  <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                    Comparativa de Modelos Operativos: Breaker Block vs Key Level
                  </h3>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Cada operación se clasifica en un único modelo principal para evitar doble conteo estadístico.
                </p>
              </div>
            </div>

            {/* Side-by-Side Model Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CohortCard
                cohort={modelComparison.breakerBlock}
                isSelected={selectedCohort?.key === modelComparison.breakerBlock.key}
                onSelect={() => handleSelectCohort(modelComparison.breakerBlock)}
                accentClass={theme.accentTextClass}
              />

              <CohortCard
                cohort={modelComparison.keyLevel}
                isSelected={selectedCohort?.key === modelComparison.keyLevel.key}
                onSelect={() => handleSelectCohort(modelComparison.keyLevel)}
                accentClass={theme.accentTextClass}
              />
            </div>

            {/* Other Models (if present) */}
            {modelComparison.otherModels.length > 0 && (
              <div className="pt-2 border-t border-white/[0.06]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-2">
                  Otros Modelos Registrados
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {modelComparison.otherModels.map((om) => (
                    <CohortCard
                      key={om.key}
                      cohort={om}
                      isSelected={selectedCohort?.key === om.key}
                      onSelect={() => handleSelectCohort(om)}
                      accentClass={theme.accentTextClass}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Statistical Verdict Box */}
            <div className="rounded-xl bg-zinc-900/60 border border-white/[0.06] p-3.5 text-xs space-y-1.5">
              <div className="flex items-center gap-2 text-zinc-300 font-semibold">
                <HelpCircle className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Diagnóstico Estadístico de la Muestra:</span>
              </div>
              <p className="text-zinc-400 leading-relaxed">
                {modelComparison.verdict.description}
              </p>
              {!modelComparison.verdict.hasSufficientData && (
                <p className="text-[11px] text-amber-400/90 font-medium">
                  Nota metodológica: Las muestras inferiores a 10 operaciones no representan significancia estadística ni garantizan causalidad en el edge de trading.
                </p>
              )}
            </div>
          </div>

          {/* Section 2: Horarios de Nueva York (09:30–10:35 vs 10:35–11:00 NY) */}
          <div className="bg-[#111114] rounded-2xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${theme.accentTextClass}`} />
                  <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                    Rendimiento por Horario de Nueva York
                  </h3>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Comparación entre las dos ventanas operativas y ejecuciones fuera de horario institucional.
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                <span className="px-2 py-0.5 rounded bg-zinc-900 border border-white/[0.06]">
                  {windowComparison.exactTimeCount} exactas
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-900 border border-white/[0.06]">
                  {windowComparison.windowTimeCount} por ventana
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CohortCard
                cohort={windowComparison.window1}
                isSelected={selectedCohort?.key === windowComparison.window1.key}
                onSelect={() => handleSelectCohort(windowComparison.window1)}
                accentClass={theme.accentTextClass}
              />
              <CohortCard
                cohort={windowComparison.window2}
                isSelected={selectedCohort?.key === windowComparison.window2.key}
                onSelect={() => handleSelectCohort(windowComparison.window2)}
                accentClass={theme.accentTextClass}
              />
              <CohortCard
                cohort={windowComparison.outside}
                isSelected={selectedCohort?.key === windowComparison.outside.key}
                onSelect={() => handleSelectCohort(windowComparison.outside)}
                accentClass={theme.accentTextClass}
                compact
              />
            </div>
          </div>

          {/* Section 3: Desglose Multidimensional (Duración, Día, Activo, Psicología) */}
          <div className="bg-[#111114] rounded-2xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className={`w-4 h-4 ${theme.accentTextClass}`} />
                  <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                    Segmentación Multidimensional
                  </h3>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Explora patrones por duración del trade, día hábil, activo y disciplina psicológica.
                </p>
              </div>

              {/* Dimension Tabs */}
              <div className="flex flex-wrap gap-1 bg-zinc-900 p-1 rounded-xl border border-white/[0.08]">
                {[
                  { id: 'duration', label: 'Duración', icon: Clock },
                  { id: 'weekday', label: 'Día Laboral', icon: Calendar },
                  { id: 'symbol', label: 'Activo', icon: Target },
                  { id: 'psychology', label: 'Psicología', icon: Brain },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = activeDimension === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveDimension(tab.id as DimensionTab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                        active
                          ? theme.activeNavClass
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cohort Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {activeCohortsList.map((cohort) => (
                <CohortCard
                  key={cohort.key}
                  cohort={cohort}
                  isSelected={selectedCohort?.key === cohort.key}
                  onSelect={() => handleSelectCohort(cohort)}
                  accentClass={theme.accentTextClass}
                  compact
                />
              ))}
            </div>
          </div>

          {/* Section 4: Explorador de Operaciones de Respaldo (Drill-Down) */}
          <div className="bg-[#111114] rounded-2xl border border-white/[0.08] overflow-hidden space-y-0">
            <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-zinc-400" />
                  <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                    Operaciones de Respaldo ({supportingTrades.length} registros)
                  </h3>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Haz clic en cualquier operación para abrir el inspector y auditar notas, gráfico y ejecución exacta.
                </p>
              </div>

              {selectedCohort && (
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/20 font-semibold flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5" />
                    Filtro activo: {selectedCohort.label}
                  </span>
                  <button
                    onClick={() => setSelectedCohort(null)}
                    className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    Limpiar cohorte
                  </button>
                </div>
              )}
            </div>

            {/* Drill-down Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[720px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-900/40">
                    <th className="py-3 px-4">Fecha NY / Activo</th>
                    <th className="py-3 px-3">Entorno</th>
                    <th className="py-3 px-3">Lado</th>
                    <th className="py-3 px-3">Modelo Principal</th>
                    <th className="py-3 px-3">Ventana NY</th>
                    <th className="py-3 px-3">Duración</th>
                    <th className="py-3 px-3">Psicología</th>
                    <th className="py-3 px-4 text-right">R-Multiple</th>
                    <th className="py-3 px-4 text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-xs">
                  {supportingTrades.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-zinc-500">
                        No hay operaciones que coincidan con la selección o filtro actual.
                      </td>
                    </tr>
                  ) : (
                    supportingTrades.map((t) => {
                      const primaryModel = resolvePrimaryModel(t);
                      const { window, isExact } = resolveOperationalWindow(t);
                      const isWin = t.status === 'Win';

                      return (
                        <tr
                          key={t.id}
                          onClick={() => onInspectTrade(t)}
                          className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-zinc-200 flex items-center gap-1.5">
                              {t.symbol}
                              <span className="text-[10px] font-semibold px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">
                                {t.timeframe || '5m'}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                              {t.entryDate.replace('T', ' ').slice(0, 16)}
                            </div>
                          </td>

                          <td className="py-3.5 px-3">
                            <SourceTypeBadge sourceType={t.sourceType} />
                          </td>

                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                t.direction === 'Long'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {t.direction}
                            </span>
                          </td>

                          <td className="py-3.5 px-3">
                            <span className="text-zinc-200 font-medium">
                              {primaryModel}
                            </span>
                          </td>

                          <td className="py-3.5 px-3">
                            <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                              {window === 'window_1'
                                ? '09:30–10:35'
                                : window === 'window_2'
                                ? '10:35–11:00'
                                : 'Fuera NY'}
                              <span className="text-[9px] text-zinc-600">
                                ({isExact ? 'exacta' : 'ventana'})
                              </span>
                            </span>
                          </td>

                          <td className="py-3.5 px-3 text-zinc-400 font-mono">
                            {t.durationMinutes !== null && t.durationMinutes !== undefined
                              ? `${t.durationMinutes} min`
                              : <span className="text-zinc-600">Sin dato</span>}
                          </td>

                          <td className="py-3.5 px-3 text-zinc-300">
                            <span className="truncate max-w-[150px] block" title={t.psychologyTag}>
                              {t.psychologyTag || 'Sin clasificar'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold">
                            {t.rUnrecorded ? (
                              <span className="text-zinc-500">Sin R</span>
                            ) : (
                              <span className={t.rMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {t.rMultiple > 0 ? `+${t.rMultiple}` : t.rMultiple}R
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold ${
                                isWin
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                              }`}
                            >
                              {isWin ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {isWin ? 'TP' : 'SL'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historical Playbooks Section */}
          {playbooks.length > 0 && (
            <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Escenarios Históricos Registrados ({playbooks.length})
                </h4>
                <span className="text-[11px] text-zinc-500">
                  Modo consulta histórica · Creación de nuevos escenarios deshabilitada en V2
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {playbooks.map((pb) => (
                  <div
                    key={pb.id}
                    className="p-3.5 rounded-xl border border-white/[0.06] bg-zinc-900/40 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-200">{pb.name}</span>
                      <span className="text-[10px] text-zinc-500">{pb.defaultKillzone}</span>
                    </div>
                    {pb.description && <p className="text-zinc-400 text-[11px]">{pb.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: V3 BACKTESTING VS REAL COMPARISON                                   */}
      {/* ========================================================================= */}
      {mainTab === 'backtest_vs_real' && (
        <div className="space-y-6">
          {/* Header & CSV Import Action */}
          <div className="bg-[#111114] rounded-2xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-white/[0.06]">
              <div>
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className={`w-5 h-5 ${theme.accentTextClass}`} />
                  <h2 className="text-base sm:text-lg font-bold text-zinc-100 tracking-tight">
                    Auditoría Comparativa: Backtesting vs Real (V3)
                  </h2>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Contrasta el rendimiento simulado contra la operativa real con capital en vivo para detectar desvíos de ejecución y degradación de edge.
                </p>
              </div>

              {/* Import Backtest CSV Button */}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleBacktestCSVUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                  title="Importar archivo CSV asignando entorno Backtest con prevención de duplicados"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Importar CSV de Backtesting
                </button>
              </div>
            </div>

            {/* Notification Banner */}
            {importNotification && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                  importNotification.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : importNotification.type === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                }`}
              >
                <span>{importNotification.message}</span>
                <button
                  onClick={() => setImportNotification(null)}
                  className="text-zinc-400 hover:text-white px-2 py-0.5 rounded cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Cohort Population Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/[0.06]">
                <span className="text-[10px] text-zinc-500 uppercase font-bold block">Población Real</span>
                <span className="text-base font-extrabold text-emerald-400 tabular-nums">
                  N = {bvrComparison.realCohort.totalTrades}
                </span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  {bvrComparison.realCohort.rSampleSize} con R registrado
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/[0.06]">
                <span className="text-[10px] text-zinc-500 uppercase font-bold block">Población Backtesting</span>
                <span className="text-base font-extrabold text-violet-400 tabular-nums">
                  N = {bvrComparison.backtestCohort.totalTrades}
                </span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  {bvrComparison.backtestCohort.rSampleSize} con R registrado
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/[0.06]">
                <span className="text-[10px] text-zinc-500 uppercase font-bold block">Población Demo</span>
                <span className="text-base font-extrabold text-sky-400 tabular-nums">
                  N = {bvrComparison.demoCohort.totalTrades}
                </span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  {bvrComparison.demoCohort.rSampleSize} con R registrado
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/[0.06]">
                <span className="text-[10px] text-zinc-500 uppercase font-bold block">Sin clasificar (Histórico)</span>
                <span className="text-base font-extrabold text-zinc-400 tabular-nums">
                  N = {bvrComparison.unclassifiedCohort.totalTrades}
                </span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Preservados sin asumir real
                </span>
              </div>
            </div>
          </div>

          {/* Statistical Verdict & Confidence Banner */}
          <div
            className={`rounded-2xl p-5 border space-y-2 ${
              bvrComparison.verdict.status === 'optimal'
                ? 'bg-emerald-500/10 border-emerald-500/25'
                : bvrComparison.verdict.status === 'degraded'
                ? 'bg-rose-500/10 border-rose-500/25'
                : bvrComparison.verdict.status === 'insufficient_sample'
                ? 'bg-amber-500/10 border-amber-500/25'
                : 'bg-zinc-900 border-white/[0.08]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {bvrComparison.verdict.status === 'optimal' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : bvrComparison.verdict.status === 'degraded' ? (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                {bvrComparison.verdict.title}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed pl-7">
              {bvrComparison.verdict.description}
            </p>
            {!bvrComparison.verdict.hasSufficientData && (
              <div className="pl-7 pt-1">
                <span className="text-[11px] font-semibold text-amber-400/90 bg-amber-500/15 border border-amber-500/20 px-2.5 py-1 rounded-lg inline-block">
                  Regla de Confianza: Se requieren mínimo 10 operaciones con R en Real y 10 en Backtesting para emitir un diagnóstico concluyente.
                </span>
              </div>
            )}
          </div>

          {/* Top 3 Comparative Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Backtesting */}
            <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-violet-400" />
                  <h4 className="text-sm font-bold text-zinc-100">Backtesting (Simulado)</h4>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900 text-violet-300 border border-violet-500/20">
                  N = {bvrComparison.backtestCohort.totalTrades}
                </span>
              </div>

              {bvrComparison.backtestCohort.confidenceWarning && (
                <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                  {bvrComparison.backtestCohort.confidenceWarning}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Win Rate</span>
                  <span className="text-lg font-extrabold text-zinc-100 tabular-nums">
                    {bvrComparison.backtestCohort.totalTrades > 0 ? `${bvrComparison.backtestCohort.winRate}%` : 'N/A'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    {bvrComparison.backtestCohort.winsCount} TP · {bvrComparison.backtestCohort.lossesCount} SL
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Expectativa</span>
                  <span
                    className={`text-lg font-extrabold tabular-nums ${
                      bvrComparison.backtestCohort.rSampleSize === 0
                        ? 'text-zinc-500'
                        : bvrComparison.backtestCohort.expectancyR >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {bvrComparison.backtestCohort.rSampleSize > 0
                      ? `${bvrComparison.backtestCohort.expectancyR > 0 ? '+' : ''}${bvrComparison.backtestCohort.expectancyR}R`
                      : 'N/A'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Avg R: {bvrComparison.backtestCohort.rSampleSize > 0 ? `${bvrComparison.backtestCohort.avgR > 0 ? '+' : ''}${bvrComparison.backtestCohort.avgR}R` : 'N/A'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Max Drawdown (R)</span>
                  <span className="text-base font-extrabold text-rose-400 tabular-nums">
                    {bvrComparison.backtestCohort.rSampleSize > 0
                      ? `-${bvrComparison.backtestCohort.maxDrawdownR ?? 0}R`
                      : 'N/A'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Profit Factor</span>
                  <span className="text-base font-extrabold text-zinc-100 tabular-nums">
                    {bvrComparison.backtestCohort.rSampleSize === 0
                      ? 'N/A'
                      : bvrComparison.backtestCohort.profitFactorR !== null
                      ? bvrComparison.backtestCohort.profitFactorR.toFixed(2)
                      : '∞'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Total: {bvrComparison.backtestCohort.rSampleSize > 0 ? `${bvrComparison.backtestCohort.totalR > 0 ? '+' : ''}${bvrComparison.backtestCohort.totalR}R` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Real */}
            <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <h4 className="text-sm font-bold text-zinc-100">Real (Capital en Vivo)</h4>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900 text-emerald-300 border border-emerald-500/20">
                  N = {bvrComparison.realCohort.totalTrades}
                </span>
              </div>

              {bvrComparison.realCohort.confidenceWarning && (
                <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                  {bvrComparison.realCohort.confidenceWarning}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Win Rate</span>
                  <span className="text-lg font-extrabold text-zinc-100 tabular-nums">
                    {bvrComparison.realCohort.totalTrades > 0 ? `${bvrComparison.realCohort.winRate}%` : 'N/A'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    {bvrComparison.realCohort.winsCount} TP · {bvrComparison.realCohort.lossesCount} SL
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Expectativa</span>
                  <span
                    className={`text-lg font-extrabold tabular-nums ${
                      bvrComparison.realCohort.rSampleSize === 0
                        ? 'text-zinc-500'
                        : bvrComparison.realCohort.expectancyR >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {bvrComparison.realCohort.rSampleSize > 0
                      ? `${bvrComparison.realCohort.expectancyR > 0 ? '+' : ''}${bvrComparison.realCohort.expectancyR}R`
                      : 'N/A'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Avg R: {bvrComparison.realCohort.rSampleSize > 0 ? `${bvrComparison.realCohort.avgR > 0 ? '+' : ''}${bvrComparison.realCohort.avgR}R` : 'N/A'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Max Drawdown (R)</span>
                  <span className="text-base font-extrabold text-rose-400 tabular-nums">
                    {bvrComparison.realCohort.rSampleSize > 0
                      ? `-${bvrComparison.realCohort.maxDrawdownR ?? 0}R`
                      : 'N/A'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Profit Factor</span>
                  <span className="text-base font-extrabold text-zinc-100 tabular-nums">
                    {bvrComparison.realCohort.rSampleSize === 0
                      ? 'N/A'
                      : bvrComparison.realCohort.profitFactorR !== null
                      ? bvrComparison.realCohort.profitFactorR.toFixed(2)
                      : '∞'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Total: {bvrComparison.realCohort.rSampleSize > 0 ? `${bvrComparison.realCohort.totalR > 0 ? '+' : ''}${bvrComparison.realCohort.totalR}R` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Delta / Discrepancy */}
            <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-sky-400" />
                  <h4 className="text-sm font-bold text-zinc-100">Discrepancia (Real - BT)</h4>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900 text-sky-300 border border-sky-500/20">
                  Ratio: {bvrComparison.delta.sampleRatio}x
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Delta Win Rate</span>
                  <span
                    className={`text-lg font-extrabold tabular-nums ${
                      bvrComparison.delta.winRateDelta > 0
                        ? 'text-emerald-400'
                        : bvrComparison.delta.winRateDelta < 0
                        ? 'text-rose-400'
                        : 'text-zinc-400'
                    }`}
                  >
                    {bvrComparison.realCohort.totalTrades > 0 && bvrComparison.backtestCohort.totalTrades > 0
                      ? `${bvrComparison.delta.winRateDelta > 0 ? '+' : ''}${bvrComparison.delta.winRateDelta}%`
                      : 'N/A'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    {bvrComparison.delta.winRateDelta < -5 ? '⚠ Desvío significativo' : 'Dentro de rango'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Delta Expectativa</span>
                  <span
                    className={`text-lg font-extrabold tabular-nums ${
                      bvrComparison.delta.expectancyRDelta > 0
                        ? 'text-emerald-400'
                        : bvrComparison.delta.expectancyRDelta < 0
                        ? 'text-rose-400'
                        : 'text-zinc-400'
                    }`}
                  >
                    {bvrComparison.realCohort.rSampleSize > 0 && bvrComparison.backtestCohort.rSampleSize > 0
                      ? `${bvrComparison.delta.expectancyRDelta > 0 ? '+' : ''}${bvrComparison.delta.expectancyRDelta}R`
                      : 'N/A'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Delta Avg R: {bvrComparison.delta.avgRDelta > 0 ? '+' : ''}{bvrComparison.delta.avgRDelta}R
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Delta Drawdown</span>
                  <span
                    className={`text-base font-extrabold tabular-nums ${
                      bvrComparison.delta.drawdownRDelta > 0
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {bvrComparison.realCohort.rSampleSize > 0 && bvrComparison.backtestCohort.rSampleSize > 0
                      ? `${bvrComparison.delta.drawdownRDelta > 0 ? '+' : ''}${bvrComparison.delta.drawdownRDelta}R`
                      : 'N/A'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    {bvrComparison.delta.drawdownRDelta > 0 ? 'Mayor DD en Real' : 'DD controlado'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Delta Profit Factor</span>
                  <span className="text-base font-extrabold text-zinc-100 tabular-nums">
                    {bvrComparison.delta.profitFactorDelta !== null
                      ? `${bvrComparison.delta.profitFactorDelta > 0 ? '+' : ''}${bvrComparison.delta.profitFactorDelta}`
                      : 'N/A'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    Factor de réplica
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Model Comparisons: Breaker Block, Key Level, BPR */}
          <div className="bg-[#111114] rounded-2xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                  Desglose por Modelo Operativo: Real vs Backtest
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Verifica qué modelos mantienen su ventaja estadística en vivo frente al backtesting.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-900/40">
                    <th className="py-3 px-4">Modelo</th>
                    <th className="py-3 px-3 text-center">N (Real)</th>
                    <th className="py-3 px-3 text-center">WR Real</th>
                    <th className="py-3 px-3 text-center">Exp (Real)</th>
                    <th className="py-3 px-3 text-center">N (BT)</th>
                    <th className="py-3 px-3 text-center">WR BT</th>
                    <th className="py-3 px-3 text-center">Exp (BT)</th>
                    <th className="py-3 px-3 text-center">Delta Exp</th>
                    <th className="py-3 px-4 text-center">Diagnóstico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-xs">
                  {bvrComparison.modelComparisons.map((m) => {
                    const hasBoth = m.realCohort.totalTrades > 0 && m.backtestCohort.totalTrades > 0;
                    return (
                      <tr key={m.model} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4 font-bold text-zinc-200">
                          {m.model}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-zinc-300">
                          {m.realCohort.totalTrades} ({m.realCohort.rSampleSize}R)
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-zinc-200">
                          {m.realCohort.totalTrades > 0 ? `${m.realCohort.winRate}%` : 'N/A'}
                        </td>
                        <td
                          className={`py-3 px-3 text-center font-mono font-bold ${
                            m.realCohort.rSampleSize > 0
                              ? m.realCohort.expectancyR >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                              : 'text-zinc-500'
                          }`}
                        >
                          {m.realCohort.rSampleSize > 0
                            ? `${m.realCohort.expectancyR > 0 ? '+' : ''}${m.realCohort.expectancyR}R`
                            : 'N/A'}
                        </td>

                        <td className="py-3 px-3 text-center font-mono text-zinc-300">
                          {m.backtestCohort.totalTrades} ({m.backtestCohort.rSampleSize}R)
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-zinc-200">
                          {m.backtestCohort.totalTrades > 0 ? `${m.backtestCohort.winRate}%` : 'N/A'}
                        </td>
                        <td
                          className={`py-3 px-3 text-center font-mono font-bold ${
                            m.backtestCohort.rSampleSize > 0
                              ? m.backtestCohort.expectancyR >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                              : 'text-zinc-500'
                          }`}
                        >
                          {m.backtestCohort.rSampleSize > 0
                            ? `${m.backtestCohort.expectancyR > 0 ? '+' : ''}${m.backtestCohort.expectancyR}R`
                            : 'N/A'}
                        </td>

                        <td
                          className={`py-3 px-3 text-center font-mono font-bold ${
                            hasBoth && m.realCohort.rSampleSize > 0 && m.backtestCohort.rSampleSize > 0
                              ? m.delta.expectancyRDelta >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                              : 'text-zinc-500'
                          }`}
                        >
                          {hasBoth && m.realCohort.rSampleSize > 0 && m.backtestCohort.rSampleSize > 0
                            ? `${m.delta.expectancyRDelta > 0 ? '+' : ''}${m.delta.expectancyRDelta}R`
                            : '—'}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {m.hasSufficientData ? (
                            m.delta.expectancyRDelta >= -0.2 ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                Consistente
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/20">
                                Degradado
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                              Muestra &lt; 10
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Window Comparisons: NY Sessions */}
          <div className="bg-[#111114] rounded-2xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                  Desglose por Horario NY: Real vs Backtest
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Compara la fidelidad temporal entre la simulación y las entradas reales según las ventanas institucionales de NY.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-900/40">
                    <th className="py-3 px-4">Ventana Horaria</th>
                    <th className="py-3 px-3 text-center">N (Real)</th>
                    <th className="py-3 px-3 text-center">WR Real</th>
                    <th className="py-3 px-3 text-center">Exp (Real)</th>
                    <th className="py-3 px-3 text-center">N (BT)</th>
                    <th className="py-3 px-3 text-center">WR BT</th>
                    <th className="py-3 px-3 text-center">Exp (BT)</th>
                    <th className="py-3 px-4 text-center">Suficiencia Muestra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-xs">
                  {bvrComparison.windowComparisons.map((w) => (
                    <tr key={w.windowKey} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-bold text-zinc-200">
                        {w.windowLabel}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-zinc-300">
                        {w.realCohort.totalTrades}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-zinc-200">
                        {w.realCohort.totalTrades > 0 ? `${w.realCohort.winRate}%` : 'N/A'}
                      </td>
                      <td
                        className={`py-3 px-3 text-center font-mono font-bold ${
                          w.realCohort.rSampleSize > 0
                            ? w.realCohort.expectancyR >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                            : 'text-zinc-500'
                        }`}
                      >
                        {w.realCohort.rSampleSize > 0
                          ? `${w.realCohort.expectancyR > 0 ? '+' : ''}${w.realCohort.expectancyR}R`
                          : 'N/A'}
                      </td>

                      <td className="py-3 px-3 text-center font-mono text-zinc-300">
                        {w.backtestCohort.totalTrades}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-zinc-200">
                        {w.backtestCohort.totalTrades > 0 ? `${w.backtestCohort.winRate}%` : 'N/A'}
                      </td>
                      <td
                        className={`py-3 px-3 text-center font-mono font-bold ${
                          w.backtestCohort.rSampleSize > 0
                            ? w.backtestCohort.expectancyR >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                            : 'text-zinc-500'
                        }`}
                      >
                        {w.backtestCohort.rSampleSize > 0
                          ? `${w.backtestCohort.expectancyR > 0 ? '+' : ''}${w.backtestCohort.expectancyR}R`
                          : 'N/A'}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {w.hasSufficientData ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            n_R ≥ 10
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            Insuficiente
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Drill-down Table for Backtesting vs Real */}
          <div className="bg-[#111114] rounded-2xl border border-white/[0.08] overflow-hidden space-y-0">
            <div className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-zinc-400" />
                  <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                    Registro de Operaciones para Auditoría ({bvrSupportingTrades.length})
                  </h3>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Filtra por entorno para inspeccionar y auditar operaciones de simulación o vivo individualmente.
                </p>
              </div>

              {/* Environment Filter Selector */}
              <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/[0.08]">
                {[
                  { id: 'All', label: 'Todos' },
                  { id: 'real', label: 'Real' },
                  { id: 'backtest', label: 'Backtest' },
                  { id: 'demo', label: 'Demo' },
                  { id: 'unclassified', label: 'Sin clasificar' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setBvrFilterEnv(tab.id as typeof bvrFilterEnv)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      bvrFilterEnv === tab.id
                        ? theme.activeNavClass
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[720px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-900/40">
                    <th className="py-3 px-4">Fecha / Activo</th>
                    <th className="py-3 px-3">Entorno</th>
                    <th className="py-3 px-3">Lado</th>
                    <th className="py-3 px-3">Modelo</th>
                    <th className="py-3 px-3">Ventana NY</th>
                    <th className="py-3 px-3">Duración</th>
                    <th className="py-3 px-4 text-right">R-Multiple</th>
                    <th className="py-3 px-4 text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-xs">
                  {bvrSupportingTrades.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-zinc-500">
                        No hay operaciones en este entorno de ejecución.
                      </td>
                    </tr>
                  ) : (
                    bvrSupportingTrades.map((t) => {
                      const primaryModel = resolvePrimaryModel(t);
                      const { window } = resolveOperationalWindow(t);
                      const isWin = t.status === 'Win';

                      return (
                        <tr
                          key={t.id}
                          onClick={() => onInspectTrade(t)}
                          className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-zinc-200 flex items-center gap-1.5">
                              {t.symbol}
                              <span className="text-[10px] font-semibold px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">
                                {t.timeframe || '5m'}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                              {t.entryDate.replace('T', ' ').slice(0, 16)}
                            </div>
                          </td>

                          <td className="py-3.5 px-3">
                            <SourceTypeBadge sourceType={t.sourceType} />
                          </td>

                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                t.direction === 'Long'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {t.direction}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 text-zinc-200 font-medium">
                            {primaryModel}
                          </td>

                          <td className="py-3.5 px-3 text-[11px] font-mono text-zinc-400">
                            {window === 'window_1'
                              ? '09:30–10:35'
                              : window === 'window_2'
                              ? '10:35–11:00'
                              : 'Fuera NY'}
                          </td>

                          <td className="py-3.5 px-3 text-zinc-400 font-mono">
                            {t.durationMinutes !== null && t.durationMinutes !== undefined
                              ? `${t.durationMinutes} min`
                              : <span className="text-zinc-600">Sin dato</span>}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold">
                            {t.rUnrecorded ? (
                              <span className="text-zinc-500">Sin R</span>
                            ) : (
                              <span className={t.rMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {t.rMultiple > 0 ? `+${t.rMultiple}` : t.rMultiple}R
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold ${
                                isWin
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                              }`}
                            >
                              {isWin ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {isWin ? 'TP' : 'SL'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Reusable card displaying comprehensive metrics for a single cohort.
 * Shows N, TP/SL, Win Rate, Avg R, Expectancy R, Profit Factor R, and small-sample warnings.
 */
function CohortCard({
  cohort,
  isSelected,
  onSelect,
  accentClass,
  compact = false,
}: {
  cohort: EdgeCohortMetrics;
  isSelected: boolean;
  onSelect: () => void;
  accentClass: string;
  compact?: boolean;
}) {
  const hasTrades = cohort.totalTrades > 0;
  const isLossFree = cohort.lossesCount === 0 && cohort.winsCount > 0;

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
        isSelected
          ? 'bg-zinc-900 border-white/30 shadow-lg ring-1 ring-white/20'
          : 'bg-zinc-900/50 hover:bg-zinc-900/80 border-white/[0.08] hover:border-white/15'
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="font-bold text-sm text-zinc-100">{cohort.label}</span>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/[0.06] shrink-0">
            N = {cohort.totalTrades}
          </span>
        </div>

        {/* Small sample warning badge */}
        {cohort.confidenceWarning && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg mb-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="leading-tight">{cohort.confidenceWarning}</span>
          </div>
        )}

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 my-2">
          <div>
            <span className="text-[10px] text-zinc-500 block uppercase font-semibold">
              Win Rate
            </span>
            <span className="text-base font-extrabold text-zinc-100 tabular-nums">
              {hasTrades ? `${cohort.winRate}%` : 'N/A'}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5 tabular-nums">
              {cohort.winsCount} TP · {cohort.lossesCount} SL
            </span>
          </div>

          <div>
            <span className="text-[10px] text-zinc-500 block uppercase font-semibold">
              Expectativa
            </span>
            <span
              className={`text-base font-extrabold tabular-nums ${
                cohort.rSampleSize === 0
                  ? 'text-zinc-500'
                  : cohort.expectancyR >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {cohort.rSampleSize > 0
                ? `${cohort.expectancyR > 0 ? '+' : ''}${cohort.expectancyR}R`
                : 'N/A'}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5 tabular-nums">
              Avg R: {cohort.rSampleSize > 0 ? `${cohort.avgR > 0 ? '+' : ''}${cohort.avgR}R` : 'N/A'}
            </span>
          </div>

          <div className={compact ? 'col-span-2 sm:col-span-1' : ''}>
            <span className="text-[10px] text-zinc-500 block uppercase font-semibold">
              Profit Factor
            </span>
            <span className="text-base font-extrabold text-zinc-100 tabular-nums">
              {cohort.rSampleSize === 0
                ? 'N/A'
                : isLossFree
                ? '∞ (0 SL)'
                : cohort.profitFactorR !== null
                ? cohort.profitFactorR.toFixed(2)
                : 'N/A'}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5 tabular-nums">
              Total R: {cohort.rSampleSize > 0 ? `${cohort.totalR > 0 ? '+' : ''}${cohort.totalR}R` : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-white/[0.05] mt-2 flex items-center justify-between text-[11px]">
        <span className="text-zinc-500">
          {isSelected ? '✓ Filtrando tabla' : 'Clic para filtrar'}
        </span>
        <span className={accentClass}>
          {hasTrades ? `${cohort.totalTrades} ops →` : ''}
        </span>
      </div>
    </div>
  );
}

/**
 * Visual badge for the execution environment of a trade.
 */
function SourceTypeBadge({ sourceType }: { sourceType?: Trade['sourceType'] }) {
  switch (sourceType) {
    case 'real':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Real
        </span>
      );
    case 'backtest':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20">
          Backtest
        </span>
      );
    case 'demo':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
          Demo
        </span>
      );
    case 'unclassified':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-white/[0.06]">
          Sin clasificar
        </span>
      );
  }
}
