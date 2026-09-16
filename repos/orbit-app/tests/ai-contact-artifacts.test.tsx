import assert from "node:assert/strict";
import test from "node:test";
import { conversationPayloadToThreadView } from "../src/view-models/conversations";
import { contactArtifactSchema, contactArtifactToDisplay } from "../src/api/schema/ai-artifacts";
import { sessionContactArtifacts } from "../src/view-models/ai-artifacts";

// Structure-preserving synthetic data: no production names or relationship evidence.
const candidateIds = ["contact:qa:1", "contact:qa:2", "contact:qa:3", "contact:qa:4", "contact:qa:5", "contact:qa:6", "contact:qa:7", "contact:qa:8"];
const task = {
  artifactId: "artifact:qa:contacts", taskId: "task:qa:contacts",
  conversationId: "conversation:qa", kind: "contact_recommendations", status: "ready",
  artifactProducer: "contact_recommendation_producer",
  presentation: { preferredSurface: "inline_card", title: "点单助手候选" },
  query: "我准备做餐厅点单助手，谁可能愿意一起讨论？",
  createdAt: "2026-09-16T08:00:00.000Z", updatedAt: "2026-09-16T08:00:00.000Z"
};
export const contactArtifactFixture = {
  task,
  result: {
    artifactId: task.artifactId, taskId: task.taskId, kind: task.kind, status: "ready",
    presentation: task.presentation,
    nextAction: "先复核关系证据，再决定是否联系。",
    provenance: {
      source: "synthetic-test", sourceModules: ["contacts"],
      evidenceIds: candidateIds.map((_, index) => `evidence:qa:${index + 1}`),
      toolCalls: [{ toolCallId: "tool:qa:contacts", toolName: "contacts.recommend", status: "completed", reason: "测试检索", evidenceIds: [] }],
      generatedAt: task.updatedAt, generationMethod: "artifact-producer-generated-view"
    },
    safety: {
      externalSideEffectsExecuted: false, domainWritesExecuted: false, aiProviderRequested: false,
      externalNetworkRequested: false, liveDatabaseReadExecuted: true, liveDatabaseWriteExecuted: false,
      emailProviderRequested: false, calendarProviderRequested: false, notificationDelivered: false,
      actionsRequireConfirmation: true
    },
    generatedView: {
      summary: "已匹配 8 位有关系证据的候选人。",
      sections: [{ title: "已有关系匹配", body: "虚构测试关系。", items: candidateIds.map((id, index) => ({
        id: `contact-recommendation:${id}`, title: `测试候选${index + 1}`, subtitle: "餐饮数字化负责人",
        body: "曾在测试交流会讨论餐厅服务。", reason: "其测试项目与点单系统相关。",
        evidenceIds: [`evidence:qa:${index + 1}`], metadata: [{ label: "组织", value: "测试组织" }],
        actions: [{ actionId: `contact:review:${id}`, label: "查看人脉", requiresConfirmation: true }]
      })) }]
    }
  }
};

test("completed contact tool results survive the actual chat consumer without question keyword gating", () => {
  const thread = conversationPayloadToThreadView({
    activeConversationId: "conversation:qa",
    messages: [
      { messageId: "user:qa:1", role: "user", content: task.query },
      { messageId: "assistant:qa:1", role: "assistant", content: "我来找找可能感兴趣的人。" }
    ],
    artifacts: [contactArtifactFixture]
  });
  const panels = (thread as unknown as { contactArtifacts?: Array<{ assistantMessageId: string; sections: Array<{ items: Array<{ id: string }> }> }> }).contactArtifacts ?? [];
  assert.deepEqual(panels.flatMap(panel => panel.sections.flatMap(section => section.items.map(item => item.id))), [
    "contact-recommendation:contact:qa:1", "contact-recommendation:contact:qa:2",
    "contact-recommendation:contact:qa:3", "contact-recommendation:contact:qa:4",
    "contact-recommendation:contact:qa:5", "contact-recommendation:contact:qa:6",
    "contact-recommendation:contact:qa:7", "contact-recommendation:contact:qa:8"
  ]);
  assert.equal(panels[0]?.assistantMessageId, "assistant:qa:1");
});

test("valid display preserves contact namespaces and business metadata while refusing unknown, external or unevidenced actions", () => {
  assert.equal(contactArtifactSchema.safeParse(contactArtifactFixture).success, true);
  const fixture = structuredClone(contactArtifactFixture);
  fixture.result.generatedView.sections[0]!.items[0]!.metadata.push({ label: "方法", value: "rules_v1" });
  assert.equal(contactArtifactToDisplay(fixture).sections[0]?.items[0]?.contactHref, "/contacts/contact%3Aqa%3A1");
  assert.doesNotMatch(JSON.stringify(contactArtifactToDisplay(fixture)), /rules_v1|producer|provider/u);
  for (const mutate of [
    (item: any) => { item.actions[0].href = "https://outside.test/contacts/contact%3Aqa%3A1"; },
    (item: any) => { item.actions[0].actionId = "contact:review:other"; },
    (item: any) => { item.evidenceIds = []; },
    (item: any) => { item.actions[0].href = "/contacts/other"; }
  ]) {
    const fixture = structuredClone(contactArtifactFixture); mutate(fixture.result.generatedView.sections[0]!.items[0]);
    assert.equal(contactArtifactToDisplay(fixture).sections[0]?.items[0]?.contactHref, null);
  }
});

test("the actual goal-variant internal web contact path maps to the identity-matched native detail path", () => {
  const fixture = structuredClone(contactArtifactFixture) as any;
  fixture.result.generatedView.sections[0].items[0].actions[0].href = "/app/contacts/contact:qa:1";
  assert.equal(contactArtifactToDisplay(fixture).sections[0]?.items[0]?.contactHref, "/contacts/contact%3Aqa%3A1");
});

