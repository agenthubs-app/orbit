import assert from "node:assert/strict";
import { test } from "node:test";

import { ALWAYS_CHECK, CHECKS, NOT_YET, runHardChecks, type CheckContext } from "./lib/hard-checks";
import type { Observation } from "./lib/observations";
import { blockLines } from "./lib/runner";
import { CHECK_WORDS } from "./lib/vocabulary";
import type { AgentAnswerBlockContract } from "../../shared/contract/agent-v1";

/**
 * agent-design AG19 (CHANGES.md 2026-11-19): the three checks of the ANS area read the result document's blocks —
 * answer_cards (the record cards in display order, by fixture id), answer_blocks (which kinds of block are there),
 * answer_text_plain (no Markdown symbol) — and the transcript shows the blocks to the judges.
 */

const context: CheckContext = { otherAccountRecords: [], rawTrace: "", secrets: [] };
const FIXTURE: Record<string, string> = { "contact:c30": "C30", "event:e101": "E101", "event:e103": "E103", "event:e104": "E104", "event:e106": "E106" };
const obs = (blocks: AgentAnswerBlockContract[] | undefined, text: string): Observation => ({
  account: "A", accounts: { A: "user_a" }, answers: [{ citations: [], seq: 9, text }], businessChanges: [], cards: [], caseId: "AE-ANS-T", clarifications: 0, clicks: [], decisions: [], diff: { records: [], tables: [] }, events: [], fake: false,
  entry: { acks: [], clients: {}, requests: [{ document: { answer: { ...(blocks ? { blocks } : {}), sourceRefs: [], text } }, requestId: "agreq_1" }] } as never,
  fixtureIdOf: (id) => (id ? FIXTURE[id] ?? null : null), idMap: {}, reads: [], requests: [], unsupported: [],
});
const run = (word: string, args: unknown, observation: Observation) => CHECKS[word](args, observation, context);

const LIST: AgentAnswerBlockContract[] = [
  { text: "还没开始的活动共3场，按开始时间从早到晚：", type: "paragraph" },
  { items: [{ id: "event:e103", kind: "event", title: "SaaS 定价研讨会" }, { id: "event:e101", kind: "event", title: "东京街头摄影展" }, { id: "event:e104", kind: "event", title: "设计师之夜" }], lessLabel: "收起", moreLabel: "还有 1 场", shown: 2, type: "records" },
  { caption: "提到的活动", items: [{ id: "event:e106", kind: "event", title: "AI 产品沙龙" }], shown: 1, size: "mini", type: "records" },
];
const TEXT = "还没开始的活动共3场，按开始时间从早到晚：\n1. SaaS 定价研讨会\n2. 东京街头摄影展\n3. 设计师之夜\n时间未公布：AI 产品沙龙。";

test("the three ANS words are implemented and in the vocabulary", () => {
  for (const word of ["answer_cards", "answer_blocks", "answer_text_plain"]) {
    assert.ok(CHECK_WORDS.has(word), word);
    assert.equal(typeof CHECKS[word], "function", word);
    assert.equal(NOT_YET[word], undefined, word);
  }
});

test("answer_cards: the list's cards in display order by fixture id; kinds, order, how many are shown first, the text says the same", () => {
  const o = obs(LIST, TEXT);
  assert.equal(run("answer_cards", { exact: ["E103", "E101", "E104"], kinds: ["event"], more: true, shown_first: 2, text_order: true }, o).status, "pass");
  assert.equal(run("answer_cards", { sequence: ["E101", "E103"] }, o).status, "fail");
  assert.equal(run("answer_cards", { excludes: ["E106"], min: 3 }, o).status, "pass", "the small card is not part of the list");
  assert.equal(run("answer_cards", { exact: ["E106"], size: "mini" }, o).status, "pass");
  assert.equal(run("answer_cards", { count: 4, size: "any" }, o).status, "pass");
  assert.equal(run("answer_cards", { kinds: ["contact"] }, o).status, "fail");
  assert.equal(run("answer_cards", { shown_first: 5 }, o).status, "fail");
  assert.equal(run("answer_cards", { more: false }, o).status, "fail");
  assert.equal(run("answer_cards", { none: true }, o).status, "fail");
  // The text names them in another order, or leaves one out.
  assert.equal(run("answer_cards", { text_order: true }, obs(LIST, "1. 东京街头摄影展\n2. SaaS 定价研讨会\n3. 设计师之夜")).status, "fail");
  assert.equal(run("answer_cards", { text_order: true }, obs(LIST, "1. SaaS 定价研讨会")).status, "fail");
  // A record on two cards, or a card with no name, never passes.
  const twice: AgentAnswerBlockContract[] = [{ items: [{ id: "event:e103", kind: "event", title: "A" }, { id: "event:e103", kind: "event", title: "A" }], shown: 2, type: "records" }];
  assert.equal(run("answer_cards", {}, obs(twice, "A")).status, "fail");
  assert.equal(run("answer_cards", {}, obs([{ items: [{ id: "event:e103", kind: "event", title: " " }], shown: 1, type: "records" }], "x")).status, "fail");
  // No blocks at all (an older document): only `none` holds.
  assert.equal(run("answer_cards", { min: 1 }, obs(undefined, TEXT)).status, "fail");
  assert.equal(run("answer_cards", { none: true }, obs(undefined, TEXT)).status, "pass");
  assert.equal(run("answer_cards", { none: true }, obs([{ text: "只有文字。", type: "paragraph" }], "只有文字。")).status, "pass");
});

