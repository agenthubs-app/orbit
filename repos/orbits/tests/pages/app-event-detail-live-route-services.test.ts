import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildWantConnectActionResult,
  classifyComposedEventContextFailures,
  loadAppEventDetailRoute,
  selectWantConnectTargetContactId,
  type AppEventDetailBoundaryModel,
} from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import {
  eventDetailRouteToOrbitLandingEventView,
  eventDetailRouteToRelationshipContextView,
} from "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
import { canUseEventDetailHistoryBack } from "../../app/(app)/app/events/[id]/orbit-real-event-detail";
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

test("event detail production route does not silently force a canonical id into mock mode", () => {
  const pageSource = source("app/(app)/app/events/[id]/page.tsx");

  assert.doesNotMatch(pageSource, /canonicalDemoEventDetailIds/);
  assert.doesNotMatch(pageSource, /has\(input\.eventId\)\s*\?\s*"mock"/);
  assert.match(pageSource, /const routeMode = undefined/);
  assert.doesNotMatch(pageSource, /readSearchParam\(query, "mode"\)/);
  assert.doesNotMatch(pageSource, /readSearchParam\(query, "scenario"\)/);
  assert.doesNotMatch(pageSource, /action: readSearchParam/);
  assert.doesNotMatch(pageSource, /targetContactId: readSearchParam/);
});

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

test("missing composed event context is empty only when every child reports event not found", () => {
  assert.equal(
    classifyComposedEventContextFailures([
      "EVENT_ATTENDEE_ROSTER_EVENT_NOT_FOUND",
      "EVENT_RECOMMENDATION_EVENT_NOT_FOUND",
      "EVENT_GOAL_READINESS_EVENT_NOT_FOUND",
      "WANT_CONNECT_EVENT_NOT_FOUND",
      "EVENT_ENCOUNTER_NOTE_EVENT_NOT_FOUND",
      "POST_EVENT_REVIEW_EVENT_NOT_FOUND",
    ]),
    "empty",
  );
  assert.equal(classifyComposedEventContextFailures([]), null);
  assert.equal(
    classifyComposedEventContextFailures([
      "EVENT_ATTENDEE_ROSTER_EVENT_NOT_FOUND",
      "EVENT_GOAL_READINESS_LIVE_STORE_UNCONFIGURED",
    ]),
    "failure",
  );
  assert.equal(
    classifyComposedEventContextFailures(["EVENTS_EVENT_NOT_FOUND"]),
    "failure",
  );
});

