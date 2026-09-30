import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/agent page renders the real Orbit AI chat experience", async () => {
  const pageSource = source("app/(app)/app/agent/page.tsx");
  // iOrbit 任务 6a：`orbit-real-agent.tsx` 删除，作用域断言改指在售的壳。
  const agentSource = source("app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx");
  const agentModelSource = source(
    "app/(app)/app/orbit-agent-route-view-model.ts",
  );

  assert.match(pageSource, /IOrbitShell/);
  // Sprint 0104: the legacy chat route model is retired; the page no longer reads chat data.
  assert.match(pageSource, /createOrbitAgentStarterViewModel\(\)/);
  assert.doesNotMatch(pageSource, /loadAppChatRouteViewModel|composeOrbitAgentEntryViewModel|compose-app-chat/);
  assert.match(pageSource, /getOrbitServerLanguage/);
  assert.match(pageSource, /localizeOrbitTree/);
  assert.match(pageSource, /await auth\(\)/);
  assert.match(
    pageSource,
    /redirect\("\/app\/account\/login\?next=%2Fapp%2Fagent"\)/,
  );
  assert.doesNotMatch(pageSource, /firstSearchParam\(resolvedSearchParams, "action"\)/);
  assert.doesNotMatch(pageSource, /firstSearchParam\(resolvedSearchParams, "scenario"\)/);
  assert.doesNotMatch(pageSource, /firstSearchParam\(resolvedSearchParams, "mode"\)/);
  assert.doesNotMatch(pageSource, /AppAgentCommandCenter/);
  assert.doesNotMatch(pageSource, /getOrbitAgentViewModel/);
  assert.doesNotMatch(
    agentModelSource,
    /getOrbitAgentViewModel|getOrbitHybridRouteData/,
  );
  assert.match(agentSource, /data-orbit-real-page="agent"/);
});

test("/app/agent keeps the composer reachable with the starter view model", async () => {
  const { createOrbitAgentStarterViewModel } = await import(
    "../../app/(app)/app/orbit-agent-route-view-model"
  );
  const { IOrbitShell } = await import(
    "../../app/(app)/app/agent/iorbit-0918/iorbit-shell"
  );
  const entryModel = { viewModel: createOrbitAgentStarterViewModel() };

  assert.deepEqual(entryModel.viewModel.history, []);
  assert.deepEqual(entryModel.viewModel.scenarios.people.items, []);
  assert.deepEqual(entryModel.viewModel.scenarios.events.items, []);
  assert.deepEqual(entryModel.viewModel.scenarios.peopleToEvents.items, []);
  assert.equal(entryModel.viewModel.suggests.length, 3);

  const html = renderToStaticMarkup(
    React.createElement(IOrbitShell, {
      home: null,
      initialDeepLink: true,
      viewModel: entryModel.viewModel,
    }),
  );

  assert.match(html, /data-orbit-real-page="agent"/);
  assert.doesNotMatch(html, /No chat context is ready/);

  // 输入框已从这一页提取到 layout 级的全局提问入口，所以单独渲染对话壳
  // 时它本来就不该出现在 HTML 里。这一页现在的责任是把自己的 ask 注册成落点——
  // 没注册，全局输入框就会退回「跳转」行为，在 iOrbit 页上表现为原地打转。
  // 输入框本身在 /app/agent 上确实可达，由 orbit-global-ask-routes 的默认展开
  // 用例 + 浏览器验证覆盖。
  // iOrbit 任务 1b：ask-target 的注册搬进 `use-agent-chat.ts`，断言随之改指。
  const chatHookSource = source("app/(app)/app/agent/iorbit-0918/use-agent-chat.ts");

  assert.match(chatHookSource, /useOrbitAskTarget\(askTarget\)/);
  assert.match(chatHookSource, /onAsk: ask/);
});

