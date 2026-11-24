// 2026-11-24 无外壳页面的加载态：登录 / 注册等弹窗页先出落地页，公开活动页先出公开顶栏，其余无外壳页不画骨架。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { publicRouteLoadingFor } from "../../app/(app)/app/orbit-2026/shell/public-route-loading";

test("signed out: the landing behind the auth dialogs and on /app itself", () => {
  for (const path of ["/app", "/app/", "/app/account/login", "/app/account/signup", "/app/account/forgot-password", "/app/account/reset-password", "/app/account/change-password"]) {
    assert.equal(publicRouteLoadingFor(path, false), "landing", path);
  }
});

test("signed in: reset / change password still sit on the landing; sign-in pages redirect away, so nothing is drawn", () => {
  assert.equal(publicRouteLoadingFor("/app/account/reset-password", true), "landing");
  assert.equal(publicRouteLoadingFor("/app/account/change-password", true), "landing");
  assert.equal(publicRouteLoadingFor("/app/account/login", true), "blank");
  assert.equal(publicRouteLoadingFor("/app/account/signup", true), "blank");
});

test("public event pages draw their own public frame when signed out", () => {
  assert.equal(publicRouteLoadingFor("/app/events", false), "publicEvents");
  assert.equal(publicRouteLoadingFor("/app/events/evt_1", false), "publicEvent");
  assert.equal(publicRouteLoadingFor("/app/register/ABCD-1234", false), "publicEvent");
});

test("other pages without the shell draw nothing instead of bones", () => {
  for (const path of ["/app/account/pending", "/app/account/deleted", "/app/account/mobile-google", "/app/login-admin", "/app/admin/access", "/app/o/some-host", "/app/register", "/app/no-such-page"]) {
    assert.equal(publicRouteLoadingFor(path, false), "blank", path);
  }
  assert.equal(publicRouteLoadingFor("/app/account/pending", true), "blank");
  assert.equal(publicRouteLoadingFor("/app/o/some-host", true), "blank");
});

test("signed-in pages keep their skeletons", () => {
  for (const path of ["/app", "/app/home", "/app/events", "/app/events/evt_1", "/app/contacts", "/app/settings/account", "/app/register/ABCD-1234"]) {
    assert.equal(publicRouteLoadingFor(path, true), null, path);
  }
});

test("RouteSkeleton consults the rule before any skeleton, and the legacy sign-in addresses redirect", () => {
  const skeleton = readFileSync(new URL("../../app/(app)/app/orbit-2026/shell/RouteSkeleton.tsx", import.meta.url), "utf8");
  assert.match(skeleton, /publicRouteLoadingFor\(pathname, signedIn\)/u);
  const config = readFileSync(new URL("../../next.config.js", import.meta.url), "utf8");
  assert.match(config, /source: "\/app\/login", destination: "\/app\/account\/login"/u);
  assert.match(config, /source: "\/app\/register",\s*missing: \[\{ type: "query", key: "code" \}\],\s*destination: "\/app\/account\/signup"/u);
});

test("the public events nav folds on the landing's phone breakpoint: no middle links, sign-in only", () => {
  const nav = readFileSync(new URL("../../app/(app)/app/orbit-2026/events/public.module.css", import.meta.url), "utf8");
  const landing = readFileSync(new URL("../../app/(app)/app/orbit-2026/auth-public/LandingPage.module.css", import.meta.url), "utf8");
  assert.match(landing, /@media \(max-width: 700px\) \{[^\n]*\.nav \{ display: none; \}[^\n]*\.account \.primary \{ display: none; \}/u);
  // .lpNav prefix + doubled class: `.links` also carries `.row { display: flex }` and the button `.btn.btn { display: inline-flex }`; same weight would let bundle order decide.
  assert.match(nav, /@media \(max-width: 700px\) \{ \.lpNav \.links\.links, \.lpNav \.start\.start \{ display: none; \} \}/u);
  const tsx = readFileSync(new URL("../../app/(app)/app/orbit-2026/events/PublicEvents.tsx", import.meta.url), "utf8");
  assert.match(tsx, /\$\{p\.start\}`\} href="\/app\/account\/signup"/u);
});
