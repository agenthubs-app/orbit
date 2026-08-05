import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventOperationsAdminGetHandler,
  createEventOperationsExportGetHandler,
} from "../../app/api/events/[id]/operations/handlers";
import type {
  EventAccessAssignmentState,
  EventAccessRole,
} from "../../features/events/event-access/contract";
import type { EventAccessService } from "../../features/events/event-access/service";
import { EventCapabilityDeniedError } from "../../features/events/event-access/guard";
import {
  EventAccessRepositoryError,
  type EventAccessRepositoryErrorCode,
} from "../../features/events/event-access/storage/postgres-repository";
import type { EventOperationsService } from "../../features/events/event-operations/service";

const eventId = "event:one";
const actorId = "actor:one";
const context = { params: Promise.resolve({ id: eventId }) };

interface AccessFacts {
  owner: boolean;
  role: EventAccessRole | null;
  state: EventAccessAssignmentState | null;
}

function accessService(facts: AccessFacts): EventAccessService {
  return {
    async get(input) {
      const query = input as { eventId: string; subjectActorId: string };
      return {
        eventId: query.eventId,
        owner: facts.owner,
        revision: 1,
        role: facts.role,
        state: facts.state,
        subjectActorId: query.subjectActorId,
      };
    },
    async grant() {
      throw new Error("The read guard must not grant access.");
    },
    async revoke() {
      throw new Error("The read guard must not revoke access.");
    },
  };
}

function failingAccessService(
  code: EventAccessRepositoryErrorCode,
): EventAccessService {
  return {
    async get() {
      throw new EventAccessRepositoryError(code);
    },
    async grant() {
      throw new Error("unused");
    },
    async revoke() {
      throw new Error("unused");
    },
  };
}

function operationsService(calls: { adminWorkspace: number }): EventOperationsService {
  return {
    async adminWorkspace() {
      calls.adminWorkspace += 1;
      return { eventId } as never;
    },
  } as unknown as EventOperationsService;
}

function exportOperationsService(
  calls: { adminWorkspace: number },
): EventOperationsService {
  return {
    async adminWorkspace() {
      calls.adminWorkspace += 1;
      return {
        checkIns: [],
        participants: [],
        publishedResult: null,
      } as never;
    },
  } as unknown as EventOperationsService;
}

async function responseCode(response: Response): Promise<string> {
  const body = (await response.json()) as {
    error?: { code?: string };
  };
  return body.error?.code ?? "";
}

test("admin route authenticates before constructing access or operations runtimes", async () => {
  let accessRuntimeCalls = 0;
  let operationsRuntimeCalls = 0;
  const handler = createEventOperationsAdminGetHandler({
    createAccessService: () => {
      accessRuntimeCalls += 1;
      return accessService({ owner: true, role: null, state: null });
    },
    createService: () => {
      operationsRuntimeCalls += 1;
      return operationsService({ adminWorkspace: 0 });
    },
    resolveActor: async () => null,
  });

  const response = await handler(new Request("http://test"), context);

  assert.equal(response.status, 401);
  assert.equal(accessRuntimeCalls, 0);
  assert.equal(operationsRuntimeCalls, 0);
});

test("admin route admits only owner or an active operations assignment", async (t) => {
  const cases: readonly [string, AccessFacts, number][] = [
    ["owner", { owner: true, role: null, state: null }, 200],
    [
      "active operations",
      { owner: false, role: "operations", state: "active" },
      200,
    ],
    [
      "check-in staff",
      { owner: false, role: "check_in", state: "active" },
      403,
    ],
    ["reviewer", { owner: false, role: "reviewer", state: "active" }, 403],
    [
      "read-only analyst",
      { owner: false, role: "read_only_analyst", state: "active" },
      403,
    ],
    [
      "revoked operations",
      { owner: false, role: "operations", state: "revoked" },
      403,
    ],
    ["unassigned actor", { owner: false, role: null, state: null }, 403],
  ];

  for (const [name, facts, expectedStatus] of cases) {
    await t.test(name, async () => {
      let operationsRuntimeCalls = 0;
      const serviceCalls = { adminWorkspace: 0 };
      const handler = createEventOperationsAdminGetHandler({
        createAccessService: () => accessService(facts),
        createService: () => {
          operationsRuntimeCalls += 1;
          return operationsService(serviceCalls);
        },
        resolveActor: async () => ({ id: actorId }),
      });

      const response = await handler(new Request("http://test"), context);

      assert.equal(response.status, expectedStatus);
      assert.equal(
        operationsRuntimeCalls,
        expectedStatus === 200 ? 1 : 0,
      );
      assert.equal(
        serviceCalls.adminWorkspace,
        expectedStatus === 200 ? 1 : 0,
      );
    });
  }
});

