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

test("/app/chat surfaces proactive calendar messages as a local inbox section linked to Orbit Agent", async () => {
  const Page = (await import("../../app/(app)/app/chat/page")).default;
  const html = renderToStaticMarkup(await Page());

  assert.match(html, /data-orbit-route="app-chat-route"/);
  assert.match(html, /data-orbit-proactive-inbox="calendar-one-hour"/);
  assert.match(html, /Upcoming from Orbit Agent/);
  assert.match(html, /Seed investor preparation call/);
  assert.match(html, /09:45/);
  assert.match(html, /Mina Park/);
  assert.match(html, /Review the investor&#x27;s climate portfolio/);
  assert.match(html, /Open in Orbit Agent/);
  assert.match(html, /href="\/app\/agent\?proactive=[^"]+"/);
  assert.match(html, /data-side-effects="none"/);
  assert.doesNotMatch(html, /External email sent/i);
  assert.doesNotMatch(html, /Push notification delivered/i);
  assert.doesNotMatch(html, /SMS sent/i);
  assert.doesNotMatch(html, /Calendar updated/i);
});

test("/app/agent opens the proactive message as a localized context conversation", async () => {
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
  assert.match(html, /主动提醒/);
  assert.match(html, /Seed investor preparation call|种子投资人准备电话/);
  assert.match(html, /09:45/);
  assert.match(html, /Mina Park/);
  assert.match(html, /climate portfolio|气候领域组合/);
  assert.match(html, /不会发送邮件、短信、推送或修改日历/);
  assert.match(html, /data-orbit-proactive-context="calendar-one-hour"/);
  assert.match(html, /日历活动上下文/);
  assert.match(html, /准备重点/);
  assert.match(html, /本地提醒/);
  assert.match(
    html,
    /data-orbit-agent-submitted-goal="[^"]*(?:Seed investor preparation call|种子投资人准备电话)/,
  );
});

test("proactive route composition stays out of API routes and presenter-only files", () => {
  const chatPageSource = source("app/(app)/app/chat/page.tsx");
  const chatRouteSource = source(
    "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts",
  );
  const chatPresenterSource = source(
    "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-command-center.tsx",
  );
  const agentPageSource = source("app/(app)/app/agent/page.tsx");

  assert.match(chatRouteSource, /loadOrbitAiProactiveCalendarMessagesForApp/);
  assert.match(agentPageSource, /proactive/);
  assert.match(chatPageSource, /ChatCommandCenter/);
  assert.doesNotMatch(chatPageSource, /app\/api/);
  assert.doesNotMatch(agentPageSource, /app\/api/);
  assert.doesNotMatch(chatPresenterSource, /features\/orbit-ai/);
  assert.doesNotMatch(chatPresenterSource, /features\/events/);
});
