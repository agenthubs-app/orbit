import assert from "node:assert/strict";
import { test } from "node:test";

import { ACTOR, fnWorld, NOW, runFn } from "./functions-kit";
import { json, type ModelCall } from "./graph-kit";
import { schedule } from "./read-kit";

/**
 * Integration (2026-11-20, after AG20b): the plain schedule question with no period ("我接下来有什么日程？") reads the items from
 * now on. An all-day item is stored at its day's midnight, so at 10:00 on its day it had "started" and was left out. It
 * counts as coming up until the end of its day in the user's time zone (comesUp, graph/nodes/prepare.ts) — the same rule
 * as the preparation answer. Timed items as before: a meeting that started at 09:00 is not listed at 10:00.
 */

// NOW is 2026-11-15 10:00 in Tokyo. 11月15日 in Tokyo, the whole day, is stored as 2026-11-14T15:00Z with the all-day flag.
const TODAY_ALL_DAY = schedule(ACTOR, "personal:allday", "年度体检", "2026-11-14T15:00:00.000Z", { allDay: true });
const STARTED = schedule(ACTOR, "personal:started", "晨会", "2026-11-15T00:00:00.000Z", { endsAt: "2026-11-15T00:30:00.000Z" });
const YESTERDAY_ALL_DAY = schedule(ACTOR, "personal:yesterday", "搬家日", "2026-11-13T15:00:00.000Z", { allDay: true });
const LATER = schedule(ACTOR, "personal:later", "和客户通话", "2026-11-15T06:00:00.000Z", { endsAt: "2026-11-15T07:00:00.000Z" });
// An all-day item every week on Sunday, first on 11月8日: today's occurrence is the one listed.
const WEEKLY_ALL_DAY = schedule(ACTOR, "personal:weekly", "家庭日", "2026-11-07T15:00:00.000Z", { allDay: true, recurrence: { frequency: "weekly" } });

async function ask(extra: ReturnType<typeof schedule>[]) {
  const world = fnWorld();
  world.records.push(...extra);
  const message = "我接下来有什么日程？";
  let materials = "";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["schedule.read"], sourceQuote: message }], {
    answer: (call: ModelCall) => {
      materials = call.user;
      const handles = [...call.user.matchAll(/(s\d+) — personal schedule item/gu)].map((match) => match[1]);
      return json({ segments: [{ cites: handles.map((sourceRef) => ({ sentenceIds: [1], sourceRef })), partId: "p1", text: "接下来的日程如下。" }] });
    },
    world,
  });
  return { materials, run };
}

test("at 10:00 on its day an all-day item is still coming up; a meeting that started at 09:00 and yesterday's all-day item are not", async () => {
  const { materials, run } = await ask([TODAY_ALL_DAY, STARTED, YESTERDAY_ALL_DAY, LATER]);
  const refs = run.result.sourceRefs.join(" ");
  assert.match(refs, /personal:allday/u, `today's all-day item is read: ${refs}`);
  assert.match(refs, /personal:later/u, "a timed item later today as before");
  assert.doesNotMatch(refs, /personal:started/u, "a timed item that started is not coming up");
  assert.doesNotMatch(refs, /personal:yesterday/u, "yesterday's all-day item is over");
  assert.match(materials, /年度体检/u);
  assert.doesNotMatch(materials, /晨会|搬家日/u);
  assert.ok(run.events.some((event) => event.type === "resolve.all_day_today"), "traced");
});

test("an all-day item that repeats is listed as today's occurrence", async () => {
  const { materials, run } = await ask([WEEKLY_ALL_DAY]);
  assert.ok(run.result.sourceRefs.some((ref) => ref.includes("personal:weekly")), JSON.stringify(run.result.partResults));
  assert.match(materials, /家庭日/u);
  assert.match(materials, /Day: 2026-11-15 \(Sun\) \(all day/u, `today's occurrence, not next week's: ${materials}`);
  assert.doesNotMatch(materials, /2026-11-22/u, materials);
});

test("an all-day item of the day before is over by the next morning: not read, nothing traced", async () => {
  const world = fnWorld();
  world.records.push(schedule(ACTOR, "personal:past", "前一天的全天事项", "2026-11-13T15:00:00.000Z", { allDay: true }));
  const message = "我接下来有什么日程？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["schedule.read"], sourceQuote: message }], { answer: () => json({ segments: [{ lead: "接下来的日程如下。", partId: "p1" }] }), world });
  assert.ok(!run.result.sourceRefs.some((ref) => ref.includes("personal:past")), run.result.text);
  assert.ok(!run.events.some((event) => event.type === "resolve.all_day_today"));
});
