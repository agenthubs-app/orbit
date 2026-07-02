import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildWantConnectActionResult,
  loadAppEventDetailRoute,
  selectWantConnectTargetContactId,
} from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import { createLiveWantConnectService } from "../../features/events/want-connect/live-service";
import { createGeneratedWantConnectProvider } from "../../features/events/want-connect/storage/generated-want-connect-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
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

async function withUnconfiguredLiveEvents<T>(
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

test("app event detail route reaches live child services instead of failing at the page factory", async () => {
  await withUnconfiguredLiveEvents(async () => {
    const routeModel = await loadAppEventDetailRoute({
      eventId: "event_01",
      mode: "live",
    });

    assert.equal(routeModel.routeState, "failure");

    if (routeModel.routeState === "failure") {
      const evidence = routeModel.evidence.join(" ");

      assert.doesNotMatch(evidence, /NOT_IMPLEMENTED/);
      assert.match(
        evidence,
        /events-live-store-unconfigured|EVENTS_LIVE_STORE_UNCONFIGURED|live-store-unconfigured/,
      );
    }
  });
});

test("app event detail action uses the live match target and allows live storage writes", async () => {
  const workspaceId = "workspace:app-event-detail-action-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T00:20:00.000Z",
    store,
    workspaceId,
  });

  const service = createLiveWantConnectService({
    now: () => "2026-07-02T00:25:00.000Z",
    provider: createGeneratedWantConnectProvider({
      now: () => "2026-07-02T00:24:00.000Z",
      store,
      workspaceId,
    }),
  });
  const matches = await service.listMatches({ eventId: "event_01" });

  assert.equal(matches.success, true);

  if (matches.success) {
    const targetContactId = selectWantConnectTargetContactId(matches.data);

    assert.equal(targetContactId, "contact_078");

    const intent = await service.createWantToConnectIntent({
      actorContactId: "contact:operator",
      eventId: "event_01",
      targetContactId,
    });
    const actionResult = buildWantConnectActionResult(intent);

    assert.ok(actionResult);
    assert.equal(actionResult.databaseWriteExecuted, true);
    assert.equal(actionResult.sideEffectsLabel, "live-storage");
    assert.match(actionResult.targetDisplayName, /曾伟/);
    assert.equal(actionResult.externalMessageSent, false);
    assert.equal(actionResult.notificationDelivered, false);
    assert.equal(actionResult.peerNotificationDelivered, false);
  }
});

test("/app/events/[id] page uses the live route service instead of the legacy event view model", async () => {
  const pageSource = source("app/(app)/app/events/[id]/page.tsx");

  assert.match(pageSource, /loadAppEventDetailRoute/);
  assert.doesNotMatch(pageSource, /getOrbitEventDetailViewModel/);

  await withUnconfiguredLiveEvents(async () => {
    const Page = (await import("../../app/(app)/app/events/[id]/page"))
      .default as (props: {
      params: Promise<{ id: string }>;
      searchParams?: Promise<Record<string, string | undefined>>;
    }) => Promise<React.ReactElement>;
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ id: "event_01" }),
        searchParams: Promise.resolve({ mode: "live" }),
      }),
    );

    assert.match(html, /Event workspace could not load/);
    assert.match(
      html,
      /EVENTS_LIVE_STORE_UNCONFIGURED|events-live-store-unconfigured/,
    );
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
  });
});
