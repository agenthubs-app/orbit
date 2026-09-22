import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { AuthModal } from "../../app/(app)/app/account/auth-0918/auth-modal";

// 特征化渲染测试（认证弹窗 任务 1）：锁定 设置新密码 的 hash token 读取（43 位 [A-Za-z0-9_-]）、
// 不合法 token 的 role=alert 提示、两次密码不一致提示、/api/auth/password-reset/confirm 的
// POST 体 {token,password}、成功后 history.replaceState 清 hash + done 态、双提交保护，
// 使逻辑搬进 use-password-reset 时零变化可证。
// 任务 3（旧 reset-password-form.tsx 已删）：改指 `AuthModal view="reset"`，意图不变；逐条改动：输入 id
// `reset-password|confirmation` → `au-new-password|confirm-password`；按钮文案「更新密码 / 更新中…」→ 设计 520
// 「设置新密码 / 保存中…」；不合法 token 的 `<p role=alert>`「重置链接不完整…」→ 设计 426–433「链接已失效」分支
// （h2 + 主按钮形链接「重新申请重置链接」，无 role=alert）；done 的 `<p role=status>` → 设计 445–447 标题「密码已更新」
// + 副标 + 会话失效补句（无 role=status）+「用新密码登录」；链接集合：合法态 [login]（「重新申请链接」只在失效态）、
// 失效态 [forgot, login]、done [login ×2]；window 桩补 `document`（弹窗壳 `useOrbitModalA11y` 需要）。

const VALID_TOKEN = "A".repeat(21) + "b".repeat(21) + "_";

interface Observed {
  body: string | null;
  headers: Record<string, string>;
  method: string;
  url: string;
}

interface Harness {
  observed: Observed[];
  replaced: { data: unknown; url: string }[];
  restore: () => void;
}

function install(hash: string, respond: (call: Observed) => Response | Promise<Response>): Harness {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const observed: Observed[] = [];
  const replaced: { data: unknown; url: string }[] = [];
  globalThis.fetch = (async (input, init) => {
    const call: Observed = {
      body: typeof init?.body === "string" ? init.body : null,
      headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) },
      method: (init?.method ?? "GET").toUpperCase(),
      url: String(input),
    };
    observed.push(call);
    return respond(call);
  }) as typeof fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      history: {
        replaceState(data: unknown, _unused: string, url: string) {
          replaced.push({ data, url });
        },
      },
      location: { hash, pathname: "/app/account/reset-password" },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement: null, addEventListener() {}, removeEventListener() {} },
  });
  return {
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

async function flush(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

async function mount(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<AuthModal view="reset" />);
    await flush();
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

async function fill(renderer: ReactTestRenderer, password: string, confirmation: string): Promise<void> {
  await act(async () => {
    input(renderer, "au-new-password").props.onChange({ target: { value: password } });
    input(renderer, "au-confirm-password").props.onChange({ target: { value: confirmation } });
  });
}

function submitForm(renderer: ReactTestRenderer): Promise<void> {
  return renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }) as Promise<void>;
}

async function submit(renderer: ReactTestRenderer): Promise<void> {
  await act(async () => {
    await submitForm(renderer);
    await flush();
  });
}

function byRole(renderer: ReactTestRenderer, role: string): string[] {
  return renderer.root
    .findAll((node) => node.props.role === role && typeof node.type === "string")
    .map((node) => node.children.join(""));
}

function hasForm(renderer: ReactTestRenderer): boolean {
  return renderer.root.findAllByType("form").length === 1;
}

function submitButton(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => node.type === "button" && node.props.type === "submit")[0];
}

function heading(renderer: ReactTestRenderer): string {
  return renderer.root.findByType("h2").children.join("");
}

