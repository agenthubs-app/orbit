import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createTransactionalOrbitAgentChatSessionArtifactReader } from "../../features/orbit-ai/storage/orbit-agent-chat-session-artifact-reader";
import type { OrbitAgentChatSessionSnapshot } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createOrbitAgentChatSessionHandlers } from "../../app/api/ai/conversations/sessions/[id]/handler";

test("ordinary authorized session GET includes same-turn read-only artifact recovery without requestId", async () => {
  const originalMode = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = "mock";
  let reads = 0;
  const session = {
    id: "agent-session-qa", title: "测试点单助手", createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z",
    messages: [{ id: "user:qa", role: "user", text: "谁可能愿意讨论点单助手？" }, { id: "assistant:qa", role: "assistant", text: "我来查找。" }]
  };
  const before = JSON.stringify(session);
  const dependencies = {
    resolveActor: async () => ({ id: "actor:qa" }),
    providerForActor: () => ({ source: "synthetic-test", sourceLabel: "测试", getSession: async (id: string) => id === session.id ? structuredClone(session) : null }),
    organizationStoreForActor: () => null,
    artifactReaderForActor: (_mode: unknown, actorId: string) => ({ async read(actual: typeof session) {
      assert.equal(actorId, "actor:qa"); assert.equal(actual.id, session.id); reads++;
      return { turns: [{ sessionId: session.id, requestId: "request:qa", userMessageId: "user:qa", assistantMessageId: "assistant:qa", status: "ready", artifacts: [] }], truncated: false };
    } })
  };
  try {
    const handler = createOrbitAgentChatSessionHandlers(dependencies as unknown as Parameters<typeof createOrbitAgentChatSessionHandlers>[0]);
    const response = await handler.GET(new Request(`https://orbit.test/api/ai/conversations/sessions/${session.id}`), { params: Promise.resolve({ id: session.id }) });
    const envelope = await response.json();
    assert.equal(response.status, 200);
    assert.equal(envelope.data.artifactRecovery?.turns[0]?.assistantMessageId, "assistant:qa");
    assert.equal(reads, 1);
    assert.equal(JSON.stringify(session), before);
  } finally {
    if (originalMode === undefined) delete process.env.ORBIT_MODULE_MODE;
    else process.env.ORBIT_MODULE_MODE = originalMode;
  }
});

const storedSession: OrbitAgentChatSessionSnapshot = {
  id: "agent-session-qa", title: "点单助手讨论", createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z",
  messages: [{ id: "user:qa:1", role: "user", text: "谁愿意讨论点单助手？" }, { id: "assistant:qa:1", role: "assistant", text: "第一轮回复。" }, { id: "user:qa:2", role: "user", text: "谁愿意讨论点单助手？" }, { id: "assistant:qa:2", role: "assistant", text: "第二轮回复。" }]
};
function requestRow(turn = 1, actorId = "actor:qa") {
  const presentation = { preferredSurface: "inline_card", title: "候选结果" };
  const task = { artifactId: `artifact:qa:${turn}`, taskId: `task:qa:${turn}`, conversationId: "runtime:qa", kind: "contact_recommendations", status: "ready", artifactProducer: "contact_recommendation_producer", presentation, query: "点单助手", createdAt: storedSession.createdAt, updatedAt: storedSession.updatedAt };
  const payload = { requestId: `request:qa:${turn}`, sessionId: storedSession.id, fingerprint: "synthetic", state: "completed", result: { success: true, data: { activeConversationId: "runtime:qa", messages: [{ messageId: `provider-user:qa:${turn}`, role: "user", conversationId: "runtime:qa", content: "谁愿意讨论点单助手？" }, { messageId: `assistant:qa:${turn}`, role: "assistant", conversationId: "runtime:qa", content: turn === 1 ? "第一轮回复。" : "第二轮回复。" }], artifacts: [{ task, result: { artifactId: task.artifactId, taskId: task.taskId, kind: task.kind, status: "ready", presentation, nextAction: "复核证据。", generatedView: { summary: "1位测试候选人", sections: [{ title: "已有关系", items: [{ id: `contact-recommendation:contact:qa:${turn}`, title: `测试候选${turn}`, body: "虚构关系证据", reason: "虚构点单项目", metadata: [], actions: [{ actionId: `contact:review:contact:qa:${turn}`, label: "查看", requiresConfirmation: true }], evidenceIds: [`evidence:qa:${turn}`] }] }] } } }] } } };
  return { record_id: createHash("sha256").update(JSON.stringify([actorId, payload.requestId])).digest("hex"), request_id: payload.requestId, source_bytes: Buffer.byteLength(JSON.stringify(payload)), payload };
}
function readerFor(rows: unknown[]) {
  const queries: Array<{ text: string; values: readonly unknown[] }> = [];
  const reader = createTransactionalOrbitAgentChatSessionArtifactReader({ actorId: "actor:qa", workspaceId: "workspace:qa", client: { async query(text, values) { queries.push({ text, values: values ?? [] }); return { rows } as never; } } });
  return { reader, queries };
}

