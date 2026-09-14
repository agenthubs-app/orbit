import assert from "node:assert/strict";
import test from "node:test";

import {
  ReliableSendError,
  createMemoryOrbitAgentChatRequestStore,
  createReliableOrbitAgentSendService,
} from "../../features/orbit-ai/reliable-send-service";
import { createStorageOrbitAgentChatSessionProvider } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function createHarness() {
  let tick = 0;
  return {
    requestStore: createMemoryOrbitAgentChatRequestStore(),
    sessionProvider: createStorageOrbitAgentChatSessionProvider({
      actorId: "account:reliable-send",
      store: createMemoryLiveRecordStore<Record<string, unknown>>(),
      workspaceId: "workspace:reliable-send",
    }),
    now: () => new Date(Date.UTC(2026, 8, 14, 1, 0, tick++)).toISOString(),
  };
}

const input = {
  clientMessageId: "message:client:1",
  expectedMessageRevision: 0,
  locale: "zh" as const,
  message: "第一问",
  protocolVersion: 2 as const,
  references: [],
  requestId: "request:1",
  sessionId: "session:1",
};

test("reliable send persists the user message before execution and replays one completed result", async () => {
  const harness = createHarness();
  const service = createReliableOrbitAgentSendService(harness);
  let executions = 0;
  let releaseExecution!: () => void;
  const executionGate = new Promise<void>((resolve) => {
    releaseExecution = resolve;
  });
  const execute = async () => {
    executions += 1;
    const savedBeforeExecution = await harness.sessionProvider.getSession(input.sessionId);
    assert.deepEqual(savedBeforeExecution?.messages, [
      {
        createdAt: "2026-09-14T01:00:00.000Z",
        id: input.clientMessageId,
        role: "user",
        text: input.message,
      },
    ]);
    await executionGate;
    return {
      assistantMessage: { id: "message:assistant:1", text: "第一答" },
      result: { answer: "第一答" },
    };
  };

  const first = service.send({ execute, input });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const concurrent = await service.send({ execute, input });

  assert.equal(concurrent.state, "pending");
  assert.equal(executions, 1);
  releaseExecution();
  const completed = await first;
  const replayed = await service.send({ execute, input });

  assert.equal(completed.state, "completed");
  assert.equal(replayed.state, "completed");
  assert.equal(replayed.replayed, true);
  assert.deepEqual(replayed.result, { answer: "第一答" });
  assert.equal(executions, 1);
  assert.deepEqual(
    (await harness.sessionProvider.getSession(input.sessionId))?.messages.map(
      ({ id, role, text }) => ({ id, role, text }),
    ),
    [
      { id: "message:client:1", role: "user", text: "第一问" },
      { id: "message:assistant:1", role: "assistant", text: "第一答" },
    ],
  );
});

test("reliable send rejects reuse of a request id with different input", async () => {
  const harness = createHarness();
  const service = createReliableOrbitAgentSendService(harness);
  const execute = async () => ({
    assistantMessage: { id: "message:assistant:1", text: "第一答" },
    result: { answer: "第一答" },
  });

  await service.send({ execute, input });

  await assert.rejects(
    service.send({ execute, input: { ...input, message: "偷偷换问题" } }),
    (error: unknown) =>
      error instanceof ReliableSendError && error.code === "REQUEST_ID_REUSED",
  );
});

test("reliable send preserves outcome_unknown and never executes a blind retry", async () => {
  const harness = createHarness();
  const service = createReliableOrbitAgentSendService(harness);
  let executions = 0;
  const execute = async () => {
    executions += 1;
    throw new Error("provider connection closed after dispatch");
  };

  const first = await service.send({ execute, input });
  const retry = await service.send({ execute, input });

  assert.equal(first.state, "outcome_unknown");
  assert.equal(retry.state, "outcome_unknown");
  assert.equal(executions, 1);
  assert.deepEqual(
    (await harness.sessionProvider.getSession(input.sessionId))?.messages.map(
      ({ id, role, text }) => ({ id, role, text }),
    ),
    [{ id: "message:client:1", role: "user", text: "第一问" }],
  );
});

