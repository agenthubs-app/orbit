import assert from "node:assert/strict";
import test from "node:test";

import { issueGoogleReauthChallenge, verifyGoogleReauthProof } from "../../features/account/data-rights/google-reauth-proof";
import { createAccountDeletionGoogleStartHandler, createAccountDeletionReauthHandler } from "../../features/account/data-rights/reauth-handler";

const secret = "local-test-secret";
const now = new Date("2026-10-20T05:00:00.000Z");
const principal = { actorId: "account-a", userId: "user-a", email: "a@example.com" };

test("Google proof requires a new IdP auth_time and the original account", async () => {
  const challenge = await issueGoogleReauthChallenge({ ...principal, secret, now });
  assert.ok(!challenge.includes(Buffer.from(principal.email).toString("base64url")));
  const proof = { sub: "user-a", email: "a@example.com", googleAuthTime: Math.floor(now.getTime() / 1000) + 2 };
  assert.equal((await verifyGoogleReauthProof({ challenge, principal, proof, secret, now: new Date(now.getTime() + 3_000) }))?.getTime(), now.getTime() + 2_000);
  assert.equal(await verifyGoogleReauthProof({ challenge, principal: { ...principal, actorId: "account-b" }, proof, secret, now }), null);
  assert.equal(await verifyGoogleReauthProof({ challenge, principal, proof: { ...proof, sub: "user-b" }, secret, now }), null);
  assert.equal(await verifyGoogleReauthProof({ challenge, principal, proof: { ...proof, googleAuthTime: Math.floor(now.getTime() / 1000) - 90 }, secret, now }), null);
  assert.equal(await verifyGoogleReauthProof({ challenge, principal, proof, secret, now: new Date(now.getTime() + 11 * 60_000) }), null);
  assert.equal(await verifyGoogleReauthProof({ challenge: `${challenge}x`, principal, proof, secret, now }), null);
});

test("Google route issues a purpose bound receipt only for the authenticated original account", async () => {
  const start = createAccountDeletionGoogleStartHandler({
    resolveActor: async () => ({ id: principal.actorId, userId: principal.userId, email: principal.email }),
    readMethod: async () => "google", secret,
  });
  const started = await start();
  assert.equal(started.status, 200);
  const { challenge } = await started.json() as { challenge: string };
  const issued: Array<{ actorId: string; userId: string; evidenceAt: Date }> = [];
  const handler = createAccountDeletionReauthHandler({
    resolveActor: async () => ({ id: principal.actorId, userId: principal.userId, email: principal.email }),
    readGoogleProof: async () => ({ sub: principal.userId, email: principal.email, googleAuthTime: Math.floor(Date.now() / 1000) }),
    googleSecret: secret,
    issueReceipt: async (actorId, userId, _purpose, evidenceAt) => {
      issued.push({ actorId, userId, evidenceAt }); return "receipt-for-deletion";
    },
  });
  const response = await handler(new Request("http://localhost/api/account/deletion-request/reauth", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method: "google", challenge }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reauthReceipt: "receipt-for-deletion" });
  assert.equal(issued.length, 1);
  assert.equal(issued[0]?.actorId, principal.actorId);
  assert.equal(issued[0]?.userId, principal.userId);
});
