import assert from "node:assert/strict";
import test from "node:test";

import {
  createCanonicalPublicEventCatalogue,
  type PublicEventRecordCatalogueSnapshot,
} from "../../features/events/core/public-catalogue";
import type { PublishedCanonicalEvent } from "../../features/events/core/contract";
import type { EventOperationsCatalogueSummary } from "../../features/events/event-operations/repository";
import type { EventRecord } from "../../features/events/event-crud-and-import/contract";
import { matchedTokensForText } from "../../features/events/event-recommendation-tool";
import type { EventRegistration } from "../../features/events/registration/contract";
import {
  createPublicGoalRecommendationsService,
  type PublicGoalRecommendationsDependencies,
} from "../../features/events/public-goal-recommendations";

const NOW = new Date("2026-09-17T00:00:00.000Z");
const ACCOUNT_ID = "account:me";
const OTHER_ACCOUNT_ID = "account:other";
type Membership = Pick<EventRegistration, "eventId" | "status" | "userId">;

function event(input: Partial<EventRecord> = {}): EventRecord {
  const id = input.id ?? "event:match";
  const startsAt = input.startsAt ?? "2026-09-20T10:00:00.000Z";
  const endsAt = input.endsAt ?? "2026-09-20T12:00:00.000Z";
  const sourceMetadata = {
    calendarSyncRequested: false as const,
    captureMethod: "organizer_feed" as const,
    externalNetworkRequested: false as const,
    id: `event-source:${id}`,
    importedAt: NOW.toISOString(),
    label: "fixture-catalogue",
    liveDatabaseWriteExecuted: false,
    organizerFeedRequested: false as const,
    provider: "fixture-catalogue",
    providerRecordId: id,
    type: "event_import" as const,
  };
  return {
    aiProviderRequested: false,
    calendarProviderRequested: false,
    calendarSyncRequested: false,
    description: "AI founders meet to exchange practical lessons.",
    emailProviderRequested: false,
    endsAt,
    evidence: [
      {
        capturedAt: NOW.toISOString(),
        createdBy: "recommendation-test",
        evidenceId: `evidence:${id}`,
        excerpt: input.description ?? "AI founders meet to exchange practical lessons.",
        source: sourceMetadata,
      },
    ],
    externalNetworkRequested: false,
    id,
    liveDatabaseWriteExecuted: false,
    nextAction: "Register for the event.",
    notificationDelivered: false,
    organizerFeedRequested: false,
    recommendedPreparation: "Review the event details.",
    relationshipContext: "A useful community event.",
    sourceMetadata,
    startsAt,
    status: "imported",
    title: "AI Founders Circle",
    venue: "Orbit Room",
    ...input,
  };
}

function snapshot(
  records: readonly EventRecord[],
  overrides: Partial<Omit<PublicEventRecordCatalogueSnapshot, "records">> = {},
): PublicEventRecordCatalogueSnapshot {
  return {
    generatedAt: NOW.toISOString(),
    organizerIds: Object.fromEntries(
      records.map((record) => [record.id, "account:organizer"]),
    ),
    participantCounts: Object.fromEntries(
      records.map((record) => [record.id, 0]),
    ),
    publicCodes: Object.fromEntries(
      records.map((record) => [record.id, `public-${record.id}`]),
    ),
    records,
    ...overrides,
  };
}

function membership(
  eventId: string,
  status: Membership["status"] = "rsvped",
  userId = ACCOUNT_ID,
): Membership {
  return { eventId, status, userId };
}

function publishedEvent(input: {
  eventId: string;
  organizerActorId: string;
  publicCode: string;
}): PublishedCanonicalEvent {
  return {
    archivedAt: null,
    cancelledAt: null,
    description: "A published event.",
    endsAt: "2026-09-20T12:00:00.000Z",
    eventId: input.eventId,
    eventVersion: 1,
    lifecycleState: "published",
    organizerActorId: input.organizerActorId,
    phase: "upcoming",
    publicCode: input.publicCode,
    sourcePayload: { evidenceIds: [`evidence:${input.eventId}`] },
    startsAt: "2026-09-20T10:00:00.000Z",
    timezone: "UTC",
    title: "Published event",
    venue: "Published room",
    workspaceId: "workspace:recommendations",
  };
}

