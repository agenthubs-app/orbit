import assert from "node:assert/strict";
import test from "node:test";

import { createSyncRouteHandlers } from "../../app/api/sync/handler";
import { SyncCursorError } from "../../features/sync/cursor";
import {
  SYNC_DEFAULT_LIMIT,
  type IncrementalSyncReadService,
} from "../../features/sync/read-service";

const actor = { id: "account:route-owner", workspaceId: "workspace:route" };

function request(query = "") {
  return new Request(`https://orbit.example/api/sync${query}`);
}

function stubService(readPage: IncrementalSyncReadService["readPage"]): IncrementalSyncReadService {
  return { readPage };
}

const emptyPage = {
  workspaceId: actor.workspaceId,
  changes: [],
  nextCursor: "opaque",
  hasMore: false,
  highWatermark: "7",
  serverTime: "2026-09-16T08:00:00.000Z",
} as const;

test("GET requires authentication and never invokes storage for anonymous requests", async () => {
  let calls = 0;
  const handlers = createSyncRouteHandlers({
    resolveActor: async () => null,
    createService: () => stubService(async () => { calls += 1; throw new Error("must not run"); }),
  });
  const response = await handlers.GET(request());
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("GET derives actor/workspace only from auth and returns the shared success envelope", async () => {
  const reads: unknown[] = [];
  const handlers = createSyncRouteHandlers({
    resolveActor: async () => actor,
    createService: () => stubService(async (input) => { reads.push(input); return emptyPage; }),
  });
  const response = await handlers.GET(request("?actorId=account:foreign&workspaceId=workspace:foreign&limit=1"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: emptyPage });
  assert.deepEqual(reads, [{ actorId: actor.id, workspaceId: actor.workspaceId, limit: 1 }]);
});

test("limit defaults to 100, accepts 1/200, and rejects every malformed or out-of-range value", async () => {
  const limits: number[] = [];
  const handlers = createSyncRouteHandlers({
    resolveActor: async () => actor,
    createService: () => stubService(async (input) => {
      limits.push(input.limit);
      return emptyPage;
    }),
  });
  assert.equal((await handlers.GET(request())).status, 200);
  assert.equal((await handlers.GET(request("?limit=1"))).status, 200);
  assert.equal((await handlers.GET(request("?limit=200"))).status, 200);
  assert.deepEqual(limits, [SYNC_DEFAULT_LIMIT, 1, 200]);
  for (const value of ["0", "201", "1.5", "nope", ""]) {
    const response = await handlers.GET(request(`?limit=${value}`));
    const body = await response.json();
    assert.equal(response.status, 400, value);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  }
});

test("malformed, expired, rotated-secret, or foreign-scope cursors use the shared reset envelope without scope leakage", async () => {
  const cursors: Array<string | undefined> = [];
  const handlers = createSyncRouteHandlers({
    resolveActor: async () => actor,
    createService: () => stubService(async (input) => {
      cursors.push(input.cursor);
      throw new SyncCursorError("SYNC_RESET_REQUIRED", "internal actor account:foreign workspace:secret signature");
    }),
  });
  const response = await handlers.GET(request("?cursor=malformed"));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.deepEqual(body, {
    success: false,
    error: {
      code: "CONFLICT",
      message: "Sync cursor must be reset.",
      context: { syncErrorCode: "SYNC_RESET_REQUIRED" },
    },
  });
  assert.equal(JSON.stringify(body).includes("account:foreign"), false);
  assert.equal(JSON.stringify(body).includes("workspace:secret"), false);
  assert.equal(JSON.stringify(body).includes("signature"), false);

  const empty = await handlers.GET(request("?cursor="));
  assert.equal(empty.status, 409);
  assert.deepEqual(cursors, ["malformed", ""]);
});

test("missing server cursor secret or authenticated workspace fails in the shared service-unavailable envelope", async () => {
  for (const handlers of [
    createSyncRouteHandlers({ resolveActor: async () => actor, createService: () => null }),
    createSyncRouteHandlers({ resolveActor: async () => ({ id: actor.id }), createService: () => stubService(async () => { throw new Error("must not run"); }) }),
  ]) {
    const response = await handlers.GET(request());
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
  }
});

test("unexpected service failures are sanitized by the shared failure envelope", async () => {
  const handlers = createSyncRouteHandlers({
    resolveActor: async () => actor,
    createService: () => stubService(async () => { throw new Error("database password and SQL details"); }),
  });
  const response = await handlers.GET(request());
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
  assert.equal(JSON.stringify(body).includes("password"), false);
});

test("authentication and service construction failures use the sanitized shared 503 envelope", async () => {
  const failures = [
    createSyncRouteHandlers({
      resolveActor: async () => { throw new Error("auth token details"); },
    }),
    createSyncRouteHandlers({
      resolveActor: async () => actor,
      createService: () => { throw new Error("database password details"); },
    }),
  ];

  for (const handlers of failures) {
    const response = await handlers.GET(request());
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
    assert.equal(JSON.stringify(body).includes("token"), false);
    assert.equal(JSON.stringify(body).includes("password"), false);
  }
});
