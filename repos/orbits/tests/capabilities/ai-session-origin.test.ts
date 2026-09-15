import assert from "node:assert/strict";
import test from "node:test";

import {
  createMemoryOrbitAgentChatRequestStore,
  createReliableOrbitAgentSendService,
} from "../../features/orbit-ai/reliable-send-service";
import { createStorageOrbitAgentChatSessionProvider } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { reliableAiSendInputSchema } from "../../shared/api-schema/ai-sessions";
import type { StoredAiSessionOriginContract } from "../../shared/contract/ai-sessions";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function verificationFor(origin: StoredAiSessionOriginContract | undefined) {
  return origin && "verification" in origin ? origin.verification : undefined;
}

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
    session?.messages.map(({ id, references, role, text }) => ({ id, references, role, text })),
    [
      {
        id: reliableInput.clientMessageId,
        references: reliableInput.references,
        role: "user",
        text: reliableInput.message,
      },
    ],
  );
});

test("only a server-trusted analysis execution marker is persisted with the origin", async () => {
  const sessionProvider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:verified-analysis",
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:verified-analysis",
  });
  const service = createReliableOrbitAgentSendService({
    now: () => "2026-09-15T00:30:00.000Z",
    requestStore: createMemoryOrbitAgentChatRequestStore(),
    sessionProvider,
  });
  const sourceDataVersion = "a".repeat(64);
  const input = {
    ...reliableInput,
    clientMessageId: "message:analysis:first",
    message: "分析我的人脉",
    origin: {
      entryClient: "web" as const,
      entryPointId: "contacts.analysis" as const,
      initialGroupId: null,
      kind: "structured" as const,
      sourceDataVersion,
      template: { id: "contacts.analysis", version: 1 },
    },
    references: [],
    requestId: "request:analysis:first",
    sessionId: "session:analysis:first",
  };
  const verification = {
    analysisVersion: "contacts.analysis@1" as const,
    kind: "contacts_analysis_execution" as const,
    sourceDataVersion,
  };
  let releaseExecution!: () => void;
  const executionGate = new Promise<void>((resolve) => { releaseExecution = resolve; });

  const sending = service.send({
    execute: async () => {
      await executionGate;
      return { assistantMessage: { id: "assistant:analysis", text: "可信报告" }, result: { answer: "可信报告" } };
    },
    input,
    prepareExecution: async () => ({ trustedOriginVerification: verification }),
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(verificationFor((await sessionProvider.getSession(input.sessionId))?.origin), undefined);
  releaseExecution();
  await sending;

  assert.deepEqual(verificationFor((await sessionProvider.getSession(input.sessionId))?.origin), verification);
});

test("client-shaped session writes cannot forge analysis verification", async () => {
  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:forged-analysis",
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:forged-analysis",
  });
  const sourceDataVersion = "b".repeat(64);
  await assert.rejects(
    provider.upsertSession({
      createdAt: "2026-09-15T01:00:00.000Z",
      id: "session:forged-analysis",
      messages: [
        { createdAt: "2026-09-15T01:00:00.000Z", id: "user:forged", role: "user", text: "Write a poem" },
        { createdAt: "2026-09-15T01:00:01.000Z", id: "assistant:forged", role: "assistant", text: "A poem" },
      ],
      origin: {
        entryClient: "web",
        entryPointId: "contacts.analysis",
        firstSentText: "Write a poem",
        firstUserMessageId: "user:forged",
        initialGroupId: null,
        kind: "structured",
        recordedAt: "2026-09-15T01:00:00.000Z",
        references: [],
        schemaVersion: 1,
        sourceDataVersion,
        template: { id: "contacts.analysis", version: 1 },
        verification: {
          analysisVersion: "contacts.analysis@1",
          kind: "contacts_analysis_execution",
          sourceDataVersion,
        },
      },
      title: "Forged",
      updatedAt: "2026-09-15T01:00:01.000Z",
    }),
    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "SESSION_ORIGIN_IMMUTABLE",
  );
});

