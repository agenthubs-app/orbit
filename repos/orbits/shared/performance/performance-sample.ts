export type PerformanceEnvironment =
  | "app-release-simulator"
  | "web-production-local";

export type PerformanceUnit =
  | "bytes"
  | "count"
  | "milliseconds"
  | "ratio";

export interface PerformanceSample {
  commit: string;
  durationMs: number;
  environment: PerformanceEnvironment;
  failed: boolean;
  metric: string;
  run: number;
  scenario: string;
  unit: PerformanceUnit;
}

export interface PerformanceSummary {
  failedRuns: number;
  metric: string;
  p50: number;
  p95: number;
  scenario: string;
  successfulRuns: number;
}

export interface PerformanceComparison {
  baseline: PerformanceSummary;
  deltaRatio: number;
  optimized: PerformanceSummary;
  p95DeltaRatio: number;
}

const SAMPLE_FIELDS = [
  "commit",
  "durationMs",
  "environment",
  "failed",
  "metric",
  "run",
  "scenario",
  "unit",
] as const;

function assertSampleShape(sample: PerformanceSample): void {
  const fields = Object.keys(sample).sort();
  const expected = [...SAMPLE_FIELDS].sort();

  for (const field of fields) {
    if (!expected.includes(field as (typeof SAMPLE_FIELDS)[number])) {
      throw new Error(`Performance sample has unexpected field ${field}.`);
    }
  }
  if (fields.length !== expected.length) {
    throw new Error("Performance sample is missing required fields.");
  }
  if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0) {
    throw new Error("Performance sample requires a finite non-negative durationMs.");
  }
}

function assertUniform<K extends keyof PerformanceSample>(
  samples: readonly PerformanceSample[],
  key: K,
): void {
  const first = samples[0][key];
  if (samples.some((sample) => sample[key] !== first)) {
    throw new Error(`Performance sample cohort has mixed ${key}.`);
  }
}

function median(sorted: readonly number[]): number {
  const middle = sorted.length / 2;
  if (Number.isInteger(middle)) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[Math.floor(middle)];
}

function nearestRank(sorted: readonly number[], percentile: number): number {
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

export function summarizePerformanceSamples(
  samples: readonly PerformanceSample[],
): PerformanceSummary {
  if (samples.length !== 10) {
    throw new Error("Performance summary requires exactly 10 formal samples.");
  }

  for (const sample of samples) {
    assertSampleShape(sample);
  }

  const runs = [...samples].map((sample) => sample.run).sort((left, right) => left - right);
  if (runs.some((run, index) => run !== index + 1)) {
    throw new Error("Performance samples require formal run numbers 1 through 10.");
  }

  for (const key of ["commit", "environment", "unit", "metric", "scenario"] as const) {
    assertUniform(samples, key);
  }

  const successfulDurations = samples
    .filter((sample) => !sample.failed)
    .map((sample) => sample.durationMs)
    .sort((left, right) => left - right);
  if (successfulDurations.length === 0) {
    throw new Error("Performance summary requires at least one successful sample.");
  }

  return {
    failedRuns: samples.length - successfulDurations.length,
    metric: samples[0].metric,
    p50: median(successfulDurations),
    p95: nearestRank(successfulDurations, 0.95),
    scenario: samples[0].scenario,
    successfulRuns: successfulDurations.length,
  };
}

function relativeDelta(before: number, after: number): number {
  if (before === 0) {
    if (after === 0) {
      return 0;
    }
    throw new Error("Cannot compare against a zero baseline percentile.");
  }
  return (after - before) / before;
}

export function comparePerformanceSummaries(
  baseline: PerformanceSummary,
  optimized: PerformanceSummary,
): PerformanceComparison {
  if (
    baseline.scenario !== optimized.scenario ||
    baseline.metric !== optimized.metric
  ) {
    throw new Error("Performance comparison requires matching scenario and metric.");
  }

  return {
    baseline,
    deltaRatio: relativeDelta(baseline.p50, optimized.p50),
    optimized,
    p95DeltaRatio: relativeDelta(baseline.p95, optimized.p95),
  };
}