test("valid hash token: form renders, button enabled once ready, links to login", async () => {
  const harness = install(`#token=${VALID_TOKEN}`, () => Response.json({ success: true }));
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    assert.ok(hasForm(renderer));
    assert.deepEqual(byRole(renderer, "alert"), []);
    assert.deepEqual(byRole(renderer, "status"), []);
    assert.equal(submitButton(renderer).props.disabled, false);
    assert.equal(submitButton(renderer).children.join(""), "设置新密码");
    assert.equal(heading(renderer), "设置新密码");
    const hrefs = renderer.root.findAllByType("a").map((node) => node.props.href);
    assert.deepEqual(hrefs, ["/app/account/login"]);
    assert.equal(harness.observed.length, 0);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("invalid or missing hash token: the 链接已失效 branch replaces the form and offers a fresh request", async () => {
  for (const hash of ["", "#token=short", `#token=${VALID_TOKEN}!`, "#other=1"]) {
    const harness = install(hash, () => Response.json({ success: true }));
    let renderer: ReactTestRenderer | undefined;
    try {
      renderer = await mount();
      assert.equal(hasForm(renderer), false, `hash ${JSON.stringify(hash)} should not render the form`);
      assert.equal(heading(renderer), "链接已失效");
      assert.deepEqual(byRole(renderer, "alert"), []);
      const hrefs = renderer.root.findAllByType("a").map((node) => node.props.href);
      assert.deepEqual(hrefs, ["/app/account/forgot-password", "/app/account/login"]);
    } finally {
      await unmount(renderer);
      harness.restore();
    }
  }
});

test("token is read from the hash as URLSearchParams (other hash keys are ignored)", async () => {
  const harness = install(`#foo=bar&token=${VALID_TOKEN}`, (call) => {
    assert.deepEqual(JSON.parse(String(call.body)), { token: VALID_TOKEN, password: "new-password-1" });
    return Response.json({ success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    assert.ok(hasForm(renderer));
    await fill(renderer, "new-password-1", "new-password-1");
    await submit(renderer);
    assert.equal(harness.observed.length, 1);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("mismatched passwords: local error, no request", async () => {
  const harness = install(`#token=${VALID_TOKEN}`, () => Response.json({ success: true }));
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    await fill(renderer, "new-password-1", "new-password-2");
    await submit(renderer);
    assert.deepEqual(byRole(renderer, "alert"), ["两次输入的密码不一致。"]);
    assert.equal(harness.observed.length, 0);
    assert.equal(submitButton(renderer).props.disabled, false);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("confirm: POST /api/auth/password-reset/confirm {token,password}; success → replaceState clears the hash and shows done", async () => {
  const harness = install(`#token=${VALID_TOKEN}`, () => Response.json({ success: true }));
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    await fill(renderer, "new-password-1", "new-password-1");
    await submit(renderer);

    assert.deepEqual(
      harness.observed.map((call) => [call.method, call.url, call.headers["content-type"], call.body]),
      [["POST", "/api/auth/password-reset/confirm", "application/json", JSON.stringify({ token: VALID_TOKEN, password: "new-password-1" })]],
    );
    assert.deepEqual(harness.replaced, [{ data: null, url: "/app/account/reset-password" }]);
    assert.equal(hasForm(renderer), false);
    assert.equal(heading(renderer), "密码已更新");
    assert.deepEqual(renderer.root.findAllByProps({ className: "au-sub" }).map((node) => node.children.join("")), [
      "你的密码已重置，现在可以用新密码登录。",
      "其他设备上的旧会话已失效，需要重新登录。",
    ]);
    assert.deepEqual(byRole(renderer, "alert"), []);
    // 完成后只剩「用新密码登录」+「← 返回登录」（都指向登录），不再提供「重新申请链接」。
    assert.deepEqual(renderer.root.findAllByType("a").map((node) => node.props.href), ["/app/account/login", "/app/account/login"]);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("confirm failure: server message wins, fallback copy otherwise; form stays and hash is untouched", async () => {
  let attempt = 0;
  const harness = install(`#token=${VALID_TOKEN}`, () => {
    attempt += 1;
    if (attempt === 1) return Response.json({ success: false, error: { message: "Token expired" } }, { status: 410 });
    return Response.json({ success: false }, { status: 500 });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    await fill(renderer, "new-password-1", "new-password-1");
    await submit(renderer);
    assert.deepEqual(byRole(renderer, "alert"), ["Token expired"]);
    await submit(renderer);
    assert.deepEqual(byRole(renderer, "alert"), ["重置失败，请稍后重试。"]);
    assert.ok(hasForm(renderer));
    assert.deepEqual(harness.replaced, []);
    assert.equal(harness.observed.length, 2);
    assert.equal(submitButton(renderer).props.disabled, false);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("confirm network exception: retry copy that also hints at signing in with the new password", async () => {
  const harness = install(`#token=${VALID_TOKEN}`, () => {
    throw new TypeError("offline");
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    await fill(renderer, "new-password-1", "new-password-1");
    await submit(renderer);
    assert.deepEqual(byRole(renderer, "alert"), ["网络异常，请重试；如果链接已使用，请尝试用新密码登录。"]);
    assert.ok(hasForm(renderer));
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("double-submit guard: a second submit while the first is in flight sends no second request; busy state shown", async () => {
  let release!: () => void;
  const harness = install(`#token=${VALID_TOKEN}`, async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return Response.json({ success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    await fill(renderer, "new-password-1", "new-password-1");
    let first!: Promise<void>;
    await act(async () => {
      first = submitForm(renderer!);
      await flush();
    });
    assert.equal(submitButton(renderer).props.disabled, true);
    assert.equal(submitButton(renderer).props["aria-busy"], true);
    assert.equal(submitButton(renderer).children.join(""), "保存中…");
    await act(async () => {
      await submitForm(renderer!);
      await flush();
    });
    assert.equal(harness.observed.length, 1);
    await act(async () => {
      release();
      await first;
      await flush();
    });
    assert.equal(heading(renderer), "密码已更新");
    // done 后再次提交也被忽略（表单已卸载，但 submit 本身以 done 守卫）。
    assert.equal(harness.observed.length, 1);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});
