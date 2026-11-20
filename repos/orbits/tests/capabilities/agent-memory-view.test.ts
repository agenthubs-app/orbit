import assert from "node:assert/strict";
import { test } from "node:test";

import { memoryConflicts, memoryDayText, memoryEditorInput, memoryExpiryAfter, memorySettingsView } from "../../shared/compute/agent-memory-view";
import type { AgentMemoryEntryContract } from "../../shared/contract/agent-v1";
import { zh } from "../../shared/copy/zh";
import { en } from "../../shared/copy/en";

/** AG14 UI (approved draft boards 6–8, D7, D8, D10): the settings page's memory part, the rule both clients run. */
let n = 0;
const entry = (over: Partial<AgentMemoryEntryContract>): AgentMemoryEntryContract => ({
  appliesTo: ["event.recommend"], category: "preference", content: `条目${++n}`, createdAt: "2026-11-01T00:00:00Z", memoryId: `m${n}`, revision: 1,
  source: "manual", sourceMessageRef: null, status: "active", structured: null, updatedAt: "2026-11-01T00:00:00Z", validFrom: null, validUntil: null, ...over,
});
const view = (entries: AgentMemoryEntryContract[], settings = { allowConversationLearning: true, enabled: true }, extra: { ruleLimit?: number; expanded?: Set<string> } = {}) =>
  memorySettingsView({ entries, language: "zh", settings, today: "2026-11-20", words: zh.memorySettings, ...extra });

test("two switches with what they do; 「现在关着：……」 when off; only 「回答时参考这些」 off fades the rows (D10)", () => {
  const on = view([entry({})]);
  assert.deepEqual(on.switches.map((item) => [item.title, item.note, item.on]), [["回答时参考这些", "关掉后条目都还在，只是回答时不用。", true], ["从对话里记住新的（会先问你）", "你说「记住……」时出一张卡片，点了确认才存。", true]]);
  assert.equal(on.dim, false);
  const off = view([entry({})], { allowConversationLearning: false, enabled: false });
  assert.deepEqual(off.switches.map((item) => item.note), ["现在关着：回答时不会用下面这些，条目都还在。", "现在关着：你说「记住……」只用在那一次，不会存。"]);
  assert.equal(off.dim, true);
  assert.equal(view([entry({})], { allowConversationLearning: false, enabled: true }).dim, false, "only the second off: nothing fades");
});

test("three groups; five rows each, then 「还有 N 条」 that unfolds in place (D7); rows say 用在 and the last day, nothing else (D8)", () => {
  const rules = Array.from({ length: 7 }, () => entry({ appliesTo: ["all"], category: "constraint" }));
  const weighed = [entry({ appliesTo: ["todo.plan"], category: "goal", content: "这个季度把待办的逾期数降到五条以内", validUntil: "2026-12-31" }), entry({})];
  const legacy = entry({ appliesTo: [], content: "我习惯用中文记笔记" });
  const shown = view([...rules, ...weighed, legacy]);
  assert.deepEqual(shown.groups.map((group) => [group.title, group.note, group.rows.length, group.shown, group.moreLabel]), [
    ["一直遵守的", "7条 · 每次回答都照做", 7, 5, "还有2条"],
    ["酌情参考的", "2条 · 和手上的事有关时才用", 2, 2, null],
    ["还没说用在哪的", "1条 · 只在明显有关时参考", 1, 1, null],
  ]);
  assert.equal(shown.groups[1].rows[0].meta, "用在：安排待办时 · 12月31日（周四）到期");
  assert.equal(shown.groups[0].rows[0].meta, "用在：所有回答");
  assert.equal(shown.groups[2].rows[0].meta, "以前存的，没写用在哪");
  assert.equal(view([...rules], undefined, { expanded: new Set(["rules"]) }).groups[0].shown, 7);
  assert.equal(view([...rules], undefined, { expanded: new Set(["rules"]) }).groups[0].moreLabel, "收起");
  assert.equal(shown.empty, null);
  assert.deepEqual(view([]).empty, { note: "在对话里说一句「记住……」，或者点右上角的「添加」。", title: "还没有记住任何事" });
});

