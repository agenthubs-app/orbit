import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import {
  invalidateInboxActorConfirmation,
  readContactMessageActor,
  readContactMessageActorForWrite,
} from "../../app/(app)/app/inbox/inbox-request";
import {
  BoundedMessageReadError,
  confirmMessageWindowRead,
  readMessageCards,
  readMessageWindow,
  sendWindowMessage,
} from "../../app/(app)/app/inbox/bounded-contact-messages-view-model";
import { readInboxUnreadCounts } from "../../app/(app)/app/inbox/relationship-inbox-panel";

/*
 * W0031 SC-02: the inbox shares one `/api/account/me` confirmation per 15 s poll cycle, never
 * remembers failures, late or abandoned answers, and writes always pass a fresh barrier.
 */

const at = "2026-09-25T00:00:00Z";
const conversation = { conversationId: "c", contactId: "contact", participantAccountIds: ["a", "b"], participantDisplayNames: { a: "Self", b: "Remote" }, qualificationVersion: "v", status: "active", createdAt: at, updatedAt: at };
const ok = (data: unknown) => Response.json({ success: true, data });
const me = (id: string) => ok({ account: { id } });

interface Call { path: string; method: string }
let calls: Call[];
let account: string;
let meHandler: (() => Promise<Response>) | null;
const previousFetch = globalThis.fetch;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const meCalls = () => calls.filter(c => c.path === "/api/account/me").length;
const flush = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-29T00:00:00Z") });
  invalidateInboxActorConfirmation();
  calls = [];
  account = "a";
  meHandler = null;
  globalThis.fetch = (async (url: string | URL | Request, options: RequestInit = {}) => {
    const path = String(url);
    calls.push({ path, method: options.method ?? "GET" });
    if (path === "/api/account/me") return meHandler ? meHandler() : me(account);
    if (path === "/api/inbox/summary") return ok({ actorId: account, messagesUnread: 2, notificationsUnread: 4, notificationMode: "typed", notificationRead: "ready", asOf: at });
    if (path.startsWith("/api/relationship-communication/conversation-summaries")) return ok({ actorId: account, items: [{ ...conversation, unreadCount: 1, lastMessage: null }], hasMore: false, nextCursor: null, asOf: at });
    if (path.includes("/messages?")) return ok({ actorId: account, conversation, items: [], nextCursor: null, newestCursor: null, hasMore: false, direction: "older", asOf: at });
    if (path.endsWith("/read")) return ok({ conversationId: "c", lastReadMessageId: "m", readAt: at });
    if (path.endsWith("/messages") && options.method === "POST") return ok({ conversationId: "c", deliveryState: "delivered", message: { body: "hi", senderAccountId: account } });
    return Response.json({ success: false }, { status: 404 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = previousFetch;
  mock.timers.reset();
  invalidateInboxActorConfirmation();
});

test("(a) one poll cycle (badge counts + tab list + selected detail) confirms identity once; the next cycle confirms again", async () => {
  const signal = new AbortController().signal;
  const cycle = async () => {
    await readInboxUnreadCounts("zh", "a");
    await readMessageCards("a", signal);
    await readMessageWindow("a", "c", signal);
  };
  await cycle();
  assert.equal(meCalls(), 1);
  assert.equal(calls.filter(c => c.path !== "/api/account/me").length, 3, "every non-identity read still happens");
  mock.timers.tick(15_000);
  await cycle();
  assert.equal(meCalls(), 2, "a 15 s later cycle asks again");
  mock.timers.tick(9_999);
  await readContactMessageActor();
  assert.equal(meCalls(), 2, "reused inside the 10 s window");
  mock.timers.tick(1);
  await readContactMessageActor();
  assert.equal(meCalls(), 3, "expired at 10 s");
});

test("(b) concurrent confirmations share one request; one caller cancelling only fails that caller", async () => {
  const gate = deferred<void>();
  meHandler = async () => { await gate.promise; return me("a"); };
  const cancelled = new AbortController();
  const first = readContactMessageActor();
  const second = readContactMessageActor(cancelled.signal);
  const third = readContactMessageActor(new AbortController().signal);
  await flush();
  assert.equal(meCalls(), 1);
  cancelled.abort();
  await assert.rejects(second, (error: Error) => error.name === "AbortError");
  gate.resolve();
  assert.deepEqual(await Promise.all([first, third]), ["a", "a"]);
  await readContactMessageActor();
  assert.equal(meCalls(), 1, "(f③) the surviving consumer wrote the reusable result");
});

test("(c) failures keep their old errors and are never reused", async () => {
  const signal = new AbortController().signal;
  const failures: [() => Promise<Response>, RegExp, number][] = [
    [async () => Response.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 }), /UNAUTHORIZED/, 401],
    [async () => Response.json({ success: false }, { status: 500 }), /Communication request failed/, 500],
    [async () => Response.json({ success: false }), /Communication request failed/, 503],
    [async () => me(""), /No account/, 403],
    [async () => ok({ account: {} }), /No account/, 403],
  ];
  for (const [handler, message, boundedStatus] of failures) {
    meHandler = handler;
    let before = meCalls();
    await assert.rejects(readContactMessageActor(), message);
    await assert.rejects(readContactMessageActor(), message);
    assert.equal(meCalls(), before + 2, `${message} is not remembered`);
    before = meCalls();
    await assert.rejects(readMessageCards("a", signal), (error: unknown) => error instanceof BoundedMessageReadError && error.status === boundedStatus);
    assert.equal(meCalls(), before + 1);
  }
  meHandler = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(readContactMessageActor(), /Failed to fetch/);
  meHandler = null;
  const before = meCalls();
  assert.equal(await readContactMessageActor(), "a");
  assert.equal(meCalls(), before + 1, "a network failure is not remembered either");
});

