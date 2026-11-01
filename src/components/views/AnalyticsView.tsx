"use client";

import React, { useState, useMemo } from 'react';
import { useTrading } from '@/context/TradingContext';
import type { Trade } from '@/types/trading';
import {
  calculateModelComparison,
  calculateWindowComparison,
  calculateDurationBreakdown,
  calculateWeekdayBreakdown,
  calculateSymbolBreakdown,
  calculatePsychologyBreakdown,
  filterAnalyticsTrades,
  resolvePrimaryModel,
  resolveOperationalWindow,
  INITIAL_ANALYTICS_FILTERS,
  type AnalyticsFilters,
  type EdgeCohortMetrics,
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
} from 'lucide-react';

interface AnalyticsViewProps {
  onInspectTrade: (trade: Trade) => void;
}

type DimensionTab = 'duration' | 'weekday' | 'symbol' | 'psychology';

export function AnalyticsView({ onInspectTrade }: AnalyticsViewProps) {
  const { trades, playbooks, theme } = useTrading();

  const [filters, setFilters] = useState<AnalyticsFilters>(INITIAL_ANALYTICS_FILTERS);
  const [selectedCohort, setSelectedCohort] = useState<EdgeCohortMetrics | null>(null);
  const [activeDimension, setActiveDimension] = useState<DimensionTab>('duration');

  // Available symbols for the filter dropdown
  const availableSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) {
      if (t.symbol) set.add(t.symbol.trim().toUpperCase());
    }
    return Array.from(set).sort();
  }, [trades]);

  // Trades filtered by the top filter bar
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

  // Drill-down trades list (either selected cohort's trades or all filtered trades)
  const supportingTrades = useMemo(() => {
    if (selectedCohort) {
      const idSet = new Set(selectedCohort.tradeIds);
      return filteredTrades.filter((t) => idSet.has(t.id));
    }
    return filteredTrades;
  }, [filteredTrades, selectedCohort]);

  const hasActiveFilters =
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.symbol !== 'All' ||
    filters.model !== 'All' ||
    filters.window !== 'All';

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

  return (
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
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
            <option value="All">Modelo Principal: Todos</option>
            <option value="Breaker Block">Breaker Block</option>
            <option value="Key Level">Key Level</option>
            <option value="BPR (Balanced Price Range)">BPR</option>
            <option value="Sin modelo registrado">Sin modelo registrado</option>
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
          {/* Card Breaker Block */}
          <CohortCard
            cohort={modelComparison.breakerBlock}
            isSelected={selectedCohort?.key === modelComparison.breakerBlock.key}
            onSelect={() => handleSelectCohort(modelComparison.breakerBlock)}
            accentClass={theme.accentTextClass}
          />

          {/* Card Key Level */}
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
                      ? `${theme.activeNavClass}`
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
                  <td colSpan={8} className="py-8 text-center text-zinc-500">
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

      {/* Historical Playbooks Section (if any exist, strictly without creation form) */}
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
                cohort.expectancyR >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {cohort.rSampleSize > 0
                ? `${cohort.expectancyR > 0 ? '+' : ''}${cohort.expectancyR}R`
                : 'N/A'}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5 tabular-nums">
              Avg R: {cohort.avgR > 0 ? `+${cohort.avgR}` : cohort.avgR}R
            </span>
          </div>

          <div className={compact ? 'col-span-2 sm:col-span-1' : ''}>
            <span className="text-[10px] text-zinc-500 block uppercase font-semibold">
              Profit Factor
            </span>
            <span className="text-base font-extrabold text-zinc-100 tabular-nums">
              {isLossFree
                ? '∞ (0 SL)'
                : cohort.profitFactorR !== null
                ? cohort.profitFactorR.toFixed(2)
                : 'N/A'}
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5 tabular-nums">
              Total R: {cohort.totalR > 0 ? `+${cohort.totalR}` : cohort.totalR}R
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
