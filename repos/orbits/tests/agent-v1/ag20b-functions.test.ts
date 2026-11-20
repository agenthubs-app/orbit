import assert from "node:assert/strict";
import test from "node:test";

import { ACTOR, fnWorld, memo, runFn } from "./functions-kit";
import { platformEvent } from "./read-kit";

/**
 * agent-design AG20b (TRIAGE.md R8, R9, R19): the ranking of events. This sprint's own data (fnWorld plus a note and two
 * events of its own), not the independent suite's.
 */

const EVENT_RANK = (quote: string, extra: Record<string, unknown> = {}) => ({ dataSources: ["orbit_records"], deliverable: "ranked_list", requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: quote, ...extra });
const ranked = (events: Record<string, unknown>[]) => events.filter((event) => event.type === "fn.rank");

function worldWithNotes() {
  const world = fnWorld();
  world.records.push(memo(ACTOR, "note:sketch1", "最近在看城市建筑和老街摄影的书，想多去看看相关的展。", "2026-10-02T03:00:00.000Z", [], { title: "看展札记" }));
  world.records.push(memo(ACTOR, "note:sketch2", "独立出版和书店的活动以后可以多留意。", "2026-09-12T03:00:00.000Z", [], { title: "看展札记" }));
  world.events.push(platformEvent("event:past1", "秋季摄影讲座", "2026-11-08T01:00:00.000Z", "银座", { description: "主题：摄影" }));
  return world;
}

test("R8 (verified, fixed by AG19): 'events worth going to' with no dates never lists one that is over", async () => {
  const message = "挑两场值得去的活动，按开始时间排。";
  const run = await runFn(message, [EVENT_RANK(message, { rank: { count: 2, orderBy: "startsAt" } })], { world: worldWithNotes() });
  const listed = ranked(run.events).at(-1)?.listed as string[];
  assert.ok(listed?.length, run.result.text);
  assert.ok(!listed.includes("event:event:past1"), `the event of 11-08 is over: ${listed.join(", ")}`);
  assert.ok(run.events.some((event) => event.type === "functions.upcoming_only"));
});

test("R9 a note named in words is the criterion for events: found by its words without the events' weekend window, then the events are ranked", async () => {
  const message = "按我的看展札记，挑这个周末值得去的两场活动。";
  const run = await runFn(message, [EVENT_RANK(message, {
    objectClues: [{ entity: "memo", text: "看展札记" }],
    rank: { basis: "按我的看展札记", count: 2 },
    readFilter: { from: "2026-11-21", to: "2026-11-22" },
    requiredCapabilities: ["memo.read", "event.read", "fn.rank"],
  })], { world: worldWithNotes() });
  const rank = ranked(run.events).at(-1);
  assert.ok(rank, `the ranking runs (no "nothing found"): ${run.result.text}`);
  const listed = rank!.listed as string[];
  for (const ref of listed) assert.ok(["event:event:e101", "event:event:e102", "event:event:e104", "event:event:e105"].includes(ref), `${ref} is on the weekend`);
  assert.doesNotMatch(run.result.text, /没有找到相关的内容/u);
  // R19: the note used is among the openable sources (the newest of the two of that name), the other is not.
  assert.ok(run.result.sourceRefs.includes("memo:note:sketch1"), run.result.sourceRefs.join(", "));
  assert.ok(!run.result.sourceRefs.includes("memo:note:sketch2"));
  assert.match(run.result.text, /看展札记/u);
});

test("R19 a note picked with @ as the ranking criterion is among the answer's openable sources", async () => {
  const message = "从这周末的活动里挑两场，最好跟 @看展札记 的主题有关。";
  const refs = [{ id: "note:sketch2", name: "看展札记", type: "memo" }];
  const run = await runFn(message, [EVENT_RANK(message, {
    objectClues: [{ entity: "memo", referenceId: "r1", text: "@看展札记" }],
    rank: { basis: "跟 @看展札记 的主题有关", count: 2 },
    readFilter: { from: "2026-11-21", to: "2026-11-22" },
    requiredCapabilities: ["event.read", "memo.read", "fn.rank"],
  })], { references: refs, world: worldWithNotes() });
  assert.ok(ranked(run.events).length, run.result.text);
  assert.ok(run.result.sourceRefs.includes("memo:note:sketch2"), `the @ note is a source: ${run.result.sourceRefs.join(", ")}`);
  assert.ok(!run.result.sourceRefs.includes("memo:note:sketch1"), "not the other note of the same name");
  assert.ok(run.result.basis?.links.some((link) => link.id === "note:sketch2"), JSON.stringify(run.result.basis));
});