test("(d) an account switch is detected by /api/account/me, response actorIds and 401/403, and clears the reuse", async () => {
  const signal = new AbortController().signal;
  assert.equal(await readContactMessageActor(), "a");
  // A response for another account: the page fails as before and the reuse is dropped.
  account = "b";
  await assert.rejects(readMessageCards("a", signal), (error: unknown) => error instanceof BoundedMessageReadError && error.status === 403);
  const afterMismatch = meCalls();
  assert.equal(await readContactMessageActor(), "b", "next confirmation asks again");
  assert.equal(meCalls(), afterMismatch + 1);
  // /api/account/me itself answers B while the badge expects A.
  invalidateInboxActorConfirmation();
  await assert.rejects(readInboxUnreadCounts("zh", "a"), /Account changed/);
  const afterBadge = meCalls();
  await readContactMessageActor();
  assert.equal(meCalls(), afterBadge + 1);
  // 401 from a bounded read also clears the reuse.
  account = "a";
  await readContactMessageActor();
  const previous = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => String(url).startsWith("/api/relationship-communication/conversation-summaries")
    ? Response.json({ success: false }, { status: 401 }) : previous(url, options)) as typeof fetch;
  await assert.rejects(readMessageCards("a", signal), (error: unknown) => error instanceof BoundedMessageReadError && error.status === 401);
  const after401 = meCalls();
  await readContactMessageActor();
  assert.equal(meCalls(), after401 + 1);
});

test("(e) writes always confirm with a request issued after the write started", async () => {
  const signal = new AbortController().signal;
  assert.equal(await readContactMessageActor(), "a");
  const before = meCalls();
  await sendWindowMessage("a", { conversationId: "c", body: "hi", id: "r1", version: "v" }, signal);
  await confirmMessageWindowRead("a", "c", "m", signal);
  // send: barrier; read receipt: barrier + fresh post-write confirmation (Codex review P2).
  assert.equal(meCalls(), before + 3, "a reusable result is never used for a write");
  assert.equal(await readContactMessageActorForWrite(), "a");
  assert.equal(meCalls(), before + 4);
});

test("(e) race: a pending ordinary confirmation (A), account switch to B, then a write → the write confirms anew and is not sent as A", async () => {
  const signal = new AbortController().signal;
  const gate = deferred<void>();
  meHandler = async () => { await gate.promise; return me("a"); };
  const ordinary = readContactMessageActor();
  await flush();
  assert.equal(meCalls(), 1);
  account = "b";
  meHandler = null;
  const write = sendWindowMessage("a", { conversationId: "c", body: "hi", id: "r2", version: "v" }, signal);
  await assert.rejects(write, (error: unknown) => error instanceof BoundedMessageReadError && error.status === 403);
  assert.equal(meCalls(), 2, "the write barrier issued its own request");
  assert.equal(calls.filter(c => c.method === "POST").length, 0, "no write request went out as A");
  gate.resolve();
  assert.equal(await ordinary, "a", "the older ordinary caller still gets its own answer");
  assert.equal(await readContactMessageActor(), "b", "the late A answer was not remembered");
});

