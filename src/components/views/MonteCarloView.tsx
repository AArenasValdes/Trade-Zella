"use client";

import React, { useState, useMemo } from 'react';
import { useTrading } from '@/context/TradingContext';
import type { TradeSourceType } from '@/types/trading';
import {
  runMonteCarloSimulation,
  filterMonteCarloTrades,
  normalizeSeed,
  MONTE_CARLO_HORIZONS,
  MONTE_CARLO_ITERATIONS_OPTIONS,
  DEFAULT_MONTE_CARLO_HORIZON,
  DEFAULT_MONTE_CARLO_ITERATIONS,
  DEFAULT_MONTE_CARLO_SEED,
} from '@/services/monte-carlo-service';
import { PRIMARY_ENTRY_MODELS } from '@/services/edge-analytics-service';
import {
  Dices,
  Shuffle,
  ShieldAlert,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ComposedChart,
} from 'recharts';

interface TrajectoryTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color?: string;
  }>;
  label?: number;
}

function TrajectoryTooltip({ active, payload, label }: TrajectoryTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const p95 = payload.find((p) => p.name === 'p95')?.value;
  const p75 = payload.find((p) => p.name === 'p75')?.value;
  const p50 = payload.find((p) => p.name === 'p50')?.value;
  const p25 = payload.find((p) => p.name === 'p25')?.value;
  const p5 = payload.find((p) => p.name === 'p5')?.value;

  return (
    <div className="bg-zinc-950/95 border border-zinc-800 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 backdrop-blur-md min-w-[190px]">
      <div className="font-semibold text-zinc-300 border-b border-zinc-800/80 pb-1 flex items-center justify-between">
        <span>Operación #{label}</span>
        <span className="text-[10px] text-zinc-500 font-mono">Dispersión en R</span>
      </div>
      <div className="space-y-1 font-mono pt-0.5">
        <div className={`flex justify-between items-center ${p95 !== undefined && p95 < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
          <span className="text-[11px] text-zinc-400">P95 (Favorable 5%):</span>
          <span className="font-bold">{p95 !== undefined ? `${p95 >= 0 ? '+' : ''}${p95.toFixed(2)}R` : '-'}</span>
        </div>
        {p75 !== undefined && (
          <div className="flex justify-between items-center text-emerald-300/80">
            <span className="text-[11px] text-zinc-400">P75:</span>
            <span>{p75 >= 0 ? '+' : ''}{p75.toFixed(2)}R</span>
          </div>
        )}
        <div className="flex justify-between items-center text-cyan-400 font-bold border-y border-white/[0.06] py-0.5">
          <span className="text-[11px] text-zinc-300">P50 (Mediana):</span>
          <span>{p50 !== undefined ? `${p50 >= 0 ? '+' : ''}${p50.toFixed(2)}R` : '-'}</span>
        </div>
        {p25 !== undefined && (
          <div className="flex justify-between items-center text-rose-300/80">
            <span className="text-[11px] text-zinc-400">P25:</span>
            <span>{p25 >= 0 ? '+' : ''}{p25.toFixed(2)}R</span>
          </div>
        )}
        <div className="flex justify-between items-center text-rose-400">
          <span className="text-[11px] text-zinc-400">P5 (Adverso 5%):</span>
          <span className="font-bold">{p5 !== undefined ? `${p5 >= 0 ? '+' : ''}${p5.toFixed(2)}R` : '-'}</span>
        </div>
      </div>
    </div>
  );
}

interface HistogramTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      label: string;
      count: number;
      percentage: number;
      minR: number;
      maxR: number;
    };
  }>;
}

function HistogramTooltip({ active, payload }: HistogramTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-zinc-950/95 border border-zinc-800 p-3 rounded-xl shadow-2xl text-xs space-y-1 backdrop-blur-md">
      <div className="font-semibold text-zinc-200 border-b border-zinc-800/80 pb-1">
        Rango: <span className="font-mono text-cyan-400">{data.label}</span>
      </div>
      <div className="flex justify-between gap-4 font-mono pt-1 text-zinc-400">
        <span>Frecuencia:</span>
        <span className="font-bold text-zinc-100">{data.count} simulaciones</span>
      </div>
      <div className="flex justify-between gap-4 font-mono text-zinc-400">
        <span>Probabilidad:</span>
        <span className="font-bold text-emerald-400">{data.percentage}%</span>
      </div>
    </div>
  );
}

export function MonteCarloView() {
  const { trades } = useTrading();

  // Control state
  const [environment, setEnvironment] = useState<TradeSourceType>('real');
  const [selectedModel, setSelectedModel] = useState<string>('All');
  const [horizon, setHorizon] = useState<number>(DEFAULT_MONTE_CARLO_HORIZON);
  const [iterations, setIterations] = useState<number>(DEFAULT_MONTE_CARLO_ITERATIONS);
  const [seedInput, setSeedInput] = useState<string>(String(DEFAULT_MONTE_CARLO_SEED));

  // Count available valid R trades in each environment for the selector pills
  const envCounts = useMemo(() => {
    const counts: Record<TradeSourceType, number> = {
      real: 0,
      demo: 0,
      backtest: 0,
      unclassified: 0,
    };
    for (const env of ['real', 'demo', 'backtest', 'unclassified'] as TradeSourceType[]) {
      const { validTrades } = filterMonteCarloTrades(trades, env, 'All');
      counts[env] = validTrades.length;
    }
    return counts;
  }, [trades]);

  // Execute simulation pure function deterministically
  const simulation = useMemo(() => {
    return runMonteCarloSimulation(trades, {
      environment,
      model: selectedModel,
      horizon,
      iterations,
      seed: normalizeSeed(seedInput),
    });
  }, [trades, environment, selectedModel, horizon, iterations, seedInput]);

  // Augmented trajectory points with range tuple [p5, p95] for Recharts range area
  const chartTrajectory = useMemo(() => {
    if (simulation.status !== 'success') return [];
    return simulation.trajectory.map((point) => ({
      ...point,
      p5ToP95Range: [point.p5, point.p95] as [number, number],
    }));
  }, [simulation]);

  const handleRegenerateSeed = () => {
    const newSeed = Math.floor(Math.random() * 90000) + 10000;
    setSeedInput(String(newSeed));
  };

  const handleResetSeed = () => {
    setSeedInput(String(DEFAULT_MONTE_CARLO_SEED));
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold flex items-center gap-1">
              <Dices className="w-3 h-3" /> MARTIN OS V4a {'//'} MONTE CARLO
            </span>
            <span className="text-xs text-zinc-500 font-mono">Bootstrap Remuestreo</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-100 tracking-tight">
            Simulador Monte Carlo en R
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-3xl leading-relaxed">
            Explora la variabilidad de secuencias de trading posibles mediante remuestreo con reemplazo
            a partir de tus operaciones registradas. Determina percentiles de rendimiento, estrés de drawdown
            y límites de rachas de pérdidas sin suposiciones de capital inventado.
          </p>
        </div>
      </div>

      {/* Control Configuration Bar */}
      <div className="bg-[#111114] rounded-2xl p-4 sm:p-5 border border-white/[0.08] shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
          {/* 1. Selector de Entorno */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Entorno Operativo
            </label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as TradeSourceType)}
              className="w-full bg-zinc-900 border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 focus:outline-none focus:border-cyan-500 transition-colors"
            >
              <option value="real">Real ({envCounts.real} ops válidas)</option>
              <option value="backtest">Backtesting ({envCounts.backtest} ops válidas)</option>
              <option value="demo">Demo ({envCounts.demo} ops válidas)</option>
              <option value="unclassified">Sin clasificar ({envCounts.unclassified} ops válidas)</option>
            </select>
          </div>

          {/* 2. Selector de Modelo */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Modelo de Entrada
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-zinc-900 border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 focus:outline-none focus:border-cyan-500 transition-colors"
            >
              <option value="All">Todos los modelos</option>
              {PRIMARY_ENTRY_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="Sin modelo registrado">Sin modelo registrado</option>
            </select>
          </div>

          {/* 3. Horizonte de Operaciones */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Horizonte (Trades)
            </label>
            <div className="grid grid-cols-4 gap-1">
              {MONTE_CARLO_HORIZONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    horizon === h
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
                      : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.06]'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Cantidad de Iteraciones */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Simulaciones
            </label>
            <select
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 focus:outline-none focus:border-cyan-500 transition-colors"
            >
              {MONTE_CARLO_ITERATIONS_OPTIONS.map((it) => (
                <option key={it} value={it}>
                  {it} iteraciones
                </option>
              ))}
            </select>
          </div>

          {/* 5. Semilla Aleatoria Reproducible */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
              <span>Semilla (Seed)</span>
              <span className="text-[10px] text-zinc-500 font-normal">Determinista</span>
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                placeholder="42"
                className="w-full bg-zinc-900 border border-white/[0.1] rounded-xl px-3 py-2 text-xs font-mono font-semibold text-zinc-200 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={handleRegenerateSeed}
                title="Generar nueva semilla determinista"
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
              >
                <Shuffle className="w-4 h-4" />
              </button>
              <button
                onClick={handleResetSeed}
                title="Restablecer semilla predeterminada (42)"
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Status bar info */}
        <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between text-[11px] text-zinc-400 gap-2">
          <div className="flex items-center gap-3">
            <span>
              Entorno activo:{' '}
              <strong className="text-zinc-200 uppercase font-mono">{environment}</strong>
            </span>
            <span>•</span>
            <span>
              Muestra evaluada:{' '}
              <strong className="text-cyan-400 font-mono">
                {simulation.sampleSize} ops con R
              </strong>
            </span>
            {simulation.status === 'success' && (
              <>
                <span>•</span>
                <span>
                  Tiempo de cálculo:{' '}
                  <span className="text-zinc-300 font-mono">{simulation.executionTimeMs} ms</span>
                </span>
              </>
            )}
          </div>
          <div className="text-[11px] text-zinc-500 italic">
            Remuestreo determinista: idéntica semilla y parámetros reproducen siempre el mismo resultado.
          </div>
        </div>
      </div>

      {/* STATE A: Datos Insuficientes (< 20 operaciones válidas) */}
      {simulation.status === 'insufficient_data' && (
        <div className="bg-[#111114] rounded-2xl p-6 sm:p-8 border border-amber-500/20 bg-gradient-to-b from-amber-500/[0.03] to-transparent space-y-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-zinc-100">
                  Datos Insuficientes para Simulación Probabilística
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {simulation.sampleSize} / {simulation.minRequired} operaciones
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-3xl">
                {simulation.reason}
              </p>
              <p className="text-xs text-amber-300/90 font-medium">
                {simulation.guidanceMessage}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/[0.06]">
            <div className="bg-zinc-900/60 p-4 rounded-xl border border-white/[0.04] space-y-1">
              <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider block">
                Operaciones en el entorno
              </span>
              <div className="text-xl font-bold font-mono text-zinc-100">
                {simulation.totalCohortTrades}
              </div>
              <p className="text-[11px] text-zinc-500">
                Total de operaciones registradas bajo el entorno &quot;{simulation.environment}&quot;.
              </p>
            </div>

            <div className="bg-zinc-900/60 p-4 rounded-xl border border-white/[0.04] space-y-1">
              <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider block">
                Operaciones con R verificado
              </span>
              <div className="text-xl font-bold font-mono text-amber-400">
                {simulation.sampleSize}
              </div>
              <p className="text-[11px] text-zinc-500">
                Excluye operaciones con R sin registrar o con conflictos de coherencia.
              </p>
            </div>

            <div className="bg-zinc-900/60 p-4 rounded-xl border border-white/[0.04] space-y-1">
              <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider block">
                Mínimo técnico exigido
              </span>
              <div className="text-xl font-bold font-mono text-cyan-400">
                {simulation.minRequired} ops
              </div>
              <p className="text-[11px] text-zinc-500">
                Mínimo operativo de visualización técnica; no garantiza significancia estadística ni ausencia de sesgo muestral.
              </p>
            </div>
          </div>

          <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-white/[0.04] text-[11px] text-zinc-400 space-y-1">
            <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Regla de significancia estadística:
            </div>
            <p className="leading-relaxed">
              {simulation.sampleNotice}
            </p>
          </div>
        </div>
      )}

      {/* STATE B: Simulación Exitosa (>= 20 operaciones) */}
      {simulation.status === 'success' && (
        <div className="space-y-6">
          {/* 1. KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Resultado Acumulado (R) */}
            <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-zinc-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Resultado Acumulado (R)
                  </span>
                  <Activity className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
                      simulation.metrics.cumulativeR.p50 >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {simulation.metrics.cumulativeR.p50 >= 0 ? '+' : ''}
                    {simulation.metrics.cumulativeR.p50.toFixed(2)}R
                  </span>
                  <span className="text-xs font-semibold text-zinc-400">Mediana (P50)</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-1 font-mono text-[11px]">
                <div className="flex justify-between text-zinc-400">
                  <span>P5 (Adverso 5%):</span>
                  <span className={simulation.metrics.cumulativeR.p5 >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {simulation.metrics.cumulativeR.p5 >= 0 ? '+' : ''}
                    {simulation.metrics.cumulativeR.p5.toFixed(2)}R
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>P95 (Favorable 5%):</span>
                  <span className={`${simulation.metrics.cumulativeR.p95 >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold`}>
                    {simulation.metrics.cumulativeR.p95 >= 0 ? '+' : ''}
                    {simulation.metrics.cumulativeR.p95.toFixed(2)}R
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400 pt-0.5 border-t border-white/[0.04]">
                  <span>Prob. R positivo:</span>
                  <span className="text-cyan-400 font-bold">
                    {simulation.metrics.cumulativeR.probPositiveR}%
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Máximo Drawdown en R */}
            <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-zinc-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Máximo Drawdown en R
                  </span>
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-rose-400">
                    -{simulation.metrics.maxDrawdownR.p50.toFixed(2)}R
                  </span>
                  <span className="text-xs font-semibold text-zinc-400">Mediana (P50)</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-1 font-mono text-[11px]">
                <div className="flex justify-between text-zinc-400">
                  <span>P95 (Stress Test):</span>
                  <span className="text-rose-400 font-bold">
                    -{simulation.metrics.maxDrawdownR.p95.toFixed(2)}R
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Peor DD simulado:</span>
                  <span className="text-rose-500 font-bold">
                    -{simulation.metrics.maxDrawdownR.worst.toFixed(2)}R
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400 pt-0.5 border-t border-white/[0.04]">
                  <span>P5 (Bajo estrés):</span>
                  <span className="text-zinc-300">
                    -{simulation.metrics.maxDrawdownR.p5.toFixed(2)}R
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Rachas de Pérdidas */}
            <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-zinc-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Racha Máx. de Pérdidas
                  </span>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-amber-400">
                    {simulation.metrics.maxLossStreak.p50}
                  </span>
                  <span className="text-xs font-semibold text-zinc-400">SL seguidos (P50)</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-1 font-mono text-[11px]">
                <div className="flex justify-between text-zinc-400">
                  <span>P95 (Escenario Adverso):</span>
                  <span className="text-amber-400 font-bold">
                    {simulation.metrics.maxLossStreak.p95} SL seguidos
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Peor racha observada:</span>
                  <span className="text-rose-400 font-bold">
                    {simulation.metrics.maxLossStreak.worst} SL seguidos
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400 pt-0.5 border-t border-white/[0.04]">
                  <span>Promedio de racha:</span>
                  <span className="text-zinc-300">
                    {simulation.metrics.maxLossStreak.mean} SL
                  </span>
                </div>
              </div>
            </div>

            {/* Card 4: Base Muestral & Calibración */}
            <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-zinc-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Muestra & Edge de Origen
                  </span>
                  <Layers className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-zinc-100">
                    {simulation.sampleSize}
                  </span>
                  <span className="text-xs font-semibold text-zinc-400">ops registradas</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.06] space-y-1 font-mono text-[11px]">
                <div className="flex justify-between text-zinc-400">
                  <span>Win Rate base:</span>
                  <span className="text-emerald-400 font-bold">
                    {simulation.sampleStats.winRate}%
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Expectativa base:</span>
                  <span className="text-cyan-400 font-bold">
                    {simulation.sampleStats.expectancyR >= 0 ? '+' : ''}
                    {simulation.sampleStats.expectancyR}R / trade
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400 pt-0.5 border-t border-white/[0.04]">
                  <span>Semilla activa:</span>
                  <span className="text-zinc-300 font-mono">#{simulation.seed}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Gráfico 1: Cono de Incertidumbre Monte Carlo */}
          <div className="bg-[#111114] rounded-2xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  Cono de Dispersión y Trayectorias en R
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Evolución proyectada a lo largo de un horizonte de {simulation.config.horizon} operaciones.
                  La banda ilustra el rango P5–P95 (90% de los escenarios simulados).
                </p>
              </div>
              <div className="flex items-center gap-3 font-mono text-xs text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> P95
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> P50 (Mediana)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> P5
                </span>
              </div>
            </div>

            <div className="h-80 sm:h-96 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartTrajectory}
                  margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="mcBandGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis
                    dataKey="tradeIndex"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    tickFormatter={(val) => `#${val}`}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val}R`}
                  />
                  <Tooltip content={<TrajectoryTooltip />} />
                  {/* Área de rango sombreada estrictamente entre P5 y P95 */}
                  <Area
                    type="monotone"
                    dataKey="p5ToP95Range"
                    stroke="none"
                    fill="url(#mcBandGradient)"
                    fillOpacity={1}
                    isAnimationActive={false}
                    name="intervaloP5P95"
                  />
                  <Line
                    type="monotone"
                    dataKey="p95"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    name="p95"
                  />
                  <Line
                    type="monotone"
                    dataKey="p50"
                    stroke="#22d3ee"
                    strokeWidth={2.8}
                    dot={false}
                    name="p50"
                  />
                  <Line
                    type="monotone"
                    dataKey="p5"
                    stroke="#f43f5e"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    name="p5"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. Gráfico 2: Histograma de Distribución Final en R */}
          <div className="bg-[#111114] rounded-2xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Distribución de Frecuencia del Resultado Final
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Histograma de los resultados acumulados tras {simulation.config.horizon} operaciones en {simulation.config.iterations} iteraciones.
                </p>
              </div>
              <div className="text-xs font-mono text-zinc-400">
                Media:{' '}
                <strong className={simulation.metrics.cumulativeR.mean >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {simulation.metrics.cumulativeR.mean >= 0 ? '+' : ''}
                  {simulation.metrics.cumulativeR.mean.toFixed(2)}R
                </strong>{' '}
                ± {simulation.metrics.cumulativeR.stdDev.toFixed(2)}R
              </div>
            </div>

            <div className="h-64 sm:h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={simulation.distribution}
                  margin={{ top: 10, right: 15, left: -10, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    tick={{ fill: '#71717a', fontSize: 10 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    tickFormatter={(val) => `${val}%`}
                  />
                  <Tooltip content={<HistogramTooltip />} />
                  <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                    {simulation.distribution.map((entry, index) => {
                      const isPositive = entry.minR >= 0;
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={isPositive ? '#10b981' : '#f43f5e'}
                          fillOpacity={isPositive ? 0.75 : 0.65}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. Tabla Detallada de Percentiles y Escenarios de Riesgo */}
          <div className="bg-[#111114] rounded-2xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Tabla de Percentiles y Escenarios de Riesgo
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-zinc-400 font-mono text-[11px]">
                    <th className="py-2.5 px-3">Métrica</th>
                    <th className="py-2.5 px-3 text-rose-400">P5 (Pesimista)</th>
                    <th className="py-2.5 px-3 text-zinc-300">P25</th>
                    <th className="py-2.5 px-3 text-cyan-400 font-bold">P50 (Mediana)</th>
                    <th className="py-2.5 px-3 text-zinc-300">P75</th>
                    <th className="py-2.5 px-3 text-emerald-400">P95 (Optimista)</th>
                    <th className="py-2.5 px-3 text-zinc-400">Media</th>
                    <th className="py-2.5 px-3 text-zinc-500">Mín / Peor</th>
                    <th className="py-2.5 px-3 text-zinc-500">Máx / Mejor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] font-mono">
                  {/* Fila 1: Resultado Final en R */}
                  <tr className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 font-sans font-semibold text-zinc-200">
                      Resultado Final en R
                    </td>
                    <td className="py-3 px-3 text-rose-400 font-bold">
                      {simulation.metrics.cumulativeR.p5 >= 0 ? '+' : ''}
                      {simulation.metrics.cumulativeR.p5.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-zinc-300">
                      {simulation.metrics.cumulativeR.p25 >= 0 ? '+' : ''}
                      {simulation.metrics.cumulativeR.p25.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-cyan-400 font-bold text-sm">
                      {simulation.metrics.cumulativeR.p50 >= 0 ? '+' : ''}
                      {simulation.metrics.cumulativeR.p50.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-zinc-300">
                      {simulation.metrics.cumulativeR.p75 >= 0 ? '+' : ''}
                      {simulation.metrics.cumulativeR.p75.toFixed(2)}R
                    </td>
                    <td className={`py-3 px-3 ${simulation.metrics.cumulativeR.p95 >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold`}>
                      {simulation.metrics.cumulativeR.p95 >= 0 ? '+' : ''}
                      {simulation.metrics.cumulativeR.p95.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-zinc-400">
                      {simulation.metrics.cumulativeR.mean >= 0 ? '+' : ''}
                      {simulation.metrics.cumulativeR.mean.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-zinc-500">
                      {simulation.metrics.cumulativeR.min.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-zinc-500">
                      {simulation.metrics.cumulativeR.max >= 0 ? '+' : ''}
                      {simulation.metrics.cumulativeR.max.toFixed(2)}R
                    </td>
                  </tr>

                  {/* Fila 2: Máximo Drawdown en R */}
                  <tr className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 font-sans font-semibold text-zinc-200">
                      Máximo Drawdown en R
                    </td>
                    <td className="py-3 px-3 text-zinc-300">
                      -{simulation.metrics.maxDrawdownR.p5.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-zinc-400">-</td>
                    <td className="py-3 px-3 text-rose-400 font-bold text-sm">
                      -{simulation.metrics.maxDrawdownR.p50.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-zinc-400">-</td>
                    <td className="py-3 px-3 text-rose-500 font-bold">
                      -{simulation.metrics.maxDrawdownR.p95.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-zinc-400">
                      -{simulation.metrics.maxDrawdownR.mean.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-rose-500 font-bold">
                      -{simulation.metrics.maxDrawdownR.worst.toFixed(2)}R
                    </td>
                    <td className="py-3 px-3 text-zinc-500">
                      -{simulation.metrics.maxDrawdownR.p5.toFixed(2)}R
                    </td>
                  </tr>

                  {/* Fila 3: Racha de Pérdidas Consecutivas */}
                  <tr className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 font-sans font-semibold text-zinc-200">
                      Racha Máxima de Pérdidas
                    </td>
                    <td className="py-3 px-3 text-zinc-400">-</td>
                    <td className="py-3 px-3 text-zinc-400">-</td>
                    <td className="py-3 px-3 text-amber-400 font-bold text-sm">
                      {simulation.metrics.maxLossStreak.p50} SL
                    </td>
                    <td className="py-3 px-3 text-zinc-400">-</td>
                    <td className="py-3 px-3 text-rose-400 font-bold">
                      {simulation.metrics.maxLossStreak.p95} SL
                    </td>
                    <td className="py-3 px-3 text-zinc-400">
                      {simulation.metrics.maxLossStreak.mean} SL
                    </td>
                    <td className="py-3 px-3 text-rose-500 font-bold">
                      {simulation.metrics.maxLossStreak.worst} SL
                    </td>
                    <td className="py-3 px-3 text-zinc-500">1 SL</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. Avisos de Integridad y Disclaimers Oficiales */}
          <div className="bg-[#111114] rounded-2xl p-5 border border-white/[0.08] space-y-3">
            <div className="flex items-center gap-2 text-zinc-300 font-bold text-xs uppercase tracking-wider">
              <HelpCircle className="w-4 h-4 text-cyan-400" />
              Aviso Metodológico y Reglas de Integridad
            </div>
            <div className="text-xs text-zinc-400 space-y-2 leading-relaxed">
              <p>
                {simulation.disclaimer}
              </p>
              <p className="text-[11px] text-zinc-500 border-t border-white/[0.06] pt-2">
                <strong>Nota sobre significancia:</strong> {simulation.sampleNotice}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
