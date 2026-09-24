import assert from "node:assert/strict";
import test from "node:test";
import { createOrbitApiClient } from "../src/api/client";
import { readRelationshipUnreadCount, type RelationshipUnreadCapability } from "../src/api/relationship-unread-summary";

function harness(responses: { status: number; data?: unknown }[]) {
  const paths: string[] = [];
  const client = createOrbitApiClient({ baseUrl: "https://example.test", fetchImpl: async path => {
    paths.push(new URL(String(path)).pathname);
    const response = responses.shift(); assert.ok(response);
    return new Response(JSON.stringify(response.status === 200 ? { success: true, data: response.data } : { success: false, error: { code: "NOT_FOUND", message: "unavailable" } }), { status: response.status, headers: { "Content-Type": "application/json" } });
  } });
  const capability: RelationshipUnreadCapability = {};
  const controller = new AbortController();
  return { paths, capability, controller, read: () => readRelationshipUnreadCount({ client, capability, actorId: "actor:one", signal: controller.signal }) };
}

test("new badge reads no conversation list and validates actor plus safe count", async () => {
  for (const [data, expected] of [
    [{ actorId: "actor:one", unreadTotal: 12, refreshedAt: "2026-09-25T00:00:00Z" }, 12],
    [{ actorId: "actor:other", unreadTotal: 12, refreshedAt: "2026-09-25T00:00:00Z" }, undefined],
    [{ actorId: "actor:one", unreadTotal: -1, refreshedAt: "2026-09-25T00:00:00Z" }, undefined],
  ] as const) {
    const h = harness([{ status: 200, data }]);
    assert.equal(await h.read(), expected);
    assert.deepEqual(h.paths, ["/api/relationship-communication/unread-summary"]);
  }
});

test("old deployment fallback is scoped and remembers endpoint absence", async () => {
  const legacy = { conversations: [], unreadTotal: 7, refreshedAt: "2026-09-25T00:00:00Z" };
  const h = harness([{ status: 404 }, { status: 200, data: legacy }, { status: 200, data: legacy }]);
  assert.equal(await h.read(), 7);
  assert.equal(await h.read(), 7);
  assert.deepEqual(h.paths, ["/api/relationship-communication/unread-summary", "/api/relationship-communication/conversations", "/api/relationship-communication/conversations"]);
});

test("server, auth, permission and malformed response failures never trigger expensive fallback", async () => {
  for (const status of [401, 403, 503]) {
    const h = harness([{ status }]);
    assert.equal(await h.read(), undefined);
    assert.equal(h.paths.length, 1);
    assert.equal(h.capability.legacyOnly, undefined);
  }
});
