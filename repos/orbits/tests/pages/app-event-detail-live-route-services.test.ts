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
  type AppEventDetailBoundaryModel,
} from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import {
  eventDetailRouteToOrbitLandingEventView,
  eventDetailRouteToRelationshipContextView,
} from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
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

test("app event detail route composes the recommended event with relationship context without render-time writes", async () => {
  const routeModel = await loadAppEventDetailRoute({
    eventId: "event_001",
    mode: "mock",
  });

  assert.equal(routeModel.routeState, "success");

  if (routeModel.routeState === "success") {
    assert.equal(routeModel.canonicalEvent.id, "event_001");
    assert.equal(
      routeModel.canonicalEvent.title,
      "Seed Investor and Founder Matching Salon",
    );
    assert.equal(routeModel.attendeeRoster.event.id, "demo-event-1");
    assert.ok(routeModel.attendeeRoster.attendees.length > 0);
    assert.ok(routeModel.recommendations.recommendations.length > 0);
    assert.ok(routeModel.wantConnectMatches.matches.length > 0);
    assert.ok(routeModel.sourceConsistency.reconciledSourceCount > 0);
    assert.equal(routeModel.actionResult, null);
    assert.equal(routeModel.eventDetail.event.calendarSyncRequested, false);
    assert.equal(routeModel.eventDetail.event.calendarProviderRequested, false);
    assert.equal(routeModel.eventDetail.event.externalNetworkRequested, false);
    assert.equal(routeModel.eventDetail.event.aiProviderRequested, false);
    assert.equal(routeModel.eventDetail.event.emailProviderRequested, false);
    assert.equal(routeModel.eventDetail.event.notificationDelivered, false);
  }
});

test("app event detail route preserves success shape through presenter-owned view models", async () => {
  const routeModel = await loadAppEventDetailRoute({
    eventId: "event_001",
    mode: "mock",
  });

  assert.equal(routeModel.routeState, "success");

  if (routeModel.routeState === "success") {
    const eventView = eventDetailRouteToOrbitLandingEventView(routeModel);
    const relationshipView =
      eventDetailRouteToRelationshipContextView(routeModel);

    assert.equal(routeModel.canonicalEvent.id, "event_001");
    assert.equal(eventView.id, "event_001");
    assert.equal(eventView.name, routeModel.canonicalEvent.title);
    assert.equal(eventView.venue, routeModel.canonicalEvent.venue);
    assert.equal(eventView.startsAt, routeModel.canonicalEvent.startsAt);
    assert.equal(eventView.endsAt, routeModel.canonicalEvent.endsAt);
    assert.equal(eventView.code, "EVENT001");
    assert.equal(eventView.youRsvped, false);
    assert.equal(eventView.stats.youRsvped, false);
    assert.ok(eventView.agenda.length >= 3);
    assert.ok(eventView.stats.attendees.length > 0);

    assert.equal(relationshipView.sideEffects.sideEffectsLabel, "none");
    assert.equal(relationshipView.sideEffects.databaseWriteExecuted, false);
    assert.equal(relationshipView.sideEffects.calendarUpdateExecuted, false);
    assert.equal(relationshipView.sideEffects.externalMessageSent, false);
    assert.equal(relationshipView.sideEffects.notificationDelivered, false);
    assert.ok(relationshipView.primaryPerson.name.length > 0);
    assert.ok(relationshipView.recommendedPeople.length > 0);
    assert.ok(relationshipView.readinessItems.length > 0);
    assert.ok(relationshipView.evidenceIds.length > 0);
    assert.match(
      relationshipView.sourceConsistencySummary,
      /event detail record|match the event detail record/,
    );
  }
});

test("app event detail route preserves empty pending and failure boundaries", async () => {
  const cases = [
    {
      eventId: "event_001",
      expectedEvidence: /event-detail-empty|event-roster-empty/,
      expectedTitle: "No event workspace is ready",
      scenario: "empty",
      state: "empty",
    },
    {
      eventId: "event_001",
      expectedEvidence: /event-detail-pending|event-roster-pending/,
      expectedTitle: "Event workspace is loading",
      scenario: "pending",
      state: "pending",
    },
    {
      eventId: "event_001",
      expectedEvidence:
        /events-controlled-failure|event-detail-failure|event-detail-mock-failure/,
      expectedTitle: "Event workspace could not load",
      scenario: "failure",
      state: "failure",
    },
    {
      eventId: "event_002",
      expectedEvidence:
        /events-controlled-failure|event-detail-mock-missing|event-detail-failure/,
      expectedTitle: "Event workspace could not load",
      scenario: null,
      state: "failure",
    },
  ] as const;

  for (const item of cases) {
    const routeModel = await loadAppEventDetailRoute({
      eventId: item.eventId,
      mode: "mock",
      scenario: item.scenario,
    });

    assert.notEqual(routeModel.routeState, "success");

    const boundaryModel = routeModel as AppEventDetailBoundaryModel;

    assert.equal(boundaryModel.routeState, item.state);
    assert.equal(boundaryModel.title, item.expectedTitle);
    assert.match(boundaryModel.evidence.join(" "), item.expectedEvidence);
    assert.ok(boundaryModel.recoveryActions.length > 0);
  }
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

test("event detail reads registration state from the registration record API", () => {
  const detailSource = source(
    "app/(app)/app/events/[id]/orbit-real-event-detail.tsx",
  );

  assert.match(detailSource, /\/api\/events\/.*\/registration\?questions=false/);
  assert.match(detailSource, /registrationStatus/);
  assert.match(detailSource, /Manage registration|管理报名/);
  assert.match(detailSource, /Register again|重新报名/);
  assert.match(detailSource, /\/app\/events\/.*\/register/);
});
