/**
 * agent-design AG14-5 (设计稿 §6): the read-only inventory of old memory partitions and the move of the proven ones.
 * Only an id that resolves to exactly one existing account through the stored profile is moved; an id that could be
 * two owners, or none, stays where it is; a same name or a same e-mail address never merges two people.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type { AgentMemoryRecordPayload } from "../../features/agent/memory/contract";
import { MOVE_LIMIT, classifyMemoryPartition, inventoryMemoryOwnership, moveMemoryPartition, redactedId, type IdentityRows } from "../../features/agent/memory/ownership-inventory";
import { AGENT_MEMORY_COLLECTION, agentMemoryScopeId, createStorageAgentMemoryService } from "../../features/agent/memory/service";

const IDENTITY: IdentityRows = {
  accountIds: ["account:alice", "account:bob", "account:carol", "shared-id"],
  profiles: [
    { accountId: "account:alice", id: "profile:alice" },
    { accountId: "account:bob", id: "profile:bob" },
    // A profile whose account was removed.
    { accountId: "account:gone", id: "profile:orphan" },
    // An id that is an account and, as a profile, belongs to another account.
    { accountId: "account:carol", id: "shared-id" },
    // Two stored profile rows with one id pointing at two accounts.
    { accountId: "account:alice", id: "profile:twice" },
    { accountId: "account:bob", id: "profile:twice" },
  ],
};

test("an account id is canonical; a profile of one existing account is movable; everything else stays to be checked", () => {
  assert.deepEqual(classifyMemoryPartition("account:alice", IDENTITY), { accountId: "account:alice", kind: "canonical" });
  assert.deepEqual(classifyMemoryPartition("profile:alice", IDENTITY), { accountId: "account:alice", kind: "movable" });
  assert.deepEqual(classifyMemoryPartition("authjs-user-9", IDENTITY), { kind: "unresolved", reason: "unknown_id" });
  assert.deepEqual(classifyMemoryPartition("profile:orphan", IDENTITY), { kind: "unresolved", reason: "account_missing" });
  assert.deepEqual(classifyMemoryPartition("shared-id", IDENTITY), { kind: "ambiguous", reason: "account_and_other_profile" });
  assert.deepEqual(classifyMemoryPartition("profile:twice", IDENTITY), { kind: "ambiguous", reason: "several_accounts" });
});

test("the inventory counts what can be moved and what is left to check, and its report shows no id", () => {
  const report = inventoryMemoryOwnership([
    { entries: 3, hasSettings: true, partitionId: "account:alice" },
    { entries: 2, hasSettings: false, partitionId: "profile:alice" },
    { entries: 4, hasSettings: true, partitionId: "authjs-user-9" },
    { entries: 1, hasSettings: false, partitionId: "shared-id" },
  ], IDENTITY);
  assert.deepEqual(report.totals, { canonical: 1, entries: 10, movable: 1, movableEntries: 2, partitions: 4, toCheck: 2, toCheckEntries: 5 });
  assert.equal(redactedId("profile:alice").startsWith("profile:#"), true);
  assert.equal(redactedId("profile:alice").includes("alice"), false);
  assert.notEqual(redactedId("profile:alice"), redactedId("profile:bob"));
});

async function seeded() {
  const store = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
  let next = 0;
  let tick = Date.parse("2026-07-01T00:00:00.000Z");
  const of = (id: string) => createStorageAgentMemoryService({ actorId: id, id: () => `m-${(next += 1)}`, now: () => new Date((tick += 1000)).toISOString(), store, workspaceId: "workspace:one" });
  return { of, store };
}

test("a movable partition's entries end up under the account, owned by it, and nothing is left in use in the old place", async () => {
  const { of, store } = await seeded();
  const old = of("profile:alice");
  await old.create({ category: "preference", content: "Keep replies short." });
  await old.create({ category: "goal", content: "Find two new kilns." });
  await old.updateSettings({ allowConversationLearning: true });
  const result = await moveMemoryPartition({ now: "2026-11-19T00:00:00.000Z", partitionId: "profile:alice", store, verdict: classifyMemoryPartition("profile:alice", IDENTITY), workspaceId: "workspace:one" });
  assert.deepEqual({ ...result }, { from: "profile:alice", keptForCheck: [], moved: 2, settingsMoved: true, toAccountId: "account:alice" });
  const alice = of("account:alice");
  assert.deepEqual((await alice.list()).map((item) => item.content).sort(), ["Find two new kilns.", "Keep replies short."]);
  assert.equal((await alice.getSettings()).allowConversationLearning, true);
  assert.deepEqual(await old.list(), []);
  const rows = await store.listRecords({ collectionName: AGENT_MEMORY_COLLECTION, limit: "unbounded", workspaceId: agentMemoryScopeId("workspace:one", "account:alice") });
  assert.deepEqual(rows.filter((row) => row.payload.kind === "memory").map((row) => row.userId), ["account:alice", "account:alice"]);
});

test("the account's own entries and switches are never overwritten: a same id stays in the old place and is reported", async () => {
  const { of, store } = await seeded();
  const alice = of("account:alice");
  await alice.create({ category: "constraint", content: "回答用日语", memoryId: "same-id" });
  await alice.updateSettings({ enabled: false });
  const old = of("profile:alice");
  await old.create({ category: "constraint", content: "Reply in English.", memoryId: "same-id" });
  await old.create({ category: "goal", content: "Find two new kilns.", memoryId: "other-id" });
  await old.updateSettings({ enabled: true });
  const result = await moveMemoryPartition({ now: "2026-11-19T00:00:00.000Z", partitionId: "profile:alice", store, verdict: classifyMemoryPartition("profile:alice", IDENTITY), workspaceId: "workspace:one" });
  assert.deepEqual(result.keptForCheck, ["same-id"]);
  assert.equal(result.moved, 1);
  assert.equal(result.settingsMoved, false);
  assert.equal((await alice.get("same-id"))?.content, "回答用日语");
  assert.equal((await alice.getSettings()).enabled, false);
  assert.equal((await old.get("same-id"))?.content, "Reply in English.");
});

test("a partition that is not proven is refused; two people with the same name and e-mail are not merged", async () => {
  const { of, store } = await seeded();
  const unknown = of("authjs-user-9");
  await unknown.create({ category: "preference", content: "Keep replies short." });
  for (const partitionId of ["authjs-user-9", "shared-id", "profile:twice", "profile:orphan", "account:alice"]) {
    await assert.rejects(moveMemoryPartition({ now: "2026-11-19T00:00:00.000Z", partitionId, store, verdict: classifyMemoryPartition(partitionId, IDENTITY), workspaceId: "workspace:one" }), /Only a partition whose owner is proven/u);
  }
  assert.equal((await unknown.list()).length, 1);
  // The identity rows carry ids only: a name or an address is not an input, so nothing can match on one.
  const sameLooking: IdentityRows & { names?: unknown } = { ...IDENTITY, names: { "account:bob": "Alice", "authjs-user-9": "Alice <alice@example.com>" } } as never;
  assert.deepEqual(classifyMemoryPartition("authjs-user-9", sameLooking), { kind: "unresolved", reason: "unknown_id" });
  assert.deepEqual(await of("account:alice").list(), []);
  assert.deepEqual(await of("account:bob").list(), []);
});

test("a partition at the read limit is not moved in part: it stays whole where it is", async () => {
  const { of, store } = await seeded();
  const old = of("profile:alice");
  const first = await old.create({ category: "preference", content: "Keep replies short." });
  const [record] = await store.listRecords({ collectionName: AGENT_MEMORY_COLLECTION, limit: 1, workspaceId: agentMemoryScopeId("workspace:one", "profile:alice") });
  let asked: unknown = null;
  const full = { ...store, listRecords: async (query: Parameters<typeof store.listRecords>[0]) => { asked = query.limit; return Array.from({ length: MOVE_LIMIT }, () => record); } };
  await assert.rejects(moveMemoryPartition({ now: "2026-11-19T00:00:00.000Z", partitionId: "profile:alice", store: full, verdict: classifyMemoryPartition("profile:alice", IDENTITY), workspaceId: "workspace:one" }), /left where it is/u);
  assert.equal(asked, MOVE_LIMIT);
  assert.equal((await old.get(first.memoryId))?.content, "Keep replies short.");
  assert.deepEqual(await of("account:alice").list(), []);
});
