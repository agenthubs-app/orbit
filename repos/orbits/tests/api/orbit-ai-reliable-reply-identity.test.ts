import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createMemoryOrbitAgentChatRequestStore, createReliableOrbitAgentSendService, ReliableSendError } from "../../features/orbit-ai/reliable-send-service";
import { createStorageOrbitAgentChatSessionProvider, OrbitAgentChatSessionWriteError } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";

test("reliable POST gives each reply a stable request identity and persists the final answer across turns and retry", async () => {
  const requestStore = createMemoryOrbitAgentChatRequestStore();
  const sessionProvider = createStorageOrbitAgentChatSessionProvider({
    actorId: "actor:qa", workspaceId: "workspace:reply-identity", store: createMemoryLiveRecordStore<Record<string, unknown>>(),
  });
  let calls = 0;
  const boundaries: Record<string, unknown> = {
    "../../../../shared/config/feature-mode": { resolveFeatureMode: () => "live" },
    "./request-context": { resolveOrbitAgentConversationRequestContext: async () => ({ actorId: "actor:qa", runtime: {
      createRun: async () => ({ runId: "run:qa", status: "completed" }), addRunStep: async () => {},
    } }) },
    "../../../../features/orbit-ai/service-factory": { createOrbitAgentConversationServiceForActor: () => ({ sendMessage: async () => {
      calls++;
      return { success: true, data: { activeConversationId: "conversation:legacy", assistantMessage: `final answer ${calls}`,
        messages: [{ role: "assistant", messageId: "orbit-agent-gemini-assistant-latest", content: `planning preamble ${calls}`, createdAt: "2026-06-27T00:01:01Z", conversationId: "conversation:legacy", evidenceIds: [] }],
        artifacts: [], proposedActionRequests: [],
      } };
    } }) },
    "../../../../features/orbit-ai/task-interaction-service-factory": { createConfiguredOrbitAiTaskInteractionService: () => ({ handle: async () => ({ remainingActionRequests: [] }) }) },
    "../../../../features/agent/memory/service-factory": { createAgentMemoryService: () => ({ getSettings: async () => ({}), context: async () => undefined }) },
    "../../../../features/agent/feedback/service-factory": { createAgentFeedbackService: () => ({ context: async () => undefined }) },
    "../../../../features/agent/preferences": { createAgentPreferencesService: () => ({ get: async () => ({}) }) },
    "../../../../features/integrations/service-factory": { createConfiguredOrbitIntegrationService: () => undefined },
    "../../../../features/orbit-ai/reliable-send-service": { createReliableOrbitAgentSendService, ReliableSendError },
    "../../../../features/orbit-ai/storage/orbit-agent-chat-request-store": { createOrbitAgentChatRequestStore: () => requestStore },
    "../../../../features/orbit-ai/storage/orbit-agent-chat-session-provider-factory": { createOrbitAgentChatSessionProvider: () => sessionProvider },
    "../../../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider": { OrbitAgentChatSessionWriteError },
    "../../../../features/contacts/service-factory": { createContactDetailTagStatusService: () => ({}) },
  };
  const url = new URL("../../app/api/ai/conversations/route.ts", import.meta.url);
  const require = createRequire(url);
  const source = ts.transpileModule(readFileSync(url, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((id: string) => {
    if (Object.hasOwn(boundaries, id)) return boundaries[id];
    if (id === "next/server" || id.startsWith("../../../../shared/") || id.endsWith("/ai-session-reference-authorization")) return require(id);
    return new Proxy({}, { get(_target, key) { throw new Error(`Unexpected dependency: ${id}.${String(key)}`); } });
  }, module, module.exports);
  const post = (module.exports as { POST: (request: Request) => Promise<Response> }).POST;
  const input = (turn: number) => ({ protocolVersion: 2, sessionId: "session:two-turns", requestId: `request:turn-${turn}`,
    clientMessageId: `user:turn-${turn}`, expectedMessageRevision: (turn - 1) * 2, references: [], locale: "zh", message: `只读查询第${turn}项`,
  });
  const send = async (turn: number) => {
    const response = await post(new Request("http://orbit.local/api/ai/conversations", { method: "POST", body: JSON.stringify(input(turn)) }));
    assert.equal(response.status, 200);
    return response.json();
  };
  const first = await send(1);
  const second = await send(2);
  const retry = await send(2);
  assert.equal(calls, 2);
  assert.equal(first.data.messages[0].messageId, "assistant:request:turn-1");
  assert.equal(second.data.messages[0].messageId, "assistant:request:turn-2");
  assert.equal(second.data.messages[0].content, "final answer 2");
  assert.equal(retry.data.messages[0].messageId, second.data.messages[0].messageId);
  const persisted = await sessionProvider.getSession("session:two-turns");
  assert.equal(persisted?.messageRevision, 4);
  assert.deepEqual(persisted?.messages.map(({ id, role, text }) => ({ id, role, text })), [
    { id: "user:turn-1", role: "user", text: "只读查询第1项" },
    { id: "assistant:request:turn-1", role: "assistant", text: "final answer 1" },
    { id: "user:turn-2", role: "user", text: "只读查询第2项" },
    { id: "assistant:request:turn-2", role: "assistant", text: "final answer 2" },
  ]);
});
