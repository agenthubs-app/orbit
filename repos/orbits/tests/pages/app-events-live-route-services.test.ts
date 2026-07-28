import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadAppEventsRouteViewModel } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { resolveAppEventsRouteServices } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-service-factory";
import { eventChoiceToLandingEvent } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter";
import { EVENT_CONTENT } from "../../app/(app)/app/orbit-event-content";
import { fmtDay } from "../../app/(app)/app/events/orbit-real-explore-client";

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

test("app events route service bundle resolves all child services in live mode", () => {
  const resolution = resolveAppEventsRouteServices("live");

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

test("app events route loader returns a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveEvents(async () => {
    const viewModel = await loadAppEventsRouteViewModel(
      undefined,
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
      { scenario: "empty" },
      "actor:events-empty-test",
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

test("/app/events renders the public event catalogue without requiring authentication", async () => {
  const pageSource = source("app/(app)/app/events/page.tsx");

  assert.match(pageSource, /OrbitRealExploreClient/);
  assert.match(pageSource, /getOrbitLandingViewModel/);
  assert.match(pageSource, /eventRegistrationRuntimeService\.get/);
  assert.match(pageSource, /attendees: \[\]/);
  assert.doesNotMatch(pageSource, /searchParams|scenario/);
  assert.doesNotMatch(pageSource, /redirect\("\/app\/account\/login/);
  assert.doesNotMatch(pageSource, /AppEventsCommandCenter/);
});

test("the public event catalogue keeps the full previously approved demo set", async () => {
  const module = await import(
    "../../app/(app)/app/orbit-landing-route-view-model"
  );
  const catalogue = module.getOrbitLandingViewModel();

  assert.equal(catalogue.events.length, 13);
  assert.equal(new Set(catalogue.events.map((event) => event.code)).size, 13);
});

test("event date tiles keep the day as a locale-neutral numeric token", () => {
  const date = new Date("2026-09-15T10:00:00+09:00");

  assert.equal(fmtDay(date, "en"), "15");
  assert.equal(fmtDay(date, "zh"), "15");
});

test("priority business events use premium local cover assets", () => {
  const expectedCovers = {
    event_02: "/orbit-covers/events/ai-workflow-poc-roundtable.jpg",
    event_03: "/orbit-covers/events/cross-border-ecommerce-meetup.jpg",
    event_04: "/orbit-covers/events/investor-founder-salon.jpg",
    event_05: "/orbit-covers/events/chinese-business-community-salon.jpg",
    event_signup_01: "/orbit-covers/events/kansai-business-connect.jpg",
    event_signup_02: "/orbit-covers/events/tokyo-ai-partner-meetup.jpg",
    event_signup_03: "/orbit-covers/events/investor-founder-salon.jpg",
  } as const;

  for (const [eventId, cover] of Object.entries(expectedCovers)) {
    assert.equal(EVENT_CONTENT[eventId]?.cover, cover);
    assert.match(cover, /^\/orbit-covers\/events\/.+\.jpg$/);
    assert.equal(existsSync(join(projectRoot, "public", cover)), true);
  }
});
