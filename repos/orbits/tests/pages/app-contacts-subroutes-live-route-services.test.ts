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

const subroutes = [
  {
    importPath: "../../app/(app)/app/contacts/pipeline/page",
    marker: "app-contacts-pipeline-route",
    sourcePath: "app/(app)/app/contacts/pipeline/page.tsx",
  },
  {
    importPath: "../../app/(app)/app/contacts/graph/page",
    marker: "app-contacts-graph-route",
    sourcePath: "app/(app)/app/contacts/graph/page.tsx",
  },
  {
    importPath: "../../app/(app)/app/contacts/intros/page",
    marker: "app-contacts-intros-route",
    sourcePath: "app/(app)/app/contacts/intros/page.tsx",
  },
] as const;

for (const subroute of subroutes) {
  test(`${subroute.marker} uses the live contacts route service boundary`, async () => {
    const pageSource = source(subroute.sourcePath);

    assert.match(pageSource, /loadAppContactsRouteViewModel/);
    assert.match(pageSource, /contactsRouteToOrbitContactsViewModel/);
    assert.doesNotMatch(pageSource, /getOrbitContactsViewModel/);

    await withUnconfiguredLiveContacts(async () => {
      const Page = (await import(subroute.importPath)).default;
      const html = renderToStaticMarkup(
        await Page({
          searchParams: Promise.resolve({ mode: "live" }),
        }),
      );

      assert.match(html, new RegExp(subroute.marker));
      assert.match(html, /Contacts relationship console could not load/);
    });
  });
}
