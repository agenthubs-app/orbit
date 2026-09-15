#!/usr/bin/env node

import { execFile, execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BUNDLE_IDENTIFIER = "app.agenthubs.orbit";
const DEDICATED_SIMULATOR_NAME = "Orbit Sprint 0031 iPhone 17 Pro";
const EXPECTED_RUNTIME = "iOS 26.4";
const SAMPLE_FIELDS = [
  "commit",
  "durationMs",
  "environment",
  "failed",
  "metric",
  "run",
  "scenario",
  "unit",
];

export const APP_PERFORMANCE_SCENARIOS = Object.freeze([
  Object.freeze({ metric: "app.startup", route: "orbit://", scenario: "app.startup" }),
  Object.freeze({ metric: "app.auth_restore", route: "orbit://", scenario: "app.auth_restore" }),
  Object.freeze({ metric: "app.resource", route: "orbit://notes", scenario: "app.notes" }),
  Object.freeze({ metric: "app.resource", route: "orbit://inbox", scenario: "app.inbox" }),
  Object.freeze({ metric: "app.resource", route: "orbit://schedule", scenario: "app.schedule" }),
  Object.freeze({ metric: "app.resource", route: "orbit://profile", scenario: "app.profile" }),
]);

export const APP_PERFORMANCE_COHORTS = Object.freeze([
  ...APP_PERFORMANCE_SCENARIOS.slice(0, 2),
  ...APP_PERFORMANCE_SCENARIOS.slice(2).flatMap((definition) =>
    definition.scenario === "app.inbox"
      ? [definition, Object.freeze({ ...definition, metric: "app.react_commit" })]
      : definition.scenario === "app.schedule" || definition.scenario === "app.profile"
      ? [definition, Object.freeze({ ...definition, metric: "app.snapshot" })]
      : [definition]),
]);

const SCENARIO_NAMES = new Set(APP_PERFORMANCE_SCENARIOS.map(({ scenario }) => scenario));

export function buildAppRunPlan({ buildSha, udid }) {
  if (!/^[a-f0-9]{40}$/u.test(buildSha)) throw new Error("The measured build SHA must be a full lowercase Git SHA.");
  if (!udid?.trim()) throw new Error("A Simulator UDID is required.");
  return APP_PERFORMANCE_COHORTS.flatMap((definition) =>
    Array.from({ length: 13 }, (_, index) => {
      const phase = index < 3 ? "warmup" : "formal";
      return Object.freeze({
        actions: Object.freeze([
          Object.freeze({ kind: "terminate", value: BUNDLE_IDENTIFIER }),
          Object.freeze({ kind: "launch", value: BUNDLE_IDENTIFIER }),
          Object.freeze({ kind: "openurl", value: definition.route }),
        ]),
        buildSha,
        configuration: "Release",
        metric: definition.metric,
        phase,
        run: phase === "formal" ? index - 2 : index + 1,
        scenario: definition.scenario,
        udid,
      });
    }),
  );
}

export function validateSimulatorTarget(target, expectedUdid) {
  if (!target || target.udid !== expectedUdid) throw new Error("The measurement target does not match the fixed Simulator UDID.");
  if (target.name !== DEDICATED_SIMULATOR_NAME) throw new Error("Use the dedicated Sprint 0031 iPhone 17 Pro Simulator.");
  if (target.os_version !== EXPECTED_RUNTIME) throw new Error(`The measurement target must run ${EXPECTED_RUNTIME}.`);
  if (target.state !== "Booted") throw new Error("The measurement target must be Booted.");
}

function assertExactSample(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("App performance output must be an object.");
  const fields = Object.keys(value).sort();
  if (fields.length !== SAMPLE_FIELDS.length || fields.some((field, index) => field !== [...SAMPLE_FIELDS].sort()[index])) {
    throw new Error("App performance output contains an unexpected field or is missing a required field.");
  }
  if (!Number.isFinite(value.durationMs) || value.durationMs < 0) throw new Error("App performance output has an invalid duration.");
  if (value.environment !== "app-release-simulator" || value.unit !== "milliseconds") throw new Error("App performance output has an invalid environment or unit.");
  if (typeof value.failed !== "boolean" || !Number.isInteger(value.run) || value.run < 1 || value.run > 10) {
    throw new Error("App performance output has invalid result fields.");
  }
  if (!SCENARIO_NAMES.has(value.scenario)) throw new Error(`App performance output has an unexpected scenario ${String(value.scenario)}.`);
}

export function parseAppPerformanceLogLine(line, expectedBuildSha) {
  const marker = "ORBIT_PERF ";
  const markerIndex = line.indexOf(marker);
  if (markerIndex < 0) return null;
  const value = JSON.parse(line.slice(markerIndex + marker.length));
  assertExactSample(value);
  if (value.commit !== expectedBuildSha) throw new Error("The App performance sample build SHA differs from the measured build SHA.");
  return value;
}

export function simulatorProcessIdentifier(output) {
  const match = /:\s*(\d+)\s*$/u.exec(output);
  const processIdentifier = Number(match?.[1]);
  if (!Number.isInteger(processIdentifier) || processIdentifier <= 0) {
    throw new Error("Simulator launch did not return a valid process identifier.");
  }
  return processIdentifier;
}

export function simulatorLogPredicate(processIdentifier) {
  if (!Number.isInteger(processIdentifier) || processIdentifier <= 0) {
    throw new Error("Simulator log collection requires a valid process identifier.");
  }
  return `processIdentifier == ${processIdentifier} AND eventMessage CONTAINS "ORBIT_PERF"`;
}

export function selectAppPerformanceSample(samples, metric) {
  if (samples.length === 0) return null;
  return metric === "app.react_commit"
    ? samples.reduce((slowest, sample) => sample.durationMs > slowest.durationMs ? sample : slowest)
    : samples[0];
}

export function validateAppMeasurementSamples(samples, expectedBuildSha) {
  for (const sample of samples) {
    assertExactSample(sample);
    if (sample.commit !== expectedBuildSha) throw new Error("The App performance sample build SHA differs from the measured build SHA.");
  }
  for (const { metric, scenario } of APP_PERFORMANCE_COHORTS) {
    const cohort = samples.filter((sample) =>
      sample.scenario === scenario && sample.metric === metric);
    if (cohort.length !== 10) throw new Error(`${scenario} requires exactly ten formal samples.`);
    const runs = cohort.map(({ run }) => run).sort((left, right) => left - right);
    if (runs.some((run, index) => run !== index + 1)) throw new Error(`${scenario}/${metric} requires formal run numbers 1 through 10.`);
  }
  if (samples.length !== APP_PERFORMANCE_COHORTS.length * 10) {
    const unexpected = samples.find((sample) => !SCENARIO_NAMES.has(sample.scenario));
    if (unexpected) throw new Error(`App performance output has an unexpected scenario ${String(unexpected.scenario)}.`);
    throw new Error("App performance output contains unexpected samples.");
  }
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!["--build-sha", "--output", "--udid"].includes(name) || !value) {
      throw new Error("Usage: measure-critical-performance.mjs --udid <udid> --build-sha <sha> --output <path>");
    }
    options[name.slice(2)] = value;
  }
  if (!options.udid || !options["build-sha"] || !options.output) {
    throw new Error("Usage: measure-critical-performance.mjs --udid <udid> --build-sha <sha> --output <path>");
  }
  return { buildSha: options["build-sha"], output: options.output, udid: options.udid };
}

