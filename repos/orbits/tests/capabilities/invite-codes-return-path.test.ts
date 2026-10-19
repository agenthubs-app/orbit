import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeProfileAuthReturnPath, profileContinuationPath } from "../../app/(app)/app/profile/profile-onboarding-navigation";
import { productHref } from "../../app/(app)/app/orbit-2026/auth-public/use-account-auth";
import { normalizeOrbitAuthReturnPath } from "../../features/auth/app-auth-routing";

// R15（DESIGN add-and-invite §2.5 第 2 步、SC-R15-08）：注册 / 登录回跳只多放行完全匹配的 `/i` 与 `/i/<码>`；
// 其余（开放重定向、路径穿越、编码、带查询、超长、小写或字母表外）一律回 `/app/home`。已有分支的用例见 app-auth-routing.test.ts。

test("the invite page and an invite code path come back unchanged", () => {
  for (const path of ["/i", "/i/K7QX-2M9P", "/i/K7QX2M9P", "/i/23456789", "/i/ZZZZ-ZZZZ"]) {
    assert.equal(normalizeOrbitAuthReturnPath(path), path, path);
  }
});

test("anything else that looks like an invite path falls back to /app/home", () => {
  const rejected = [
    "//evil.example",
    "//evil.example/i/K7QX-2M9P",
    "/i/../app/admin",
    "/i/./K7QX-2M9P",
    "/i%2FK7QX-2M9P",
    "/i/K7QX%2D2M9P",
    "/%69/K7QX-2M9P",
    "/i/K7QX-2M9P?x=//evil",
    "/i/K7QX-2M9P#frag",
    "/i/K7QX-2M9P/",
    "/i/",
    "/i/k7qx-2m9p",
    "/i/K7QX-2M9O",
    "/i/K7QX-2M91",
    "/i/K7QX-2M9P-EXTRA",
    `/i/${"K".repeat(400)}`,
    "/i\\K7QX-2M9P",
    "/invite/K7QX-2M9P",
    "/ix",
  ];
  for (const path of rejected) {
    assert.equal(normalizeOrbitAuthReturnPath(path), "/app/home", path);
  }
  assert.equal(normalizeOrbitAuthReturnPath("/i/../app/admin", "/app/contacts"), "/app/contacts", "the caller's fallback is kept");
});

test("the existing branches are unchanged", () => {
  assert.equal(normalizeOrbitAuthReturnPath("/app/contacts?x=1#y"), "/app/contacts?x=1#y");
  assert.equal(normalizeOrbitAuthReturnPath("/"), "/");
  assert.equal(normalizeOrbitAuthReturnPath("/app"), "/app");
  assert.equal(normalizeOrbitAuthReturnPath("/app/account/login"), "/app/home");
  assert.equal(normalizeOrbitAuthReturnPath("/events"), "/app/home");
  assert.equal(normalizeOrbitAuthReturnPath(null), "/app/home");
});

test("after sign-up / sign-in an invite next goes straight back, not through the profile continuation", () => {
  assert.equal(normalizeProfileAuthReturnPath("/i/K7QX-2M9P"), "/i/K7QX-2M9P");
  assert.equal(profileContinuationPath("/i/K7QX-2M9P"), "/i/K7QX-2M9P");
  assert.equal(productHref("/i/K7QX-2M9P"), "/i/K7QX-2M9P", "the invite page lives outside /app");
  // 其余 next 照旧经过资料引导。
  assert.equal(profileContinuationPath("/app/contacts"), "/app/profile/continue?next=%2Fapp%2Fcontacts");
  assert.equal(profileContinuationPath("/i/../app/admin"), "/app/profile/continue?next=%2Fapp%2Fhome");
  assert.equal(productHref("/home"), "/app/home");
  // 注册页（已登录时）与登录 / 注册成功后的跳转都走同一个白名单。
  const signup = readFileSync("app/(app)/app/account/signup/page.tsx", "utf8");
  assert.match(signup, /redirect\(normalizeOrbitAuthReturnPath\(resolvedSearchParams\?\.next\)\)/u);
});
