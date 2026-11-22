/**
 * agent-design AG14-5 (设计稿 §6 "账号一致性要先验收"): the memory settings API works on the scope of the canonical
 * account — the one the conversation uses — not on the Auth.js user id of the session; another account reads,
 * changes and deletes nothing of it; the new fields go in and out; a stale revision is a conflict.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthenticatedApiActorIdentity } from "../../app/api/_shared/authenticated-actor";
import { resolveAgentMemoryRequest } from "../../app/api/agent/memory/request";
import { createAgentMemoryRouteHandlers } from "../../app/api/agent/memory/route-handlers";
import type { AgentMemory, AgentMemoryRecordPayload } from "../../features/agent/memory/contract";
import { agentMemoryCreateInputSchema, agentMemoryEntrySchema, agentMemoryListSchema, agentMemorySettingsInputSchema, agentMemoryUpdateInputSchema } from "../../shared/api-schema/agent-v1";
import type { AgentMemoryEntryContract } from "../../shared/contract/agent-v1";
import { recallFor } from "../../features/agent/memory/recall";
import { agentMemoryScopeId, createStorageAgentMemoryService } from "../../features/agent/memory/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE = "workspace:test";
/** The stored identity: each person signs in with a profile id; the account is another id. */
const GRAPH = {
  accounts: [{ id: "account:alice" }, { id: "account:bob" }],
  profiles: [{ accountId: "account:alice", displayName: "Alice", id: "user:alice" }, { accountId: "account:bob", displayName: "Alice", id: "user:bob" }],
} as never;

function world() {
  const store = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
  let tick = Date.parse("2026-11-15T01:00:00.000Z");
  let next = 0;
  const serviceFor = (scope: { actorId: string; workspaceId: string }) => createStorageAgentMemoryService({ actorId: scope.actorId, id: () => `memory-${(next += 1)}`, now: () => new Date((tick += 1000)).toISOString(), store, workspaceId: scope.workspaceId });
  /** The settings API as the signed-in user `sessionUserId` reaches it (the real identity rule over the stored graph). */
  const signedIn = (sessionUserId: string | null) => createAgentMemoryRouteHandlers({
    resolve: () => resolveAgentMemoryRequest({
      resolveActor: async () => (sessionUserId ? resolveAuthenticatedApiActorIdentity({ graph: GRAPH, mode: "live", session: { email: "same@example.com", name: "Alice", userId: sessionUserId }, workspaceId: WORKSPACE }) : null),
      serviceFor,
    }),
  });
  return { serviceFor, signedIn, store };
}

const json = (method: string, body?: unknown, url = "http://localhost/api/agent/memory") => new Request(url, { ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}), method });

