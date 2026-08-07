import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createMockOrbitAgentConversationService } from "../../features/orbit-ai/mock-conversation-service";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

async function importProjectModule<TModule>(
  relativePath: string,
): Promise<TModule> {
  return (await import(pathToFileURL(path.join(projectRoot, relativePath)).href)) as TModule;
}

test("/app/agent GET q to-do prompts render source-backed upcoming work", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentConversationService: () => {
      sendMessage: (input: {
        locale?: "en" | "zh";
        message?: string | null;
      }) => {
        success: boolean;
        data?: {
          artifacts: readonly {
            result: {
              generatedView: {
                sections: readonly {
                  items: readonly {
                    actions: readonly {
                      href?: string;
                      label: string;
                      requiresConfirmation: boolean;
                    }[];
                    body?: string;
                    evidenceIds: readonly string[];
                    metadata: readonly { label: string; value: string }[];
                    reason?: string;
                    title: string;
                  }[];
                }[];
                summary: string;
              } | null;
            };
            task: { kind: string; query: string };
          }[];
          routingDecision?: {
            intent: string;
            needsTool: boolean;
            toolFamily: string | null;
          };
        };
      };
    };
  }>("features/orbit-ai/mock-conversation-service.ts");

  const prompt =
    "What should I do today? Summarize my to-do list from conversations and schedule.";
  const result = serviceModule.createMockOrbitAgentConversationService().sendMessage({
    locale: "en",
    message: prompt,
  });
  const artifact = result.data?.artifacts[0];
  const items = artifact?.result.generatedView?.sections[0]?.items ?? [];
  const metadataText = items
    .flatMap((item) => item.metadata.map((entry) => `${entry.label}: ${entry.value}`))
    .join(" ");
  const visibleText = [
    artifact?.result.generatedView?.summary,
    ...items.flatMap((item) => [
      item.title,
      item.body,
      item.reason,
      item.actions[0]?.href,
    ]),
    metadataText,
  ].join(" ");

  assert.equal(result.success, true);
  assert.equal(result.data?.routingDecision?.intent, "todo_synthesis");
  assert.equal(result.data?.routingDecision?.toolFamily, "todo");
  assert.equal(result.data?.routingDecision?.needsTool, true);
  assert.equal(artifact?.task.kind, "followup_queue");
  assert.equal(artifact?.task.query, prompt);
  assert.ok(items.length >= 4);
  assert.match(visibleText, /Upcoming relationship work|upcoming work/i);
  assert.match(visibleText, /Due/i);
  assert.match(visibleText, /Reason/i);
  assert.match(visibleText, /Source context/i);
  assert.match(visibleText, /conversation/i);
  assert.match(visibleText, /schedule/i);
  assert.ok(items.some((item) => item.actions[0]?.href?.startsWith("/app/contacts/")));
  assert.ok(items.some((item) => item.actions[0]?.href?.startsWith("/app/events/")));
  assert.equal(items.every((item) => item.actions[0]?.requiresConfirmation), true);
});

test("/app/agent hydrates submitted to-do prompts through the client conversation API", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(
    pageSource,
    /loadAppChatRouteViewModel\(resolvedSearchParams,\s*\{\s*actorId,/,
  );
  assert.match(agentSource, /function currentAgentQuery/);
  assert.match(agentSource, /const query = currentAgentQuery\(\)/);
  assert.match(agentSource, /void ask\(query\)/);
  assert.match(agentSource, /fetch\("\/api\/ai\/conversations"/);
  assert.match(agentSource, /"followup_queue"/);
  assert.match(agentSource, /todoItemsFromArtifact\(followupArtifact\)/);
  assert.match(agentSource, /function AgentTodoRow/);
});

test("/app/agent q=今日待办 receives ranked source-backed Chinese follow-ups", () => {
  const result = createMockOrbitAgentConversationService().sendMessage({
    locale: "zh",
    message: "今日待办",
  });

  assert.equal(result.success, true);
  if (result.success === false) return;
  const artifact = result.data.artifacts[0];
  const items = artifact?.result.generatedView?.sections[0]?.items ?? [];
  const visibleContract = JSON.stringify({
    assistantMessage: result.data.assistantMessage,
    items,
  });

  assert.equal(artifact?.task.kind, "followup_queue");
  assert.ok(items.length >= 4);
  assert.match(visibleContract, /关系待办/);
  assert.match(visibleContract, /Send the Aoba pilot timeline recap/);
  assert.match(
    visibleContract,
    /Storage Operators Breakfast|Ask Maya whether she is comfortable/,
  );
  assert.match(visibleContract, /到期/);
  assert.match(visibleContract, /原因/);
  assert.match(visibleContract, /来源上下文/);
  assert.match(visibleContract, /conversation/);
  assert.match(visibleContract, /schedule/);
  assert.match(visibleContract, /\/app\/contacts\//);
  assert.match(visibleContract, /\/app\/events\//);
});

test("/app/agent source exposes to-do prompt affordances without owning business logic", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(pageSource, /loadAppChatRouteViewModel/);
  assert.doesNotMatch(pageSource, /mockFollowupTasks|mockEventRecords/);
  assert.match(agentSource, /viewModel\.suggests\.map/);
  assert.match(agentSource, /onPick\(suggest\.q\)/);
  assert.match(agentSource, /"followup_queue"/);
  assert.match(agentSource, /function todoItemsFromArtifact/);
  assert.match(agentSource, /navigate\("\/home\/schedule"\)/);
});

test("/app/agent input has an explicit to-do capable accessible name", () => {
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(agentSource, /en: "Ask Orbit about contacts, events, and relationship to-dos"/);
  assert.match(agentSource, /zh: "询问 Orbit 人脉、活动与关系待办"/);
  assert.match(agentSource, /aria-describedby=\{boundaryId\}/);
  assert.match(agentSource, /en: "Send Ask Orbit message"/);
});
