/**
 * AG21c (W): the coordinator's decisions D4, D5, D7 and D8, each as a rule in code.
 * - D4: "for a week" / "到下周" for a scheduled task ends at the end of the seventh calendar day (a last valid day).
 * - D5: a local time that does not exist on a clock-change night runs at the first valid minute after the gap.
 * - D7: in an import, a name one character off at the same company is a possible duplicate, never merged on its own.
 * - D8: a saved "never recommend X" rule (and a hard time rule) still applies when the message gives its own standard;
 *   only saved preferences give way to it.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { nextAgentAutomationRunAt } from "../../features/agent/automations/contract";
import { previewImport } from "../../features/agent-v1/domains/contact/import-preview";
import { ruledOutWordsOf } from "../../features/agent-v1/domains/memory/turn";
import { untilSaidIn } from "../../features/agent-v1/rule/parse";
import { contactWorld, memoryContactAccess } from "./contact-kit";
import { contact } from "./read-kit";
import { runFn } from "./functions-kit";

test("D4 'for a week' ends at the end of the seventh calendar day; a week that names what is looked at is not an end", () => {
  for (const words of ["先跑一周看看", "跑到下周为止", "一週間だけ試して", "run it for a week", "keep it going until next week"]) assert.equal(untilSaidIn(words, "2026-11-21"), "2026-11-28", words);
  assert.equal(untilSaidIn("每周一推荐未来一周的活动", "2026-11-21"), null, "the events of the coming week are the scope");
  assert.equal(untilSaidIn("1週間以内のイベントを毎朝", "2026-11-21"), null);
  assert.equal(untilSaidIn("先跑一周", "2026-12-28"), "2027-01-04", "across the year");
});

test("D5 a time in the clock-change gap runs at the first valid minute after it (New York, London)", () => {
  assert.equal(nextAgentAutomationRunAt({ kind: "daily", time: "02:30", timeZone: "America/New_York" }, "2026-03-08T05:00:00.000Z"), "2026-03-08T07:00:00.000Z");
  assert.equal(nextAgentAutomationRunAt({ kind: "daily", time: "01:15", timeZone: "Europe/London" }, "2026-03-28T23:00:00.000Z"), "2026-03-29T01:00:00.000Z", "01:15 GMT does not exist: 02:00 BST");
  assert.equal(nextAgentAutomationRunAt({ kind: "daily", time: "09:00", timeZone: "Asia/Tokyo" }, "2026-03-08T00:00:00.000Z"), "2026-03-09T00:00:00.000Z", "no gap: unchanged");
});

test("D7 an imported name one character off at the same company is a possible duplicate, never merged or created beside it", async () => {
  const world = contactWorld((records) => {
    records.push(contact("actor:a", "contact:yy", "柯一苇", { organization: "鹭岛文创", role: "策展" }));
    records.push(contact("actor:a", "contact:ln", "Lena Moss", { organization: "Harbor Print", role: "Buyer" }));
  });
  const existing = await memoryContactAccess(world).listActive("actor:a");
  const preview = previewImport("柯一伟,鹭岛文创,策展\nLina Moss,Harbor Print,Buyer\n柯一伟,远山书局,编辑", existing, "actor:a");
  assert.deepEqual(preview.rows.map((row) => [row.name, row.decision, row.match?.id ?? null]), [["柯一伟", "duplicate", "contact:yy"], ["Lina Moss", "duplicate", "contact:ln"], ["柯一伟", "create", null]]);
  assert.ok(preview.rows.filter((row) => row.decision === "duplicate").every((row) => row.outcome === "skip"), "left out unless the user decides");
});

const EVENT_RANK = (quote: string) => ({ dataSources: ["orbit_records"], deliverable: "ranked_list", rank: { count: 3 }, readFilter: { from: "2026-11-21", to: "2026-11-29" }, requiredCapabilities: ["event.read", "fn.rank"], sourceQuote: quote });
const listedOf = (events: Record<string, unknown>[]) => (events.filter((event) => event.type === "fn.rank").at(-1)?.listed ?? []) as string[];
const PHOTO = ["event:event:e101", "event:event:e102", "event:event:e107"];

test("D8 the words a 'never recommend X' rule rules out (zh, ja, en)", () => {
  assert.deepEqual(ruledOutWordsOf("推荐活动时不要推荐摄影类的"), ["摄影"]);
  assert.deepEqual(ruledOutWordsOf("イベントは写真展をおすすめしないで"), ["写真展"]);
  assert.deepEqual(ruledOutWordsOf("Never recommend photography events"), ["photography"]);
  assert.deepEqual(ruledOutWordsOf("推荐活动时优先摄影类的"), [], "a preference rules nothing out");
  assert.deepEqual(ruledOutWordsOf("推荐活动时不要晚上的"), [], "a time rule is the time condition");
});

test("D8 with the message's own standard (by start time), the saved 'never recommend' rule still removes those events; a preference gives way", async () => {
  const message = "这周到下周末的活动，按开始时间挑三场推荐给我";
  const ruled = await runFn(message, [EVENT_RANK(message)], { memories: [{ appliesTo: ["event.recommend"], category: "constraint", content: "推荐活动时不要推荐摄影类的", id: "MD1" }] });
  const listed = listedOf(ruled.events);
  assert.ok(listed.length > 0, ruled.result.text);
  for (const ref of PHOTO) assert.ok(!listed.includes(ref), `${ref} is what the rule rules out: ${listed.join(",")}`);
  assert.ok(ruled.result.memoryUse?.some((chip: { memoryId: string; kind: string }) => chip.memoryId === "MD1" && chip.kind === "rule"), JSON.stringify(ruled.result.memoryUse));
  // The same standard with a saved preference only: the preference gives way (nothing is removed, nothing named).
  const preferred = await runFn(message, [EVENT_RANK(message)], { memories: [{ appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先出版相关的", id: "MD2" }] });
  assert.ok(listedOf(preferred.events).includes("event:event:e101"), listedOf(preferred.events).join(","));
  assert.ok(!preferred.result.memoryUse?.some((chip: { memoryId: string }) => chip.memoryId === "MD2"));
});
