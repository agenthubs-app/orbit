import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";

import { agentLinkHref, agentRecordHref } from "../src/api/agent-v1-client";
import { answerBlocksOf } from "../src/api/compute/agent-answer-blocks";
import type { AgentAnswerBlockContract, AgentAnswerRecordContract, AgentResultDocument } from "../src/api/contract/agent-v1";
import { agentResultDocumentSchema } from "../src/api/schema/agent-v1";
import { AgentAnswerBlocks, AgentAnswerText } from "../src/screens/ai/cards/AgentAnswerBlocks";
import { AgentBasisLine } from "../src/screens/ai/cards/AgentConfirmationCard";
import { renderedText, renderToHtml } from "./helpers/render";

/**
 * agent-design AG19 on the App (approved visual draft 2026-11-19): the answer rendered from its blocks.
 *   - AG19-1: every listed record is one card that opens that record's page — all six kinds have one (build 18 opened
 *     notes, contacts and the to-do list only; events and schedule items could not be opened at all);
 *   - AG19-2: more than five: five cards and "还有 N 位";
 *   - AG19-3 / AG19-4: conclusion, points and the note are laid out here; no Markdown symbol is shown;
 *   - AG19-5: a record that is gone is not a link;
 *   - AG19-7: a document without blocks is still its text; a block type this build does not know is skipped.
 */
const none: ReadonlySet<string> = new Set();
const SIX: AgentAnswerRecordContract[] = [
  { eventKind: "platform", id: "event:e1", kind: "event", sub: "ザ 東京タワーズ シータワー", title: "第1回 中日创业交流会", top: "3月22日（周日）18:00" },
  { id: "contact:c46", kind: "contact", sub: "最近一次往来 8月12日（周三）", title: "王强", top: "青松物流 · 运营经理" },
  { id: "task:t44", kind: "todo", sub: "已过期2天", subTone: "late", title: "回复田中的询价", top: "截止 11月16日（周一）18:00" },
  { contactId: "contact:c30", id: "note:m31", kind: "memo", sub: "田中浩 · 想先试用三个月，再谈正式合同", title: "客户访谈", top: "11月10日（周二）" },
  { day: "2026-11-19", id: "schedule:s1", kind: "schedule", sub: "涩谷 Stream 3 楼", title: "和田中午餐", top: "11月19日（周四）12:00" },
  { day: "2026-10-25", eventId: "private_event:p1", eventKind: "private", id: "attendance:a1", kind: "attendance", sub: "自己记的 · 私人", title: "大学同学聚会", top: "10月25日（周日）" },
];
const blocksText = (blocks: AgentAnswerBlockContract[], gone: ReadonlySet<string> = none) => renderedText(<AgentAnswerBlocks blocks={blocks} gone={gone} language="zh" onOpenHref={() => {}} />);
const blocksHtml = (blocks: AgentAnswerBlockContract[], gone: ReadonlySet<string> = none) => renderToHtml(<AgentAnswerBlocks blocks={blocks} gone={gone} language="zh" onOpenHref={() => {}} />);

test("AG19-1: the App's link table — each of the six kinds opens that record's own page", () => {
  assert.deepEqual(SIX.map((record) => agentRecordHref(record)), [
    "/events/event%3Ae1",
    "/contacts/contact%3Ac46",
    "/tasks/task%3At44",
    "/notes/note%3Am31",
    "/schedule/personal/schedule%3As1",
    "/events?privateEvent=private_event%3Ap1&tab=going",
  ]);
  assert.equal(agentRecordHref({ eventId: "event:e7", eventKind: "platform", id: "attendance:a2", kind: "attendance" }), "/events/event%3Ae7");
  assert.equal(agentRecordHref({ eventKind: "private", id: "private_event:p2", kind: "event" }), "/events?privateEvent=private_event%3Ap2&tab=going");
  // The basis line's links use the same table: a to-do opens that one to-do (D3); events and schedule items open too.
  assert.equal(agentLinkHref({ id: "task:t42", label: "x", type: "todo" }), "/tasks/task%3At42");
  assert.equal(agentLinkHref({ id: "event:e1", label: "x", type: "event" }), "/events/event%3Ae1");
  assert.equal(agentLinkHref({ id: "schedule:s1", label: "x", type: "schedule" }), "/schedule/personal/schedule%3As1");
});

test("AG19-1: a list — the lead, then one card per record in order with its three lines; each card is a link", () => {
  const blocks: AgentAnswerBlockContract[] = [{ text: "共6条：", type: "paragraph" }, { items: SIX, lessLabel: "收起", moreLabel: "还有 1 条", shown: 5, type: "records" }];
  const text = blocksText(blocks);
  assert.ok(text.startsWith("共6条： 🥂 活动 3月22日（周日）18:00 第1回 中日创业交流会 ザ 東京タワーズ シータワー 王 联系人 青松物流 · 运营经理 王强 最近一次往来 8月12日（周三）"), text);
  for (const words of ["待办 截止 11月16日（周一）18:00 回复田中的询价 已过期2天", "笔记 11月10日（周二） 客户访谈 田中浩 · 想先试用三个月，再谈正式合同", "日程 11月19日（周四）12:00 和田中午餐 涩谷 Stream 3 楼"]) assert.ok(text.includes(words), words);
  // AG19-2: five first; the sixth is under "还有 1 条".
  assert.ok(text.endsWith("还有 1 条"), text);
  assert.ok(!text.includes("大学同学聚会"));
  const html = blocksHtml(blocks);
  assert.equal((html.match(/role="link"/gu) ?? []).length, 5);
  assert.match(html, /data-testid="answer-card-todo:task:t44"/u);
  assert.match(html, /data-testid="answer-more"/u);
});

