/**
 * agent-design AG17-3 (approved visual draft, boards 5, 6, 9, 10): the confirm page of a proposal an outside assistant
 * made, in each state — waiting (who and until when above the AG07 card, two small lines under it), expired after
 * 24 hours (no «重新生成»), already confirmed, disconnected, declined — and the page for another account or a mistyped
 * link, which says nothing about the proposal. Confirming goes to the ledger's decision interface with this session.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";

import { ProposalConfirmPage } from "../../app/(app)/app/orbit-2026/agent-connections/ProposalConfirm";
import type { AgentActionPreviewContract, AgentProposalViewContract } from "../../shared/contract/agent-v1";

(globalThis as { self?: unknown }).self ??= globalThis;

const card = (overrides: Partial<AgentActionPreviewContract> = {}): AgentActionPreviewContract => ({
  actionId: "card:mcp:abc",
  expiresAt: "2026-11-21T05:20:00.000Z",
  locale: "zh",
  operations: [
    { after: { dueAt: "2026-11-25" }, before: { dueAt: "2026-11-20" }, capability: "todo.update", display: { change: "update", record: "待办「整理十一月的客户访谈要点」", rows: [{ after: "11月25日（周三） 23:59", before: "11月20日（周五） 23:59", field: "dueAt", label: "截止时间" }] }, operationId: "op1", status: "pending", text: "line 1" },
    { after: {}, capability: "todo.create", display: { change: "create", record: "待办「准备下周的报价单」", rows: [{ after: "11月27日（周五） 23:59", field: "dueAt", label: "截止时间" }] }, operationId: "op2", status: "pending", text: "line 2" },
  ],
  origin: { connectionId: "conn_1", externalRequestKey: "k", kind: "connection" },
  payloadHash: "h1",
  revision: 1,
  revisions: [],
  status: "awaiting_confirmation",
  summary: "s",
  title: "修改1项，新增1项",
  updatedAt: "2026-11-20T05:20:00.000Z",
  ...overrides,
});
const view = (overrides: Partial<AgentActionPreviewContract> = {}): AgentProposalViewContract => ({ card: card(overrides), clientName: "Claude", createdAt: "2026-11-20T05:20:00.000Z", proposalId: "prop_abcdefghijklmnopqrstuvwxyz" });
const textOf = (html: string) => html.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const page = (initial: Parameters<typeof ProposalConfirmPage>[0]["initial"]) => textOf(renderToStaticMarkup(<ProposalConfirmPage initial={initial} />));
const INTERNAL = /授权|范围|令牌|scope|token|MCP|来源|证据|CARD_[A-Z_]+|prop_|conn_|card:mcp/iu;

test("waiting: «Claude 想改 2 项», the card unchanged with both buttons, the two lines under it", () => {
  const text = page({ kind: "found", view: view() });
  for (const words of ["确认修改", "Claude 想改 2 项", "等你确认", "修改1项，新增1项", "待办「整理十一月的客户访谈要点」", "确认以上2项", "不改了", "点确认之前，什么都不会改。", "确认之后，Claude 只知道「改好了」还是「没改」。", "不认识这条修改？点「不改了」，再到「设置 › 外部 AI 助手」断开 Claude。"]) assert.ok(text.includes(words), words);
  assert.doesNotMatch(text, INTERNAL);
});

test("expired after 24 hours: says so, says nothing was changed and that the assistant has to propose again; no «重新生成», nothing to press", () => {
  const html = renderToStaticMarkup(<ProposalConfirmPage initial={{ kind: "found", view: view({ status: "expired" }) }} />);
  const text = textOf(html);
  for (const words of ["这条修改已经过期", "过了 24 小时，不能再确认", "什么都没改。还想改的话，回到 Claude 让它重新提一次。"]) assert.ok(text.includes(words), words);
  assert.doesNotMatch(text, /重新生成|确认以上|不改了/u);
  assert.doesNotMatch(text, INTERNAL);
});

test("already confirmed, disconnected, declined: one sentence each above the card in its own state", () => {
  const done = page({ kind: "found", view: view({ status: "completed", operations: card().operations.map((op) => ({ ...op, status: "succeeded" })) }) });
  assert.ok(done.includes("已经改好了") && done.includes("再点一次也不会重复改。Claude 那边会看到「已完成」。"), done);
  const revoked = page({ kind: "found", view: view({ status: "canceled" }) });
  assert.ok(revoked.includes("这条修改已经作废") && revoked.includes("它提了还没确认的修改一起作废，什么都没改。"), revoked);
  const rejected = page({ kind: "found", view: view({ status: "rejected" }) });
  assert.ok(rejected.includes("你选了不改") && rejected.includes("这条修改已经关掉") && rejected.includes("什么都没改。"), rejected);
  for (const text of [done, revoked, rejected]) assert.doesNotMatch(text, /确认以上2项|重新生成/u);
});

test("another account, or a mistyped link: the same page, not one word about the proposal (D7)", () => {
  const text = page({ account: { email: "agent-eval-b@orbit.test", name: "测试用户乙" }, kind: "not_here" });
  assert.ok(text.includes("这个账号里没有这条修改"));
  assert.ok(text.includes("你现在登录的是「测试用户乙」。如果链接是你的 AI 助手给的，换成当时连它的那个账号再打开。"));
  assert.ok(text.includes("换个账号") && text.includes("回首页"));
  assert.doesNotMatch(text, /Claude|待办|修改1项|确认以上/u, "no client name, no record, no card");
});

test("confirming: the ledger's decision interface with the card's revision and hash; the page then shows the result", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body ?? "{}")), url: String(url) });
    return new Response(JSON.stringify({ data: { card: card({ operations: card().operations.map((op) => ({ ...op, status: "succeeded" })), revision: 1, status: "completed" }) }, success: true }), { headers: { "content-type": "application/json" }, status: 200 });
  }) as typeof fetch;
  try {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<ProposalConfirmPage initial={{ kind: "found", view: view() }} />); });
    const confirm = renderer.root.find((node) => node.type === "button" && node.props["data-orbit-agent-card-confirm"] !== undefined);
    await act(async () => { await confirm.props.onClick(); });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/agent/ledger/card%3Amcp%3Aabc/transition");
    assert.equal(calls[0].body.transition, "confirm");
    assert.equal(calls[0].body.payloadHash, "h1");
    assert.equal(calls[0].body.revision, 1);
    const shown = JSON.stringify(renderer.toJSON());
    assert.ok(shown.includes("已经改好了"), "the header follows the card's new state");
  } finally {
    globalThis.fetch = original;
  }
});
