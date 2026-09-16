import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import type { PublishedCanonicalEvent } from "../../features/events/core/contract";
import type { EventOperationsRepository } from "../../features/events/event-operations/repository";
import type { EventRegistration } from "../../features/events/registration/contract";
import type { OrbitLandingEventView } from "../../app/(app)/app/orbit-landing-route-view-model";
import {
  createCanonicalParticipantEventJourneyReader,
  createConfiguredCanonicalParticipantEventJourneyReader,
  readConfiguredCanonicalParticipantEventJourneys,
} from "../../features/events/canonical-participant-event-journeys";
import {
  loadAppHomeRouteViewModel,
  mergeHomeEventJourneys,
} from "../../app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";

const now = new Date("2026-09-16T12:00:00.000Z");

test("event choice treats only the canonical provider's record id as canonical identity", () => {
  const source = readFileSync(new URL("../../app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model.ts", import.meta.url), "utf8");
  const tree = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = tree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "eventChoiceViewModel");
  assert.ok(declaration);
  const compiled = ts.transpileModule(declaration.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const project = runInNewContext(`${compiled}; eventChoiceViewModel`, {
    eventDetailHref: () => "/app/events/test",
    evidenceViewModels: () => [],
    productCopy: (value: string) => value,
    relationshipValueCopy: () => "",
  });
  for (const provider of ["manual", "mock-calendar", "external-feed", "event-core-postgres"]) {
    const result = project({ attendeeName: "", readinessScore: null, event: {
      id: "owned:test", evidence: [], sourceMetadata: { provider, providerRecordId: "event:other" },
      nextAction: "", recommendedPreparation: "",
    } });
    assert.equal(result.canonicalEventId, provider === "event-core-postgres" ? "event:other" : undefined);
  }
});

function publishedEvent(eventId: string): PublishedCanonicalEvent {
  return {
    archivedAt: null,
    cancelledAt: null,
    description: `Description for ${eventId}`,
    endsAt: "2026-09-16T15:00:00.000Z",
    eventId,
    eventVersion: 3,
    lifecycleState: "published",
    organizerActorId: "account:owner",
    phase: "upcoming",
    publicCode: null,
    sourcePayload: {
      evidenceIds: [`evidence:${eventId}`],
    },
    startsAt: "2026-09-16T14:00:00.000Z",
    timezone: "UTC",
    title: `Event ${eventId}`,
    venue: "Tokyo",
    workspaceId: "workspace:test",
  };
}

function registration(
  eventId: string,
  status: EventRegistration["status"],
  userId: string,
): EventRegistration {
  return {
    cancelledAt: status === "cancelled" ? now.toISOString() : null,
    eventId,
    id: `registration:${eventId}:${userId}`,
    participantProfile: {} as EventRegistration["participantProfile"],
    participantProfileId: `profile:${eventId}:${userId}`,
    reactivatedAt: null,
    registeredAt: now.toISOString(),
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status,
    updatedAt: now.toISOString(),
    userId,
  };
}

test("participant journey reader shows only the current raw subject's active canonical membership", async () => {
  const eventIds = [
    "event:rsvped",
    "event:cancelled",
    "event:other-actor",
  ];
  const calls: Array<{ eventIds: readonly string[]; rawSubject: string }> = [];
  const reader = createCanonicalParticipantEventJourneyReader({
    eventCoreService: {
      async listPublishedEvents(observedNow) {
        assert.equal(observedNow?.toISOString(), now.toISOString());
        return eventIds.map(publishedEvent);
      },
    },
    now: () => now,
    operationsRepository: {
      async listCanonicalRegistrationsForUser(rawSubject, requestedEventIds) {
        calls.push({ eventIds: requestedEventIds, rawSubject });
        return [
          registration("event:rsvped", "rsvped", rawSubject),
          registration("event:cancelled", "cancelled", rawSubject),
          registration("event:other-actor", "rsvped", "subject:other"),
        ];
      },
    } as Pick<
      EventOperationsRepository,
      "listCanonicalRegistrationsForUser"
    >,
  });

  const result = await reader.listRegisteredPublishedEvents("  subject:qa  ");

  assert.deepEqual(result.map((event) => event.eventId), ["event:rsvped"]);
  assert.deepEqual(calls, [{ eventIds, rawSubject: "subject:qa" }]);
});

