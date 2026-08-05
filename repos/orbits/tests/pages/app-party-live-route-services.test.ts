import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { EventRecord } from "../../features/events/event-crud-and-import/contract";
import type { EventOperationsAttendeeWorkspace } from "../../features/events/event-operations/service";

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
  const controlsSource = source("app/(app)/app/party/event-operations-controls.tsx");

  assert.match(checkinPageSource, /loadAppPartyRouteViewModel/);
    assert.match(checkinPageSource, /StateView/);
    assert.match(checkinPageSource, /OrbitRealPartyCheckin/);
    assert.match(checkinPageSource, /routeModel\.party/);
    assert.doesNotMatch(checkinPageSource, /buildOrbitParty/);
    assert.doesNotMatch(partyComponentSource, /getOrbitPartyViewModel/);
    assert.match(partyComponentSource, /EventCheckInControl/);
    assert.match(controlsSource, /operations\/check-in/);
    assert.match(controlsSource, /same registration is written once/);
    assert.doesNotMatch(partyComponentSource, /Check-in is not available/);
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

test("party recommendations use individual consent requests and graph uses persisted edges", () => {
  const partyComponentSource = source(
    "app/(app)/app/dashboard/orbit-real-party.tsx",
  );
  const controlsSource = source("app/(app)/app/party/event-operations-controls.tsx");

  assert.match(partyComponentSource, /EventContactRequestControl/);
  assert.match(controlsSource, /const status = contactId/);
  assert.match(controlsSource, /encodeURIComponent\(contactId\)/);
  assert.match(controlsSource, /targetParticipantId: person\.id/);
  assert.match(controlsSource, /operations\/contact-requests/);
  assert.match(controlsSource, /\{ accept, expectedRevision: revision \}/);
  assert.match(partyComponentSource, /graph\.edges\.flatMap/);
  assert.match(partyComponentSource, /source-backed and read only/);
  assert.doesNotMatch(
    partyComponentSource,
    /Add to wallet|In card wallet|Add all current contacts to wallet|Added \$\{viewModel\.recommendations\.length\} people/,
  );
  assert.doesNotMatch(partyComponentSource, /setAdded|setBulkMessage/);
});

test("app party route loader fails closed instead of inventing a mock party model", async () => {
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

    assert.equal(routeModel.state, "route-state");
    if (routeModel.state === "route-state") {
      assert.equal(routeModel.routeState.scenario, "failure");
      assert.match(routeModel.routeState.copy.guardrail, /AI|外部/);
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

test("registered catalogue attendees do not receive catalogue rows as fake AI recommendations", async () => {
  await withMockParty(async () => {
    const { getOrbitLandingViewModel } = await import(
      "../../app/(app)/app/orbit-landing-route-view-model"
    );
    const { eventRegistrationRuntimeService } = await import(
      "../../features/events/registration/runtime"
    );
    const { loadAppPartyRouteViewModel } = await import(
      "../../app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model"
    );
    const event = getOrbitLandingViewModel().events.find(
      (item) => item.id === "event_01",
    );
    assert.ok(event);
    assert.deepEqual(event.stats.attendees, []);
    const actorId = "actor:registered-party-catalogue";

    await eventRegistrationRuntimeService.register({
      displayName: "Registered member",
      eventId: event.id,
      userId: actorId,
    });

    const routeModel = await loadAppPartyRouteViewModel(
      {
        actor: {
          displayName: "Registered member",
          email: "member@example.test",
          id: actorId,
        },
        eventId: event.id,
        language: "zh",
        mode: "mock",
      },
    );

    assert.equal(routeModel.state, "route-state");
    if (routeModel.state === "route-state") {
      assert.notEqual(routeModel.routeState.scenario, "empty");
      assert.match(routeModel.routeState.copy.guardrail, /AI|外部/);
    }

    await eventRegistrationRuntimeService.cancel({
      eventId: event.id,
      userId: actorId,
    });
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
      pathname: "/app/party",
    },
    {
      path: "app/(app)/app/party/checkin/page.tsx",
      pathname: "/app/party/checkin",
    },
    {
      path: "app/(app)/app/party/graph/page.tsx",
      pathname: "/app/party/graph",
    },
  ] as const;

  for (const page of pages) {
    const pageSource = source(page.path);

    assert.match(pageSource, /const session = await auth\(\)/);
    assert.match(pageSource, /if \(!session\?\.user\?\.id\)/);
    assert.ok(
      pageSource.includes(
        `redirect(partyLoginHref("${page.pathname}", resolvedSearchParams))`,
      ),
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
      } as unknown as { code?: string | string[]; eventId?: string | string[] },
    });

    assert.equal(routeModel.state, "route-state");
    if (routeModel.state === "route-state") {
      assert.equal(routeModel.routeState.scenario, "pending");
      assert.match(
        routeModel.routeState.evidenceIds.join(" "),
        /EVENT_OPERATIONS_NOT_CONFIGURED/,
      );
    }
  });
});