test("answer_blocks: which kinds of block are there, which are not, which comes first", () => {
  const o = obs([{ text: "结论。", type: "conclusion" }, { items: [{ text: "一" }, { text: "二" }], type: "points" }, { items: [{ text: "这次没有找。" }], title: "这次没做的部分", type: "note" }], "结论。\n・一\n・二\n\n这次没有找。");
  assert.equal(run("answer_blocks", { first: "conclusion", has: ["conclusion", "points", "note"], lacks: ["records"] }, o).status, "pass");
  assert.equal(run("answer_blocks", { lacks: ["note"] }, o).status, "fail");
  assert.equal(run("answer_blocks", { has: ["records"] }, o).status, "fail");
  assert.equal(run("answer_blocks", { first: "paragraph" }, o).status, "fail");
  assert.equal(run("answer_blocks", { has: ["paragraph"] }, obs(undefined, "x")).status, "fail");
});

test("answer_text_plain: no star, backtick or heading mark in the text or in a block", () => {
  assert.equal(run("answer_text_plain", true, obs(LIST, TEXT)).status, "pass");
  assert.equal(run("answer_text_plain", true, obs(undefined, "**先准备报价**，再准备案例。")).status, "fail");
  assert.equal(run("answer_text_plain", true, obs(undefined, "## 结论\n先准备报价。")).status, "fail");
  assert.equal(run("answer_text_plain", true, obs([{ items: [{ head: "`a`", text: "b" }, { text: "c" }], type: "points" }], "・a：b\n・c")).status, "fail");
  assert.equal(run("answer_text_plain", true, obs(undefined, "5 件のうち #3 が該当します。")).status, "pass", "a # that is not a heading is the user's data");
});

test("the transcript shows the blocks as the clients lay them out", () => {
  const lines = blockLines([...LIST, { items: [{ action: "用 @ 选一场活动。", quote: "顺便找几场", text: "这次没有找。" }], title: "这次没做的部分", type: "note" }], (id) => (id ? FIXTURE[id] ?? null : null));
  assert.match(lines[0], /两端实际显示的排版/u);
  assert.ok(lines.some((line) => line.includes("【卡片，共 3 张，先显示 2 张，其余收在「还有 1 场」里")));
  assert.ok(lines.some((line) => line.includes("1. [活动] ｜SaaS 定价研讨会｜（E103）")));
  assert.ok(lines.some((line) => line.includes("【小卡片，上方小字「提到的活动」，共 1 张】")));
  assert.ok(lines.some((line) => line.includes("「顺便找几场」这次没有找。〔可以马上做：用 @ 选一场活动。〕")));
  assert.deepEqual(blockLines(undefined, () => null), []);
});

test("answer_cards lead_plain: the text above the cards names none of the listed records (D1)", () => {
  assert.equal(run("answer_cards", { lead_plain: true }, obs(LIST, TEXT)).status, "pass");
  const named: AgentAnswerBlockContract[] = [{ text: "下周有两项日程：团队周会和和田中午餐。", type: "conclusion" }, { items: [{ id: "contact:c30", kind: "contact", title: "团队周会" }], shown: 1, type: "records" }];
  const result = run("answer_cards", { lead_plain: true }, obs(named, "下周有两项日程：团队周会和和田中午餐。\n1. 团队周会"));
  assert.deepEqual([result.status, /the lead above the cards names 团队周会/u.test(result.detail)], ["fail", true]);
  // A points block above the cards that names them counts too; text after the cards does not.
  const points: AgentAnswerBlockContract[] = [{ text: "两项：", type: "paragraph" }, { items: [{ head: "SaaS 定价研讨会", text: "周四晚上。" }, { text: "另一场。" }], type: "points" }, LIST[1]];
  assert.equal(run("answer_cards", { lead_plain: true }, obs(points, TEXT)).status, "fail");
  const after: AgentAnswerBlockContract[] = [LIST[0], LIST[1], { text: "SaaS 定价研讨会离现在最近。", type: "paragraph" }];
  assert.equal(run("answer_cards", { lead_plain: true }, obs(after, TEXT)).status, "pass");
});

