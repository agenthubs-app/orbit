import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OpsConsole } from "../../app/(app)/app/events/ops-0918/ops-console";
import type { OpsConsoleTab } from "../../app/(app)/app/events/ops-0918/ops-model";

// 特征化渲染测试（运营台 任务 1）：锁定 admin workspace 的 加载 / 生成 / 重试 / 发布 /
// 配置 PUT 体 / 轮询 / 401·409 行为，使逻辑搬进 use-event-operations 时零变化可证。
// 运营台 任务 3：旧 admin workspace 已被 ops-0918 概览 / 匹配屏替换，本文件改指 `OpsConsole`
// （`tab="ops"` = 概览：大数 / 配置表单 / 参会者到场 / 签到链接；`tab="match"` = 匹配与分组：生成列表 + 动作）。
// 按钮名变化：「生成匹配」（尚无生成）/「重新生成」= 旧「生成匹配」；「原子发布」「重试失败分片」「开始生成」「标记到场」「保存配置」不变。

const EVENT_ID = "event:ops-admin";
const BASE = `/api/events/${encodeURIComponent(EVENT_ID)}/operations/admin`;
const EVENT = {
  endsAt: "2026-10-01T12:00:00.000Z",
  id: EVENT_ID,
  startsAt: "2026-10-01T09:00:00.000Z",
  title: "Ops Admin Fixture",
};

function configuration() {
  return {
    checkInOpensAt: "2026-10-01T08:00:00.000Z",
    eventEndsAt: EVENT.endsAt,
    eventId: EVENT_ID,
    eventStartsAt: EVENT.startsAt,
    maxAttemptsPerTask: 3,
    organizerActorId: "user:organizer",
    profileEditDeadlineAt: "2026-09-30T00:00:00.000Z",
    recommendationCount: 5,
    registrationCutoffAt: "2026-09-30T12:00:00.000Z",
    resultsAvailableAt: "2026-10-01T08:30:00.000Z",
    roundOneStartsAt: "2026-10-01T09:30:00.000Z",
    roundTwoStartsAt: "2026-10-01T10:30:00.000Z",
    shardSize: 8,
    tableSize: 4,
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
}

function generation(status: string, id = "gen:0000000000000001", errorCode: string | null = null) {
  return {
    generation: {
      aiRequestFingerprint: "fp",
      completedAt: null,
      createdAt: "2026-09-20T00:00:00.000Z",
      errorCode,
      errorMessage: errorCode ? "shard failed" : null,
      eventId: EVENT_ID,
      expectedTaskCount: 4,
      generationId: id,
      idempotencyKey: "idem",
      organizerActorId: "user:organizer",
      publishedAt: null,
      snapshot: { capturedAt: "2026-09-20T00:00:00.000Z", hash: "abcdef1234567890", participants: [] },
      status,
      updatedAt: "2026-09-20T00:00:00.000Z",
    },
    progress: {
      claimedTasks: 0,
      completedTasks: 2,
      failedTasks: 0,
      generationId: id,
      percent: 50,
      queuedTasks: 2,
      runningTasks: 0,
      status,
    },
  };
}

function participant(participantId: string, displayName: string) {
  return {
    actorId: `user:${participantId}`,
    company: "Orbit",
    displayName,
    energyStyle: null,
    evidenceIds: [],
    experienceHighlight: null,
    industry: "AI",
    languages: [],
    lateRegistration: false,
    needs: [],
    offers: [],
    participantId,
    profileCompleteness: "complete",
    role: "Founder",
  };
}

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    checkIns: [],
    configuration: configuration(),
    contactRequests: [],
    eventId: EVENT_ID,
    generations: [],
    metrics: { acceptedContactRequests: 1, checkedIn: 0, contactRequests: 2, participantCount: 2, publishedGenerationId: null },
    participants: [participant("p:a", "Alice"), participant("p:b", "Bob")],
    publishedResult: null,
    ...overrides,
  };
}

interface Observed {
  body: string | null;
  method: string;
  url: string;
}

interface Harness {
  intervals: { delay: number; fn: () => void }[];
  observed: Observed[];
  restore: () => void;
}

