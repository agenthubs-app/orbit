import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_PERFORMANCE_COHORTS,
  APP_PERFORMANCE_SCENARIOS,
  buildAppRunPlan,
  parseAppPerformanceLogLine,
  simulatorLogPredicate,
  simulatorProcessIdentifier,
  validateAppMeasurementSamples,
  validateSimulatorTarget,
} from "../../scripts/measure-critical-performance.mjs";

const UDID = "19F5DA83-D948-4B8D-8ADB-4D39CA51E8FA";
const SHA = "1ed6e091b40ebdabc640d1c17a82f83acd00b629";

test("the Release runner plans exactly three warmups and ten formal read-only runs per scenario", () => {
  assert.deepEqual(APP_PERFORMANCE_SCENARIOS.map(({ scenario }) => scenario), [
    "app.startup",
    "app.auth_restore",
    "app.notes",
    "app.inbox",
    "app.schedule",
    "app.profile",
  ]);

  assert.deepEqual(
    APP_PERFORMANCE_COHORTS.map(({ metric, scenario }) => [scenario, metric]),
    [
      ["app.startup", "app.startup"],
      ["app.auth_restore", "app.auth_restore"],
      ["app.notes", "app.resource"],
      ["app.inbox", "app.resource"],
      ["app.schedule", "app.resource"],
      ["app.schedule", "app.snapshot"],
      ["app.profile", "app.resource"],
      ["app.profile", "app.snapshot"],
    ],
  );

  const plan = buildAppRunPlan({ buildSha: SHA, udid: UDID });
  assert.equal(plan.length, APP_PERFORMANCE_COHORTS.length * 13);
  for (const cohort of APP_PERFORMANCE_COHORTS) {
    const runs = plan.filter((run) =>
      run.scenario === cohort.scenario && run.metric === cohort.metric);
    assert.deepEqual(runs.map(({ phase }) => phase), [
      "warmup", "warmup", "warmup",
      "formal", "formal", "formal", "formal", "formal",
      "formal", "formal", "formal", "formal", "formal",
    ]);
    assert.deepEqual(
      runs.filter(({ phase }) => phase === "formal").map(({ run }) => run),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    assert.ok(runs.every(({ configuration }) => configuration === "Release"));
    assert.ok(runs.every(({ actions }) =>
      actions.every(({ kind }) => ["terminate", "launch", "openurl"].includes(kind))),
    );
    assert.ok(runs.every(({ actions }) =>
      actions.filter(({ kind }) => kind === "openurl").every(({ value }) =>
        /^orbit:\/\/(?:notes|inbox|schedule|profile)?$/u.test(value))),
    );
  }
});

test("the runner rejects a different Simulator model, runtime, state, or UDID", () => {
  const target = {
    name: "Orbit Sprint 0031 iPhone 17 Pro",
    udid: UDID,
    state: "Booted",
    os_version: "iOS 26.4",
  };
  assert.doesNotThrow(() => validateSimulatorTarget(target, UDID));
  assert.throws(() => validateSimulatorTarget({ ...target, name: "iPhone 17 Pro" }, UDID), /dedicated/);
  assert.throws(() => validateSimulatorTarget({ ...target, os_version: "iOS 26.3" }, UDID), /iOS 26\.4/);
  assert.throws(() => validateSimulatorTarget({ ...target, state: "Shutdown" }, UDID), /Booted/);
  assert.throws(() => validateSimulatorTarget(target, "another-udid"), /UDID/);
});

test("only exact redacted ORBIT_PERF samples from the measured build are accepted", () => {
  const line = `2026-09-15 app[42] ORBIT_PERF ${JSON.stringify({
    commit: SHA,
    durationMs: 42.5,
    environment: "app-release-simulator",
    failed: false,
    metric: "app.resource",
    run: 1,
    scenario: "app.notes",
    unit: "milliseconds",
  })}`;
  assert.deepEqual(parseAppPerformanceLogLine(line, SHA), {
    commit: SHA,
    durationMs: 42.5,
    environment: "app-release-simulator",
    failed: false,
    metric: "app.resource",
    run: 1,
    scenario: "app.notes",
    unit: "milliseconds",
  });
  assert.equal(parseAppPerformanceLogLine("ordinary log", SHA), null);
  assert.throws(() => parseAppPerformanceLogLine(line, "different-sha"), /build SHA/);
  assert.throws(
    () => parseAppPerformanceLogLine(line.replace('"unit":"milliseconds"', '"unit":"milliseconds","token":"secret"'), SHA),
    /unexpected field/,
  );
});

test("collects only the current Simulator process from unified logging", () => {
  assert.equal(simulatorProcessIdentifier("app.agenthubs.orbit: 37952\n"), 37952);
  assert.throws(() => simulatorProcessIdentifier("launch failed"), /process identifier/);
  assert.equal(
    simulatorLogPredicate(37952),
    'processIdentifier == 37952 AND eventMessage CONTAINS "ORBIT_PERF"',
  );
  assert.throws(() => simulatorLogPredicate(-1), /process identifier/);
});

test("formal output requires exactly ten runs for every scenario and retains failures", () => {
  const samples = APP_PERFORMANCE_COHORTS.flatMap(({ metric, scenario }) =>
    Array.from({ length: 10 }, (_, index) => ({
      commit: SHA,
      durationMs: index + 1,
      environment: "app-release-simulator" as const,
      failed: index === 9,
      metric,
      run: index + 1,
      scenario,
      unit: "milliseconds" as const,
    })),
  );
  assert.doesNotThrow(() => validateAppMeasurementSamples(samples, SHA));
  assert.throws(() => validateAppMeasurementSamples(samples.slice(1), SHA), /exactly ten/);
  assert.throws(
    () => validateAppMeasurementSamples([...samples, { ...samples[0]!, scenario: "app.home" as never }], SHA),
    /unexpected scenario/,
  );
  assert.throws(
    () => validateAppMeasurementSamples(samples.map((sample) => ({ ...sample, run: 1 })), SHA),
    /formal run numbers/,
  );
});
