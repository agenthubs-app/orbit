import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { loadAppContactsRouteViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { resolveAppContactsListSearchAndFilterService } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-service-factory";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import {
  createMemoryLiveRecordStore,
  type LiveRecordListQuery,
} from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

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

test("app contacts live route does not read full evidence for filtered results", async () => {
  const workspaceId = "workspace:app-contacts-focused-list";
  const rawStore = createMemoryLiveRecordStore<Record<string, unknown>>();
  const listQueries: Array<
    LiveRecordListQuery & { returnedRowCount?: number }
  > = [];
  const store = {
    ...rawStore,
    listRecords(query: LiveRecordListQuery) {
      const rows = rawStore.listRecords(query);

      listQueries.push({
        ...query,
        recordIds: query.recordIds ? [...query.recordIds] : undefined,
        returnedRowCount: rows.length,
      });

      return rows;
    },
  };

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T12:00:00.000Z",
    store: rawStore,
    workspaceId,
  });

  const service = createLiveContactsListSearchAndFilterService({
    provider: createStorageContactGraphProvider({
      sourceLabel: "App contacts focused storage",
      store,
      workspaceId,
    }),
  });
  const viewModel = await loadAppContactsRouteViewModel(
    {
      query: "North Star Foods",
    },
    {
      contactsService: service,
    },
  );

  assert.equal(viewModel.state, "success");

  if (viewModel.state === "success") {
    assert.deepEqual(
      viewModel.payload.contacts.map((contact) => contact.id),
      ["contact_001"],
    );
  }

  const evidenceQuery = listQueries.find(
    (query) => query.collectionName === "evidence",
  );

  assert.ok(evidenceQuery);
  assert.ok(evidenceQuery.recordIds);
  assert.ok(evidenceQuery.recordIds.length > 0);
  assert.ok(
    (evidenceQuery.returnedRowCount ?? 0) < defaultMockFixtures.evidence.length,
  );
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
