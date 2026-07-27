import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { withOwnedEventAccess } from "../../app/api/events/[id]/owned-event-access";
import { createMockEventCrudAndImportService } from "../../features/events/event-crud-and-import/mock-service";
import type { EventDetailInput } from "../../features/events/event-crud-and-import/contract";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

const contextFor = (id: string) => ({
  params: Promise.resolve({ id }),
});

test("every owner-only Event child route delegates to an owned handler", () => {
  const expectedFactories = {
    "app/api/events/[id]/attendees/import/route.ts":
      "createEventAttendeeImportPostHandler",
    "app/api/events/[id]/attendees/route.ts": "createEventAttendeesGetHandler",
    "app/api/events/[id]/encounters/[encounterId]/evidence/route.ts":
      "createEventEncounterEvidencePostHandler",
    "app/api/events/[id]/encounters/route.ts":
      "createEventEncounterPostHandler",
    "app/api/events/[id]/goal/route.ts": "createEventGoalPutHandler",
    "app/api/events/[id]/matches/route.ts": "createEventMatchesGetHandler",
    "app/api/events/[id]/post-event/confirm/route.ts":
      "createPostEventConfirmPostHandler",
    "app/api/events/[id]/post-event/followup/route.ts":
      "createPostEventFollowupPostHandler",
    "app/api/events/[id]/post-event/route.ts":
      "createPostEventReviewGetHandler",
    "app/api/events/[id]/readiness/route.ts": "createEventReadinessGetHandler",
  } as const;

  for (const [pathFromRoot, factoryName] of Object.entries(expectedFactories)) {
    const source = readFileSync(join(projectRoot, pathFromRoot), "utf8");

    assert.match(source, new RegExp(`import \\{ ${factoryName} \\}`));
    assert.match(source, new RegExp(`= ${factoryName}\\(\\);`));
  }
});

test("owned event access rejects anonymous requests before event storage runs", async () => {
  let eventStoreRead = false;
  let downstreamRan = false;
  const handler = withOwnedEventAccess(
    async () => {
      downstreamRan = true;
      return Response.json({ ok: true });
    },
    {
      createEventService: () => ({
        getEvent: () => {
          eventStoreRead = true;
          return createMockEventCrudAndImportService().getEvent({
            eventId: "demo-event-1",
          });
        },
      }),
      resolveActor: async () => null,
    },
  );

  const response = await handler(
    new Request("https://orbit.test/api/events/demo-event-1/readiness"),
    contextFor("demo-event-1"),
  );

  assert.equal(response.status, 401);
  assert.equal(eventStoreRead, false);
  assert.equal(downstreamRan, false);
});

test("owned event access fails closed when the actor-scoped event is absent", async () => {
  let downstreamRan = false;
  const handler = withOwnedEventAccess(
    async () => {
      downstreamRan = true;
      return Response.json({ ok: true });
    },
    {
      createEventService: () => createMockEventCrudAndImportService(),
      resolveActor: async () => ({ id: "actor:owner" }),
    },
  );

  const response = await handler(
    new Request("https://orbit.test/api/events/not-owned/readiness"),
    contextFor("not-owned"),
  );

  assert.equal(response.status, 404);
  assert.equal(downstreamRan, false);
});

test("owned event access ignores client identity and passes server event truth", async () => {
  let observedInput: EventDetailInput | null = null;
  const eventService = createMockEventCrudAndImportService();
  const handler = withOwnedEventAccess(
    async (_request, _context, access) =>
      Response.json({
        actorId: access.actor.id,
        eventId: access.eventId,
        eventTitle: access.event.event.title,
      }),
    {
      createEventService: () => ({
        getEvent: (input) => {
          observedInput = input;
          return eventService.getEvent(input);
        },
      }),
      resolveActor: async () => ({ id: "actor:server-session" }),
    },
  );

  const response = await handler(
    new Request("https://orbit.test/api/events/demo-event-1/readiness", {
      body: JSON.stringify({ actorId: "actor:spoofed" }),
      headers: {
        "content-type": "application/json",
        "x-actor-id": "actor:spoofed",
      },
      method: "POST",
    }),
    contextFor("demo-event-1"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(observedInput, {
    actorId: "actor:server-session",
    eventId: "demo-event-1",
  });
  assert.deepEqual(await response.json(), {
    actorId: "actor:server-session",
    eventId: "demo-event-1",
    eventTitle: "Climate founders dinner",
  });
});
