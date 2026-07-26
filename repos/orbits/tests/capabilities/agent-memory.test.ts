import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type { AgentMemoryRecordPayload } from "../../features/agent/memory/contract";
import { createStorageAgentMemoryService } from "../../features/agent/memory/service";
import { createGeminiOrbitAgentPlanner } from "../../features/orbit-ai/gemini-provider";

test("agent memory is actor scoped and user controlled", async () => {
  const store = createMemoryLiveRecordStore<AgentMemoryRecordPayload>();
  let now = "2026-07-26T12:00:00.000Z";
  const alice = createStorageAgentMemoryService({
    actorId: "alice",
    id: () => "memory-1",
    now: () => now,
    store,
    workspaceId: "workspace",
  });
  const bob = createStorageAgentMemoryService({
    actorId: "bob",
    id: () => "memory-2",
    now: () => now,
    store,
    workspaceId: "workspace",
  });

  const created = await alice.create({
    category: "preference",
    content: "Keep replies concise and in Chinese.",
  });
  assert.equal(created.memoryId, "memory-1");
  assert.equal((await alice.list()).length, 1);
  assert.deepEqual(await bob.list(), []);

  now = "2026-07-26T12:01:00.000Z";
  const updated = await alice.update(created.memoryId, {
    content: "Use Chinese and keep replies to two sentences.",
  });
  assert.equal(
    updated.content,
    "Use Chinese and keep replies to two sentences.",
  );
  assert.deepEqual(await alice.context(), [
    {
      category: "preference",
      content: "Use Chinese and keep replies to two sentences.",
    },
  ]);

  await alice.remove(created.memoryId);
  assert.deepEqual(await alice.list(), []);
});

test("disabling Agent memory removes it from model context without deleting it", async () => {
  const service = createStorageAgentMemoryService({
    actorId: "actor",
    id: () => "memory-1",
    now: () => "2026-07-26T12:00:00.000Z",
    store: createMemoryLiveRecordStore<AgentMemoryRecordPayload>(),
    workspaceId: "workspace",
  });
  await service.create({
    category: "goal",
    content: "Build partnerships with Japanese fintech founders.",
  });

  assert.equal((await service.context()).length, 1);
  const settings = await service.updateSettings({
    allowConversationLearning: true,
    enabled: false,
  });
  assert.equal(settings.enabled, false);
  assert.equal(settings.allowConversationLearning, true);
  assert.deepEqual(await service.context(), []);
  assert.equal((await service.list()).length, 1);
});

test("Agent memory reaches the model as a separate server-trusted context", async () => {
  let providerBody: Record<string, unknown> | null = null;
  const planner = createGeminiOrbitAgentPlanner({
    apiKey: "test-deepseek-key",
    provider: "deepseek",
    fetchImplementation: (async (_url, init) => {
      providerBody = JSON.parse(String(init?.body)) as Record<
        string,
        unknown
      >;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  assistantMessage: "你好，Orbit QA。",
                  intent: "general_chat",
                  toolRequests: [],
                }),
              },
            },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    }) as typeof fetch,
  });

  const result = await planner.plan({
    memory: [
      {
        category: "identity",
        content: "Call me Orbit QA.",
      },
    ],
    message: "How should you address me?",
  });

  assert.equal(result.success, true);
  const messages = providerBody?.messages as
    | readonly { content?: unknown; role?: unknown }[]
    | undefined;
  const userContent = messages?.find(
    (message) => message.role === "user",
  )?.content;
  assert.equal(typeof userContent, "string");
  const payload = JSON.parse(String(userContent)) as {
    userMemory?: unknown;
  };
  assert.deepEqual(payload.userMemory, [
    { category: "identity", content: "Call me Orbit QA." },
  ]);
});
