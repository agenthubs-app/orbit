import assert from "node:assert/strict";
import test from "node:test";

import { createEventAccessRoleMembersGetHandler } from "../../app/api/events/[id]/access/roles/handler";
import { createEventCenterGetHandler } from "../../app/api/events/center/handler";
import type { AuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";
import type {
  EventAccessDirectoryEvent,
  EventAccessDirectoryRepository,
  EventAccessRoleMembersPayload,
} from "../../features/events/event-access/directory";
import { createEventAccessDirectoryService } from "../../features/events/event-access/directory-service";
import { EventAccessRepositoryError } from "../../features/events/event-access/storage/postgres-repository";

const OWNER_ID = "actor:event-owner";
const OPERATOR_ID = "actor:operator";
const EVENT_ID = "event:operations-center";

function actor(id: string): AuthenticatedApiActor {
  return { id };
}

function event(
  overrides: Partial<EventAccessDirectoryEvent> = {},
): EventAccessDirectoryEvent {
  return {
    endsAt: "2026-09-12T11:00:00.000Z",
    eventId: EVENT_ID,
    lifecycleState: "published",
    migrationPending: false,
    owner: true,
    revision: 0,
    role: "owner",
    startsAt: "2026-09-12T09:00:00.000Z",
    title: "运营活动中心测试",
    venue: "Tokyo",
    ...overrides,
  };
}

function createRepository(): EventAccessDirectoryRepository {
  return {
    async listAccessibleEvents(input) {
      if (input.actorId === OWNER_ID) return [event()];
      if (input.actorId === OPERATOR_ID) {
        return [event({ owner: false, revision: 2, role: "operations" })];
      }
      return [];
    },
    async listEventRoleMembers(input): Promise<EventAccessRoleMembersPayload> {
      if (input.eventId !== EVENT_ID) {
        throw new EventAccessRepositoryError("EVENT_ACCESS_NOT_FOUND");
      }
      if (input.actingActorId !== OWNER_ID) {
        throw new EventAccessRepositoryError("EVENT_ACCESS_FORBIDDEN");
      }
      return {
        event: event(),
        members: [
          {
            assignedAt: null,
            assignedByActorId: null,
            eventId: EVENT_ID,
            reason: "Derived from Event Core organizer.",
            revision: 0,
            role: "owner",
            state: "active",
            subjectActorId: OWNER_ID,
          },
          {
            assignedAt: "2026-09-01T08:00:00.000Z",
            assignedByActorId: OWNER_ID,
            eventId: EVENT_ID,
            reason: "负责现场运营",
            revision: 2,
            role: "operations",
            state: "active",
            subjectActorId: OPERATOR_ID,
          },
        ],
      };
    },
  };
}

function body(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

test("event center authenticates before creating its directory service and returns actor-scoped events", async () => {
  let serviceCalls = 0;
  const unauthenticated = createEventCenterGetHandler({
    createService() {
      serviceCalls += 1;
      return createEventAccessDirectoryService(createRepository());
    },
    resolveActor: async () => null,
  });
  const unauthenticatedResponse = await unauthenticated();
  assert.equal(unauthenticatedResponse.status, 401);
  assert.equal(serviceCalls, 0);

  const handler = createEventCenterGetHandler({
    createService: () => createEventAccessDirectoryService(createRepository()),
    resolveActor: async () => actor(OPERATOR_ID),
  });
  const response = await handler();
  assert.equal(response.status, 200);
  assert.deepEqual((await body(response)).data, [event({
    owner: false,
    revision: 2,
    role: "operations",
  })]);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("current event role endpoint is owner-only, exact-event scoped, and hides repository errors", async () => {
  const service = createEventAccessDirectoryService(createRepository());
  const context = (id = EVENT_ID) => ({ params: Promise.resolve({ id }) });
  const ownerHandler = createEventAccessRoleMembersGetHandler({
    createService: () => service,
    resolveActor: async () => actor(OWNER_ID),
  });
  const ownerResponse = await ownerHandler(new Request("http://orbit.test"), context());
  assert.equal(ownerResponse.status, 200);
  const ownerPayload = (await body(ownerResponse)).data as EventAccessRoleMembersPayload;
  assert.deepEqual(ownerPayload.members.map((member) => member.subjectActorId), [
    OWNER_ID,
    OPERATOR_ID,
  ]);

  const operatorHandler = createEventAccessRoleMembersGetHandler({
    createService: () => service,
    resolveActor: async () => actor(OPERATOR_ID),
  });
  const forbiddenResponse = await operatorHandler(new Request("http://orbit.test"), context());
  assert.equal(forbiddenResponse.status, 403);
  assert.doesNotMatch(JSON.stringify(await body(forbiddenResponse)), /负责现场运营/u);

  const missingResponse = await ownerHandler(new Request("http://orbit.test"), context("event:missing"));
  assert.equal(missingResponse.status, 404);

  const unavailable = createEventAccessRoleMembersGetHandler({
    createService: () => null,
    resolveActor: async () => actor(OWNER_ID),
  });
  assert.equal(
    (await unavailable(new Request("http://orbit.test"), context())).status,
    503,
  );
});
