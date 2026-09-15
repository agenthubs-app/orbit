import assert from "node:assert/strict";
import test from "node:test";

import {
  appPerformanceInput,
  appPerformanceScenarioForPath,
  createAppPerformanceRecorder,
  isAppPerformanceEnabled,
  type AppPerformanceInput,
} from "../../src/performance/app-performance";

const INPUT: AppPerformanceInput = {
  commit: "1ed6e091b40ebdabc640d1c17a82f83acd00b629",
  environment: "app-release-simulator",
  metric: "app.resource",
  run: 1,
  scenario: "app.notes",
  unit: "milliseconds",
};

function clock(...values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (value === undefined) {
      throw new Error("clock called more often than expected");
    }
    return value;
  };
}

test("records a successful measured operation using the injected monotonic clock", async () => {
  const recorder = createAppPerformanceRecorder({
    enabled: true,
    now: clock(10, 25),
  });

  const result = await recorder.measure(INPUT, async () => "loaded");

  assert.equal(result, "loaded");
  assert.deepEqual(recorder.drain(), [
    { ...INPUT, durationMs: 15, failed: false },
  ]);
});

test("records a failed measured operation and rethrows the original error", async () => {
  const recorder = createAppPerformanceRecorder({
    enabled: true,
    now: clock(100, 145),
  });
  const expected = new Error("snapshot unavailable");

  await assert.rejects(
    recorder.measure(INPUT, async () => {
      throw expected;
    }),
    (error: unknown) => error === expected,
  );

  assert.deepEqual(recorder.drain(), [
    { ...INPUT, durationMs: 45, failed: true },
  ]);
});

test("disabled recorder performs work without reading the clock or retaining samples", async () => {
  const recorder = createAppPerformanceRecorder({
    enabled: false,
    now: () => {
      throw new Error("disabled recorder read the clock");
    },
  });

  assert.equal(await recorder.measure(INPUT, async () => 42), 42);
  recorder.mark({ ...INPUT, durationMs: 5, failed: false });
  assert.deepEqual(recorder.drain(), []);
});

test("rejects unstable scenario names, unsupported metrics, and negative durations", () => {
  const recorder = createAppPerformanceRecorder({ enabled: true, now: clock(1) });

  assert.throws(
    () => recorder.mark({ ...INPUT, scenario: "app.notes?id=private" as never, durationMs: 1, failed: false }),
    /stable app performance scenario/,
  );
  assert.throws(
    () => recorder.mark({ ...INPUT, metric: "app.payload" as never, durationMs: 1, failed: false }),
    /supported app performance metric/,
  );
  assert.throws(
    () => recorder.mark({ ...INPUT, durationMs: -1, failed: false }),
    /finite non-negative durationMs/,
  );
});

test("rejects payload and body fields instead of retaining private data", () => {
  const recorder = createAppPerformanceRecorder({ enabled: true, now: clock(1) });

  for (const field of ["payload", "body", "token", "cookie"]) {
    assert.throws(
      () => recorder.mark({
        ...INPUT,
        durationMs: 1,
        failed: false,
        [field]: "private",
      } as never),
      new RegExp(`unexpected field ${field}`),
    );
  }
});

test("clears retained samples when actor or base URL changes", () => {
  const recorder = createAppPerformanceRecorder({ enabled: true, now: clock(1) });
  recorder.setScope({ actorId: "actor-a", baseUrl: "https://one.test" });
  recorder.mark({ ...INPUT, durationMs: 1, failed: false });

  recorder.setScope({ actorId: "actor-a", baseUrl: "https://one.test" });
  assert.equal(recorder.drain().length, 1);
  recorder.mark({ ...INPUT, durationMs: 1, failed: false });

  recorder.setScope({ actorId: "actor-b", baseUrl: "https://one.test" });
  assert.deepEqual(recorder.drain(), []);
  recorder.mark({ ...INPUT, durationMs: 2, failed: false });

  recorder.setScope({ actorId: "actor-b", baseUrl: "https://two.test" });
  assert.deepEqual(recorder.drain(), []);
});

test("drain returns the current samples once and resets the recorder", () => {
  const recorder = createAppPerformanceRecorder({ enabled: true, now: clock(1) });
  recorder.mark({ ...INPUT, durationMs: 3, failed: false });

  assert.equal(recorder.drain().length, 1);
  assert.deepEqual(recorder.drain(), []);
});

test("emits each validated sample to an injected redaction-safe sink", () => {
  const emitted: unknown[] = [];
  const recorder = createAppPerformanceRecorder({
    enabled: true,
    now: clock(1),
    sink: (sample) => emitted.push(sample),
  });

  recorder.mark({ ...INPUT, durationMs: 3, failed: false });

  assert.deepEqual(emitted, [
    { ...INPUT, durationMs: 3, failed: false },
  ]);
});

test("does not let a measurement sink failure affect app behavior", () => {
  const recorder = createAppPerformanceRecorder({
    enabled: true,
    now: clock(1),
    sink: () => {
      throw new Error("log unavailable");
    },
  });

  assert.doesNotThrow(() => {
    recorder.mark({ ...INPUT, durationMs: 3, failed: false });
  });
  assert.equal(recorder.drain().length, 1);
});

test("maps only bounded core API path templates to stable scenarios", () => {
  assert.equal(appPerformanceScenarioForPath("/api/mobile/contacts-dashboard"), "app.home");
  assert.equal(appPerformanceScenarioForPath("/api/notes?limit=20&q=private"), "app.notes");
  assert.equal(appPerformanceScenarioForPath("/api/notes/note%3Aone"), "app.notes");
  assert.equal(appPerformanceScenarioForPath("/api/chat/relationship-inbox?conversationId=one"), "app.inbox");
  assert.equal(appPerformanceScenarioForPath("/api/schedule-items?from=2026-09-15"), "app.schedule");
  assert.equal(appPerformanceScenarioForPath("/api/profile"), "app.profile");
  assert.equal(appPerformanceScenarioForPath("/api/admin/private"), null);
});

test("builds a redacted Release input from public build metadata", () => {
  const previousCommit = process.env.EXPO_PUBLIC_ORBIT_BUILD_SHA;
  const previousRun = process.env.EXPO_PUBLIC_ORBIT_PERFORMANCE_RUN_NUMBER;
  process.env.EXPO_PUBLIC_ORBIT_BUILD_SHA = "fixed-sha";
  process.env.EXPO_PUBLIC_ORBIT_PERFORMANCE_RUN_NUMBER = "4";
  try {
    assert.deepEqual(appPerformanceInput("app.snapshot", "app.notes"), {
      commit: "fixed-sha",
      environment: "app-release-simulator",
      metric: "app.snapshot",
      run: 4,
      scenario: "app.notes",
      unit: "milliseconds",
    });
  } finally {
    if (previousCommit === undefined) delete process.env.EXPO_PUBLIC_ORBIT_BUILD_SHA;
    else process.env.EXPO_PUBLIC_ORBIT_BUILD_SHA = previousCommit;
    if (previousRun === undefined) delete process.env.EXPO_PUBLIC_ORBIT_PERFORMANCE_RUN_NUMBER;
    else process.env.EXPO_PUBLIC_ORBIT_PERFORMANCE_RUN_NUMBER = previousRun;
  }
});

test("reports whether production instrumentation was enabled at module initialization", () => {
  assert.equal(
    isAppPerformanceEnabled(),
    process.env.EXPO_PUBLIC_ORBIT_PERFORMANCE_RUN === "1",
  );
});
