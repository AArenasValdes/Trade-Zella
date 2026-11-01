import type { Trade, TradeSourceType } from '../types/trading.ts';
import { isTradeIncludedInAggregates, hasValidRMultiple } from './financial-engine.ts';
import { resolvePrimaryModel } from './edge-analytics-service.ts';

export const MIN_MONTE_CARLO_SAMPLE_SIZE = 20;
export const DEFAULT_MONTE_CARLO_HORIZON = 50;
export const DEFAULT_MONTE_CARLO_ITERATIONS = 1000;
export const DEFAULT_MONTE_CARLO_SEED = 42;

export const MONTE_CARLO_HORIZONS = [20, 50, 100, 200] as const;
export const MONTE_CARLO_ITERATIONS_OPTIONS = [500, 1000, 2500] as const;

export interface MonteCarloSimulationConfig {
  environment: TradeSourceType;
  model: string; // 'All' | 'Breaker Block' | 'Key Level' | 'BPR (Balanced Price Range)' | 'Sin modelo registrado'
  horizon: number;
  iterations: number;
  seed: number;
}

export interface MonteCarloTrajectoryPoint {
  tradeIndex: number;
  p5: number;
  p25: number;
  p50: number; // Median
  p75: number;
  p95: number;
  mean: number;
}

export interface DistributionBucket {
  bucketIndex: number;
  label: string;
  minR: number;
  maxR: number;
  count: number;
  percentage: number;
}

export interface MonteCarloMetrics {
  cumulativeR: {
    p5: number;
    p25: number;
    p50: number; // median
    p75: number;
    p95: number;
    mean: number;
    min: number;
    max: number;
    stdDev: number;
    probPositiveR: number; // % iterations where final R > 0
  };
  maxDrawdownR: {
    p5: number; // low-stress scenario (lowest DD)
    p50: number; // median max DD
    p95: number; // stress scenario (95th percentile worst DD)
    worst: number; // maximum observed DD
    mean: number;
  };
  maxLossStreak: {
    p50: number; // median max consecutive losses
    p95: number; // stress consecutive losses
    worst: number;
    mean: number;
  };
}

export interface MonteCarloInsufficientDataResult {
  status: 'insufficient_data';
  sampleSize: number;
  minRequired: number;
  totalCohortTrades: number;
  environment: TradeSourceType;
  model: string;
  reason: string;
  guidanceMessage: string;
  sampleNotice: string;
  disclaimer: string;
}

export interface MonteCarloSuccessResult {
  status: 'success';
  config: MonteCarloSimulationConfig;
  sampleSize: number;
  totalCohortTrades: number;
  sampleStats: {
    winRate: number;
    expectancyR: number;
    avgWinR: number;
    avgLossR: number;
    profitFactorR: number | null;
  };
  metrics: MonteCarloMetrics;
  trajectory: MonteCarloTrajectoryPoint[];
  distribution: DistributionBucket[];
  seed: number;
  executionTimeMs: number;
  sampleNotice: string;
  disclaimer: string;
}

export type MonteCarloSimulationResult =
  | MonteCarloInsufficientDataResult
  | MonteCarloSuccessResult;

/**
 * Normalizes an arbitrary seed into a valid positive 32-bit unsigned integer.
 */
export function normalizeSeed(seed: number | string | undefined | null): number {
  if (typeof seed === 'string') {
    let hash = 0;
    const trimmed = seed.trim();
    if (!trimmed) return DEFAULT_MONTE_CARLO_SEED;
    const numericParsed = Number(trimmed);
    if (Number.isFinite(numericParsed)) {
      return Math.abs(Math.floor(numericParsed)) || DEFAULT_MONTE_CARLO_SEED;
    }
    for (let i = 0; i < trimmed.length; i++) {
      hash = ((hash << 5) - hash + trimmed.charCodeAt(i)) | 0;
    }
    return (hash >>> 0) || DEFAULT_MONTE_CARLO_SEED;
  }
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return (Math.abs(Math.floor(seed)) >>> 0) || DEFAULT_MONTE_CARLO_SEED;
  }
  return DEFAULT_MONTE_CARLO_SEED;
}

/**
 * Mulberry32 deterministic pseudo-random number generator.
 * Fast, 32-bit, uniform distribution, and completely reproducible.
 */
