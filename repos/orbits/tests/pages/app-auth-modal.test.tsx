import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { readFileSync } from "node:fs";

import { AuthModal, type AuthModalView } from "../../app/(app)/app/orbit-2026/auth-public/auth-modal";
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
  passwordChange?: () => Response | Promise<Response>;
  passwordStatus?: () => Response | Promise<Response>;
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
    if (url === "/api/auth/password/status") return options.passwordStatus ? options.passwordStatus() : Response.json({ mustChangePassword: false });
    if (url === "/api/auth/password/change") return options.passwordChange ? options.passwordChange() : Response.json({ success: true, data: { message: "密码已更新。" } });
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

test("redesigned auth dialog has an accessible route-preserving shell", () => {
  const html = renderToStaticMarkup(<AuthModal defaultNext="/app/home" oauthProviders={["google"]} view="login" />);
  assert.match(html, /data-orbit-2026/);
  assert.match(html, /aria-labelledby="au-title-login" aria-modal="true"/);
  assert.match(html, /href="\/app\/account\/forgot-password\?next=%2Fapp%2Fhome"/);
  assert.match(html, /href="\/app\/account\/signup\?next=%2Fapp%2Fhome"/);
  assert.match(html, /au-google/);
  assert.match(html, /au-divider/);
  assert.doesNotMatch(html, /data-orbit-real-page="auth-0918"/);
});

test("registration keeps legal links in separate tabs and the typed form in place", () => {
  const html = renderToStaticMarkup(<AuthModal defaultNext="/app/home" view="register" />);
  assert.match(html, /href="\/terms" rel="noopener noreferrer" target="_blank"/);
  assert.match(html, /href="\/privacy" rel="noopener noreferrer" target="_blank"/);
  assert.match(html, /id="au-email"/);
  assert.match(html, /id="au-password"/);
});

