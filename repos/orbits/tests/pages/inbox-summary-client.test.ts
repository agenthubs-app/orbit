import assert from "node:assert/strict";
import test from "node:test";
import { readWebInboxSummary } from "../../app/(app)/app/inbox/inbox-summary-client";
import { readInboxUnreadCounts } from "../../app/(app)/app/inbox/relationship-inbox-panel";

test("Web badge uses only the selected narrow source, never falls back on failures", async () => {
  const previous = globalThis.fetch;
  const calls: string[] = [];
  const summary = { actorId: "a", messagesUnread: 3, notificationsUnread: 7, notificationMode: "legacy", notificationRead: "ready", asOf: "2026-09-25T00:00:00Z" };
  try {
    globalThis.fetch = (async url => { calls.push(String(url)); return Response.json({ success: true, data: summary }); }) as typeof fetch;
    assert.deepEqual(await readWebInboxSummary("a", "zh"), { threads: 3, alerts: 7 });
    assert.deepEqual(calls, ["/api/inbox/summary"]);
    await assert.rejects(readWebInboxSummary("b", "zh"), /Account changed/);
    for (const status of [401, 403, 500, 503]) {
      globalThis.fetch = (async () => Response.json({ success: false }, { status })) as typeof fetch;
      await assert.rejects(readWebInboxSummary("a", "zh"));
    }
    globalThis.fetch = (async () => Response.json({ success: false }, { status: 404 })) as typeof fetch;
    await assert.rejects(readWebInboxSummary("a", "zh"), /Inbox summary unavailable/);
    calls.length = 0;
    globalThis.fetch = (async url => { calls.push(String(url)); return Response.json({ success: true,
      data: { ...summary, notificationMode: "typed", notificationsUnread: 9 } }); }) as typeof fetch;
    assert.deepEqual(await readWebInboxSummary("a", "zh"), { threads: 3, alerts: 9 });
    assert.deepEqual(calls, ["/api/inbox/summary"]);
  } finally { globalThis.fetch = previous; }
});

test("desktop and mobile Web triggers merge concurrent reads and retain both identity checks", async () => {
  const previous = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = (async url => {
      calls.push(String(url));
      return Response.json({ success: true, data: String(url) === "/api/account/me"
        ? { account: { id: "a" } }
        : { actorId: "a", messagesUnread: 2, notificationMode: "legacy", notificationRead: "ready", notificationsUnread: 4, asOf: "2026-09-25T00:00:00Z" } });
    }) as typeof fetch;
    assert.deepEqual(await Promise.all([readInboxUnreadCounts("zh", "a"), readInboxUnreadCounts("zh", "a")]), [{ threads: 2, alerts: 4 }, { threads: 2, alerts: 4 }]);
    assert.deepEqual(calls, ["/api/account/me", "/api/inbox/summary", "/api/account/me"]);
  } finally { globalThis.fetch = previous; }
});
