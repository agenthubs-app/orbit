import assert from "node:assert/strict";
import test from "node:test";

import { acceptMessage, AgentRunStoppedError, cancelCurrentRun, getRequestResult, settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createSessionWriter } from "../../features/agent-v1/entry/legacy-runtime";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { createStorageOrbitAgentChatSessionProvider } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

/**
 * AG01-5: stopping ends only the running request. After the stop it makes no model call (the
 * per-run fetch refuses), its late result is not written into the document, and the request
 * queued behind it starts as usual.
 */

test("stop: no further model call, the late result is not delivered, the queue goes on", async () => {
  const realFetch = globalThis.fetch;
  let modelCalls = 0;
  globalThis.fetch = (async () => {
    modelCalls += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    let releaseFirst!: () => void;
    const firstMayContinue = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let firstCalledOnce!: () => void;
    const firstStarted = new Promise<void>((resolve) => { firstCalledOnce = resolve; });
    const refusals: unknown[] = [];
    const deps: AgentEntryDependencies = {
      execute: async ({ fetchImplementation, input }) => {
        if (input.message === "写一篇长文") {
          await fetchImplementation("https://api.deepseek.com/chat/completions", { method: "POST" });
          firstCalledOnce();
          await firstMayContinue;
          try {
            await fetchImplementation("https://api.deepseek.com/chat/completions", { method: "POST" });
          } catch (error) {
            refusals.push(error);
          }
          return { sourceRefs: [], text: "迟到的长文" };
        }
        await fetchImplementation("https://api.deepseek.com/chat/completions", { method: "POST" });
        return { sourceRefs: [], text: "待办有两条" };
      },
      store: createMemoryAgentEntryStore(),
    };
    const actorId = "actor:stop";
    const sessionId = "session:stop";
    const long = await acceptMessage(deps, { actorId, body: { clientMessageId: "m1", locale: "zh", message: "写一篇长文", protocolVersion: 3, references: [], sessionId } });
    const next = await acceptMessage(deps, { actorId, body: { clientMessageId: "m2", locale: "zh", message: "我还有哪些待办？", protocolVersion: 3, references: [], sessionId } });
    assert.equal(next.receipt.status, "queued");
    await firstStarted;
    assert.equal(modelCalls, 1);

    const stopped = await cancelCurrentRun(deps, { actorId, requestId: long.receipt.requestId });
    assert.equal(stopped?.changed, true);
    assert.equal(stopped?.document.status, "cancelled");
    assert.equal(stopped?.document.ending?.kind, "stopped_by_user");

    // The stopped runtime tries one more model call and then returns a late answer.
    releaseFirst();
    await settleSession(actorId, sessionId);
    assert.equal(refusals.length, 1);
    assert.ok(refusals[0] instanceof AgentRunStoppedError);

    const longDoc = await getRequestResult(deps, { actorId, requestId: long.receipt.requestId });
    assert.equal(longDoc?.status, "cancelled");
    assert.equal(longDoc?.answer, null, "the late result is not in the document");
    const nextDoc = await getRequestResult(deps, { actorId, requestId: next.receipt.requestId });
    assert.equal(nextDoc?.status, "completed");
    assert.equal(nextDoc?.answer?.text, "待办有两条");
    assert.equal(modelCalls, 2, "one call before the stop (long) + one for the next request; none after the stop");

    // Stopping an ended request changes nothing.
    const again = await cancelCurrentRun(deps, { actorId, requestId: next.receipt.requestId });
    assert.equal(again?.changed, false);
    assert.equal(again?.document.status, "completed");
    // Another account cannot stop it.
    assert.equal(await cancelCurrentRun(deps, { actorId: "actor:other", requestId: next.receipt.requestId }), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a stopped request whose runtime never returns does not hold up the queue", async () => {
  const deps: AgentEntryDependencies = {
    execute: async ({ input }) => {
      if (input.message === "卡住") await new Promise(() => undefined);
      return { sourceRefs: [], text: "好" };
    },
    store: createMemoryAgentEntryStore(),
  };
  const actorId = "actor:stuck";
  const sessionId = "session:stuck";
  const stuck = await acceptMessage(deps, { actorId, body: { clientMessageId: "m1", locale: "zh", message: "卡住", protocolVersion: 3, references: [], sessionId } });
  const next = await acceptMessage(deps, { actorId, body: { clientMessageId: "m2", locale: "zh", message: "下一条", protocolVersion: 3, references: [], sessionId } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await cancelCurrentRun(deps, { actorId, requestId: stuck.receipt.requestId });
  await settleSession(actorId, sessionId);
  assert.equal((await getRequestResult(deps, { actorId, requestId: next.receipt.requestId }))?.status, "completed");
});

test("the turn after a stop gets the earlier answered turns as context, not the stopped message", async () => {
  const provider = createStorageOrbitAgentChatSessionProvider({ actorId: "actor:h", store: createMemoryLiveRecordStore<Record<string, unknown>>(), workspaceId: "workspace:h" });
  let releaseLong!: () => void;
  const longMayEnd = new Promise<void>((resolve) => { releaseLong = resolve; });
  const histories: { message: string; history: string[] }[] = [];
  const deps: AgentEntryDependencies = {
    execute: async ({ history, input }) => {
      histories.push({ history: history.map((turn) => `${turn.role}:${turn.content}`), message: input.message });
      if (input.message === "写一篇八百字的短文") await longMayEnd;
      return { sourceRefs: [], text: `答${input.message}` };
    },
    sessions: createSessionWriter(provider),
    store: createMemoryAgentEntryStore(),
  };
  const actorId = "actor:h";
  const sessionId = "session:h";
  const send = (id: string, message: string) => acceptMessage(deps, { actorId, body: { clientMessageId: id, locale: "zh", message, protocolVersion: 3, references: [], sessionId } });
  await send("m1", "明天有什么日程？");
  await settleSession(actorId, sessionId);
  const long = await send("m2", "写一篇八百字的短文");
  await send("m3", "我还有哪些待办？");
  await new Promise((resolve) => setTimeout(resolve, 20));
  await cancelCurrentRun(deps, { actorId, requestId: long.receipt.requestId });
  releaseLong();
  await settleSession(actorId, sessionId);
  assert.deepEqual(histories.find((item) => item.message === "我还有哪些待办？")?.history, ["user:明天有什么日程？", "assistant:答明天有什么日程？"]);
  // The session itself still shows the stopped message (with no reply).
  const session = await provider.getSession(sessionId);
  assert.deepEqual(session?.messages.map((message) => `${message.role}:${message.text}`), [
    "user:明天有什么日程？", "assistant:答明天有什么日程？", "user:写一篇八百字的短文", "user:我还有哪些待办？", "assistant:答我还有哪些待办？",
  ]);
});

test("stopping a queued request removes it from the queue without touching the running one", async () => {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => { release = resolve; });
  const ran: string[] = [];
  const deps: AgentEntryDependencies = {
    execute: async ({ input }) => {
      ran.push(input.message);
      if (input.message === "第一条") await opened;
      return { sourceRefs: [], text: `答${input.message}` };
    },
    store: createMemoryAgentEntryStore(),
  };
  const actorId = "actor:q";
  const sessionId = "session:q";
  const first = await acceptMessage(deps, { actorId, body: { clientMessageId: "m1", locale: "zh", message: "第一条", protocolVersion: 3, references: [], sessionId } });
  const second = await acceptMessage(deps, { actorId, body: { clientMessageId: "m2", locale: "zh", message: "第二条", protocolVersion: 3, references: [], sessionId } });
  const third = await acceptMessage(deps, { actorId, body: { clientMessageId: "m3", locale: "zh", message: "第三条", protocolVersion: 3, references: [], sessionId } });
  await cancelCurrentRun(deps, { actorId, requestId: second.receipt.requestId });
  release();
  await settleSession(actorId, sessionId);
  assert.deepEqual(ran, ["第一条", "第三条"]);
  assert.equal((await getRequestResult(deps, { actorId, requestId: first.receipt.requestId }))?.status, "completed");
  assert.equal((await getRequestResult(deps, { actorId, requestId: second.receipt.requestId }))?.status, "cancelled");
  assert.equal((await getRequestResult(deps, { actorId, requestId: third.receipt.requestId }))?.status, "completed");
});
