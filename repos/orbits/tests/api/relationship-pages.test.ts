import assert from "node:assert/strict";
import test from "node:test";
import { createRelationshipPageGetHandler } from "../../app/api/relationship-communication/read-handler";
import { readMessageCards, sendWindowMessage, BoundedMessageReadError } from "../../app/(app)/app/inbox/bounded-contact-messages-view-model";

const actor = { id: "a", accountId: "a", userId: "subject", workspaceId: "w", name: "A", email: "a@example.test" };
test("relationship pages authenticate once, preserve scope and reject duplicate inputs", async () => {
  let authentications = 0, calls = 0;
  const handler = createRelationshipPageGetHandler("messages", {
    resolveActor: async () => { authentications++; return actor; },
    service: scope => {
      assert.equal(scope, actor);
      return { conversations: async () => { throw Error("wrong endpoint"); }, messages: async (id, query) => {
        calls++; assert.equal(id, "c"); assert.deepEqual(query, { limit: 2, cursor: "signed", direction: "older" });
        return { actorId: "a" } as any;
      } };
    },
  });
  const response = await handler(new Request("https://orbit.test/messages?limit=2&cursor=signed"), { params: Promise.resolve({ id: "c" }) });
  assert.equal(response.status, 200); assert.equal(authentications, 1); assert.equal(calls, 1);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await handler(new Request("https://orbit.test/messages?limit=2&limit=3"))).status, 400);
  assert.equal(calls, 1);
  assert.equal((await createRelationshipPageGetHandler("messages", { resolveActor: async () => null })(new Request("https://orbit.test/messages"))).status, 401);
});

test("relationship errors fail closed without exposing private SQL diagnostics", async () => {
  for (const [message, status] of [["RELATIONSHIP_NOT_FOUND", 404], ["RELATIONSHIP_CURSOR_INVALID", 400], ["RELATIONSHIP_PAGE_INPUT_INVALID", 400], ["private SQL diagnostic", 503]] as const) {
    const handler = createRelationshipPageGetHandler("conversations", { resolveActor: async () => actor,
      service: () => ({ conversations: async () => { throw Error(message); }, messages: async () => { throw Error(message); } }) });
    const response = await handler(new Request("https://orbit.test/conversations"));
    assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /private SQL diagnostic/);
  }
});

test("bounded Web reads and writes preserve revocation errors instead of replaying or falling back", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  try {
    let calls: string[] = [];
    globalThis.fetch = async url => { calls.push(String(url)); return Response.json({}, { status: 403 }); };
    await assert.rejects(readMessageCards("a", controller.signal), error => error instanceof BoundedMessageReadError && error.status === 403);
    assert.equal(calls.length, 1);
    calls = [];
    globalThis.fetch = async url => {
      calls.push(String(url));
      return String(url) === "/api/account/me" ? Response.json({ success: true, data: { account: { id: "a" } } }) : Response.json({}, { status: 403 });
    };
    await assert.rejects(sendWindowMessage("a", { conversationId: "c", body: "secret", id: "same-id", version: "v" }, controller.signal), error => error instanceof BoundedMessageReadError && error.status === 403);
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
