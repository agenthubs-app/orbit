import assert from "node:assert/strict";
import test from "node:test";

import {
  createMemoryOrbitAgentChatRequestStore,
  createReliableOrbitAgentSendService,
} from "../../features/orbit-ai/reliable-send-service";
import { createStorageOrbitAgentChatSessionProvider } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { reliableAiSendInputSchema } from "../../shared/api-schema/ai-sessions";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const originInput = {
  entryClient: "app" as const,
  entryPointId: "home.event_preparation" as const,
  initialGroupId: "group:events",
  kind: "structured" as const,
  template: { id: "home.event_preparation", version: 1 },
};

const reliableInput = {
  clientMessageId: "message:origin:first",
  expectedMessageRevision: 0,
  locale: "zh" as const,
  message: "把交流会准备分成三个步骤",
  origin: originInput,
  protocolVersion: 2 as const,
  references: [{ id: "event:meetup", type: "event" as const }],
  requestId: "request:origin:first",
  sessionId: "session:origin:first",
};

test("reliable send freezes the actual first send origin before model execution", async () => {
  const sessionProvider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:origin-owner",
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:origin",
  });
  const service = createReliableOrbitAgentSendService({
    now: () => "2026-09-15T00:30:00.000Z",
    requestStore: createMemoryOrbitAgentChatRequestStore(),
    sessionProvider,
  });
  let executions = 0;

  const result = await service.send({
    execute: async () => {
      executions += 1;
      throw new Error("provider failed after dispatch");
    },
    input: reliableInput,
  });
  const session = await sessionProvider.getSession(reliableInput.sessionId);

  assert.equal(result.state, "outcome_unknown");
  assert.equal(executions, 1);
  assert.deepEqual(session?.origin, {
    ...originInput,
    firstSentText: reliableInput.message,
    firstUserMessageId: reliableInput.clientMessageId,
    recordedAt: "2026-09-15T00:30:00.000Z",
    references: reliableInput.references,
    schemaVersion: 1,
  });
  assert.deepEqual(
    session?.messages.map(({ id, role, text }) => ({ id, role, text })),
    [
      {
        id: reliableInput.clientMessageId,
        role: "user",
        text: reliableInput.message,
      },
    ],
  );
});

test("session origin survives old-client saves and rejects later replacement", async () => {
  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:immutable-origin",
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:immutable-origin",
  });
  const origin = {
    ...originInput,
    firstSentText: reliableInput.message,
    firstUserMessageId: reliableInput.clientMessageId,
    recordedAt: "2026-09-15T00:30:00.000Z",
    references: reliableInput.references,
    schemaVersion: 1 as const,
  };
  const initial = {
    createdAt: "2026-09-15T00:30:00.000Z",
    id: reliableInput.sessionId,
    messageRevision: 1,
    messages: [
      {
        id: reliableInput.clientMessageId,
        role: "user" as const,
        text: reliableInput.message,
      },
    ],
    origin,
    title: reliableInput.message,
    updatedAt: "2026-09-15T00:30:00.000Z",
  };

  await provider.upsertSession(initial);
  await provider.upsertSession({
    ...initial,
    messageRevision: 2,
    messages: [
      ...initial.messages,
      { id: "message:answer", role: "assistant", text: "第一步确认目标" },
    ],
    origin: undefined,
    updatedAt: "2026-09-15T00:31:00.000Z",
  });
  assert.deepEqual((await provider.getSession(initial.id))?.origin, origin);

  const longHistory = Array.from({ length: 101 }, (_, index) =>
    index === 0
      ? initial.messages[0]
      : {
          id: `message:origin:${index + 1}`,
          role: index % 2 === 0 ? "user" as const : "assistant" as const,
          text: `后续消息 ${index + 1}`,
        },
  );
  await provider.upsertSession({
    ...initial,
    messageRevision: longHistory.length,
    messages: longHistory,
    origin: undefined,
    updatedAt: "2026-09-15T00:31:30.000Z",
  });
  assert.deepEqual((await provider.getSession(initial.id))?.origin, origin);

  await assert.rejects(
    provider.upsertSession({
      ...initial,
      origin: { ...origin, firstSentText: "后来改写的开头" },
      updatedAt: "2026-09-15T00:32:00.000Z",
    }),
    /origin is immutable/i,
  );
});

test("reliable input schema accepts registered origin and rejects arbitrary entry points", () => {
  const valid = reliableAiSendInputSchema.safeParse(reliableInput);
  const invalid = reliableAiSendInputSchema.safeParse({
    ...reliableInput,
    origin: { ...originInput, entryPointId: "attacker.private_prompt" },
  });

  assert.equal(valid.success, true);
  assert.deepEqual(valid.success ? valid.data.origin : null, originInput);
  assert.equal(invalid.success, false);
});
