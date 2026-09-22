import assert from "node:assert/strict";
import test from "node:test";

import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { EventOperationsAdminWorkspace } from "../../app/(app)/app/events/[id]/operations/event-operations-admin-workspace";

// 特征化渲染测试（运营台 任务 1）：锁定 admin workspace 的 加载 / 生成 / 重试 / 发布 /
// 配置 PUT 体 / 轮询 / 401·409 行为，使逻辑搬进 use-event-operations 时零变化可证。

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

async function mount(harness: Harness): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<EventOperationsAdminWorkspace event={EVENT} />);
    await flush();
  });
  void harness;
  return renderer;
}

test("admin workspace loads the organizer snapshot and renders metrics, participants and generations", async () => {
  const harness = install((call) => {
    assert.equal(call.url, BASE);
    return Response.json({ data: workspace({ generations: [generation("completed")] }), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount(harness);
    assert.deepEqual(harness.observed.map((call) => [call.method, call.url]), [["GET", BASE]]);
    const body = text(renderer);
    assert.match(body, /已报名/u);
    assert.match(body, /Alice/u);
    assert.match(body, /Bob/u);
    assert.match(body, /2 人未到场/u);
    assert.match(body, /生成 #abcdef12|生成 #00000000/u);
    assert.match(body, /待发布/u);
    assert.match(body, /原子发布/u);
    assert.equal(renderer.root.findAll((node) => node.props.role === "alert").length, 0);
    // 30 秒时钟 + 无进行中生成 → 不启动 1.5s 轮询
    assert.deepEqual(harness.intervals.map((entry) => entry.delay), [30_000]);
  } finally {
    await unmount(renderer);
    harness.restore();
  }
});

test("start generation asks for confirmation, then POSTs to /generations and reloads", async () => {
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
    renderer = await mount(harness);
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
    renderer = await mount(harness);
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

test("mark arrived POSTs /check-ins with the participant id when the check-in window is open", async () => {
  const now = Date.parse("2026-10-01T09:00:00.000Z");
  const originalNow = Date.now;
  Date.now = () => now;
  let post: Observed | null = null;
  const harness = install((call) => {
    if (call.method === "POST") {
      post = call;
      return Response.json({
        data: { actorId: "user:p:a", checkedInAt: "2026-10-01T09:01:00.000Z", eventId: EVENT_ID, evidenceId: "ev", participantId: "p:a" },
        success: true,
      });
    }
    return Response.json({ data: workspace(), success: true });
  });
  let renderer: ReactTestRenderer | undefined;
  try {
    renderer = await mount(harness);
    const arrive = renderer.root.findAll((node) => node.type === "button" && node.children.join("") === "标记到场");
    assert.equal(arrive.length, 2);
    await act(async () => {
      arrive[0].props.onClick();
      await flush();
    });
    assert.ok(post);
    const observedPost = post as Observed;
    assert.equal(observedPost.url, `${BASE}/check-ins`);
    assert.deepEqual(JSON.parse(observedPost.body ?? "{}"), { participantId: "p:a" });
    assert.match(text(renderer), /已记录到场时间/u);
  } finally {
    Date.now = originalNow;
    await unmount(renderer);
    harness.restore();
  }
});
