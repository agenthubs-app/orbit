import assert from "node:assert/strict";
import test from "node:test";

test("account status distinguishes active, disabled, password-changed and database unavailable", async () => {
  const { createAccountStatusGetHandler } = await import("../../app/api/account/status/handler");
  let status: "active" | "disabled" | "password_changed" = "active";
  let failure = false;
  const handler = createAccountStatusGetHandler({
    resolveClaims: async () => ({ email: "user@example.test", userId: "user-1", authenticatedAt: 1000 }),
    getStatus: async () => { if (failure) throw new Error("private database diagnostic"); return status; },
  });
  for (const expected of ["active", "disabled", "password_changed"] as const) {
    status = expected;
    const response = await handler(new Request("https://orbit.example/api/account/status"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: expected });
  }
  failure = true;
  const unavailable = await handler(new Request("https://orbit.example/api/account/status"));
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /private database diagnostic/);
});

test("account status rejects an unreadable or missing session without querying storage", async () => {
  const { createAccountStatusGetHandler } = await import("../../app/api/account/status/handler");
  let lookedUp = false;
  const handler = createAccountStatusGetHandler({ resolveClaims: async () => null, getStatus: async () => { lookedUp = true; return "active"; } });
  const response = await handler(new Request("https://orbit.example/api/account/status"));
  assert.equal(response.status, 401);
  assert.equal(lookedUp, false);
});

test("account status lookup maps lifecycle and password timestamps without hiding storage errors", async () => {
  const { getPasswordSessionStatus } = await import("../../features/auth/session-revocation");
  let row: any = { lifecycleState: "active", payload: { id: "user-1", passwordChangedAt: "1970-01-01T00:00:00.500Z" } };
  const database = { workspaceId: "workspace-test", store: { getRecord: async () => row } };
  const input = { email: "user@example.test", userId: "user-1", authenticatedAt: 1000 };
  assert.equal(await getPasswordSessionStatus(input, database as never), "active");
  row = { lifecycleState: "disabled", payload: { id: "user-1" } };
  assert.equal(await getPasswordSessionStatus(input, database as never), "disabled");
  row = { lifecycleState: "active", payload: { id: "user-1", passwordChangedAt: "1970-01-01T00:00:01.000Z" } };
  assert.equal(await getPasswordSessionStatus(input, database as never), "password_changed");
  await assert.rejects(getPasswordSessionStatus(input, null), /ACCOUNT_STATUS_DATABASE_UNAVAILABLE/);
  const failing = { ...database, store: { getRecord: async () => { throw new Error("db down"); } } };
  await assert.rejects(getPasswordSessionStatus(input, failing as never), /db down/);
});
