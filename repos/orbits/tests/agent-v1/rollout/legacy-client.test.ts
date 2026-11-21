import assert from "node:assert/strict";
import test from "node:test";

import { createEntityDraftRouteHandlers } from "../../../app/api/ai/entity-drafts/handler";
import type { EntityDraft } from "../../../features/orbit-ai/entity-drafts/contract";
import { createEntityDraftService, type EntityDraftRepository } from "../../../features/orbit-ai/entity-drafts/service";
import { handleCardDecision } from "../../../features/agent/ledger/card-routes";
import { runWithConfirmBoundary } from "../../../features/agent-v1/entry/confirm-boundary";
import { settleSession, type AgentEntryDependencies, type AgentEntryExecuteResult } from "../../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../../features/agent-v1/entry/store";
import { withholdRevokedAnswers, withholdRevokedDocument, withheldAnswerText } from "../../../features/agent-v1/rollout/history-access";
import { closeLegacyWrites, handleLegacyClientSend, legacyAnswerText, legacyStaysOnOldPath, type LegacyClientDeps } from "../../../features/agent-v1/rollout/legacy-client";
import { legacyDecisionRefusal } from "../../../features/agent-v1/rollout/legacy-words";
import { reliableAiSendReceiptSchema } from "../../../shared/api-schema/ai-sessions";
import type { AgentActionPreviewContract, AgentResultDocument } from "../../../shared/contract/agent-v1";
import { createCardKit, freeze } from "../../services/agent-ledger-card-kit";

/**
 * agent-design AG18-1: old clients on the new flow. Protocol 2 and unversioned messages are answered by the new entry,
 * waited for in the same call and returned in the old shape; a card becomes words and a pointer to the new App or the
 * web; typing "确认" writes nothing; old buttons (draft confirm, old accept, old transition) cannot approve what the user
 * has not seen in its current version; history hides answers made from records gone or withdrawn.
 */

const ACTOR = "actor:old-app";

function oldBody(overrides: Record<string, unknown> = {}) {
  return { clientMessageId: "message:old-1", expectedMessageRevision: 0, locale: "zh", message: "我还有哪些没做完的待办？", protocolVersion: 2, references: [], requestId: "request:old-1", sessionId: "session:old", ...overrides };
}

const CARD: AgentActionPreviewContract = {
  actionId: "action:agent-v1:x",
  locale: "zh",
  operations: [{ after: { plannedDate: "2026-11-20" }, capability: "todo.update", operationId: "op1", status: "pending", text: "待办「给小林发修订报价」：计划日 11月18日（周三） → 11月20日（周五）" }],
  payloadHash: "h",
  revision: 1,
  revisions: [],
  status: "awaiting_confirmation",
  summary: "",
  title: "修改1项",
  updatedAt: "2026-11-15T01:00:00.000Z",
};

function legacyDeps(execute: AgentEntryDependencies["execute"], extra: Partial<LegacyClientDeps> = {}): LegacyClientDeps & { calls: number } {
  const counted = { calls: 0 };
  const entry: AgentEntryDependencies = {
    execute: async (input) => {
      counted.calls += 1;
      return execute(input);
    },
    schedule: (task) => { void task(); },
    store: createMemoryAgentEntryStore(),
  };
  return Object.assign(counted, { entry, messageRevision: async () => 4, pollMs: 5, ...extra });
}

const asData = (body: Record<string, unknown>) => (body as { data: Record<string, any> }).data;

test("protocol 2: the same call returns the whole answer in the old shape, with the protocol-2 receipt", async () => {
  const deps = legacyDeps(async (): Promise<AgentEntryExecuteResult> => ({ sourceRefs: ["todo:task:t42"], text: "你有 5 项还没完成的待办。" }));
  const result = await handleLegacyClientSend({ actorId: ACTOR, body: oldBody(), deps, mode: "live" });
  assert.equal(result.status, 200);
  const data = asData(result.body);
  assert.equal(data.state, "success");
  assert.equal(data.assistantMessage, "你有 5 项还没完成的待办。");
  assert.equal(data.activeConversationId, "session:old");
  assert.deepEqual(data.messages.map((message: { role: string }) => message.role), ["user", "assistant"]);
  assert.equal(data.messages[0].content, "我还有哪些没做完的待办？");
  assert.ok(data.conversations.some((item: { conversationId: string }) => item.conversationId === data.activeConversationId));
  assert.deepEqual(data.provenance.evidenceIds, ["task:t42"]);
  const receipt = reliableAiSendReceiptSchema.parse(data.reliableSend);
  assert.deepEqual([receipt.state, receipt.requestId, receipt.protocolVersion, receipt.messageRevision], ["completed", "request:old-1", 2, 4]);
  // The same old request asked again is the same new request: no second run.
  const again = await handleLegacyClientSend({ actorId: ACTOR, body: oldBody(), deps, mode: "live" });
  assert.equal(asData(again.body).reliableSend.replayed, true);
  assert.equal(deps.calls, 1);
});

