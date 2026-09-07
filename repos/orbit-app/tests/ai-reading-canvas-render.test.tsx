import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { Appearance } from "react-native";
import { renderToHtml } from "./helpers/render";

let conversation: Record<string, unknown> = {};
const resetConversation = () => {
  conversation = {
    activeConversationId: "reading-test",
    messages: [
      { messageId: "prompt", role: "user", content: "聊聊合作\n也想认识工程师", createdAt: "2026-09-06T00:00:00Z" },
      { messageId: "reply", role: "assistant", content: "可以先说说正在做的产品。", createdAt: "2026-09-06T00:00:01Z" }
    ],
    proposedToolIntents: [], taskInteraction: null
  };
};

// Importing the route normally initializes Expo native modules in Node. Replace
// only router/storage/network hooks; the real screen, decoding, theme and RN
// rendering remain intact. No request or storage operation is allowed here.
const moduleLoader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = moduleLoader._load;
moduleLoader._load = (name, ...args) => {
  if (name === "expo-router") return {
    useLocalSearchParams: () => ({ id: "reading-test" }),
    useRouter: () => ({ push() {}, replace() {}, canGoBack: () => true }),
    usePathname: () => "/ai/reading-test"
  };
  if (name.endsWith("/api/ApiBaseUrlProvider")) return { useOrbitApiBaseUrl: () => ({ baseUrl: "https://orbit.test" }) };
  if (name.endsWith("/hooks/useOrbitApiClient")) return { useOrbitApiClient: () => ({}) };
  if (name.endsWith("/hooks/useApiResource")) return {
    useApiResource: (path: string) => ({ kind: "success", data: path === "/api/ai/conversations/reading-test" ? conversation : {}, refreshing: false, refresh() {} })
  };
  return originalLoad(name, ...args);
};
const { AiConversationScreen } = require("../src/screens/ai/AiConversationScreen");
moduleLoader._load = originalLoad;
test.beforeEach(resetConversation);

test("reading canvas keeps a single compact navigation and the real conversation", () => {
  const html = renderToHtml(<AiConversationScreen />);
  assert.match(html, /聊聊合作/u);
  assert.match(html, /可以先说说正在做的产品/u);
  assert.match(html, /aria-label="对话导航"/u);
  assert.equal((html.match(/>Orbit AI</gu) ?? []).length, 1);
  assert.doesNotMatch(html, />对话<|2026-09-06|>我</u);
});

test("empty composer cannot send and stays separate from the scrolling history", () => {
  const html = renderToHtml(<AiConversationScreen />);
  const history = html.indexOf('data-testid="conversation-history"');
  const composer = html.indexOf('data-testid="conversation-composer"');
  assert.ok(history >= 0 && composer > history);
  assert.match(html, /aria-label="继续聊聊"/u);
  assert.match(html, /aria-label="发送消息"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*aria-label="发送消息"/u);
  assert.doesNotMatch(html, /通用入口/u, "shortcuts should not occupy the initial reading canvas");
});

test("user messages have a distinct readable surface without shrinking reply text", (t) => {
  let scheme = "light";
  t.mock.method(Appearance, "getColorScheme", () => scheme);
  const light = renderToHtml(<AiConversationScreen />);
  assert.match(light, /aria-label="我的消息"/u);
  assert.match(light, /aria-label="Orbit AI 回复"/u);
  assert.match(light, /聊聊合作\n也想认识工程师/u, "user-authored newlines must survive rendering");
  scheme = "dark";
  const dark = renderToHtml(<AiConversationScreen />);
  assert.notEqual(dark, light);
  assert.equal(dark.replace(/ (?:class|style)="[^"]*"/gu, ""), light.replace(/ (?:class|style)="[^"]*"/gu, ""));
});

test("assistant record references render actionable detail entries", () => {
  conversation.messages = [
    { messageId: "reply", role: "assistant", content: "查看 [交流会](https://orbit.test/app/events/event-one) 与 orbit://contacts/person-one", createdAt: "" }
  ];
  const html = renderToHtml(<AiConversationScreen />);
  assert.match(html, /aria-label="打开活动详情：event-one"/u);
  assert.match(html, /aria-label="打开人脉详情：person-one"/u);
});

test("same-kind record links are visibly distinct and unsupported links explain the boundary", () => {
  conversation.messages = [{ messageId: "reply", role: "assistant", content: "[一](https://orbit.test/app/events/one) [二](https://orbit.test/app/events/two) [其他](https://elsewhere.test/app/events/three)", createdAt: "" }];
  const html = renderToHtml(<AiConversationScreen />);
  const visible = html.replace(/<[^>]*>/gu, " ");
  assert.match(visible, /活动详情 · one/u);
  assert.match(visible, /活动详情 · two/u);
  assert.match(visible, /详情入口仅支持当前服务的记录/u);
  assert.doesNotMatch(html, /aria-label="打开活动详情：three"/u);
});
