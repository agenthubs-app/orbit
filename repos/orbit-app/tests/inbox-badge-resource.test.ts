import assert from "node:assert/strict";
import test from "node:test";
import { subscribeInboxBadge } from "../src/api/inbox-badge-resource";
import { createOrbitApiClient } from "../src/api/client";
import { emitMessageStateInvalidation } from "../src/api/message-state";

test("same identity shares one in-flight read; queued writes recheck; last subscriber revokes", async () => {
  const calls: { signal: AbortSignal; reply: (response: Response) => void }[] = [];
  const client = createOrbitApiClient({ baseUrl: "https://example.test", fetchImpl: async (_url, options) => new Promise(resolve => calls.push({ signal: options!.signal!, reply: resolve })) });
  const a: (number | undefined)[] = [], b: (number | undefined)[] = [];
  const first = subscribeInboxBadge({ scope: "test:shared", actorId: "a", client, listener: n => a.push(n) });
  const second = subscribeInboxBadge({ scope: "test:shared", actorId: "a", client, listener: n => b.push(n) });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const response = (n: number) => Response.json({ success: true, data: { actorId: "a", messagesUnread: n, notificationMode: "legacy", notificationRead: "ready", notificationsUnread: 0, asOf: "2026-09-25T00:00:00Z" } });
  try {
    await settle(); assert.equal(calls.length, 1);
    emitMessageStateInvalidation(); emitMessageStateInvalidation();
    assert.equal(calls.length, 1, "no overlap even during invalidation");
    calls[0]!.reply(response(1)); await settle();
    assert.equal(calls.length, 2); assert.deepEqual(a, [], "superseded pre-write result is not published");
    calls[1]!.reply(response(8)); await settle();
    assert.deepEqual(a, [8]); assert.deepEqual(b, [8]);
    first(); emitMessageStateInvalidation(); await settle();
    assert.equal(calls.length, 3); assert.equal(calls[2]!.signal.aborted, false);
    second(); assert.equal(calls[2]!.signal.aborted, true);
    calls[2]!.reply(response(90)); await settle();
    assert.deepEqual(b, [8]);
  } finally { first(); second(); }
});
