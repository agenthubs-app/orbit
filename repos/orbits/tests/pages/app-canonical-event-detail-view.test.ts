import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCanonicalEventDetailView,
  type CanonicalEventDetailDependencies,
} from "../../app/(app)/app/canonical-event-detail-view";
import {
  getOrbitLandingEventView,
} from "../../app/(app)/app/orbit-landing-route-view-model";
import type { PublishedCanonicalEvent } from "../../features/events/core/contract";
import { publishedCanonicalEventToEventDTO } from "../../features/events/core/public-catalogue";

const now = new Date("2030-01-01T00:00:00.000Z");

test("canonical details carry a real configuration restriction separately from successful event access", async () => {
  const deps = { ...dependencies({ event: canonicalEvent("CLIMATE") }), readRegistrationWindow: async () => ({ availability: "unavailable" as const, blockingReason: "configuration_required" as const }) };
  const result = await resolveCanonicalEventDetailView({ routeId: "CLIMATE" }, deps);
  assert.equal(result.state, "success");
  if (result.state !== "success") return;
  assert.equal(result.registrationAvailability, "unavailable");
  assert.equal((result as typeof result & { registrationBlockingReason?: string }).registrationBlockingReason, "configuration_required");
});

function canonicalEvent(publicCode: string | null): PublishedCanonicalEvent {
  return {
    archivedAt: null,
    cancelledAt: null,
    description:
      "A focused working session for climate-finance founders, institutional investors, and bilingual operators.",
    endsAt: "2030-03-14T12:30:00.000Z",
    eventId: "event:canonical:climate-capital",
    eventVersion: 4,
    lifecycleState: "published",
    organizerActorId: "actor:organizer",
    phase: "upcoming",
    publicCode,
    sourcePayload: {
      evidenceIds: ["evidence:event:climate-capital:v4"],
    },
    startsAt: "2030-03-14T09:30:00.000Z",
    timezone: "Asia/Tokyo",
    title: "Climate capital operator forum",
    venue: "Marunouchi, Tokyo",
    workspaceId: "workspace:climate-capital",
  };
}

function dependencies(input: {
  access?: { owner: boolean; role: "operations" | "reviewer" | null; state: "active" | "revoked" | null } | null;
  event: PublishedCanonicalEvent;
  registered?: boolean;
  resolvableRouteIds?: readonly string[];
}): CanonicalEventDetailDependencies {
  return {
    accessService: input.access === null
      ? null
      : {
          async get(query: unknown) {
            const { eventId, subjectActorId } = query as {
              eventId: string;
              subjectActorId: string;
            };
            return {
              eventId,
              owner: input.access?.owner ?? false,
              revision: 2,
              role: input.access?.role ?? null,
              state: input.access?.state ?? null,
              subjectActorId,
            };
          },
          async grant() { throw new Error("not used"); },
          async revoke() { throw new Error("not used"); },
        },
    coreService: {
      async getEvent() { return input.event; },
      async getPublishedEvent(routeId) {
        return input.resolvableRouteIds && !input.resolvableRouteIds.includes(routeId)
          ? null
          : input.event;
      },
      async listEvents() { return [input.event]; },
      async listPublishedEvents() { return [input.event]; },
    },
    now,
    async readRegistrationAvailability() {
      return "open";
    },
    async readOperationsSummary(eventId) {
      return {
        activeRegistrationCount: 62,
        attendeeResultsAvailable: true,
        eventId,
        hasPublishedResults: true,
      };
    },
    async readRegisteredContext({ eventId }) {
      return input.registered
        ? {
            attendees: [
              {
                displayName: "Aiko Mori",
                organization: "Kisetsu Capital",
                role: "Climate-finance investor",
              },
              {
                displayName: "Luis Ortega",
                organization: "TraceGrid",
                role: "Supply-chain founder",
              },
            ],
            eventId,
          }
        : null;
    },
  };
}

