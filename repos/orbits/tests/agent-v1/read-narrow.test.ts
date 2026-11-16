import assert from "node:assert/strict";
import test from "node:test";

import { clueSearchWords } from "../../features/agent-v1/graph/nodes/resolve";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { memo, schedule, smallWorld, todo } from "./read-kit";

/**
 * agent-design AG05 run-02 (coordinator; AE-UND-010 in the AG03 rerun): a read never gets wider because
 * the first layer left a field out. Without search words, the record clue's own words (pronouns and
 * generic words taken off) are the search; with no person to carry, a search that finds nothing is
 * "no record" — never the newest page instead. A to-do list with nothing to narrow it reads the open
 * ones; a schedule question with no dates and no person reads what is coming.
 */

const ACTOR = "actor:a";

function world() {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = ACTOR;
  base.records.push(
    memo(ACTOR, "note:m33", "A 公司（Acme Cloud）标准版每席每月 1200 日元。", "2026-10-20T02:00:00.000Z", [], { title: "竞品笔记 A" }),
    memo(ACTOR, "note:m34", "B 公司起步价每月 30000 日元。", "2026-10-22T02:00:00.000Z", [], { title: "竞品笔记 B" }),
    memo(ACTOR, "note:glaze", "灰釉の湯呑みは春まで待つ。", "2026-03-01T02:00:00.000Z", [], { title: "灰釉の件" }),
    memo(ACTOR, "note:en", "Notes on the competitor pricing for Q4.", "2026-09-01T02:00:00.000Z", [], { title: "Competitor pricing" }),
  );
  return base;
}

test("the clue's own words, without pronouns, counts and generic words (zh, ja, en)", () => {
  assert.equal(clueSearchWords("竞品"), "竞品");
  assert.equal(clueSearchWords("我记过的竞品"), "竞品");
  assert.equal(clueSearchWords("那三份竞品笔记"), "竞品");
  assert.equal(clueSearchWords("修订报价那条待办"), "修订报价");
  assert.equal(clueSearchWords("他那条询价的待办"), "询价");
  assert.equal(clueSearchWords("灰釉のメモ"), "灰釉");
  assert.equal(clueSearchWords("the competitor notes"), "competitor");
  assert.equal(clueSearchWords("my notes about the dashboard spec"), "dashboard spec");
  for (const only of ["那篇笔记", "第二个", "刚才的要点", "それ", "this note", "my notes"]) assert.equal(clueSearchWords(only), undefined, only);
});

test("words for a time, a state or recency are not search words (zh, ja, en)", () => {
  for (const only of ["タスク", "明日の予定", "明天的日程", "最近的笔记", "没做完的待办", "まだ終わっていないタスク", "期限を過ぎているもの", "this month's notes", "open to-dos", "overdue tasks", "my latest notes", "tomorrow's schedule"]) assert.equal(clueSearchWords(only), undefined, only);
  assert.equal(clueSearchWords("明天的周会"), "周会");
});

test("a clue that only names a kind of record (タスク, notes) is no pointer: the read goes on, narrowed by code's defaults", async () => {
  const base = world();
  base.records.push(todo(ACTOR, "task:done", "已经做完的", { status: "completed" }));
  const records = recordAccessOf(base);
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "todo", text: "タスク" }], requiredCapabilities: ["todo.read"], sourceQuote: "まだ終わっていないタスクを一覧にしてください" })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — to-do/u.exec(call.user)![1] }], partId: "p1", text: "ok" }] }),
    json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "schedule", text: "明日の予定" }], readFilter: { from: "2026-11-16", to: "2026-11-16" }, requiredCapabilities: ["schedule.read"], sourceQuote: "明日の予定を教えてください" })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — personal schedule item/u.exec(call.user)![1] }], partId: "p1", text: "ok" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  const todos = await runAgentGraph(kit.deps, kit.input("まだ終わっていないタスクを一覧にしてください。", { locale: "ja" }));
  assert.deepEqual(todos.sourceRefs, ["todo:task:t42"]);
  assert.equal(records.source.reads.includes("task:done"), false);
  const tomorrow = await runAgentGraph(kit.deps, kit.input("明日の予定を教えてください。", { locale: "ja" }));
  assert.deepEqual(tomorrow.sourceRefs, ["schedule:personal:s10"]);
});