function simulatorTarget(udid) {
  const lines = execFileSync("idb", ["list-targets", "--json"], { encoding: "utf8" }).trim().split("\n");
  return lines.filter(Boolean).map((line) => JSON.parse(line)).find((target) => target.udid === udid) ?? null;
}

async function waitForSample(udid, processIdentifier, expectedBuildSha, expectedMetric, expectedScenario, timeoutMs = 30_000) {
  const startedAt = performance.now();
  let firstCommitSeenAt = null;
  while (performance.now() - startedAt < timeoutMs) {
    const { stdout: contents } = await execFileAsync("xcrun", [
      "simctl", "spawn", udid, "log", "show", "--last", "1m", "--style", "compact",
      "--predicate", simulatorLogPredicate(processIdentifier),
    ]);
    const matching = [];
    for (const line of contents.split("\n")) {
      const sample = parseAppPerformanceLogLine(line, expectedBuildSha);
      if (sample?.metric === expectedMetric && sample.scenario === expectedScenario) matching.push(sample);
    }
    const selected = selectAppPerformanceSample(matching, expectedMetric);
    if (selected && expectedMetric !== "app.react_commit") return selected;
    if (selected) {
      firstCommitSeenAt ??= performance.now();
      if (performance.now() - firstCommitSeenAt >= 1_000) return selected;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${expectedMetric}/${expectedScenario}.`);
}

async function executeRun(item) {
  await execFileAsync("xcrun", ["simctl", "terminate", item.udid, BUNDLE_IDENTIFIER]).catch(() => undefined);
  const launched = await execFileAsync("xcrun", ["simctl", "launch", item.udid, BUNDLE_IDENTIFIER]);
  const processIdentifier = simulatorProcessIdentifier(launched.stdout);
  if (item.scenario !== "app.startup" && item.scenario !== "app.auth_restore") {
    await execFileAsync("xcrun", ["simctl", "openurl", item.udid, item.actions[2].value]);
  }
  const sample = await waitForSample(
    item.udid,
    processIdentifier,
    item.buildSha,
    item.metric,
    item.scenario,
  );
  return { ...sample, run: item.run };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const plan = buildAppRunPlan(options);
  await execFileAsync("xcrun", ["simctl", "boot", options.udid]).catch(() => undefined);
  await execFileAsync("xcrun", ["simctl", "bootstatus", options.udid, "-b"]);
  validateSimulatorTarget(simulatorTarget(options.udid), options.udid);
  execFileSync("xcrun", ["simctl", "get_app_container", options.udid, BUNDLE_IDENTIFIER, "app"], { stdio: "ignore" });

  const samples = [];
  for (const item of plan) {
    const sample = await executeRun(item);
    if (item.phase === "formal") samples.push(sample);
  }
  validateAppMeasurementSamples(samples, options.buildSha);
  await writeFile(options.output, `${JSON.stringify(samples, null, 2)}\n`, { flag: "wx" });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "App performance measurement failed.");
    process.exitCode = 1;
  });
}
