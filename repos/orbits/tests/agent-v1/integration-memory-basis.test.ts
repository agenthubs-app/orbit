/**
 * Release-2 gate on 700aa1a49 (AE-ANS-009, AE-SCL-017; coordinator, 2026-11-20): where AG14's saved memory meets the
 * ranking (rankPart). A saved entry is a basis only for a request to recommend or pick that gives no standard of its own:
 * a plain listing is never turned into a ranking by memory (nor does a saved time rule hide records from it); an order, a
 * filter or a topic in the sentence is the standard and nothing saved is added to it; a goal is no ranking topic for
 * to-dos. A count or a period alone is no standard (AE-SCL-027/028, AE-FN-002: 「挑三场」 with saved entries ranks by them).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runFn, type TestMemory } from "./functions-kit";

const MM1: TestMemory = { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末上午", id: "MM1", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } };
const MM2: TestMemory = { appliesTo: ["event.recommend"], category: "constraint", content: "不要推荐晚上的活动", id: "MM2" };
const TOPICS: TestMemory = { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先摄影主题", id: "MM4", structured: { strength: "prefer", topics: ["摄影"] } };
const GOAL: TestMemory = { appliesTo: ["todo.plan"], category: "goal", content: "年底前把包材成本降一成", id: "RMM10" };
const POST_OFFICE: TestMemory = { appliesTo: ["todo.plan"], category: "preference", content: "安排待办时把要跑邮局的事排在上午", id: "RMM07" };
const EVENT_MEMORY = [MM1, MM2, TOPICS];

const of = (events: Record<string, unknown>[], type: string) => events.filter((event) => event.type === type);
const listed = (events: Record<string, unknown>[]) => (of(events, "fn.rank").at(-1)?.listed ?? []) as string[];
const recalled = (events: Record<string, unknown>[]) => [...new Set(of(events, "memory.recall").filter((event) => event.scope !== "every_task").flatMap((event) => (event.memories ?? []) as string[]))].sort();

test("AE-ANS-009 「接下来有哪些活动？」 with saved event entries: the plain list of what is coming up, exactly as with nothing saved", async () => {
  const message = "接下来有哪些活动？";
  // As the first layer tagged it in the gate: a list, an event read, no ranking.
  const understood = [{ dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["event.read"], sourceQuote: message }];
  const bare = await runFn(message, understood, { memories: [] });
  const run = await runFn(message, understood, { memories: EVENT_MEMORY });
  assert.ok(listed(bare.events).length >= 5, listed(bare.events).join(", "));
  assert.deepEqual(listed(run.events), listed(bare.events), "the same events in the same (time) order: no ranking by the saved topics, no evening event hidden");
  assert.ok(listed(run.events).includes("event:event:e104"), "the Saturday 19:00 event stays: a saved 「不要晚上的」 does not hide records from a plain list");
  assert.equal(run.judgeCalls.length, 0, "no judgment call");
  assert.deepEqual(recalled(run.events), [], "no saved entry is used");
  assert.doesNotMatch(run.result.text, /你存过的|按你存|让我记住/u);
  assert.deepEqual(run.result.memoryUse, []);
  assert.ok(of(run.events, "functions.memory_not_a_basis").length === 1);
});

test("AE-SCL-017 the user's own standard for formal follow-ups: no saved goal becomes the topic, the overdue one is listed", async () => {
  const message = "列出已经过期、或者 11 月 22 日之前到期的正式跟进，过期最久的排前面，只要前三条。";
  // As the first layer tagged it in the gate (its output, word for word).
  const understood = [{ constraints: ["已经过期、或者 11 月 22 日之前到期", "只要前三条"], dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: "正式跟进", count: 3, direction: "asc", orderBy: "dueAt" }, readFilter: { status: "open", to: "2026-11-22" }, requiredCapabilities: ["todo.read", "fn.rank"], sourceQuote: message }];
  const run = await runFn(message, understood, { memories: [GOAL, POST_OFFICE] });
  assert.deepEqual(listed(run.events), ["todo:task:f1"], run.result.text);
  assert.equal(run.judgeCalls.length, 0, "no judgment call: nothing to match against");
  assert.deepEqual(recalled(run.events), []);
  assert.doesNotMatch(run.result.text, /包材|没有符合|按你存/u, run.result.text);
});

// A 「这次看周四晚上的」 re-ranking of the last recommendation still weighs them: memory-turn.test.ts "AG14-3 「这次看周四晚上的」".
test("a pick with only a count still ranks by the saved entries (AE-SCL-028 shape)", async () => {
  const message = "下周（11 月 16 日到 22 日）有什么值得去的活动？挑三场。";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", readFilter: { from: "2026-11-16", to: "2026-11-22" }, rank: { count: 3 }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: message }], { memories: [MM1, MM2] });
  assert.deepEqual(recalled(run.events), ["MM1", "MM2"]);
  assert.ok(!listed(run.events).includes("event:event:e104"), "the saved rule removes the evening event from a pick");
  assert.equal(of(run.events, "functions.memory_not_a_basis").length, 0);
});

test("a goal is no ranking topic for to-dos even in a pick with no standard; a preference about to-dos still is one", async () => {
  const message = "先做哪三条待办？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { count: 3 }, requiredCapabilities: ["todo.read", "fn.rank"], sourceQuote: message }], { memories: [GOAL, POST_OFFICE] });
  assert.deepEqual(recalled(run.events), ["RMM07"], "the goal is left out; the to-do preference is weighed");
  assert.doesNotMatch(run.result.text, /包材/u);
});
