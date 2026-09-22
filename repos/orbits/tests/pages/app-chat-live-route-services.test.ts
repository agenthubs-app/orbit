import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  loadAppChatRouteStateViewModel,
  loadAppChatRouteViewModel,
} from "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model";
import { resolveAppChatRouteServices } from "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-service-factory";

const liveDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;
const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

async function withUnconfiguredLiveChat<T>(
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

async function withModuleMode<T>(
  mode: "mock" | "hybrid" | "live",
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env.ORBIT_MODULE_MODE;

  try {
    process.env.ORBIT_MODULE_MODE = mode;

    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
}

test("app chat route service bundle resolves all child services in live mode", () => {
  const resolution = resolveAppChatRouteServices("live");

  assert.equal(
    resolution.success,
    true,
    resolution.success === false ? resolution.error.message : "",
  );
  assert.equal(resolution.mode, "live");
});

test("app chat route state renders a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveChat(async () => {
    const viewModel = await loadAppChatRouteStateViewModel("failure");

    assert.equal(viewModel.scenario, "failure");
    assert.equal(
      viewModel.errorCode,
      "CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED",
    );
    assert.deepEqual(viewModel.evidenceIds, [
      "evidence:chat-live-store-unconfigured",
      "evidence:chat-writing-assist-live-store-unconfigured",
      "evidence:chat-summary-live-store-unconfigured",
      "evidence:chat-privacy-live-store-unconfigured",
    ]);
  });
});

test("app chat route loader returns a controlled live failure when storage is unconfigured", async () => {
  await withUnconfiguredLiveChat(async () => {
    const viewModel = await loadAppChatRouteViewModel(undefined, {
      actorId: "account:test-chat-live",
    });

    assert.equal(viewModel.state, "route-state");
    if (viewModel.state === "route-state") {
      assert.equal(viewModel.routeState.scenario, "failure");
      assert.equal(
        viewModel.routeState.errorCode,
        "CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED",
      );
    }
  });
});

test("chat adjunct live storage adapters reuse the configured chat record store", () => {
  const adjunctStorageFiles = [
    "features/chat/storage/chat-writing-assist-live-record-provider.ts",
    "features/chat/storage/chat-summary-live-record-provider.ts",
    "features/chat/storage/chat-privacy-controls-live-record-provider.ts",
  ];

  for (const path of adjunctStorageFiles) {
    const contents = source(path);

    assert.match(
      contents,
      /createConfiguredStorageChatRecordStore/,
      `${path} should reuse the configured chat record store`,
    );
    assert.doesNotMatch(
      contents,
      /createPgLiveRecordSqlClient|createPostgresLiveRecordStore/,
      `${path} must not open its own Postgres pool`,
    );
  }
});

test("the agent page authenticates before loading the actor-scoped chat route adapter", () => {
  const routeSource = source(
    "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts",
  );
  const serviceSource = source(
    "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-service-factory.ts",
  );

  // iOrbit 任务 6a：`/app/chat` 路由（页面 + 壳 + 状态边界）已删除。鉴权与
  // actor-scoped 组合本来就已经在 agent route adapter 上（工作台合并），只有那两个
  // 仍被 `agent/page.tsx` 引用的组合文件活下来，断言因此收敛到它们身上。
  const agentPageSource = source("app/(app)/app/agent/page.tsx");
  assert.match(agentPageSource, /await auth\(\)/);
  assert.match(agentPageSource, /redirect\("\/app\/account\/login\?next=%2Fapp%2Fagent"\)/);
  assert.match(agentPageSource, /loadAppChatRouteViewModel\(resolvedSearchParams,\s*\{\s*actorId,/);
  assert.match(routeSource, /createActorScopedAppChatRouteServices\(actorId\)/);
  assert.doesNotMatch(
    routeSource,
    /createOrbitAgentConversationServiceForActor|readAgentPrompt|agentTurnViewModel/,
  );
  for (const factoryName of [
    "createActorScopedChatConversationMessageService",
    "createActorScopedChatPrivacyControlsService",
    "createActorScopedChatSummaryExtractionService",
    "createActorScopedChatWritingAssistService",
  ]) {
    assert.match(serviceSource, new RegExp(`${factoryName}\\(normalizedActorId\\)`));
  }
});

test("chat route adapter feeds live conversation context into the iOrbit shell", async () => {
  await withModuleMode("mock", async () => {
    const { loadAppChatRouteViewModel } = await import(
      "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model"
    );
    const { chatRouteToOrbitAgentViewModel } = await import(
      "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter"
    );
    const { IOrbitShell } = await import(
      "../../app/(app)/app/agent/iorbit-0918/iorbit-shell"
    );
    const routeModel = await loadAppChatRouteViewModel();

    assert.equal(routeModel.state, "success");

    if (routeModel.state !== "success") {
      return;
    }

    const viewModel = chatRouteToOrbitAgentViewModel(routeModel);

    assert.deepEqual(viewModel.history, []);
    assert.match(
      viewModel.suggests.map((item) => item.q).join(" "),
      new RegExp(routeModel.workspace.selectedConversation.participantName),
    );

    const html = renderToStaticMarkup(
      React.createElement(IOrbitShell, { home: null, initialDeepLink: true, viewModel }),
    );

    assert.match(html, /data-orbit-real-page="agent"/);
    assert.match(html, /data-orbit-real-page="iorbit-0918"/);
    // iOrbit 任务 6a：旧 `OrbitRealAgent` 已删除，这条断言改渲染新壳的对话分支
    // （`initialDeepLink` = 服务端解析出的 `?q=`／`?session=`）。断言的点没变：
    // adapter 的 view model 到达了对话屏，且对话屏渲染的是 `AgentWelcome` 空态
    // 而不是空壳。
    assert.match(html, /你想让 iOrbit 做什么/);
    assert.match(html, /它能看到你的活动、报名答案、人脉和约谈/);
    assert.doesNotMatch(html, /class="app-chat-route"/);
    assert.doesNotMatch(html, /data-state-boundary="app-chat-success"/);
    assert.doesNotMatch(html, /<details(?:\s|>)/i);
    assert.doesNotMatch(html, /Evidence source trail|证据来源路径/);
  });
});