test("app event detail route composes the recommended event with relationship context without render-time writes", async () => {
  const routeModel = await loadAppEventDetailRoute({
    eventId: "demo-event-1",
    mode: "mock",
  });

  assert.equal(routeModel.routeState, "success");

  if (routeModel.routeState === "success") {
    assert.equal(routeModel.canonicalEvent.id, "demo-event-1");
    assert.equal(
      routeModel.canonicalEvent.title,
      "Climate founders dinner",
    );
    assert.equal(routeModel.attendeeRoster.event.id, "demo-event-1");
    assert.equal(routeModel.recommendations.event.id, "demo-event-1");
    assert.equal(routeModel.readiness.event.id, "demo-event-1");
    assert.equal(routeModel.wantConnectMatches.event.id, "demo-event-1");
    assert.equal(routeModel.encounterNote.event.id, "demo-event-1");
    assert.equal(routeModel.postEventReview.event.id, "demo-event-1");
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
    eventId: "demo-event-1",
    mode: "mock",
  });

  assert.equal(routeModel.routeState, "success");

  if (routeModel.routeState === "success") {
    const eventView = eventDetailRouteToOrbitLandingEventView(routeModel);
    const relationshipView =
      eventDetailRouteToRelationshipContextView(routeModel);

    assert.equal(routeModel.canonicalEvent.id, "demo-event-1");
    assert.equal(eventView.id, "demo-event-1");
    assert.equal(eventView.name, routeModel.canonicalEvent.title);
    assert.equal(eventView.venue, routeModel.canonicalEvent.venue);
    assert.equal(eventView.startsAt, routeModel.canonicalEvent.startsAt);
    assert.equal(eventView.endsAt, routeModel.canonicalEvent.endsAt);
    assert.equal(eventView.code, "DEMOEVENT1");
    assert.equal(eventView.youRsvped, true);
    assert.equal(eventView.stats.youRsvped, true);
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
      eventId: "demo-event-1",
      expectedEvidence: /event-detail-empty|event-roster-empty/,
      expectedTitle: "No event workspace is ready",
      scenario: "empty",
      state: "empty",
    },
    {
      eventId: "demo-event-1",
      expectedEvidence: /event-detail-pending|event-roster-pending/,
      expectedTitle: "Event workspace is loading",
      scenario: "pending",
      state: "pending",
    },
    {
      eventId: "demo-event-1",
      expectedEvidence:
        /events-controlled-failure|event-detail-failure|event-detail-mock-failure/,
      expectedTitle: "Event workspace could not load",
      scenario: "failure",
      state: "failure",
    },
    {
      eventId: "event_001",
      expectedEvidence:
        /event-roster-controlled-failure|event-recommendation-controlled-failure/,
      expectedTitle: "No event workspace is ready",
      scenario: null,
      state: "empty",
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
    assert.equal(
      selectWantConnectTargetContactId(matches.data, "contact:not-in-event"),
      "contact_078",
    );

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

test("/app/events/[id] serves public catalogue detail before private owner fallback", async () => {
  const pageSource = source("app/(app)/app/events/[id]/page.tsx");

  assert.match(pageSource, /loadAppEventDetailRoute/);
  assert.match(pageSource, /getOrbitLandingViewModel/);
  assert.match(pageSource, /eventRegistrationRuntimeService\.get/);
  assert.match(pageSource, /attendees: registered \?/);
  assert.match(pageSource, /auth\(\)/);
  assert.match(pageSource, /const id = eventRouteId\(routeId\)/);
  assert.match(pageSource, /decodeURIComponent\(value\)/);
  assert.match(pageSource, /getEvent\(\{\s*actorId: session\.user\.id/);
  assert.match(
    pageSource,
    /loadRegistrationProfileGuideForCurrentTestUser\(\{\s*actorId: session\.user\.id/,
  );
});

test("event presentation preserves the source-backed attendee roster and count", async () => {
  const { getOrbitLandingViewModel } = await import(
    "../../app/(app)/app/orbit-landing-route-view-model"
  );
  const { presentOrbitEvent } = await import(
    "../../app/(app)/app/orbit-event-presentation"
  );
  const event = getOrbitLandingViewModel().events.find(
    (item) => item.id === "event_01",
  );
  assert.ok(event);

  const presented = presentOrbitEvent(event, "zh");

  assert.equal(presented.participantCount, event.participantCount);
  assert.equal(presented.stats.count, event.stats.count);
  assert.deepEqual(presented.stats.attendees, event.stats.attendees);
  assert.ok(presented.about?.length);
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
  assert.match(detailSource, /const canSeeAttendees = youRsvped/);
  assert.doesNotMatch(
    detailSource,
    /canSeeAttendees = youRsvped \|\| event\.status === "ended"/,
  );
});

test("event detail with no organizer source renders a non-link pending boundary", () => {
  const detailSource = source(
    "app/(app)/app/events/[id]/orbit-real-event-detail.tsx",
  );

  assert.match(detailSource, /if \(!organizer\)/);
  assert.match(detailSource, /Organizer pending/);
  assert.match(detailSource, /主办方待确认/);
  assert.match(detailSource, /活动来源暂未提供主办方信息/);
});

test("event detail returns only to a distinct same-origin Orbit product page", () => {
  const current = "http://localhost:3110/app/events/EVT01";

  assert.equal(
    canUseEventDetailHistoryBack(
      "http://localhost:3110/app/o/evt01",
      current,
    ),
    true,
  );
  assert.equal(
    canUseEventDetailHistoryBack(
      "http://localhost:3110/app/events?status=ended",
      current,
    ),
    true,
  );
  assert.equal(canUseEventDetailHistoryBack(current, current), false);
  assert.equal(
    canUseEventDetailHistoryBack("https://example.com/app/events", current),
    false,
  );
  assert.equal(canUseEventDetailHistoryBack("", current), false);
  assert.equal(canUseEventDetailHistoryBack("not a valid url", current), false);
});

test("event matchmaking hides raw service errors behind product copy", () => {
  const matchmakingSource = source(
    "app/(app)/app/events/[id]/orbit-event-matchmaking.tsx",
  );

  assert.match(matchmakingSource, /const visibleError = error/);
  assert.match(matchmakingSource, /当前活动暂时没有可用的撮合数据/);
  assert.match(matchmakingSource, /\{visibleError\}/);
  assert.doesNotMatch(matchmakingSource, />\s*\{error\}\s*</);
});

test("event matchmaking returns guests to the exact app event after login", () => {
  const matchmakingSource = source(
    "app/(app)/app/events/[id]/orbit-event-matchmaking.tsx",
  );

  assert.match(
    matchmakingSource,
    /encodeURIComponent\(`\/app\/events\/\$\{eventId\}`\)/,
  );
});

test("ended event matchmaking does not offer a dead registration route", () => {
  const detailSource = source(
    "app/(app)/app/events/[id]/orbit-real-event-detail.tsx",
  );
  const matchmakingSource = source(
    "app/(app)/app/events/[id]/orbit-event-matchmaking.tsx",
  );

  assert.match(
    detailSource,
    /registrationOpen=\{event\.status !== "ended"\}/,
  );
  assert.match(matchmakingSource, /会后撮合仅限结束前已确认报名的参与者/);
  assert.match(matchmakingSource, /活动已结束，报名已关闭/);
  assert.match(matchmakingSource, /\{registrationOpen \? \(/);
});