test("admin route maps canonical repository failures and never reads operations data", async (t) => {
  const cases: readonly [EventAccessRepositoryErrorCode, number, string][] = [
    ["EVENT_ACCESS_NOT_READY", 503, "SERVICE_UNAVAILABLE"],
    ["EVENT_ACCESS_REPOSITORY_FAILED", 503, "SERVICE_UNAVAILABLE"],
    ["EVENT_ACCESS_NOT_FOUND", 404, "NOT_FOUND"],
    ["EVENT_ACCESS_FORBIDDEN", 403, "FORBIDDEN"],
    ["EVENT_ACCESS_CONFLICT", 409, "CONFLICT"],
  ];

  for (const [repositoryCode, status, apiCode] of cases) {
    await t.test(repositoryCode, async () => {
      let operationsRuntimeCalls = 0;
      const handler = createEventOperationsAdminGetHandler({
        createAccessService: () => failingAccessService(repositoryCode),
        createService: () => {
          operationsRuntimeCalls += 1;
          return operationsService({ adminWorkspace: 0 });
        },
        resolveActor: async () => ({ id: actorId }),
      });

      const response = await handler(new Request("http://test"), context);

      assert.equal(response.status, status);
      assert.equal(await responseCode(response), apiCode);
      assert.equal(operationsRuntimeCalls, 0);
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
});

test("admin route ignores the legacy owner lookup when canonical facts deny access", async () => {
  let legacyOwnerLookups = 0;
  let operationsRuntimeCalls = 0;
  const handler = createEventOperationsAdminGetHandler({
    createAccessService: () =>
      accessService({ owner: false, role: null, state: null }),
    createService: () => {
      operationsRuntimeCalls += 1;
      return operationsService({ adminWorkspace: 0 });
    },
    ownedAccess: {
      createEventService: () => {
        legacyOwnerLookups += 1;
        throw new Error("Legacy ownership must not authorize this route.");
      },
    },
    resolveActor: async () => ({ id: actorId }),
  });

  const response = await handler(new Request("http://test"), context);

  assert.equal(response.status, 403);
  assert.equal(legacyOwnerLookups, 0);
  assert.equal(operationsRuntimeCalls, 0);
});

test("canonical operations access succeeds even when legacy owner lookup would fail", async () => {
  let legacyOwnerLookups = 0;
  const calls = { adminWorkspace: 0 };
  const handler = createEventOperationsAdminGetHandler({
    createAccessService: () =>
      accessService({ owner: false, role: "operations", state: "active" }),
    createService: () => operationsService(calls),
    ownedAccess: {
      createEventService: () => {
        legacyOwnerLookups += 1;
        throw new Error("Legacy ownership does not know this assignment.");
      },
    },
    resolveActor: async () => ({ id: actorId }),
  });

  const response = await handler(new Request("http://test"), context);

  assert.equal(response.status, 200);
  assert.equal(legacyOwnerLookups, 0);
  assert.equal(calls.adminWorkspace, 1);
});

test("admin route preserves canonical errors when the service rechecks access", async (t) => {
  const cases: readonly [string, Error, number, string][] = [
    ["revoked between checks", new EventCapabilityDeniedError(), 403, "FORBIDDEN"],
    [
      "repository became unavailable",
      new EventAccessRepositoryError("EVENT_ACCESS_REPOSITORY_FAILED"),
      503,
      "SERVICE_UNAVAILABLE",
    ],
    [
      "event disappeared",
      new EventAccessRepositoryError("EVENT_ACCESS_NOT_FOUND"),
      404,
      "NOT_FOUND",
    ],
    [
      "assignment changed concurrently",
      new EventAccessRepositoryError("EVENT_ACCESS_CONFLICT"),
      409,
      "CONFLICT",
    ],
  ];

  for (const [name, serviceError, status, apiCode] of cases) {
    await t.test(name, async () => {
      const handler = createEventOperationsAdminGetHandler({
        createAccessService: () =>
          accessService({ owner: false, role: "operations", state: "active" }),
        createService: () =>
          ({
            async adminWorkspace() {
              throw serviceError;
            },
          }) as unknown as EventOperationsService,
        resolveActor: async () => ({ id: actorId }),
      });

      const response = await handler(new Request("http://test"), context);

      assert.equal(response.status, status);
      assert.equal(await responseCode(response), apiCode);
    });
  }
});

test("CSV export follows attendees.export capability for owner and delegated operations", async (t) => {
  const cases: readonly [string, AccessFacts, number][] = [
    ["owner", { owner: true, role: null, state: null }, 200],
    [
      "active operations",
      { owner: false, role: "operations", state: "active" },
      200,
    ],
    [
      "check-in staff",
      { owner: false, role: "check_in", state: "active" },
      403,
    ],
  ];

  for (const [name, facts, expectedStatus] of cases) {
    await t.test(name, async () => {
      const calls = { adminWorkspace: 0 };
      const handler = createEventOperationsExportGetHandler({
        createAccessService: () => accessService(facts),
        createService: () => exportOperationsService(calls),
        resolveActor: async () => ({ id: actorId }),
      });

      const response = await handler(new Request("http://test"), context);

      assert.equal(response.status, expectedStatus);
      assert.equal(calls.adminWorkspace, expectedStatus === 200 ? 1 : 0);
      if (expectedStatus === 200) {
        assert.match(response.headers.get("content-type") ?? "", /text\/csv/u);
        assert.match(await response.text(), /^generationId,snapshotHash/u);
      }
    });
  }
});
