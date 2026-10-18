import assert from "node:assert/strict";
import test, { before } from "node:test";

// AsyncStorage's web build reads window.localStorage; give it an in-memory one before the queue module loads.
const memory = new Map<string, string>();
(globalThis as { window?: unknown }).window ??= { localStorage: {
  getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); },
  removeItem: (key: string) => { memory.delete(key); }, clear: () => memory.clear(), key: (index: number) => [...memory.keys()][index] ?? null,
  get length() { return memory.size; },
} };
type Queue = typeof import("../src/screens/network/contact-delete-queue");
let cancelQueuedContactDelete: Queue["cancelQueuedContactDelete"], flushContactDeleteQueue: Queue["flushContactDeleteQueue"];
let queueContactDelete: Queue["queueContactDelete"], readContactDeleteQueue: Queue["readContactDeleteQueue"];
before(async () => ({ cancelQueuedContactDelete, flushContactDeleteQueue, queueContactDelete, readContactDeleteQueue } = await import("../src/screens/network/contact-delete-queue")));

// R11a REVIEW M1：补发与撤回串行；发送途中撤回要等结果；认证失败留在队里。
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };

test("undo during a send waits for the result: delivered → not queued any more (the caller restores)", async () => {
  const actor = "actor-race";
  await queueContactDelete(actor, "c1", "2026-10-18T00:00:00.000Z");
  const reply = deferred<{ success: true; status: number }>();
  const sent: string[] = [];
  const flushing = flushContactDeleteQueue(actor, { delete: async (path: string) => { sent.push(path); return reply.promise; } } as never);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(sent, ["/api/contacts/c1"], "the send is in flight");
  let undone: boolean | null = null;
  const undo = cancelQueuedContactDelete(actor, "c1").then((value) => { undone = value; });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(undone, null, "the undo waits for the send");
  reply.resolve({ success: true, status: 200 });
  assert.deepEqual((await flushing).sent, ["c1"]);
  await undo;
  assert.equal(undone, false, "it reached the server, so the caller has to POST …/restore");
  assert.deepEqual(await readContactDeleteQueue(actor), []);
});

test("undo during a failed send: still queued → dropped locally, nothing to restore", async () => {
  const actor = "actor-fail";
  await queueContactDelete(actor, "c2", "2026-10-18T00:00:00.000Z");
  const reply = deferred<{ success: false; status: number }>();
  const flushing = flushContactDeleteQueue(actor, { delete: async () => reply.promise } as never);
  const undo = cancelQueuedContactDelete(actor, "c2");
  reply.resolve({ success: false, status: 0 });
  assert.deepEqual((await flushing).kept, ["c2"]);
  assert.equal(await undo, true);
  assert.deepEqual(await readContactDeleteQueue(actor), []);
});

test("an auth refusal (401 / 403) keeps the delete and reports it; another refusal is dropped", async () => {
  const actor = "actor-auth";
  await queueContactDelete(actor, "c3", "2026-10-18T00:00:00.000Z");
  await queueContactDelete(actor, "c4", "2026-10-18T00:00:01.000Z");
  const result = await flushContactDeleteQueue(actor, { delete: async (path: string) => ({ success: false, status: path.endsWith("c3") ? 401 : 422 }) } as never);
  assert.deepEqual(result.authFailed, ["c3"]);
  assert.deepEqual(result.dropped, ["c4"]);
  assert.deepEqual((await readContactDeleteQueue(actor)).map((item) => item.contactId), ["c3"]);
});

test("a delete queued while a flush is sending is not lost", async () => {
  const actor = "actor-queue";
  await queueContactDelete(actor, "c5", "2026-10-18T00:00:00.000Z");
  const reply = deferred<{ success: true; status: number }>();
  const flushing = flushContactDeleteQueue(actor, { delete: async () => reply.promise } as never);
  const queued = queueContactDelete(actor, "c6", "2026-10-18T00:00:02.000Z");
  reply.resolve({ success: true, status: 200 });
  await flushing; await queued;
  assert.deepEqual((await readContactDeleteQueue(actor)).map((item) => item.contactId), ["c6"]);
});
