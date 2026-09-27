/**
 * Sprint 0112: the web chat restores a session a page at a time. It shows the
 * latest 20 messages, loads 20 earlier ones per request from the top of the
 * thread until 「已加载全部消息」, never re-uploads what it loaded, and restores
 * the confirm/status card of a turn that proposed actions (0110 follow-up).
 * The real shell, chat hook and model layer run; the sessions API is stubbed to
 * page a 150-message session the way GET /api/ai/conversations/sessions/[id]
 * does (covered against Postgres in ai-session-paging-postgres.test.ts).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { act } from "react-test-renderer";

import { AgentActionStatusCard } from "../../app/(app)/app/agent/agent-action-status-card";
import { buttonWithText, mountAgent, renderedText, successReply, textOf } from "./app-agent-characterization-harness";

const SESSION = "session:paging-150";
const TOTAL = 150;
const id = (i: number) => (i % 2 === 0 ? `user:${i}` : `assistant:request:${i}`);
const text = (i: number) => (i % 2 === 0 ? `第${i}条问题` : `第${i}条回答`);
// A turn that proposed a reminder; the stored reply is plain (it was asked from the App),
// so only the recovered request record knows its run.
const ACTION_TURN = 141;

function page(cursor: string | null) {
  const end = cursor ? Number(cursor.slice(1)) : TOTAL;
  const start = Math.max(0, end - 20);
  const messages = Array.from({ length: end - start }, (_, offset) => {
    const i = start + offset;
    return i % 2 === 0
      ? { id: id(i), role: "user", text: text(i) }
      : { id: id(i), role: "assistant", text: text(i) };
  });
  const turns = messages.some((message) => message.id === id(ACTION_TURN))
    ? [{ sessionId: SESSION, requestId: `request:${ACTION_TURN}`, userMessageId: id(ACTION_TURN - 1), assistantMessageId: id(ACTION_TURN), status: "ready", artifacts: [], runId: "run:natural-language:141", actionIds: ["action:141:reminder"] }]
    : [];
  return Response.json({ success: true, data: {
    session: { id: SESSION, title: "长会话", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T03:00:00.000Z", messageRevision: TOTAL, messages },
    page: { hasMore: start > 0, nextCursor: start > 0 ? `c${start}` : null, limit: 20 },
    artifactRecovery: { turns, truncated: false },
    storage: { configured: true, persisted: true },
  } });
}

function shownIndexes(root: Parameters<typeof renderedText>[0]): number[] {
  return [...renderedText(root).matchAll(/第(\d+)条(问题|回答)/g)].map((match) => Number(match[1]));
}

function earlierButton(root: Parameters<typeof renderedText>[0]) {
  return root.root.findAll((node) => node.type === "button" && textOf(node.children as unknown).includes("加载更早的消息"));
}

test("a restored session shows its latest 20 messages and loads the earlier ones 20 at a time until all are shown", async (t) => {
  const reads: string[] = [];
  const harness = await mountAgent(t, {
    search: `?session=${encodeURIComponent(SESSION)}`,
    sessionReader: (sessionId, cursor) => { reads.push(`${sessionId}|${cursor ?? ""}`); return page(cursor); },
  });
  assert.deepEqual(shownIndexes(harness.root), Array.from({ length: 20 }, (_, i) => 130 + i));
  for (let loaded = 40; loaded <= 160; loaded += 20) {
    await act(async () => { buttonWithText(harness.root, "加载更早的消息").props.onClick(); });
    await harness.settle();
    assert.equal(shownIndexes(harness.root).length, Math.min(TOTAL, loaded));
  }
  assert.deepEqual(shownIndexes(harness.root), Array.from({ length: TOTAL }, (_, i) => i), "oldest first, no repeat, no gap");
  assert.ok(renderedText(harness.root).includes("已加载全部消息"));
  assert.equal(earlierButton(harness.root).length, 0);
  assert.deepEqual(reads, [`${SESSION}|`, ...["c130", "c110", "c90", "c70", "c50", "c30", "c10"].map((cursor) => `${SESSION}|${cursor}`)]);
  assert.equal(harness.persistedSessions.length, 0, "restoring and paging back upload nothing");
});

test("a failed earlier page keeps what is shown and offers a retry", async (t) => {
  let fail = true;
  const harness = await mountAgent(t, {
    search: `?session=${encodeURIComponent(SESSION)}`,
    sessionReader: (_sessionId, cursor) => cursor && fail
      ? Response.json({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "x" } }, { status: 503 })
      : page(cursor),
  });
  await act(async () => { buttonWithText(harness.root, "加载更早的消息").props.onClick(); });
  await harness.settle();
  assert.equal(shownIndexes(harness.root).length, 20);
  assert.ok(renderedText(harness.root).includes("没能加载更早的消息"));
  fail = false;
  await act(async () => { buttonWithText(harness.root, "重试").props.onClick(); });
  await harness.settle();
  assert.equal(shownIndexes(harness.root).length, 40);
});

test("after a new reply only the new turn is saved, under the session's stored title", async (t) => {
  const harness = await mountAgent(t, {
    search: `?session=${encodeURIComponent(SESSION)}`,
    sessionReader: (_sessionId, cursor) => page(cursor),
    conversation: (body) => successReply("新的回答。", body),
  });
  await act(async () => { buttonWithText(harness.root, "加载更早的消息").props.onClick(); });
  await harness.settle();
  const ask = harness.askProbe();
  assert.ok(ask);
  await act(async () => { ask!.submit("新的问题", null); });
  await harness.settle(10);
  assert.equal(harness.conversationRequests.length, 1);
  const request = harness.conversationRequests[0]!;
  assert.equal(request.expectedMessageRevision, TOTAL);
  assert.ok((request.history as unknown[]).length <= 8, "the model history stays bounded");
  const saved = harness.persistedSessions.at(-1);
  assert.ok(saved, "the reply's cards are saved");
  const messages = saved.messages as Array<{ role: string; text: string }>;
  assert.deepEqual(messages.map((message) => message.role), ["user", "assistant"], JSON.stringify(messages.map((message) => message.text)));
  assert.equal(messages[0]!.text, "新的问题");
  assert.equal(saved.title, "长会话", "the stored title is kept, not re-derived from the loaded page");
  assert.equal(JSON.stringify(saved).includes("第130条问题"), false, "loaded messages are not uploaded again");
});

test("0110 a restored turn that proposed actions shows its status card", async (t) => {
  const harness = await mountAgent(t, {
    search: `?session=${encodeURIComponent(SESSION)}`,
    sessionReader: (_sessionId, cursor) => page(cursor),
  });
  const cards = harness.root.root.findAllByType(AgentActionStatusCard);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]!.props.runId, "run:natural-language:141");
  assert.deepEqual(cards[0]!.props.actionIds, ["action:141:reminder"]);
  assert.equal(harness.persistedSessions.length, 0, "showing the card is not a write");
});
