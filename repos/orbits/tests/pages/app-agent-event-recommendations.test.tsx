import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { iorbitChatSurfaceSource } from "./iorbit-chat-surface-source";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

// iOrbit 任务 1b：纯函数在 `iorbit-model.ts`、对话状态/`ask` 在 `use-agent-chat.ts`，
// JSX 留在 `orbit-real-agent.tsx`。源码断言按此拆成两半。
const IORBIT_MODEL_PATH = "app/(app)/app/agent/iorbit-0918/iorbit-model.ts";
const IORBIT_CHAT_HOOK_PATH = "app/(app)/app/agent/iorbit-0918/use-agent-chat.ts";

async function importProjectModule<TModule>(
  relativePath: string,
): Promise<TModule> {
  return (await import(pathToFileURL(path.join(projectRoot, relativePath)).href)) as TModule;
}

test("/app/agent consumes GET q event-discovery prompts and renders linked event recommendations", async () => {
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
                    confidenceLabel?: string;
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
        };
      };
    };
  }>("features/orbit-ai/mock-conversation-service.ts");

  const prompt =
    "Recommend events where I can meet investors for seed fundraising and founder feedback.";
  const result = serviceModule.createMockOrbitAgentConversationService().sendMessage({
    locale: "en",
    message: prompt,
  });
  const artifact = result.data?.artifacts[0];
  const items = artifact?.result.generatedView?.sections[0]?.items ?? [];
  const first = items[0];
  const metadataText = first?.metadata
    .map((item) => `${item.label}: ${item.value}`)
    .join(" ");

  assert.equal(result.success, true);
  assert.equal(artifact?.task.kind, "event_recommendations");
  assert.equal(artifact?.task.query, prompt);
  assert.ok(items.length >= 2);
  assert.equal(first?.title, "Seed Investor and Founder Matching Salon");
  assert.match(first?.reason ?? "", /why this event/i);
  assert.match(first?.body ?? "", /People to meet/i);
  assert.match(first?.body ?? "", /Timing/i);
  assert.match(first?.confidenceLabel ?? "", /confidence|fit/i);
  assert.match(metadataText ?? "", /Score/i);
  assert.match(metadataText ?? "", /Timing/i);
  assert.match(metadataText ?? "", /People/i);
  assert.equal(
    first?.actions[0]?.href,
    "/app/events/demo-event-1?sourceEventId=event_001",
  );
  assert.equal(first?.actions[0]?.requiresConfirmation, true);
});

test("/app/agent maps event artifacts into reason, timing, confidence, and detail-card fields", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
  // iOrbit 任务 6a：`orbit-real-agent.tsx` 已删除；对话面的源码断言改读
  // `iorbit-chat-surface-source.ts` 合并的那一组在售文件（内容同源，换了住处）。
  const agentSource = iorbitChatSurfaceSource();

  assert.match(pageSource, /searchParams/);
  assert.match(pageSource, /loadAppChatRouteViewModel/);
  const modelSource = readProjectFile(IORBIT_MODEL_PATH);
  const chatHookSource = readProjectFile(IORBIT_CHAT_HOOK_PATH);

  assert.match(chatHookSource, /artifactOfKind\(\s*payload\.data\.artifacts,\s*"event_recommendations"/);
  assert.match(chatHookSource, /eventItemsFromArtifact\(eventArtifact\)/);
  assert.match(modelSource, /artifactMetadataValue\(item, \["开始", "Start"\]\)/);
  assert.match(modelSource, /score: Number\.isFinite\(score\)/);
  assert.match(modelSource, /howto: item\.body/);
  assert.match(modelSource, /reason: item\.reason/);
  assert.match(agentSource, /function AgentEventRow/);
  assert.match(agentSource, /navigate\(`\/events\/\$\{event\.code\}`\)/);
});

