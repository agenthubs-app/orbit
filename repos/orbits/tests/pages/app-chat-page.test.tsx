import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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
    const Page = (await import("../../app/(app)/app/chat/page")).default;
    const html = renderToStaticMarkup(await Page());

    assert.match(html, /data-orbit-route="app-chat-route"/);
    assert.match(html, /data-orbit-real-page="chat"/);
    assert.match(html, /会话|Conversations/);
    assert.match(html, /消息线程|Message thread/);
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

test("/app/chat fails closed when live chat storage is unavailable", async () => {
  const previousDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

  await withModuleMode("live", async () => {
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    const Page = (await import("../../app/(app)/app/chat/page")).default;
    const html = renderToStaticMarkup(await Page());

    assert.match(html, /data-orbit-route="app-chat-route-state"/);
    assert.match(html, /Chat workspace could not load/);
    assert.doesNotMatch(html, /Relationship inbox|Aoba Mori/);
  });

  if (previousDatabaseUrl === undefined) {
    delete process.env.ORBIT_EVENT_DATABASE_URL;
  } else {
    process.env.ORBIT_EVENT_DATABASE_URL = previousDatabaseUrl;
  }
});

test("app chat route has one production composition and no dead mock command center", () => {
  const pageSource = source("app/(app)/app/chat/page.tsx");
  const routeSource = source(
    "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts",
  );

  assert.match(pageSource, /loadAppChatRouteViewModel/);
  assert.match(pageSource, /ChatWorkspace/);
  assert.match(pageSource, /StateView/);
  assert.doesNotMatch(
    pageSource,
    /ChatCommandCenter|chatRouteToOrbitAgentViewModel|OrbitRealAgent/,
  );
  assert.doesNotMatch(
    routeSource,
    /loadAppAsyncChatCommandCenterViewModel|createAsyncRelationshipConversationService\("mock"\)|record-local-reply/,
  );
  assert.match(routeSource, /actionResult: null/);
});