function upstreamCatalogueFor(
  events: readonly PublishedCanonicalEvent[],
) {
  const summaries: readonly EventOperationsCatalogueSummary[] = events.map(
    (value) => ({
      activeRegistrationCount: 0,
      attendeeResultsAvailable: false,
      eventId: value.eventId,
      hasPublishedResults: false,
    }),
  );
  return createCanonicalPublicEventCatalogue({
    eventCoreService: {
      getEvent: async () => null,
      getPublishedEvent: async () => null,
      listEvents: async () => events,
      listPublishedEvents: async () => events,
    },
    now: NOW,
    readParticipantSummaries: async () => summaries,
  });
}

function serviceFor(input: {
  goal?: unknown;
  memberships?: readonly Membership[];
  now?: Date;
  readCatalogue?: PublicEventRecordCatalogueSnapshot;
  readCatalogueError?: Error;
  readGoalError?: Error;
  membershipsError?: Error;
} = {}): {
  calls: { catalogue: Date[]; goal: string[]; memberships: Array<{ accountId: string; eventIds: readonly string[] }> };
  service: ReturnType<typeof createPublicGoalRecommendationsService>;
} {
  const calls = {
    catalogue: [] as Date[],
    goal: [] as string[],
    memberships: [] as Array<{ accountId: string; eventIds: readonly string[] }>,
  };
  const dependencies: PublicGoalRecommendationsDependencies = {
    now: () => input.now ?? NOW,
    readRelationshipGoal: async (accountId) => {
      calls.goal.push(accountId);
      if (input.readGoalError) throw input.readGoalError;
      return input.goal === undefined ? "AI founders" : input.goal as string | null;
    },
    readPublicCatalogue: async (now) => {
      calls.catalogue.push(now);
      if (input.readCatalogueError) throw input.readCatalogueError;
      return input.readCatalogue ?? snapshot([event()]);
    },
    listMemberships: async (value) => {
      calls.memberships.push(value);
      if (input.membershipsError) throw input.membershipsError;
      return input.memberships ?? [];
    },
  };
  return { calls, service: createPublicGoalRecommendationsService(dependencies) };
}

test("strict recommendations do not treat missing relationship goals as matches", async () => {
  const { calls, service } = serviceFor({ goal: null });

  const result = await service.recommend({ accountId: ACCOUNT_ID });

  // W0036：没设目标仍是 needs_goal、不出目标匹配；但多读一次目录与报名，给活动池兜底「近期活动」。
  assert.equal(result.state, "needs_goal");
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.upcoming.map((item) => item.eventId), ["event:match"]);
  assert.deepEqual(calls.goal, [ACCOUNT_ID]);
  assert.equal(calls.catalogue.length, 1);
  assert.equal(calls.memberships.length, 1);
});

test("the lexical helper preserves word boundaries for Latin tokens", () => {
  assert.deepEqual(matchedTokensForText("Kansai operator meetup", "AI"), []);
  assert.deepEqual(matchedTokensForText("AI operator meetup", "AI"), ["ai"]);
});

test("mixed-case Latin and CJK text produces the same matched tokens", () => {
  assert.deepEqual(matchedTokensForText("AI交流会", "AI交流会"), [
    "ai交流会",
    "ai",
  ]);
  assert.deepEqual(
    matchedTokensForText("AI交流会", "AI交流会"),
    matchedTokensForText("ai交流会", "AI交流会"),
  );
});

