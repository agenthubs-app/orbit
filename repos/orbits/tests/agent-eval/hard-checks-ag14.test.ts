import assert from "node:assert/strict";
import { test } from "node:test";

import { CHECKS, NOT_YET, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";
import { blockLines, memoryUseLines } from "./lib/runner";

test("AG14 UI: the transcript shows the memory chips and the note's 「去设置 ›」 as the clients show them", () => {
  const fixture = (id: string | null | undefined) => (id === "mem-product-1" ? "MM1" : null);
  assert.deepEqual(memoryUseLines(undefined, fixture), []);
  assert.deepEqual(memoryUseLines([{ kind: "used", memoryId: "mem-product-1", text: "按你存的偏好「周末上午」挑的" }, { kind: "skipped", memoryId: "m2", text: "只这一次：没按你存的「周末上午」" }], fixture), [
    "- 回答开头记忆的小标签（两端显示在依据行后面；服务端代码写的）：「按你存的偏好「周末上午」挑的」带「修改 ›」，点了打开设置页里这一条（MM1）；「只这一次：没按你存的「周末上午」」（m2）",
  ]);
  const lines = blockLines([{ go: { label: "去设置", to: "memory_settings" }, items: [{ action: "打开「从对话里记住新的」再说一次。", text: "「推荐活动时优先周末上午」下次不会自动用。" }], title: "只用在这一次，没有存下来", type: "note" }], fixture);
  assert.equal(lines.at(-1), "    - 末尾的入口「去设置 ›」：点了打开设置页「iOrbit 记住的信息」");
});

/**
 * agent-design AG14 (eval README §3.2, §3.4; MEM.yaml): the memory words of the runner — `memory_state` with entries,
 * `memory_recalled` (the last turn), `settings_memory_list`, `target: new` on a card item, and saved memory read for
 * the turn's own account not counting as a read of business records (it stays in the cross-account check).
 */

const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };
const obs = (extra: Partial<Observation> = {}): Observation => ({
  account: "A", accounts: { A: "user_a", B: "user_b" }, answers: [], businessChanges: [], cards: [], caseId: "AE-MEM-T", clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events: [], fake: false,
  fixtureIdOf: (id) => ({ "memory:mm1": "MM1", "memory:mm2": "MM2" } as Record<string, string>)[String(id)] ?? null, idMap: { MM1: "memory:mm1", MM2: "memory:mm2" }, reads: [], requests: [], unsupported: [], ...extra,
});

const MM1 = { account: "A", appliesTo: ["event.recommend"], category: "preference", fixtureId: "MM1", id: "memory:mm1", revision: 1, status: "active" as const };
const MM2 = { account: "A", appliesTo: ["event.recommend"], category: "constraint", fixtureId: "MM2", id: "memory:mm2", revision: 1, status: "active" as const };
const NEW = { account: "A", appliesTo: ["event.recommend"], category: "preference", fixtureId: null, id: "memory:card:op1", revision: 1, status: "active" as const };

test("the three words are judged from AG14 on", () => {
  assert.equal(NOT_YET.memory_recalled, undefined);
  assert.equal(NOT_YET.settings_memory_list, undefined);
});