test("an entry past its last day stays, last in its group, with 「已到期」 (board 7); the rule limit says so (board 7)", () => {
  const old = entry({ appliesTo: ["schedule.plan"], content: "下个月把日程里的空档用起来", validUntil: "2026-11-19" });
  const fresh = entry({});
  const shown = view([old, fresh]);
  assert.deepEqual(shown.groups[0].rows.map((row) => [row.content, row.expired]), [[fresh.content, false], [old.content, true]]);
  assert.equal(shown.groups[0].rows[1].metaLead, "用在：安排日程时 · ");
  assert.equal(shown.groups[0].rows[1].expiredText, "11月19日（周四）已到期");
  const full = view(Array.from({ length: 3 }, () => entry({ appliesTo: ["all"], category: "constraint" })), undefined, { ruleLimit: 3 });
  assert.equal(full.groups[0].full, "已经3条了。再加之前，先合并或删掉几条。");
  assert.equal(full.rulesFull, true);
});

test("two entries asking opposite times for the same task are shown together with 「留哪一条？」; other pairs are not", () => {
  const morning = entry({ content: "推荐活动时优先周末上午", structured: { dayPart: "morning", preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  const evening = entry({ content: "推荐活动时优先工作日晚上", structured: { dayPart: "evening", preferredDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], strength: "prefer" } });
  const avoid = entry({ category: "constraint", content: "不要推荐晚上的活动", structured: { dayPart: "evening", strength: "avoid" } });
  const contacts = entry({ appliesTo: ["contact.recommend"], content: "联系人优先周末", structured: { preferredDays: ["Sat", "Sun"], strength: "prefer" } });
  assert.deepEqual(memoryConflicts([morning, evening, avoid, contacts]).map(([a, b]) => [a.content, b.content]), [["推荐活动时优先周末上午", "推荐活动时优先工作日晚上"]]);
  const shown = view([morning, evening, avoid]);
  assert.equal(shown.conflicts[0].note, "这两条说法相反，留哪一条？");
  assert.ok(!shown.groups.flatMap((group) => group.rows).some((row) => row.memoryId === morning.memoryId), "a row is in one place only");
});

test("dates read 12月31日（周四）; the quick last days; English words come from the English copy", () => {
  assert.equal(memoryDayText("2026-12-31", "zh"), "12月31日（周四）");
  assert.equal(memoryDayText("2026-12-31", "ja"), "12月31日（木）");
  assert.equal(memoryDayText("2026-12-31", "en"), "Thu, Dec 31");
  assert.equal(memoryExpiryAfter("2026-11-20", 1), "2026-12-20");
  assert.equal(memoryExpiryAfter("2026-01-31", 1), "2026-02-28");
  assert.equal(memoryExpiryAfter("2026-11-20", 3), "2027-02-20");
  const english = memorySettingsView({ entries: [entry({ validUntil: "2026-12-31" })], language: "en", settings: { allowConversationLearning: true, enabled: true }, today: "2026-11-20", words: en.memorySettings });
  assert.equal(english.groups[0].rows[0].meta, "Used for: recommending events · until Thu, Dec 31");
});

test("a save sends the words, the task, the group and the last day; changed words drop the old values; the revision goes along", () => {
  const before = entry({ category: "goal", content: "旧的", revision: 4, structured: { topics: ["旧"] } });
  assert.deepEqual(memoryEditorInput({ before, content: " 新的 ", rule: false, task: "todo.plan", validUntil: "2026-12-20" }), { appliesTo: ["todo.plan"], category: "goal", content: "新的", expectedRevision: 4, structured: null, validUntil: "2026-12-20" });
  assert.deepEqual(memoryEditorInput({ before, content: "旧的", rule: true, task: "all", validUntil: null }), { appliesTo: ["all"], category: "constraint", content: "旧的", expectedRevision: 4, validUntil: null });
  assert.deepEqual(memoryEditorInput({ before: null, content: "推荐活动时优先周末", rule: false, task: "event.recommend", validUntil: null }), { appliesTo: ["event.recommend"], category: "preference", content: "推荐活动时优先周末", validUntil: null });
});
