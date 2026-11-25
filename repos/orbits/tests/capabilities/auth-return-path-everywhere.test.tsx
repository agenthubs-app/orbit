/**
 * 2026-11-26：从任何页面进登录 / 注册，完成后回到原来那个页面（新用户先走完三步引导再回去）。
 * 一条规则：入口带「当前路径 + 查询参数」，登录、注册、Google、/app/profile/continue、引导一路传到底；没有来源才去默认首页。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeOrbitAuthReturnPath } from "../../features/auth/app-auth-routing";
import {
  normalizeProfileAuthReturnPath,
  normalizeProfileOnboardingNext,
  profileContinuationPath,
  profileOnboardingFlowPath,
} from "../../app/(app)/app/profile/profile-onboarding-navigation";
import { profileOnboardingRedirectPath } from "../../app/(app)/app/profile/profile-onboarding-route-policy";
import { onboardingReturnValue, resolveOnboardingNext } from "../../app/(app)/app/profile/profile-onboarding-return-cookie";
import { requestSearchWithoutRsc } from "../../app/(app)/app/profile/profile-onboarding-route-policy";
import { productHref } from "../../app/(app)/app/orbit-2026/auth-public/use-account-auth";
import { currentReturnPath } from "../../app/(app)/app/orbit-2026/auth-public/current-return-path";
import {
  forgetPasswordResetReturnPath,
  readPasswordResetReturnPath,
  rememberPasswordResetReturnPath,
} from "../../app/(app)/app/orbit-2026/auth-public/use-password-reset";

const source = (path: string) => readFileSync(path, "utf8");
const login = (next: string) => `/app/account/login?next=${encodeURIComponent(next)}`;
const signup = (next: string) => `/app/account/signup?next=${encodeURIComponent(next)}`;

test("outer public pages are valid return targets; other outer paths are not", () => {
  for (const path of ["/help", "/terms", "/privacy", "/o/tokyo-founders", "/o/tokyo-founders?follow=1", "/e/spring-meetup?inv=AB12-CD34", "/", "/app"]) {
    assert.equal(normalizeOrbitAuthReturnPath(path), path, path);
    assert.equal(normalizeProfileOnboardingNext(path), path, path);
  }
  for (const path of ["/verify-email", "/verify-email?x=1", "/connect", "/oauth/authorize", "/o", "/o/a/b", "/dev/knowledge", "/helpful"]) {
    assert.equal(normalizeOrbitAuthReturnPath(path), "/app/home", path);
  }
});

test("flow pages are never the target: nested next is unwrapped to the innermost safe destination", () => {
  const target = "/app/events/evt-1?inv=AB12-CD34";
  const nested = login(signup(profileOnboardingFlowPath(profileContinuationPath(target))));
  assert.equal(normalizeOrbitAuthReturnPath(nested), target);
  assert.equal(normalizeProfileAuthReturnPath(nested), target);
  assert.equal(normalizeProfileOnboardingNext(`/app/profile/onboarding?next=${encodeURIComponent("/i/K7QX-2M9P")}`), "/i/K7QX-2M9P");
  assert.equal(normalizeProfileOnboardingNext(`/app/profile?onboarding=1&next=${encodeURIComponent("/app/contacts")}`), "/app/contacts");
  assert.equal(normalizeProfileOnboardingNext(`/app/account/forgot-password?next=${encodeURIComponent("/help")}`), "/help");
  // 流程页没有里层 next、或里层不合法 → 默认首页。
  for (const path of ["/app/account/login", "/app/profile/continue", "/app/profile/onboarding", login("https://evil.example"), login(login(login("")))]) {
    assert.equal(normalizeProfileOnboardingNext(path), "/app/home", path);
  }
  // 解包有上限：病态的深层嵌套回退，不无限循环。
  let deep = "/app/contacts";
  for (let index = 0; index < 8; index += 1) deep = login(deep);
  assert.equal(normalizeOrbitAuthReturnPath(deep), "/app/home");
  // 账户页（改密、待删除等）仍不能当目标。
  assert.equal(normalizeProfileOnboardingNext("/app/account/change-password"), "/app/home");
});

test("external, protocol-relative and backslash destinations are rejected, also when nested", () => {
  for (const unsafe of [
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example",
    "/\t/evil.example",
    "/%2F%2Fevil.example",
    "/%5Cevil.example",
    "javascript:alert(1)",
    "/app/../evil",
    "/e/../../evil",
    login("//evil.example"),
    signup("https://evil.example"),
    profileContinuationPath("https://evil.example"),
  ]) {
    assert.equal(normalizeOrbitAuthReturnPath(unsafe), "/app/home", unsafe);
    assert.equal(normalizeProfileAuthReturnPath(unsafe), "/app/home", unsafe);
  }
});

test("profile pages are valid targets; only the onboarding / continue flow pages are not", () => {
  for (const path of ["/app/profile", "/app/profile?view=edit", "/app/profile/goal-editor", "/app/profile/suggestions"]) {
    assert.equal(normalizeProfileOnboardingNext(path), path, path);
    assert.equal(profileContinuationPath(path), `/app/profile/continue?next=${encodeURIComponent(path)}`);
  }
});

test("every sign-in goes through the continuation (invites too), so a new user finishes onboarding first", () => {
  for (const next of ["/i/K7QX-2M9P", "/app/events/evt-1", "/app/events/evt-1/register", "/o/tokyo-founders?follow=1"]) {
    const continuation = profileContinuationPath(next);
    assert.equal(continuation, `/app/profile/continue?next=${encodeURIComponent(next)}`, next);
    assert.equal(profileOnboardingFlowPath(next), `/app/profile/onboarding?next=${encodeURIComponent(next)}`, next);
  }
});

test("the onboarding gate keeps the page (path + query) the user was going to, profile pages included", () => {
  assert.equal(
    profileOnboardingRedirectPath({ pathname: "/app/events/evt-1/register", search: "?inv=AB12-CD34&_rsc=x1" }),
    "/app/profile/onboarding?next=%2Fapp%2Fevents%2Fevt-1%2Fregister%3Finv%3DAB12-CD34",
  );
  assert.equal(
    profileOnboardingRedirectPath({ pathname: "/app/profile/goal-editor", search: "" }),
    "/app/profile/onboarding?next=%2Fapp%2Fprofile%2Fgoal-editor",
  );
});

test("client entries read the current path and query; unusable current pages fall back", () => {
  const original = (globalThis as { window?: unknown }).window;
  try {
    (globalThis as { window?: unknown }).window = { location: { pathname: "/app/events/evt-1", search: "?inv=AB12-CD34", hash: "#people" } };
    assert.equal(currentReturnPath("/app/events"), "/app/events/evt-1?inv=AB12-CD34");
    (globalThis as { window?: unknown }).window = { location: { pathname: "/help", search: "" } };
    assert.equal(currentReturnPath("/app/home"), "/help");
    (globalThis as { window?: unknown }).window = { location: { pathname: "/app/account/login", search: "?next=%2Fapp%2Fcontacts" } };
    assert.equal(currentReturnPath("/app/home"), "/app/contacts");
    (globalThis as { window?: unknown }).window = { location: { pathname: "/verify-email", search: "" } };
    assert.equal(currentReturnPath("/app/events"), "/app/events");
    delete (globalThis as { window?: unknown }).window;
    assert.equal(currentReturnPath("/app/events"), "/app/events", "server render uses the fallback");
  } finally {
    (globalThis as { window?: unknown }).window = original;
  }
});

test("password reset: the page asked from is remembered on this browser and handed to the sign-in link", () => {
  const original = (globalThis as { window?: unknown }).window;
  const storage = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => void storage.delete(key),
      setItem: (key: string, value: string) => void storage.set(key, value),
    },
  };
  try {
    rememberPasswordResetReturnPath("/app/events/evt-1?inv=AB12-CD34", 1_000);
    assert.equal(readPasswordResetReturnPath(2_000), "/app/events/evt-1?inv=AB12-CD34");
    assert.equal(readPasswordResetReturnPath(1_000 + 30 * 60 * 1000 + 1), "", "expires with the reset link");
    rememberPasswordResetReturnPath("https://evil.example", 1_000);
    assert.equal(readPasswordResetReturnPath(2_000), "/app/home");
    forgetPasswordResetReturnPath();
    assert.equal(readPasswordResetReturnPath(2_000), "");
  } finally {
    (globalThis as { window?: unknown }).window = original;
  }
  assert.match(source("app/(app)/app/orbit-2026/auth-public/use-account-auth.ts"), /rememberPasswordResetReturnPath\(query\.next\)/u);
  const reset = source("app/(app)/app/orbit-2026/auth-public/auth-reset.tsx");
  assert.doesNotMatch(reset, /authRoutePath\("login", ""\)/u);
  assert.match(reset, /authRoutePath\("login", session\.next\)/u);
});

test("every sign-in entry carries the current page", () => {
  const events = source("app/(app)/app/orbit-2026/events/PublicEvents.tsx");
  assert.match(events, /export function PublicNav\([^)]*\) \{\n\s+const next = useCurrentReturnPath\(fallback\);/u, "public top bar: path + query");
  assert.match(events, /href=\{authRoutePath\("login", next\)\}>\{t\("loginAssessBtn"\)\}/u, "「ログインして行く価値を判定」 carries next");
  assert.doesNotMatch(events, /href=\{LOGIN\}/u);

  for (const path of ["app/(app)/app/orbit-2026/auth-public/PublicInfoPage.tsx", "app/(app)/app/orbit-2026/auth-public/NotFoundPage.tsx"]) {
    const page = source(path);
    assert.doesNotMatch(page, /"\/app\/account\/login"/u, path);
    assert.match(page, /<CurrentPageLoginLink/u, path);
  }

  const detail = source("app/(app)/app/orbit-2026/events/EventDetail.tsx");
  assert.doesNotMatch(detail, /\/app\/account\/login\?next=/u, "event detail sign-in links use the current page");

  const shell = source("app/(app)/app/orbit-public-shell.tsx");
  assert.equal(shell.match(/const nextPath = useCurrentReturnPath\(pathname \|\| "\/app"\);/gu)?.length, 2);

  // 登录框与注册框互相切换、忘记密码都带同一个 next。
  assert.match(source("app/(app)/app/orbit-2026/auth-public/auth-login.tsx"), /authRoutePath\("register", next\)/u);
  assert.match(source("app/(app)/app/orbit-2026/auth-public/auth-login.tsx"), /authRoutePath\("forgot", next\)/u);
  assert.match(source("app/(app)/app/orbit-2026/auth-public/auth-register.tsx"), /authRoutePath\("login", next\)/u);
  // Google 与密码登录都经 continuation 带 next。
  const hook = source("app/(app)/app/orbit-2026/auth-public/use-account-auth.ts");
  assert.match(hook, /callbackUrl: productHref\(profileContinuationPath\(query\.next\)\)/u);
  assert.match(hook, /credentialsLandingPath\(query\.next\)/u);
  // 受保护页被代理拦去登录：带路径 + 查询参数。
  assert.match(source("proxy.ts"), /normalizeOrbitAuthReturnPath\(\s*`\$\{request\.nextUrl\.pathname\}\$\{requestSearchWithoutRsc\(request\.nextUrl\.search\)\}`/u);
  assert.equal(requestSearchWithoutRsc("?tab=plan&_rsc=1abc"), "?tab=plan");
  // 报名按钮（去注册）带着当前地址的查询参数。
  assert.match(events, /`\$\{here\}\/register\$\{herePath === here && hereQuery \? `\?\$\{hereQuery\}` : ""\}`/u);
});

test("closing the onboarding half way: the page it was for is remembered for that account, and a later deep link wins", () => {
  const event = "/app/events/evt-1?inv=AB12-CD34";
  const remembered = onboardingReturnValue("user-a", event)!;
  assert.ok(remembered);
  // 之后从首页 / 没带 next 被带回引导 → 仍回活动页。
  for (const requested of [undefined, "/app/home", "/app", "/", "https://evil.example"]) assert.equal(resolveOnboardingNext(requested, remembered, "user-a"), event, String(requested));
  // 又从别的深层页面被带回引导 → 以新的为准。
  assert.equal(resolveOnboardingNext("/app/inbox", remembered, "user-a"), "/app/inbox");
  // 换了账号、值被改过、没有记住的 → 默认首页。
  assert.equal(resolveOnboardingNext(undefined, remembered, "user-b"), "/app/home");
  const prefix = remembered.split(".")[0];
  for (const bad of [`${prefix}.${encodeURIComponent("https://evil.example")}`, `${prefix}.%E0%A4%A`, `${prefix}.${encodeURIComponent("/app/account/login")}`, "nothing", undefined]) assert.equal(resolveOnboardingNext("/app/home", bad, "user-a"), "/app/home", String(bad));
  // 默认去处不记，流程页解包后再记，过长的不记。
  for (const next of ["/app/home", "/", null, "/app/profile/onboarding"]) assert.equal(onboardingReturnValue("user-a", next), null);
  assert.equal(resolveOnboardingNext("/app/home", onboardingReturnValue("user-a", profileOnboardingFlowPath("/i/K7QX-2M9P"))!, "user-a"), "/i/K7QX-2M9P");
  assert.equal(onboardingReturnValue("user-a", `/app/events/${"x".repeat(2000)}`), null);
  const proxy = source("proxy.ts");
  assert.match(proxy, /onboardingReturnValue\(userId, request\.nextUrl\.searchParams\.get\("next"\)\)/u);
  assert.match(proxy, /settledValue && request\.cookies\.has\(ONBOARDING_RETURN_COOKIE\)/u, "forgotten once setup is done");
  assert.match(source("app/(app)/app/profile/onboarding/page.tsx"), /resolveOnboardingNext\(params\?\.next, \(await cookies\(\)\)\.get\(ONBOARDING_RETURN_COOKIE\)\?\.value, session\.user\.id\)/u);
});

test("pages outside /app are navigated to as they are", () => {
  for (const path of ["/o/tokyo-founders?follow=1", "/e/spring", "/help", "/terms", "/i/K7QX-2M9P", "/app/home"]) assert.equal(productHref(path), path);
  assert.equal(productHref("/helpful"), "/app/helpful");
});