test("parameterized bounded SELECT restores repeated questions by unique assistant identity, not differing provider user IDs", async () => {
  const fixture = readerFor([requestRow(2), requestRow(1)]);
  const before = JSON.stringify(storedSession);
  const recovery = await fixture.reader.read(storedSession);
  assert.deepEqual(recovery.turns.map(turn => [turn.requestId, turn.userMessageId, turn.assistantMessageId]), [["request:qa:2", "user:qa:2", "assistant:qa:2"], ["request:qa:1", "user:qa:1", "assistant:qa:1"]]);
  assert.equal(recovery.turns[0]?.artifacts[0]?.sections[0]?.items[0]?.contactHref, "/contacts/contact%3Aqa%3A2");
  assert.equal(fixture.queries.length, 1);
  assert.deepEqual(fixture.queries[0]?.values, ["workspace:qa", "actor:qa", "orbit_agent_chat_requests", storedSession.id]);
  assert.match(fixture.queries[0]!.text, /WHERE workspace_id = \$1 AND user_id = \$2/u);
  assert.match(fixture.queries[0]!.text, /deleted_at IS NULL AND lifecycle_state = 'active'/u);
  assert.match(fixture.queries[0]!.text, /ORDER BY updated_at DESC, record_id ASC LIMIT 101/u);
  assert.doesNotMatch(fixture.queries[0]!.text, /INSERT|UPDATE|DELETE FROM/u);
  assert.equal(JSON.stringify(storedSession), before);
});

test("wrong actor, wrong session, noncompleted and failed receipts cannot project private candidates even if a storage adapter returns them", async () => {
  const rows = [requestRow(1, "actor:other"), requestRow(1), requestRow(1), requestRow(1)];
  rows[1]!.payload.sessionId = "agent-session-other";
  rows[2]!.payload.state = "pending";
  rows[3]!.payload.result.success = false;
  const recovery = await readerFor(rows).reader.read(storedSession);
  assert.deepEqual(recovery.turns, []);
  assert.equal(recovery.unavailable, true);
});

test("ambiguous saved assistant identity and duplicate completed requests are explicitly unavailable", async () => {
  const ambiguous = { ...storedSession, messages: [...storedSession.messages, storedSession.messages[1]!] };
  assert.deepEqual((await readerFor([requestRow()]).reader.read(ambiguous)).turns, []);
  const recovery = await readerFor([requestRow(), requestRow()]).reader.read(storedSession);
  assert.deepEqual(recovery.turns, []);
  assert.equal(recovery.unavailable, true);
});

test("source oversize and the 101st-row lookahead are reported without returning raw request bodies", async () => {
  const rows = Array.from({ length: 101 }, () => ({ ...requestRow(), payload: null, source_bytes: 262145 }));
  const recovery = await readerFor(rows).reader.read(storedSession);
  assert.deepEqual(recovery.turns, []);
  assert.equal(recovery.truncated, true);
  assert.equal(recovery.oversized, true);
  assert.ok(Buffer.byteLength(JSON.stringify(recovery)) <= 131072);
});

test("an artifact from another runtime conversation cannot expose its candidates under an otherwise valid saved reply", async () => {
  const row = requestRow();
  row.payload.result.data.artifacts[0]!.task.conversationId = "runtime:other";
  const recovery = await readerFor([row]).reader.read(storedSession);
  assert.equal(recovery.turns[0]?.artifacts[0]?.status, "unavailable");
  assert.deepEqual(recovery.turns[0]?.artifacts[0]?.sections, []);
});

test("deleted or foreign sessions and anonymous reads do not call the private artifact reader", async () => {
  let reads = 0;
  for (const actor of [{ id: "actor:other" }, null]) {
    const dependencies = { resolveActor: async () => actor, providerForActor: () => ({ getSession: async () => null }), organizationStoreForActor: () => null, artifactReaderForActor: () => ({ read: async () => { reads++; throw new Error("reader must not run"); } }) };
    const handler = createOrbitAgentChatSessionHandlers(dependencies as unknown as Parameters<typeof createOrbitAgentChatSessionHandlers>[0]);
    const response = await handler.GET(new Request("https://orbit.test/api/ai/conversations/sessions/deleted"), { params: Promise.resolve({ id: "deleted" }) });
    assert.equal(response.status, actor ? 404 : 401);
  }
  assert.equal(reads, 0);
});

test("total projection exceeds 128KiB without erasing text or returning oversized display bodies", async () => {
  const row = requestRow();
  const section = row.payload.result.data.artifacts[0]!.result.generatedView.sections[0]!;
  section.items = Array.from({ length: 14 }, (_, index) => ({ ...section.items[0]!, id: `contact-recommendation:contact:qa:${index}`, reason: "x".repeat(10000) }));
  row.source_bytes = Buffer.byteLength(JSON.stringify(row.payload));
  assert.ok(row.source_bytes < 262144);
  const recovery = await readerFor([row]).reader.read(storedSession);
  assert.equal(recovery.truncated, true);
  assert.equal(recovery.oversized, true);
  assert.deepEqual(recovery.turns, []);
  assert.ok(Buffer.byteLength(JSON.stringify(recovery)) <= 131072);
});
