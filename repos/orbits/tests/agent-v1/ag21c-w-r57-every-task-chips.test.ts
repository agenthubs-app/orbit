/**
 * AG21c R57 (W): a saved entry for every answer ("回答里的日期都带上星期", "时间一律写 24 小时制") changed the answer but no label
 * said a saved entry was used. Such an entry whose effect shows in the text the model wrote now gets the same small label as
 * task entries; one that changed nothing gets none. Sentences are this test's own.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { everyTaskChipsOf } from "../../features/agent-v1/domains/memory/chips";
import { json, runFn } from "./functions-kit";
import type { ModelCall } from "./graph-kit";

const WEEKDAY = { category: "constraint", content: "回答里的日期都带上星期", memoryId: "MW1" };
const CLOCK = { category: "constraint", content: "时间一律写 24 小时制", memoryId: "MW2" };
const OTHER = { category: "constraint", content: "回答尽量简短", memoryId: "MW3" };

test("R57 an every-task entry is labelled only when its effect is in the text (zh, ja, en dates; 24-hour times)", () => {
  assert.deepEqual(everyTaskChipsOf([WEEKDAY, CLOCK, OTHER], "下次见面是11月27日（周五）。", "zh").map((chip) => chip.memoryId), ["MW1"]);
  assert.deepEqual(everyTaskChipsOf([WEEKDAY, CLOCK], "打ち合わせは11月27日（金）の14:30からです。", "ja").map((chip) => chip.memoryId), ["MW1", "MW2"]);
  assert.deepEqual(everyTaskChipsOf([{ ...WEEKDAY, content: "Always add the day of the week to dates" }], "The review is on Fri, Nov 27.", "en").map((chip) => chip.memoryId), ["MW1"]);
  assert.deepEqual(everyTaskChipsOf([WEEKDAY, CLOCK], "你们上次聊了包装方案。", "zh"), [], "nothing in the text it shaped: no label");
  const [chip] = everyTaskChipsOf([CLOCK], "从 19:00 开始。", "zh");
  assert.deepEqual([chip.kind, chip.text], ["used", "按你存的「时间一律写 24 小时制」写的"]);
});

test("R57 a read answered with a date and its weekday under the saved rule carries the rule's label; without the date, none", async () => {
  const message = "所有待办里哪条最急？";
  const ask = (lead: string) => runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "todo", text: "所有待办" }], requiredCapabilities: ["todo.read"], sourceQuote: message }], {
    answer: (call: ModelCall) => json({ segments: [{ body: [], cites: [...call.user.matchAll(/(s\d+) — to-do/gu)].slice(0, 1).map((match) => ({ sentenceIds: [1], sourceRef: match[1] })), lead, partId: "p1" }] }),
    memories: [{ appliesTo: ["all"], category: "constraint", content: WEEKDAY.content, id: "MW1" }],
  });
  const dated = await ask("最急的是回复田中的询价，截止是11月17日（周二）。");
  assert.ok(dated.result.memoryUse?.some((item: { memoryId: string }) => item.memoryId === "MW1"), `${dated.result.text} ${JSON.stringify(dated.result.memoryUse)}`);
  const plain = await ask("最急的是回复田中的询价。");
  assert.ok(!plain.result.memoryUse?.some((item: { memoryId: string }) => item.memoryId === "MW1"), JSON.stringify(plain.result.memoryUse));
});