test("redesigned auth CSS uses shared theme tokens for light and dark", () => {
  const css = readFileSync(new URL("../../app/(app)/app/orbit-2026/auth-public/AuthDialog.module.css", import.meta.url), "utf8");
  assert.match(css, /var\(--surface\)/);
  assert.match(css, /var\(--ink\)/);
  assert.match(css, /var\(--z-modal\)/);
  assert.doesNotMatch(css, /#0E1225|#FFFFFF/);
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

test("login: created notice ignores URL email and forgot/switch links carry the safe next", async () => {
  await withModal("login", `?next=${encodeURIComponent(NEXT)}&created=1&email=${encodeURIComponent("new@example.invalid")}`, {}, async (renderer) => {
    const status = renderer.root.findAll((node) => node.props.role === "status" && typeof node.type === "string");
    assert.equal(status.length, 1);
    assert.equal(status[0].props.className, "au-notice");
    assert.equal(status[0].children.join(""), "账号已创建，但自动登录未完成。请用刚设置的密码登录。");
    assert.equal(input(renderer, "au-email").props.value, "");
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

test("overlay: a click inside the panel does not close; mousedown in the panel released on the overlay does not close (终审修正); mousedown+click on the overlay itself and × both navigate to /app", async () => {
  await withModal("login", "", {}, async (renderer, harness) => {
    // The outside click is taken by the backdrop layer (au-scrim) inside au-overlay.
    const overlay = renderer.root.find((node) => node.type === "div" && node.props.className === "au-scrim");
    const panel = renderer.root.find((node) => node.props.role === "dialog");
    await act(async () => { overlay.props.onMouseDown({ currentTarget: overlay, target: panel }); overlay.props.onClick({ currentTarget: overlay, target: panel }); });
    assert.deepEqual(harness.navigation.assigned, []);
    // 拖选：面板内按下、遮罩上松开 → click 的 target 是遮罩本体，但 mousedown 不是 → 不关。
    await act(async () => { overlay.props.onMouseDown({ currentTarget: overlay, target: panel }); overlay.props.onClick({ currentTarget: overlay, target: overlay }); });
    assert.deepEqual(harness.navigation.assigned, []);
    // 没有 mousedown 记录的孤立 click（上一次已清位）同样不关。
    await act(async () => { overlay.props.onClick({ currentTarget: overlay, target: overlay }); });
    assert.deepEqual(harness.navigation.assigned, []);
    await act(async () => { overlay.props.onMouseDown({ currentTarget: overlay, target: overlay }); overlay.props.onClick({ currentTarget: overlay, target: overlay }); });
    assert.deepEqual(harness.navigation.assigned, ["/app"]);
    const close = renderer.root.find((node) => node.type === "button" && node.props.className === "btn au-lbtn au-close");
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

test("forgot SSR exposes a recoverable request form without account enumeration", () => {
  const html = renderToStaticMarkup(<AuthModal defaultNext="/app/home" view="forgot" />);
  assert.match(html, /aria-labelledby="au-title-forgot"/);
  assert.match(html, /发送重置链接/);
  assert.match(html, /id="au-email"/);
  assert.doesNotMatch(html, /id="au-password"|au-google|role="status"/);
});

test("reset SSR (审阅修订 11): tokenValid branch first with the submit disabled until ready; invalid branch never in the server markup", () => {
  const html = renderToStaticMarkup(<AuthModal view="reset" />);
  assert.match(html, /aria-labelledby="au-title-reset"/u);
  assert.match(html, /id="au-title-reset">新密码<\/h2>/u);
  assert.match(html, /id="au-new-password" maxLength="72" minLength="8"/u);
  assert.match(html, /id="au-confirm-password" maxLength="72" minLength="8"/u);
  assert.match(html, /<button class="btn au-btn-primary" disabled=""[^>]*>修改密码并返回登录<\/button>/u);
  const body = html.slice(html.indexOf("</style>"));
  assert.doesNotMatch(body, /链接已失效|重新申请重置链接|密码已更新|用新密码登录|au-eye|au-google|role="alert"|role="status"|failfail|演示/u);
  assert.doesNotMatch(body, /<button(?![^>]*class="btn )/u, "every button carries the btn token");
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

test("forgot: POST /api/auth/password-reset/request {email} shows generic acceptance and a safe login path", async () => {
  await withModal("forgot", `?next=${encodeURIComponent(NEXT)}`, {}, async (renderer, harness) => {
    await act(async () => { input(renderer, "au-email").props.onChange({ target: { value: "owner@example.invalid" } }); });
    await submit(renderer);
    assert.deepEqual(harness.observed.map((call) => [call.method, call.url, call.body]), [["POST", "/api/auth/password-reset/request", JSON.stringify({ email: "owner@example.invalid" })]]);
    assert.equal(hasForm(renderer), false);
    assert.deepEqual(statuses(renderer), ["如果该地址已注册，你会收到邮件。"]);
    assert.deepEqual(alerts(renderer), []);
    assert.deepEqual(hrefs(renderer), [`/app/account/login?next=${encodeURIComponent(NEXT)}`]);
    assert.deepEqual(harness.navigation.assigned, []);
  });
});

test("forgot: different addresses receive identical acceptance copy without exposing either address", async () => {
  for (const email of ["owner@example.invalid", "other@example.invalid"]) {
    await withModal("forgot", "", {}, async (renderer, harness) => {
      await act(async () => { input(renderer, "au-email").props.onChange({ target: { value: email } }); });
      await submit(renderer);
      assert.equal(harness.observed.length, 1);
      assert.equal(hasForm(renderer), false);
      assert.deepEqual(statuses(renderer), ["如果该地址已注册，你会收到邮件。"]);
      assert.equal(textOf(renderer.root as never).includes(email), false);
    });
  }
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

test("reset: missing / short / malformed / absent token has one generic reapplication path", async () => {
  for (const hash of ["", "#token=short", `#token=${VALID_TOKEN}!`, "#other=1"]) {
    await withModal("reset", "", { hash }, async (renderer, harness) => {
      assert.equal(hasForm(renderer), false, `hash ${JSON.stringify(hash)} should not render the form`);
      const h2 = renderer.root.findByType("h2");
      assert.equal(h2.props.id, "au-title-reset");
      assert.equal(h2.children.join(""), "此链接无法使用");
      const copy = renderer.root.findByProps({ className: "au-sub" });
      assert.equal(copy.type, "p");
      assert.equal(copy.props.role, "alert");
      assert.equal(copy.children.join(""), "链接可能已失效或已被使用。\n请重新申请重置密码。");
      const again = renderer.root.find((node) => node.type === "a" && node.props.className === "btn au-btn-primary au-btn-link");
      assert.equal(again.props.href, "/app/account/forgot-password");
      assert.equal(again.children.join(""), "申请重置密码");
      assert.deepEqual(hrefs(renderer), ["/app/account/forgot-password", "/app/account/login"]);
      assert.deepEqual(alerts(renderer), ["链接可能已失效或已被使用。\n请重新申请重置密码。"]);
      assert.deepEqual(statuses(renderer), []);
      assert.equal(harness.observed.length, 0);
    });
  }
});

test("reset: valid token → form enabled after mount; local validation 新密码至少 8 位。 / 两次输入的密码不一致。 with zero network", async () => {
  await withModal("reset", "", { hash: `#token=${VALID_TOKEN}` }, async (renderer, harness) => {
    assert.ok(hasForm(renderer));
    assert.equal(submitButton(renderer).props.disabled, false);
    assert.equal(submitLabel(renderer), "修改密码并返回登录");
    await fillReset(renderer, "1234567", "1234567");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["新密码至少 8 位。"]);
    await fillReset(renderer, "new-password-1", "new-password-2");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["两次输入的密码不一致。"]);
    assert.equal(harness.observed.length, 0);
    assert.deepEqual(hrefs(renderer), []);
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
    assert.deepEqual(renderer.root.findAllByProps({ className: "au-sub" }).map((node) => node.children.join("")), ["请使用新密码登录。"]);
    const login = renderer.root.find((node) => node.type === "a" && node.props.className === "btn au-btn-primary au-btn-link");
    assert.equal(login.props.href, "/app/account/login");
    assert.equal(login.children.join(""), "用新密码登录");
    assert.deepEqual(hrefs(renderer), ["/app/account/login"]);
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

// ---- 首次登录强制改密 / 登录后修改密码 ----

test("login: email field is autocomplete=username, both inputs carry name, and it stays a real <form> submit", () => {
  const html = renderToStaticMarkup(<AuthModal defaultNext="/app/home" view="login" />);
  assert.match(html, /<form[^>]*class="au-view"/);
  assert.match(html, /<input autoComplete="username"[^>]*id="au-email"[^>]*name="email"/i);
  assert.match(html, /<input autoComplete="current-password"[^>]*id="au-password"[^>]*name="password"/i);
  assert.match(html, /<button[^>]*type="submit"/);
  assert.doesNotMatch(html, /onpaste|oncopy/i);
  const register = renderToStaticMarkup(<AuthModal defaultNext="/app/home" view="register" />);
  assert.match(register, /<input autoComplete="email"[^>]*id="au-email"[^>]*name="email"/i);
});

test("login: pasted password text is trimmed (selection replaced, caret after it); typed text and clean pastes are untouched", async () => {
  await withModal("login", "", {}, async (renderer) => {
    const carets: number[] = [];
    (globalThis.window as unknown as { requestAnimationFrame: (run: () => void) => void }).requestAnimationFrame = (run) => run();
    const paste = async (value: string, start: number, end: number, text: string) => {
      let prevented = false;
      await act(async () => {
        input(renderer, "au-password").props.onPaste({
          clipboardData: { getData: () => text },
          currentTarget: { selectionEnd: end, selectionStart: start, setSelectionRange: (caret: number) => carets.push(caret), value },
          preventDefault() { prevented = true; },
        });
      });
      return prevented;
    };
    assert.equal(await paste("", 0, 0, "  Init-Pass-8x\r\n"), true);
    assert.equal(input(renderer, "au-password").props.value, "Init-Pass-8x");
    assert.deepEqual(carets, [12]);
    assert.equal(await paste("abXYcd", 2, 4, "\tmid "), true);
    assert.equal(input(renderer, "au-password").props.value, "abmidcd");
    assert.equal(await paste("abc", 3, 3, "clean"), false, "a paste without surrounding whitespace uses the browser default");
    await act(async () => { input(renderer, "au-password").props.onChange({ target: { value: " typed " } }); });
    assert.equal(input(renderer, "au-password").props.value, " typed ");
  });
});

test("register: the password field has no paste handler (only sign-in trims pastes)", async () => {
  await withModal("register", "", {}, async (renderer) => {
    assert.equal(input(renderer, "au-password").props.onPaste, undefined);
  });
});

test("login: an account flagged mustChangePassword goes to the change-password page with the original next", async () => {
  await withModal("login", `?next=${encodeURIComponent(NEXT)}`, { credentials: "success", passwordStatus: () => Response.json({ mustChangePassword: true }) }, async (renderer, harness) => {
    await fill(renderer, "owner@example.invalid", "password-123");
    await submit(renderer);
    assert.ok(harness.observed.some((call) => call.url === "/api/auth/password/status" && call.method === "GET"));
    assert.deepEqual(harness.navigation.assigned, [`/app/account/change-password?next=${encodeURIComponent(NEXT)}&first=1`]);
  });
});

test("login: an unreadable password status does not block sign-in", async () => {
  await withModal("login", `?next=${encodeURIComponent(NEXT)}`, { credentials: "success", passwordStatus: () => Response.json({ success: false }, { status: 503 }) }, async (renderer, harness) => {
    await fill(renderer, "owner@example.invalid", "password-123");
    await submit(renderer);
    assert.deepEqual(harness.navigation.assigned, [profileContinuationPath(NEXT)]);
  });
});

async function withChangeModal(options: InstallOptions, run: (renderer: ReactTestRenderer, harness: Harness) => Promise<void>, first = true): Promise<void> {
  const harness = install("", options);
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(<AuthModal changePassword={{ email: "owner@example.invalid", first, next: NEXT }} closeHref={NEXT} view="change-password" />);
      await settle();
    });
    await run(renderer!, harness);
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    harness.restore();
  }
}

async function fillChange(renderer: ReactTestRenderer, current: string, next: string): Promise<void> {
  await act(async () => {
    input(renderer, "au-current-password").props.onChange({ target: { value: current } });
    input(renderer, "au-changed-password").props.onChange({ target: { value: next } });
  });
}

test("change-password SSR reuses the reset screen classes with current/new autocomplete and a hidden username", () => {
  const html = renderToStaticMarkup(<AuthModal changePassword={{ email: "owner@example.invalid", first: true, next: "/app/home" }} closeHref="/app/home" view="change-password" />);
  assert.match(html, /aria-labelledby="au-title-change-password"/);
  assert.match(html, /<h2 class="au-h2" id="au-title-change-password">修改密码<\/h2>/);
  assert.match(html, /邮件里的初始密码/);
  assert.match(html, /<input aria-hidden="true" autoComplete="username" hidden="" name="username" readOnly="" tabindex="-1" type="email" value="owner@example.invalid"\/>/i);
  assert.match(html, /<input autoComplete="current-password" class="au-input" id="au-current-password"[^>]*type="password"/i);
  assert.match(html, /<input autoComplete="new-password" class="au-input" id="au-changed-password"[^>]*type="password"/i);
  assert.match(html, /<span class="au-hint">至少 8 位<\/span>/);
  assert.match(html, /class="btn au-btn-primary"/);
  const plain = renderToStaticMarkup(<AuthModal changePassword={{ email: "owner@example.invalid", first: false, next: "/app/home" }} view="change-password" />);
  assert.match(plain, /输入当前密码和新密码。/);
});

test("change-password: local validation (current required / 8+ / differs) sends nothing", async () => {
  await withChangeModal({}, async (renderer, harness) => {
    await fillChange(renderer, "", "new-password-1");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["请输入当前密码。"]);
    await fillChange(renderer, "old-password", "short");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["新密码至少 8 位。"]);
    await fillChange(renderer, "same-password", "same-password");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["新密码不能与当前密码相同。"]);
    assert.equal(harness.observed.length, 0);
  });
});

test("change-password: success posts {currentPassword,newPassword}, re-signs in with the new password and continues to next", async () => {
  await withChangeModal({ credentials: "success" }, async (renderer, harness) => {
    await fillChange(renderer, "Init-Pass-8x", "my-own-password");
    await submit(renderer);
    const change = harness.observed.find((call) => call.url === "/api/auth/password/change");
    assert.ok(change);
    assert.equal(change.method, "POST");
    assert.deepEqual(JSON.parse(String(change.body)), { currentPassword: "Init-Pass-8x", newPassword: "my-own-password" });
    const callback = harness.observed.find((call) => call.url.includes("/callback/credentials"));
    assert.ok(callback);
    const body = new URLSearchParams(String(callback.body));
    assert.equal(body.get("email"), "owner@example.invalid");
    assert.equal(body.get("password"), "my-own-password");
    assert.deepEqual(harness.navigation.assigned, [profileContinuationPath(NEXT)]);
    assert.equal(submitButton(renderer).props.disabled, true, "stays busy while leaving the page");
  });
});

test("change-password: a failed re-sign-in falls back to the login page with next", async () => {
  await withChangeModal({ credentials: "failure" }, async (renderer, harness) => {
    await fillChange(renderer, "Init-Pass-8x", "my-own-password");
    await submit(renderer);
    assert.deepEqual(harness.navigation.assigned, [`/app/account/login?next=${encodeURIComponent(NEXT)}`]);
  });
});

test("change-password: server error codes map to localized copy; unknown errors show the server message", async () => {
  let reply = Response.json({ success: false, error: { code: "WRONG_PASSWORD", message: "当前密码不正确。" } }, { status: 400 });
  await withChangeModal({ passwordChange: () => reply }, async (renderer, harness) => {
    await fillChange(renderer, "wrong-password", "my-own-password");
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["当前密码不正确。"]);
    reply = Response.json({ success: false, error: { code: "SOMETHING_NEW", message: "服务端说明" } }, { status: 400 });
    await submit(renderer);
    assert.deepEqual(alerts(renderer), ["服务端说明"]);
    assert.deepEqual(harness.navigation.assigned, []);
    assert.equal(submitButton(renderer).props.disabled, false);
  });
});

test("change-password: closing goes back to next instead of the landing page", async () => {
  await withChangeModal({}, async (renderer, harness) => {
    await act(async () => { renderer.root.findByProps({ "aria-label": "关闭" }).props.onClick(); });
    assert.deepEqual(harness.navigation.assigned, [NEXT]);
  });
});