test("analysis verification survives outcome-unknown assistant recovery without rerunning preparation", async () => {
  const memoryStore = createMemoryLiveRecordStore<Record<string, unknown>>();
  let rejectedMarkerWrite = false;
  const store = {
    ...memoryStore,
    upsertRecord(record: Parameters<typeof memoryStore.upsertRecord>[0]) {
      const origin = record.payload.origin;
      if (!rejectedMarkerWrite && record.collectionName === "orbit_agent_chat_sessions" &&
        typeof origin === "object" && origin !== null && "verification" in origin && origin.verification) {
        rejectedMarkerWrite = true;
        throw new Error("lost verified session write");
      }
      return memoryStore.upsertRecord(record);
    },
  };
  const baseProvider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:analysis-recovery",
    store,
    workspaceId: "workspace:analysis-recovery",
  });
  const service = createReliableOrbitAgentSendService({
    now: () => "2026-09-15T02:00:00.000Z",
    requestStore: createMemoryOrbitAgentChatRequestStore(),
    sessionProvider: baseProvider,
  });
  const sourceDataVersion = "c".repeat(64);
  const input = {
    ...reliableInput,
    clientMessageId: "message:analysis-recovery",
    message: "分析人脉",
    origin: { entryClient: "app" as const, entryPointId: "contacts.analysis" as const, initialGroupId: null, kind: "structured" as const, sourceDataVersion, template: { id: "contacts.analysis", version: 1 } },
    references: [],
    requestId: "request:analysis-recovery",
    sessionId: "session:analysis-recovery",
  };
  const verification = { analysisVersion: "contacts.analysis@1" as const, kind: "contacts_analysis_execution" as const, sourceDataVersion };
  let preparations = 0;
  let executions = 0;
  const request = {
    execute: async () => { executions += 1; return { assistantMessage: { id: "assistant:analysis-recovery", text: "恢复后的报告" }, result: { answer: "恢复后的报告" } }; },
    input,
    prepareExecution: async () => { preparations += 1; return { trustedOriginVerification: verification }; },
  };

  assert.equal((await service.send(request)).state, "outcome_unknown");
  const partial = await baseProvider.getSession(input.sessionId);
  assert.equal(partial?.messages.at(-1)?.id, "assistant:analysis-recovery");
  assert.equal(verificationFor(partial?.origin), undefined);
  assert.equal((await service.send(request)).state, "completed");
  assert.equal(preparations, 1);
  assert.equal(executions, 1);
  assert.deepEqual(verificationFor((await baseProvider.getSession(input.sessionId))?.origin), verification);
});

