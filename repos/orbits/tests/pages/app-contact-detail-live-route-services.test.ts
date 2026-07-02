import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";

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

test("app contact detail route reaches live child services instead of failing at the page factory", async () => {
  await withUnconfiguredLiveContacts(async () => {
    const routeModel = await loadAppContactDetailRoute({
      contactId: "contact_078",
      mode: "live",
    });

    assert.equal(routeModel.routeState, "failure");

    if (routeModel.routeState === "failure") {
      const evidence = routeModel.evidence.join(" ");

      assert.doesNotMatch(evidence, /NOT_IMPLEMENTED/);
      assert.match(
        evidence,
        /CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED|CONNECTION_LIVE_STORE_UNCONFIGURED|RELATIONSHIP_VALUE_LIVE_STORE_UNCONFIGURED|live-store-unconfigured/,
      );
    }
  });
});

test("/app/contacts/[id] page uses the live route service instead of the legacy contacts view model", async () => {
  const pageSource = source("app/(app)/app/contacts/[id]/page.tsx");

  assert.match(pageSource, /loadAppContactDetailRoute/);
  assert.doesNotMatch(pageSource, /getOrbitContactsViewModel/);

  await withUnconfiguredLiveContacts(async () => {
    const Page = (await import("../../app/(app)/app/contacts/[id]/page"))
      .default as (props: {
      params: Promise<{ id: string }>;
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: "contact_078" }),
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );

    assert.match(html, /Contact detail could not load/);
    assert.match(
      html,
      /CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED|contact_detail_live_store_unconfigured/,
    );
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
  });
});