test("display casing does not change ranking and source text remains intact", async () => {
  const upper = event({
    description: "AI交流会",
    id: "event:case-a",
    title: "AI交流会",
  });
  const lower = event({
    description: "ai交流会",
    id: "event:case-b",
    title: "ai交流会",
  });
  const { service } = serviceFor({
    goal: "AI交流会",
    readCatalogue: snapshot([upper, lower]),
  });

  const result = await service.recommend({ accountId: ACCOUNT_ID });

  assert.equal(result.state, "success");
  assert.deepEqual(result.items.map((item) => item.eventId), [
    "event:case-a",
    "event:case-b",
  ]);
  assert.equal(result.items[0]?.title, "AI交流会");
  assert.equal(result.items[0]?.description, "AI交流会");
});

test("strict matching uses only title and description", async () => {
  const matching = event({
    description: "Founders exchange practical AI lessons.",
    id: "event:matching",
    title: "AI Founder Circle",
  });
  const metadataOnly = event({
    description: "A relaxed community evening.",
    id: "event:metadata-only",
    nextAction: "Meet AI founders after the event.",
    recommendedPreparation: "Prepare to meet AI founders.",
    title: "Community Evening",
    venue: "AI founders studio",
  });
  const idOnly = event({
    description: "A relaxed community evening.",
    id: "event:ai-founders-only",
    title: "Community Evening",
  });
  const kansai = event({
    description: "A relaxed operator evening in Kansai.",
    id: "event:kansai",
    title: "Kansai Operators",
  });
  const { service } = serviceFor({
    readCatalogue: snapshot([matching, metadataOnly, idOnly, kansai]),
  });

  const result = await service.recommend({ accountId: ACCOUNT_ID });

  assert.equal(result.state, "success");
  assert.deepEqual(result.items.map((item) => item.eventId), ["event:matching"]);
  assert.deepEqual(result.items[0]?.matchedTokens, ["ai", "founders"]);
  assert.deepEqual(Object.keys(result.items[0] ?? {}).sort(), [
    "description",
    "eventId",
    "matchedTokens",
    "publicCode",
    "sourceEvidenceIds",
    "startsAt",
    "title",
    "venue",
  ]);
});

test("no matching title or description returns a distinct no_match state", async () => {
  const { calls, service } = serviceFor({
    goal: "quantum agriculture",
    readCatalogue: snapshot([
      event({
        description: "A published operator dinner.",
        id: "event:no-match",
        recommendedPreparation: "quantum agriculture reading",
      }),
    ]),
  });

  const result = await service.recommend({ accountId: ACCOUNT_ID });

  assert.equal(result.state, "no_match");
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.upcoming.map((item) => item.eventId), ["event:no-match"]);
  assert.equal(calls.memberships.length, 1);
});

test("stopword-only goals return no_match without inventing a default target", async () => {
  const { service } = serviceFor({
    goal: "and to the",
    readCatalogue: snapshot([event({ id: "event:stopwords" })]),
  });

  const result = await service.recommend({ accountId: ACCOUNT_ID });
  assert.equal(result.state, "no_match");
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.upcoming.map((item) => item.eventId), ["event:stopwords"]);
});

test("past, exact-now, and cancelled events are excluded before matching", async () => {
  const past = event({
    description: "AI founders.",
    endsAt: "2026-09-16T12:00:00.000Z",
    id: "event:past",
    startsAt: "2026-09-16T10:00:00.000Z",
    status: "cancelled",
  });
  const exactNow = event({
    description: "AI founders.",
    id: "event:exact-now",
    startsAt: NOW.toISOString(),
  });
  const cancelled = event({
    description: "AI founders.",
    id: "event:cancelled-future",
    status: "cancelled",
  });
  const active = event({ id: "event:active" });
  const { calls, service } = serviceFor({
    readCatalogue: snapshot([past, exactNow, cancelled, active]),
  });

  const result = await service.recommend({ accountId: ACCOUNT_ID });

  assert.equal(result.state, "success");
  assert.deepEqual(result.items.map((item) => item.eventId), [active.id]);
  assert.deepEqual(calls.memberships[0]?.eventIds, [active.id]);
});

