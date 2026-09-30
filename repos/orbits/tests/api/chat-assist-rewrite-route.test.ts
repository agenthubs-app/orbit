import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { createChatRewritePostHandler } from "../../app/api/chat/assist/rewrite/handler";

/**
 * Sprint 0104: the web inbox "polish draft" keeps working after the legacy chat
 * store is retired. The rewrite is built from the request alone, so it works
 * for new-system conversation ids and staged draft threads, and needs no
 * database at all (no live database is configured in this test).
 */

const envKeys = [
  "ORBIT_FEATURE_MODE", "ORBIT_MODULE_MODE", "ORBIT_DATABASE_TARGET", "ORBIT_LOCAL_DATABASE_URL",
  "ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL",
] as const;
const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const actor = { id: "account:rewrite-a", accountId: "account:rewrite-a", email: "rewrite-a@example.test", name: "Rewrite A" };

before(() => {
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, { ORBIT_FEATURE_MODE: "live", ORBIT_MODULE_MODE: "live" });
});
after(() => {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function rewriteRequest(body: unknown): Request {
  return new Request("https://orbit.example/api/chat/assist/rewrite", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

test("rewrite returns a review-only suggestion for a relationship conversation without any database", async () => {
  const response = await createChatRewritePostHandler(async () => actor)(rewriteRequest({
    conversationId: "relationship-conversation:0104",
    organization: "Orbit QA",
    participantName: "佐藤",
    sourceText: "明天把资料发我",
  }));
  const body = await response.json() as { success: boolean; data: { assists: { conversationId: string; suggestedText: string; sendActionRequiresConfirmation: boolean; externalSendRequested: boolean; aiProviderRequested: boolean }[] } };
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  const [assist] = body.data.assists;
  assert.equal(assist?.conversationId, "relationship-conversation:0104");
  assert.match(assist?.suggestedText ?? "", /佐藤/u);
  assert.match(assist?.suggestedText ?? "", /明天把资料发我/u);
  assert.equal(assist?.sendActionRequiresConfirmation, true);
  assert.equal(assist?.externalSendRequested, false);
  assert.equal(assist?.aiProviderRequested, false);
});

test("rewrite without source text is a validation error", async () => {
  const response = await createChatRewritePostHandler(async () => actor)(rewriteRequest({ participantName: "佐藤" }));
  assert.equal(response.status, 400);
  assert.equal((await response.json() as { success: boolean }).success, false);
});

test("rewrite requires a signed-in account in live mode", async () => {
  const response = await createChatRewritePostHandler(async () => null)(rewriteRequest({ sourceText: "x" }));
  assert.equal(response.status, 401);
});
