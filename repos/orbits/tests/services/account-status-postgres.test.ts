import assert from "node:assert/strict";
import test from "node:test";

import { getPasswordSessionStatus } from "../../features/auth/session-revocation";
import { authUserRecordId } from "../../features/auth/storage/auth-user-live-record-provider";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";

const databaseUrl = process.env.ORBIT_LOCAL_DATABASE_URL;
const targetIsExactLocalTestDatabase = process.env.ORBIT_DATABASE_TARGET === "local" &&
  typeof databaseUrl === "string" &&
  new URL(databaseUrl).pathname.replace(/^\//u, "") === "orbit_test" &&
  (new URL(databaseUrl).hostname === "" || new URL(databaseUrl).hostname === "localhost" || new URL(databaseUrl).hostname === "127.0.0.1");

test("account status reads lifecycle and password rotation from isolated local orbit_test Postgres", {
  skip: targetIsExactLocalTestDatabase ? false : "requires explicit ORBIT_DATABASE_TARGET=local and ORBIT_LOCAL_DATABASE_URL=postgresql:///orbit_test",
}, async () => {
  const workspaceId = "sprint-0124-offline-write-test";
  const email = "account-status-0124@example.test";
  const userId = "user-status-0124";
  const recordId = authUserRecordId(email);
  const database = createConfiguredPostgresLiveRecordStore({
    env: {
      ORBIT_DATABASE_TARGET: "local",
      ORBIT_LOCAL_DATABASE_URL: databaseUrl,
      ORBIT_LOCAL_WORKSPACE_ID: workspaceId,
      NODE_ENV: "test",
    },
  });
  assert.ok(database);
  const { createAccountStatusGetHandler } = await import("../../app/api/account/status/handler");
  const input = { email, userId, authenticatedAt: Date.parse("2026-09-01T00:00:00.000Z") };
  const handler = createAccountStatusGetHandler({
    resolveClaims: async () => input,
    getStatus: claims => getPasswordSessionStatus(claims, database),
  });
  let clientClosed = false;
  const record = (lifecycleState: "active" | "deleted", passwordChangedAt: string) => ({
    workspaceId,
    collectionName: "auth_users",
    recordId,
    userId,
    sourceType: "sprint-test",
    sourceId: "0124-account-status",
    sourceLabel: null,
    provider: "credentials",
    providerRecordId: null,
    evidenceIds: [],
    targetType: null,
    targetId: null,
    occurredAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    deletedAt: null,
    lifecycleState,
    searchText: null,
    payload: { id: userId, email, passwordChangedAt, displayName: "Test User", provider: "credentials", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z" },
  });
  try {
    await database.store.upsertRecord(record("active", "2026-08-01T00:00:00.000Z"));
    assert.equal(await getPasswordSessionStatus(input, database), "active");
    const activeResponse = await handler(new Request("http://localhost/api/account/status"));
    assert.equal(activeResponse.status, 200);
    assert.deepEqual(await activeResponse.json(), { status: "active" });

    await database.store.upsertRecord(record("deleted", "2026-08-01T00:00:00.000Z"));
    assert.equal(await getPasswordSessionStatus(input, database), "disabled");
    const disabledResponse = await handler(new Request("http://localhost/api/account/status"));
    assert.equal(disabledResponse.status, 200);
    assert.deepEqual(await disabledResponse.json(), { status: "disabled" });

    await database.store.upsertRecord(record("active", "2026-09-01T00:00:00.000Z"));
    assert.equal(await getPasswordSessionStatus(input, database), "password_changed");
    const changedResponse = await handler(new Request("http://localhost/api/account/status"));
    assert.equal(changedResponse.status, 200);
    assert.deepEqual(await changedResponse.json(), { status: "password_changed" });

    await database.store.deleteRecord({ workspaceId, collectionName: "auth_users", recordId, deletedAt: new Date().toISOString() });
    await database.client.close();
    clientClosed = true;
    const unavailable = await handler(new Request("http://localhost/api/account/status"));
    assert.equal(unavailable.status, 503);
    const unavailableBody = await unavailable.json();
    assert.deepEqual(unavailableBody, { status: "unavailable" });
    assert.doesNotMatch(JSON.stringify(unavailableBody), /database|client|diagnostic|orbit_test|user-status-0124/u);
  } finally {
    if (!clientClosed) {
      await database.store.deleteRecord({ workspaceId, collectionName: "auth_users", recordId, deletedAt: new Date().toISOString() });
      await database.client.close();
    }
  }
});