test("a card is shown to the old client as words and a pointer to the new App or the web; no field it does not know", async () => {
  const deps = legacyDeps(async () => ({ actionPreview: CARD, cardLine: "确认卡（修改1项）", sourceRefs: [], text: "确认卡（修改1项）" }));
  const result = await handleLegacyClientSend({ actorId: ACTOR, body: oldBody({ message: "把给小林发修订报价这条待办改到周五。" }), deps, mode: "live" });
  const data = asData(result.body);
  assert.match(data.assistantMessage, /计划日 11月18日（周三） → 11月20日（周五）/u);
  assert.match(data.assistantMessage, /新版 App 或网页/u);
  assert.match(data.assistantMessage, /回复“确认”不会改任何内容/u);
  for (const key of ["actionPreview", "actionIds", "entityDraft", "taskInteraction", "agentRequest", "blocks"]) assert.equal(key in data, false, key);
});

test("not done within the wait: 202 with the old receipt; asked again with the same request, the answer", async () => {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => { release = resolve; });
  const deps = legacyDeps(async () => {
    await opened;
    return { sourceRefs: [], text: "好的。" };
  }, { waitMs: 30 });
  const pending = await handleLegacyClientSend({ actorId: ACTOR, body: oldBody(), deps, mode: "live" });
  assert.equal(pending.status, 202);
  assert.equal(asData(pending.body).reliableSend.state, "pending");
  release();
  await settleSession(ACTOR, "session:old");
  const done = await handleLegacyClientSend({ actorId: ACTOR, body: oldBody(), deps: { ...deps, waitMs: 1000 }, mode: "live" });
  assert.equal(done.status, 200);
  assert.equal(asData(done.body).assistantMessage, "好的。");
  assert.equal(deps.calls, 1);
});

test("unversioned: the new flow answers too, in one call, with no receipt; an invalid protocol-2 body is refused", async () => {
  const deps = legacyDeps(async () => ({ sourceRefs: [], text: "你好。" }));
  const result = await handleLegacyClientSend({ actorId: ACTOR, body: { message: "你好" }, deps, mode: "live" });
  assert.equal(result.status, 200);
  assert.equal(asData(result.body).assistantMessage, "你好。");
  assert.equal("reliableSend" in asData(result.body), false);
  const invalid = await handleLegacyClientSend({ actorId: ACTOR, body: { message: "x", protocolVersion: 2 }, deps, mode: "live" });
  assert.equal(invalid.status, 400);
  assert.equal(legacyStaysOnOldPath({ origin: { entryPointId: "contacts.analysis" } }), true);
  assert.equal(legacyStaysOnOldPath(oldBody()), false);
});

test("typing 确认 on the old client while a card waits writes nothing (the new entry's boundary decides nothing)", async () => {
  const kit = createCardKit();
  const task = await kit.todo("给小林发修订报价", "2026-11-18");
  await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: task.id }] as never);
  // The kit's cards are in the conversation session:test; the old client sends in that session.
  const deps = legacyDeps(async (input) => {
    const boundary = await runWithConfirmBoundary({ now: kit.now, runtime: kit.runtime }, { locale: "zh", message: input.input.message, requestId: input.requestId, run: async () => ({ reply: "（模型）", sourceRefs: [] }), sessionId: input.sessionId });
    return { ...(boundary.actionPreview ? { actionPreview: boundary.actionPreview } : {}), sourceRefs: [], text: boundary.text };
  });
  const result = await handleLegacyClientSend({ actorId: ACTOR, body: oldBody({ message: "确认", requestId: "request:typed", sessionId: "session:test" }), deps, mode: "live" });
  const text = asData(result.body).assistantMessage as string;
  assert.doesNotMatch(text, /已修改|已完成|已更新/u);
  assert.match(text, /新版 App 或网页/u);
  assert.equal(kit.executorCalls.length, 0);
  assert.equal((await kit.tasks.get({ actorId: "user_agent_ledger_a", taskId: task.id }))?.plannedDate, "2026-11-18");
});

test("the old pipeline kept for contacts analysis: what it would write is dropped, the reply says where to ask", () => {
  const closed = closeLegacyWrites({ data: { assistantMessage: "分析完成。", proposedActionRequests: [{ arguments: { title: "x" }, capabilityId: "followups.createTask" }], taskInteraction: { state: "created", title: "x" } }, success: true }, "zh");
  const data = closed.data as Record<string, unknown>;
  assert.equal("proposedActionRequests" in data, false);
  assert.equal("taskInteraction" in data, false);
  assert.match(String(data.assistantMessage), /没有修改任何内容/u);
  const plain = closeLegacyWrites({ data: { assistantMessage: "分析完成。" }, success: true }, "zh");
  assert.equal((plain.data as Record<string, unknown>).assistantMessage, "分析完成。");
});

