import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { renderToHtml } from "./helpers/render";

let today: unknown = {};
let todayKind = "success";
let conversation: Record<string, unknown> = {};
const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
// Replace only native routing, auth/storage and HTTP boundaries. The actual
// home, Today decoding, Next Actions, question selection and composer render.
loader._load = (name, ...args) => {
  if (name === "expo-router") return {
    useLocalSearchParams: () => ({}), useRouter: () => ({ push() {} })
  };
  if (name.endsWith("/api/AuthSessionProvider")) return { useOrbitAuthSession: () => ({ ready: true, user: { id: "guidance-reader", name: "测试读者", email: "reader@example.test", emailVerified: true, image: null } }) };
  if (name.endsWith("/api/ApiBaseUrlProvider")) return { useOrbitApiBaseUrl: () => ({ baseUrl: "https://orbit.test" }) };
  if (name.endsWith("/hooks/useOrbitApiClient")) return { useOrbitApiClient: () => ({}) };
  if (name.endsWith("/hooks/useRelationshipInboxBadgeCount")) return { useRelationshipInboxBadgeCount: () => 0 };
  if (name.endsWith("/hooks/useApiResource")) return {
    useApiResource: (path: string) => ({
      kind: path.startsWith("/api/today") ? todayKind : "success",
      data: path.startsWith("/api/today") ? today : conversation,
      error: { message: "连接暂不可用" }, refreshing: false, refresh() {}
    })
  };
  return originalLoad(name, ...args);
};
const { AiScreen } = require("../src/screens/ai/AiScreen");
loader._load = originalLoad;

test.beforeEach(() => { today = {}; todayKind = "success"; conversation = {}; });

test("empty home offers exactly two distinct editable questions before the composer", () => {
  const html = renderToHtml(<AiScreen />);
  assert.equal((html.match(/aria-label="填入问题：/gu) ?? []).length, 2);
  assert.match(html, /今天先处理哪些事？/u);
  assert.match(html, /最近有哪些活动适合我？/u);
  assert.ok(html.indexOf("试着问我") < html.indexOf('placeholder="询问 Orbit AI"'));
  assert.match(html, /aria-disabled="true"[^>]*aria-label="发送"|aria-label="发送"[^>]*aria-disabled="true"/u);
});

test("home replaces only the known bootstrap welcome, without rendering its timestamp", () => {
  conversation = {
    activeConversationId: "live-orbit-agent-conversation",
    assistantMessage: "Orbit Agent is ready for a natural-language request.",
    conversations: [{ conversationId: "live-orbit-agent-conversation", title: "Orbit Agent live conversation" }],
    messages: [{ messageId: "orbit-agent-live-ready", role: "assistant", content: "Orbit Agent is ready for a natural-language request.", createdAt: "2026-06-27T00:00:00Z" }]
  };
  const html = renderToHtml(<AiScreen />);
  assert.match(html, /试着问我/u);
  assert.doesNotMatch(html, /有什么需要我做的吗|09:00/u);
});

test("home preserves genuine assistant messages instead of treating them as invitations", () => {
  conversation = { conversations: [{ conversationId: "real", title: "讨论" }], messages: [{ messageId: "real-reply", role: "assistant", content: "有什么需要我做的吗？", createdAt: "2026-09-07T01:00:00Z" }] };
  const html = renderToHtml(<AiScreen />);
  assert.match(html, /有什么需要我做的吗？/u);
  assert.doesNotMatch(html, /填入问题：/u);
});

const task = (category: string, extra = {}) => ({ id: "task", title: "已有事项", category, status: "open", priority: "normal", ...extra });
test("relationship work offers follow-up planning alongside activity discovery", () => {
  today = { tasks: [task("relationship")] };
  const html = renderToHtml(<AiScreen />);
  assert.match(html, /哪些人值得先跟进？/u);
  assert.match(html, /最近有哪些活动适合我？/u);
});

test("urgent open work takes priority over relationship suggestions", () => {
  today = { tasks: [task("relationship"), task("work", { id: "urgent", priority: "high" })] };
  const html = renderToHtml(<AiScreen />);
  assert.match(html, /今天先处理哪些事？/u);
  assert.doesNotMatch(html, /哪些人值得先跟进？/u);
});

test("upcoming scheduled events offer preparation without claiming a registration", () => {
  today = { schedule: [{ id: "event", title: "已有日程", kind: "event", category: "event", state: "upcoming", startsAt: "2099-09-07T09:00:00Z", sourceId: "event" }] };
  const html = renderToHtml(<AiScreen />);
  assert.match(html, /接下来的会面或活动，该准备什么？/u);
  assert.match(html, /最近有哪些活动适合我？/u);
});

for (const kind of ["empty", "loading", "failure", "offline"]) {
  test(`${kind} Today data falls back to general questions without inventing context`, () => {
    todayKind = kind;
    today = null;
    const html = renderToHtml(<AiScreen />);
    assert.equal((html.match(/aria-label="填入问题：/gu) ?? []).length, 2);
    assert.match(html, /今天先处理哪些事？/u);
    assert.doesNotMatch(html, /哪些人值得先跟进？|接下来的会面或活动/u);
  });
}
