import assert from "node:assert/strict";
import test from "node:test";

import {
  comparePerformanceSummaries,
  summarizePerformanceSamples,
  type PerformanceSample,
} from "../../shared/performance/performance-sample";

const BASE_SAMPLE: PerformanceSample = {
  commit: "c1ba721d13bea4d1100b36064647014f3466adb4",
  durationMs: 10,
  environment: "app-release-simulator",
  failed: false,
  metric: "navigation_ms",
  run: 1,
  scenario: "app.notes",
  unit: "milliseconds",
};

function tenSamples(
  overrides: Partial<PerformanceSample> = {},
): PerformanceSample[] {
  return Array.from({ length: 10 }, (_, index) => ({
    ...BASE_SAMPLE,
    durationMs: (index + 1) * 10,
    run: index + 1,
    ...overrides,
  }));
}

test("summarizes ten formal samples with the specified p50 and p95 positions", () => {
  assert.deepEqual(summarizePerformanceSamples(tenSamples()), {
    failedRuns: 0,
    metric: "navigation_ms",
    p50: 55,
    p95: 100,
    scenario: "app.notes",
    successfulRuns: 10,
  });
});

test("keeps failed formal samples in the cohort and excludes them from latency percentiles", () => {
  const samples = tenSamples();
  samples[8] = { ...samples[8], failed: true };
  samples[9] = { ...samples[9], failed: true };

  assert.deepEqual(summarizePerformanceSamples(samples), {
    failedRuns: 2,
    metric: "navigation_ms",
    p50: 45,
    p95: 80,
    scenario: "app.notes",
    successfulRuns: 8,
  });
});

test("rejects cohorts that are not exactly ten formal runs", () => {
  assert.throws(
    () => summarizePerformanceSamples(tenSamples().slice(0, 9)),
    /exactly 10 formal samples/,
  );
  assert.throws(
    () =>
      summarizePerformanceSamples([
        ...tenSamples(),
        { ...BASE_SAMPLE, run: 11 },
      ]),
    /exactly 10 formal samples/,
  );
});

test("rejects warmup, duplicate, and missing formal run numbers", () => {
  const warmup = tenSamples();
  warmup[0] = { ...warmup[0], run: 0 };
  assert.throws(
    () => summarizePerformanceSamples(warmup),
    /formal run numbers 1 through 10/,
  );

  const duplicate = tenSamples();
  duplicate[9] = { ...duplicate[9], run: 9 };
  assert.throws(
    () => summarizePerformanceSamples(duplicate),
    /formal run numbers 1 through 10/,
  );
});

test("rejects mixed commit, environment, unit, metric, or scenario cohorts", () => {
  const mutations: Array<[keyof PerformanceSample, PerformanceSample[keyof PerformanceSample]]> = [
    ["commit", "different-commit"],
    ["environment", "web-production-local"],
    ["unit", "count"],
    ["metric", "request_count"],
    ["scenario", "app.inbox"],
  ];

  for (const [key, value] of mutations) {
    const samples = tenSamples();
    samples[9] = { ...samples[9], [key]: value };
    assert.throws(
      () => summarizePerformanceSamples(samples),
      new RegExp(`mixed ${key}`),
    );
  }
});

test("rejects non-finite and negative durations", () => {
  for (const durationMs of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const samples = tenSamples();
    samples[4] = { ...samples[4], durationMs };
    assert.throws(
      () => summarizePerformanceSamples(samples),
      /finite non-negative durationMs/,
    );
  }
});

test("rejects secret-shaped and other fields outside the redacted sample contract", () => {
  for (const field of ["token", "cookie", "authorization", "password", "payload", "body"]) {
    const samples = tenSamples();
    samples[0] = { ...samples[0], [field]: "must-not-be-recorded" } as PerformanceSample;
    assert.throws(
      () => summarizePerformanceSamples(samples),
      new RegExp(`unexpected field ${field}`),
    );
  }
});

test("compares matching summaries using relative p50 and p95 deltas", () => {
  const baseline = summarizePerformanceSamples(tenSamples());
  const optimized = summarizePerformanceSamples(
    tenSamples({ durationMs: 0 }).map((sample, index) => ({
      ...sample,
      durationMs: (index + 1) * 6,
    })),
  );

  assert.deepEqual(comparePerformanceSummaries(baseline, optimized), {
    baseline,
    deltaRatio: -0.4,
    optimized,
    p95DeltaRatio: -0.4,
  });
});

test("rejects comparison across different metrics or scenarios", () => {
  const baseline = summarizePerformanceSamples(tenSamples());
  const differentScenario = summarizePerformanceSamples(
    tenSamples({ scenario: "app.inbox" }),
  );
  const differentMetric = summarizePerformanceSamples(
    tenSamples({ metric: "request_count", unit: "count" }),
  );

  assert.throws(
    () => comparePerformanceSummaries(baseline, differentScenario),
    /matching scenario and metric/,
  );
  assert.throws(
    () => comparePerformanceSummaries(baseline, differentMetric),
    /matching scenario and metric/,
  );
});
