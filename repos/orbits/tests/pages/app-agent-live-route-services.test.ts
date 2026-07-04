import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

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
    const Page = (await import("../../app/(app)/app/agent/page")).default;
    const html = renderToStaticMarkup(await Page());

    assert.match(html, /app-agent-route-state/);
    assert.match(html, /Chat workspace could not load/);
    assert.doesNotMatch(html, /data-orbit-real-page="agent"/);
  });
});
