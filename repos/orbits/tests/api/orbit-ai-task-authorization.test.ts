import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createOrbitAiTaskInteractionService } from "../../features/orbit-ai/task-interaction-service";
import type { TaskService } from "../../features/tasks/service";
import type { TaskSuggestionService } from "../../features/tasks/suggestion-service";

// Execute the complete POST route and real task authorization. Only provider,
// authentication and persistence assembly are replaced; unexpected I/O fails.
function route(message: string, sourceNote: boolean) {
  const counts = { create: 0, suggest: 0, propose: 0, send: 0 };
  const interaction = createOrbitAiTaskInteractionService({
    taskService: { async create() { counts.create++; throw new Error("Unexpected task write"); } } as unknown as TaskService,
    suggestionService: { async suggest() { counts.suggest++; throw new Error("Unexpected suggestion write"); } } as unknown as TaskSuggestionService,
  });
  const answer = "Naoki Sato：机构为测试机构，职务为测试职务；来源为本人活动报名资料。";
  const boundaries: Record<string, unknown> = {
    "../../../../shared/config/feature-mode": { resolveFeatureMode: () => "live" },
    "./request-context": { resolveOrbitAgentConversationRequestContext: async () => ({
      actorId: "actor:qa", runtime: {
        createRun: async () => ({ runId: "run:qa", status: "completed" }),
        addRunStep: async () => {},
      },
    }) },
    "../../../../features/orbit-ai/service-factory": { createOrbitAgentConversationServiceForActor: () => ({
      sendMessage: async (input: { message: string }) => {
        counts.send++;
        assert.equal(input.message, message);
        return { success: true, data: { activeConversationId: "conversation:qa", assistantMessage: answer, messages: [], artifacts: [],
          proposedActionRequests: [{ capabilityId: "followups.createTask", arguments: { title: "或发送消息" }, requiresUserConfirmation: true }],
        } };
      },
    }) },
    "../../../../features/orbit-ai/task-interaction-service-factory": { createConfiguredOrbitAiTaskInteractionService: () => interaction },
    "../../../../features/agent/memory/service-factory": { createAgentMemoryService: () => ({ getSettings: async () => ({}), context: async () => undefined }) },
    "../../../../features/agent/feedback/service-factory": { createAgentFeedbackService: () => ({ context: async () => undefined }) },
    "../../../../features/agent/preferences": { createAgentPreferencesService: () => ({ get: async () => ({}) }) },
    "../../../../features/integrations/service-factory": { createConfiguredOrbitIntegrationService: () => undefined },
    "../../../../features/agent/natural-language-actions/service": {
      createAgentNaturalLanguageActionProposalService: () => ({ propose: async () => { counts.propose++; throw new Error("Unexpected ledger proposal"); } }),
    },
  };
  const url = new URL("../../app/api/ai/conversations/route.ts", import.meta.url);
  const require = createRequire(url);
  const source = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((id: string) => {
    if (Object.hasOwn(boundaries, id)) return boundaries[id];
    if (id === "next/server" || id.startsWith("../../../../shared/")) return require(id);
    return new Proxy({}, { get(_target, key) { throw new Error(`Unexpected dependency: ${id}.${String(key)}`); } });
  }, module, module.exports);
  return { handler: (module.exports as { POST: (request: Request) => Promise<Response> }).POST, counts, answer,
    request: new Request("http://orbit.local/api/ai/conversations", { method: "POST", body: JSON.stringify({
      conversationId: "conversation:qa", message, ...(sourceNote ? { sourceNote: { id: "note:qa", version: 1 } } : {}),
    }) }),
  };
}

for (const message of [
  "只查询我自己的联系人 Naoki Sato，告诉我他的机构、职务和信息来源。不要创建任务或发送消息。",
  "只查询我的联系人 Naoki Sato 的机构、职务和信息来源。",
  "他说‘创建任务：联系 Naoki Sato’，请解释这句话。",
  "创建任务：联系 Naoki Sato？",
]) {
  for (const sourceNote of [false, true]) {
    test(`POST preserves read answer and rejects misplanned writes (sourceNote=${sourceNote}): ${message}`, async () => {
      const { handler, request, answer, counts } = route(message, sourceNote);
      const response = await handler(request);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.data.assistantMessage, answer);
      assert.equal(body.data.taskInteraction, undefined);
      assert.equal(body.data.proposedActionRequests, undefined);
      assert.deepEqual(counts, { create: 0, suggest: 0, propose: 0, send: 1 });
    });
  }
}