test("memory_state with entries: by fixture id, or by kind and task for an entry made in the case; status and revision as written", () => {
  const entries = [MM1, MM2];
  assert.equal(CHECKS.memory_state([{ id: "MM1", revision: 1, status: "active" }, { id: "MM2", revision: 1, status: "active" }], obs({ memoryEntries: entries }), context).status, "pass");
  // A revision that moved, a status that changed, an entry that is not there.
  assert.equal(CHECKS.memory_state([{ id: "MM1", revision: 2, status: "active" }, { id: "MM2", status: "active" }], obs({ memoryEntries: entries }), context).status, "fail");
  assert.equal(CHECKS.memory_state([{ id: "MM1", status: "deleted" }, { id: "MM2", status: "active" }], obs({ memoryEntries: entries }), context).status, "fail");
  assert.equal(CHECKS.memory_state([{ id: "MM1", status: "active" }, { id: "MM2", status: "active" }, { id: "MM3", status: "active" }], obs({ memoryEntries: entries }), context).status, "fail");
  // An entry in use that the case does not list is a failure (the list is the whole state of entries in use).
  const extra = CHECKS.memory_state([{ id: "MM1", status: "active" }], obs({ memoryEntries: entries }), context);
  assert.equal(extra.status, "fail");
  assert.match(extra.detail, /MM2/u);
  // An entry made in the case has no fixture id: matched by its fields.
  assert.equal(CHECKS.memory_state([{ appliesTo: ["event.recommend"], category: "preference", revision: 1, status: "active" }], obs({ memoryEntries: [NEW] }), context).status, "pass");
  assert.equal(CHECKS.memory_state([{ appliesTo: ["event.recommend"], category: "preference", status: "deleted" }], obs({ memoryEntries: [{ ...NEW, revision: 2, status: "deleted" }] }), context).status, "pass");
  assert.equal(CHECKS.memory_state([{ appliesTo: ["all"], category: "preference", status: "active" }], obs({ memoryEntries: [NEW] }), context).status, "fail");
  // A deleted entry the case does not list is not a failure; without the runner's reading the check cannot judge.
  assert.equal(CHECKS.memory_state([{ id: "MM1", status: "active" }], obs({ memoryEntries: [MM1, { ...MM2, revision: 2, status: "deleted" }] }), context).status, "pass");
  assert.equal(CHECKS.memory_state([{ id: "MM1", status: "active" }], obs(), context).status, "cannot_judge");
  // The empty form keeps its meaning: no entry in use for the case's account.
  assert.equal(CHECKS.memory_state([], obs({ memoryAfter: [], memoryEntries: [{ ...MM1, revision: 2, status: "deleted" }] }), context).status, "pass");
});

test("memory_recalled: exactly the entries the last turn used, by fixture id or by fields for a new one", () => {
  const recalled = [{ fixtureId: "MM1", id: "memory:mm1" }, { fixtureId: "MM2", id: "memory:mm2" }];
  assert.equal(CHECKS.memory_recalled(["MM1", "MM2"], obs({ memoryEntries: [MM1, MM2], memoryRecalled: recalled }), context).status, "pass");
  assert.equal(CHECKS.memory_recalled(["MM2", "MM1"], obs({ memoryEntries: [MM1, MM2], memoryRecalled: recalled }), context).status, "pass");
  assert.equal(CHECKS.memory_recalled(["MM1"], obs({ memoryEntries: [MM1, MM2], memoryRecalled: recalled }), context).status, "fail");
  assert.equal(CHECKS.memory_recalled(["MM1", "MM2", "MM3"], obs({ memoryEntries: [MM1, MM2], memoryRecalled: recalled }), context).status, "fail");
  assert.equal(CHECKS.memory_recalled([], obs({ memoryRecalled: [] }), context).status, "pass");
  assert.equal(CHECKS.memory_recalled([], obs({ memoryRecalled: recalled }), context).status, "fail");
  assert.equal(CHECKS.memory_recalled([{ appliesTo: ["event.recommend"], category: "preference" }], obs({ memoryEntries: [NEW], memoryRecalled: [{ fixtureId: null, id: NEW.id }] }), context).status, "pass");
  assert.equal(CHECKS.memory_recalled([{ appliesTo: ["all"], category: "constraint" }], obs({ memoryEntries: [NEW], memoryRecalled: [{ fixtureId: null, id: NEW.id }] }), context).status, "fail");
  assert.equal(CHECKS.memory_recalled([], obs(), context).status, "cannot_judge");
});

