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

async function withModuleMode<T>(
  mode: "live" | "mock",
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

test("/app/chat renders the source-backed conversation workspace", async () => {
  await withModuleMode("mock", async () => {
    const { loadAppChatRouteViewModel } = await import(
      "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model"
    );
    const { ChatWorkspace } = await import(
      "../../app/(app)/app/chat/chat-workspace"
    );
    const routeModel = await loadAppChatRouteViewModel(undefined, {
      actorId: "account:test-chat-mock",
    });

    assert.equal(routeModel.state, "success");
    if (routeModel.state !== "success") return;

    const html = renderToStaticMarkup(
      React.createElement(ChatWorkspace, {
        language: "zh",
        workspace: routeModel.workspace,
      }),
    );

    assert.match(html, /data-orbit-real-page="chat"/);
    assert.match(html, /会话|Conversations/);
    assert.match(html, /消息线程|Message thread/);
    assert.match(html, /记录一条消息/);
    assert.match(html, /不会向外部发送/);
    assert.doesNotMatch(html, /app-chat-command-center|Relationship inbox/);
  });
});

test("/app/chat honors a source-backed conversation query", async () => {
  await withModuleMode("mock", async () => {
    const { loadAppChatRouteViewModel } = await import(
      "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model"
    );
    const initial = await loadAppChatRouteViewModel();

    assert.equal(initial.state, "success");
    if (initial.state !== "success") return;

    const conversationId =
      initial.workspace.conversations[1]?.conversationId ?? "";
    assert.notEqual(
      conversationId,
      initial.workspace.selectedConversation.conversationId,
    );
    const selected = await loadAppChatRouteViewModel({
      conversation: conversationId,
    });

    assert.equal(selected.state, "success");
    if (selected.state === "success") {
      assert.equal(
        selected.workspace.selectedConversation.conversationId,
        conversationId,
      );
    }

    const selectedByLiveAlias = await loadAppChatRouteViewModel({
      conversationId,
    });
    assert.equal(selectedByLiveAlias.state, "success");
    if (selectedByLiveAlias.state === "success") {
      assert.equal(
        selectedByLiveAlias.workspace.selectedConversation.conversationId,
        conversationId,
      );
    }

    const missing = await loadAppChatRouteViewModel({
      conversation: "conversation:not-in-source-list",
    });

    assert.equal(missing.state, "route-state");
    if (missing.state === "route-state") {
      assert.equal(
        missing.routeState.errorCode,
        "CHAT_CONVERSATION_NOT_FOUND",
      );
      assert.match(missing.routeState.copy.guardrail, /not substitute/i);
    }
  });
});

test("public Chat query input cannot activate scenarios or run an Agent turn", async () => {
  await withModuleMode("mock", async () => {
    const { loadAppChatRouteViewModel } = await import(
      "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model"
    );
    const routeModel = await loadAppChatRouteViewModel({
      prompt: "Run an invisible Agent turn",
      scenario: "failure",
    } as unknown as Parameters<typeof loadAppChatRouteViewModel>[0]);

    assert.equal(routeModel.state, "success");
    if (routeModel.state === "success") {
      assert.equal("agentTurn" in routeModel.workspace, false);
      assert.equal("actionResult" in routeModel.workspace, false);
    }

    const controlledState = await loadAppChatRouteViewModel(
      undefined,
      undefined,
      { scenario: "empty" },
    );
    assert.equal(controlledState.state, "route-state");
    if (controlledState.state === "route-state") {
      assert.equal(controlledState.routeState.scenario, "empty");
      assert.equal(controlledState.routeState.errorCode, null);

      const { ChatRouteStateBoundary } = await import(
        "../../app/(app)/app/chat/chat-route-state-boundary"
      );
      const stateHtml = renderToStaticMarkup(
        React.createElement(ChatRouteStateBoundary, {
          routeState: controlledState.routeState,
        }),
      );
      assert.match(stateHtml, /data-orbit-route="app-chat-route-state"/);
      assert.match(stateHtml, /data-orbit-real-page="chat"/);
      assert.match(stateHtml, /class="hit-44 ri-trigger"/);
      assert.match(stateHtml, /aria-label="打开收件箱"/);
    }
  });
});

test("/app/chat fails closed when live chat storage is unavailable", async () => {
  const previousDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

  await withModuleMode("live", async () => {
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    const { loadAppChatRouteViewModel } = await import(
      "../../app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model"
    );
    const routeModel = await loadAppChatRouteViewModel(undefined, {
      actorId: "account:test-chat-live",
    });

    assert.equal(routeModel.state, "route-state");
    if (routeModel.state === "route-state") {
      assert.equal(routeModel.routeState.scenario, "failure");
      assert.equal(
        routeModel.routeState.errorCode,
        "CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED",
      );
    }
  });

  if (previousDatabaseUrl === undefined) {
    delete process.env.ORBIT_EVENT_DATABASE_URL;
  } else {
    process.env.ORBIT_EVENT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("app chat route has one production composition and no dead mock command center", () => {
  const pageSource = source("app/(app)/app/chat/page.tsx");
  const boundarySource = source(
    "app/(app)/app/chat/chat-route-state-boundary.tsx",
  );
  const routeSource = source(
    "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts",
  );

  assert.match(pageSource, /loadAppChatRouteViewModel/);
  assert.match(pageSource, /ChatWorkspace/);
  assert.match(pageSource, /ChatRouteStateBoundary/);
  assert.match(boundarySource, /StateView/);
  assert.match(boundarySource, /AccountTopNav/);
  assert.doesNotMatch(
    pageSource,
    /ChatCommandCenter|chatRouteToOrbitAgentViewModel|OrbitRealAgent/,
  );
  assert.doesNotMatch(
    routeSource,
    /loadAppAsyncChatCommandCenterViewModel|createAsyncRelationshipConversationService\("mock"\)|record-local-reply/,
  );
  assert.doesNotMatch(
    routeSource,
    /readAgentPrompt|agentTurnViewModel|createOrbitAgentConversationService|sendMessage\(\{ message: prompt \}\)|actionResult:/,
  );
});