export function createMulberry32(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return function next(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Filters trades strictly by environment and operational model,
 * enforcing data integrity (no conflicts and valid R-multiple).
 */
export function filterMonteCarloTrades(
  trades: readonly Trade[],
  environment: TradeSourceType,
  model: string
): {
  validTrades: Trade[];
  totalCohortTrades: number;
} {
  // Step 1: Environment strict isolation - never mix environments
  const cohortTrades = trades.filter((t) => {
    const tradeEnv: TradeSourceType = t.sourceType || 'unclassified';
    if (tradeEnv !== environment) return false;

    if (model && model !== 'All') {
      const primaryModel = resolvePrimaryModel(t);
      if (primaryModel !== model) return false;
    }

    return true;
  });

  // Step 2: Strict integrity check - only non-conflicted trades with valid numeric R
  const validTrades = cohortTrades.filter((t) => {
    if (!isTradeIncludedInAggregates(t)) return false;
    if (!hasValidRMultiple(t)) return false;
    return true;
  });

  return {
    validTrades,
    totalCohortTrades: cohortTrades.length,
  };
}

/**
 * Calculates a specific percentile (0 - 100) from a sorted array of numbers
 * using linear interpolation.
 */
export function calculatePercentile(sortedValues: readonly number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  if (p <= 0) return sortedValues[0];
  if (p >= 100) return sortedValues[sortedValues.length - 1];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Builds a histogram distribution of values into uniform buckets.
 */
export function buildDistributionBuckets(
  values: readonly number[],
  numBuckets = 12
): DistributionBucket[] {
  if (values.length === 0) return [];

  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);

  if (minVal === maxVal) {
    minVal -= 1;
    maxVal += 1;
  }

  const range = maxVal - minVal;
  const bucketSize = range / numBuckets;
  const buckets: DistributionBucket[] = [];

  for (let i = 0; i < numBuckets; i++) {
    const bucketMin = minVal + i * bucketSize;
    const bucketMax = minVal + (i + 1) * bucketSize;
    const label = `${bucketMin >= 0 ? '+' : ''}${bucketMin.toFixed(1)}R a ${bucketMax >= 0 ? '+' : ''}${bucketMax.toFixed(1)}R`;

    buckets.push({
      bucketIndex: i,
      label,
      minR: Number(bucketMin.toFixed(2)),
      maxR: Number(bucketMax.toFixed(2)),
      count: 0,
      percentage: 0,
    });
  }

  for (const v of values) {
    let assignedIndex = Math.floor((v - minVal) / bucketSize);
    if (assignedIndex >= numBuckets) assignedIndex = numBuckets - 1;
    if (assignedIndex < 0) assignedIndex = 0;
    buckets[assignedIndex].count++;
  }

  const total = values.length;
  for (const b of buckets) {
    b.percentage = Number(((b.count / total) * 100).toFixed(1));
  }

  return buckets;
}

export const MONTE_CARLO_SAMPLE_NOTICE =
  '20 operaciones constituyen un mínimo operativo de visualización técnica, no una garantía de significancia estadística o robustez predictiva.';

export const MONTE_CARLO_DISCLAIMER =
  'Esta simulación utiliza remuestreo bootstrap con reemplazo sobre operaciones históricas registradas en R. Modela la variabilidad de secuencias posibles bajo los mismos supuestos del pasado; no predice resultados futuros, no garantiza rendimientos ni asume capital monetario.';

/**
 * Runs a deterministic bootstrap Monte Carlo simulation over historical trades in R.
 * Pure function: identical parameters + seed yield 100% identical results.
 */
export function runMonteCarloSimulation(
  trades: readonly Trade[],
  config: MonteCarloSimulationConfig
): MonteCarloSimulationResult {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const normalizedSeed = normalizeSeed(config.seed);
  const horizon = Math.max(5, Math.min(500, Math.floor(config.horizon || DEFAULT_MONTE_CARLO_HORIZON)));
  const iterations = Math.max(100, Math.min(5000, Math.floor(config.iterations || DEFAULT_MONTE_CARLO_ITERATIONS)));
  const environment = config.environment;
  const model = config.model || 'All';

  const { validTrades, totalCohortTrades } = filterMonteCarloTrades(trades, environment, model);
  const sampleSize = validTrades.length;

  // Enforce minimum sample size guardrail (< 20 trades)
  if (sampleSize < MIN_MONTE_CARLO_SAMPLE_SIZE) {
    return {
      status: 'insufficient_data',
      sampleSize,
      minRequired: MIN_MONTE_CARLO_SAMPLE_SIZE,
      totalCohortTrades,
      environment,
      model,
      reason: `Se encontraron ${sampleSize} operaciones válidas con R registrado y sin conflictos en el entorno "${environment}". Se requiere un mínimo de ${MIN_MONTE_CARLO_SAMPLE_SIZE} operaciones para evitar distribuciones engañosas.`,
      guidanceMessage:
        'Registra o importa más operaciones con R-Multiple verificado para activar la simulación probabilística.',
      sampleNotice: MONTE_CARLO_SAMPLE_NOTICE,
      disclaimer: MONTE_CARLO_DISCLAIMER,
    };
  }

  // Extract source R-multiples
  const rValues = validTrades.map((t) => t.rMultiple);

  // Compute baseline sample statistics
  const wins = rValues.filter((r) => r > 0);
  const losses = rValues.filter((r) => r < 0);
  const sumWins = wins.reduce((acc, r) => acc + r, 0);
  const sumLosses = Math.abs(losses.reduce((acc, r) => acc + r, 0));
  const winRate = Number(((wins.length / sampleSize) * 100).toFixed(1));
  const avgWinR = wins.length > 0 ? Number((sumWins / wins.length).toFixed(2)) : 0;
  const avgLossR = losses.length > 0 ? Number((sumLosses / losses.length).toFixed(2)) : 0;
  const pWin = wins.length / sampleSize;
  const pLoss = losses.length / sampleSize;
  const expectancyR = Number(((pWin * avgWinR) - (pLoss * avgLossR)).toFixed(2));
  const profitFactorR =
    sumLosses === 0
      ? sumWins > 0
        ? null
        : 0
      : Number((sumWins / sumLosses).toFixed(2));

  // Initialize deterministic PRNG
  const rng = createMulberry32(normalizedSeed);

  // Storage for simulation results across iterations
  const finalCumulativeRs: number[] = new Array(iterations);
  const maxDrawdownRs: number[] = new Array(iterations);
  const maxLossStreaks: number[] = new Array(iterations);

  // Step-by-step trajectory storage: steps 0..horizon
  // trajectoryMatrix[step][iteration]
  const trajectoryMatrix: number[][] = Array.from({ length: horizon + 1 }, () => new Array(iterations));
  for (let iter = 0; iter < iterations; iter++) {
    trajectoryMatrix[0][iter] = 0;
  }

  // Run Monte Carlo bootstrap iterations
  for (let iter = 0; iter < iterations; iter++) {
    let cumR = 0;
    let peakR = 0;
    let maxDDR = 0;
    let currentLossStreak = 0;
    let maxLossStreak = 0;

    for (let step = 1; step <= horizon; step++) {
      // Resample with replacement from historical R values
      const randomIndex = Math.floor(rng() * sampleSize);
      const r = rValues[randomIndex];

      cumR += r;
      if (cumR > peakR) {
        peakR = cumR;
      }
      const currentDD = peakR - cumR;
      if (currentDD > maxDDR) {
        maxDDR = currentDD;
      }

      // Consecutive losses streak (strictly r < 0)
      if (r < 0) {
        currentLossStreak++;
        if (currentLossStreak > maxLossStreak) {
          maxLossStreak = currentLossStreak;
        }
      } else {
        currentLossStreak = 0;
      }

      trajectoryMatrix[step][iter] = cumR;
    }

    finalCumulativeRs[iter] = cumR;
    maxDrawdownRs[iter] = maxDDR;
    maxLossStreaks[iter] = maxLossStreak;
  }

  // Sort arrays for percentile extraction
  const sortedFinalR = [...finalCumulativeRs].sort((a, b) => a - b);
  const sortedMaxDD = [...maxDrawdownRs].sort((a, b) => a - b);
  const sortedLossStreaks = [...maxLossStreaks].sort((a, b) => a - b);

  // Compute metrics for Cumulative R
  const sumFinalR = sortedFinalR.reduce((acc, v) => acc + v, 0);
  const meanFinalR = sumFinalR / iterations;
  const varianceFinalR = sortedFinalR.reduce((acc, v) => acc + Math.pow(v - meanFinalR, 2), 0) / iterations;
  const stdDevFinalR = Math.sqrt(varianceFinalR);
  const positiveRunsCount = sortedFinalR.filter((v) => v > 0).length;
  const probPositiveR = Number(((positiveRunsCount / iterations) * 100).toFixed(1));

  // Compute metrics for Max Drawdown R
  const sumMaxDD = sortedMaxDD.reduce((acc, v) => acc + v, 0);
  const meanMaxDD = sumMaxDD / iterations;

  // Compute metrics for Loss Streaks
  const sumStreaks = sortedLossStreaks.reduce((acc, v) => acc + v, 0);
  const meanStreak = sumStreaks / iterations;

  const metrics: MonteCarloMetrics = {
    cumulativeR: {
      p5: Number(calculatePercentile(sortedFinalR, 5).toFixed(2)),
      p25: Number(calculatePercentile(sortedFinalR, 25).toFixed(2)),
      p50: Number(calculatePercentile(sortedFinalR, 50).toFixed(2)),
      p75: Number(calculatePercentile(sortedFinalR, 75).toFixed(2)),
      p95: Number(calculatePercentile(sortedFinalR, 95).toFixed(2)),
      mean: Number(meanFinalR.toFixed(2)),
      min: Number(sortedFinalR[0].toFixed(2)),
      max: Number(sortedFinalR[sortedFinalR.length - 1].toFixed(2)),
      stdDev: Number(stdDevFinalR.toFixed(2)),
      probPositiveR,
    },
    maxDrawdownR: {
      p5: Number(calculatePercentile(sortedMaxDD, 5).toFixed(2)),
      p50: Number(calculatePercentile(sortedMaxDD, 50).toFixed(2)),
      p95: Number(calculatePercentile(sortedMaxDD, 95).toFixed(2)),
      worst: Number(sortedMaxDD[sortedMaxDD.length - 1].toFixed(2)),
      mean: Number(meanMaxDD.toFixed(2)),
    },
    maxLossStreak: {
      p50: Math.round(calculatePercentile(sortedLossStreaks, 50)),
      p95: Math.round(calculatePercentile(sortedLossStreaks, 95)),
      worst: sortedLossStreaks[sortedLossStreaks.length - 1],
      mean: Number(meanStreak.toFixed(1)),
    },
  };

  // Build step-by-step trajectory percentiles for fan chart
  const trajectory: MonteCarloTrajectoryPoint[] = new Array(horizon + 1);
  for (let step = 0; step <= horizon; step++) {
    const stepValues = [...trajectoryMatrix[step]].sort((a, b) => a - b);
    const sumStep = stepValues.reduce((acc, v) => acc + v, 0);
    trajectory[step] = {
      tradeIndex: step,
      p5: Number(calculatePercentile(stepValues, 5).toFixed(2)),
      p25: Number(calculatePercentile(stepValues, 25).toFixed(2)),
      p50: Number(calculatePercentile(stepValues, 50).toFixed(2)),
      p75: Number(calculatePercentile(stepValues, 75).toFixed(2)),
      p95: Number(calculatePercentile(stepValues, 95).toFixed(2)),
      mean: Number((sumStep / iterations).toFixed(2)),
    };
  }

  // Build histogram of final cumulative R
  const distribution = buildDistributionBuckets(sortedFinalR, 12);

  const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const executionTimeMs = Number((endTime - startTime).toFixed(1));

  return {
    status: 'success',
    config: {
      environment,
      model,
      horizon,
      iterations,
      seed: normalizedSeed,
    },
    sampleSize,
    totalCohortTrades,
    sampleStats: {
      winRate,
      expectancyR,
      avgWinR,
      avgLossR,
      profitFactorR,
    },
    metrics,
    trajectory,
    distribution,
    seed: normalizedSeed,
    executionTimeMs,
    sampleNotice: MONTE_CARLO_SAMPLE_NOTICE,
    disclaimer: MONTE_CARLO_DISCLAIMER,
  };
}
