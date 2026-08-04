import assert from "node:assert/strict";
import test from "node:test";

import { createEventAccessAssignmentHandler } from "../../app/api/events/[id]/access/assignments/[subjectActorId]/handler";
import type { AuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";
import type {
  EventAccessAssignmentView,
  EventAccessRepository,
} from "../../features/events/event-access/repository";
import { createEventAccessService } from "../../features/events/event-access/service";
import type { EventAccessService } from "../../features/events/event-access/service";
import { EventAccessRepositoryError } from "../../features/events/event-access/storage/postgres-repository";

const OWNER_A = "actor:owner-a";
const OWNER_B = "actor:owner-b";
const EVENT_ID = "event:shared";
const SUBJECT_ID = "actor:operator";

function actor(id: string): AuthenticatedApiActor {
  return { id };
}

function context(
  eventId = EVENT_ID,
  subjectActorId = SUBJECT_ID,
): { params: Promise<{ id: string; subjectActorId: string }> } {
  return { params: Promise.resolve({ id: eventId, subjectActorId }) };
}

function jsonRequest(
  method: "PUT" | "DELETE",
  body: unknown,
): Request {
  return new Request("http://orbit.test/api/events/event/access", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function createMemoryRepository(
  ownerActorId: string,
  eventId = EVENT_ID,
): EventAccessRepository {
  const assignments = new Map<string, EventAccessAssignmentView>();

  function current(subjectActorId: string): EventAccessAssignmentView {
    return (
      assignments.get(subjectActorId) ?? {
        eventId,
        owner: subjectActorId === ownerActorId,
        revision: 0,
        role: null,
        state: null,
        subjectActorId,
      }
    );
  }

  function requireEvent(requestedEventId: string): void {
    if (requestedEventId !== eventId) {
      throw new EventAccessRepositoryError("EVENT_ACCESS_NOT_FOUND");
    }
  }

  return {
    async get(input) {
      requireEvent(input.eventId);
      return current(input.subjectActorId);
    },
    async grant(input) {
      requireEvent(input.eventId);
      const before = current(input.subjectActorId);
      if (
        input.actingActorId !== ownerActorId ||
        input.subjectActorId === ownerActorId
      ) {
        throw new EventAccessRepositoryError("EVENT_ACCESS_FORBIDDEN");
      }
      if (
        before.revision !== input.expectedRevision ||
        (before.state === "active" && before.role === input.role)
      ) {
        throw new EventAccessRepositoryError("EVENT_ACCESS_CONFLICT");
      }
      const after: EventAccessAssignmentView = {
        eventId,
        owner: false,
        revision: before.revision + 1,
        role: input.role,
        state: "active",
        subjectActorId: input.subjectActorId,
      };
      assignments.set(input.subjectActorId, after);
      return after;
    },
    async revoke(input) {
      requireEvent(input.eventId);
      const before = current(input.subjectActorId);
      if (
        input.actingActorId !== ownerActorId ||
        input.subjectActorId === ownerActorId
      ) {
        throw new EventAccessRepositoryError("EVENT_ACCESS_FORBIDDEN");
      }
      if (
        before.revision !== input.expectedRevision ||
        before.state !== "active" ||
        before.role === null
      ) {
        throw new EventAccessRepositoryError("EVENT_ACCESS_CONFLICT");
      }
      const after: EventAccessAssignmentView = {
        ...before,
        revision: before.revision + 1,
        state: "revoked",
      };
      assignments.set(input.subjectActorId, after);
      return after;
    },
  };
}

function handlerFor(input: {
  actorId: string | null;
  service: EventAccessService | null;
}) {
  return createEventAccessAssignmentHandler({
    createService: () => input.service,
    resolveActor: async () =>
      input.actorId === null ? null : actor(input.actorId),
  });
}

test("event access assignment handler authenticates before runtime and denies non-owner or foreign scope", async () => {
  let createServiceCalls = 0;
  const unauthenticated = createEventAccessAssignmentHandler({
    createService() {
      createServiceCalls += 1;
      return createEventAccessService(createMemoryRepository(OWNER_A));
    },
    resolveActor: async () => null,
  });
  const unauthenticatedResponse = await unauthenticated(
    new Request("http://orbit.test"),
    context(),
    "GET",
  );
  assert.equal(unauthenticatedResponse.status, 401);
  assert.equal(createServiceCalls, 0);
  assert.equal(
    (await body(unauthenticatedResponse)).success,
    false,
  );

  const workspaceA = createEventAccessService(createMemoryRepository(OWNER_A));
  const nonOwnerResponse = await handlerFor({
    actorId: "actor:operations",
    service: workspaceA,
  })(new Request("http://orbit.test"), context(), "GET");
  assert.equal(nonOwnerResponse.status, 403);

  const foreignEventResponse = await handlerFor({
    actorId: OWNER_A,
    service: workspaceA,
  })(
    new Request("http://orbit.test"),
    context("event:foreign"),
    "GET",
  );
  assert.equal(foreignEventResponse.status, 404);

  const workspaceB = createEventAccessService(createMemoryRepository(OWNER_B));
  const foreignWorkspaceResponse = await handlerFor({
    actorId: OWNER_A,
    service: workspaceB,
  })(new Request("http://orbit.test"), context(), "GET");
  assert.equal(foreignWorkspaceResponse.status, 403);
});

test("event owner can get, grant, change, and revoke one delegated assignment", async () => {
  const service = createEventAccessService(createMemoryRepository(OWNER_A));
  const handler = handlerFor({ actorId: OWNER_A, service });

  const initial = await handler(
    new Request("http://orbit.test"),
    context(),
    "GET",
  );
  assert.equal(initial.status, 200);
  assert.deepEqual((await body(initial)).data, {
    eventId: EVENT_ID,
    owner: false,
    revision: 0,
    role: null,
    state: null,
    subjectActorId: SUBJECT_ID,
  });

  const granted = await handler(
    jsonRequest("PUT", {
      expectedRevision: 0,
      reason: "Run bilingual event operations",
      role: "operations",
    }),
    context(),
    "PUT",
  );
  assert.equal(granted.status, 200);
  assert.deepEqual(
    (await body(granted)).data,
    {
      eventId: EVENT_ID,
      owner: false,
      revision: 1,
      role: "operations",
      state: "active",
      subjectActorId: SUBJECT_ID,
    },
  );

  const changed = await handler(
    jsonRequest("PUT", {
      expectedRevision: 1,
      reason: "Move to the constrained check-in roster",
      role: "check_in",
    }),
    context(),
    "PUT",
  );
  assert.equal(changed.status, 200);
  assert.equal(
    ((await body(changed)).data as { role: string }).role,
    "check_in",
  );

  const revoked = await handler(
    jsonRequest("DELETE", {
      expectedRevision: 2,
      reason: "Check-in shift completed",
    }),
    context(),
    "DELETE",
  );
  assert.equal(revoked.status, 200);
  const revokedPayload = (await body(revoked)).data as {
    revision: number;
    state: string;
  };
  assert.deepEqual(
    {
      revision: revokedPayload.revision,
      state: revokedPayload.state,
    },
    { revision: 3, state: "revoked" },
  );
  assert.equal(revoked.headers.get("cache-control"), "no-store");
  assert.ok(revoked.headers.get("x-orbit-feature-mode"));
});

test("event access assignment handler rejects forged, malformed, owner-target, and stale writes", async () => {
  const service = createEventAccessService(createMemoryRepository(OWNER_A));
  const handler = handlerFor({ actorId: OWNER_A, service });

  for (const request of [
    jsonRequest("PUT", {
      actingActorId: OWNER_A,
      expectedRevision: 0,
      reason: "Client must not select the acting actor",
      role: "operations",
    }),
    jsonRequest("PUT", {
      expectedRevision: 0,
      extra: true,
      reason: "Extra input is rejected",
      role: "operations",
    }),
    jsonRequest("PUT", {
      expectedRevision: 0,
      reason: "Owner is never a delegated role",
      role: "owner",
    }),
    new Request("http://orbit.test", {
      body: "{",
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    new Request("http://orbit.test", {
      body: "expectedRevision=0",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "PUT",
    }),
  ]) {
    const response = await handler(request, context(), "PUT");
    assert.equal(response.status, 400);
    assert.equal(
      ((await body(response)).error as { code: string }).code,
      "VALIDATION_ERROR",
    );
  }

  const ownerTarget = await handler(
    jsonRequest("PUT", {
      expectedRevision: 0,
      reason: "Owner cannot be delegated",
      role: "operations",
    }),
    context(EVENT_ID, OWNER_A),
    "PUT",
  );
  assert.equal(ownerTarget.status, 403);

  await handler(
    jsonRequest("PUT", {
      expectedRevision: 0,
      reason: "Initial role",
      role: "operations",
    }),
    context(),
    "PUT",
  );
  const conflict = await handler(
    jsonRequest("PUT", {
      expectedRevision: 0,
      reason: "Stale browser revision",
      role: "reviewer",
    }),
    context(),
    "PUT",
  );
  assert.equal(conflict.status, 409);
  assert.equal(
    ((await body(conflict)).error as { code: string }).code,
    "CONFLICT",
  );
});

test("event access assignment handler maps runtime readiness and storage failures without leaking internals", async () => {
  const unavailable = handlerFor({ actorId: OWNER_A, service: null });
  const unavailableResponse = await unavailable(
    new Request("http://orbit.test"),
    context(),
    "GET",
  );
  assert.equal(unavailableResponse.status, 503);

  for (const [code, status] of [
    ["EVENT_ACCESS_NOT_READY", 503],
    ["EVENT_ACCESS_REPOSITORY_FAILED", 503],
    ["EVENT_ACCESS_NOT_FOUND", 404],
  ] as const) {
    const failingService: EventAccessService = {
      async get() {
        throw new EventAccessRepositoryError(code);
      },
      async grant() {
        throw new Error("must not run");
      },
      async revoke() {
        throw new Error("must not run");
      },
    };
    const response = await handlerFor({
      actorId: OWNER_A,
      service: failingService,
    })(new Request("http://orbit.test"), context(), "GET");
    assert.equal(response.status, status);
    const payload = await body(response);
    assert.equal(payload.success, false);
    assert.doesNotMatch(JSON.stringify(payload), /must not run|postgres|sql/i);
  }
});
