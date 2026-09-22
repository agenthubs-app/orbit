import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OrbitRealAccountAuth } from "../../app/(app)/app/account/orbit-real-account-auth";
import { getOrbitAccountAuthViewModel } from "../../app/(app)/app/orbit-account-auth-route-view-model";
import { profileContinuationPath } from "../../app/(app)/app/profile/profile-onboarding-navigation";

// 特征化渲染测试（认证弹窗 任务 1）：锁定 登录 / 注册 / 找回 三态的 query 归一化、
// signIn("credentials") 调用形状、/api/auth/register 与 /api/auth/password-reset/request 的
// POST 体、错误文案、Google callbackUrl 与 continuation 导航，使逻辑搬进
// use-account-auth 时零变化可证。next-auth/react 的 signIn 不做模块替换（node:test 的
// mock.module 在本仓库运行方式下不可用），而是在 fetch 层桩住它的 /providers、/csrf、
// /callback/credentials、/signin/google 四个端点——`redirect:false` 的调用形状体现在
// 回调体不含 `redirect` 且 next-auth 自身不做导航。

type AuthMode = "forgot" | "login" | "signup";

interface Observed {
  body: string | null;
  headers: Record<string, string>;
  method: string;
  url: string;
}

interface Harness {
  navigation: { href: string; assigned: string[]; reloads: number };
  observed: Observed[];
  restore: () => void;
}

interface Responses {
  credentials?: "failure" | "success";
  google?: string;
  register?: Response | (() => Response);
  resetRequest?: Response | (() => Response);
}

function install(search: string, responses: Responses = {}): Harness {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const observed: Observed[] = [];
  const navigation = { assigned: [] as string[], href: `http://localhost/app/account/login${search}`, reloads: 0 };
  let href = navigation.href;
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

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const call: Observed = {
      body: typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : null,
      headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) },
      method: (init?.method ?? "GET").toUpperCase(),
      url,
    };
    observed.push(call);

    if (url === "/api/auth/register") {
      const configured = responses.register;
      if (configured instanceof Response) return configured;
      if (typeof configured === "function") return configured();
      return Response.json({ success: true });
    }
    if (url === "/api/auth/password-reset/request") {
      const configured = responses.resetRequest;
      if (configured instanceof Response) return configured;
      if (typeof configured === "function") return configured();
      return Response.json({ success: true });
    }
    if (url.endsWith("/providers")) {
      return Response.json({
        credentials: { id: "credentials", type: "credentials" },
        google: { id: "google", type: "oauth" },
      });
    }
    if (url.endsWith("/csrf")) return Response.json({ csrfToken: "test-csrf-token" });
    if (url.includes("/callback/credentials")) {
      return responses.credentials === "failure"
        ? Response.json({ url: "http://localhost/api/auth/error?error=CredentialsSignin" }, { status: 401 })
        : Response.json({ url: "http://localhost/app/profile/continue" });
    }
    if (url.includes("/signin/google")) {
      return Response.json({ url: responses.google ?? "/app/profile/continue" });
    }
    throw new Error(`Unexpected auth fetch: ${url}`);
  }) as typeof fetch;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { addEventListener() {}, location, removeEventListener() {} },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement: null, addEventListener() {}, removeEventListener() {} },
  });

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

async function mount(mode: AuthMode, oauthProviders: readonly string[] = []): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <OrbitRealAccountAuth oauthProviders={oauthProviders} viewModel={getOrbitAccountAuthViewModel(mode)} />,
    );
    await settle();
  });
  return renderer;
}

async function unmount(renderer: ReactTestRenderer | undefined): Promise<void> {
  if (!renderer) return;
  await act(async () => {
    renderer.unmount();
  });
}

function input(renderer: ReactTestRenderer, id: string) {
  const found = renderer.root.findAllByType("input").find((candidate) => candidate.props.id === id);
  assert.ok(found, `expected input ${id}`);
  return found;
}

async function fill(renderer: ReactTestRenderer, email: string, password = ""): Promise<void> {
  await act(async () => {
    input(renderer, "orbit-auth-email").props.onChange({ target: { value: email } });
    if (password) input(renderer, "orbit-auth-password").props.onChange({ target: { value: password } });
  });
}

async function submit(renderer: ReactTestRenderer): Promise<void> {
  await act(async () => {
    await renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    await settle();
    await settle();
  });
}

