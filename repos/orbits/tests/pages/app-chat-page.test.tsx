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

test("/app/chat renders an async relationship inbox and selected correspondence thread", async () => {
  const Page = (await import("../../app/(app)/app/chat/page")).default;
  const html = renderToStaticMarkup(await Page());

  assert.match(html, /data-orbit-route="app-chat-route"/);
  assert.match(html, /Relationship inbox/);
  assert.match(html, /Aoba Mori/);
  assert.match(html, /Yoyogi climate founder breakfast/);
  assert.match(html, /Next action/);
  assert.match(html, /Schedule context/);
  assert.match(html, /Draft reply/);
  assert.match(html, /<h2>Conversations<\/h2>/);
  assert.match(html, /Edit draft/);
  assert.match(html, /Copy reply/);
  assert.match(html, /Mark reviewed/);
  assert.match(html, /Draft reply text/);
  assert.match(html, /External send stays off/);
  assert.doesNotMatch(html, /Realtime chat/i);
  assert.doesNotMatch(html, /internal-company contact log/i);
});

test("/app/chat can select the Aoba thread from the conversation query", async () => {
  const Page = (await import("../../app/(app)/app/chat/page")).default;
  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        conversation: "conversation_demo_aoba",
      }),
    }),
  );

  assert.match(html, /data-selected-conversation="conversation_demo_aoba"/);
  assert.match(html, /Aoba asked for a short recap/);
  assert.match(html, /Aoba follow-up task/);
  assert.match(html, /Prepare a local reply preview/);
  assert.match(
    html,
    /\/app\/chat\?action=stage-reply&amp;conversation=conversation_demo_aoba/,
  );
});

test("/app/chat remains mock-backed when the wider app module mode is live", async () => {
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  const Page = (await import("../../app/(app)/app/chat/page")).default;

  process.env.ORBIT_MODULE_MODE = "live";

  try {
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({
          action: "stage-reply",
          conversation: "conversation_demo_aoba",
        }),
      }),
    );

    assert.match(html, /data-orbit-route="app-chat-route"/);
    assert.match(html, /Relationship inbox/);
    assert.match(html, /Aoba Mori/);
    assert.match(
      html,
      /No external message, notification, calendar entry, saved record, or network side effect occurred/,
    );
  } finally {
    if (previousModuleMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousModuleMode;
    }
  }
});

test("/app/chat action preview stages the reply and states no external side effect occurred", async () => {
  const Page = (await import("../../app/(app)/app/chat/page")).default;
  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        action: "stage-reply",
        conversation: "conversation_demo_aoba",
      }),
    }),
  );

  assert.match(html, /data-stage-status="staged_local_preview"/);
  assert.match(
    html,
    /No external message, notification, calendar entry, saved record, or network side effect occurred/,
  );
  assert.match(html, /External send: not requested/);
  assert.match(html, /Calendar entry: not created/);
  assert.match(html, /Network: not used/);
  assert.match(html, /<h2>Staged preview<\/h2>/);
  assert.match(html, /data-side-effects="none"/);
});

test("/app/chat shows a local not-found state for an invalid conversation query", async () => {
  const Page = (await import("../../app/(app)/app/chat/page")).default;
  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        conversation: "does_not_exist",
      }),
    }),
  );

  assert.match(html, /data-chat-state="ASYNC_CONVERSATION_NOT_FOUND"/);
  assert.match(html, /Conversation not found/);
  assert.match(
    html,
    /No mock asynchronous relationship conversation matches the selected id/,
  );
  assert.match(
    html,
    /Choose a conversation from the relationship inbox before reviewing a thread/,
  );
  assert.match(html, /Aoba Mori/);
  assert.match(html, /External send: not requested/);
  assert.match(html, /Calendar entry: not created/);
  assert.match(html, /Network: not used/);
});

test("app chat route owns UI composition without importing dev or Orbit Agent chat shells", () => {
  const pageSource = source("app/(app)/app/chat/page.tsx");
  const commandCenterSource = source(
    "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-command-center.tsx",
  );

  assert.match(pageSource, /ChatCommandCenter/);
  assert.doesNotMatch(pageSource, /OrbitRealAgent/);
  assert.doesNotMatch(commandCenterSource, /features\/chat/);
  assert.doesNotMatch(commandCenterSource, /WebSocket|EventSource|fetch\s*\(/);
});
