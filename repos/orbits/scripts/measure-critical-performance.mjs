#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const SAMPLE_FIELDS = [
  "commit", "durationMs", "environment", "failed", "metric", "run", "scenario", "unit",
].sort();

export const WEB_PERFORMANCE_SCENARIOS = Object.freeze([
  Object.freeze({ path: "/app/home", scenario: "web.home", type: "page" }),
  Object.freeze({ path: "/app/contacts", scenario: "web.contacts", type: "page" }),
  Object.freeze({ path: "/app/followups", scenario: "web.followups", type: "page" }),
  Object.freeze({ path: "/app/schedule", scenario: "web.schedule", type: "page" }),
  Object.freeze({ path: "/app/profile", scenario: "web.profile", type: "page" }),
  Object.freeze({ path: "/app/agent", scenario: "web.agent", type: "page" }),
  Object.freeze({ path: "/app/agent", scenario: "web.agent.local_boundary", type: "local-boundary" }),
]);

const SCENARIO_NAMES = new Set(WEB_PERFORMANCE_SCENARIOS.map(({ scenario }) => scenario));

/** @param {Record<string, string | undefined>} environment */
export function browserLaunchOptions(environment = process.env) {
  return {
    ...(environment.ORBIT_TEST_CHROME_PATH
      ? { executablePath: environment.ORBIT_TEST_CHROME_PATH }
      : {}),
    headless: true,
  };
}

export function buildWebRunPlan({ buildSha, origin }) {
  if (!/^[a-f0-9]{40}$/u.test(buildSha)) throw new Error("The Web measured build SHA must be a full lowercase Git SHA.");
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.hostname !== "127.0.0.1" || parsedOrigin.port !== "3108" || parsedOrigin.pathname !== "/") {
    throw new Error("The Web measurement origin must be isolated at http://127.0.0.1:3108.");
  }
  return WEB_PERFORMANCE_SCENARIOS.flatMap((definition) =>
    Array.from({ length: 13 }, (_, index) => {
      const phase = index < 3 ? "warmup" : "formal";
      return Object.freeze({
        actions: Object.freeze(definition.type === "page"
          ? ["navigate", "observe"]
          : ["navigate", "submit-local-boundary", "observe"]),
        buildSha,
        cacheMode: index === 0 ? "disabled" : "warmed",
        path: definition.path,
        phase,
        run: phase === "formal" ? index - 2 : index + 1,
        scenario: definition.scenario,
        type: definition.type,
      });
    }),
  );
}

export function validateProductionRuntime(input) {
  if (input.actualOrigin !== input.expectedOrigin) throw new Error("The Web measurement origin differs from the isolated origin.");
  if (input.nextRuntime !== "production" || !input.buildManifestFound) throw new Error("The Web harness refuses to run against next dev.");
  if (input.builtSha !== input.expectedSha) throw new Error("The production build SHA differs from the measured build SHA.");
  if (input.health?.mode !== "live" || input.health?.status !== "ok") throw new Error("The Web runtime health must be live/ok.");
}

function sample(buildSha, run, scenario, metric, unit, durationMs, failed = false) {
  return {
    commit: buildSha,
    durationMs,
    environment: "web-production-local",
    failed,
    metric,
    run,
    scenario,
    unit,
  };
}

