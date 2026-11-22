import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { conversationCardId, isBareTypedConfirmation, runWithConfirmBoundary, type LegacyTurn } from "../../features/agent-v1/entry/confirm-boundary";
import { validateGeminiOrbitAgentPlannerOutput } from "../../features/orbit-ai/gemini-provider";
import { createCardKit, freeze } from "./agent-ledger-card-kit";

/**
 * agent-design AG02-2 on the new entry: an explicit new to-do becomes a ledger card (never a direct
 * write, never a stored draft); typed "确认" / "好的" / "OKです" while a card waits get a fixed
 * reminder and record no decision; approval flags and account ids in a model's output are removed
 * and reported; other record kinds get no card and a fixed sentence.
 */

function captureTrace() {
  const events: Record<string, unknown>[] = [];
  const holder = globalThis as { __orbitAgentEval?: unknown };
  const previous = holder.__orbitAgentEval;
  holder.__orbitAgentEval = { emit: (event: Record<string, unknown>) => events.push(event) };
  return { events, restore: () => { holder.__orbitAgentEval = previous; } };
}

const SESSION = "session:boundary";

function turnOf(turn: Partial<LegacyTurn>): () => Promise<LegacyTurn> {
  return async () => ({ reply: "我准备了一张卡片。", sourceRefs: [], ...turn });
}

test("the new entry never calls the direct to-do write or the typed draft confirmation", () => {
  const dir = path.join(process.cwd(), "features/agent-v1/entry");
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
    const source = fs.readFileSync(path.join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, "");
    for (const forbidden of ["applyTaskInteraction", "applyEntityDraft", "createOrbitAiTaskInteractionService", "createConfiguredOrbitAiTaskInteractionService", "createConfiguredEntityDraftService", "persistNaturalLanguageActionProposals"]) {
      assert.equal(source.includes(forbidden), false, `${file} must not use ${forbidden}`);
    }
  }
});

test("an explicit new to-do becomes one ledger card of this request; nothing is written", async () => {
  const kit = createCardKit();
  const requestId = "agreq_newtodo";
  const result = await runWithConfirmBoundary({ now: kit.now, runtime: kit.runtime }, {
    locale: "zh",
    message: "新建一条待办，标题叫「续订域名」",
    requestId,
    run: turnOf({ actionRequests: [{ arguments: { title: "续订域名" }, capabilityId: "followups.createTask", requiresUserConfirmation: true }], entityDraft: { fields: { title: "续订域名" }, kind: "task" } }),
    sessionId: SESSION,
  });
  assert.equal(result.actionPreview?.actionId, conversationCardId(requestId));
  assert.equal(result.actionPreview?.status, "awaiting_confirmation");
  assert.deepEqual(result.actionPreview?.operations.map((op) => [op.capability, op.after.title]), [["todo.create", "续订域名"]]);
  assert.deepEqual(result.actionPreview?.origin, { conversationId: SESSION, kind: "conversation", requestId });
  assert.match(result.text, /确认卡：新增待办「续订域名」。点卡上的「确认以上1项」后才会执行。/u);
  assert.equal((await kit.listTasks()).length, 0, "no direct write");
  assert.equal(kit.executorCalls.length, 0);
  // The same request again (a resend or a takeover) keeps the one card.
  const again = await runWithConfirmBoundary({ now: kit.now, runtime: kit.runtime }, { locale: "zh", message: "新建一条待办，标题叫「续订域名」", requestId, run: turnOf({ actionRequests: [{ arguments: { title: "续订域名" }, capabilityId: "followups.createTask", requiresUserConfirmation: true }] }), sessionId: SESSION });
  assert.equal(again.actionPreview?.actionId, result.actionPreview?.actionId);
  assert.equal((await kit.runtime.listActions()).length, 1);
});

test("typed 确认 / 好的 / OKです while a card waits: a fixed reminder, no model call, no decision", async () => {
  const kit = createCardKit();
  const card = await freeze(kit, [{ capability: "todo.create", set: { title: "交停车费" } }]);
  const actionWithSession = { ...card, origin: { conversationId: SESSION, kind: "conversation" as const, requestId: "agreq_first" } };
  await kit.repository.saveAction(actionWithSession);
  const trace = captureTrace();
  try {
    for (const [message, locale, reminder] of [["确认", "zh", /请点卡上的「确认以上1项」/u], ["好的", "zh", /请点卡上的「确认以上1项」/u], ["OKです", "ja", /カードの「以上 1 件を確定」を押してください/u], ["OK", "en", /press "Confirm this change" on the card/u]] as const) {
      let modelCalls = 0;
      const result = await runWithConfirmBoundary({ now: kit.now, runtime: kit.runtime }, { locale, message, requestId: `agreq_${message}`, run: async () => { modelCalls += 1; return { reply: "已修改", sourceRefs: [] }; }, sessionId: SESSION });
      assert.equal(result.modelCalled, false, message);
      assert.equal(modelCalls, 0, message);
      assert.match(result.text, reminder, message);
      assert.doesNotMatch(result.text, /已修改|已创建/u);
      assert.equal(result.actionPreview?.actionId, card.actionId);
    }
  } finally {
    trace.restore();
  }
  assert.equal(trace.events.filter((event) => event.type === "entry.typed_confirmation" && event.decided === false).length, 4);
  assert.equal(trace.events.filter((event) => event.type === "card.decision").length, 0);
  const stored = await kit.runtime.getAction(card.actionId);
  assert.equal(stored?.status, "awaiting_confirmation");
  assert.equal((await kit.runtime.getRun(card.runId))?.outbox.length, 0);
  assert.equal(await kit.repository.getDecision!(card.actionId, "anything"), null);
  assert.equal(isBareTypedConfirmation("やっぱりさっきの内容で進めてください。OKです。"), false, "a longer message is not a bare confirmation");
});

