import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { AuthModal, AUTH_STYLES, type AuthModalView } from "../../app/(app)/app/account/auth-0918/auth-modal";
import { profileContinuationPath } from "../../app/(app)/app/profile/profile-onboarding-navigation";

// 认证弹窗 任务 2：登录 / 注册 弹窗（设计 342–392 行）。SSR 结构 + 行为（本地校验零网络 / 提交走 hook 路径（fetch 层桩
// next-auth 端点，同 app-account-auth-characterization）/ 遮罩与 × 关闭 / 眼睛钮 / loading 态）。

interface Observed {
  body: string | null;
  method: string;
  url: string;
}

interface Harness {
  navigation: { assigned: string[] };
  observed: Observed[];
  restore: () => void;
}

function install(search: string, options: { credentials?: "failure" | "success"; register?: () => Response; hold?: () => Promise<void> } = {}): Harness {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const observed: Observed[] = [];
  const navigation = { assigned: [] as string[] };
  let href = `http://localhost/app/account/login${search}`;
  const location = {
    get href() {
      return href;
    },
    set href(path: string) {
      navigation.assigned.push(path);
      href = path;
    },
    search,
  };

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    observed.push({ body: typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : null, method: (init?.method ?? "GET").toUpperCase(), url });
    if (url === "/api/auth/register") return options.register ? options.register() : Response.json({ success: true });
    if (url.endsWith("/providers")) return Response.json({ credentials: { id: "credentials", type: "credentials" }, google: { id: "google", type: "oauth" } });
    if (url.endsWith("/csrf")) return Response.json({ csrfToken: "test-csrf-token" });
    if (url.includes("/callback/credentials")) {
      if (options.hold) await options.hold();
      return options.credentials === "failure"
        ? Response.json({ url: "http://localhost/api/auth/error?error=CredentialsSignin" }, { status: 401 })
        : Response.json({ url: "http://localhost/app/profile/continue" });
    }
    if (url.includes("/signin/google")) return Response.json({ url: "/app/profile/continue" });
    throw new Error(`Unexpected auth fetch: ${url}`);
  }) as typeof fetch;

  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, location, removeEventListener() {} } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });

  return {
    navigation,
    observed,
    restore() {
      globalThis.fetch = originalFetch;
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else Reflect.deleteProperty(globalThis, "document");
    },
  };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function withModal(
  view: AuthModalView,
  search: string,
  options: Parameters<typeof install>[1],
  run: (renderer: ReactTestRenderer, harness: Harness) => Promise<void>,
  oauthProviders: readonly string[] = [],
): Promise<void> {
  const harness = install(search, options);
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(<AuthModal defaultNext="/app/home" oauthProviders={oauthProviders} view={view} />);
      await settle();
    });
    await run(renderer!, harness);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    harness.restore();
  }
}

function input(renderer: ReactTestRenderer, id: string) {
  const found = renderer.root.findAllByType("input").find((candidate) => candidate.props.id === id);
  assert.ok(found, `expected input ${id}`);
  return found;
}

async function fill(renderer: ReactTestRenderer, email: string, password: string): Promise<void> {
  await act(async () => {
    input(renderer, "au-email").props.onChange({ target: { value: email } });
    input(renderer, "au-password").props.onChange({ target: { value: password } });
  });
}

async function submit(renderer: ReactTestRenderer): Promise<void> {
  await act(async () => {
    await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    await settle();
    await settle();
  });
}

function alerts(renderer: ReactTestRenderer): string[] {
  return renderer.root.findAll((node) => node.props.role === "alert" && typeof node.type === "string").map((node) => node.children.join(""));
}

function submitButton(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => node.type === "button" && node.props.type === "submit")[0];
}

function submitLabel(renderer: ReactTestRenderer): string {
  return submitButton(renderer).children.filter((child) => typeof child === "string").join("");
}

const NEXT = "/app/contacts/new?eventId=e_1&source=auth";

// ---- SSR 结构 ----

