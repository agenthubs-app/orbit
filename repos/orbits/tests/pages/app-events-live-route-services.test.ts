import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadAppEventsRouteViewModel } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { resolveAppEventsRouteServices } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-service-factory";
import { eventChoiceToLandingEvent } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter";
import { EVENT_CONTENT } from "../../app/(app)/app/orbit-event-content";
import { fmtDay } from "../../app/(app)/app/events/events-0918/events-model";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
  // The local/cloud target switch (ea90c33) resolves ORBIT_LOCAL_DATABASE_URL;
  // clear it too so "unconfigured" does not depend on the developer machine.
  "ORBIT_DATABASE_TARGET",
  "ORBIT_LOCAL_DATABASE_URL",
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

test("app events route service bundle resolves all child services in live mode", () => {
  const resolution = resolveAppEventsRouteServices({
    actorId: "actor:events-service-bundle",
    mode: "live",
  });

  assert.equal(
    resolution.success,
    true,
    resolution.success === false ? resolution.error.message : "",
  );
  assert.equal(resolution.mode, "live");
});

test("private event list mapping does not invent organizer, roster, or registration state", () => {
  const event = eventChoiceToLandingEvent(
    {
      attendeeName: "Recommended Person",
      detailHref: "/app/events/event%3Alive",
      endsAt: "2026-09-29T11:00:00+09:00",
      evidence: [],
      id: "event:live",
      nextAction: "Review",
      readinessScore: 87,
      relationshipValue: "Potential fit",
      startsAt: "2026-09-29T10:00:00+09:00",
      status: "confirmed",
      title: "Private event",
      venue: "Tokyo",
    },
    0,
  );

  assert.equal(event.organizer, "");
  assert.equal(event.host, "");
  assert.equal(event.participantCount, 0);
  assert.deepEqual(event.stats.attendees, []);
  assert.equal(event.stats.youRsvped, false);
  assert.equal(event.youRsvped, false);
});

test("private event composition rejects recommendation and readiness data from another event", async () => {
  const resolution = resolveAppEventsRouteServices({ mode: "mock" });

  assert.equal(resolution.success, true);
  const services = resolution.service;
  const [eventResult, valueResult] = await Promise.all([
    services.events.listEvents({ actorId: "actor:isolated-events" }),
    services.eventValues.listRecommendedEvents({ limit: 3 }),
  ]);

  assert.equal(eventResult.success, true);
  assert.equal(valueResult.success, true);
  const foreignValue = valueResult.data.recommendations[0];
  const actorEvent = eventResult.data.events.find(
    (event) => event.id !== foreignValue?.eventId,
  );

  assert.ok(foreignValue);
  assert.ok(actorEvent);
  if (!foreignValue || !actorEvent) {
    throw new Error("Isolation test requires two distinct mock events.");
  }

  const [foreignAttendeeResult, foreignReadinessResult] = await Promise.all([
    services.attendeeRecommendations.listEventRecommendations({
      eventId: foreignValue.eventId,
      limit: 3,
    }),
    services.readiness.getReadiness({ eventId: foreignValue.eventId }),
  ]);

  assert.equal(foreignAttendeeResult.success, true);
  assert.equal(foreignReadinessResult.success, true);

  const model = await loadAppEventsRouteViewModel(
    "actor:isolated-events",
    {},
    {
      attendeeRecommendations: {
        ...services.attendeeRecommendations,
        listEventRecommendations: () => foreignAttendeeResult,
      },
      eventValues: {
        ...services.eventValues,
        listRecommendedEvents: () => ({
          ...valueResult,
          data: {
            ...valueResult.data,
            recommendations: [foreignValue],
          },
        }),
      },
      events: {
        ...services.events,
        listEvents: () => ({
          ...eventResult,
          data: {
            ...eventResult.data,
            events: [actorEvent],
          },
        }),
      },
      readiness: {
        ...services.readiness,
        getReadiness: () => foreignReadinessResult,
      },
    },
  );

  assert.equal(model.state, "success");
  if (model.state !== "success") {
    throw new Error(
      "Actor event must remain visible when optional data is foreign.",
    );
  }

  assert.deepEqual(
    model.workspace.eventChoices.map((event) => event.id),
    [actorEvent.id],
  );
  assert.equal(model.workspace.eventChoices[0]?.readinessScore, null);
  assert.equal(model.workspace.attendeePanel.recommendation, null);
  assert.equal(model.workspace.readiness, null);
  assert.equal(model.workspace.topCandidate, null);

  const landingEvent = eventChoiceToLandingEvent(
    model.workspace.eventChoices[0]!,
    0,
  );
  assert.equal(
    landingEvent.agenda.find((item) => item.label === "Readiness")?.description,
    "Readiness unavailable",
  );
  assert.doesNotMatch(
    JSON.stringify(model),
    new RegExp(foreignValue.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("app events route loader returns a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveEvents(async () => {
    const viewModel = await loadAppEventsRouteViewModel(
      "actor:events-page-test",
    );

    assert.equal(viewModel.state, "route-state");

    if (viewModel.state === "route-state") {
      assert.equal(viewModel.routeState.scenario, "failure");
      assert.match(
        viewModel.routeState.errorCode ?? "",
        /EVENTS_LIVE_STORE_UNCONFIGURED|EVENT_RECOMMENDATION_LIVE_STORE_UNCONFIGURED|EVENT_VALUE_RECOMMENDATION_LIVE_STORE_UNCONFIGURED|EVENT_GOAL_READINESS_LIVE_STORE_UNCONFIGURED/,
      );
      assert.match(
        viewModel.routeState.evidence.map((item) => item.id).join(" "),
        /live-store-unconfigured|live-store-empty|LIVE_STORE_UNCONFIGURED/,
      );
    }
  });
});

test("empty events route does not offer an action without a target event", async () => {
  const previousMode = process.env.ORBIT_MODULE_MODE;

  try {
    process.env.ORBIT_MODULE_MODE = "mock";
    const viewModel = await loadAppEventsRouteViewModel(
      "actor:events-empty-test",
      { scenario: "empty" },
    );

    assert.equal(viewModel.state, "route-state");
    if (viewModel.state === "route-state") {
      assert.equal(viewModel.routeState.scenario, "empty");
      assert.deepEqual(
        viewModel.routeState.recoveryActions.map((action) => action.href),
        ["/app/events"],
      );
    }
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
});

test("events composition exposes controlled scenarios without a GET action chain", async () => {
  const routeSource = source(
    "app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model.ts",
  );

  assert.match(routeSource, /controls: AppEventsRouteControls/);
  assert.doesNotMatch(
    routeSource,
    /readSearchParam|readRouteScenario|accept-top-event|acceptRecommendedEvent|actionResult:/,
  );
  assert.doesNotMatch(routeSource, /\/app\/events\?scenario=/);
});