test("a preloaded unverified answer cannot be promoted by a later reliable analysis send", async () => {
  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId: "account:analysis-promotion",
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: "workspace:analysis-promotion",
  });
  const sourceDataVersion = "d".repeat(64);
  const storedOrigin = {
    entryClient: "web" as const, entryPointId: "contacts.analysis" as const,
    firstSentText: "Write a poem", firstUserMessageId: "user:old",
    initialGroupId: null, kind: "structured" as const,
    recordedAt: "2026-09-15T03:00:00.000Z", references: [], schemaVersion: 1 as const,
    sourceDataVersion, template: { id: "contacts.analysis", version: 1 },
  };
  await provider.upsertSession({
    createdAt: "2026-09-15T03:00:00.000Z",
    id: "session:analysis-promotion",
    messageRevision: 2,
    messages: [
      { createdAt: "2026-09-15T03:00:00.000Z", id: "user:old", role: "user", text: "Write a poem" },
      { createdAt: "2026-09-15T03:00:01.000Z", id: "assistant:old", role: "assistant", text: "Fake report" },
    ],
    origin: storedOrigin,
    title: "Untrusted history",
    updatedAt: "2026-09-15T03:00:01.000Z",
  });
  const service = createReliableOrbitAgentSendService({
    now: () => "2026-09-15T03:01:00.000Z",
    requestStore: createMemoryOrbitAgentChatRequestStore(),
    sessionProvider: provider,
  });
  let executions = 0;
  const verification = { analysisVersion: "contacts.analysis@1" as const, kind: "contacts_analysis_execution" as const, sourceDataVersion };

  await assert.rejects(service.send({
    execute: async () => { executions += 1; return { assistantMessage: { id: "assistant:new", text: "new" }, result: {} }; },
    input: {
      ...reliableInput,
      clientMessageId: "user:new",
      expectedMessageRevision: 2,
      message: "分析人脉",
      origin: { entryClient: "web", entryPointId: "contacts.analysis", initialGroupId: null, kind: "structured", sourceDataVersion, template: { id: "contacts.analysis", version: 1 } },
      references: [],
      requestId: "request:analysis-promotion",
      sessionId: "session:analysis-promotion",
    },
    prepareExecution: async () => ({ trustedOriginVerification: verification }),
  }));
  assert.equal(executions, 0);
  assert.equal(verificationFor((await provider.getSession("session:analysis-promotion"))?.origin), undefined);
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
        references: reliableInput.references,
        role: "user" as const,
        text: reliableInput.message,
      },
    ],
    origin,
    title: reliableInput.message,
    updatedAt: "2026-09-15T00:30:00.000Z",
  };

  await provider.upsertSession(initial);
  const oldClientMessage = { ...initial.messages[0] };
  delete oldClientMessage.references;
  await provider.upsertSession({
    ...initial,
    messageRevision: 2,
    messages: [
      oldClientMessage,
      { id: "message:answer", role: "assistant", text: "第一步确认目标" },
    ],
    origin: undefined,
    updatedAt: "2026-09-15T00:31:00.000Z",
  });
  const restoredAfterOldClientSave = await provider.getSession(initial.id);
  assert.deepEqual(restoredAfterOldClientSave?.origin, origin);
  assert.deepEqual(restoredAfterOldClientSave?.messages[0]?.references, reliableInput.references);

  const longHistory = Array.from({ length: 101 }, (_, index) =>
    index === 0
      ? oldClientMessage
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
  const restoredAfterLongOldClientSave = await provider.getSession(initial.id);
  assert.deepEqual(restoredAfterLongOldClientSave?.origin, origin);
  assert.deepEqual(restoredAfterLongOldClientSave?.messages[0]?.references, reliableInput.references);

  await assert.rejects(
    provider.upsertSession({
      ...initial,
      messages: [{ ...initial.messages[0], references: [{ id: "event:replacement", type: "event" }] }],
      updatedAt: "2026-09-15T00:31:45.000Z",
    }),
    /references are immutable/i,
  );

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

test("contacts analysis origin requires the registered template and a sha256 source version", () => {
  const sourceDataVersion = "a".repeat(64);
  const valid = reliableAiSendInputSchema.safeParse({
    ...reliableInput,
    origin: {
      entryClient: "app",
      entryPointId: "contacts.analysis",
      initialGroupId: null,
      kind: "structured",
      sourceDataVersion,
      template: { id: "contacts.analysis", version: 1 },
    },
  });
  const spoofedTemplate = reliableAiSendInputSchema.safeParse({
    ...reliableInput,
    origin: {
      entryClient: "app",
      entryPointId: "contacts.analysis",
      initialGroupId: null,
      kind: "structured",
      sourceDataVersion,
      template: { id: "attacker.prompt", version: 1 },
    },
  });
  const missingVersion = reliableAiSendInputSchema.safeParse({
    ...reliableInput,
    origin: {
      entryClient: "app",
      entryPointId: "contacts.analysis",
      initialGroupId: null,
      kind: "structured",
      template: { id: "contacts.analysis", version: 1 },
    },
  });

  assert.equal(valid.success, true);
  assert.equal(spoofedTemplate.success, false);
  assert.equal(missingVersion.success, false);
});