test("AG19-3, AG19-4: conclusion, points with bold heads, small cards, the note below; no symbol", () => {
  const blocks: AgentAnswerBlockContract[] = [
    { text: "建议优先参加第1回，不必三场都去。", type: "conclusion" },
    { text: "三场是同一系列，重复参加边际收益递减。", type: "paragraph" },
    { items: [{ head: "第1回", text: "先去能判断质量。" }, { text: "第3回是下午场。" }], type: "points" },
    { caption: "提到的活动", items: [SIX[0]!], shown: 1, size: "mini", type: "records" },
    { items: [{ action: "用 @ 选一场活动，我可以读它的内容。", quote: "顺便找几场活动", text: "现在还不能这样找，所以这次没有找。" }], title: "这次没做的部分", type: "note" },
  ];
  const text = blocksText(blocks);
  assert.equal(text, "建议优先参加第1回，不必三场都去。 三场是同一系列，重复参加边际收益递减。 第1回 先去能判断质量。 第3回是下午场。 提到的活动 🥂 第1回 中日创业交流会 3月22日（周日）18:00 这次没做的部分 「顺便找几场活动」 现在还不能这样找，所以这次没有找。 用 @ 选一场活动，我可以读它的内容。");
  assert.doesNotMatch(text, /[*#`]/u);
  const html = blocksHtml(blocks);
  assert.ok(html.indexOf("answer-conclusion") < html.indexOf("answer-points") && html.indexOf("answer-points") < html.indexOf("answer-records-mini") && html.indexOf("answer-records-mini") < html.indexOf("answer-note"));
  assert.doesNotMatch(blocksHtml([{ text: "只有回答。", type: "paragraph" }]), /answer-note/u);
  // The cards are the entry: the basis line keeps its sentence and drops the small labels.
  const basis = { links: [{ id: "event:e1", label: "活动「第1回」", type: "event" as const }, { id: "event:e2", label: "活动「第2回」", type: "event" as const }], text: "按你的2条记录回答" };
  assert.equal(renderedText(<AgentBasisLine basis={basis} language="zh" onOpenHref={() => {}} cardsBelow />), "按你的2条记录回答");
  assert.ok(renderedText(<AgentBasisLine basis={basis} language="zh" onOpenHref={() => {}} />).includes("活动「第1回」"));
});

test("AG19-5: a record that is gone — the word 打不开了 and no link; the other card stays a link", () => {
  const blocks: AgentAnswerBlockContract[] = [{ items: SIX.slice(0, 2), shown: 2, type: "records" }];
  const text = blocksText(blocks, new Set(["event:event:e1"]));
  assert.ok(text.includes("活动 打不开了 第1回 中日创业交流会"), text);
  assert.ok(!text.includes("ザ 東京タワーズ"), "the place of a record that is gone is not shown");
  assert.equal((blocksHtml(blocks, new Set(["event:event:e1"])).match(/role="link"/gu) ?? []).length, 1);
  assert.equal((blocksHtml(blocks).match(/role="link"/gu) ?? []).length, 2);
});

test("AG19-7: an older document is its text; a block type this build does not know is skipped, the rest is shown", () => {
  const base = { partResults: [{ partId: "p1", status: "answered" }], requestId: "agreq_1", revision: 1, schemaVersion: 1, sessionId: "s1", status: "completed", updatedAt: "2026-11-19T00:00:00.000Z" };
  const old = agentResultDocumentSchema.parse({ ...base, answer: { sourceRefs: [], text: "三场活动：1. 第1回" } }) as AgentResultDocument;
  assert.equal(answerBlocksOf(old, false), null);
  assert.equal(renderedText(<AgentAnswerText text={old.answer!.text} />), "三场活动：1. 第1回");
  const newer = agentResultDocumentSchema.parse({ ...base, answer: { blocks: [{ text: "导语", type: "paragraph" }, { rows: [], type: "table" }, { items: [SIX[0]], shown: 1, type: "records" }], sourceRefs: [], text: "导语\n1. 第1回 中日创业交流会" } }) as AgentResultDocument;
  assert.deepEqual(answerBlocksOf(newer, false)?.map((block) => block.type), ["paragraph", "records"]);
});

test("the conversation screen renders a protocol-3 answer from its blocks and checks older cards once", () => {
  const source = readFileSync(new URL("../src/screens/ai/AiConversationScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /blocks \? <AgentAnswerBlocks blocks=\{blocks\} gone=\{gone\}/u);
  assert.match(source, /!running && !blocks && text \? <AgentAnswerText text=\{text\} \/>/u);
  assert.match(source, /useAgentAnswerGone\(client, v1\.documents, protocolV3\)/u);
  const events = readFileSync(new URL("../src/screens/events/v2/EventsHome.tsx", import.meta.url), "utf8");
  assert.match(events, /openPrivateId=\{typeof params\.privateEvent === "string" \? params\.privateEvent : undefined\}/u);
});
