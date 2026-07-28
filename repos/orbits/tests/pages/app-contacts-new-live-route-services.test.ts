import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAppContactsNewRouteViewModel } from "../../app/(app)/app/contacts/new/compose-app-contacts-new-from-previously-approved-mock-first-capabilities/contacts-new-route-services";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveAcquisition<T>(
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

test("app contacts new route loader returns a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveAcquisition(async () => {
    const viewModel = await loadAppContactsNewRouteViewModel({
      mode: "live",
    }, "account:contacts-new-test");

    assert.equal(viewModel.state, "route-state");

    if (viewModel.state === "route-state") {
      assert.equal(viewModel.routeState.scenario, "failure");
      assert.match(
        JSON.stringify(viewModel.routeState),
        /LIVE_STORE_UNCONFIGURED|live-store-unconfigured/,
      );
    }
  });
});

test("/app/contacts/new renders the action workspace without preflight side effects", async () => {
  const pageSource = source("app/(app)/app/contacts/new/page.tsx");
  const importWorkspaceSource = source(
    "app/(app)/app/contacts/orbit-real-cards-import.tsx",
  );

  assert.match(pageSource, /await auth\(\)/);
  assert.match(pageSource, /session\?\.user\?\.id/);
  assert.match(pageSource, /redirect\("\/app\/account\/login\?next=/);
  assert.match(pageSource, /OrbitRealCardsImport/);
  assert.match(pageSource, /resolveBusinessCardCaptureAvailability/);
  assert.match(pageSource, /businessCardAvailability=/);
  assert.doesNotMatch(pageSource, /getOrbitContactsViewModel/);
  assert.doesNotMatch(
    pageSource,
    /loadAppContactsNewRouteViewModel|scanBusinessCard|scanQrCode|importEventAttendees/,
  );
  assert.match(importWorkspaceSource, /BusinessCardCaptureWorkspace/);
  assert.match(importWorkspaceSource, /Not connected|未连接/);
  assert.match(importWorkspaceSource, /href="\/app\/contacts"/);
  assert.doesNotMatch(
    importWorkspaceSource,
    /className="card card-hover" href="\/app\/contacts\/new"/,
  );
});