function install(respond: (call: Observed) => Response | Promise<Response>): Harness {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const observed: Observed[] = [];
  const intervals: { delay: number; fn: () => void }[] = [];
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
    value: {
      clearInterval() {},
      location: { origin: "https://orbit.test" },
      setInterval(fn: () => void, delay: number) {
        intervals.push({ delay, fn });
        return intervals.length;
      },
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: undefined },
  });
  return {
    intervals,
    observed,
    restore() {
      globalThis.fetch = originalFetch;
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
      if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
      else Reflect.deleteProperty(globalThis, "navigator");
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

function buttonNamed(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find(
    (node) => node.type === "button" && node.children.join("") === label,
  );
}

async function unmount(renderer: ReactTestRenderer | undefined): Promise<void> {
  if (!renderer) return;
  // 在恢复 window 之前卸载：setInterval 清理仍需 window 桩。
  await act(async () => {
    renderer.unmount();
  });
}

async function mount(harness: Harness, tab: OpsConsoleTab = "ops"): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<OpsConsole event={EVENT} tab={tab} />);
    await flush();
  });
  void harness;
  return renderer;
}

// 运营台 任务 4：概览不再列出参会者目录（Alice / Bob / 「N 人未到场」）——参会者行 → app-ops-people.test.tsx「people table」，
// 未到场计数 → app-ops-checkin.test.tsx（data-ops-stat="pending"）。
test("overview loads the organizer snapshot and renders metrics and the pending-publish status", async () => {
  const harness = install((call) => {
    assert.equal(call.url, BASE);
    return Response.json({ data: workspace({ generations: [generation("completed")] }), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount(harness);
    assert.deepEqual(harness.observed.map((call) => [call.method, call.url]), [["GET", BASE]]);
    const body = text(renderer);
    assert.match(body, /已报名2/u);
    assert.doesNotMatch(body, /Alice|Bob/u, "participant rows live on the people screen since task 4");
    assert.match(body, /待发布/u);
    assert.match(body, /前往发布 →/u);
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);
    // 30 秒时钟 + 无进行中生成 → 不启动 1.5s 轮询
    assert.deepEqual(harness.intervals.map((entry) => entry.delay), [30_000]);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("match screen lists generations with the atomic publish action and the pending-publish empty state", async () => {
  const harness = install(() => Response.json({ data: workspace({ generations: [generation("completed")] }), success: true }));
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount(harness, "match");
    const body = text(renderer);
    assert.match(body, /生成 #abcdef12|生成 #00000000/u);
    assert.match(body, /原子发布/u);
    assert.match(body, /已生成 0 人，待发布/u);
    assert.deepEqual(harness.intervals.map((entry) => entry.delay), [30_000]);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("重新生成 asks for confirmation, then POSTs to /generations and reloads", async () => {
  const harness = install((call) => {
    if (call.method === "POST") {
      assert.equal(call.url, `${BASE}/generations`);
      assert.equal(call.body, "{}");
      return Response.json({ data: generation("queued", "gen:new").generation, success: true });
    }
    return Response.json({ data: workspace(), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount(harness);
    assert.equal(renderer.root.findAll((node) => node.props["data-generation-start-confirm"] !== undefined).length, 0);
    await act(async () => {
      buttonNamed(renderer!, "生成匹配").props.onClick();
      await flush();
    });
    assert.equal(renderer.root.findAll((node) => node.props["data-generation-start-confirm"] !== undefined).length, 1);
    assert.equal(harness.observed.filter((call) => call.method === "POST").length, 0);
    await act(async () => {
      buttonNamed(renderer!, "开始生成").props.onClick();
      await flush();
    });
    assert.deepEqual(harness.observed.map((call) => [call.method, call.url]), [
      ["GET", BASE],
      ["POST", `${BASE}/generations`],
      ["GET", BASE],
    ]);
    assert.match(text(renderer), /已开始生成匹配（报名快照 abcdef123456…）/u);
    assert.equal(renderer.root.findAll((node) => node.props["data-generation-start-confirm"] !== undefined).length, 0);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("generation actions post retry for failed and publish for completed, and a failed action reloads before showing the error", async () => {
  const calls: string[] = [];
  const harness = install((call) => {
    if (call.method === "POST") {
      calls.push(call.url);
      if (call.url.endsWith("/publish")) {
        return Response.json({ error: { message: "已有更新的发布" }, success: false }, { status: 409 });
      }
      return Response.json({ data: { ok: true }, success: true });
    }
    return Response.json({
      data: workspace({
        generations: [
          generation("failed", "gen:failed", "CONFIGURATION_INVALID"),
          generation("completed", "gen:done"),
        ],
      }),
      success: true,
    });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount(harness, "match");
    await act(async () => {
      buttonNamed(renderer!, "重试失败分片").props.onClick();
      await flush();
    });
    assert.deepEqual(calls, [`${BASE}/generations/${encodeURIComponent("gen:failed")}/retry`]);
    assert.match(text(renderer), /仅重置了失败分片；已完成分片的输出全部保留/u);

    const gets = harness.observed.filter((call) => call.method === "GET").length;
    await act(async () => {
      buttonNamed(renderer!, "原子发布").props.onClick();
      await flush();
    });
    assert.equal(calls[1], `${BASE}/generations/${encodeURIComponent("gen:done")}/publish`);
    assert.equal(harness.observed.filter((call) => call.method === "GET").length, gets + 1, "failed action reloads persisted state");
    const alert = renderer.root.find((node) => node.props.role === "alert");
    assert.equal(alert.children.join(""), "已有更新的发布");
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("save configuration PUTs canonical schedule from the event props and explicit fields from the form", async () => {
  let put: Observed | null = null;
  const harness = install((call) => {
    if (call.method === "PUT") {
      put = call;
      return Response.json({ data: configuration(), success: true });
    }
    return Response.json({ data: workspace(), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount(harness);
    const inputs = renderer.root.findAllByType("input");
    const numberInput = inputs.find((node) => node.props.type === "number");
    assert.ok(numberInput);
    await act(async () => {
      numberInput.props.onInput({ currentTarget: { value: "7" } });
      await flush();
    });
    const lockedInputs = inputs.filter((node) => node.props.readOnly === true);
    assert.equal(lockedInputs.length, 2, "eventStartsAt/eventEndsAt are read-only canonical fields");
    await act(async () => {
      buttonNamed(renderer!, "保存配置").props.onClick();
      await flush();
    });
    assert.ok(put);
    const observedPut = put as Observed;
    assert.equal(observedPut.url, BASE);
    const payload = JSON.parse(observedPut.body ?? "{}") as Record<string, string | number>;
    assert.equal(payload.eventStartsAt, EVENT.startsAt);
    assert.equal(payload.eventEndsAt, EVENT.endsAt);
    assert.equal(payload.recommendationCount, 7);
    assert.equal(payload.tableSize, 4);
    assert.equal(payload.shardSize, 8);
    assert.equal(payload.maxAttemptsPerTask, 3);
    assert.equal(payload.registrationCutoffAt, "2026-09-30T12:00:00.000Z");
    assert.equal(payload.checkInOpensAt, "2026-10-01T08:00:00.000Z");
    assert.match(text(renderer), /配置已按主办方的显式输入保存/u);
    assert.deepEqual(harness.observed.map((call) => call.method), ["GET", "PUT", "GET"]);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("an active generation starts the 1.5s poll which reloads without the loading state", async () => {
  const harness = install(() => Response.json({ data: workspace({ generations: [generation("running")] }), success: true }));
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount(harness, "match");
    assert.deepEqual(harness.intervals.map((entry) => entry.delay).sort(), [1_500, 30_000]);
    assert.equal(renderer.root.findAll((node) => node.props["data-generation-progress"] !== undefined).length, 1);
    const poll = harness.intervals.find((entry) => entry.delay === 1_500);
    assert.ok(poll);
    await act(async () => {
      poll.fn();
      await flush();
    });
    assert.equal(harness.observed.length, 2);
    assert.doesNotMatch(text(renderer), /正在读取运营状态/u);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("a failed newest generation with a retryable engine error is auto-retried once per session round", async () => {
  const posts: string[] = [];
  const harness = install((call) => {
    if (call.method === "POST") {
      posts.push(call.url);
      return Response.json({ data: { ok: true }, success: true });
    }
    return Response.json({
      data: workspace({ generations: [generation("failed", "gen:shard", "SHARD_FAILED")] }),
      success: true,
    });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount(harness);
    await act(async () => {
      await flush();
    });
    assert.deepEqual(posts, [`${BASE}/generations/${encodeURIComponent("gen:shard")}/retry`]);
    assert.match(text(renderer), /已自动重试（第 1\/2 次）/u);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("load failures (401/409 envelopes) surface the server message as an alert without a workspace", async () => {
  const harness = install(() =>
    Response.json({ error: { message: "Event operations access required" }, success: false }, { status: 401 }),
  );
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount(harness);
    const alert = renderer.root.find((node) => node.props.role === "alert");
    assert.equal(alert.children.join(""), "Event operations access required");
    assert.doesNotMatch(text(renderer), /REAL REGISTRATION DIRECTORY/u);
    assert.match(text(renderer), /TIME GATES & SHARD POLICY/u, "configuration form stays available");
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

// 运营台 任务 4：「标记到场」已迁出概览（概览不再渲染 REAL REGISTRATION DIRECTORY）；
// POST /check-ins 请求体 / 提示 / 重读 由 tests/pages/app-ops-checkin.test.tsx「mark arrived POSTs the participant id…」承接。
