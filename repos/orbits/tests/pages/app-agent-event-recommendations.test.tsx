import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(pageSource, /searchParams/);
  assert.match(pageSource, /loadAppChatRouteViewModel/);
  assert.match(agentSource, /artifactOfKind\(\s*payload\.data\.artifacts,\s*"event_recommendations"/);
  assert.match(agentSource, /eventItemsFromArtifact\(eventArtifact\)/);
  assert.match(agentSource, /artifactMetadataValue\(item, \["开始", "Start"\]\)/);
  assert.match(agentSource, /score: Number\.isFinite\(score\)/);
  assert.match(agentSource, /howto: item\.body/);
  assert.match(agentSource, /reason: item\.reason/);
  assert.match(agentSource, /function AgentEventRow/);
  assert.match(agentSource, /navigate\(`\/events\/\$\{event\.code\}`\)/);
});

test("/app/agent keeps client-side deep-link prompts and contextual discovery suggestions", () => {
  const pageSource = readProjectFile("app/(app)/app/agent/page.tsx");
  const agentSource = readProjectFile(
    "app/(app)/app/agent/orbit-real-agent.tsx",
  );

  assert.match(pageSource, /firstSearchParam/);
  assert.match(
    pageSource,
    /typeof first === "string" && first\.trim\(\) \? first\.trim\(\) : null/,
  );
  assert.match(agentSource, /function currentAgentQuery/);
  assert.match(agentSource, /new URLSearchParams\(window\.location\.search\)\.get\("q"\)/);
  assert.match(agentSource, /viewModel\.suggests\.map/);
  assert.match(agentSource, /onPick\(suggest\.q\)/);
  // The one-line placeholder that named all three discovery intents ("what you
  // want to do, who to meet, which event to attend") became a rotating hint
  // list with one hint per intent. Pin the list and all three intents so the
  // suggestions cannot quietly shrink back to a bare input.
  assert.match(agentSource, /const hints = useMemo\(/);
  assert.match(agentSource, /Add my next step to my follow-ups/);
  assert.match(agentSource, /Who should I prioritize at my next event\?/);
  assert.match(agentSource, /Which events this month are worth going to\?/);
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
