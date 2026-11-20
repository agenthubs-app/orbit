import assert from "node:assert/strict";
import { test } from "node:test";

import { localizeAnswerDates, weekdayOf } from "../../features/agent-v1/answer/dates";
import { listLead } from "../../features/agent-v1/answer/list-answer";
import { withCodeLateCount } from "../../features/agent-v1/answer/list-or-text";
import { todoNothingLine } from "../../features/agent-v1/graph/nodes/wider-read";
import { fnWorld, runFn, todo } from "./functions-kit";
import { graphKit, json, recordAccessOf, type ModelCall } from "./graph-kit";

/**
 * Hotfix 2026-11-20, part 1b (both judges of the hotfix regression run):
 *  2. numbers in a model's sentence about the to-dos read are code's (AE-RD-012 turn 2: "其中 3 项" above cards marking 4), and a
 *     lead says what it counts (AE-SCL-008: 「未完了のタスクは3件」 beside 64 — the overdue ones, not said);
 *  3. weekdays are code's in every language (AE-SCL-002: "Thu, Nov 27" is a Friday);
 *  4. a read narrowed to a person that finds nothing says who and what was looked for (AE-RD-004).
 */

const ACTOR = "actor:a";

test("item 2: an overdue count in the model's sentence is code's; a right one stays", () => {
  assert.equal(withCodeLateCount("不是空的；现在有 5 项未完成的待办，其中 3 项已经过期或过了计划日。", { dueLate: 2, late: 4 }).text, "不是空的；现在有 5 项未完成的待办，其中 4 项已经过期或过了计划日。");
  // "已过期" alone may mean the deadline only: 2 is right, so is 4.
  assert.equal(withCodeLateCount("其中 2 项已过期。", { dueLate: 2, late: 4 }).text, "其中 2 项已过期。");
  assert.equal(withCodeLateCount("其中 3 项已过期。", { dueLate: 2, late: 4 }).text, "其中 4 项已过期。");
  assert.equal(withCodeLateCount("期限を過ぎているものは3件あります。", { dueLate: 2, late: 2 }).text, "期限を過ぎているものは2件あります。");
  assert.equal(withCodeLateCount("You have 5 open to-dos; 3 of them are overdue.", { dueLate: 4, late: 4 }).text, "You have 5 open to-dos; 4 of them are overdue.");
  assert.deepEqual(withCodeLateCount("你有 5 项待办。", { dueLate: 2, late: 4 }).changed, []);
});

test("item 2 in the graph (AE-RD-012 turn 2): the model's 「其中 3 项已经过期或过了计划日」 is delivered with code's 2", async () => {
  const message = "所有代办都是空吗？";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "todo", text: "所有代办" }], requiredCapabilities: ["todo.read"], sourceQuote: message }], {
    answer: (call: ModelCall) => json({ segments: [{ body: [], cites: [...call.user.matchAll(/(s\d+) — to-do/gu)].map((match) => ({ sentenceIds: [1], sourceRef: match[1] })), lead: "不是空的；现在有 4 项未完成的待办，其中 3 项已经过期或过了计划日。", partId: "p1" }] }),
  });
  // On Nov 15: F1 is past its deadline, T45 past its planned day — two.
  assert.match(run.result.text, /其中 2 项已经过期或过了计划日/u, run.result.text);
  assert.ok(run.events.some((event) => event.type === "answer.late_count_corrected"));
});

test("item 2: a lead says what it counts — the overdue ones, or some of a larger total", () => {
  const late = (id: string) => ({ id, kind: "todo" as const, sub: "已过期2天", subTone: "late" as const, title: id });
  const cards = [late("a"), late("b"), late("c")];
  assert.equal(listLead({ cards, language: "ja", quote: "期限を過ぎているものは？", status: "open" }), "期限または予定日を過ぎた未完了のタスクは3件です：");
  assert.equal(listLead({ cards, language: "zh", quote: "哪些已经过期了？", status: "open" }), "已过期或过了计划日的还没完成的待办有 3 项：");
  assert.equal(listLead({ cards, language: "zh", quote: "我有哪些还没完成的待办？", status: "open", total: 64 }), "你有 64 项还没完成的待办，这里列出 3 项，其中 3 项已过期或过了计划日：");
  assert.equal(listLead({ cards, language: "en", quote: "my open to-dos", status: "open", total: 64 }), "You have 64 open to-dos; here are 3, 3 of them past their deadline or planned day:");
  // All of them listed: as before.
  assert.equal(listLead({ cards, language: "zh", quote: "我有哪些还没完成的待办？", status: "open", total: 3 }), "你有 3 项还没完成的待办，其中 3 项已过期或过了计划日：");
});

