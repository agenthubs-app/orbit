import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveParty<T>(
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

async function withMockParty<T>(run: () => Promise<T>): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;

  try {
    process.env.ORBIT_MODULE_MODE = "mock";

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
}

test("/app/party routes use a live-capable party loader instead of the legacy hybrid party view model", () => {
  const partyPageSource = source("app/(app)/app/party/page.tsx");
  const graphPageSource = source("app/(app)/app/party/graph/page.tsx");
  const partyModelSource = source(
    "app/(app)/app/orbit-party-route-view-model.ts",
  );
  const authoredContentPath = join(
    projectRoot,
    "app/(app)/app/orbit-party-content.ts",
  );
  const authoredPresentationPath = join(
    projectRoot,
    "app/(app)/app/orbit-party-presentation.ts",
  );

  for (const pageSource of [partyPageSource, graphPageSource]) {
    assert.match(pageSource, /loadAppPartyRouteViewModel/);
    assert.match(pageSource, /routeModel\.party/);
    assert.match(pageSource, /StateView/);
    assert.doesNotMatch(pageSource, /buildOrbitParty/);
    assert.doesNotMatch(pageSource, /getOrbitPartyViewModel/);
  }

  assert.doesNotMatch(
    partyModelSource,
    /getOrbitPartyViewModel|getOrbitHybridRouteData/,
  );
  assert.equal(existsSync(authoredContentPath), false);
  assert.equal(existsSync(authoredPresentationPath), false);
});

test("/app/party/checkin uses the same live-capable party loader without component fallback", () => {
  const checkinPageSource = source("app/(app)/app/party/checkin/page.tsx");
  const partyComponentSource = source("app/(app)/app/dashboard/orbit-real-party.tsx");

  assert.match(checkinPageSource, /loadAppPartyRouteViewModel/);
    assert.match(checkinPageSource, /StateView/);
    assert.match(checkinPageSource, /OrbitRealPartyCheckin/);
    assert.match(checkinPageSource, /routeModel\.party/);
    assert.doesNotMatch(checkinPageSource, /buildOrbitParty/);
    assert.doesNotMatch(partyComponentSource, /getOrbitPartyViewModel/);
    assert.match(partyComponentSource, /Check-in is not available/);
    assert.match(partyComponentSource, /no source-backed check-in write service/);
    assert.doesNotMatch(
      partyComponentSource,
      /Check-in complete|setCheckedIn|Checking in/,
    );
});

test("party recommendations expose a route-derived industry filter", () => {
  const partyComponentSource = source(
    "app/(app)/app/dashboard/orbit-real-party.tsx",
  );

  assert.match(partyComponentSource, /Filter by industry/);
  assert.match(partyComponentSource, /viewModel\.recommendations/);
  assert.match(partyComponentSource, /person\.industry\.trim\(\) === industry/);
  assert.doesNotMatch(
    partyComponentSource,
    /aria-label=\{t\(\{ en: "Filter", zh: "筛选" \}\)\}/,
  );
});

test("party recommendations and graph do not claim unpersisted wallet writes", () => {
  const partyComponentSource = source(
    "app/(app)/app/dashboard/orbit-real-party.tsx",
  );

  assert.match(
    partyComponentSource,
    /p\.contactId \?/,
  );
  assert.match(
    partyComponentSource,
    /encodeURIComponent\(p\.contactId\)/,
  );
  assert.match(partyComponentSource, /Attendee is not a saved contact/);
  assert.doesNotMatch(
    partyComponentSource,
    /encodeURIComponent\(p\.id\)/,
  );
  assert.match(partyComponentSource, /source-backed and read only/);
  assert.doesNotMatch(
    partyComponentSource,
    /Add to wallet|In card wallet|Add all current contacts to wallet|Added \$\{viewModel\.recommendations\.length\} people/,
  );
  assert.doesNotMatch(partyComponentSource, /setAdded|setBulkMessage/);
});

test("app party route loader returns a real party model in mock mode", async () => {
  await withMockParty(async () => {
    const { loadAppPartyRouteViewModel } = await import(
      "../../app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model"
    );
    const routeModel = await loadAppPartyRouteViewModel({
      eventId: "demo-event-1",
      searchParams: {
        scenario: "failure",
      } as unknown as {
        code?: string | string[];
        eventId?: string | string[];
      },
    });

    assert.equal(routeModel.state, "success");

    if (routeModel.state === "success") {
      assert.equal(routeModel.party.eventId, "demo-event-1");
      assert.equal(routeModel.party.eventName, "Climate founders dinner");
      assert.equal(routeModel.party.eventVenue, "Kanda Founders Table");
      assert.ok(
        ["active", "ended", "upcoming"].includes(routeModel.party.eventPhase),
      );
      assert.ok(routeModel.party.me.name);
      assert.ok(routeModel.party.recommendations.length > 0);
      assert.ok(routeModel.party.tableMates.length > 0);
      assert.equal(routeModel.party.accessCode, null);
      assert.equal(routeModel.party.checkInAvailable, false);
      assert.equal(routeModel.party.me.groupNumber, null);
      assert.equal(routeModel.party.me.seat, null);
      assert.ok(
        routeModel.party.recommendations.every(
          (person) =>
            person.contactId === null &&
            person.groupNumber === null &&
            person.seat === null,
        ),
      );
    }

    const controlledState = await loadAppPartyRouteViewModel(
      { eventId: "demo-event-1" },
      undefined,
      { scenario: "empty" },
    );
    assert.equal(controlledState.state, "route-state");
    if (controlledState.state === "route-state") {
      assert.equal(controlledState.routeState.scenario, "empty");
    }
  });
});

test("registered catalogue attendees can open the read-only Party experience", async () => {
  await withMockParty(async () => {
    const { getOrbitLandingViewModel } = await import(
      "../../app/(app)/app/orbit-landing-route-view-model"
    );
    const { loadAppPartyRouteViewModel } = await import(
      "../../app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model"
    );
    const event = getOrbitLandingViewModel().events.find(
      (item) => item.id === "event_01",
    );
    assert.ok(event);
    let observedRegistration: { actorId: string; eventId: string } | null =
      null;

    const routeModel = await loadAppPartyRouteViewModel(
      {
        actor: {
          displayName: "Registered member",
          email: "member@example.test",
          id: "actor:registered",
        },
        eventId: event.id,
        language: "zh",
        mode: "mock",
      },
      {
        getCatalogueEvents: () => [event],
        getRegistrationStatus: async (eventId, actorId) => {
          observedRegistration = { actorId, eventId };
          return "rsvped";
        },
      },
    );

    assert.deepEqual(observedRegistration, {
      actorId: "actor:registered",
      eventId: event.id,
    });
    assert.equal(routeModel.state, "success");
    if (routeModel.state === "success") {
      assert.equal(routeModel.party.eventId, event.id);
      assert.equal(routeModel.party.checkInAvailable, false);
      assert.equal(
        routeModel.party.recommendations.length,
        event.stats.attendees.length,
      );
      assert.ok(
        routeModel.party.recommendations.every(
          (person) =>
            person.contactId === null &&
            person.groupNumber === null &&
            person.seat === null,
        ),
      );
    }
  });
});

test("unregistered catalogue viewers do not receive Party attendee context", async () => {
  await withMockParty(async () => {
    const { getOrbitLandingViewModel } = await import(
      "../../app/(app)/app/orbit-landing-route-view-model"
    );
    const { loadAppPartyRouteViewModel } = await import(
      "../../app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model"
    );
    const event = getOrbitLandingViewModel().events.find(
      (item) => item.id === "event_01",
    );
    assert.ok(event);

    const routeModel = await loadAppPartyRouteViewModel(
      {
        actor: {
          displayName: "Unregistered member",
          id: "actor:unregistered",
        },
        eventId: event.id,
        language: "zh",
        mode: "mock",
      },
      {
        getCatalogueEvents: () => [event],
        getRegistrationStatus: async () => null,
      },
    );

    assert.equal(routeModel.state, "route-state");
  });
});

test("/app/dashboard and /app/party remain separate canonical routes", () => {
  const dashboardPageSource = source("app/(app)/app/dashboard/page.tsx");
  const partyPageSource = source("app/(app)/app/party/page.tsx");

  assert.match(dashboardPageSource, /loadAppDashboardRouteViewModel/);
  assert.match(dashboardPageSource, /OrbitRealDashboard/);
  assert.doesNotMatch(
    dashboardPageSource,
    /redirect\("\/app\/party"\)|buildOrbitParty|OrbitRealParty/,
  );
  assert.match(partyPageSource, /loadAppPartyRouteViewModel/);
  assert.match(partyPageSource, /OrbitRealParty/);
});

test("party pages require an authenticated actor and pass it to the shared loader", () => {
  const pages = [
    {
      path: "app/(app)/app/party/page.tsx",
      next: "%2Fapp%2Fparty",
    },
    {
      path: "app/(app)/app/party/checkin/page.tsx",
      next: "%2Fapp%2Fparty%2Fcheckin",
    },
    {
      path: "app/(app)/app/party/graph/page.tsx",
      next: "%2Fapp%2Fparty%2Fgraph",
    },
  ] as const;

  for (const page of pages) {
    const pageSource = source(page.path);

    assert.match(pageSource, /const session = await auth\(\)/);
    assert.match(pageSource, /if \(!session\?\.user\?\.id\)/);
    assert.match(
      pageSource,
      new RegExp(`redirect\\("/app/account/login\\?next=${page.next}"\\)`),
    );
    assert.match(pageSource, /actor: \{/);
    assert.match(pageSource, /id: session\.user\.id/);
  }
});

test("party URL query mode cannot activate mock fixtures", async () => {
  await withUnconfiguredLiveParty(async () => {
    const { loadAppPartyRouteViewModel } = await import(
      "../../app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model"
    );
    const routeModel = await loadAppPartyRouteViewModel({
      actor: {
        displayName: "Authenticated member",
        email: "member@example.com",
        id: "actor:test",
      },
      searchParams: {
        eventId: "demo-event-1",
        mode: "mock",
      },
    });

    assert.equal(routeModel.state, "route-state");
    if (routeModel.state === "route-state") {
      assert.equal(routeModel.routeState.scenario, "failure");
      assert.match(
        routeModel.routeState.evidenceIds.join(" "),
        /live-store-unconfigured|LIVE_STORE_UNCONFIGURED/,
      );
    }
  });
});

test("party treats a sourced event without reviewed people context as empty", async () => {
  await withMockParty(async () => {
    const { loadAppPartyRouteViewModel } = await import(
      "../../app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model"
    );
    const routeModel = await loadAppPartyRouteViewModel({
      actor: {
        displayName: "Authenticated member",
        email: "member@example.com",
        id: "actor:test",
      },
      eventId: "event_001",
      language: "zh",
      mode: "mock",
    });

    assert.equal(routeModel.state, "route-state");
    if (routeModel.state === "route-state") {
      assert.equal(routeModel.routeState.scenario, "empty");
      assert.equal(routeModel.routeState.copy.title, "Party 尚未就绪");
      assert.match(routeModel.routeState.copy.description, /已找到所选活动/);
      assert.match(routeModel.routeState.copy.description, /参会者或推荐上下文/);
      assert.deepEqual(routeModel.routeState.recoveryActions[0], {
        href: "/app/events/event_001",
        id: "party-return-events",
        label: "返回当前活动",
        recoveryCopy:
          "先复核或导入这场活动的参会者上下文，再重试 Party 模式。",
      });
      assert.match(
        routeModel.routeState.evidenceIds.join(" "),
        /event-roster-controlled-failure/,
      );
    }
  });
});

test("party distinguishes a missing event selection from missing people context", async () => {
  const { loadAppPartyRouteViewModel } = await import(
    "../../app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model"
  );
  const routeModel = await loadAppPartyRouteViewModel({
    language: "zh",
    mode: "live",
  });

  assert.equal(routeModel.state, "route-state");
  if (routeModel.state === "route-state") {
    assert.equal(routeModel.routeState.scenario, "empty");
    assert.equal(
      routeModel.routeState.copy.description,
      "尚未选择要进入 Party 模式的活动。",
    );
    assert.match(routeModel.routeState.copy.nextStep, /先打开一场/);
    assert.equal(routeModel.routeState.evidenceIds.length, 0);
    assert.equal(routeModel.routeState.recoveryActions[0]?.href, "/app/events");
    assert.equal(routeModel.routeState.recoveryActions[0]?.label, "返回活动");
  }
});
