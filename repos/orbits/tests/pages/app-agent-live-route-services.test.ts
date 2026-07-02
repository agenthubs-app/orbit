import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAppAgentRouteViewModel } from "../../app/(app)/app/agent/compose-app-agent-from-previously-approved-mock-first-capabilities/agent-route-view-model";
import { resolveAppAgentRouteServices } from "../../app/(app)/app/agent/compose-app-agent-from-previously-approved-mock-first-capabilities/agent-service-factory";
import { getOrbitAgentViewModel } from "../../app/(app)/app/orbit-agent-route-view-model";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveAgent<T>(
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const previousDatabaseEnv = new Map<string, string | undefined>(
    liveDatabaseEnvKeys.map((key) => [key, process.env[key]]),
  );

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    for (const key of liveDatabaseEnvKeys) {
      delete process.env[key];
    }

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }

    for (const key of liveDatabaseEnvKeys) {
      const previousValue = previousDatabaseEnv.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

test("app agent route service bundle resolves all child services in live mode", () => {
  const resolution = resolveAppAgentRouteServices("live");

  assert.equal(
    resolution.success,
    true,
    resolution.success === false ? resolution.error.message : "",
  );
  assert.equal(resolution.mode, "live");
});

test("app agent route loader returns a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveAgent(async () => {
    const viewModel = await loadAppAgentRouteViewModel();

    assert.equal(viewModel.state, "route-state");

    if (viewModel.state === "route-state") {
      assert.equal(viewModel.routeState.scenario, "failure");
      assert.equal(
        viewModel.routeState.errorCode,
        "AGENT_ACTION_QUEUE_LIVE_STORE_UNCONFIGURED",
      );
      assert.match(
        viewModel.routeState.evidence.map((item) => item.id).join(" "),
        /evidence:agent-action-queue-live-empty/,
      );
    }
  });
});

test("/app/agent page renders the real Orbit AI chat experience", async () => {
  const pageSource = source("app/(app)/app/agent/page.tsx");
  const agentSource = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(pageSource, /OrbitRealAgent/);
  assert.match(pageSource, /getOrbitAgentViewModel/);
  assert.match(pageSource, /getOrbitServerLanguage/);
  assert.match(pageSource, /localizeOrbitTree/);
  assert.doesNotMatch(pageSource, /AppAgentCommandCenter/);
  assert.match(agentSource, /data-orbit-real-page="agent"/);
});

test("Orbit AI entry copy does not expose hybrid implementation labels", () => {
  const viewModel = getOrbitAgentViewModel();

  assert.doesNotMatch(JSON.stringify(viewModel), /\bHybrid\b|\bhybrid\b/);
});
