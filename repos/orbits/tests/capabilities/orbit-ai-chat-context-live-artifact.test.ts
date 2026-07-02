import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLiveChatConversationMessageService } from "../../features/chat/live-service";
import { createStorageChatConversationMessageProvider } from "../../features/chat/storage/chat-conversation-live-record-provider";
import { createOrbitAgentArtifactPreviewService } from "../../features/orbit-ai/artifact-task-preview-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("live artifact task service registers chat.context before preview fallback", () => {
  const liveArtifactSource = source("features/orbit-ai/live-artifact-task-service.ts");

  assert.match(
    liveArtifactSource,
    /createOrbitAgentChatContextArtifactService/,
  );
  assert.match(liveArtifactSource, /chatContextService/);
});

test("chat.context artifact reads source-backed live chat conversations", async () => {
  const workspaceId = "workspace:orbit-ai-chat-context-live-artifact-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T19:00:00.000Z",
    store,
    workspaceId,
  });

  const chatService = createLiveChatConversationMessageService({
    provider: createStorageChatConversationMessageProvider({
      sourceLabel: "Orbit AI chat context memory live storage",
      store,
      workspaceId,
    }),
  });
  const serviceModule = await import(
    "../../features/orbit-ai/chat-context-artifact-service"
  );
  const service = serviceModule.createOrbitAgentChatContextArtifactService({
    chatService,
    fallbackService: createOrbitAgentArtifactPreviewService(),
  });

  const result = await service.createArtifactTask({
    kind: "relationship_chat_context",
    locale: "zh",
    query: "帮我整理山田千寻的回复上下文",
    toolArguments: {
      conversationId: "conversation_001",
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.task.kind, "relationship_chat_context");
  assert.equal(result.data?.task.artifactProducer, "relationship_chat_review_producer");
  assert.equal(result.data?.result.safety.liveDatabaseReadExecuted, true);
  assert.equal(result.data?.result.safety.liveDatabaseWriteExecuted, false);
  assert.deepEqual(result.data?.result.provenance.sourceModules, [
    "orbit-ai",
    "chat",
  ]);
  assert.equal(
    result.data?.result.provenance.toolCalls[0]?.toolName,
    "chat.context",
  );
  assert.equal(
    result.data?.result.provenance.toolCalls[0]?.status,
    "completed",
  );
  assert.doesNotMatch(
    result.data?.result.provenance.source ?? "",
    /artifact-task-preview-service/,
  );
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.evidenceIds.includes(
      "evidence:message:0001",
    ),
    true,
  );
  assert.match(
    result.data?.result.generatedView?.summary ?? "",
    /山田 千尋|conversation_001/,
  );
  assert.equal(
    result.data?.result.generatedView?.sections[0]?.items[0]?.actions[0]
      ?.requiresConfirmation,
    true,
  );
});
