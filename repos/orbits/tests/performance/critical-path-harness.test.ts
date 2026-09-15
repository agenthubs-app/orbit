import assert from "node:assert/strict";
import test from "node:test";

import {
  WEB_PERFORMANCE_SCENARIOS,
  browserLaunchOptions,
  buildWebRunPlan,
  eagerClosedPanelJsBytes,
  inspectEagerClosedPanelJsBytes,
  observationsToSamples,
  validateProductionRuntime,
  validateWebMeasurementSamples,
} from "../../scripts/measure-critical-performance.mjs";

const SHA = "747ea2349d000000000000000000000000000000";

test("uses an explicit installed Chromium executable when configured", () => {
  assert.deepEqual(browserLaunchOptions({ ORBIT_TEST_CHROME_PATH: "/Applications/Chrome" }), {
    executablePath: "/Applications/Chrome",
    headless: true,
  });
  assert.deepEqual(browserLaunchOptions({}), { headless: true });
});

test("counts only eagerly loaded Markdown runtime bytes without retaining asset contents", () => {
  assert.equal(eagerClosedPanelJsBytes([
    { decodedBodySize: 144_382, source: "...remarkPlugins...micromark..." },
    { decodedBodySize: 80_000, source: "ordinary route code" },
    { decodedBodySize: 40_000, source: "remarkPlugins without the parser signature" },
  ]), 144_382);
});

test("inspects each stable eager script once across repeated Agent runs", async () => {
  const cache = new Map();
  let reads = 0;
  const resources = [{ decodedBodySize: 144_382, url: "http://127.0.0.1/chunk.js" }];
  const readSource = async () => {
    reads += 1;
    return "...remarkPlugins...micromark...";
  };

  assert.equal(await inspectEagerClosedPanelJsBytes(resources, readSource, cache), 144_382);
  assert.equal(await inspectEagerClosedPanelJsBytes(resources, readSource, cache), 144_382);
  assert.equal(reads, 1);
});

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
      closedPanelEagerJsBytes: 144_382,
      decodedBytes: 8000,
      fcpMs: 120,
      htmlRscDecodedBytes: 2000,
      htmlRscTransferBytes: 1000,
      inpMs: 40,
      jsDecodedBytes: 5000,
      jsTransferBytes: 2500,
      lcpMs: 220,
      navigationMs: 250,
      requestCount: 9,
      transferBytes: 4000,
      ttfbMs: 75,
    },
    run: 2,
    scenario: "web.agent",
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
    ["html_rsc_transfer_bytes", "bytes"],
    ["html_rsc_decoded_bytes", "bytes"],
    ["js_transfer_bytes", "bytes"],
    ["js_decoded_bytes", "bytes"],
    ["closed_panel_eager_js_bytes", "bytes"],
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
        htmlRscDecodedBytes: 50,
        htmlRscTransferBytes: 25,
        inpMs: 0,
        jsDecodedBytes: 30,
        jsTransferBytes: 20,
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
