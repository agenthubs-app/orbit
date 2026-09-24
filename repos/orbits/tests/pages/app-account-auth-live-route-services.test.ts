import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { AuthModal } from "../../app/(app)/app/account/auth-0918/auth-modal";
import { getOrbitAccountAuthViewModel } from "../../app/(app)/app/orbit-account-auth-route-view-model";
import { profileContinuationPath } from "../../app/(app)/app/profile/profile-onboarding-navigation";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

type AuthMode = "login" | "signup";

interface AuthNavigation {
  assigned: string[];
  href: string;
  reloads: number;
}

interface AuthFetchCall {
  init?: RequestInit;
  url: string;
}

interface AuthRenderOptions {
  credentialResult?: "failure" | "success";
  googleResultUrl?: string;
  mode: AuthMode;
  next: string;
  oauthProviders?: readonly string[];
  registerResult?: "failure" | "success";
}

async function settleAuth() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function installAuthBrowserGlobals(next: string) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const navigation: AuthNavigation = {
    assigned: [],
    href: `http://localhost/app/account/login?next=${encodeURIComponent(next)}`,
    reloads: 0,
  };
  let href = navigation.href;
  const search = `?next=${encodeURIComponent(next)}`;
  const location = {
    assign(path: string) {
      navigation.assigned.push(path);
      href = path;
      navigation.href = path;
    },
    get href() {
      return href;
    },
    set href(path: string) {
      navigation.assigned.push(path);
      href = path;
      navigation.href = path;
    },
    reload() {
      navigation.reloads += 1;
    },
    search,
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      location,
      removeEventListener() {},
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      activeElement: null,
      addEventListener() {},
      removeEventListener() {},
    },
  });

  return {
    navigation,
    restore() {
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
      else Reflect.deleteProperty(globalThis, "window");
      if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
      else Reflect.deleteProperty(globalThis, "document");
    },
  };
}

function installAuthFetch(options: AuthRenderOptions) {
  const previousFetch = globalThis.fetch;
  const calls: AuthFetchCall[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push({ init, url });

    if (url === "/api/auth/register") {
      return options.registerResult === "failure"
        ? Response.json({ success: false, error: { message: "Registration failed" } }, { status: 422 })
        : Response.json({ success: true });
    }
    if (url.endsWith("/providers")) {
      return Response.json({
        credentials: { id: "credentials", type: "credentials" },
        google: { id: "google", type: "oauth" },
      });
    }
    if (url.endsWith("/csrf")) return Response.json({ csrfToken: "test-csrf-token" });
    if (url.includes("/callback/credentials")) {
      return options.credentialResult === "failure"
        ? Response.json({ url: "http://localhost/api/auth/error?error=CredentialsSignin" }, { status: 401 })
        : Response.json({ url: "http://localhost/app/profile/continue" });
    }
    if (url.includes("/signin/google")) {
      return Response.json({ url: options.googleResultUrl ?? "/app/profile/continue" });
    }

    throw new Error(`Unexpected auth fetch: ${url}`);
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = previousFetch;
    },
  };
}

async function renderAuth(
  t: { after(callback: () => void): void },
  options: AuthRenderOptions,
): Promise<{ navigation: AuthNavigation; calls: AuthFetchCall[]; root: ReactTestRenderer }> {
  const browser = installAuthBrowserGlobals(options.next);
  const fetchStub = installAuthFetch(options);
  let root!: ReactTestRenderer;
  await act(async () => {
    // 认证弹窗 任务 3：旧 OrbitRealAccountAuth 已删 → Orbit_0918 弹窗（login / signup→register）。
    root = create(React.createElement(AuthModal, {
      defaultNext: getOrbitAccountAuthViewModel(options.mode).defaultNext,
      oauthProviders: options.oauthProviders ?? [],
      view: options.mode === "signup" ? "register" : "login",
    }));
    await settleAuth();
  });
  t.after(() => {
    act(() => root.unmount());
    fetchStub.restore();
    browser.restore();
  });
  return { calls: fetchStub.calls, navigation: browser.navigation, root };
}

function inputById(root: ReactTestRenderer, id: string) {
  const input = root.root.findAllByType("input").find((candidate) => candidate.props.id === id);
  assert.ok(input, `expected input ${id}`);
  return input;
}