test("/app/agent keeps client-side deep-link prompts and contextual discovery suggestions", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
  // iOrbit 任务 6a：`orbit-real-agent.tsx` 已删除；对话面的源码断言改读
  // `iorbit-chat-surface-source.ts` 合并的那一组在售文件（内容同源，换了住处）。
  const agentSource = iorbitChatSurfaceSource();

  assert.match(pageSource, /firstSearchParam/);
  assert.match(
    pageSource,
    /typeof first === "string" && first\.trim\(\) \? first\.trim\(\) : null/,
  );
  assert.match(readProjectFile(IORBIT_MODEL_PATH), /function currentAgentQuery/);
  assert.match(
    readProjectFile(IORBIT_MODEL_PATH),
    /new URLSearchParams\(window\.location\.search\)\.get\("q"\)/,
  );
  assert.match(agentSource, /viewModel\.suggests\.map/);
  assert.match(agentSource, /onPick\(suggest\.q\)/);
  // The one-line placeholder that named all three discovery intents ("what you
  // want to do, who to meet, which event to attend") became a rotating hint
  // list with one hint per intent. Pin the list and all three intents so the
  // suggestions cannot quietly shrink back to a bare input.
  // 提示语随输入框搬到了 layout 级的全局提问入口。
  const composerSource = readProjectFile(
    "app/(app)/app/orbit-global-ask/orbit-global-ask.tsx",
  );

  assert.match(composerSource, /const hints = useMemo\(/);
  assert.match(composerSource, /Add my next step to my follow-ups/);
  assert.match(composerSource, /Who should I prioritize at my next event\?/);
  assert.match(composerSource, /Which events this month are worth going to\?/);
});

test("recommended event detail links resolve through the app event service", async () => {
  const eventModule = await importProjectModule<{
    createMockEventCrudAndImportService: () => {
      getEvent: (input: { eventId: string }) => {
        success: boolean;
        data?: { event: { id: string; title: string } };
        error?: { code: string };
      };
    };
  }>("features/events/event-crud-and-import/mock-service.ts");

  const result = eventModule
    .createMockEventCrudAndImportService()
    .getEvent({ eventId: "event_001" });

  assert.equal(result.success, true);
  assert.equal(result.data?.event.id, "event_001");
  assert.match(result.data?.event.title ?? "", /Investor|Founder/i);
});

test("recommended event detail action reaches the composed app event detail route", async () => {
  const serviceModule = await importProjectModule<{
    createMockOrbitAgentConversationService: () => {
      sendMessage: (input: {
        locale?: "en" | "zh";
        message?: string | null;
      }) => {
        data?: {
          artifacts: readonly {
            result: {
              generatedView: {
                sections: readonly {
                  items: readonly {
                    actions: readonly { href?: string }[];
                  }[];
                }[];
              } | null;
            };
          }[];
        };
      };
    };
  }>("features/orbit-ai/mock-conversation-service.ts");
  const routeModule = await importProjectModule<{
    loadAppEventDetailRoute: (input: { eventId: string; mode?: string }) => Promise<{
      canonicalEvent?: { id: string; title: string };
      routeState: string;
    }>;
  }>(
    "app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service.ts",
  );
  const prompt =
    "Recommend events where I can meet investors for seed fundraising and founder feedback.";
  const result = serviceModule.createMockOrbitAgentConversationService().sendMessage({
    locale: "en",
    message: prompt,
  });
  const href =
    result.data?.artifacts[0]?.result.generatedView?.sections[0]?.items[0]
      ?.actions[0]?.href ?? "";
  const eventId = href.match(/^\/app\/events\/([^?]+)/)?.[1] ?? "";

  const routeModel = await routeModule.loadAppEventDetailRoute({
    eventId,
    mode: "mock",
  });

  assert.equal(routeModel.routeState, "success");
  assert.equal(routeModel.canonicalEvent?.id, "demo-event-1");
  assert.match(href, /sourceEventId=event_001/);
});