test("item 3: the weekday after a date is the date's own, in every language", () => {
  const asOf = "2026-11-20T01:00:00.000Z";
  assert.equal(weekdayOf(11, 27, null, asOf), 5);
  assert.equal(localizeAnswerDates("She will send the spec by Thu, Nov 27.", "en", asOf), "She will send the spec by Fri, Nov 27.");
  assert.equal(localizeAnswerDates("Due Thursday, November 27, 2026.", "en", asOf), "Due Friday, November 27, 2026.");
  assert.equal(localizeAnswerDates("截止 11月27日（周四）。", "zh", asOf), "截止 11月27日（周五）。");
  assert.equal(localizeAnswerDates("11月27日（木）まで。", "ja", asOf), "11月27日（金）まで。");
  assert.equal(localizeAnswerDates("11月27日（周四）", "en", asOf), "Fri, Nov 27");
  // A right weekday and a date with none are left as written.
  assert.equal(localizeAnswerDates("截止 11月27日（周五）。", "zh", asOf), "截止 11月27日（周五）。");
  assert.equal(localizeAnswerDates("by Nov 27", "en", asOf), "by Nov 27");
  // Early in January a December date is last year's.
  assert.equal(weekdayOf(12, 28, null, "2027-01-03T00:00:00.000Z"), new Date(Date.UTC(2026, 11, 28)).getUTCDay());
});

test("item 3 in the graph: an English answer with a wrong weekday is delivered with the right one", async () => {
  const message = "Our review with Emily is on Nov 27. What did she promise to send?";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "contact", text: "Emily" }], requiredCapabilities: ["memo.read"], sourceQuote: message }], {
    answer: (call: ModelCall) => json({ segments: [{ body: [], cites: [{ sentenceIds: [2], sourceRef: /(s\d+) — memo/u.exec(call.user)![1] }], lead: "She will send the dashboard spec, well before your review on Thu, Nov 27.", partId: "p1" }] }),
    language: "en",
  });
  assert.doesNotMatch(run.result.text, /Thu, Nov 27/u);
  assert.match(run.result.text, /Fri, Nov 27/u);
});

test("item 4 (AE-RD-004): a person with no open to-dos — who and what was looked for, not the bare sentence", async () => {
  const message = "Do I have any open to-dos for Emily Carter?";
  const understood = [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "contact", text: "Emily Carter" }], readFilter: { status: "open" }, requiredCapabilities: ["todo.read"], sourceQuote: message }];
  const run = await runFn(message, understood, { language: "en" });
  assert.equal(run.result.text, "Open to-dos for Emily Carter: none.");
  assert.doesNotMatch(run.result.text, /I found nothing about this/u);
  // A completed one of hers exists: it is said and shown.
  const world = fnWorld();
  world.records.push(todo(ACTOR, "task:emily-done", "Send Emily the beta form", { completedAt: "2026-11-12T01:00:00.000Z", relatedContactId: "contact:c40", status: "completed" }));
  const more = await runFn(message, understood, { language: "en", session: graphKit((async () => { throw new Error("replaced"); }) as never, { now: "2026-11-15T01:00:00.000Z", records: recordAccessOf(world) }) });
  assert.match(more.result.text, /^Open to-dos for Emily Carter: none\. You do have 1 completed to-do for Emily Carter\./u);
  assert.ok(more.result.blocks.some((block) => block.type === "records" && block.items.some((item) => item.id === "task:emily-done")));
  assert.equal(todoNothingLine("zh", "田中有没有还没完成的待办？", { person: { id: "c", name: "田中浩" }, status: "open", statusSaid: true }), "田中浩名下还没完成的待办：没有。");
  assert.equal(todoNothingLine("ja", "田中さんの未完了のタスクは？", { person: { id: "c", name: "田中浩" }, status: "open", statusSaid: true }), "田中浩さんの未完了のタスク：ありません。");
});
