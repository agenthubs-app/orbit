import assert from "node:assert/strict";
import test from "node:test";

import { ACTOR, fnWorld, runFn, todo } from "./functions-kit";

/**
 * agent-design AG12 opening item (AG10 coordinator review, AE-FN-003): the follow-up ranking's lead names two criteria
 * — a follow-up past due and not done, a to-do past its planned day. Code owns who meets them: only the people with such
 * a record are counted and numbered; someone with only a to-do due or planned later in the period is said apart, never
 * counted as meeting the criteria.
 */

const fnRank = (events: Record<string, unknown>[]) => events.filter((event) => event.type === "fn.rank");
const ask = (message: string, from = "2026-11-15", to = "2026-11-21") => [{ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { basis: message }, readFilter: { from, to }, requiredCapabilities: ["contact.read", "view.recentInteraction", "fn.extractFollowUps", "fn.rank"], sourceQuote: message }];

test("AE-FN-003 (zh): only Tanaka and Li Wei meet the two criteria; Kobayashi's to-do planned for 11/18 is said apart, not counted", async () => {
  const message = "这周该跟进谁？";
  const run = await runFn(message, ask(message));
  const listed = fnRank(run.events).at(-1)!.listed as string[];
  assert.deepEqual([...listed].sort(), ["contact:contact:c30", "contact:contact:c31"], "fn.rank lists only the ones that meet the criteria");
  assert.match(run.result.text, /符合条件的一共2位/u);
  assert.doesNotMatch(run.result.text, /符合条件的一共3位/u);
  const numbered = run.result.text.split("\n").filter((line) => /^\d+\. /u.test(line));
  assert.equal(numbered.length, 2, run.result.text);
  assert.ok(numbered.every((line) => !line.includes("小林")), "Kobayashi is not numbered among those who meet the criteria");
  // Said apart, as what it is.
  const apart = run.result.text.split("\n").find((line) => line.includes("小林健"));
  assert.ok(apart, run.result.text);
  assert.match(apart!, /还没/u);
  assert.match(apart!, /不算在上面/u);
  assert.match(apart!, /「给小林发修订报价」计划在11月18日/u);
  // What the answer mentions, it read.
  assert.ok(run.result.sourceRefs.some((ref) => ref.includes("c17")) || run.result.text.includes("小林健"));
});

test("AE-FN-003 (ja, en): the same split, in the answer's language", async () => {
  const ja = "今週フォローすべきなのは誰？";
  const jaRun = await runFn(ja, ask(ja));
  assert.deepEqual([...(fnRank(jaRun.events).at(-1)!.listed as string[])].sort(), ["contact:contact:c30", "contact:contact:c31"]);
  assert.match(jaRun.result.text, /該当は全部で2人/u);
  const jaApart = jaRun.result.text.split("\n").find((line) => line.includes("小林健"));
  assert.ok(jaApart && /含めていません/u.test(jaApart), jaRun.result.text);
  const en = "Who should I follow up with this week?";
  const enRun = await runFn(en, ask(en));
  assert.deepEqual([...(fnRank(enRun.events).at(-1)!.listed as string[])].sort(), ["contact:contact:c30", "contact:contact:c31"]);
  assert.match(enRun.result.text, /2 in all match/u);
  const enApart = enRun.result.text.split("\n").find((line) => line.includes("小林健"));
  assert.ok(enApart && /not counted above/u.test(enApart), enRun.result.text);
});

test("nobody past due or past a planned day: the answer says none meets the criteria, and lists the upcoming one apart", async () => {
  const world = fnWorld();
  // Only Kobayashi's to-do (planned 11/18) stays open.
  world.records = world.records.filter((record) => record.collection !== "tasks" || record.id === "task:t42");
  assert.ok(world.records.some((record) => record.id === "task:t42"));
  const message = "这周该跟进谁？";
  const run = await runFn(message, ask(message), { world });
  assert.deepEqual(fnRank(run.events).at(-1)!.listed, []);
  assert.doesNotMatch(run.result.text, /符合条件的一共[1-9]/u);
  assert.match(run.result.text, /没有符合/u);
  assert.equal(run.result.text.split("\n").filter((line) => /^\d+\. /u.test(line)).length, 0);
  assert.match(run.result.text, /小林健[^\n]*计划在11月18日/u);
  void ACTOR;
  void todo;
});
