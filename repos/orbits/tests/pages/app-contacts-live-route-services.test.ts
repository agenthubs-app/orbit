import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { loadAppContactsRouteViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { resolveAppContactsListSearchAndFilterService } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-service-factory";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveContacts<T>(
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

test("app contacts route service resolves live contacts search", () => {
  const resolution = resolveAppContactsListSearchAndFilterService("live");

  assert.equal(
    resolution.success,
    true,
    resolution.success === false ? resolution.error.message : "",
  );
  assert.equal(resolution.mode, "live");
});

test("app contacts route loader returns a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveContacts(async () => {
    const viewModel = await loadAppContactsRouteViewModel();

    assert.equal(viewModel.state, "failure");
    if (viewModel.state === "failure") {
      assert.match(
        viewModel.failure.evidenceIds.join(" "),
        /CONTACTS_LIVE_STORE_UNCONFIGURED|evidence:contacts-live-store-unconfigured/,
      );
    }
  });
});

test("/app/contacts page renders the live-capable product contacts UI", async () => {
  const pageSource = source("app/(app)/app/contacts/page.tsx");

  assert.match(pageSource, /OrbitRealCardsList/);
  assert.match(pageSource, /contactsRouteToOrbitContactsViewModel/);
  assert.doesNotMatch(pageSource, /AppContactsCommandCenter/);

  await withUnconfiguredLiveContacts(async () => {
    const pageModule = await import("../../app/(app)/app/contacts/page");
    const Page = pageModule.default;
    const html = renderToStaticMarkup(await Page());

    assert.match(html, /shared-ui-state-view/);
    assert.match(html, /Contacts relationship console could not load/);
  });
});
