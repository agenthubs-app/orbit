import assert from "node:assert/strict";
import test from "node:test";

import {
  isOrbitAuthEntryPath,
  isOrbitPrivateAppPath,
  normalizeOrbitAuthReturnPath,
} from "../../features/auth/app-auth-routing";

test("personal app route trees are private", () => {
  for (const pathname of [
    "/app/agent",
    "/app/admin",
    "/app/admin/events",
    "/app/agent/plan",
    "/app/contacts",
    "/app/contacts/person-1",
    "/app/home",
    "/app/home/events",
    "/app/platform",
    "/app/profile",
    // 2026-09-24：`/app/tasks/relationship/[id]` 整页没有 `auth()`，此前前缀表也不覆盖
    // `/app/tasks`，未登录访客因此拿到空壳而不是登录跳转。这四条把前缀补齐后的覆盖钉住。
    "/app/tasks",
    "/app/tasks/personal",
    "/app/tasks/task%3Aone",
    "/app/tasks/relationship/connection%3A1",
  ]) {
    assert.equal(isOrbitPrivateAppPath(pathname), true, pathname);
  }
});

// iOrbit 任务 6a：`/app/chat`、`/app/followups`、`/app/schedule`、`/app/today`
// 四条路由随路由归并删除，`next` 白名单同步移除——它们不再是私有前缀。
test("the consolidated-away routes are no longer private prefixes", () => {
  for (const pathname of ["/app/chat", "/app/followups", "/app/schedule", "/app/today"]) {
    assert.equal(isOrbitPrivateAppPath(pathname), false, pathname);
  }
});

test("public discovery, account, organizer, registration, and admin entry routes stay public", () => {
  for (const pathname of [
    "/",
    "/app",
    "/app/account/login",
    "/app/account/signup",
    "/app/admin/access",
    "/app/events",
    "/app/events/demo-event",
    "/app/login-admin",
    "/app/o/orbit",
    "/app/register",
  ]) {
    assert.equal(isOrbitPrivateAppPath(pathname), false, pathname);
  }
});

test("auth entry recognition covers all account subroutes", () => {
  assert.equal(isOrbitAuthEntryPath("/app/account"), true);
  assert.equal(isOrbitAuthEntryPath("/app/account/login"), true);
  assert.equal(isOrbitAuthEntryPath("/app/accounting"), false);
});

test("auth return paths preserve safe local destinations and reject redirect attacks", () => {
  assert.equal(
    normalizeOrbitAuthReturnPath("/app/contacts?view=graph#person"),
    "/app/contacts?view=graph#person",
  );
  assert.equal(normalizeOrbitAuthReturnPath("/"), "/");
  assert.equal(normalizeOrbitAuthReturnPath(["/app/agent", "/app/home"]), "/app/agent");

  for (const unsafe of [
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example/steal",
    "/app/account/login",
    "/app/account/signup?next=/app/account/signup",
    "/home",
    "/unknown-route",
    "/application",
    "",
    undefined,
  ]) {
    assert.equal(normalizeOrbitAuthReturnPath(unsafe), "/app/home");
  }
});