test("filters own events and rsvped memberships while retaining cancelled memberships", async () => {
  const own = event({ id: "event:own" });
  const registered = event({ id: "event:registered" });
  const cancelled = event({ id: "event:cancelled" });
  const { service } = serviceFor({
    memberships: [
      membership(registered.id, "rsvped"),
      membership(cancelled.id, "cancelled"),
    ],
    readCatalogue: snapshot([own, registered, cancelled], {
      organizerIds: {
        [own.id]: ACCOUNT_ID,
        [registered.id]: OTHER_ACCOUNT_ID,
        [cancelled.id]: OTHER_ACCOUNT_ID,
      },
    }),
  });

  const result = await service.recommend({ accountId: ACCOUNT_ID });

  assert.equal(result.state, "success");
  assert.deepEqual(result.items.map((item) => item.eventId), [cancelled.id]);
});

test("sorts by distinct matched token count, time, and canonical id, then returns at most three", async () => {
  const records = [
    event({
      description: "AI founders investors.",
      endsAt: "2026-09-21T12:00:00.000Z",
      id: "event:sort-a",
      startsAt: "2026-09-21T10:00:00.000Z",
      title: "AI founders investors",
    }),
    event({
      description: "AI founders.",
      id: "event:sort-b",
      startsAt: "2026-09-20T10:00:00.000Z",
      title: "AI founders",
    }),
    event({
      description: "AI.",
      id: "event:sort-c",
      startsAt: "2026-09-20T09:00:00.000Z",
      title: "AI",
    }),
    event({
      description: "AI founders investors.",
      id: "event:sort-d",
      startsAt: "2026-09-20T09:00:00.000Z",
      title: "AI founders investors",
    }),
  ];
  const { service } = serviceFor({
    goal: "AI founders investors",
    readCatalogue: snapshot(records),
  });

  const result = await service.recommend({ accountId: ACCOUNT_ID });

  assert.equal(result.state, "success");
  assert.deepEqual(result.items.map((item) => item.eventId), [
    "event:sort-d",
    "event:sort-a",
    "event:sort-b",
  ]);
});

test("uses canonical id as the final tie breaker", async () => {
  const startsAt = "2026-09-20T10:00:00.000Z";
  const records = [
    event({ id: "event:tie-c", startsAt }),
    event({ id: "event:tie-a", startsAt }),
    event({ id: "event:tie-b", startsAt }),
  ];
  const { service } = serviceFor({
    goal: "AI",
    readCatalogue: snapshot(records),
  });

  const result = await service.recommend({ accountId: ACCOUNT_ID });

  assert.deepEqual(result.items.map((item) => item.eventId), [
    "event:tie-a",
    "event:tie-b",
    "event:tie-c",
  ]);
});

test("fills from remaining matches when the first three matches are registered", async () => {
  const records = [
    event({ description: "AI founders investors.", id: "event:fill-a", title: "AI founders investors" }),
    event({ description: "AI founders investors.", id: "event:fill-b", title: "AI founders investors" }),
    event({ description: "AI founders.", id: "event:fill-c", title: "AI founders" }),
    event({ description: "AI founders.", id: "event:fill-d", title: "AI founders" }),
    event({ description: "AI.", id: "event:fill-e", title: "AI" }),
    event({ description: "AI.", id: "event:fill-f", title: "AI" }),
  ];
  const { calls, service } = serviceFor({
    memberships: [
      membership("event:fill-a"),
      membership("event:fill-b"),
      membership("event:fill-c"),
    ],
    readCatalogue: snapshot(records),
  });

  const result = await service.recommend({ accountId: ACCOUNT_ID });

  assert.equal(result.state, "success");
  assert.deepEqual(result.items.map((item) => item.eventId), [
    "event:fill-d",
    "event:fill-e",
    "event:fill-f",
  ]);
  assert.equal(calls.memberships.length, 1);
  assert.deepEqual(calls.memberships[0]?.eventIds, records.map((record) => record.id));
});

