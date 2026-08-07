import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveAgent<T>(
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const previousDatabaseEnv = new Map<string, string | undefined>(
    liveDatabaseEnvKeys.map((key) => [key, process.env[key]]),
  );

  try {
    process.env.ORBIT_MODULE_MODE = "live";
    for (const key of liveDatabaseEnvKeys) {
      delete process.env[key];
    }

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }

    for (const key of liveDatabaseEnvKeys) {
      const previousValue = previousDatabaseEnv.get(key);

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

test("/app/agent page renders the real Orbit AI chat experience", async () => {
  const pageSource = source("app/(app)/app/agent/page.tsx");
  const agentSource = source("app/(app)/app/agent/orbit-real-agent.tsx");
  const agentModelSource = source(
    "app/(app)/app/orbit-agent-route-view-model.ts",
  );

  assert.match(pageSource, /OrbitRealAgent/);
  assert.match(pageSource, /loadAppChatRouteViewModel/);
  assert.match(pageSource, /composeOrbitAgentEntryViewModel/);
  assert.match(pageSource, /StateView/);
  assert.match(pageSource, /getOrbitServerLanguage/);
  assert.match(pageSource, /localizeOrbitTree/);
  assert.match(pageSource, /await auth\(\)/);
  assert.match(
    pageSource,
    /redirect\("\/app\/account\/login\?next=%2Fapp%2Fagent"\)/,
  );
  assert.match(
    pageSource,
    /loadAppChatRouteViewModel\(resolvedSearchParams,\s*\{\s*actorId,/,
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

test("/app/agent keeps the composer reachable when a new actor has no chat conversations", async () => {
  const { composeOrbitAgentEntryViewModel } = await import(
    "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter"
  );
  const { OrbitRealAgent } = await import(
    "../../app/(app)/app/agent/orbit-real-agent"
  );
  const entryModel = composeOrbitAgentEntryViewModel({
    routeState: {
      copy: {
        description: "No sourced conversations.",
        emptyState: "No conversations.",
        guardrail: "No relationship result is inferred.",
        nextStep: "Ask Orbit a question.",
        purpose: "Start without imported chat history.",
        title: "No chat context is ready",
      },
      errorCode: null,
      evidenceIds: [],
      scenario: "empty",
    },
    state: "route-state",
  });

  assert.equal(entryModel.state, "ready");
  if (entryModel.state !== "ready") return;

  assert.deepEqual(entryModel.viewModel.history, []);
  assert.deepEqual(entryModel.viewModel.scenarios.people.items, []);
  assert.deepEqual(entryModel.viewModel.scenarios.events.items, []);
  assert.deepEqual(entryModel.viewModel.scenarios.peopleToEvents.items, []);
  assert.equal(entryModel.viewModel.suggests.length, 3);

  const html = renderToStaticMarkup(
    React.createElement(OrbitRealAgent, {
      viewModel: entryModel.viewModel,
    }),
  );

  assert.match(html, /data-orbit-real-page="agent"/);
  assert.doesNotMatch(html, /No chat context is ready/);

  // 输入框已从这一页提取到 layout 级的全局提问入口，所以单独渲染 OrbitRealAgent
  // 时它本来就不该出现在 HTML 里。这一页现在的责任是把自己的 ask 注册成落点——
  // 没注册，全局输入框就会退回「跳转」行为，在 iOrbit 页上表现为原地打转。
  // 输入框本身在 /app/agent 上确实可达，由 orbit-global-ask-routes 的默认展开
  // 用例 + 浏览器验证覆盖。
  const agentSource = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.match(agentSource, /useOrbitAskTarget\(askTarget\)/);
  assert.match(agentSource, /onAsk: ask/);
});

test("/app/agent does not turn chat failures or missing conversation ids into a ready Agent", async () => {
  const { composeOrbitAgentEntryViewModel } = await import(
    "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter"
  );
  const copy = {
    description: "Unavailable.",
    emptyState: "Unavailable.",
    guardrail: "Do not substitute data.",
    nextStep: "Reload.",
    purpose: "Fail closed.",
    title: "Unavailable",
  };
  const failure = composeOrbitAgentEntryViewModel({
    routeState: {
      copy,
      errorCode: "CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED",
      evidenceIds: [],
      scenario: "failure",
    },
    state: "route-state",
  });
  const missing = composeOrbitAgentEntryViewModel({
    routeState: {
      copy,
      errorCode: "CHAT_CONVERSATION_NOT_FOUND",
      evidenceIds: [],
      scenario: "empty",
    },
    state: "route-state",
  });

  assert.equal(failure.state, "route-state");
  assert.equal(missing.state, "route-state");
});

test("/app/agent page renders a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveAgent(async () => {
    const { loadAppChatRouteViewModel } = await import(
      "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model"
    );
    const viewModel = await loadAppChatRouteViewModel();

    assert.equal(viewModel.state, "route-state");
    if (viewModel.state === "route-state") {
      assert.equal(viewModel.routeState.scenario, "failure");
      assert.equal(
        viewModel.routeState.errorCode,
        "CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED",
      );
      assert.match(viewModel.routeState.copy.title, /could not load/i);
    }

    const pageSource = source("app/(app)/app/agent/page.tsx");
    assert.match(pageSource, /AgentRouteStateBoundary/);
    assert.match(pageSource, /entryModel\.routeState/);
  });
});
