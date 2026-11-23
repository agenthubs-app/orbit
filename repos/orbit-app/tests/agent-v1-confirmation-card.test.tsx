import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import type { AgentActionPreviewContract, AgentResultDocument } from "../src/api/contract/agent-v1";
import { AgentBasisLine, AgentConfirmationCard, AgentProgress, AgentQuestionOptions, answerTextOf } from "../src/screens/ai/cards/AgentConfirmationCard";
import { renderedText } from "./helpers/render";

/**
 * agent-design AG07-1 / AG07-2 / AG07-5 on the App: the same card as the web, from the same preview — the count
 * sentence, each item's record and values as the server wrote them, the fixed words of the card's language; no date is
 * formatted here; a closed or expired card shows its state; offline only the count; no internal words.
 */
const preview = (overrides: Partial<AgentActionPreviewContract> = {}): AgentActionPreviewContract => ({
  actionId: "card1",
  locale: "zh",
  operations: [
    { after: { plannedDate: "2026-11-20" }, before: { plannedDate: "2026-11-18" }, capability: "todo.update", display: { change: "update", record: "待办「给小林发修订报价」", rows: [{ after: "11月20日（周五）", before: "11月18日（周三）", field: "plannedDate", label: "计划日期" }] }, operationId: "card1:op1", status: "pending", target: { collection: "tasks", id: "task:t42" }, text: "line 1" },
    { after: {}, capability: "memo.create", display: { change: "create", record: "笔记「小林今天来过电话」", rows: [{ after: "小林健", field: "interaction.actualContactIds", label: "往来对象" }] }, operationId: "card1:op2", status: "pending", text: "line 2" },
  ],
  payloadHash: "h1",
  revision: 1,
  revisions: [],
  status: "awaiting_confirmation",
  summary: "s",
  title: "修改1项，新增1项",
  updatedAt: "2026-11-15T01:00:00.000Z",
  ...overrides,
});
const noop = async () => true;
const card = (overrides: Partial<AgentActionPreviewContract> = {}, extra: { online?: boolean; pendingTargets?: string[] } = {}) => renderedText(<AgentConfirmationCard card={preview(overrides)} language="zh" online={extra.online ?? true} pendingTargets={extra.pendingTargets ?? []} onDecide={noop} onRegenerate={noop} />);

test("the waiting card reads word for word as the preview and the fixed words say", () => {
  const text = card();
  for (const words of ["等你确认", "修改1项，新增1项", "改", "待办「给小林发修订报价」", "计划日期", "11月18日（周三）", "11月20日（周五）", "新增", "笔记「小林今天来过电话」", "往来对象", "小林健", "确认以上2项", "不改了", "点确认之前，什么都不会改。"]) assert.ok(text.includes(words), words);
  assert.doesNotMatch(text, /操作|载荷|版本|证据|来源|CARD_|payloadHash/u);
});

test("a field the preview does not have is not on the card (the App formats no date)", () => {
  const base = preview();
  const text = renderedText(<AgentConfirmationCard card={preview({ operations: [{ ...base.operations[0]!, display: { ...base.operations[0]!.display!, rows: [] } }] })} language="zh" online pendingTargets={[]} onDecide={noop} onRegenerate={noop} />);
  assert.doesNotMatch(text, /计划日期|11月|2026-11/u);
});

test("the states the web shows: done, canceled (rejected), expired with the question; Japanese card words", () => {
  const done = card({ operations: preview().operations.map((op) => ({ ...op, status: "succeeded" as const })), status: "completed" });
  assert.ok(done.includes("已完成") && done.includes("已改") && done.includes("已新增") && !done.includes("确认以上"));
  const rejected = card({ status: "rejected" });
  assert.ok(rejected.includes("已取消") && rejected.includes("没有改任何记录。"));
  const expired = card({ status: "expired" });
  assert.ok(expired.includes("这张卡放太久了，要重新生成一张吗？") && expired.includes("重新生成"));
  const ja = card({ locale: "ja", title: "変更 1 件、追加 1 件" });
  assert.ok(ja.includes("以上 2 件を確定") && ja.includes("変更しない") && !ja.includes("不改了"));
});

test("offline: only the count; an unsynced edit: confirm says sync first", () => {
  assert.equal(card({}, { online: false }).replace(/\s+/gu, ""), "有1份待确认的修改联网后才能确认");
  const held = card({}, { pendingTargets: ["tasks:task:t42"] });
  assert.ok(held.includes("先同步你的修改") && held.includes("这条待办你在手机上改过，还没同步"));
});

test("the basis line, the options, progress and the answer without its card line", () => {
  assert.ok(renderedText(<AgentBasisLine basis={{ links: [{ id: "note:m31", label: "11月12日的笔记", type: "memo" }], text: "按你11月12日记的笔记回答" }} language="zh" onOpenHref={() => {}} />).includes("按你11月12日记的笔记回答"));
  const options = renderedText(<AgentQuestionOptions clarifications={[{ clarificationId: "q1", kind: "question", options: [{ capability: "contact.read", label: "小林健（北辰软件）", optionId: "o1" }], partId: "p1", state: "open" }]} language="zh" disabled={false} onSelect={() => {}} />);
  assert.ok(options.includes("小林健（北辰软件）") && options.includes("也可以直接打字回答。"));
  assert.ok(renderedText(<AgentProgress language="zh" queued />).includes("已收到，等前一条处理完"));
  assert.ok(renderedText(<AgentProgress language="en" queued={false} />).includes("Putting the answer together…"));
  const document = { answer: { cardLine: "确认卡（修改1项）：\n① …", sourceRefs: [], text: "你们聊了报价初稿。\n\n确认卡（修改1项）：\n① …" } } as unknown as AgentResultDocument;
  assert.equal(answerTextOf(document, true), "你们聊了报价初稿。");
});

test("coordinator note: with a basis line the notes footnote is not shown again; without one it stays", () => {
  const basis = { links: [{ id: "note:m31", label: "11月12日のメモ", type: "memo" as const }], text: "11月12日のメモをもとに回答" };
  const withBasis = { answer: { basis, sourceRefs: [], text: "見積もりの初稿について話しました。（メモの内容からです。）" } } as unknown as AgentResultDocument;
  assert.equal(answerTextOf(withBasis, false), "見積もりの初稿について話しました。");
  const noBasis = { answer: { sourceRefs: [], text: "你们聊了报价初稿。（以上出自你的笔记。）" } } as unknown as AgentResultDocument;
  assert.equal(answerTextOf(noBasis, false), "你们聊了报价初稿。（以上出自你的笔记。）");
});
