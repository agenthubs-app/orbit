import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

test("/app/agent page renders the real Orbit AI chat experience", async () => {
  const pageSource = source("app/(app)/app/agent/page.tsx");
  const agentSource = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(pageSource, /OrbitRealAgent/);
  assert.match(pageSource, /loadAppChatRouteViewModel/);
  assert.match(pageSource, /chatRouteToOrbitAgentViewModel/);
  assert.match(pageSource, /StateView/);
  assert.match(pageSource, /getOrbitServerLanguage/);
  assert.match(pageSource, /localizeOrbitTree/);
  assert.doesNotMatch(pageSource, /AppAgentCommandCenter/);
  assert.doesNotMatch(pageSource, /getOrbitAgentViewModel/);
  assert.match(agentSource, /data-orbit-real-page="agent"/);
});

test("/app/agent page renders a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveAgent(async () => {
    const { loadAppChatRouteViewModel } = await import(
      "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model"
    );
    const viewModel = await loadAppChatRouteViewModel();

    assert.equal(viewModel.state, "route-state");
    if (viewModel.state === "route-state") {
      assert.equal(viewModel.routeState.scenario, "failure");
      assert.equal(
        viewModel.routeState.errorCode,
        "CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED",
      );
      assert.match(viewModel.routeState.copy.title, /could not load/i);
    }

    const pageSource = source("app/(app)/app/agent/page.tsx");
    assert.match(pageSource, /AgentRouteStateBoundary/);
    assert.match(pageSource, /routeModel\.routeState/);
  });
});
