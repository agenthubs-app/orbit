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
  assert.ok(await firstProactiveMessageId());
  const { createOrbitAgentStarterViewModel } = await import(
    "../../app/(app)/app/orbit-agent-route-view-model"
  );
  const { IOrbitShell } = await import(
    "../../app/(app)/app/agent/iorbit-0918/iorbit-shell"
  );

  const html = renderToStaticMarkup(
    <IOrbitShell
      home={null}
      initialDeepLink
      viewModel={createOrbitAgentStarterViewModel()}
    />,
  );

  assert.match(html, /data-orbit-real-page="agent"/);
  assert.doesNotMatch(
    html,
    /主动提醒|Seed investor preparation call|data-orbit-proactive-context/,
  );
});

test("proactive route composition stays out of API routes and presenter-only files", () => {
  const agentPageSource = source("app/(app)/app/agent/page.tsx");

  // Sprint 0104：旧 chat 组合文件已删除，agent 页只用 starter view model。
  assert.doesNotMatch(agentPageSource, /app\/api\/(?!_shared)/);
  assert.doesNotMatch(
    agentPageSource,
    /loadOrbitAiProactiveCalendarMessagesForApp|createAsyncRelationshipConversationService|loadAppChatRouteViewModel/,
  );
});