test("the settings API and the conversation are the same person: an entry typed on the settings page is what the conversation recalls", async () => {
  const { serviceFor, signedIn, store } = world();
  const alice = signedIn("user:alice");
  const created = await alice.create(json("POST", { appliesTo: ["all"], category: "constraint", content: "回答用日语" }));
  assert.equal(created.status, 201);
  const { memory } = (await created.json()).data;
  assert.equal(memory.revision, 1);
  assert.equal(memory.source, "manual");
  assert.equal(memory.sourceMessageRef, null);
  // The conversation resolves the same identity to the canonical account and recalls from that scope.
  const conversation = serviceFor({ actorId: "account:alice", workspaceId: WORKSPACE });
  const recall = await recallFor({ accountId: "account:alice", now: "2026-11-15T01:30:00.000Z", service: conversation, task: null });
  assert.deepEqual(recall.rules.map((rule) => rule.content), ["回答用日语"]);
  // An entry the conversation's card saved shows on the settings page.
  await conversation.create({ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", source: "conversation", sourceMessageRef: "request:r1" });
  const listed = (await (await alice.list()).json()).data;
  assert.deepEqual(listed.memories.map((item: { content: string }) => item.content).sort(), ["回答用日语", "推荐活动时优先周末上午"]);
  assert.equal(listed.memoryVersion, 2);
  assert.deepEqual({ allowConversationLearning: listed.settings.allowConversationLearning, enabled: listed.settings.enabled }, { allowConversationLearning: false, enabled: true });
  // Nothing is stored under the Auth.js user id of the session.
  assert.deepEqual(await store.listRecords({ collectionName: "agentMemories", limit: "unbounded", workspaceId: agentMemoryScopeId(WORKSPACE, "user:alice") }), []);
});

test("another account — same name, same e-mail address — lists nothing, changes nothing, deletes nothing", async () => {
  const { serviceFor, signedIn } = world();
  const alice = signedIn("user:alice");
  const bob = signedIn("user:bob");
  const { memory } = (await (await alice.create(json("POST", { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午" }))).json()).data;
  const listed = (await (await bob.list()).json()).data;
  assert.deepEqual(listed.memories, []);
  assert.equal(listed.memoryVersion, 0);
  const patched = await bob.update(json("PATCH", { content: "推荐活动时优先工作日晚上" }), memory.memoryId);
  assert.equal(patched.status, 404);
  const removed = await bob.remove(json("DELETE"), memory.memoryId);
  assert.equal(removed.status, 404);
  // Bob switching his own switches does not touch Alice's.
  assert.equal((await bob.updateSettings(json("PATCH", { enabled: false }))).status, 200);
  const mine = (await (await alice.list()).json()).data;
  assert.equal(mine.memories[0].content, "推荐活动时优先周末上午");
  assert.equal(mine.memories[0].revision, 1);
  assert.equal(mine.settings.enabled, true);
  assert.deepEqual((await serviceFor({ actorId: "account:bob", workspaceId: WORKSPACE }).deletionMarks()), []);
});

test("what the API sends and takes is the shared contract both clients parse", async () => {
  const { serviceFor, signedIn } = world();
  const alice = signedIn("user:alice");
  await alice.create(json("POST", agentMemoryCreateInputSchema.parse({ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" }, validUntil: "2027-01-31" })));
  // An entry stored before AG14 (no revision, tasks or values) is sent in the same shape.
  await serviceFor({ actorId: "account:alice", workspaceId: WORKSPACE }).create({ category: "goal", content: "明年春天前找到两家新的窑" });
  const listed = agentMemoryListSchema.parse((await (await alice.list()).json()).data);
  assert.equal(listed.memories.length, 2);
  const [first] = listed.memories.filter((item) => item.category === "preference");
  assert.deepEqual([first.revision, first.status, first.appliesTo, first.structured, first.validUntil, first.validFrom], [1, "active", ["event.recommend"], { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" }, "2027-01-31", null]);
  const changed = await alice.update(json("PATCH", agentMemoryUpdateInputSchema.parse({ expectedRevision: 1, validUntil: null })), first.memoryId);
  assert.equal(agentMemoryEntrySchema.parse((await changed.json()).data.memory).validUntil, null);
  assert.equal(agentMemorySettingsInputSchema.safeParse({ enabled: "no" }).success, false);
  assert.equal(agentMemoryCreateInputSchema.safeParse({ appliesTo: ["everything"], category: "preference", content: "x" }).success, false);
  // The stored entry is assignable to the contract (the two are kept in step by the compiler).
  const entry: AgentMemoryEntryContract = (await serviceFor({ actorId: "account:alice", workspaceId: WORKSPACE }).list())[0] satisfies AgentMemory;
  assert.ok(entry.memoryId);
});

test("not signed in, or an identity that resolves to no account: 401 and nothing is read", async () => {
  const { signedIn } = world();
  for (const handlers of [signedIn(null), signedIn("user:unknown")]) {
    assert.equal((await handlers.list()).status, 401);
    assert.equal((await handlers.create(json("POST", { category: "preference", content: "x" }))).status, 401);
    assert.equal((await handlers.update(json("PATCH", { content: "y" }), "m")).status, 401);
    assert.equal((await handlers.remove(json("DELETE"), "m")).status, 401);
    assert.equal((await handlers.updateSettings(json("PATCH", { enabled: false }))).status, 401);
  }
});

test("the page changes an entry at the revision it showed: tasks, an end day and the two switches; a stale revision is a conflict", async () => {
  const { signedIn } = world();
  const alice = signedIn("user:alice");
  const { memory } = (await (await alice.create(json("POST", { category: "preference", content: "推荐活动时优先平日晚上" }))).json()).data;
  assert.deepEqual(memory.appliesTo, []);
  const changed = await alice.update(json("PATCH", { appliesTo: ["event.recommend"], expectedRevision: 1, validUntil: "2026-12-31" }), memory.memoryId);
  assert.equal(changed.status, 200);
  const after = (await changed.json()).data.memory;
  assert.deepEqual([after.revision, after.appliesTo, after.validUntil], [2, ["event.recommend"], "2026-12-31"]);
  const stale = await alice.update(json("PATCH", { content: "推荐活动时优先周末", expectedRevision: 1 }), memory.memoryId);
  assert.equal(stale.status, 409);
  assert.deepEqual((await stale.json()).error.context, { currentRevision: 2, reason: "MEMORY_REVISION_CONFLICT" });
  assert.equal((await alice.remove(json("DELETE", undefined, "http://localhost/api/agent/memory/x?expectedRevision=1"), memory.memoryId)).status, 409);
  // Invalid input is refused before anything is written.
  assert.equal((await alice.update(json("PATCH", { appliesTo: ["everything"] }), memory.memoryId)).status, 400);
  assert.equal((await alice.update(json("PATCH", { validUntil: "next week" }), memory.memoryId)).status, 400);
  assert.equal((await alice.create(json("POST", { category: "habit", content: "x" }))).status, 400);
  assert.equal((await alice.updateSettings(json("PATCH", { enabled: "no" }))).status, 400);
  const settings = (await (await alice.updateSettings(json("PATCH", { allowConversationLearning: true, enabled: false }))).json()).data.settings;
  assert.deepEqual([settings.enabled, settings.allowConversationLearning], [false, true]);
  // Deleting at the shown revision forgets the entry; the list no longer has it and the version moved on.
  assert.equal((await alice.remove(json("DELETE", undefined, "http://localhost/api/agent/memory/x?expectedRevision=2"), memory.memoryId)).status, 204);
  const listed = (await (await alice.list()).json()).data;
  assert.deepEqual(listed.memories, []);
  assert.equal(listed.memoryVersion, 3);
});