test("old buttons: a draft card is not confirmed while the new entry is on; old accept never decides a card with an origin", async () => {
  const rows = new Map<string, EntityDraft>();
  const repository: EntityDraftRepository = {
    async findPending({ actorId, conversationId }) { return [...rows.values()].find((draft) => draft.actorId === actorId && draft.conversationId === conversationId && draft.state === "pending_confirmation") ?? null; },
    async get({ actorId, draftId }) { const draft = rows.get(draftId); return draft && draft.actorId === actorId ? draft : null; },
    async save(draft) { rows.set(draft.draftId, draft); },
  };
  const writes: string[] = [];
  const service = createEntityDraftService({ adapters: [{ kind: "task", async write({ idempotencyKey }) { writes.push(idempotencyKey); return { recordId: "task:1" }; } }], repository });
  await service.propose({ actorId: ACTOR, conversationId: "c", draftId: "draft:1", now: "2026-11-15T00:00:00.000Z", proposal: { fields: { title: "跟进林玫" }, kind: "task", sourceRefs: [] } });
  const handlers = createEntityDraftRouteHandlers({ resolveActor: async () => ({ id: ACTOR, workspaceId: "w" }) as never, serviceFor: () => service });
  const before = process.env.ORBIT_AGENT_V1_MODE;
  process.env.ORBIT_AGENT_V1_MODE = "on";
  try {
    const response = await handlers.POST(new Request("https://orbit.test/api/ai/entity-drafts/draft:1", { body: JSON.stringify({ action: "confirm" }), headers: { "content-type": "application/json" }, method: "POST" }), "draft:1");
    assert.equal(response.status, 409);
    const body = await response.json() as { error: { message: string } };
    assert.match(body.error.message, /新版 App 或网页/u);
    // The draft is still readable, not written.
    assert.equal(writes.length, 0);
    assert.equal((await service.pending({ actorId: ACTOR, conversationId: "c" }))?.state, "pending_confirmation");
  } finally {
    if (before === undefined) delete process.env.ORBIT_AGENT_V1_MODE;
    else process.env.ORBIT_AGENT_V1_MODE = before;
  }
  assert.equal(legacyDecisionRefusal({ decision: "accept", entryOn: false, hasOrigin: true, paused: false }), true);
  assert.equal(legacyDecisionRefusal({ decision: "dismiss", entryOn: true, hasOrigin: true, paused: false }), true);
  assert.equal(legacyDecisionRefusal({ decision: "accept", entryOn: true, hasOrigin: false, paused: false }), true);
  assert.equal(legacyDecisionRefusal({ decision: "dismiss", entryOn: true, hasOrigin: false, paused: false }), false);
  assert.equal(legacyDecisionRefusal({ decision: "accept", entryOn: false, hasOrigin: false, paused: false }), false);
});

test("old transition: a card with an origin takes no decision without revision and hash (the old App's defer)", async () => {
  const kit = createCardKit();
  const task = await kit.todo("给李薇寄样片", "2026-11-10");
  const card = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-21" }, targetId: task.id }] as never);
  for (const body of [{}, { transition: "defer" }, { transition: "confirm" }]) {
    const decided = await handleCardDecision({ actionId: card.actionId, body, processNow: true, runtime: kit.runtime, workerId: "test" });
    assert.equal(decided.status, 400, JSON.stringify(body));
  }
  assert.equal(kit.executorCalls.length, 0);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "awaiting_confirmation");
});

test("history: an answer made from a record deleted or withdrawn is not returned, in the session or the result document", async () => {
  const visible = async (refs: readonly string[]) => new Set(refs.filter((ref) => ref !== "memo:note:gone"));
  const session = { id: "s", messages: [
    { role: "user", text: "上次和小林聊了什么？" },
    { recordRefs: ["memo:note:gone", "contact:contact:c17"], role: "assistant", text: "小林说实施费单列。" },
    { recordRefs: ["contact:contact:c17", "web:https://example.test"], role: "assistant", text: "小林在甲方公司。" },
  ] };
  const { session: shown, withheld } = await withholdRevokedAnswers(session, visible);
  assert.equal(withheld, 1);
  assert.equal(shown.messages[1].text, withheldAnswerText("zh"));
  assert.equal("recordRefs" in shown.messages[1], false);
  assert.equal(shown.messages[2].text, "小林在甲方公司。");
  const document = { answer: { sourceRefs: ["memo:note:gone"], text: "小林说实施费单列。" }, partResults: [], requestId: "r", revision: 1, schemaVersion: 1, sessionId: "s", status: "completed", updatedAt: "x" } as AgentResultDocument;
  assert.equal((await withholdRevokedDocument(document, visible)).answer?.text, withheldAnswerText("zh"));
  assert.equal(legacyAnswerText({ ...document, answer: { sourceRefs: [], text: "好" } }, "zh"), "好");
});
