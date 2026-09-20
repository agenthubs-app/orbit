import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import test from "node:test";
import React from "react";
import { renderToHtml } from "./helpers/render";
import { aiConversationPayload, emptyAiSessionListPayload } from "./helpers/ai-fixtures";

/**
 * Sprint 0092: the two IORBIT home regions each have to land somewhere.
 *
 * "Still reading", "read it and there is nothing", and "could not read it" look
 * different and each has an assertion here. Before this, a request that never
 * answered left the region on the first one indefinitely, with nothing for the
 * user to act on — the same failure 0078 and 0087 fixed for other surfaces.
 */
let todayKind = "success";
let sessionsKind = "success";
let conversationKind = "success";
let today: unknown = {};
let overdue = false;

const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
loader._load = (name, ...args) => {
  if (name === "expo-crypto") return { randomUUID };
  if (name === "expo-router") return { useLocalSearchParams: () => ({}), useRouter: () => ({ push() {} }) };
  if (name.endsWith("/api/AuthSessionProvider")) return { useOrbitAuthSession: () => ({ ready: true, accountId: "reader", actorId: "reader", user: { id: "reader", name: "读者", email: "reader@example.test", emailVerified: true, image: null } }) };
  if (name.endsWith("/api/ApiBaseUrlProvider")) return { useOrbitApiBaseUrl: () => ({ baseUrl: "https://orbit.test" }) };
  if (name.endsWith("/hooks/useOrbitApiClient")) return { useOrbitApiClient: () => ({}) };
  if (name.endsWith("/hooks/useRelationshipInboxBadgeCount")) return { useRelationshipInboxBadgeCount: () => 0 };
  // The ceiling's own timing is covered in use-loading-deadline.test.ts; this
  // file is about what each region shows once it has or has not expired.
  if (name.endsWith("/hooks/useLoadingDeadline")) return { LOADING_DEADLINE_MS: 8_000, useLoadingDeadline: () => overdue };
  if (name.endsWith("/hooks/useApiResource")) return {
    useApiResource: (path: string) => {
      const kind = path.startsWith("/api/today") ? todayKind : path.includes("/sessions") ? sessionsKind : conversationKind;
      return {
        kind,
        data: path.startsWith("/api/today") ? today : path.includes("/sessions") ? emptyAiSessionListPayload : aiConversationPayload,
        error: { message: "连接暂不可用" }, refreshing: false, refresh() {},
      };
    },
  };
  return originalLoad(name, ...args);
};
const { AiScreen } = require("../src/screens/ai/AiScreen");
loader._load = originalLoad;

test.beforeEach(() => { todayKind = "success"; sessionsKind = "success"; conversationKind = "success"; today = {}; overdue = false; });

test("still reading: each region says so while its request is in flight", () => {
  todayKind = "loading"; sessionsKind = "loading"; conversationKind = "loading";
  const html = renderToHtml(<AiScreen />);
  assert.match(html, /正在读取最近会话/u);
  assert.match(html, /正在核对下一步/u);
  assert.doesNotMatch(html, /超时/u, "a load in flight is not a timeout");
});

test("read it and there is nothing: an empty result is not the same as still reading", () => {
  todayKind = "empty"; sessionsKind = "empty"; conversationKind = "empty";
  const html = renderToHtml(<AiScreen />);
  assert.match(html, /现在没有必须处理的事项/u);
  assert.doesNotMatch(html, /正在核对下一步|正在读取最近会话/u);
  assert.doesNotMatch(html, /超时/u);
});

test("could not read it: a failure offers a retry rather than an empty region", () => {
  todayKind = "failure"; sessionsKind = "failure"; conversationKind = "failure";
  const html = renderToHtml(<AiScreen />);
  assert.match(html, /连接暂不可用/u, "the next-actions region shows why");
  assert.match(html, /历史记录未能读取|会话记录未能读取/u);
  assert.match(html, /aria-label="重试"|重试/u);
  assert.doesNotMatch(html, /正在核对下一步|正在读取最近会话/u);
});

test("a load that never answers stops saying 'still reading' and offers a retry", () => {
  todayKind = "loading"; sessionsKind = "loading"; conversationKind = "loading";
  overdue = true;
  const html = renderToHtml(<AiScreen />);
  assert.match(html, /读取最近会话超时/u);
  assert.match(html, /核对下一步超时/u);
  assert.doesNotMatch(html, /正在读取最近会话/u, "the region must not claim to still be reading past its ceiling");
  assert.doesNotMatch(html, /正在核对下一步/u);
  assert.match(html, /重试/u, "a timeout the user cannot retry is no better than a spinner");
});

test("an overdue next-actions region does not also claim there is nothing to do", () => {
  todayKind = "loading"; overdue = true;
  const html = renderToHtml(<AiScreen />);
  assert.doesNotMatch(html, /现在没有必须处理的事项/u, "not having read it is not the same as there being nothing");
});
