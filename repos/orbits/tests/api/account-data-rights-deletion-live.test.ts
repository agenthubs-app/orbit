import assert from "node:assert/strict";
import test from "node:test";

import type { ContractReply } from "../../features/redesign-contracts/route";

const code = (reply: ContractReply) => "error" in reply ? reply.error.code : null;

test("deletion live handlers require a receipt and surface host-registration and late-cancel states", async () => {
  const { createAccountDeletionLiveHandlers } = await import("../../features/account/data-rights/deletion-handlers");
  const actor = { id: "actor", userId: "profile", email: "actor@example.test" };
  const store = {
    async get() { return null; },
    async request() { return { kind: "host-blocked" as const }; },
    async cancel() { return { kind: "too-late" as const }; },
  };
  const handlers = createAccountDeletionLiveHandlers({ resolveActor: async () => actor, store });
  const bad = new Request("http://localhost:3400/api/account/deletion-request", { method: "POST", body: "{}" });
  assert.equal(code(await handlers.request(bad)), "VALIDATION_ERROR");
  const valid = new Request("http://localhost:3400/api/account/deletion-request", { method: "POST", body: JSON.stringify({ reauthReceipt: "receipt", confirmed: true }) });
  assert.equal(code(await handlers.request(valid)), "CONFLICT");
  assert.equal(code(await handlers.cancel(new Request("http://localhost:3400/api/account/deletion-request", { method: "DELETE" }))), "CONFLICT");
  const anonymous = createAccountDeletionLiveHandlers({ resolveActor: async () => null, store });
  assert.equal(code(await anonymous.get(new Request("http://localhost:3400/api/account/deletion-request"))), "UNAUTHORIZED");
});

test("password receipt route only issues after verified credentials and Google requires a challenge", async () => {
  const { createAccountDeletionReauthHandler } = await import("../../features/account/data-rights/reauth-handler");
  const actor = { id: "actor", userId: "profile", email: "actor@example.test" };
  const handler = createAccountDeletionReauthHandler({ resolveActor: async () => actor,
    verifyPassword: async () => "verified", issueReceipt: async () => "one-time-receipt" });
  const response = await handler(new Request("http://localhost:3400/api/account/deletion-request/reauth", {
    method: "POST", body: JSON.stringify({ method: "password", password: "correct" }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reauthReceipt, "one-time-receipt");
  const missingChallenge = await handler(new Request("http://localhost:3400/api/account/deletion-request/reauth", {
    method: "POST", body: JSON.stringify({ method: "google" }),
  }));
  assert.equal(missingChallenge.status, 400);
});
