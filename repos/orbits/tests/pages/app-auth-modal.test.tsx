import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { AuthModal, AUTH_STYLES, type AuthModalView } from "../../app/(app)/app/account/auth-0918/auth-modal";
import { profileContinuationPath } from "../../app/(app)/app/profile/profile-onboarding-navigation";

// 认证弹窗 任务 2：登录 / 注册 弹窗（设计 342–392 行）。SSR 结构 + 行为（本地校验零网络 / 提交走 hook 路径（fetch 层桩
// next-auth 端点，同 app-account-auth-characterization）/ 遮罩与 × 关闭 / 眼睛钮 / loading 态）。
// 认证弹窗 任务 3：找回（394–420）/ 新密码（422–463：链接已失效 / 表单 / 密码已更新）两屏追加在文末。

interface Observed {
  body: string | null;
  method: string;
  url: string;
}

interface Harness {
  navigation: { assigned: string[] };
  observed: Observed[];
  replaced: { data: unknown; url: string }[];
  restore: () => void;
}

interface InstallOptions {
  confirm?: () => Response | Promise<Response>;
  credentials?: "failure" | "success";
  hash?: string;
  hold?: () => Promise<void>;
  register?: () => Response;
  resetRequest?: () => Response | Promise<Response>;
}

function install(search: string, options: InstallOptions = {}): Harness {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const observed: Observed[] = [];
  const navigation = { assigned: [] as string[] };
  const replaced: { data: unknown; url: string }[] = [];
  let href = `http://localhost/app/account/login${search}`;
  const location = {
    hash: options.hash ?? "",
    get href() {
      return href;
    },
    set href(path: string) {
      navigation.assigned.push(path);
      href = path;
    },
    pathname: "/app/account/reset-password",
    search,
  };
  const history = {
    replaceState(data: unknown, _unused: string, url: string) {
      replaced.push({ data, url });
    },
  };

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    observed.push({ body: typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : null, method: (init?.method ?? "GET").toUpperCase(), url });
    if (url === "/api/auth/register") return options.register ? options.register() : Response.json({ success: true });
    if (url === "/api/auth/password-reset/request") return options.resetRequest ? options.resetRequest() : Response.json({ success: true });
    if (url === "/api/auth/password-reset/confirm") return options.confirm ? options.confirm() : Response.json({ success: true });
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

  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, history, location, removeEventListener() {} } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });

  return {
    navigation,
    observed,
    replaced,
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

// ============================================================================
// 认证弹窗 任务 3：找回（设计 394–420）/ 新密码（422–463）
// ============================================================================

const VALID_TOKEN = "A".repeat(21) + "b".repeat(21) + "_";

function textOf(node: { children: Array<string | { children: unknown[] }> }): string {
  return node.children.map((child) => (typeof child === "string" ? child : textOf(child as { children: Array<string | { children: unknown[] }> }))).join("");
}

function statuses(renderer: ReactTestRenderer): string[] {
  return renderer.root.findAll((node) => node.props.role === "status" && typeof node.type === "string").map((node) => textOf(node as never));
}

function hrefs(renderer: ReactTestRenderer): string[] {
  return renderer.root.findAllByType("a").map((node) => String(node.props.href));
}

function hasForm(renderer: ReactTestRenderer): boolean {
  return renderer.root.findAllByType("form").length === 1;
}

async function fillReset(renderer: ReactTestRenderer, password: string, confirmation: string): Promise<void> {
  await act(async () => {
    input(renderer, "au-new-password").props.onChange({ target: { value: password } });
    input(renderer, "au-confirm-password").props.onChange({ target: { value: confirmation } });
  });
}

// ---- SSR 结构 ----

test("forgot SSR: design head, single email field directly under the form (gap 24), au-btn-primary, 30-minute hint, ← 返回登录 with next; no password/eye/google/status", () => {
  const html = renderToStaticMarkup(<AuthModal defaultNext="/app/home" oauthProviders={["google"]} view="forgot" />);
  assert.match(html, /aria-labelledby="au-title-forgot"/u);
  assert.match(html, /<div class="au-view"><div class="au-head"><h2 class="au-h2" id="au-title-forgot">重置密码<\/h2><p class="au-sub">输入注册邮箱，我们会发送一条重置链接。<\/p><\/div><form class="au-view" novalidate=""><div class="au-label"><label for="au-email">邮箱<\/label><input autoComplete="email" class="au-input" id="au-email" inputMode="email" placeholder="you@company.com" required="" type="email" value=""\/><\/div><button class="btn au-btn-primary" style="opacity:1" type="submit">申请重置链接<\/button><span class="au-hint">重置链接有效期 30 分钟。<\/span><\/form><p class="au-back"><a class="au-back-link" href="\/app\/account\/login\?next=%2Fapp%2Fhome">← 返回登录<\/a><\/p><\/div>/u);
  const body = html.slice(html.indexOf("</style>"));
  assert.doesNotMatch(body, /au-password|au-eye|au-google|au-fields|role="alert"|role="status"|au-success|重新申请|taken@orbit\.app|failfail|演示/u);
  assert.doesNotMatch(body, /<button(?![^>]*class="btn )/u, "every button carries the btn token");
});

test("reset SSR (审阅修订 11): tokenValid branch first with the submit disabled until ready; invalid branch never in the server markup", () => {
  const html = renderToStaticMarkup(<AuthModal view="reset" />);
  assert.match(html, /aria-labelledby="au-title-reset"/u);
  assert.match(html, /<div class="au-view"><div class="au-head"><h2 class="au-h2" id="au-title-reset">设置新密码<\/h2><p class="au-sub">请设置一个至少 8 位的新密码。<\/p><\/div><form class="au-view" novalidate=""><div class="au-fields">/u);
  assert.match(html, /<div class="au-label"><label for="au-new-password">新密码<\/label><input autoComplete="new-password" class="au-input" id="au-new-password" maxLength="72" minLength="8" placeholder="至少 8 位" required="" type="password" value=""\/><\/div>/u);
  assert.match(html, /<div class="au-label"><label for="au-confirm-password">确认新密码<\/label><input autoComplete="new-password" class="au-input" id="au-confirm-password" maxLength="72" minLength="8" placeholder="再输入一次" required="" type="password" value=""\/><\/div><\/div>/u);
  assert.match(html, /<button class="btn au-btn-primary" disabled="" style="opacity:1" type="submit">设置新密码<\/button><\/form><p class="au-back"><a class="au-back-link" href="\/app\/account\/login">← 返回登录<\/a><\/p><\/div>/u);
  const body = html.slice(html.indexOf("</style>"));
  assert.doesNotMatch(body, /链接已失效|重新申请重置链接|密码已更新|用新密码登录|au-eye|au-google|role="alert"|role="status"|failfail|演示/u);
  assert.doesNotMatch(body, /<button(?![^>]*class="btn )/u, "every button carries the btn token");
});

test("AUTH_STYLES (任务 3): success card 401, hint 415, back row 418 verbatim; primary :hover carries only the design background; link-shaped primary neutralised", () => {
  assert.match(AUTH_STYLES, /\.au-success \{ display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 12px; background: #ECEEFB; color: #2E3270; font-size: 14px; line-height: 1\.6; \}/u);
  assert.match(AUTH_STYLES, /\.au-success-title \{ font-size: 15px; \}/u);
  assert.match(AUTH_STYLES, /\.au-hint \{ text-align: center; font-size: 13px; color: #8A8DB0; \}/u);
  assert.match(AUTH_STYLES, /\.au-back \{ margin: 0; text-align: center; font-size: 14px; \}/u);
  assert.match(AUTH_STYLES, /\.au-back-link \{ color: #3B3F7A; border-bottom: 1px solid #B9BCEB; \}/u);
  assert.match(AUTH_STYLES, /\.btn\.au-btn-login:hover \{ background: #2E3270; \}/u);
  assert.match(AUTH_STYLES, /\.btn\.au-btn-primary:hover \{ background: #2E3270; \}/u);
  assert.match(AUTH_STYLES, /\.btn\.au-btn-link:active \{ transform: none; \}/u);
  assert.doesNotMatch(AUTH_STYLES, /\] button \{ font-family: inherit; \}/u, "redundant button{font-family:inherit} rule dropped (每个 .btn.au-* 已自带)");
});

// ---- 找回 ----

test("forgot: local validation shows 请输入有效的邮箱地址。 with zero network", async () => {
  await withModal("forgot", "", {}, async (renderer, harness) => {
    await act(async () => { input(renderer, "au-email").props.onChange({ target: { value: "nope" } }); });
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["请输入有效的邮箱地址。"]);
    assert.equal(harness.observed.length, 0);
  });
});

test("forgot: POST /api/auth/password-reset/request {email} → success card replaces the form; 重新申请 returns to the form and a later success shows the card again", async () => {
  await withModal("forgot", `?next=${encodeURIComponent(NEXT)}`, {}, async (renderer, harness) => {
    await act(async () => { input(renderer, "au-email").props.onChange({ target: { value: "owner@example.invalid" } }); });
    await submit(renderer);
    assert.deepEqual(harness.observed.map((call) => [call.method, call.url, call.body]), [["POST", "/api/auth/password-reset/request", JSON.stringify({ email: "owner@example.invalid" })]]);
    assert.equal(hasForm(renderer), false);
    const card = renderer.root.find((node) => node.type === "div" && node.props.className === "au-success");
    assert.equal(card.props.role, "status");
    assert.equal(textOf(card as never), "✦ 重置链接已发送请查看 owner@example.invalid 的收件箱。链接 30 分钟内有效。如果该邮箱支持密码恢复，链接会很快送达。");
    assert.deepEqual(alerts(renderer), []);
    // 审阅修订 10：成功卡下「未收到？可在一分钟后 重新申请」；「← 返回登录」带 next。
    const resend = renderer.root.find((node) => node.type === "a" && node.children.includes("重新申请"));
    assert.equal(resend.props.href, `/app/account/forgot-password?next=${encodeURIComponent(NEXT)}`);
    assert.ok(hrefs(renderer).includes(`/app/account/login?next=${encodeURIComponent(NEXT)}`));
    let prevented = 0;
    await act(async () => { resend.props.onClick({ preventDefault() { prevented += 1; } }); });
    assert.equal(prevented, 1);
    assert.ok(hasForm(renderer));
    assert.deepEqual(statuses(renderer), []);
    assert.equal(input(renderer, "au-email").props.value, "owner@example.invalid");
    await submit(renderer);
    assert.equal(harness.observed.length, 2);
    assert.equal(hasForm(renderer), false);
    assert.equal(statuses(renderer).length, 1);
    assert.deepEqual(harness.navigation.assigned, []);
  });
});

test("forgot: server message wins, fallback copy otherwise, pending state reads 发送中… with inline opacity 0.6", async () => {
  let attempt = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await withModal("forgot", "", {
    resetRequest: async () => {
      attempt += 1;
      if (attempt === 1) return Response.json({ success: false, error: { message: "Cooldown" } }, { status: 429 });
      if (attempt === 2) return Response.json({ success: false }, { status: 503 });
      await gate;
      return Response.json({ success: true });
    },
  }, async (renderer) => {
    await act(async () => { input(renderer, "au-email").props.onChange({ target: { value: "owner@example.invalid" } }); });
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["Cooldown"]);
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["密码恢复暂不可用，请稍后重试。"]);
    assert.ok(hasForm(renderer));
    let pending!: Promise<void>;
    await act(async () => {
      pending = renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
      await settle();
    });
    assert.deepEqual(alerts(renderer), []);
    assert.equal(submitLabel(renderer), "发送中…");
    assert.equal(submitButton(renderer).props.disabled, true);
    assert.deepEqual(submitButton(renderer).props.style, { opacity: 0.6 });
    await act(async () => { release(); await pending; await settle(); });
    assert.equal(hasForm(renderer), false);
    assert.equal(statuses(renderer).length, 1);
  });
});

// ---- 新密码 ----

test("reset: missing / short / malformed / absent token → 链接已失效 branch after mount with the primary-shaped link to forgot and ← 返回登录", async () => {
  for (const hash of ["", "#token=short", `#token=${VALID_TOKEN}!`, "#other=1"]) {
    await withModal("reset", "", { hash }, async (renderer, harness) => {
      assert.equal(hasForm(renderer), false, `hash ${JSON.stringify(hash)} should not render the form`);
      const h2 = renderer.root.findByType("h2");
      assert.equal(h2.props.id, "au-title-reset");
      assert.equal(h2.children.join(""), "链接已失效");
      assert.equal(renderer.root.findByProps({ className: "au-sub" }).children.join(""), "这条重置链接无效或已过期。重置链接仅在 30 分钟内有效。");
      const again = renderer.root.find((node) => node.type === "a" && node.props.className === "btn au-btn-primary au-btn-link");
      assert.equal(again.props.href, "/app/account/forgot-password");
      assert.equal(again.children.join(""), "重新申请重置链接");
      assert.deepEqual(hrefs(renderer), ["/app/account/forgot-password", "/app/account/login"]);
      assert.deepEqual(alerts(renderer), []);
      assert.equal(harness.observed.length, 0);
    });
  }
});

test("reset: valid token → form enabled after mount; local validation 新密码至少 8 位。 / 两次输入的密码不一致。 with zero network", async () => {
  await withModal("reset", "", { hash: `#token=${VALID_TOKEN}` }, async (renderer, harness) => {
    assert.ok(hasForm(renderer));
    assert.equal(submitButton(renderer).props.disabled, false);
    assert.equal(submitLabel(renderer), "设置新密码");
    await fillReset(renderer, "1234567", "1234567");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["新密码至少 8 位。"]);
    await fillReset(renderer, "new-password-1", "new-password-2");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["两次输入的密码不一致。"]);
    assert.equal(harness.observed.length, 0);
    assert.deepEqual(hrefs(renderer), ["/app/account/login"]);
  });
});

test("reset: confirm POST {token,password} (other hash keys ignored) → replaceState clears the hash → 密码已更新 with the session note and 用新密码登录", async () => {
  await withModal("reset", "", { hash: `#foo=bar&token=${VALID_TOKEN}` }, async (renderer, harness) => {
    await fillReset(renderer, "new-password-1", "new-password-1");
    await submit(renderer);
    assert.deepEqual(harness.observed.map((call) => [call.method, call.url, call.body]), [["POST", "/api/auth/password-reset/confirm", JSON.stringify({ token: VALID_TOKEN, password: "new-password-1" })]]);
    assert.deepEqual(harness.replaced, [{ data: null, url: "/app/account/reset-password" }]);
    assert.equal(hasForm(renderer), false);
    assert.equal(renderer.root.findByType("h2").children.join(""), "密码已更新");
    assert.deepEqual(renderer.root.findAllByProps({ className: "au-sub" }).map((node) => node.children.join("")), [
      "你的密码已重置，现在可以用新密码登录。",
      "其他设备上的旧会话已失效，需要重新登录。",
    ]);
    const login = renderer.root.find((node) => node.type === "a" && node.props.className === "btn au-btn-primary au-btn-link");
    assert.equal(login.props.href, "/app/account/login");
    assert.equal(login.children.join(""), "用新密码登录");
    assert.deepEqual(hrefs(renderer), ["/app/account/login", "/app/account/login"]);
    assert.deepEqual(alerts(renderer), []);
  });
});

test("reset: server message wins, fallback 重置失败，请稍后重试。; pending reads 保存中… with opacity 0.6 and the second in-flight submit sends nothing", async () => {
  let attempt = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await withModal("reset", "", {
    hash: `#token=${VALID_TOKEN}`,
    confirm: async () => {
      attempt += 1;
      if (attempt === 1) return Response.json({ success: false, error: { message: "Token expired" } }, { status: 410 });
      if (attempt === 2) return Response.json({ success: false }, { status: 500 });
      await gate;
      return Response.json({ success: true });
    },
  }, async (renderer, harness) => {
    await fillReset(renderer, "new-password-1", "new-password-1");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["Token expired"]);
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["重置失败，请稍后重试。"]);
    assert.ok(hasForm(renderer));
    assert.deepEqual(harness.replaced, []);
    let pending!: Promise<void>;
    await act(async () => {
      pending = renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
      await settle();
    });
    assert.equal(submitLabel(renderer), "保存中…");
    assert.equal(submitButton(renderer).props.disabled, true);
    assert.equal(submitButton(renderer).props["aria-busy"], true);
    assert.deepEqual(submitButton(renderer).props.style, { opacity: 0.6 });
    await act(async () => { await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }); await settle(); });
    assert.equal(harness.observed.length, 3);
    await act(async () => { release(); await pending; await settle(); });
    assert.equal(hasForm(renderer), false);
    assert.equal(harness.observed.length, 3);
  });
});