test("party keeps a sourced event pending until event operations are configured", async () => {
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
      assert.equal(routeModel.routeState.scenario, "pending");
      assert.equal(routeModel.routeState.copy.title, "Party 正在加载");
      assert.match(routeModel.routeState.copy.description, /正在等待/);
      assert.deepEqual(routeModel.routeState.recoveryActions[0], {
        href: "/app/events/event_001",
        id: "party-return-events",
        label: "返回当前活动",
        recoveryCopy:
          "名单和推荐复核完成后，再次查看这场活动。",
      });
      assert.match(
        routeModel.routeState.evidenceIds.join(" "),
        /EVENT_OPERATIONS_NOT_CONFIGURED/,
      );
    }
  });
});

test("a registered attendee loads Party from the event-operations workspace and owner-scoped real event metadata", async () => {
  const eventId = "event:e2e:registered-party";
  const organizerActorId = "actor:organizer";
  const attendeeActorId = "actor:attendee-01";
  const me = {
    actorId: attendeeActorId,
    company: "Attendee Company",
    displayName: "Registered Attendee",
    energyStyle: "structured",
    evidenceIds: ["evidence:registration:attendee-01"],
    experienceHighlight: "Built an attendee workflow",
    industry: "Event Technology",
    languages: ["en", "ja"],
    lateRegistration: false,
    needs: ["Find implementation peers"],
    offers: ["Event operations experience"],
    participantId: "participant:attendee-01",
    profileCompleteness: "complete" as const,
    role: "Operations Lead",
    seniority: "lead",
    topics: ["Event operations"],
  };
  const peer = {
    ...me,
    actorId: "actor:attendee-02",
    company: "Procurement Bridge",
    displayName: "Aiko Mori",
    evidenceIds: ["evidence:registration:attendee-02"],
    experienceHighlight: "Led enterprise procurement pilots across Japan",
    industry: "Enterprise software",
    needs: ["Model evaluation partners"],
    offers: ["Japanese enterprise buyer access"],
    participantId: "participant:attendee-02",
    role: "Partnerships Director",
    seniority: "director",
    topics: ["Enterprise procurement", "Pilot design"],
  };
  const workspace: EventOperationsAttendeeWorkspace = {
    checkIn: null,
    checkInAvailable: true,
    configuration: {
      checkInOpensAt: "2026-08-02T08:00:00.000Z",
      eventEndsAt: "2026-08-02T13:00:00.000Z",
      eventId,
      eventStartsAt: "2026-08-02T09:00:00.000Z",
      maxAttemptsPerTask: 2,
      organizerActorId,
      profileEditDeadlineAt: "2026-08-02T07:00:00.000Z",
      recommendationCount: 3,
      registrationCutoffAt: "2026-08-02T08:00:00.000Z",
      resultsAvailableAt: "2026-08-02T08:30:00.000Z",
      roundOneStartsAt: "2026-08-02T09:30:00.000Z",
      roundTwoStartsAt: "2026-08-02T10:30:00.000Z",
      shardSize: 6,
      tableSize: 4,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    contactRequests: [],
    directory: [me, peer],
    eventId,
    generationNotice: null,
    graph: null,
    me,
    profileEditable: false,
    publishedGenerationId: "generation:published-member-rationales",
    recommendations: null,
    resultsState: "ready",
    roundOneTable: {
      icebreakers: [
        "Compare the evidence behind each current priority",
        "Identify one dependency the table can unblock",
        "Agree on one concrete post-event introduction",
      ],
      memberPrompts: {
        [me.participantId]: [
          "Ask about the procurement decision owner",
          "Compare the evidence required for a pilot",
        ],
        [peer.participantId]: [
          "Ask about the evaluation workflow",
          "Compare implementation timelines",
        ],
      },
      memberRationales: {
        [me.participantId]:
          "Your event-operations experience anchors the implementation side of this table.",
        [peer.participantId]:
          "Aiko's enterprise procurement access complements the table's implementation expertise.",
      },
      members: [
        { participantId: me.participantId, seat: "R1-T1-S1" },
        { participantId: peer.participantId, seat: "R1-T1-S2" },
      ],
      rationale:
        "The table connects implementation ownership with enterprise procurement access.",
      tableNumber: 1,
      theme: "From implementation evidence to enterprise pilot",
    },
    roundTwoTable: null,
  };
  const sourceMetadata = {
    calendarSyncRequested: false as const,
    captureMethod: "manual_form" as const,
    externalNetworkRequested: false as const,
    id: "source:event:registered-party",
    importedAt: "2026-08-01T00:00:00.000Z",
    label: "Organizer-owned event record",
    liveDatabaseWriteExecuted: true,
    organizerFeedRequested: false as const,
    provider: "orbit-live-events",
    providerRecordId: eventId,
    type: "manual" as const,
  };
  const eventRecord: EventRecord = {
    aiProviderRequested: false,
    calendarProviderRequested: false,
    calendarSyncRequested: false,
    description: "A real persisted event used by registered attendees.",
    emailProviderRequested: false,
    endsAt: workspace.configuration.eventEndsAt,
    evidence: [
      {
        capturedAt: "2026-08-01T00:00:00.000Z",
        createdBy: organizerActorId,
        evidenceId: "evidence:event:registered-party",
        excerpt: "Organizer persisted the title and venue.",
        source: sourceMetadata,
      },
    ],
    externalNetworkRequested: false,
    id: eventId,
    liveDatabaseWriteExecuted: true,
    nextAction: "Attend the event.",
    notificationDelivered: false,
    organizerFeedRequested: false,
    recommendedPreparation: "Review the attendee directory.",
    relationshipContext: "Registered event participant",
    sourceMetadata,
    startsAt: workspace.configuration.eventStartsAt,
    status: "confirmed",
    title: "Real Orbit Connection Night",
    venue: "Tokyo Innovation Hall",
  };
  const calls: string[] = [];
  const { loadAppPartyRouteViewModel } = await import(
    "../../app/(app)/app/party/compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model"
  );

  const routeModel = await loadAppPartyRouteViewModel(
    {
      actor: { displayName: me.displayName, id: attendeeActorId },
      eventId,
      mode: "live",
    },
    {
      async getEventOperationsWorkspace(requestedEventId, actorId) {
        calls.push(`workspace:${requestedEventId}:${actorId}`);
        return workspace;
      },
      async loadEventMetadata(requestedEventId, ownerActorId) {
        calls.push(`metadata:${requestedEventId}:${ownerActorId}`);
        return eventRecord;
      },
    },
  );

  assert.equal(routeModel.state, "success");
  if (routeModel.state === "success") {
    assert.equal(routeModel.party.eventName, eventRecord.title);
    assert.equal(routeModel.party.eventVenue, eventRecord.venue);
    assert.equal(routeModel.party.me.participantId, me.participantId);
    assert.equal(
      routeModel.party.roundOne?.myRationale,
      workspace.roundOneTable?.memberRationales[me.participantId],
    );
    assert.equal(
      routeModel.party.roundOne?.members[0]?.groupingRationale,
      workspace.roundOneTable?.memberRationales[peer.participantId],
    );
  }
  assert.deepEqual(calls, [
    `workspace:${eventId}:${attendeeActorId}`,
    `metadata:${eventId}:${organizerActorId}`,
  ]);
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