test("approval flags and account ids in a model's output are removed and reported", () => {
  const trace = captureTrace();
  let plan;
  try {
    plan = validateGeminiOrbitAgentPlannerOutput({
      accountId: "user_agent_eval_b",
      actionRequests: [{ accountId: "user_agent_eval_b", approved: true, arguments: { title: "续订域名" }, capabilityId: "followups.createTask", requiresUserConfirmation: true }],
      approved: true,
      assistantMessage: "我准备了一张待办卡片，请确认。",
      entityDraft: { approved: true, fields: { title: "续订域名" }, kind: "task", sourceRefs: [] },
      intent: "action_proposal",
      toolRequests: [],
    });
  } finally {
    trace.restore();
  }
  assert.ok(plan, "the plan is still valid without the claims");
  assert.equal(JSON.stringify(plan).includes("approved"), false);
  assert.equal(JSON.stringify(plan).includes("user_agent_eval_b"), false);
  const rejected = trace.events.find((event) => event.type === "model.approval_claims_rejected");
  assert.ok(rejected);
  assert.deepEqual((rejected!.found as string[]).sort(), ["$.accountId", "$.actionRequests[0].accountId", "$.actionRequests[0].approved", "$.approved", "$.entityDraft.approved"]);
});

test("a card is owned by the authenticated account even when the proposal names another", async () => {
  const kit = createCardKit();
  const trace = captureTrace();
  let result;
  try {
    result = await runWithConfirmBoundary({ now: kit.now, runtime: kit.runtime }, {
      locale: "zh",
      message: "新建一条待办，标题叫「寄出合同原件」",
      requestId: "agreq_owner",
      run: turnOf({ actionRequests: [{ accountId: "user_agent_eval_b", approved: true, arguments: { title: "寄出合同原件" }, capabilityId: "followups.createTask", requiresUserConfirmation: true } as never] }),
      sessionId: SESSION,
    });
  } finally {
    trace.restore();
  }
  assert.equal(result.actionPreview?.status, "awaiting_confirmation", "no approval from the model");
  const stored = await kit.runtime.getAction(result.actionPreview!.actionId);
  assert.equal(JSON.stringify(stored).includes("user_agent_eval_b"), false);
  assert.equal(stored?.approvedAt, undefined);
  assert.ok(trace.events.some((event) => event.type === "model.approval_claims_rejected"));
});

test("a note, schedule or event draft gets no card here, and a fixed sentence says so", async () => {
  const kit = createCardKit();
  const result = await runWithConfirmBoundary({ now: kit.now, runtime: kit.runtime }, { locale: "zh", message: "记一条笔记：今天和小林通了电话", requestId: "agreq_note", run: turnOf({ entityDraft: { fields: { title: "和小林通电话" }, kind: "note" } }), sessionId: SESSION });
  assert.equal(result.actionPreview, undefined);
  assert.match(result.text, /这类记录（笔记）现在还不能在这里保存，什么都没有保存。/u);
  assert.doesNotMatch(result.text, /确认卡/u, "AG06: a turn without a card does not talk about cards");
  assert.equal((await kit.runtime.listActions()).length, 0);
});

test("agreeing in words to a rejected card: a fixed sentence says it cannot run any more; nothing is written", async () => {
  const kit = createCardKit();
  const card = await freeze(kit, [{ capability: "todo.create", set: { title: "見積書のドラフトを見直す" } }], undefined, "ja");
  const withSession = { ...card, origin: { conversationId: SESSION, kind: "conversation" as const, requestId: "agreq_first" } };
  await kit.repository.saveAction(withSession);
  await kit.runtime.decideAction!({ actionId: card.actionId, clientDecisionId: "reject", decision: "reject", payloadHash: card.payloadHash!, revision: 1 });
  const result = await runWithConfirmBoundary({ now: kit.now, runtime: kit.runtime }, { locale: "ja", message: "やっぱりさっきの内容で進めてください。OKです。", requestId: "agreq_after_reject", run: turnOf({ reply: "承知しました。" }), sessionId: SESSION });
  assert.match(result.text, /先ほどのカードは却下済みのため、実行できません/u);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "rejected");
  assert.equal((await kit.listTasks()).length, 0);
});

test("a longer message that agrees while a card waits gets the reminder appended; the card stays", async () => {
  const kit = createCardKit();
  const card = await freeze(kit, [{ capability: "todo.create", set: { title: "見積書のドラフトを見直す" } }], undefined, "ja");
  await kit.repository.saveAction({ ...card, origin: { conversationId: SESSION, kind: "conversation", requestId: "agreq_first" } });
  const result = await runWithConfirmBoundary({ now: kit.now, runtime: kit.runtime }, { locale: "ja", message: "やっぱりさっきの内容で進めてください。OKです。", requestId: "agreq_later", run: turnOf({ reply: "承知しました。" }), sessionId: SESSION });
  assert.equal(result.modelCalled, true);
  assert.match(result.text, /カードの「以上 1 件を確定」を押してください/u);
  assert.equal((await kit.runtime.getAction(card.actionId))?.status, "awaiting_confirmation");
});