test("deduplicates an identical canonical record but rejects conflicting duplicates and codes", async () => {
  const duplicate = event({ id: "event:duplicate" });
  const identical = serviceFor({
    readCatalogue: snapshot([duplicate, event({ id: duplicate.id })]),
  });
  const identicalResult = await identical.service.recommend({ accountId: ACCOUNT_ID });
  assert.equal(identicalResult.state, "success");
  assert.deepEqual(identicalResult.items.map((item) => item.eventId), [duplicate.id]);

  const conflictingRecord = event({ id: duplicate.id, title: "Different facts" });
  const conflicting = serviceFor({
    readCatalogue: snapshot([duplicate, conflictingRecord]),
  });
  assert.deepEqual(
    await conflicting.service.recommend({ accountId: ACCOUNT_ID }),
    { state: "unavailable", items: [], upcoming: [] },
  );

  const first = event({ id: "event:code-a" });
  const second = event({ id: "event:code-b" });
  const duplicateCode = serviceFor({
    readCatalogue: snapshot([first, second], {
      publicCodes: { [first.id]: "same-code", [second.id]: "same-code" },
    }),
  });
  assert.deepEqual(
    await duplicateCode.service.recommend({ accountId: ACCOUNT_ID }),
    { state: "unavailable", items: [], upcoming: [] },
  );
});

test("the canonical public catalogue rejects duplicate event ids and public codes upstream", async () => {
  const duplicateId = upstreamCatalogueFor([
    publishedEvent({
      eventId: "event:upstream-duplicate",
      organizerActorId: "account:one",
      publicCode: "upstream-one",
    }),
    publishedEvent({
      eventId: "event:upstream-duplicate",
      organizerActorId: "account:two",
      publicCode: "upstream-two",
    }),
  ]);
  await assert.rejects(
    duplicateId.readRecords(),
    /duplicate eventId/i,
  );

  const duplicateCode = upstreamCatalogueFor([
    publishedEvent({
      eventId: "event:upstream-one",
      organizerActorId: "account:one",
      publicCode: "same-upstream-code",
    }),
    publishedEvent({
      eventId: "event:upstream-two",
      organizerActorId: "account:two",
      publicCode: "same-upstream-code",
    }),
  ]);
  await assert.rejects(
    duplicateCode.readRecords(),
    /duplicate publicCode/i,
  );
});

test("missing or invalid public candidate metadata fails closed", async () => {
  const cases: Array<[string, PublicEventRecordCatalogueSnapshot]> = [
    ["organizer", snapshot([event()], { organizerIds: {} })],
    ["blank organizer", snapshot([event()], { organizerIds: { "event:match": "   " } })],
    [
      "non-string organizer",
      snapshot([event()], {
        organizerIds: { "event:match": 42 } as unknown as Readonly<Record<string, string>>,
      }),
    ],
    ["public code", snapshot([event()], { publicCodes: {} })],
    [
      "startsAt",
      snapshot([event({ startsAt: "not-a-date" })]),
    ],
    [
      "endsAt",
      snapshot([
        event({
          endsAt: "2026-09-19T12:00:00.000Z",
          startsAt: "2026-09-20T10:00:00.000Z",
        }),
      ]),
    ],
    ["generatedAt", snapshot([event()], { generatedAt: "not-a-date" })],
  ];

  for (const [label, readCatalogue] of cases) {
    const { service } = serviceFor({ readCatalogue });
    const result = await service.recommend({ accountId: ACCOUNT_ID });
    assert.deepEqual(result, { state: "unavailable", items: [], upcoming: [] }, label);
  }
});