test("participant journey reader propagates canonical membership read failures", async () => {
  const failure = new Error("canonical membership unavailable");
  const reader = createCanonicalParticipantEventJourneyReader({
    eventCoreService: {
      async listPublishedEvents() {
        return [publishedEvent("event:failure")];
      },
    },
    operationsRepository: {
      async listCanonicalRegistrationsForUser() {
        throw failure;
      },
    },
  });

  await assert.rejects(
    reader.listRegisteredPublishedEvents("subject:qa"),
    failure,
  );
});

test("unconfigured participant journey reader remains an explicit empty result", async () => {
  assert.equal(
    createConfiguredCanonicalParticipantEventJourneyReader({ env: {} }),
    null,
  );
  assert.deepEqual(
    await readConfiguredCanonicalParticipantEventJourneys("subject:qa", {
      env: {},
    }),
    [],
  );
});

test("Home loader propagates participant journey failures instead of fabricating zero events", async () => {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const failure = new Error("canonical participant journey unavailable");
  process.env.ORBIT_MODULE_MODE = "mock";

  try {
    await assert.rejects(
      loadAppHomeRouteViewModel(
        undefined,
        {
          displayName: "QA",
          id: "account:qa",
          rawSubject: "subject:qa",
        },
        {
          async readCanonicalParticipantEventJourneys() {
            throw failure;
          },
        },
      ),
      failure,
    );
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
});

test("Home loader renders a canonical participant event alongside mock owner events", async () => {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = "mock";

  try {
    const result = await loadAppHomeRouteViewModel(
      undefined,
      {
        displayName: "QA",
        id: "account:qa",
        rawSubject: "subject:qa",
      },
      {
        async readCanonicalParticipantEventJourneys() {
          return [publishedEvent("event:participant")];
        },
      },
    );

    assert.equal(result.state, "success");
    if (result.state !== "success") return;
    assert.equal(
      result.home.events.some((event) => event.id === "event:participant"),
      true,
    );
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
});

function landingEvent(
  id: string,
  code = id,
  canonicalEventId?: string,
): OrbitLandingEventView {
  return {
    address: "Tokyo",
    agenda: [],
    brandColor: "#6359E9",
    cap: 20,
    code,
    ...(canonicalEventId ? { canonicalEventId } : {}),
    descriptionZh: id,
    detailLogoUrl: "",
    endsAt: "2026-09-16T15:00:00.000Z",
    feeLabel: "Free",
    host: "",
    id,
    industry: "Relationship",
    logoUrl: "",
    mapX: 38,
    mapY: 36,
    name: id,
    organizer: "",
    participantCount: 0,
    place: "Tokyo",
    startsAt: "2026-09-16T14:00:00.000Z",
    stats: { attendees: [], authed: true, count: 0, youRsvped: false },
    status: "upcoming",
    summaryZh: id,
    tags: [],
    theme: "relationship",
    venue: "Tokyo",
    youRsvped: false,
  };
}

test("home journey merge keeps owned events first and removes canonical aliases only after ownership wins", () => {
  const result = mergeHomeEventJourneys(
    [
      landingEvent("legacy:owned"),
      landingEvent("legacy:shared", "legacy:shared", "event:shared"),
    ],
    [
      landingEvent("event:shared", "event:shared", "event:shared"),
      landingEvent("event:participant"),
    ],
  );

  assert.deepEqual(
    result.map((event) => event.id),
    ["legacy:owned", "legacy:shared", "event:participant"],
  );
});