async function fillAuthForm(root: ReactTestRenderer, email: string, password: string) {
  await act(async () => {
    inputById(root, "au-email").props.onChange({ target: { value: email } });
    if (password) inputById(root, "au-password").props.onChange({ target: { value: password } });
  });
}

async function submitAuthForm(root: ReactTestRenderer) {
  await act(async () => {
    await root.root.findByType("form").props.onSubmit({ preventDefault() {} });
  });
}

test("/app/account auth pages use the real NextAuth session as their entry guard", () => {
  // 认证弹窗 任务 2 / 3（审阅修订 14）：login / signup / forgot 都渲染 落地页 + AuthModal（旧 OrbitRealAccountAuth 已删）。
  const pageSources: Array<[string, RegExp]> = [
    [source("app/(app)/app/account/login/page.tsx"), /<AuthModal[\s\S]*view="login"/],
    [source("app/(app)/app/account/signup/page.tsx"), /<AuthModal[\s\S]*view="register"/],
    [source("app/(app)/app/account/forgot-password/page.tsx"), /<AuthModal[\s\S]*view="forgot"/],
  ];

  for (const [pageSource, renderer] of pageSources) {
    assert.match(pageSource, /const session = await auth\(\)/);
    assert.match(pageSource, /session\?\.user\?\.id/);
    assert.match(pageSource, /redirect\(normalizeOrbitAuthReturnPath/);
    assert.match(pageSource, /loadAppAccountAuthRouteViewModel/);
    assert.match(pageSource, renderer);
  }
  for (const page of ["login", "signup", "forgot-password"]) {
    const pageSource = source(`app/(app)/app/account/${page}/page.tsx`);
    assert.match(pageSource, /<OrbitLanding0918 authenticated=\{false\} \/>/);
    assert.doesNotMatch(pageSource, /OrbitRealAccountAuth/);
  }
});

test("app account auth loader returns form copy without consulting mock account sessions", async () => {
  const loaderSource = source(
    "app/(app)/app/account/compose-app-account-auth-from-previously-approved-mock-first-capabilities/account-auth-route-view-model.ts",
  );
  assert.doesNotMatch(loaderSource, /createAccountSessionService/);
  assert.doesNotMatch(loaderSource, /AccountSessionPayload/);

  const { loadAppAccountAuthRouteViewModel } = await import(
    "../../app/(app)/app/account/compose-app-account-auth-from-previously-approved-mock-first-capabilities/account-auth-route-view-model"
  );
  const routeModel = await loadAppAccountAuthRouteViewModel({
    authMode: "signup",
    mode: "live",
    searchParams: { scenario: "signed-out" },
  });

  assert.equal(routeModel.state, "success");
  if (routeModel.state === "success") {
    assert.equal(routeModel.auth.mode, "signup");
    assert.equal(routeModel.auth.title, "创建你的 Orbit 账号");
    assert.equal(routeModel.auth.defaultNext, "/app/home");
    assert.ok(!("session" in routeModel));
  }
});

test("account auth loader preserves one canonical safe return path across login signup and recovery", async () => {
  const { loadAppAccountAuthRouteViewModel } = await import(
    "../../app/(app)/app/account/compose-app-account-auth-from-previously-approved-mock-first-capabilities/account-auth-route-view-model"
  );

  for (const authMode of ["login", "signup", "forgot"] as const) {
    const routeModel = await loadAppAccountAuthRouteViewModel({
      authMode,
      searchParams: { next: "/app/agent?q=follow-up" },
    });

    assert.equal(routeModel.state, "success");
    if (routeModel.state === "success") {
      assert.equal(routeModel.auth.defaultNext, "/app/agent?q=follow-up");
    }
  }

  for (const unsafeNext of [
    "/home",
    "/app/account/login",
    "https://evil.example/steal",
  ]) {
    const routeModel = await loadAppAccountAuthRouteViewModel({
      authMode: "login",
      searchParams: { next: unsafeNext },
    });

    assert.equal(routeModel.state, "success");
    if (routeModel.state === "success") {
      assert.equal(routeModel.auth.defaultNext, "/app/home");
    }
  }
});

// 认证弹窗 任务 1：orbit-real-account-auth.tsx 的状态 / 提交 / Google / 导航逻辑原样搬入
// account/auth-0918/use-account-auth.ts；以下源码正则按「hook 侧 / JSX 侧」拆分——
// 逻辑（normalize、fetch、signIn、callbackUrl、created 文案）指向 hook 文件，
// 标记（role="status" / role="alert"）与已删旧结构的否定断言留在 JSX 文件（否定断言两侧都查）。
// 任务 3：JSX 侧改指 Orbit_0918 屏——错误卡 / created 提示在 auth-form.tsx，找回成功卡在 auth-forgot.tsx；
// 「受理 ≠ 送达」的文案由 hook（旧 "Request accepted." notice）移到找回屏（设计 401–404 + 补句）。
const ACCOUNT_AUTH_HOOK_PATH = "app/(app)/app/account/auth-0918/use-account-auth.ts";
const ACCOUNT_AUTH_FORM_PATH = "app/(app)/app/account/auth-0918/auth-form.tsx";
const ACCOUNT_AUTH_FORGOT_PATH = "app/(app)/app/account/auth-0918/auth-forgot.tsx";

test("client account auth normalizes the hydrated next query with the shared auth boundary", () => {
  const accountAuthSource = source(ACCOUNT_AUTH_HOOK_PATH);

  assert.match(
    accountAuthSource,
    /normalizeOrbitAuthReturnPath\(rawNext,\s*defaultNext\)/,
  );
  assert.doesNotMatch(
    accountAuthSource,
    /rawNext\.startsWith\("\/"\)\s*\?\s*rawNext/,
  );
});

test("forgot password submits a recovery request and announces acceptance separately from delivery", () => {
  const hookSource = source(ACCOUNT_AUTH_HOOK_PATH);
  const forgotSource = source(ACCOUNT_AUTH_FORGOT_PATH);
  const formSource = source(ACCOUNT_AUTH_FORM_PATH);

  assert.match(
    hookSource,
    /\/api\/auth\/password-reset\/request/,
  );
  // 受理只置位（不宣称送达）；送达语义由找回屏成功卡的补句给出。
  assert.match(hookSource, /setResetSent\(true\)/);
  assert.match(forgotSource, /If this email supports password recovery, the link will arrive shortly\./);
  assert.match(forgotSource, /如果该邮箱支持密码恢复，链接会很快送达。/);
  assert.match(forgotSource, /role="status"/);
  assert.match(formSource, /role="alert"/);
  for (const accountAuthSource of [hookSource, forgotSource, formSource]) {
    assert.doesNotMatch(accountAuthSource, /setForgotStep/);
    assert.doesNotMatch(accountAuthSource, /orbit-auth-code/);
    assert.doesNotMatch(accountAuthSource, /orbit-auth-new-password/);
  }
});

test("signup signs the new account in with the same credentials mechanism as login instead of bouncing to the login form", () => {
  const accountAuthSource = source(ACCOUNT_AUTH_HOOK_PATH);
  const signupBranch = accountAuthSource.slice(
    accountAuthSource.indexOf("if (isSignup) {"),
    accountAuthSource.indexOf("if (isForgot) {"),
  );

  assert.match(signupBranch, /\/api\/auth\/register/);
  // 注册成功后复用 next-auth signIn("credentials")，而不是手写 csrf/callback。
  assert.match(
    signupBranch,
    /signIn\("credentials",\s*\{\s*email,\s*password,\s*redirect:\s*false,?\s*\}\)/,
  );
  assert.doesNotMatch(signupBranch, /\/api\/auth\/csrf/);
  assert.doesNotMatch(signupBranch, /\/api\/auth\/callback\/credentials/);
  // 自动登录成功经过 profile continuation；失败才退回登录页并预填邮箱。
  assert.match(signupBranch, /navigate\(profileContinuationPath\(query\.next\)\)/);
  assert.match(signupBranch, /\/account\/login\?next=.*&created=1&email=/);
  assert.ok(
    signupBranch.indexOf("profileContinuationPath(query.next)") <
      signupBranch.indexOf("&created=1&email="),
    "auto sign-in must be attempted before falling back to the login redirect",
  );
});

test("credential login requires a concrete NextAuth result and then uses profile continuation", () => {
  const accountAuthSource = source(ACCOUNT_AUTH_HOOK_PATH);
  const credentialsStart = accountAuthSource.indexOf(
    'const result = await signIn("credentials"',
  );
  const credentialsBranch = accountAuthSource.slice(
    credentialsStart,
    accountAuthSource.indexOf("    } catch", credentialsStart),
  );

  assert.match(credentialsBranch, /if \(!result \|\| result\.error\)/);
  assert.match(
    credentialsBranch,
    /navigate\(profileContinuationPath\(query\.next\)\)/,
  );
});

test("Google callback also enters the authenticated profile continuation", () => {
  const accountAuthSource = source(ACCOUNT_AUTH_HOOK_PATH);

  assert.match(
    accountAuthSource,
    /callbackUrl:\s*productHref\(profileContinuationPath\(query\.next\)\)/,
  );
});

test("post-signup login notice explains the auto sign-in fallback and does not promise a profile onboarding step", () => {
  const hookSource = source(ACCOUNT_AUTH_HOOK_PATH);
  const formSource = source(ACCOUNT_AUTH_FORM_PATH);

  for (const accountAuthSource of [hookSource, formSource]) {
    assert.doesNotMatch(accountAuthSource, /通用档案/);
    assert.doesNotMatch(accountAuthSource, /complete your general profile/);
  }
  assert.match(hookSource, /automatic sign-in did not complete/);
  assert.match(hookSource, /账号已创建，但自动登录未完成/);
  assert.match(hookSource, /自動サインインが完了しませんでした/);
});

test("credential login success navigates through profile continuation with the safe next", async (t) => {
  const next = "/app/contacts/new?eventId=login_123&source=auth";
  const { calls, navigation, root } = await renderAuth(t, {
    credentialResult: "success",
    mode: "login",
    next,
  });
  await fillAuthForm(root, "owner@example.invalid", "password-123");
  await submitAuthForm(root);

  assert.equal(navigation.href, profileContinuationPath(next));
  const callback = calls.find((call) => call.url.includes("/callback/credentials"));
  assert.ok(callback, "credentials callback should be issued");
  const body = new URLSearchParams(String(callback.init?.body));
  assert.equal(body.get("email"), "owner@example.invalid");
  assert.equal(body.get("password"), "password-123");
  assert.equal(body.get("callbackUrl"), "http://localhost/app/account/login?next=" + encodeURIComponent(next));
});

test("successful signup posts credentials, auto-signs in, and enters profile continuation", async (t) => {
  const next = "/app/contacts/new?eventId=signup_123";
  const { calls, navigation, root } = await renderAuth(t, {
    credentialResult: "success",
    mode: "signup",
    next,
    registerResult: "success",
  });
  await fillAuthForm(root, "new-owner@example.invalid", "password-123");
  await submitAuthForm(root);

  assert.equal(navigation.href, profileContinuationPath(next));
  const register = calls.find((call) => call.url === "/api/auth/register");
  assert.ok(register, "signup should create the account first");
  assert.deepEqual(JSON.parse(String(register.init?.body)), {
    email: "new-owner@example.invalid",
    password: "password-123",
  });
  assert.equal(calls.filter((call) => call.url.includes("/callback/credentials")).length, 1);
});

test("failed signup auto-sign-in falls back to created login with the email prefill", async (t) => {
  const next = "/app/contacts/new?eventId=signup_fallback";
  const email = "fallback-owner@example.invalid";
  const { navigation, root } = await renderAuth(t, {
    credentialResult: "failure",
    mode: "signup",
    next,
    registerResult: "success",
  });
  await fillAuthForm(root, email, "password-123");
  await submitAuthForm(root);

  assert.equal(
    navigation.href,
    `/app/account/login?next=${encodeURIComponent(next)}&created=1&email=${encodeURIComponent(email)}`,
  );
});

test("Google sign-in sends a continuation callback URL with the safe next", async (t) => {
  const next = "/app/contacts/new?eventId=google_123&source=auth";
  const expectedContinuation = profileContinuationPath(next);
  const { calls, navigation, root } = await renderAuth(t, {
    googleResultUrl: expectedContinuation,
    mode: "login",
    next,
    oauthProviders: ["google"],
  });
  const google = root.root.findAllByType("button").find((button) =>
    button.children.includes("使用 Google 登录") || button.children.includes("Continue with Google"),
  );
  assert.ok(google, "Google sign-in button should be rendered");

  await act(async () => {
    google.props.onClick();
    await settleAuth();
    await settleAuth();
  });

  const googleCall = calls.find((call) => call.url.includes("/signin/google"));
  assert.ok(googleCall, "Google sign-in request should be issued");
  const body = new URLSearchParams(String(googleCall.init?.body));
  assert.equal(body.get("callbackUrl"), expectedContinuation);
  assert.equal(navigation.href, expectedContinuation);
});