test("membership results are one canonical actor-scoped batch and invalid rows fail closed", async () => {
  const candidate = event({ id: "event:membership-candidate" });
  const cases: Array<[string, readonly Membership[]]> = [
    ["wrong actor", [membership(candidate.id, "rsvped", OTHER_ACCOUNT_ID)]],
    ["out of range event", [membership("event:not-in-catalogue")]],
    [
      "invalid status",
      [membership(candidate.id, "rsvped"), { eventId: candidate.id, status: "pending", userId: ACCOUNT_ID } as unknown as Membership],
    ],
    ["duplicate event", [membership(candidate.id), membership(candidate.id, "cancelled")]],
  ];

  for (const [label, memberships] of cases) {
    const { calls, service } = serviceFor({
      memberships,
      readCatalogue: snapshot([candidate]),
    });
    const result = await service.recommend({ accountId: ACCOUNT_ID });
    assert.deepEqual(result, { state: "unavailable", items: [], upcoming: [] }, label);
    assert.equal(calls.memberships.length, 1, label);
    assert.equal(calls.memberships[0]?.accountId, ACCOUNT_ID, label);
    assert.deepEqual(calls.memberships[0]?.eventIds, [candidate.id], label);
  }
});

test("account absence and provider failures return unavailable without partial recommendations", async () => {
  const noAccount = serviceFor();
  assert.deepEqual(
    await noAccount.service.recommend({ accountId: null }),
    { state: "unavailable", items: [], upcoming: [] },
  );
  assert.deepEqual(noAccount.calls, { catalogue: [], goal: [], memberships: [] });

  // W0036：读目标失败仍是 unavailable、不出目标匹配；目录与报名照读，近期活动兜底。
  const goalFailure = serviceFor({ readGoalError: new Error("profile unavailable") });
  const goalFailureResult = await goalFailure.service.recommend({ accountId: ACCOUNT_ID });
  assert.equal(goalFailureResult.state, "unavailable");
  assert.deepEqual(goalFailureResult.items, []);
  assert.deepEqual(goalFailureResult.upcoming.map((item) => item.eventId), ["event:match"]);

  const catalogueFailure = serviceFor({ readCatalogueError: new Error("catalogue unavailable") });
  assert.deepEqual(
    await catalogueFailure.service.recommend({ accountId: ACCOUNT_ID }),
    { state: "unavailable", items: [], upcoming: [] },
  );

  const membershipFailure = serviceFor({ membershipsError: new Error("membership unavailable") });
  assert.deepEqual(
    await membershipFailure.service.recommend({ accountId: ACCOUNT_ID }),
    { state: "unavailable", items: [], upcoming: [] },
  );
});

test("a single now snapshot is passed to the public catalogue", async () => {
  const fixedNow = new Date("2026-09-18T01:02:03.000Z");
  const { calls, service } = serviceFor({
    now: fixedNow,
    readCatalogue: snapshot([event({ startsAt: "2026-09-20T10:00:00.000Z" })]),
  });

  await service.recommend({ accountId: ACCOUNT_ID });

  assert.equal(calls.catalogue.length, 1);
  assert.equal(calls.catalogue[0], fixedNow);
});

/* ── W0036 SC-04：`upcoming`（全部可报名候选，不截断）与语句计数 ─────────────── */

/** 13 场可报名 + 已开始 / 已取消 / 本人主办 / 已报名各一场；按开始时间倒着放，验证升序。 */
function bigCatalogue() {
  const bookable = Array.from({ length: 13 }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return event({
      description: index === 12 ? "AI founders night." : "A general meetup.",
      endsAt: `2026-10-${day}T12:00:00.000Z`,
      id: `event:bookable-${day}`,
      startsAt: `2026-10-${day}T10:00:00.000Z`,
      title: index === 12 ? "AI Founders Night" : `Meetup ${day}`,
    });
  }).reverse();
  const started = event({ endsAt: "2026-09-16T12:00:00.000Z", id: "event:started", startsAt: "2026-09-16T10:00:00.000Z" });
  const cancelled = event({ id: "event:cancelled", status: "cancelled" });
  const own = event({ id: "event:own" });
  const registered = event({ id: "event:registered" });
  const records = [...bookable, started, cancelled, own, registered];
  return {
    catalogue: snapshot(records, {
      organizerIds: Object.fromEntries(records.map((record) => [record.id, record.id === own.id ? ACCOUNT_ID : "account:organizer"])),
    }),
    expected: Array.from({ length: 13 }, (_, index) => `event:bookable-${String(index + 1).padStart(2, "0")}`),
    memberships: [membership(registered.id, "rsvped"), membership("event:bookable-05", "cancelled")],
  };
}