test("settings_memory_list: what the settings API returned for that account's own sign-in, exactly", () => {
  const lists = { A: { ids: ["MM1", "MM2"], status: 200 }, B: { ids: [], status: 200 } };
  assert.equal(CHECKS.settings_memory_list({ account: "A", entries: ["MM2", "MM1"] }, obs({ settingsMemory: lists }), context).status, "pass");
  assert.equal(CHECKS.settings_memory_list({ account: "B", entries: [] }, obs({ settingsMemory: lists }), context).status, "pass");
  assert.equal(CHECKS.settings_memory_list({ account: "B", entries: ["MM1"] }, obs({ settingsMemory: lists }), context).status, "fail");
  assert.equal(CHECKS.settings_memory_list({ account: "A", entries: ["MM1"] }, obs({ settingsMemory: lists }), context).status, "fail");
  assert.equal(CHECKS.settings_memory_list({ account: "A", entries: ["MM1", "MM2"] }, obs({ settingsMemory: { A: { ids: [], status: 401 } } }), context).status, "fail");
  assert.equal(CHECKS.settings_memory_list({ account: "A", entries: [] }, obs(), context).status, "cannot_judge");
});

test("saved memory read for the turn is not a read of business records, but another account's memory is a cross-account read", () => {
  const own = { account: "A", collection: "agentMemories", fixtureId: "MM1", owner: "user_a", productId: "memory:mm1", seq: 7 };
  const todo = { account: "A", collection: "tasks", fixtureId: "T42", owner: "user_a", productId: "task:t42", seq: 9 };
  assert.equal(CHECKS.no_private_reads(true, obs({ reads: [own] }), context).status, "pass");
  assert.equal(CHECKS.no_private_reads(true, obs({ reads: [own, todo] }), context).status, "fail");
  assert.equal(CHECKS.private_reads_within(["T42"], obs({ reads: [own, todo] }), context).status, "pass");
  assert.equal(CHECKS.no_cross_account(true, obs({ reads: [own] }), context).status, "pass");
  const leaked = CHECKS.no_cross_account(true, obs({ account: "B", reads: [own] }), context);
  assert.equal(leaked.status, "fail");
  assert.match(leaked.detail, /MM1/u);
});

test("card_ops: `target: new` is an entry made in this case (no fixture id); a fixture id is that record", () => {
  const card = (target: string | null) => ({ cardId: "c", frozenSeq: 3, kind: "ledger_action" as const, observedBy: [], ops: [{ op: "memory.delete", raw: {}, set: { status: "deleted" }, target }], revisions: 1, state: "completed" });
  assert.equal(CHECKS.card_ops([{ op: "memory.delete", target: "new" }], obs({ cards: [card("memory:card:op1")] }), context).status, "pass");
  assert.equal(CHECKS.card_ops([{ op: "memory.delete", target: "new" }], obs({ cards: [card("MM1")] }), context).status, "fail");
  assert.equal(CHECKS.card_ops([{ op: "memory.delete", target: "MM1" }], obs({ cards: [card("MM1")] }), context).status, "pass");
  assert.equal(CHECKS.card_ops([{ op: "memory.delete", target: "new" }], obs({ cards: [card(null)] }), context).status, "fail");
});

test("memory_state: an untouched fixture entry of an account the case never signed in to is world data, not unlisted", () => {
  const BMM1 = { ...MM1, account: "B", fixtureId: "BMM1", id: "memory:bmm1" };
  const onlyA = [{ account: "A", fromSeq: 0 }];
  assert.equal(CHECKS.memory_state([{ id: "MM1", status: "active" }], obs({ accountTimeline: onlyA, memoryEntries: [MM1, BMM1] }), context).status, "pass");
  // The case switched to B: B's entry counts again.
  assert.equal(CHECKS.memory_state([{ id: "MM1", status: "active" }], obs({ accountTimeline: [...onlyA, { account: "B", fromSeq: 9 }], memoryEntries: [MM1, BMM1] }), context).status, "fail");
  // B's entry changed, or an entry was made in B: it counts even though the case never signed in as B.
  assert.equal(CHECKS.memory_state([{ id: "MM1", status: "active" }], obs({ accountTimeline: onlyA, memoryEntries: [MM1, { ...BMM1, revision: 2 }] }), context).status, "fail");
  assert.equal(CHECKS.memory_state([{ id: "MM1", status: "active" }], obs({ accountTimeline: onlyA, memoryEntries: [MM1, { ...NEW, account: "B" }] }), context).status, "fail");
});