test("login SSR: scope, dialog a11y, ×, wordmark, design copy, fields, forgot link, two btn classes, switch link, no design mock", () => {
  const html = renderToStaticMarkup(<AuthModal defaultNext="/app/home" oauthProviders={["google"]} view="login" />);
  assert.match(html, /^<div data-orbit-real-page="auth-0918"><style>/u);
  assert.match(html, /<div class="au-overlay"><div aria-labelledby="au-title-login" aria-modal="true" class="au-panel" role="dialog" tabindex="-1">/u);
  assert.match(html, /<button aria-label="关闭" class="btn au-close" type="button">×<\/button><span class="au-wordmark">Orbit<\/span>/u);
  assert.match(html, /<form class="au-view" novalidate="">/u);
  assert.match(html, /<h2 class="au-h2" id="au-title-login">欢迎回来<\/h2><p class="au-sub">登录后进入你的活动和通用商务画像。<\/p>/u);
  assert.match(html, /<label for="au-email">邮箱<\/label><input autoComplete="email" class="au-input" id="au-email" inputMode="email" placeholder="you@company.com" required="" type="email" value=""\/>/u);
  assert.match(html, /<span class="au-label-row"><label for="au-password">密码<\/label><a class="au-forgot" href="\/app\/account\/forgot-password\?next=%2Fapp%2Fhome">忘记密码？<\/a><\/span>/u);
  assert.match(html, /<input autoComplete="current-password" class="au-input" id="au-password" maxLength="72" minLength="8" placeholder="••••••••" required="" type="password" value=""\/>/u);
  assert.match(html, /<button aria-label="显示密码" aria-pressed="false" class="btn au-eye" type="button">/u);
  assert.match(html, /<button class="btn au-btn-login" style="opacity:1" type="submit">登录<\/button>/u);
  assert.match(html, /<button class="btn au-google" type="button">.*使用 Google 登录<\/button>/u);
  assert.match(html, /<p class="au-switch">还没有账号？ <a class="au-switch-link" href="\/app\/account\/signup\?next=%2Fapp%2Fhome">创建账号<\/a><\/p>/u);
  const body = html.slice(html.indexOf("</style>"));
  assert.doesNotMatch(body, /role="alert"|role="status"|au-notice|taken@orbit\.app|failfail|演示/u);
  assert.doesNotMatch(body, /<button(?![^>]*class="btn )/u, "every button carries the btn token");
});

test("register SSR: design copy, 至少 8 位 placeholder, au-btn-primary, terms as spans without legal routes, switch to login; no Google without provider", () => {
  const html = renderToStaticMarkup(<AuthModal defaultNext="/app/home" oauthProviders={[]} view="register" />);
  assert.match(html, /aria-labelledby="au-title-register"/u);
  assert.match(html, /<h2 class="au-h2" id="au-title-register">创建账号<\/h2><p class="au-sub">从零散的联系人，到对的关系。<\/p>/u);
  assert.match(html, /<label for="au-password">密码<\/label><span class="au-field-wrap"><input autoComplete="new-password" class="au-input" id="au-password" maxLength="72" minLength="8" placeholder="至少 8 位" required="" type="password" value=""\/>/u);
  assert.match(html, /<button class="btn au-btn-primary" style="opacity:1" type="submit">创建账号<\/button>/u);
  assert.match(html, /<p class="au-terms">注册即表示同意 <span class="au-terms-link">服务条款<\/span> 与 <span class="au-terms-link">隐私政策<\/span>。<\/p>/u);
  assert.match(html, /<p class="au-switch">已有账号？ <a class="au-switch-link" href="\/app\/account\/login\?next=%2Fapp%2Fhome">直接登录<\/a><\/p>/u);
  const body = html.slice(html.indexOf("</style>"));
  assert.doesNotMatch(body, /au-google|au-forgot|au-label-row|taken@orbit\.app|failfail/u);
  assert.doesNotMatch(body, /<button(?![^>]*class="btn )/u, "every button carries the btn token");
});

test("AUTH_STYLES: scoped to auth-0918, design declarations verbatim, .btn neutralisation incl. [disabled] (审阅修订 6/7)", () => {
  for (const line of AUTH_STYLES.split("\n").filter((entry) => entry.trim() && !entry.trim().startsWith("/*") && !entry.trim().startsWith("`"))) {
    assert.ok(line.startsWith('[data-orbit-real-page="auth-0918"]') || line.startsWith("  "), `unscoped rule: ${line}`);
  }
  assert.match(AUTH_STYLES, /\.au-overlay \{ position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba\(14,18,37,0\.45\); backdrop-filter: blur\(6px\); \}/u);
  assert.match(AUTH_STYLES, /\.au-panel \{ position: relative; width: 100%; max-width: 440px; max-height: calc\(100vh - 48px\); overflow: auto; background: #FFFFFF; border-radius: 24px; padding: 40px; box-shadow: 0 30px 80px rgba\(14,18,37,0\.3\); display: flex; flex-direction: column; gap: 24px; \}/u);
  assert.match(AUTH_STYLES, /\.btn\.au-close \{ position: absolute; top: 16px; right: 16px; width: 34px; height: 34px; border: 0; border-radius: 50%; background: #F7F7FD; color: #6B6F99; font-size: 18px; line-height: 1; cursor: pointer; font-family: inherit;/u);
  assert.match(AUTH_STYLES, /\.btn\.au-btn-login \{ display: flex; align-items: center; justify-content: center; gap: 10px; padding: 16px; border: 0; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 16px; font-weight: 500; cursor: pointer; font-family: inherit;/u);
  assert.match(AUTH_STYLES, /\.btn\.au-btn-primary \{ padding: 16px; border: 0; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 16px; font-weight: 500; cursor: pointer; font-family: inherit;/u);
  assert.match(AUTH_STYLES, /\.btn\.au-btn-login\[disabled\], \[data-orbit-real-page="auth-0918"\] \.btn\.au-btn-primary\[disabled\] \{ background: #0E1225; color: #FFFFFF; cursor: pointer; box-shadow: none; \}/u);
  assert.match(AUTH_STYLES, /\.au-input:focus \{ border-color: #4B4FC7; background: #FFFFFF; \}/u);
  for (const cls of ["au-close", "au-eye", "au-btn-login", "au-btn-primary", "au-google"]) {
    assert.match(AUTH_STYLES, new RegExp(`\\.btn\\.${cls}:active \\{ transform: none; \\}`, "u"), `${cls} :active neutralised`);
  }
});

// ---- 行为 ----

test("login: local validation shows the design copy without any network call", async () => {
  await withModal("login", "", {}, async (renderer, harness) => {
    await fill(renderer, "not-an-email", "password-123");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["请输入有效的邮箱地址。"]);
    await fill(renderer, "owner@example.invalid", "short");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["密码至少 8 位。"]);
    assert.equal(harness.observed.length, 0);
    assert.deepEqual(harness.navigation.assigned, []);
  });
});

test("login: valid submit reaches signIn(credentials) with the typed values, navigates to continuation and shows ✓ 已登录", async () => {
  await withModal("login", `?next=${encodeURIComponent(NEXT)}`, { credentials: "success" }, async (renderer, harness) => {
    await fill(renderer, "owner@example.invalid", "password-123");
    await submit(renderer);
    const callback = harness.observed.find((call) => call.url.includes("/callback/credentials"));
    assert.ok(callback, "credentials callback should be issued");
    const body = new URLSearchParams(String(callback.body));
    assert.equal(body.get("email"), "owner@example.invalid");
    assert.equal(body.get("password"), "password-123");
    assert.equal(body.get("redirect"), null);
    assert.deepEqual(harness.navigation.assigned, [profileContinuationPath(NEXT)]);
    assert.deepEqual(alerts(renderer), []);
    assert.equal(submitLabel(renderer), "✓ 已登录");
  });
});

test("login: failure shows the design copy 邮箱或密码不正确，请重试。 and keeps the idle label", async () => {
  await withModal("login", "", { credentials: "failure" }, async (renderer, harness) => {
    await fill(renderer, "owner@example.invalid", "password-123");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["邮箱或密码不正确，请重试。"]);
    assert.deepEqual(harness.navigation.assigned, []);
    assert.equal(submitLabel(renderer), "登录");
    assert.equal(submitButton(renderer).props.disabled, false);
  });
});

test("login: while the request is pending the button is disabled, reads 登录中… and carries inline opacity 0.6 only", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await withModal("login", "", { credentials: "success", hold: () => gate }, async (renderer) => {
    await fill(renderer, "owner@example.invalid", "password-123");
    let pending!: Promise<void>;
    await act(async () => {
      pending = renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
      await settle();
      await settle();
    });
    assert.equal(submitLabel(renderer), "登录中…");
    assert.equal(submitButton(renderer).props.disabled, true);
    assert.equal(submitButton(renderer).props["aria-busy"], true);
    assert.deepEqual(submitButton(renderer).props.style, { opacity: 0.6 });
    await act(async () => {
      release();
      await pending;
      await settle();
    });
    assert.equal(submitLabel(renderer), "✓ 已登录");
  });
});

test("login: ?created=1&email= renders the blue status notice and prefills the email; forgot/switch links carry the safe next", async () => {
  await withModal("login", `?next=${encodeURIComponent(NEXT)}&created=1&email=${encodeURIComponent("new@example.invalid")}`, {}, async (renderer) => {
    const status = renderer.root.findAll((node) => node.props.role === "status" && typeof node.type === "string");
    assert.equal(status.length, 1);
    assert.equal(status[0].props.className, "au-notice");
    assert.equal(status[0].children.join(""), "账号已创建，但自动登录未完成。请用刚设置的密码登录。");
    assert.equal(input(renderer, "au-email").props.value, "new@example.invalid");
    const hrefs = renderer.root.findAllByType("a").map((node) => String(node.props.href));
    assert.deepEqual(hrefs, [
      `/app/account/forgot-password?next=${encodeURIComponent(NEXT)}`,
      `/app/account/signup?next=${encodeURIComponent(NEXT)}`,
    ]);
  });
});

test("login: Google button calls signIn(google) with the continuation callbackUrl", async () => {
  await withModal("login", `?next=${encodeURIComponent(NEXT)}`, {}, async (renderer, harness) => {
    const google = renderer.root.find((node) => node.type === "button" && node.props.className === "btn au-google");
    await act(async () => {
      google.props.onClick();
      await settle();
      await settle();
    });
    const call = harness.observed.find((entry) => entry.url.includes("/signin/google"));
    assert.ok(call, "google sign-in should be requested");
    assert.equal(new URLSearchParams(String(call.body)).get("callbackUrl"), profileContinuationPath(NEXT));
  }, ["google"]);
});

test("eye button toggles the password input between password and text", async () => {
  await withModal("login", "", {}, async (renderer) => {
    const eye = () => renderer.root.find((node) => node.type === "button" && node.props.className === "btn au-eye");
    assert.equal(input(renderer, "au-password").props.type, "password");
    assert.equal(eye().props["aria-pressed"], false);
    await act(async () => { eye().props.onClick(); });
    assert.equal(input(renderer, "au-password").props.type, "text");
    assert.equal(eye().props["aria-pressed"], true);
    assert.equal(eye().props["aria-label"], "隐藏密码");
  });
});

test("overlay: a click inside the panel does not close; a click on the overlay itself and × both navigate to /app", async () => {
  await withModal("login", "", {}, async (renderer, harness) => {
    const overlay = renderer.root.find((node) => node.type === "div" && node.props.className === "au-overlay");
    const panel = renderer.root.find((node) => node.props.role === "dialog");
    await act(async () => { overlay.props.onClick({ currentTarget: overlay, target: panel }); });
    assert.deepEqual(harness.navigation.assigned, []);
    await act(async () => { overlay.props.onClick({ currentTarget: overlay, target: overlay }); });
    assert.deepEqual(harness.navigation.assigned, ["/app"]);
    const close = renderer.root.find((node) => node.type === "button" && node.props.className === "btn au-close");
    await act(async () => { close.props.onClick(); });
    assert.deepEqual(harness.navigation.assigned, ["/app", "/app"]);
  });
});

test("register: local validation, then POST /api/auth/register + auto sign-in + continuation with ✓ 账号已创建", async () => {
  await withModal("register", `?next=${encodeURIComponent(NEXT)}`, { credentials: "success" }, async (renderer, harness) => {
    await fill(renderer, "new@example.invalid", "1234567");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["密码至少 8 位。"]);
    assert.equal(harness.observed.length, 0);
    await fill(renderer, "new@example.invalid", "password-123");
    await submit(renderer);
    const register = harness.observed.find((call) => call.url === "/api/auth/register");
    assert.ok(register);
    assert.deepEqual(JSON.parse(String(register.body)), { email: "new@example.invalid", password: "password-123" });
    assert.ok(harness.observed.some((call) => call.url.includes("/callback/credentials")));
    assert.deepEqual(harness.navigation.assigned, [profileContinuationPath(NEXT)]);
    assert.deepEqual(alerts(renderer), []);
    assert.equal(submitLabel(renderer), "✓ 账号已创建");
  });
});

test("register: 409 shows the design copy 该邮箱已注册，请直接登录。; other server messages pass through verbatim", async () => {
  await withModal("register", "", { register: () => Response.json({ success: false }, { status: 409 }) }, async (renderer, harness) => {
    await fill(renderer, "dup@example.invalid", "password-123");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["该邮箱已注册，请直接登录。"]);
    assert.equal(harness.observed.some((call) => call.url.includes("/callback/credentials")), false);
    assert.equal(submitLabel(renderer), "创建账号");
  });
  await withModal("register", "", { register: () => Response.json({ success: false, error: { message: "Password too weak" } }, { status: 422 }) }, async (renderer) => {
    await fill(renderer, "dup@example.invalid", "password-123");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["Password too weak"]);
  });
});
