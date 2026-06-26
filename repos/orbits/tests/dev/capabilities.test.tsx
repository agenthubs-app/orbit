import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  resetDebugActionResults,
  runDebugAction,
  listDebugActionResults,
} from "../../shared/dev/debug-action-runner";
import { CapabilityDemoRoute } from "../../shared/dev/app-scaffold/capability-demo-view";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function renderCapabilityDemo(slug: string) {
  resetDebugActionResults();

  return renderToStaticMarkup(
    React.createElement(CapabilityDemoRoute, {
      slug,
    }),
  );
}

test("known capability route renders deterministic registry-backed output", () => {
  const html = renderCapabilityDemo("app-scaffold");

  assert.match(html, /App scaffold capability harness/);
  assert.match(html, /app-scaffold/);
  assert.match(html, /Registered capabilities/);
  assert.match(html, /Account and profile/);
  assert.match(html, /Agent action queue/);
  assert.match(html, /mock-ready/);
  assert.match(html, /probe-app-scaffold-registry/);
  assert.match(html, /Debug action result/);
  assert.match(html, /local runtime memory/);
  assert.doesNotMatch(html, /Missing capability/);
});

test("unknown capability route renders a controlled missing-capability state", () => {
  const html = renderCapabilityDemo("unknown-capability");

  assert.match(html, /Missing capability demo/);
  assert.match(html, /unknown-capability/);
  assert.match(html, /No mock action was executed/);
  assert.match(html, /app-scaffold/);
  assert.doesNotMatch(html, /Debug action result/);
  assert.deepEqual(listDebugActionResults(), []);
});

test("debug action runner records local results in memory only", () => {
  resetDebugActionResults();

  const result = runDebugAction({
    capabilitySlug: "app-scaffold",
    actionId: "probe-app-scaffold-registry",
    label: "Probe registry",
    payload: {
      registeredCapabilities: 11,
    },
    evidence: ["capability-registry"],
  });

  assert.deepEqual(result, {
    id: "app-scaffold:probe-app-scaffold-registry",
    capabilitySlug: "app-scaffold",
    actionId: "probe-app-scaffold-registry",
    label: "Probe registry",
    status: "mock-completed",
    summary:
      "Probe registry completed for app-scaffold and stayed inside local runtime memory.",
    evidence: ["capability-registry"],
    payload: {
      registeredCapabilities: 11,
    },
  });
  assert.deepEqual(listDebugActionResults(), [result]);

  const source = readFileSync(
    join(projectRoot, "shared/dev/debug-action-runner.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /node:fs|from "fs"|writeFile|appendFile/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
});

test("debug action runner replaces repeated actions without reordering results", () => {
  resetDebugActionResults();

  runDebugAction({
    capabilitySlug: "app-scaffold",
    actionId: "probe-app-scaffold-registry",
    label: "Probe registry",
    payload: {
      registeredCapabilities: 11,
    },
  });
  runDebugAction({
    capabilitySlug: "app-scaffold",
    actionId: "preview-live-guards",
    label: "Preview live guards",
    payload: {
      liveBlockedCapabilities: 11,
    },
  });

  runDebugAction({
    capabilitySlug: "app-scaffold",
    actionId: "probe-app-scaffold-registry",
    label: "Probe registry",
    payload: {
      registeredCapabilities: 12,
    },
  });

  const results = listDebugActionResults("app-scaffold");

  assert.deepEqual(
    results.map((result) => result.actionId),
    ["probe-app-scaffold-registry", "preview-live-guards"],
  );
  assert.deepEqual(results[0]?.payload, {
    registeredCapabilities: 12,
  });
});

test("app scaffold mock-to-live handoff covers live replacement requirements", () => {
  const doc = readFileSync(
    join(projectRoot, "shared/dev/app-scaffold/LIVE_IMPLEMENTATION.md"),
    "utf8",
  );

  assert.match(doc, /Live service and provider files/i);
  assert.match(doc, /Switch mechanism/i);
  assert.match(doc, /Required env vars and permissions/i);
  assert.match(doc, /Privacy and provenance constraints/i);
  assert.match(doc, /Replacement tests/i);
  assert.match(doc, /shared\/dev\/debug-action-runner\.ts/);
  assert.match(doc, /app\/dev\/capabilities\/\[slug\]\/page\.tsx/);
});
