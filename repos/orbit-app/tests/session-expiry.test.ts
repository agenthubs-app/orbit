import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { notifySessionExpired, onSessionExpired } from "../src/api/session-expiry";
import { createOrbitApiClient } from "../src/api/client";

const repoRoot = new URL("..", import.meta.url).pathname;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}

test("订阅者收到过期通知，退订后不再收到", () => {
  let calls = 0;
  const unsubscribe = onSessionExpired(() => {
    calls += 1;
  });

  notifySessionExpired();
  assert.equal(calls, 1);

  notifySessionExpired();
  assert.equal(calls, 2);

  unsubscribe();
  notifySessionExpired();
  assert.equal(calls, 2);
});

test("一个订阅者抛错不影响其他订阅者", () => {
  let reached = false;
  const unsubscribeBroken = onSessionExpired(() => {
    throw new Error("boom");
  });
  const unsubscribeGood = onSessionExpired(() => {
    reached = true;
  });

  assert.doesNotThrow(() => notifySessionExpired());
  assert.equal(reached, true);

  unsubscribeBroken();
  unsubscribeGood();
});

test("401 响应会广播会话过期", async () => {
  let notified = 0;
  const unsubscribe = onSessionExpired(() => {
    notified += 1;
  });

  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () =>
      jsonResponse(401, {
        error: { code: "UNAUTHORIZED", message: "登录已过期。" },
        success: false
      })
  });

  const result = await client.get<unknown>("/api/contacts");

  assert.equal(result.success, false);
  assert.equal(result.status, 401);
  assert.equal(notified, 1);

  unsubscribe();
});

test("其他状态码不会被当成会话过期", async () => {
  let notified = 0;
  const unsubscribe = onSessionExpired(() => {
    notified += 1;
  });

  const client = createOrbitApiClient({
    baseUrl: "http://localhost:3000",
    fetchImpl: async () =>
      jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: "服务器出错。" },
        success: false
      })
  });

  await client.get<unknown>("/api/contacts");
  assert.equal(notified, 0);

  unsubscribe();
});

test("会话过期时清理本地会话并回到登录页", () => {
  const providerSource = readFileSync(
    join(repoRoot, "src", "api", "AuthSessionProvider.tsx"),
    "utf8"
  );

  assert.match(providerSource, /onSessionExpired\(\(\) => \{/u);
  assert.match(providerSource, /nativeAuthSessionStorage\.clear\(baseUrl\)/u);
  assert.match(providerSource, /router\.replace\("\/account\/login" as Href\)/u);

  // 只在登录态下订阅：未登录时的 401 只是「这个接口需要登录」，
  // 处理完把 user 置空后订阅自动解除，不会形成跳转循环。
  assert.match(providerSource, /if \(user === null\) \{\s*return;\s*\}\s*return onSessionExpired/u);
});
