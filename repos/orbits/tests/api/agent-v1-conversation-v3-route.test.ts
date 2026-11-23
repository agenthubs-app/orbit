import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

import { handleAgentV1Send } from "../../features/agent-v1/entry/http";
import { readAgentV1Mode } from "../../features/agent-v1/entry/mode";
import { closeLegacyWrites, handleLegacyClientSend, legacyClientResponse, legacyStaysOnOldPath } from "../../features/agent-v1/rollout/legacy-client";
import { settleSession, type AgentEntryDependencies } from "../../features/agent-v1/entry/service";
import { createMemoryAgentEntryStore } from "../../features/agent-v1/entry/store";
import { readEntityDraftIntent } from "../../features/orbit-ai/entity-drafts/contract";
import { createMemoryOrbitAgentChatRequestStore, createReliableOrbitAgentSendService, ReliableSendError } from "../../features/orbit-ai/reliable-send-service";
import { createStorageOrbitAgentChatSessionProvider, OrbitAgentChatSessionWriteError } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

/**
 * AG01-1 at the route (POST /api/ai/conversations): protocol 3 answers with requestId and status
 * before the runtime has returned, and only while ORBIT_AGENT_V1_MODE=on. With the switch off,
 * protocol 3 is refused and protocol 2 answers byte for byte as before (and also with it on).
 */

