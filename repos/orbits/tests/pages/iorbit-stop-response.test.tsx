import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react-test-renderer";

import { useAgentChat } from "../../app/(app)/app/agent/iorbit-0918/use-agent-chat";
import { useAgentHistory } from "../../app/(app)/app/agent/iorbit-0918/use-agent-history";
import { mountAgent, successReply } from "./app-agent-characterization-harness";

test("stopping a pending reply keeps a retry and ignores its late response", async (t) => {
  let respond!: (response: Response) => void;
  let attempts = 0;
  let chat!: ReturnType<typeof useAgentChat>;
  function Probe() {
    const history = useAgentHistory();
    chat = useAgentChat({ history: {
      historyMutationQueue: history.historyMutationQueue,
      setHistoryFeedback: history.setHistoryFeedback,
      setSessionGroups: history.setSessionGroups,
      setStoredSessions: history.setStoredSessions,
      storedSessionsRef: history.storedSessionsRef,
    }, suggests: [] });
    return null;
  }
  const harness = await mountAgent(t, {
    element: <Probe />,
    conversation: (body) => ++attempts === 1
      ? new Promise<Response>((resolve) => { respond = resolve; })
      : successReply("再開した結果", body),
  });
  await act(async () => { void chat.ask("この会話を整理して"); });
  assert.equal(harness.conversationRequests.length, 1);
  assert.equal(chat.thinking, true);

  await act(async () => { chat.stopResponse(); });
  assert.equal(chat.thinking, false);
  const stopped = chat.messages.at(-1);
  assert.equal(stopped?.role, "assistant");
  if (stopped?.role !== "assistant") throw new Error("Expected a stopped assistant message");
  assert.equal(stopped?.retryRequest, "この会話を整理して");
  const stoppedCount = chat.messages.length;

  respond(Response.json({ success: false, error: { code: "LATE" } }, { status: 500 }));
  await harness.settle();
  assert.equal(chat.messages.length, stoppedCount, "a late result must not replace the stopped state");

  await act(async () => { void chat.ask(stopped.retryRequest!, stoppedCount - 1); });
  await harness.settle();
  assert.equal(harness.conversationRequests.length, 2);
  assert.equal(harness.conversationRequests[1]?.requestId, harness.conversationRequests[0]?.requestId);
  assert.equal(harness.conversationRequests[1]?.clientMessageId, harness.conversationRequests[0]?.clientMessageId);
  assert.equal(chat.messages.at(-1)?.role, "assistant");
  assert.equal(chat.messages.at(-1)?.text, "再開した結果");
});

test("starting a new conversation cannot receive an earlier conversation's reply", async (t) => {
  let respond!: (response: Response) => void;
  let chat!: ReturnType<typeof useAgentChat>;
  function Probe() {
    const history = useAgentHistory();
    chat = useAgentChat({ history: {
      historyMutationQueue: history.historyMutationQueue,
      setHistoryFeedback: history.setHistoryFeedback,
      setSessionGroups: history.setSessionGroups,
      setStoredSessions: history.setStoredSessions,
      storedSessionsRef: history.storedSessionsRef,
    }, suggests: [] });
    return null;
  }
  const harness = await mountAgent(t, {
    element: <Probe />,
    conversation: () => new Promise<Response>((resolve) => { respond = resolve; }),
  });
  await act(async () => { void chat.ask("古い会話"); });
  await act(async () => { chat.newChat(); });
  respond(Response.json({ success: false, error: { code: "LATE" } }, { status: 500 }));
  await harness.settle();
  assert.deepEqual(chat.messages, []);
  assert.equal(chat.thinking, false);
});
