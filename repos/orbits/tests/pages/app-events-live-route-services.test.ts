import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadAppEventsRouteViewModel } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { resolveAppEventsRouteServices } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-service-factory";
import { eventChoiceToLandingEvent } from "../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter";
import { EVENT_CONTENT } from "../../app/(app)/app/orbit-event-content";
import { fmtDay } from "../../app/(app)/app/events/orbit-real-explore-client";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();

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

test("/app/events renders the public event catalogue without requiring authentication", async () => {
  const pageSource = source("app/(app)/app/events/page.tsx");
  const landingSource = source(
    "app/(app)/app/orbit-landing-route-view-model.ts",
  );

  assert.match(pageSource, /OrbitRealExploreClient/);
  assert.match(pageSource, /createConfiguredCanonicalPublicEventCatalogue/);
  assert.match(pageSource, /getOrbitLandingViewModelFromCatalogue/);
  assert.match(pageSource, /readRuntimeEventRegistrationStates/);
  assert.doesNotMatch(pageSource, /readPublicEventCatalogue/u);
  assert.doesNotMatch(pageSource, /readEventOperationsCatalogueSummaries/u);
  assert.doesNotMatch(pageSource, /eventRegistrationRuntimeService\.get/);
  assert.doesNotMatch(pageSource, /Promise\.all\(\s*catalogue\.events\.map/);
  assert.match(pageSource, /attendees: \[\]/);
  assert.match(pageSource, /source-backed public roster aggregate/u);
  assert.doesNotMatch(pageSource, /participantCount\s*[+:]\s*.*\+\s*1/u);
  assert.match(pageSource, /searchParams/);
  assert.doesNotMatch(pageSource, /scenario/);
  assert.doesNotMatch(pageSource, /redirect\("\/app\/account\/login/);
  assert.doesNotMatch(pageSource, /AppEventsCommandCenter/);
  assert.doesNotMatch(
    landingSource,
    /eventRegistrationRuntimeService|postgres-live-record-store|getOrbitHybridRouteData/,
  );
});

test("the public event catalogue keeps the full previously approved demo set", async () => {
  const module = await import("../support/legacy-orbit-landing-view");
  const catalogue = module.getOrbitLandingViewModel();

  assert.equal(catalogue.events.length, 13);
  assert.equal(new Set(catalogue.events.map((event) => event.code)).size, 13);
  assert.equal("getOrbitEventDetailViewModel" in module, false);
  assert.equal(catalogue.account.fullName, "Orbit");
  assert.deepEqual(catalogue.connections, []);
  assert.ok(
    catalogue.events.every(
      (event) =>
        event.stats.attendees.length === 0 &&
        event.stats.authed === false &&
        event.stats.youRsvped === false &&
        event.youRsvped === false,
    ),
  );
  assert.ok(
    catalogue.events.some(
      (event) => event.participantCount > 0 && event.stats.count > 0,
    ),
  );
});

test("public event presentation derives agenda clocks from canonical source ranges", async () => {
  const { getOrbitLandingViewModel } =
    await import("../support/legacy-orbit-landing-view");
  const { presentOrbitEvent } =
    await import("../../app/(app)/app/orbit-event-presentation");
  const catalogue = getOrbitLandingViewModel();
  const expected = {
    event_01: {
      code: "EVT01",
      endsAt: "2026-02-15T12:00:00+09:00",
      times: ["10:00", "10:30", "11:00", "11:30"],
    },
    event_signup_01: {
      code: "EVTSIGNUP01",
      endsAt: "2026-08-18T12:00:00+09:00",
      times: ["10:00", "10:30", "11:00", "11:30"],
    },
    event_signup_02: {
      code: "EVTSIGNUP02",
      endsAt: "2026-09-01T16:00:00+09:00",
      times: ["14:00", "14:30", "15:00", "15:30"],
    },
    event_signup_03: {
      code: "EVTSIGNUP03",
      endsAt: "2026-09-15T20:00:00+09:00",
      times: ["18:00", "18:30", "19:00", "19:30"],
    },
  } as const;

  for (const [eventId, source] of Object.entries(expected)) {
    const event = catalogue.events.find((item) => item.id === eventId);
    assert.ok(event, `missing ${eventId}`);
    assert.equal(event.code, source.code);
    assert.equal(event.endsAt, source.endsAt);
    assert.ok(Date.parse(event.endsAt) > Date.parse(event.startsAt));

    const presented = presentOrbitEvent(event, "zh");
    const logistics = presented.about?.find((section) => section.icon === "📍");

    assert.deepEqual(
      presented.agenda.map((item) => item.time),
      source.times,
    );
    assert.ok(
      presented.agenda.every((item) => {
        const [hour, minute] = item.time.split(":").map(Number);
        const agendaTime = new Date(event.startsAt);
        agendaTime.setHours(hour ?? 0, minute ?? 0, 0, 0);
        return agendaTime.getTime() < Date.parse(event.endsAt);
      }),
    );
    assert.match(logistics?.body ?? "", new RegExp(event.venue, "u"));
    assert.doesNotMatch(logistics?.body ?? "", /平日晚间|工作日午后|约三小时/u);
  }
});

test("registered catalogue attendee access follows persisted registration lifecycle", async () => {
  const actorId = `actor:catalogue-roster-lifecycle:${randomUUID()}`;
  const eventId = "event_signup_01";
  const { eventRegistrationRuntimeService } =
    await import("../../features/events/registration/runtime");
  const { getOrbitRegisteredEventViewModel } =
    await import("../../app/(app)/app/orbit-registered-event-route-view-model");
  const { resolveCanonicalPublicEventView } =
    await import("../../app/(app)/app/canonical-public-event-view");
  const event = await resolveCanonicalPublicEventView(eventId);
  assert.ok(event);

  assert.equal(
    await getOrbitRegisteredEventViewModel({ actorId, event }),
    null,
  );
  assert.equal(
    await resolveCanonicalPublicEventView("unknown-public-event"),
    null,
  );
  assert.equal(
    await getOrbitRegisteredEventViewModel({ actorId: "", event }),
    null,
  );
  assert.equal(
    await getOrbitRegisteredEventViewModel({
      actorId: "actor:catalogue-roster-other",
      event,
    }),
    null,
  );

  await eventRegistrationRuntimeService.register({
    answers: {
      desiredOutcome: "找到两位能共同验证日本制造业渠道合作假设的长期伙伴",
      energyStyle: "先听清背景，再围绕真实项目做小组深聊",
      experienceHighlight: "带领双语团队把工业 AI 试点推进到三家集团正式采购",
      followUpPreference: "会后四十八小时内邮件同步纪要，下周安排线上复盘",
      industry: "工业人工智能、气候科技与跨境企业软件",
      positioning: "负责跨境增长与生态合作的产品负责人",
      targetAttendees: "拥有日本制造业渠道并在落地边缘 AI 的业务负责人",
      valueOffered: "中日市场进入实验、企业采购决策链经验与产业伙伴引荐",
    },
    displayName: "目录名单测试用户",
    eventId,
    userId: actorId,
  });

  const registered = await getOrbitRegisteredEventViewModel({
    actorId,
    event,
  });

  assert.ok(registered);
  assert.equal(registered.stats.authed, true);
  assert.equal(registered.stats.youRsvped, true);
  assert.equal(registered.youRsvped, true);
  assert.equal(registered.stats.attendees.length, registered.participantCount);
  assert.ok(registered.stats.attendees.length > 0);

  await eventRegistrationRuntimeService.cancel({
    eventId,
    userId: actorId,
  });

  assert.equal(
    await getOrbitRegisteredEventViewModel({ actorId, event }),
    null,
  );
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
