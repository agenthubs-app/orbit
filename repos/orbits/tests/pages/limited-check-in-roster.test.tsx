import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { LimitedCheckInRoster } from "../../app/(app)/app/events/[id]/operations/check-in/limited-check-in-roster";

// 特征化渲染测试（运营台 任务 1）：锁定签到名单的 加载 / markArrived 请求体 /
// 401 跳登录 / 409 文案 / 重试 行为，使逻辑搬进 use-check-in-roster 时零变化可证。

const EVENT_ID = "event:check-in";
const ENDPOINT = `/api/events/${encodeURIComponent(EVENT_ID)}/operations/admin/check-ins`;
const LOGIN_HREF = `/app/account/login?next=${encodeURIComponent(
  `/app/events/${encodeURIComponent(EVENT_ID)}/operations/check-in`,
)}`;

function roster(checkedIn = false) {
  return {
    eventId: EVENT_ID,
    participants: [
      { checkedIn, checkedInAt: checkedIn ? "2026-10-01T09:05:00.000Z" : null, displayName: "Alice", participantId: "p:a" },
      { checkedIn: false, checkedInAt: null, displayName: "Bob", participantId: "p:b" },
    ],
  };
}

interface Observed {
  body: string | null;
  method: string;
  url: string;
}

interface Harness {
  assigned: string[];
  observed: Observed[];
  restore: () => void;
}

function install(respond: (call: Observed) => Response | Promise<Response>): Harness {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const observed: Observed[] = [];
  const assigned: string[] = [];
  globalThis.fetch = (async (url, init) => {
    const call = {
      body: typeof init?.body === "string" ? init.body : null,
      method: init?.method ?? "GET",
      url: String(url),
    };
    observed.push(call);
    return respond(call);
  }) as typeof fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { assign(href: string) { assigned.push(href); } } },
  });
  return {
    assigned,
    observed,
    restore() {
      globalThis.fetch = originalFetch;
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    },
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function text(renderer: ReactTestRenderer): string {
  const walk = (node: unknown): string => {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(walk).join("");
    const tree = node as { children?: unknown[]; type?: string };
    if (tree.type === "style") return "";
    return (tree.children ?? []).map(walk).join("");
  };
  return walk(renderer.toJSON());
}

async function mount(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<LimitedCheckInRoster eventId={EVENT_ID} />);
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

function arriveButtons(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    (node) => node.type === "button" && typeof node.props["aria-label"] === "string" && /标记为已签到|已签到$/u.test(node.props["aria-label"]),
  );
}

test("roster loads the limited check-in list and renders counts and per-row actions", async () => {
  const harness = install(() => Response.json({ data: roster(true), success: true }));
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    assert.deepEqual(harness.observed.map((call) => [call.method, call.url]), [["GET", ENDPOINT]]);
    const body = text(renderer);
    assert.match(body, /已签到 1 \/ 2/u);
    assert.match(body, /Alice/u);
    assert.match(body, /Bob/u);
    // 表格 + 移动端卡片各渲染一次动作按钮：2 行 × 2 布局
    const buttons = arriveButtons(renderer);
    assert.equal(buttons.length, 4);
    assert.equal(buttons[0].props.disabled, true, "checked-in row is disabled");
    assert.equal(buttons[0].children.join(""), "已签到");
    assert.equal(buttons[1].props.disabled, false);
    assert.equal(buttons[1].children.join(""), "标记已到场");
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("mark arrived POSTs the participant id, shows the notice and reloads the roster", async () => {
  let posted: Observed | null = null;
  const harness = install((call) => {
    if (call.method === "POST") {
      posted = call;
      return Response.json({ data: { checkedInAt: "2026-10-01T09:06:00.000Z", participantId: "p:b" }, success: true });
    }
    return Response.json({ data: roster(), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    await act(async () => {
      arriveButtons(renderer!)[1].props.onClick();
      await flush();
    });
    assert.ok(posted);
    const observedPost = posted as Observed;
    assert.equal(observedPost.url, ENDPOINT);
    assert.deepEqual(JSON.parse(observedPost.body ?? "{}"), { participantId: "p:b" });
    assert.deepEqual(harness.observed.map((call) => call.method), ["GET", "POST", "GET"]);
    assert.match(text(renderer), /Bob 已标记为到场。/u);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("a 401 on load clears the roster, explains, and redirects to the login page with next=", async () => {
  const harness = install(() =>
    Response.json({ error: { message: "unauthenticated" }, success: false }, { status: 401 }),
  );
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    await act(async () => {
      await flush();
    });
    assert.match(text(renderer), /登录状态已失效，正在返回登录页。/u);
    assert.deepEqual(harness.assigned, [LOGIN_HREF]);
    assert.equal(renderer.root.findAllByType("table").length, 0);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("a 409 on mark arrived keeps the roster and shows the check-in window copy", async () => {
  const harness = install((call) => {
    if (call.method === "POST") {
      return Response.json({ error: { message: "closed" }, success: false }, { status: 409 });
    }
    return Response.json({ data: roster(), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    await act(async () => {
      arriveButtons(renderer!)[0].props.onClick();
      await flush();
    });
    const alert = renderer.root.find((node) => node.props.role === "alert");
    assert.match(JSON.stringify(alert.children.map((child) => (typeof child === "string" ? child : child.children.join("")))), /该活动当前不允许签到，请确认签到时间窗口。/u);
    assert.equal(renderer.root.findAllByType("table").length, 1, "roster stays visible");
    assert.equal(arriveButtons(renderer)[0].props.disabled, false, "pending flag is released");
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("retry after a 503 read failure re-fetches the roster", async () => {
  let calls = 0;
  const harness = install(() => {
    calls += 1;
    return calls === 1
      ? Response.json({ error: { message: "storage down" }, success: false }, { status: 503 })
      : Response.json({ data: roster(), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount();
    assert.match(text(renderer), /活动权限或签到存储暂时不可用，请稍后重试。/u);
    const retry = renderer.root.find((node) => node.type === "button" && node.children.join("").trim() === "重试");
    await act(async () => {
      retry.props.onClick();
      await flush();
    });
    assert.equal(calls, 2);
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);
    assert.match(text(renderer), /已签到 0 \/ 2/u);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});