test("anonymous users can read a public canonical event without attendee disclosure", async () => {
  const result = await resolveCanonicalEventDetailView(
    { routeId: "EVT-CLIMATE-CAPITAL" },
    dependencies({ event: canonicalEvent("EVT-CLIMATE-CAPITAL") }),
  );

  assert.equal(result.state, "success");
  if (result.state !== "success") return;
  assert.equal(result.event.id, "event:canonical:climate-capital");
  assert.equal(result.event.code, "EVT-CLIMATE-CAPITAL");
  assert.equal(result.event.participantCount, 62);
  assert.equal(result.event.stats.attendees.length, 0);
  assert.equal(result.registrationAvailability, "open");
  assert.equal(result.registered, false);
});

test("an authenticated account-scoped event id resolves only through its canonical provenance id", async () => {
  const lookedUpActorEvents: string[] = [];
  const deps = dependencies({
    event: canonicalEvent("EVT-CLIMATE-CAPITAL"),
    resolvableRouteIds: ["event:canonical:climate-capital"],
  });
  deps.resolveActorEventCanonicalId = async ({ actorId, eventId }) => {
    lookedUpActorEvents.push(`${actorId}:${eventId}`);
    return "event:canonical:climate-capital";
  };

  const result = await resolveCanonicalEventDetailView(
    {
      actorId: "actor:qa",
      routeId: "actor:qa:event:canonical:climate-capital",
    },
    deps,
  );

  assert.equal(result.state, "success");
  assert.deepEqual(lookedUpActorEvents, [
    "actor:qa:actor:qa:event:canonical:climate-capital",
  ]);
});

test("an account-scoped event without canonical provenance stays unavailable", async () => {
  const deps = dependencies({
    event: canonicalEvent("EVT-CLIMATE-CAPITAL"),
    resolvableRouteIds: ["event:canonical:climate-capital"],
  });
  deps.resolveActorEventCanonicalId = async () => null;

  const result = await resolveCanonicalEventDetailView(
    { actorId: "actor:qa", routeId: "actor:qa:event:private-note" },
    deps,
  );

  assert.equal(result.state, "not_found");
});

test("private canonical events require authentication before any workspace reads", async () => {
  let workspaceRead = false;
  const deps = dependencies({ event: canonicalEvent(null) });
  deps.readOperationsSummary = async () => {
    workspaceRead = true;
    return null;
  };
  const result = await resolveCanonicalEventDetailView(
    { routeId: "event:canonical:climate-capital" },
    deps,
  );

  assert.equal(result.state, "authentication_required");
  assert.equal(workspaceRead, false);
});

test("a registered participant can open a private canonical event and see its real roster", async () => {
  const result = await resolveCanonicalEventDetailView(
    {
      actorId: "actor:registered-attendee",
      routeId: "event:canonical:climate-capital",
    },
    dependencies({
      access: null,
      event: canonicalEvent(null),
      registered: true,
    }),
  );

  assert.equal(result.state, "success");
  if (result.state !== "success") return;
  assert.equal(result.registered, true);
  assert.equal(result.canOpenOperations, false);
  assert.equal(result.event.participantCount, 62);
  assert.equal(result.event.stats.count, 62);
  assert.deepEqual(
    result.event.stats.attendees.map((attendee) => attendee.name),
    ["Aiko Mori", "Luis Ortega"],
  );
});

test("canonical detail keeps a missing operations count unknown instead of inventing zero", async () => {
  const result = await resolveCanonicalEventDetailView(
    { routeId: "EVT-CLIMATE-CAPITAL" },
    {
      ...dependencies({ event: canonicalEvent("EVT-CLIMATE-CAPITAL") }),
      readOperationsSummary: async () => null,
      readAdmissionPolicy: async () => ({ capacity: 8 }),
    },
  );

  assert.equal(result.state, "success");
  if (result.state !== "success") return;
  assert.equal(result.event.participantCount, null);
  assert.equal(result.event.stats.count, null);
  assert.equal(result.event.cap, 8);
  assert.equal(result.workspaceAvailable, false);
});