test("reliable send marks an execution-safe failure and retries the same request after storage recovers", async () => {
  const harness = createHarness();
  let executions = 0;
  let writes = 0;
  const service = createReliableOrbitAgentSendService({
    ...harness,
    sessionProvider: {
      ...harness.sessionProvider,
      upsertSession: async (session) => {
        writes += 1;
        if (writes === 1) throw new Error("storage unavailable");
        return harness.sessionProvider.upsertSession(session);
      },
    },
  });

  const execute = async () => {
    executions += 1;
    return {
      assistantMessage: { id: "message:assistant:1", text: "恢复后生成" },
      result: { answer: "恢复后生成" },
    };
  };

  await assert.rejects(
    service.send({ execute, input }),
    /storage unavailable/,
  );
  assert.equal(executions, 0);
  assert.equal((await harness.requestStore.get(input.requestId))?.state, "failed_before_execution");

  const retried = await service.send({ execute, input });
  assert.equal(retried.state, "completed");
  assert.equal(executions, 1);
});

test("reliable send retries a failed assistant save without executing the model again", async () => {
  const harness = createHarness();
  let executions = 0;
  let writes = 0;
  const service = createReliableOrbitAgentSendService({
    ...harness,
    sessionProvider: {
      ...harness.sessionProvider,
      upsertSession: async (session) => {
        writes += 1;
        if (writes === 2) throw new Error("assistant storage unavailable");
        return harness.sessionProvider.upsertSession(session);
      },
    },
  });
  const execute = async () => {
    executions += 1;
    return {
      assistantMessage: { id: "message:assistant:1", text: "只生成一次" },
      result: { answer: "只生成一次" },
    };
  };

  const first = await service.send({ execute, input });
  const retried = await service.send({ execute, input });

  assert.equal(first.state, "outcome_unknown");
  assert.deepEqual(retried, {
    replayed: true,
    result: { answer: "只生成一次" },
    state: "completed",
  });
  assert.equal(executions, 1);
  assert.deepEqual(
    (await harness.sessionProvider.getSession(input.sessionId))?.messages.map(
      ({ id, role, text }) => ({ id, role, text }),
    ),
    [
      { id: "message:client:1", role: "user", text: "第一问" },
      { id: "message:assistant:1", role: "assistant", text: "只生成一次" },
    ],
  );
});

test("reliable send allows only one distinct request to claim a session revision", async () => {
  const harness = createHarness();
  const originalGetSession = harness.sessionProvider.getSession;
  let initialReads = 0;
  let releaseInitialReads!: () => void;
  const initialReadGate = new Promise<void>((resolve) => {
    releaseInitialReads = resolve;
  });
  const service = createReliableOrbitAgentSendService({
    ...harness,
    sessionProvider: {
      ...harness.sessionProvider,
      getSession: async (sessionId) => {
        const snapshot = await originalGetSession(sessionId);
        initialReads += 1;
        if (initialReads === 2) releaseInitialReads();
        if (initialReads <= 2) await initialReadGate;
        return snapshot;
      },
    },
  });
  let executions = 0;
  const execute = async () => {
    executions += 1;
    return { result: { answer: "claimed" } };
  };

  const results = await Promise.allSettled([
    service.send({ execute, input }),
    service.send({
      execute,
      input: {
        ...input,
        clientMessageId: "message:client:2",
        message: "并发第二问",
        requestId: "request:2",
      },
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(executions, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof ReliableSendError);
  assert.equal(rejected.reason.code, "SESSION_REVISION_CONFLICT");
  const rejectedRequest = await harness.requestStore.get("request:2");
  assert.equal(rejectedRequest?.state, "failed_before_execution");
});