export function observationsToSamples({ buildSha, observation, run, scenario }) {
  if (!SCENARIO_NAMES.has(scenario)) throw new Error(`Unexpected Web performance scenario ${scenario}.`);
  const definitions = [
    ["navigation_ms", "milliseconds", observation.navigationMs],
    ["ttfb_ms", "milliseconds", observation.ttfbMs],
    ["fcp_ms", "milliseconds", observation.fcpMs],
    ["lcp_ms", "milliseconds", observation.lcpMs],
    ["inp_ms", "milliseconds", observation.inpMs],
    ["cls_ratio", "ratio", observation.cls],
    ["request_count", "count", observation.requestCount],
    ["transfer_bytes", "bytes", observation.transferBytes],
    ["decoded_bytes", "bytes", observation.decodedBytes],
    ["html_rsc_transfer_bytes", "bytes", observation.htmlRscTransferBytes],
    ["html_rsc_decoded_bytes", "bytes", observation.htmlRscDecodedBytes],
    ["js_transfer_bytes", "bytes", observation.jsTransferBytes],
    ["js_decoded_bytes", "bytes", observation.jsDecodedBytes],
  ];
  return definitions.map(([metric, unit, value]) => {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid browser observation ${metric}.`);
    return sample(buildSha, run, scenario, metric, unit, value);
  });
}

function assertExactSample(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Web performance sample must be an object.");
  const fields = Object.keys(value).sort();
  if (fields.length !== SAMPLE_FIELDS.length || fields.some((field, index) => field !== SAMPLE_FIELDS[index])) {
    throw new Error("Web performance sample contains an unexpected field or is missing a required field.");
  }
  if (value.environment !== "web-production-local") throw new Error("Web performance samples require the production-local environment.");
  if (!Number.isFinite(value.durationMs) || value.durationMs < 0 || typeof value.failed !== "boolean") {
    throw new Error("Web performance sample contains an invalid result.");
  }
}

export function validateWebMeasurementSamples(samples, expectedSha, expectedScenarios = WEB_PERFORMANCE_SCENARIOS.map(({ scenario }) => scenario)) {
  for (const value of samples) {
    assertExactSample(value);
    if (value.commit !== expectedSha) throw new Error("The Web sample build SHA differs from the measured build SHA.");
    if (!expectedScenarios.includes(value.scenario)) throw new Error(`Unexpected Web performance scenario ${String(value.scenario)}.`);
  }
  for (const scenario of expectedScenarios) {
    const scenarioSamples = samples.filter((value) => value.scenario === scenario);
    const metrics = new Set(scenarioSamples.map(({ metric }) => metric));
    if (metrics.size === 0) throw new Error(`${scenario} requires measured metrics.`);
    for (const metric of metrics) {
      const cohort = scenarioSamples.filter((value) => value.metric === metric);
      if (cohort.length !== 10) throw new Error(`${scenario}/${metric} requires exactly ten formal samples.`);
      const runs = cohort.map(({ run }) => run).sort((left, right) => left - right);
      if (runs.some((run, index) => run !== index + 1)) throw new Error(`${scenario}/${metric} requires formal run numbers 1 through 10.`);
    }
  }
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!["--build-sha", "--origin", "--output"].includes(key) || !value) {
      throw new Error("Usage: measure-critical-performance.mjs --origin http://127.0.0.1:3108 --build-sha <sha> --output <path>");
    }
    values[key.slice(2)] = value;
  }
  if (!values.origin || !values["build-sha"] || !values.output) throw new Error("Web performance runner arguments are incomplete.");
  return { buildSha: values["build-sha"], origin: values.origin, output: values.output };
}

async function readRuntime(options) {
  const healthResponse = await fetch(`${options.origin}/api/health`, { headers: { "cache-control": "no-store" } });
  const envelope = await healthResponse.json();
  const buildId = (await readFile(join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim();
  const builtSha = (await readFile(join(process.cwd(), ".next", "orbit-build-sha"), "utf8")).trim();
  const manifestResponse = await fetch(`${options.origin}/_next/static/${encodeURIComponent(buildId)}/_buildManifest.js`);
  return {
    actualOrigin: new URL(healthResponse.url).origin,
    buildManifestFound: manifestResponse.ok,
    builtSha,
    expectedOrigin: options.origin,
    expectedSha: options.buildSha,
    health: envelope?.data,
    nextRuntime: manifestResponse.ok ? "production" : "development",
  };
}

async function authenticate(context, origin) {
  const password = process.env.ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD;
  if (!password) throw new Error("ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD is required for the controlled account.");
  const response = await context.request.post(`${origin}/api/auth/mobile/credentials`, {
    data: { email: "qa@orbit.test", password },
  });
  if (!response.ok()) throw new Error(`Controlled account login failed with HTTP ${response.status()}.`);
}

async function measurePage(page, url, disableCache) {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: disableCache });
  await page.addInitScript(() => {
    window.__orbitPerf = { cls: 0, inpMs: 0, lcpMs: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__orbitPerf.lcpMs = Math.max(window.__orbitPerf.lcpMs, entry.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__orbitPerf.cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__orbitPerf.inpMs = Math.max(window.__orbitPerf.inpMs, entry.duration ?? 0);
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  });
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  if (!response?.ok()) throw new Error(`Navigation failed with HTTP ${response?.status() ?? 0}.`);
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((entry) => entry.name === "first-contentful-paint");
    const entries = [navigation, ...resources].filter(Boolean);
    const htmlRscEntries = entries.filter(
      (entry) => entry === navigation || entry.name.includes("_rsc="),
    );
    const jsEntries = resources.filter(
      (entry) => entry.initiatorType === "script" || new URL(entry.name).pathname.endsWith(".js"),
    );
    return {
      cls: window.__orbitPerf.cls,
      decodedBytes: entries.reduce((total, entry) => total + (entry.decodedBodySize ?? 0), 0),
      fcpMs: fcp?.startTime ?? 0,
      htmlRscDecodedBytes: htmlRscEntries.reduce((total, entry) => total + (entry.decodedBodySize ?? 0), 0),
      htmlRscTransferBytes: htmlRscEntries.reduce((total, entry) => total + (entry.transferSize ?? 0), 0),
      inpMs: window.__orbitPerf.inpMs,
      jsDecodedBytes: jsEntries.reduce((total, entry) => total + (entry.decodedBodySize ?? 0), 0),
      jsTransferBytes: jsEntries.reduce((total, entry) => total + (entry.transferSize ?? 0), 0),
      lcpMs: window.__orbitPerf.lcpMs,
      navigationMs: navigation.duration,
      requestCount: entries.length,
      transferBytes: entries.reduce((total, entry) => total + (entry.transferSize ?? 0), 0),
      ttfbMs: navigation.responseStart,
    };
  });
}

async function measureLocalBoundary(page, options, item) {
  await measurePage(page, `${options.origin}${item.path}`, item.cacheMode === "disabled");
  const result = await page.evaluate(async () => {
    const startedAt = performance.now();
    const request = fetch("/api/ai/conversations", {
      body: "{}",
      headers: { "content-type": "application/json", "x-orbit-performance-boundary": "invalid-empty" },
      method: "POST",
    });
    const feedbackMs = performance.now() - startedAt;
    const response = await request;
    await response.arrayBuffer();
    return { feedbackMs, localMs: performance.now() - startedAt, status: response.status };
  });
  if (result.status < 400) throw new Error("The local safety-boundary probe unexpectedly passed validation.");
  return [
    sample(options.buildSha, item.run, item.scenario, "feedback_ms", "milliseconds", result.feedbackMs),
    sample(options.buildSha, item.run, item.scenario, "local_ms", "milliseconds", result.localMs),
  ];
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const plan = buildWebRunPlan(options);
  validateProductionRuntime(await readRuntime(options));
  const browser = await chromium.launch(browserLaunchOptions());
  const context = await browser.newContext();
  try {
    await authenticate(context, options.origin);
    const samples = [];
    for (const item of plan) {
      const page = await context.newPage();
      try {
        const measured = item.type === "local-boundary"
          ? await measureLocalBoundary(page, options, item)
          : observationsToSamples({
              buildSha: options.buildSha,
              observation: await measurePage(page, `${options.origin}${item.path}`, item.cacheMode === "disabled"),
              run: item.run,
              scenario: item.scenario,
            });
        if (item.phase === "formal") samples.push(...measured);
      } finally {
        await page.close();
      }
    }
    validateWebMeasurementSamples(samples, options.buildSha);
    await writeFile(options.output, `${JSON.stringify(samples, null, 2)}\n`, { flag: "wx" });
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Web performance measurement failed.");
    process.exitCode = 1;
  });
}
