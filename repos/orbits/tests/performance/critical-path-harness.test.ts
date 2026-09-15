import assert from "node:assert/strict";
import test from "node:test";

import {
  WEB_PERFORMANCE_SCENARIOS,
  buildWebRunPlan,
  observationsToSamples,
  validateProductionRuntime,
  validateWebMeasurementSamples,
} from "../../scripts/measure-critical-performance.mjs";

const SHA = "747ea2349d000000000000000000000000000000";

test("plans cache-disabled first navigation and three warmups plus ten formal runs", () => {
  assert.deepEqual(WEB_PERFORMANCE_SCENARIOS.map(({ scenario }) => scenario), [
    "web.home",
    "web.contacts",
    "web.followups",
    "web.schedule",
    "web.profile",
    "web.agent",
    "web.agent.local_boundary",
  ]);
  const plan = buildWebRunPlan({ buildSha: SHA, origin: "http://127.0.0.1:3108" });
  assert.equal(plan.length, 7 * 13);
  for (const scenario of WEB_PERFORMANCE_SCENARIOS) {
    const runs = plan.filter((run) => run.scenario === scenario.scenario);
    assert.equal(runs.filter(({ phase }) => phase === "warmup").length, 3);
    assert.deepEqual(
      runs.filter(({ phase }) => phase === "formal").map(({ run }) => run),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    assert.equal(runs[0]?.cacheMode, "disabled");
    assert.ok(runs.slice(1).every(({ cacheMode }) => cacheMode === "warmed"));
    assert.ok(runs.every(({ actions }) => actions.every((action) => action !== "screenshot")));
  }
});

test("runtime validation rejects next dev, unhealthy live mode, port drift, and stale builds", () => {
  const input = {
    actualOrigin: "http://127.0.0.1:3108",
    buildManifestFound: true,
    builtSha: SHA,
    expectedOrigin: "http://127.0.0.1:3108",
    expectedSha: SHA,
    health: { mode: "live", status: "ok" },
    nextRuntime: "production",
  } as const;
  assert.doesNotThrow(() => validateProductionRuntime(input));
  assert.throws(() => validateProductionRuntime({ ...input, nextRuntime: "development" }), /next dev/);
  assert.throws(() => validateProductionRuntime({ ...input, health: { mode: "mock", status: "ok" } }), /live\/ok/);
  assert.throws(() => validateProductionRuntime({ ...input, builtSha: "different" }), /build SHA/);
  assert.throws(() => validateProductionRuntime({ ...input, actualOrigin: "http://127.0.0.1:3000" }), /origin/);
});

test("maps browser observations to the shared redacted contract", () => {
  const samples = observationsToSamples({
    buildSha: SHA,
    observation: {
      cls: 0.01,
      decodedBytes: 8000,
      fcpMs: 120,
      inpMs: 40,
      lcpMs: 220,
      navigationMs: 250,
      requestCount: 9,
      transferBytes: 4000,
      ttfbMs: 75,
    },
    run: 2,
    scenario: "web.contacts",
  });
  assert.deepEqual(samples.map(({ metric, unit }) => [metric, unit]), [
    ["navigation_ms", "milliseconds"],
    ["ttfb_ms", "milliseconds"],
    ["fcp_ms", "milliseconds"],
    ["lcp_ms", "milliseconds"],
    ["inp_ms", "milliseconds"],
    ["cls_ratio", "ratio"],
    ["request_count", "count"],
    ["transfer_bytes", "bytes"],
    ["decoded_bytes", "bytes"],
  ]);
  assert.ok(samples.every((sample) => Object.keys(sample).sort().join(",") ===
    "commit,durationMs,environment,failed,metric,run,scenario,unit"));
});

test("formal output requires ten runs for every emitted scenario and metric", () => {
  const samples = Array.from({ length: 10 }, (_, index) =>
    observationsToSamples({
      buildSha: SHA,
      observation: {
        cls: 0,
        decodedBytes: 100,
        fcpMs: 10,
        inpMs: 0,
        lcpMs: 20,
        navigationMs: 25,
        requestCount: 1,
        transferBytes: 80,
        ttfbMs: 5,
      },
      run: index + 1,
      scenario: "web.home",
    }),
  ).flat();
  assert.doesNotThrow(() => validateWebMeasurementSamples(samples, SHA, ["web.home"]));
  assert.throws(() => validateWebMeasurementSamples(samples.slice(1), SHA, ["web.home"]), /exactly ten/);
  assert.throws(
    () => validateWebMeasurementSamples([...samples, { ...samples[0]!, body: "private" } as never], SHA, ["web.home"]),
    /unexpected field/,
  );
});
