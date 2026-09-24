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

// iOrbit 任务 6a：原来这里有一条 "/app/chat does not surface fixture-backed proactive
// calendar messages"，渲染的是已删除的 `chat/chat-workspace.tsx`（`/app/chat` 路由整条
// 归并进 `/app/agent`）。同一条保障由下面那条 `/app/agent` 用例承担。

test("/app/agent ignores obsolete fixture proactive ids", async () => {
  const proactive = await firstProactiveMessageId();
  const { loadAppChatRouteViewModel } = await import(
    "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model"
  );
  const { chatRouteToOrbitAgentViewModel } = await import(
    "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter"
  );
  const { IOrbitShell } = await import(
    "../../app/(app)/app/agent/iorbit-0918/iorbit-shell"
  );
  const routeModel = await loadAppChatRouteViewModel(
    { proactive } as unknown as {
      conversation?: string;
      conversationId?: string;
    },
    { actorId: "account:test-proactive-agent" },
  );

  assert.equal(routeModel.state, "success");
  if (routeModel.state !== "success") {
    return;
  }

  const html = renderToStaticMarkup(
    <IOrbitShell
      home={null}
      initialDeepLink
      viewModel={chatRouteToOrbitAgentViewModel(routeModel)}
    />,
  );

  assert.match(html, /data-orbit-real-page="agent"/);
  assert.doesNotMatch(
    html,
    /主动提醒|Seed investor preparation call|data-orbit-proactive-context/,
  );
});

test("proactive route composition stays out of API routes and presenter-only files", () => {
  const chatRouteSource = source(
    "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts",
  );
  const agentPageSource = source("app/(app)/app/agent/page.tsx");

  assert.match(agentPageSource, /loadAppChatRouteViewModel/);
  // iOrbit 任务 6a：`/app/chat` 路由已整条删除（此前是 `/app/agent` 重定向），
  // 对话壳统一在 agent；只剩这两个仍被 `agent/page.tsx` 引用的组合文件。
  assert.doesNotMatch(agentPageSource, /app\/api/);
  assert.doesNotMatch(
    chatRouteSource,
    /loadOrbitAiProactiveCalendarMessagesForApp|createAsyncRelationshipConversationService/,
  );
});