test("W0036 success returns every bookable candidate in upcoming (≥13, ascending, nothing truncated) with unchanged reads", async () => {
  const { catalogue, expected, memberships } = bigCatalogue();
  const { calls, service } = serviceFor({ memberships, readCatalogue: catalogue });

  const result = await service.recommend({ accountId: ACCOUNT_ID });

  assert.equal(result.state, "success");
  assert.deepEqual(result.items.map((item) => item.eventId), ["event:bookable-13"]);
  assert.deepEqual(result.upcoming.map((item) => item.eventId), expected);
  assert.deepEqual(result.upcoming[0], {
    endsAt: "2026-10-01T12:00:00.000Z",
    eventId: "event:bookable-01",
    publicCode: "public-event:bookable-01",
    startsAt: "2026-10-01T10:00:00.000Z",
    title: "Meetup 01",
    venue: "Orbit Room",
  });
  // 语句数与改前相同：目标 1、目录 1、报名 1。
  assert.deepEqual([calls.goal.length, calls.catalogue.length, calls.memberships.length], [1, 1, 1]);
});

test("W0036 no_match after scoring still carries upcoming; reads unchanged", async () => {
  const { catalogue, expected, memberships } = bigCatalogue();
  const { calls, service } = serviceFor({ goal: "quantum agriculture", memberships, readCatalogue: catalogue });
  const result = await service.recommend({ accountId: ACCOUNT_ID });
  assert.equal(result.state, "no_match");
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.upcoming.map((item) => item.eventId), expected);
  assert.deepEqual([calls.goal.length, calls.catalogue.length, calls.memberships.length], [1, 1, 1]);
});

test("W0036 needs_goal (null or blank) and an unreadable / invalid goal each add exactly one catalogue and one membership read", async () => {
  const { catalogue, expected, memberships } = bigCatalogue();
  for (const [label, options, state] of [
    ["null goal", { goal: null }, "needs_goal"],
    ["blank goal", { goal: "   " }, "needs_goal"],
    ["goal read failure", { readGoalError: new Error("profile down") }, "unavailable"],
    ["goal of the wrong type", { goal: 42 }, "unavailable"],
  ] as const) {
    const { calls, service } = serviceFor({ ...options, memberships, readCatalogue: catalogue });
    const result = await service.recommend({ accountId: ACCOUNT_ID });
    assert.equal(result.state, state, label);
    assert.deepEqual(result.items, [], label);
    assert.deepEqual(result.upcoming.map((item) => item.eventId), expected, label);
    assert.deepEqual([calls.goal.length, calls.catalogue.length, calls.memberships.length], [1, 1, 1], label);
  }
});

test("W0036 a failed catalogue or membership read leaves upcoming empty and never throws", async () => {
  for (const [label, options, state] of [
    ["needs_goal + catalogue down", { goal: null, readCatalogueError: new Error("down") }, "needs_goal"],
    ["needs_goal + memberships down", { goal: null, membershipsError: new Error("down") }, "needs_goal"],
    ["goal failure + catalogue down", { readCatalogueError: new Error("down"), readGoalError: new Error("down") }, "unavailable"],
    ["goal + catalogue down", { readCatalogueError: new Error("down") }, "unavailable"],
  ] as const) {
    const { service } = serviceFor(options);
    assert.deepEqual(await service.recommend({ accountId: ACCOUNT_ID }), { items: [], state, upcoming: [] }, label);
  }
});

test("W0036 an empty catalogue: no_match with an empty upcoming and no membership read", async () => {
  const { calls, service } = serviceFor({ readCatalogue: snapshot([]) });
  assert.deepEqual(await service.recommend({ accountId: ACCOUNT_ID }), { items: [], state: "no_match", upcoming: [] });
  assert.equal(calls.memberships.length, 0);
});