test("restored display metadata cannot expose implementation labels", () => {
  const display = contactArtifactToDisplay(contactArtifactFixture);
  display.sections[0]!.items[0]!.metadata.push({ label: "方法", value: "rules_v1" });
  const session = { id: "s", messages: [{ id: "u", role: "user" }, { id: "a", role: "assistant" }] };
  const panels = sessionContactArtifacts(session, { truncated: false, turns: [{ sessionId: "s", requestId: "r", userMessageId: "u", assistantMessageId: "a", status: "ready", artifacts: [display] }] });
  assert.doesNotMatch(JSON.stringify(panels), /rules_v1/u);
});

test("history projections only attach to the proven saved turn and a malformed neighboring artifact does not erase text or good results", () => {
  const session = { id: "session:qa", messages: [{ id: "user:qa:1", role: "user" }, { id: "assistant:qa:1", role: "assistant" }, { id: "user:qa:2", role: "user" }, { id: "assistant:qa:2", role: "assistant" }] };
  const turn = { sessionId: session.id, requestId: "request:qa:1", userMessageId: "user:qa:1", assistantMessageId: "assistant:qa:1", status: "ready", artifacts: [contactArtifactToDisplay(contactArtifactFixture), { bad: true }] };
  const panels = sessionContactArtifacts(session, { turns: [turn], truncated: false });
  assert.equal(panels[0]?.sections[0]?.items.length, 8);
  assert.equal(panels[1]?.status, "unavailable");
  assert.ok(panels.every(panel => panel.assistantMessageId === "assistant:qa:1"));
  assert.deepEqual(sessionContactArtifacts(session, { turns: [{ ...turn, sessionId: "session:other" }, { ...turn, userMessageId: "user:qa:2" }], truncated: false }), []);
});

test("duplicate candidate identities are unavailable rather than ambiguous clickable results", () => {
  const fixture = structuredClone(contactArtifactFixture);
  fixture.result.generatedView.sections[0]!.items[1] = fixture.result.generatedView.sections[0]!.items[0]!;
  assert.equal(contactArtifactToDisplay(fixture).status, "unavailable");
});

test("ready empty, pending, failed, unsupported and malformed results have distinct truthful display states", () => {
  const empty = structuredClone(contactArtifactFixture); empty.result.generatedView.sections[0]!.items = [];
  assert.equal(contactArtifactToDisplay(empty).status, "empty");
  for (const status of ["pending", "failed"]) {
    const value = structuredClone(contactArtifactFixture) as any;
    value.task.status = value.result.status = status; value.result.generatedView = null;
    assert.equal(contactArtifactToDisplay(value).status, status);
    assert.deepEqual(contactArtifactToDisplay(value).sections, []);
  }
  const unknown = structuredClone(contactArtifactFixture); unknown.task.kind = unknown.result.kind = "future_artifact";
  assert.equal(contactArtifactToDisplay(unknown).status, "unsupported");
  const mismatch = structuredClone(contactArtifactFixture); mismatch.result.taskId = "task:other";
  assert.equal(contactArtifactToDisplay(mismatch).status, "unavailable");
});

test("client artifact and aggregate history item budgets are explicit rather than silently overflowing", () => {
  const artifacts = Array.from({ length: 17 }, (_, index) => {
    const value = structuredClone(contactArtifactFixture); value.task.artifactId = value.result.artifactId = `artifact:qa:${index}`; return value;
  });
  const thread = conversationPayloadToThreadView({ activeConversationId: "conversation:qa", messages: [{ messageId: "u", role: "user", content: "点单助手" }, { messageId: "a", role: "assistant", content: "已查找。" }], artifacts });
  assert.ok((thread.contactArtifacts?.length ?? 0) <= 16);
  assert.equal(thread.contactArtifacts?.at(-1)?.status, "unavailable");
  const display = contactArtifactToDisplay(contactArtifactFixture);
  display.sections[0]!.items = Array.from({ length: 200 }, (_, index) => ({ ...display.sections[0]!.items[0]!, id: `contact-recommendation:contact:big:${index}`, contactHref: null }));
  const session = { id: "session:qa", messages: [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }, { id: "u2", role: "user" }, { id: "a2", role: "assistant" }] };
  const recovery = { truncated: false, turns: [1, 2].map(index => ({ sessionId: session.id, requestId: `r${index}`, userMessageId: `u${index}`, assistantMessageId: `a${index}`, status: "ready", artifacts: [display] })) };
  const panels = sessionContactArtifacts(session, recovery);
  assert.ok(panels.reduce((total, panel) => total + panel.sections.reduce((count, section) => count + section.items.length, 0), 0) <= 200);
  assert.equal(panels.at(-1)?.status, "unavailable");
});

test("malformed contact presentation preserves the original reply and visibly marks the result unavailable", () => {
  const invalid = structuredClone(contactArtifactFixture) as unknown as { result: { presentation: unknown } };
  invalid.result.presentation = "inline";
  const thread = conversationPayloadToThreadView({
    activeConversationId: "conversation:qa",
    messages: [
      { messageId: "user:qa:1", role: "user", content: task.query },
      { messageId: "assistant:qa:1", role: "assistant", content: "保留的历史原文。" }
    ], artifacts: [invalid]
  });
  const panels = (thread as unknown as { contactArtifacts?: Array<{ status: string; sections: unknown[] }> }).contactArtifacts ?? [];
  assert.equal(thread.messages[1]?.content, "保留的历史原文。");
  assert.equal(panels[0]?.status, "unavailable");
  assert.deepEqual(panels[0]?.sections, []);
});
