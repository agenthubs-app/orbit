import assert from "node:assert/strict";
import test from "node:test";

import { readRecentInteraction } from "../../features/agent-v1/views/recent-interaction";
import { readContextView } from "../../features/agent-v1/views/context";
import { A, memo, readKit, schedule, scopeOf, smallWorld, WORKSPACE } from "./read-kit";

/**
 * agent-design AG05-1 (设计稿 §4 读取视图, PLANNER 易错边界 7): "the last interaction" counts only what
 * structurally shows the person took part — a memo whose interaction lists them, a logged encounter, a
 * schedule meeting with them that has started. Newest first by when it happened; on the same day with
 * the same precision a stable id decides and the order is not claimed. A projection of an encounter is
 * not counted twice. Old notes without an interaction come back as old material, never as an interaction.
 */

const NOW = "2026-11-15T01:00:00.000Z";

function worldWithInteractions() {
  const world = smallWorld();
  world.records.push(
    memo(A, "note:m41", "早上和小林在车站碰到，约了下周对报价。", "2026-11-15T00:00:00.000Z", ["contact:c17"], { interaction: { actualContactIds: ["contact:c17"], channel: "meeting", direction: "mutual", occurredOn: "2026-11-15", precision: "day" } }),
    memo(A, "note:m40b", "同一天另一条往来。", "2026-11-15T00:30:00.000Z", ["contact:c17"], { interaction: { actualContactIds: ["contact:c17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-15", precision: "day" } }),
    // Mentions 小林 but records a call with 小陈 only: not an interaction with 小林.
    memo(A, "note:m50", "和小陈通话，提到小林。", "2026-11-14T00:00:00.000Z", ["contact:c17", "contact:c21"], { interaction: { actualContactIds: ["contact:c21"], channel: "phone", direction: "outgoing", occurredOn: "2026-11-14", precision: "day" } }),
    // The projection of encounter enc1 as a note: the encounter counts, the projection does not.
    memo(A, "note:enc1", "活动上见到小林。", "2026-11-08T10:00:00.000Z", ["contact:c17"], { interaction: { actualContactIds: ["contact:c17"], channel: "meeting", direction: "mutual", occurredAt: "2026-11-08T10:00:00.000Z", precision: "instant" } }),
    { collection: "human_encounters", id: "enc1", payload: { actorId: A, contactId: "contact:c17", observedAt: "2026-11-08T10:00:00.000Z" }, userId: A, workspaceId: WORKSPACE },
    schedule(A, "personal:past", "和小林午饭", "2026-11-13T03:00:00.000Z", { contactIds: ["contact:c17"] }),
    schedule(A, "personal:future", "和小林开会", "2026-11-20T03:00:00.000Z", { contactIds: ["contact:c17"] }),
  );
  return world;
}

test("only real interactions, newest first; same day and precision by a stable id, order not claimed", async () => {
  const { registry, source } = readKit(worldWithInteractions());
  const view = await readRecentInteraction({ reader: registry, source }, scopeOf(A), { contactId: "contact:c17", now: NOW, timeZone: "Asia/Tokyo" });
  assert.deepEqual(view.interactions.map((item) => [item.ref, item.occurredOn, item.source]), [
    ["memo:note:m40b", "2026-11-15", "memo"],
    ["memo:note:m41", "2026-11-15", "memo"],
    ["schedule:personal:past", "2026-11-13", "schedule"],
    ["encounter:enc1", "2026-11-08", "encounter"],
  ]);
  assert.equal(view.latest?.occurredOn, "2026-11-15");
  assert.deepEqual(view.sameDay, [["memo:note:m40b", "memo:note:m41"]], "two on the latest day: which came first is not known");
  assert.equal(view.interactions.some((item) => item.ref === "memo:note:m50"), false, "a memo that only mentions the person is not an interaction with them");
  assert.equal(view.interactions.some((item) => item.ref === "memo:note:enc1"), false, "the encounter's projection is not counted twice");
  assert.equal(view.interactions.some((item) => item.ref === "schedule:personal:future"), false, "a meeting that has not started is not an interaction");
  assert.deepEqual(view.legacy, [], "with real interactions, old notes are not needed");
});

test("without a structured interaction: the latest notes come back as old material, marked unconfirmed", async () => {
  const { registry, source } = readKit();
  const view = await readRecentInteraction({ reader: registry, source }, scopeOf(A), { contactId: "contact:c17", now: NOW, timeZone: "Asia/Tokyo" });
  assert.equal(view.latest, null);
  assert.deepEqual(view.interactions, []);
  assert.deepEqual(view.legacy.map((item) => item.ref), ["memo:note:m31", "memo:note:m32"]);
});

test("the view only reads: nothing is written", async () => {
  const { registry, source } = readKit(worldWithInteractions());
  const before = JSON.stringify(source.records);
  await readRecentInteraction({ reader: registry, source }, scopeOf(A), { contactId: "contact:c17", now: NOW, timeZone: "Asia/Tokyo" });
  assert.equal(JSON.stringify(source.records), before);
});

test("the context view: a person's notes by words and dates, newest first, with coverage", async () => {
  const { registry } = readKit();
  const view = await readContextView(registry, scopeOf(A), { contactId: "contact:c17", kinds: ["memo", "todo"], maxPages: 1 });
  assert.deepEqual(view.memo?.items.map((item) => item.ref), ["memo:note:m31", "memo:note:m32"]);
  assert.deepEqual(view.todo?.items.map((item) => item.ref), ["todo:task:t42"]);
  assert.deepEqual({ complete: view.memo?.complete, pagesRead: view.memo?.pagesRead, total: view.memo?.total }, { complete: true, pagesRead: 1, total: 2 });
  const november = await readContextView(registry, scopeOf(A), { contactId: "contact:c17", from: "2026-11-10T15:00:00.000Z", kinds: ["memo"], maxPages: 1 });
  assert.deepEqual(november.memo?.items.map((item) => item.ref), ["memo:note:m31"]);
});