function byRole(renderer: ReactTestRenderer, role: string): string[] {
  return renderer.root
    .findAll((node) => node.props.role === role && typeof node.type === "string")
    .map((node) => node.children.join(""));
}

function notices(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll((node) => node.type === "div" && node.props.className === "orbit-alert notice")
    .map((node) => node.children.join(""));
}

function anchorHrefs(renderer: ReactTestRenderer): string[] {
  return renderer.root.findAllByType("a").map((node) => String(node.props.href));
}

function submitButton(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => node.type === "button" && node.props.type === "submit")[0];
}

function submitLabel(renderer: ReactTestRenderer): string {
  return submitButton(renderer).children.filter((child) => typeof child === "string").join("");
}

const NEXT = "/app/contacts/new?eventId=char_1&source=auth";

test("login success: signIn(credentials, redirect:false) with the typed email/password, then continuation navigation", async () => {
  const harness = install(`?next=${encodeURIComponent(NEXT)}`, { credentials: "success" });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("login");
    await fill(renderer, "owner@example.invalid", "password-123");
    await submit(renderer);

    const callback = harness.observed.find((call) => call.url.includes("/callback/credentials"));
    assert.ok(callback, "credentials callback should be issued");
    assert.equal(callback.method, "POST");
    const body = new URLSearchParams(String(callback.body));
    assert.equal(body.get("email"), "owner@example.invalid");
    assert.equal(body.get("password"), "password-123");
    assert.equal(body.get("csrfToken"), "test-csrf-token");
    // redirect:false → next-auth 不把 redirect 放进表单体，也不自行跳转；跳转由组件完成。
    assert.equal(body.get("redirect"), null);
    assert.equal(body.get("callbackUrl"), `http://localhost/app/account/login?next=${encodeURIComponent(NEXT)}`);
    assert.deepEqual(harness.navigation.assigned, [profileContinuationPath(NEXT)]);
    assert.equal(harness.navigation.reloads, 0);
    assert.deepEqual(byRole(renderer, "alert"), []);
    assert.equal(harness.observed.some((call) => call.url === "/api/auth/register"), false);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("login failure: shows the incorrect-credentials copy, clears busy state, and does not navigate", async () => {
  const harness = install(`?next=${encodeURIComponent(NEXT)}`, { credentials: "failure" });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("login");
    await fill(renderer, "owner@example.invalid", "wrong");
    await submit(renderer);

    assert.deepEqual(byRole(renderer, "alert"), ["邮箱或密码不正确。"]);
    assert.deepEqual(harness.navigation.assigned, []);
    assert.equal(submitButton(renderer).props.disabled, false);
    assert.equal(submitButton(renderer).props["aria-busy"], undefined);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("network exception in the register call: shows the generic retry copy and does not navigate", async () => {
  // 登录态的 fetch 异常由 next-auth 自己吞掉（getProviders → null → 跳 /api/auth/error 并返回 undefined），
  // 组件层的 catch 只在 /api/auth/register、/api/auth/password-reset/request 抛错时可达。
  const harness = install(`?next=${encodeURIComponent(NEXT)}`);
  globalThis.fetch = (async () => {
    throw new TypeError("offline");
  }) as typeof fetch;
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("signup");
    await fill(renderer, "owner@example.invalid", "password-123");
    await submit(renderer);
    assert.deepEqual(byRole(renderer, "alert"), ["网络异常,请稍后再试。"]);
    assert.deepEqual(harness.navigation.assigned, []);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("signup success: POST /api/auth/register {email,password}, auto signIn(credentials), then continuation", async () => {
  const harness = install(`?next=${encodeURIComponent(NEXT)}`, { credentials: "success" });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("signup");
    await fill(renderer, "new-owner@example.invalid", "password-123");
    await submit(renderer);

    const register = harness.observed.find((call) => call.url === "/api/auth/register");
    assert.ok(register, "signup should create the account first");
    assert.equal(register.method, "POST");
    assert.equal(register.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(String(register.body)), { email: "new-owner@example.invalid", password: "password-123" });

    const callbacks = harness.observed.filter((call) => call.url.includes("/callback/credentials"));
    assert.equal(callbacks.length, 1);
    const body = new URLSearchParams(String(callbacks[0].body));
    assert.equal(body.get("email"), "new-owner@example.invalid");
    assert.equal(body.get("password"), "password-123");
    assert.equal(body.get("redirect"), null);
    assert.ok(
      harness.observed.indexOf(register) < harness.observed.indexOf(callbacks[0]),
      "register must precede the auto sign-in",
    );
    assert.deepEqual(harness.navigation.assigned, [profileContinuationPath(NEXT)]);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("signup auto sign-in failure: falls back to the created login URL with next and email prefill", async () => {
  const email = "fallback-owner@example.invalid";
  const harness = install(`?next=${encodeURIComponent(NEXT)}`, { credentials: "failure" });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("signup");
    await fill(renderer, email, "password-123");
    await submit(renderer);
    assert.deepEqual(harness.navigation.assigned, [
      `/app/account/login?next=${encodeURIComponent(NEXT)}&created=1&email=${encodeURIComponent(email)}`,
    ]);
    assert.deepEqual(byRole(renderer, "alert"), []);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("signup 409 → duplicate-email copy; other register errors → server message; no auto sign-in", async () => {
  for (const [response, expected] of [
    [Response.json({ success: false, error: { message: "ignored" } }, { status: 409 }), "该邮箱已注册,请直接登录。"],
    [Response.json({ success: false, error: { message: "Password too weak" } }, { status: 422 }), "Password too weak"],
    [Response.json({ success: false }, { status: 500 }), "注册失败,请稍后再试。"],
  ] as const) {
    const harness = install(`?next=${encodeURIComponent(NEXT)}`, { register: response });
    let renderer: ReactTestRenderer | undefined;
    try {
      renderer = await mount("signup");
      await fill(renderer, "dup@example.invalid", "password-123");
      await submit(renderer);
      assert.deepEqual(byRole(renderer, "alert"), [expected]);
      assert.equal(harness.observed.some((call) => call.url.includes("/callback/credentials")), false);
      assert.deepEqual(harness.navigation.assigned, []);
    } finally {
      await unmount(renderer);
      harness.restore();
    }
  }
});

test("forgot: POST /api/auth/password-reset/request {email} and announce acceptance in a role=status notice", async () => {
  const harness = install(`?next=${encodeURIComponent(NEXT)}`);
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("forgot");
    assert.equal(renderer.root.findAllByType("input").some((node) => node.props.id === "orbit-auth-password"), false);
    assert.equal(submitLabel(renderer), "申请重置链接");
    await fill(renderer, "owner@example.invalid");
    await submit(renderer);

    const request = harness.observed.find((call) => call.url === "/api/auth/password-reset/request");
    assert.ok(request, "reset request should be issued");
    assert.equal(request.method, "POST");
    assert.equal(request.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(String(request.body)), { email: "owner@example.invalid" });
    assert.deepEqual(byRole(renderer, "status"), [
      "申请已受理。如果该邮箱支持密码恢复，你将收到重置链接。请检查垃圾邮件；未收到时可在一分钟后重试。",
    ]);
    assert.deepEqual(byRole(renderer, "alert"), []);
    assert.deepEqual(harness.navigation.assigned, []);
    // 找回态的返回链接带 next；无 Google 按钮。
    assert.ok(anchorHrefs(renderer).includes(`/app/account/login?next=${encodeURIComponent(NEXT)}`));
    assert.equal(renderer.root.findAllByType("button").some((node) => node.children.includes("使用 Google 登录")), false);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("forgot failure: server message wins, fallback copy otherwise, and a later success clears the alert", async () => {
  let attempt = 0;
  const harness = install(`?next=${encodeURIComponent(NEXT)}`, {
    resetRequest: () => {
      attempt += 1;
      if (attempt === 1) return Response.json({ success: false, error: { message: "Cooldown" } }, { status: 429 });
      if (attempt === 2) return Response.json({ success: false }, { status: 503 });
      return Response.json({ success: true });
    },
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("forgot");
    await fill(renderer, "owner@example.invalid");
    await submit(renderer);
    assert.deepEqual(byRole(renderer, "alert"), ["Cooldown"]);
    await submit(renderer);
    assert.deepEqual(byRole(renderer, "alert"), ["密码恢复暂不可用，请稍后重试。"]);
    assert.deepEqual(byRole(renderer, "status"), []);
    await submit(renderer);
    assert.deepEqual(byRole(renderer, "alert"), []);
    assert.equal(byRole(renderer, "status").length, 1);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("Google: signIn(google, {callbackUrl: productHref(profileContinuationPath(next))}) and next-auth navigates", async () => {
  const expected = profileContinuationPath(NEXT);
  const harness = install(`?next=${encodeURIComponent(NEXT)}`, { google: expected });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("login", ["google"]);
    const google = renderer.root.findAllByType("button").find((node) => node.children.includes("使用 Google 登录"));
    assert.ok(google, "Google button should render when the provider is enabled");
    await act(async () => {
      google.props.onClick();
      await settle();
      await settle();
    });
    const call = harness.observed.find((entry) => entry.url.includes("/signin/google"));
    assert.ok(call, "Google sign-in request should be issued");
    const body = new URLSearchParams(String(call.body));
    assert.equal(body.get("callbackUrl"), expected);
    assert.deepEqual(harness.navigation.assigned, [expected]);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("Google button is absent without the provider", async () => {
  const harness = install("");
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("login");
    assert.equal(renderer.root.findAllByType("button").some((node) => node.children.includes("使用 Google 登录")), false);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("?next= normalisation: unsafe next falls back to the view-model default in every href after mount", async () => {
  const harness = install("?next=https%3A%2F%2Fevil.example%2Fsteal", { credentials: "success" });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("login");
    const hrefs = anchorHrefs(renderer);
    assert.ok(hrefs.includes("/app/account/forgot-password?next=%2Fapp%2Fhome"), hrefs.join(","));
    assert.ok(hrefs.includes("/app/account/signup?next=%2Fapp%2Fhome"), hrefs.join(","));
    await fill(renderer, "owner@example.invalid", "password-123");
    await submit(renderer);
    assert.deepEqual(harness.navigation.assigned, [profileContinuationPath("/app/home")]);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("?next= normalisation: a safe next is threaded through forgot/switch hrefs and the auth-page next is rejected", async () => {
  const safe = install(`?next=${encodeURIComponent(NEXT)}`);
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("signup");
    const hrefs = anchorHrefs(renderer);
    assert.ok(hrefs.includes(`/app/account/login?next=${encodeURIComponent(NEXT)}`), hrefs.join(","));
  } finally {
    await unmount(renderer);
    safe.restore();
  }

  const rejected = install("?next=%2Fapp%2Faccount%2Flogin");
  try {
    renderer = await mount("login");
    assert.ok(anchorHrefs(renderer).includes("/app/account/signup?next=%2Fapp%2Fhome"));
  } finally {
    await unmount(renderer);
    rejected.restore();
  }
});

test("?created=1&email= prefills the email after mount and shows the auto sign-in fallback notice (not role=status)", async () => {
  const harness = install(`?next=${encodeURIComponent(NEXT)}&created=1&email=${encodeURIComponent("made@example.invalid")}`);
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("login");
    assert.equal(input(renderer, "orbit-auth-email").props.value, "made@example.invalid");
    assert.deepEqual(notices(renderer), ["账号已创建，但自动登录未完成。请用刚设置的密码登录。"]);
    assert.deepEqual(byRole(renderer, "status"), []);
    assert.deepEqual(byRole(renderer, "alert"), []);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("submit clears previous error and notice, and sets the busy state while pending", async () => {
  let release!: () => void;
  const harness = install(`?next=${encodeURIComponent(NEXT)}`, { credentials: "failure" });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount("login");
    await fill(renderer, "owner@example.invalid", "wrong");
    await submit(renderer);
    assert.deepEqual(byRole(renderer, "alert"), ["邮箱或密码不正确。"]);

    const baseFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      if (String(input).endsWith("/providers")) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return baseFetch(input, init);
    }) as typeof fetch;
    let pending!: Promise<void>;
    await act(async () => {
      pending = renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} });
      await settle();
    });
    assert.deepEqual(byRole(renderer, "alert"), []);
    assert.equal(submitButton(renderer).props.disabled, true);
    assert.equal(submitButton(renderer).props["aria-busy"], true);
    assert.equal(submitLabel(renderer), getOrbitAccountAuthViewModel("login").busyLabel);
    await act(async () => {
      release();
      await pending;
      await settle();
    });
    assert.equal(submitButton(renderer).props.disabled, false);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});