test("canonical detail carries a real zero and admission policy capacity without deriving either from the other", async () => {
  const policyReads: string[] = [];
  const result = await resolveCanonicalEventDetailView(
    { routeId: "EVT-CLIMATE-CAPITAL" },
    {
      ...dependencies({ event: canonicalEvent("EVT-CLIMATE-CAPITAL") }),
      readOperationsSummary: async (eventId) => ({
        activeRegistrationCount: 0,
        attendeeResultsAvailable: true,
        eventId,
        hasPublishedResults: true,
      }),
      readAdmissionPolicy: async (eventId: string) => {
        policyReads.push(eventId);
        return { capacity: 8 };
      },
    },
  );

  assert.equal(result.state, "success");
  if (result.state !== "success") return;
  assert.equal(result.event.participantCount, 0);
  assert.equal(result.event.stats.count, 0);
  assert.equal(result.event.cap, 8);
  assert.deepEqual(policyReads, ["event:canonical:climate-capital"]);
});

test("canonical detail rejects mismatched and invalid operations counts as unknown", async () => {
  for (const summary of [
    {
      activeRegistrationCount: 62,
      attendeeResultsAvailable: true,
      eventId: "event:other",
      hasPublishedResults: true,
    },
    {
      activeRegistrationCount: -1,
      attendeeResultsAvailable: true,
      eventId: "event:canonical:climate-capital",
      hasPublishedResults: true,
    },
    {
      activeRegistrationCount: 1.5,
      attendeeResultsAvailable: true,
      eventId: "event:canonical:climate-capital",
      hasPublishedResults: true,
    },
  ]) {
    const result = await resolveCanonicalEventDetailView(
      { routeId: "EVT-CLIMATE-CAPITAL" },
      {
        ...dependencies({ event: canonicalEvent("EVT-CLIMATE-CAPITAL") }),
        readOperationsSummary: async () => summary,
      },
    );

    assert.equal(result.state, "success");
    if (result.state !== "success") continue;
    assert.equal(result.event.participantCount, null);
    assert.equal(result.event.stats.count, null);
    assert.equal(result.workspaceAvailable, true);
  }
});

test("landing mapper preserves unknown counts and the three admission capacity states", () => {
  const event = publishedCanonicalEventToEventDTO(
    canonicalEvent("EVT-CLIMATE-CAPITAL"),
  );
  const view = (
    participantCount: number | null,
    capacity?: number | null,
  ) =>
    getOrbitLandingEventView({
      event,
      evidenceSummary: "fixture",
      generatedAt: now.toISOString(),
      participantCount,
      ...(capacity === undefined ? {} : { capacity }),
      routeCode: "EVT-CLIMATE-CAPITAL",
    });

  const unknown = view(null);
  assert.equal(unknown.participantCount, null);
  assert.equal(unknown.stats.count, null);
  assert.equal(unknown.cap, undefined);
  assert.equal(view(0, 8).cap, 8);
  assert.equal(view(3, null).cap, null);
  assert.equal(view(3, 0).cap, 0);
});

test("an active event-scoped staff role can open a private event without participant disclosure", async () => {
  const result = await resolveCanonicalEventDetailView(
    { actorId: "actor:reviewer", routeId: "event:canonical:climate-capital" },
    dependencies({
      access: { owner: false, role: "reviewer", state: "active" },
      event: canonicalEvent(null),
    }),
  );

  assert.equal(result.state, "success");
  if (result.state !== "success") return;
  assert.equal(result.canOpenOperations, true);
  assert.equal(result.registered, false);
  assert.equal(result.event.stats.attendees.length, 0);
});

test("private authorization fails closed for denied and indeterminate access", async () => {
  const denied = await resolveCanonicalEventDetailView(
    { actorId: "actor:outsider", routeId: "event:canonical:climate-capital" },
    dependencies({
      access: { owner: false, role: null, state: null },
      event: canonicalEvent(null),
    }),
  );
  const indeterminate = await resolveCanonicalEventDetailView(
    { actorId: "actor:outsider", routeId: "event:canonical:climate-capital" },
    dependencies({ access: null, event: canonicalEvent(null) }),
  );

  assert.equal(denied.state, "forbidden");
  assert.equal(indeterminate.state, "unavailable");
});
