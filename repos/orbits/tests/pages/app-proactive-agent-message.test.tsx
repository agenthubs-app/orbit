import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function source(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

async function importProjectModule<TModule>(
  relativePath: string,
): Promise<TModule> {
  return (await import(pathToFileURL(path.join(projectRoot, relativePath)).href)) as TModule;
}

async function firstProactiveMessageId(): Promise<string> {
  const module = await importProjectModule<{
    loadOrbitAiProactiveCalendarMessagesForApp: () => {
      success: boolean;
      data?: { messages: readonly { messageId: string }[] };
    };
  }>("features/orbit-ai/proactive-calendar-service.ts");
  const result = module.loadOrbitAiProactiveCalendarMessagesForApp();

  assert.equal(result.success, true);
  assert.equal(result.data?.messages.length, 1);

  return result.data?.messages[0]?.messageId ?? "";
}

test("/app/chat does not surface fixture-backed proactive calendar messages", async () => {
  const { loadAppChatRouteViewModel } = await import(
    "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model"
  );
  const { ChatWorkspace } = await import(
    "../../app/(app)/app/chat/chat-workspace"
  );
  const routeModel = await loadAppChatRouteViewModel(undefined, {
    actorId: "account:test-proactive-chat",
  });

  assert.equal(routeModel.state, "success");
  if (routeModel.state !== "success") {
    return;
  }

  const html = renderToStaticMarkup(
    <ChatWorkspace language="zh" workspace={routeModel.workspace} />,
  );

  assert.match(html, /data-orbit-real-page="chat"/);
  assert.doesNotMatch(
    html,
    /data-orbit-proactive-inbox|Upcoming from Orbit Agent|Seed investor preparation call/,
  );
});

test("/app/agent ignores obsolete fixture proactive ids", async () => {
  const proactive = await firstProactiveMessageId();
  const Page = (await importProjectModule<{
    default: (input?: {
      searchParams?: Promise<Record<string, string | string[] | undefined>>;
    }) => Promise<JSX.Element>;
  }>("app/(app)/app/agent/page.tsx")).default;
  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        lang: "zh",
        proactive,
      }),
    }),
  );

  assert.match(html, /data-orbit-route="app-agent-route"/);
  assert.match(html, /data-orbit-real-page="agent"/);
  assert.doesNotMatch(
    html,
    /主动提醒|Seed investor preparation call|data-orbit-proactive-context/,
  );
});

test("proactive route composition stays out of API routes and presenter-only files", () => {
  const chatPageSource = source("app/(app)/app/chat/page.tsx");
  const chatRouteSource = source(
    "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts",
  );
  const agentPageSource = source("app/(app)/app/agent/page.tsx");

  assert.match(agentPageSource, /loadAppChatRouteViewModel/);
  assert.match(chatPageSource, /ChatWorkspace/);
  assert.doesNotMatch(chatPageSource, /app\/api/);
  assert.doesNotMatch(agentPageSource, /app\/api/);
  assert.doesNotMatch(
    chatRouteSource,
    /loadOrbitAiProactiveCalendarMessagesForApp|createAsyncRelationshipConversationService/,
  );
});