test("(e) two write confirmations of the same batch share one request; a later one does not join it", async () => {
  const gate = deferred<void>();
  meHandler = async () => { await gate.promise; return me("a"); };
  const one = readContactMessageActorForWrite();
  const two = readContactMessageActorForWrite();
  await flush();
  assert.equal(meCalls(), 1);
  const later = readContactMessageActorForWrite();
  await flush();
  assert.equal(meCalls(), 2, "a write confirmation started after dispatch gets its own request");
  gate.resolve();
  assert.deepEqual(await Promise.all([one, two, later]), ["a", "a", "a"]);
  // A pending ordinary confirmation is not joined by a write either.
  const gate2 = deferred<void>();
  meHandler = async () => { await gate2.promise; return me("a"); };
  invalidateInboxActorConfirmation();
  const ordinary = readContactMessageActor();
  await flush();
  const before = meCalls();
  const barrier = readContactMessageActorForWrite();
  await flush();
  assert.equal(meCalls(), before + 1);
  gate2.resolve();
  await Promise.all([ordinary, barrier]);
});

test("(f①) a request completing after every consumer cancelled is not remembered", async () => {
  const gate = deferred<void>();
  meHandler = async () => { await gate.promise; return me("a"); };
  const controller = new AbortController();
  const only = readContactMessageActor(controller.signal);
  await flush();
  controller.abort();
  await assert.rejects(only, (error: Error) => error.name === "AbortError");
  gate.resolve();
  await flush();
  meHandler = null;
  const before = meCalls();
  assert.equal(await readContactMessageActor(), "a");
  assert.equal(meCalls(), before + 1, "the abandoned answer was not reused");
});

test("(f②) after invalidation, an older A request finishing after the newer B request cannot overwrite B", async () => {
  const gateA = deferred<void>();
  meHandler = async () => { await gateA.promise; return me("a"); };
  const oldRead = readContactMessageActor();
  await flush();
  invalidateInboxActorConfirmation();
  meHandler = async () => me("b");
  assert.equal(await readContactMessageActor(), "b");
  gateA.resolve();
  assert.equal(await oldRead, "a");
  const before = meCalls();
  assert.equal(await readContactMessageActor(), "b");
  assert.equal(meCalls(), before, "B stays reusable");
});

test("(f) a new caller does not join a request started before an invalidation", async () => {
  const gate = deferred<void>();
  meHandler = async () => { await gate.promise; return me("a"); };
  const oldRead = readContactMessageActor();
  await flush();
  invalidateInboxActorConfirmation();
  const fresh = readContactMessageActor();
  await flush();
  assert.equal(meCalls(), 2);
  gate.resolve();
  await Promise.all([oldRead, fresh]);
});

// Codex review P2 (W0031): a write confirmation must not be reused as the post-write confirmation.
test("(e) after a write, the next confirmation asks /api/account/me again and sees an account switch", async () => {
  assert.equal(await readContactMessageActor(), "a", "a reusable read from before the write");
  assert.equal(await readContactMessageActorForWrite(), "a", "pre-write barrier");
  account = "b"; // the session switches between the barrier and the write
  const before = meCalls();
  assert.equal(await readContactMessageActor(), "b", "the post-write confirmation is fresh");
  assert.equal(meCalls(), before + 1);
});

test("(e) a read receipt accepted after an account switch is reported as an identity change", async () => {
  const signal = new AbortController().signal;
  const previous = globalThis.fetch;
  // The switch happens while the read receipt is in flight; the receipt itself carries no actor.
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    if (String(url).endsWith("/read")) account = "b";
    return previous(url, options);
  }) as typeof fetch;
  await assert.rejects(confirmMessageWindowRead("a", "c", "m", signal), (error: unknown) => error instanceof BoundedMessageReadError && error.status === 403);
  assert.equal(calls.filter(c => c.path === "/api/account/me").length, 2, "one barrier before and one fresh confirmation after the write");
});