test("a kind word is not taken for the record of that kind mentioned last; a pointer is", async () => {
  const base = world();
  base.records.push(todo(ACTOR, "task:other", "另一条待办"));
  const records = recordAccessOf(base);
  const state = { lastMentioned: [{ id: "task:t42", name: "给小林发修订报价", type: "todo" }], openItems: [], sessionId: "session:a", shownList: null, updatedAt: "2026-11-15T09:59:00.000Z" };
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "todo", text: "待办" }], requiredCapabilities: ["todo.read"], sourceQuote: "列一下我的待办" })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — to-do/u.exec(call.user)![1] }], partId: "p1", text: "ok" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { messages: [{ createdAt: "2026-11-15T09:59:00.000Z", role: "user", text: "x" }, { createdAt: "2026-11-15T09:59:10.000Z", role: "assistant", text: "y" }], records, state });
  await kit.seeded;
  await runAgentGraph(kit.deps, kit.input("列一下我的待办。"));
  assert.ok(records.source.reads.includes("task:other"), "the list is read, not only the to-do mentioned last");
});

const reads = (records: ReturnType<typeof recordAccessOf>) => records.source.reads.filter((id) => id.startsWith("note:"));

for (const [language, message, clue] of [
  ["zh", "列出我记过的竞品，", "我记过的竞品"],
  ["ja", "灰釉のメモを見せて", "灰釉のメモ"],
  ["en", "Show me the competitor notes.", "the competitor notes"],
] as const) {
  test(`${language}: no search words from the model — the clue's words narrow the read, nothing else is read`, async () => {
    const records = recordAccessOf(world());
    const model = deepseekStub([
      json({ parts: [part({ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "memo", text: clue }], requiredCapabilities: ["memo.read"], sourceQuote: message.replace(/[，。.]$/u, "") })], plainChat: false }),
      (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — memo/u.exec(call.user)![1] }], partId: "p1", text: "ok" }] }),
    ]);
    const kit = graphKit(model.fetchImplementation, { records });
    await runAgentGraph(kit.deps, kit.input(message, { locale: language }));
    const expected = language === "zh" ? ["note:m33", "note:m34"] : language === "ja" ? ["note:glaze"] : ["note:en"];
    assert.deepEqual([...new Set(reads(records))].sort(), expected.sort(), "only the notes with the clue's words were read");
  });
}

test("no person to carry and the clue's words find nothing: no record, and the newest page is not read instead", async () => {
  const records = recordAccessOf(world());
  const model = deepseekStub([json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "memo", text: "预算笔记" }], requiredCapabilities: ["memo.read"], sourceQuote: "预算笔记里写了什么" })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation, { records });
  const result = await runAgentGraph(kit.deps, kit.input("预算笔记里写了什么？"));
  assert.deepEqual(reads(records), []);
  assert.deepEqual(result.partResults.map((item) => item.gaps), [["no_record"]]);
  assert.equal(model.calls.length, 1);
});

test("a clue that is only a pronoun, with nothing bound and no person: no read, it says it cannot tell which record", async () => {
  const records = recordAccessOf(world());
  const model = deepseekStub([json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "memo", text: "那篇笔记" }], requiredCapabilities: ["memo.read"], sourceQuote: "那篇笔记里写了什么" })], plainChat: false })]);
  const kit = graphKit(model.fetchImplementation, { records, messages: [{ createdAt: "2026-11-15T09:59:00.000Z", role: "user", text: "你好" }, { createdAt: "2026-11-15T09:59:10.000Z", role: "assistant", text: "你好！" }] });
  const result = await runAgentGraph(kit.deps, kit.input("那篇笔记里写了什么？"));
  assert.deepEqual(reads(records), []);
  assert.match(result.text, /不确定你指的是哪一条/u);
});

test("a to-do list with nothing to narrow it reads the open ones; a schedule question with no dates and no person reads what is coming", async () => {
  const base = world();
  base.records.push(todo(ACTOR, "task:done", "已经做完的", { status: "completed" }), schedule(ACTOR, "personal:past", "上个月的会", "2026-10-01T01:00:00.000Z"));
  const records = recordAccessOf(base);
  const model = deepseekStub([
    json({ parts: [part({ dataSources: ["orbit_records"], deliverable: "list", requiredCapabilities: ["todo.read"], sourceQuote: "列一下我的待办" })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — to-do/u.exec(call.user)![1] }], partId: "p1", text: "ok" }] }),
    json({ parts: [part({ dataSources: ["orbit_records"], requiredCapabilities: ["schedule.read"], sourceQuote: "我有什么日程" })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — personal schedule item/u.exec(call.user)![1] }], partId: "p1", text: "ok" }] }),
  ]);
  const kit = graphKit(model.fetchImplementation, { records });
  await runAgentGraph(kit.deps, kit.input("列一下我的待办。"));
  assert.equal(records.source.reads.includes("task:done"), false, "the completed one is not read");
  await runAgentGraph(kit.deps, kit.input("我有什么日程？"));
  assert.equal(records.source.reads.includes("personal:past"), false, "the past item is not read");
  assert.ok(records.source.reads.includes("personal:s10"));
});