function loadRoute(entryDependencies: AgentEntryDependencies) {
  const requestStore = createMemoryOrbitAgentChatRequestStore();
  const sessionProvider = createStorageOrbitAgentChatSessionProvider({ actorId: "actor:qa", store: createMemoryLiveRecordStore<Record<string, unknown>>(), workspaceId: "workspace:v3-route" });
  const legacy = { calls: 0 };
  const shadowed = { calls: 0 };
  const boundaries: Record<string, unknown> = {
    "../../../../shared/config/feature-mode": { resolveFeatureMode: () => "live" },
    "./request-context": { resolveOrbitAgentConversationRequestContext: async () => ({ actorId: "actor:qa", runtime: {} }) },
    "../../../../features/orbit-ai/service-factory": { createOrbitAgentConversationServiceForActor: () => ({ sendMessage: async () => {
      legacy.calls += 1;
      return { success: true, data: { activeConversationId: "conversation:legacy", assistantMessage: "final answer",
        messages: [{ role: "assistant", messageId: "m", content: "final answer", createdAt: "2026-06-27T00:01:01Z", conversationId: "conversation:legacy", evidenceIds: [] }],
        artifacts: [], proposedActionRequests: [] } };
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
    "../../../../features/orbit-ai/entity-drafts/contract": { readEntityDraftIntent },
    "../../../../features/orbit-ai/entity-drafts/service-factory": { createConfiguredEntityDraftService: () => { throw new Error("an ordinary turn must not build the entity draft service"); } },
    "../../../../features/agent-v1/entry/http": { handleAgentV1Send: (input: Parameters<typeof handleAgentV1Send>[0]) => handleAgentV1Send({ ...input, dependencies: entryDependencies }) },
    // AG18: the switch as the environment sets it; an old client's message goes to the same new entry.
    "../../../../features/agent-v1/entry/mode": { readAgentV1Mode },
    "../../../../features/agent-v1/rollout/legacy-client": {
      closeLegacyWrites,
      handleLegacyClientSend: (input: Parameters<typeof handleLegacyClientSend>[0]) => handleLegacyClientSend({ ...input, deps: { entry: { ...entryDependencies, schedule: (task) => { void task(); } }, messageRevision: async () => 2, pollMs: 5, waitMs: 2000 } }),
      legacyClientResponse,
      legacyStaysOnOldPath,
    },
    "../../../../features/agent-v1/rollout/shadow": { oldCardOpsOf: async () => [], scheduleShadowComparison: () => { shadowed.calls += 1; } },
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
  const POST = (module.exports as { POST: (request: Request) => Promise<Response> }).POST;
  return { POST, legacy, shadowed };
}

function stuckEntry() {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => { release = resolve; });
  let executions = 0;
  const dependencies: AgentEntryDependencies = {
    execute: async () => {
      executions += 1;
      await opened;
      return { sourceRefs: [], text: "三个话题" };
    },
    store: createMemoryAgentEntryStore(),
  };
  return { dependencies, executions: () => executions, release };
}

const post = (POST: (request: Request) => Promise<Response>, body: unknown) =>
  POST(new Request("http://orbit.local/api/ai/conversations", { body: JSON.stringify(body), method: "POST" }));

const v2 = { clientMessageId: "user:1", expectedMessageRevision: 0, locale: "zh", message: "只读查询", protocolVersion: 2, references: [], requestId: "request:1", sessionId: "session:v2" };
const v3 = { clientMessageId: "user:v3", locale: "zh", message: "帮我想三个话题", protocolVersion: 3, references: [], sessionId: "session:v3" };

async function withMode<T>(mode: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env.ORBIT_AGENT_V1_MODE;
  if (mode === undefined) delete process.env.ORBIT_AGENT_V1_MODE;
  else process.env.ORBIT_AGENT_V1_MODE = mode;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.ORBIT_AGENT_V1_MODE;
    else process.env.ORBIT_AGENT_V1_MODE = previous;
  }
}

test("switch off: protocol 3 is refused and runs nothing", async () => {
  await withMode(undefined, async () => {
    const entry = stuckEntry();
    const { POST, legacy } = loadRoute(entry.dependencies);
    const response = await post(POST, v3);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
    assert.equal(entry.executions(), 0);
    assert.equal(legacy.calls, 0, "protocol 3 does not fall back to the unversioned send");
  });
  await withMode("shadow", async () => {
    const { POST } = loadRoute(stuckEntry().dependencies);
    assert.equal((await post(POST, v3)).status, 400, "shadow is treated as off in AG01");
  });
});

test("protocol 2: the old pipeline with the switch off; the new entry, waited for and answered in the old shape, with it on (AG18)", async () => {
  const off = await withMode(undefined, async () => {
    const { POST, legacy } = loadRoute(stuckEntry().dependencies);
    const response = await post(POST, v2);
    assert.equal(legacy.calls, 1);
    return { body: await response.json(), status: response.status };
  });
  assert.equal(off.status, 200);
  assert.equal(off.body.data.reliableSend.protocolVersion, 2);
  assert.equal(off.body.data.reliableSend.state, "completed");
  await withMode("on", async () => {
    const entry = stuckEntry();
    const { POST, legacy } = loadRoute(entry.dependencies);
    entry.release();
    const response = await post(POST, v2);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(entry.executions(), 1, "protocol 2 is answered by the new entry");
    assert.equal(legacy.calls, 0, "the old pipeline (direct to-do, typed confirmation) is not run");
    assert.equal(body.data.assistantMessage, "三个话题");
    assert.equal(body.data.state, "success");
    assert.equal(body.data.reliableSend.protocolVersion, 2);
    assert.equal(body.data.reliableSend.requestId, "request:1");
    assert.equal(body.data.reliableSend.state, "completed");
    assert.equal("actionPreview" in body.data, false);
  });
});

test("shadow: the old pipeline answers and the shadow pass is scheduled once per request (AG18)", async () => {
  await withMode("shadow", async () => {
    const entry = stuckEntry();
    const { POST, legacy, shadowed } = loadRoute(entry.dependencies);
    const response = await post(POST, v2);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.assistantMessage, "final answer");
    assert.equal(legacy.calls, 1);
    assert.equal(entry.executions(), 0, "the user's answer never comes from the new side");
    assert.equal(shadowed.calls, 1);
    // The same request asked again is a replay: no second shadow pass.
    await post(POST, v2);
    assert.equal(shadowed.calls, 1);
  });
});

test("switch on: protocol 3 answers 202 with requestId and status while the runtime is still running", async () => {
  await withMode("on", async () => {
    const entry = stuckEntry();
    const { POST, legacy } = loadRoute(entry.dependencies);
    const first = await post(POST, v3);
    assert.equal(first.status, 202);
    const receipt = (await first.json()).data.agentRequest;
    assert.equal(receipt.protocolVersion, 3);
    assert.match(receipt.requestId, /^agreq_/u);
    assert.ok(["queued", "running"].includes(receipt.status));
    assert.equal(receipt.replayed, false);

    const resend = await post(POST, v3);
    assert.equal(resend.status, 202);
    const replay = (await resend.json()).data.agentRequest;
    assert.equal(replay.requestId, receipt.requestId);
    assert.equal(replay.replayed, true);

    const reused = await post(POST, { ...v3, message: "别的话" });
    assert.equal(reused.status, 409);
    const invalid = await post(POST, { ...v3, message: "" });
    assert.equal(invalid.status, 400);
    const analysis = await post(POST, { ...v3, clientMessageId: "user:analysis", origin: { entryClient: "web", entryPointId: "contacts.analysis", initialGroupId: null, kind: "structured", sourceDataVersion: "a".repeat(64), template: { id: "contacts.analysis", version: 1 } } });
    assert.equal(analysis.status, 400, "the contacts analysis entry stays on protocol 2 for now");

    entry.release();
    await settleSession("actor:qa", "session:v3");
    assert.equal(entry.executions(), 1);
    assert.equal(legacy.calls, 0, "the new entry does not run the protocol-2 pipeline");
  });
});