test("answer_blocks_in_sync runs on every case: the blocks and the text of each result document say the same", () => {
  const docs = (...answers: { text: string; blocks?: AgentAnswerBlockContract[]; cardLine?: string }[]): Observation => ({
    ...obs(undefined, "x"),
    answers: answers.map((answer, index) => ({ citations: [], seq: index + 1, text: answer.text })),
    entry: { acks: [], clients: {}, requests: answers.map((answer, index) => ({ document: { answer: { sourceRefs: [], ...answer } }, requestId: `agreq_${index + 1}` })) } as never,
  });
  assert.equal(run(ALWAYS_CHECK, true, obs(LIST, TEXT)).status, "pass");
  assert.equal(run(ALWAYS_CHECK, true, obs(undefined, TEXT)).status, "pass", "no blocks: nothing to compare");
  // The judges' finding: the card changed, the text and the card line follow, a paragraph block keeps the old value.
  const stale = docs({ blocks: [{ text: "好的。", type: "paragraph" }, { text: "等你确认：改到11月20日（周五）。", type: "paragraph" }], cardLine: "等你确认：改到11月21日（周六）。", text: "好的。\n\n等你确认：改到11月21日（周六）。" });
  const result = run(ALWAYS_CHECK, true, stale);
  assert.equal(result.status, "fail");
  assert.match(result.detail, /a block shows words that are not in answer\.text: 等你确认：改到11月20日/u);
  assert.match(result.detail, /the card line of the current card is not shown/u);
  assert.equal(run(ALWAYS_CHECK, true, docs({ blocks: [{ text: "好的。", type: "paragraph" }, { text: "等你确认：改到11月21日（周六）。", type: "paragraph" }], cardLine: "等你确认：改到11月21日（周六）。", text: "好的。\n\n等你确认：改到11月21日（周六）。" })).status, "pass");
  // A line of the text no block shows; a full card whose record the text does not list; an earlier document of the case counts too.
  assert.match(run(ALWAYS_CHECK, true, docs({ blocks: [{ text: "第一句。", type: "paragraph" }], text: "第一句。\n第二句没有块。" })).detail, /shown by no block: 第二句没有块/u);
  assert.match(run(ALWAYS_CHECK, true, docs({ blocks: [{ text: "共1场：", type: "paragraph" }, { items: [{ id: "event:e101", kind: "event", title: "东京街头摄影展" }], shown: 1, type: "records" }], text: "共1场：\n1. 另一场活动" })).detail, /the card 东京街头摄影展 is not in answer\.text/u);
  assert.equal(run(ALWAYS_CHECK, true, docs({ blocks: [{ text: "旧值。", type: "paragraph" }], text: "新值。" }, { text: "后一轮没有块。" })).status, "fail");
  // Small "mentioned" cards have no line of their own in the text; a note's entry is the text's sentence without the quote.
  const note = docs({ blocks: [{ text: "答了一半。", type: "paragraph" }, { caption: "提到的活动", items: [{ id: "event:e101", kind: "event", title: "不在文字里的名字" }], shown: 1, size: "mini", type: "records" }, { items: [{ action: "用 @ 选一场活动。", quote: "顺便找几场", text: "这次没有找。" }], title: "这次没做的部分", type: "note" }], text: "答了一半。\n\n「顺便找几场」：这次没有找。用 @ 选一场活动。" });
  assert.equal(run(ALWAYS_CHECK, true, note).status, "pass");
  // The runner adds it to every case, once, after the case's own checks.
  const results = runHardChecks({ hard: [{ answer_text_plain: true }] }, stale, context);
  assert.deepEqual(results.map((item) => [item.check, item.status]), [["answer_text_plain", "pass"], [ALWAYS_CHECK, "fail"]]);
  assert.equal(runHardChecks({ hard: [{ [ALWAYS_CHECK]: true }] }, obs(LIST, TEXT), context).filter((item) => item.check === ALWAYS_CHECK).length, 1);
});
