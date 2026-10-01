/**
 * W0006 SC-02 / SC-03 / SC-04（组件）：引导页 /app/start 的客户端壳。
 *
 * - 步骤条（W0035 起只有 3 步）：完成 ✓ / 进行中 / 锁定（完成前一步后解锁）；点锁定的步骤只提示
 *   「先完成第 n 步」不切换、不写记录；切换步骤写 currentStep；
 * - 第 1 步：槽位、「已确认 x / 3」、待确认张数、扫名片入口；「先这样，继续」写 step1Skipped；
 *   接上本机进行中的名片批次（状态机在本页，宿主让位）；
 * - 第 2 步：W0002 编辑器，已有目标自动完成；第 3 步：当前目标、就地修改（草稿，取消不覆盖）、
 *   固定问题与 6 点结构、「开始分析」直接调用计划生成接口（W0008），成功后去对话页看回答卡片；
 * - 3 步完成：完成卡片；D2 老用户直接停在第 3 步；记录的 currentStep 能打开就停在那一步；
 *   存量 currentStep = 4 由服务端映射为 null，加载不写记录。
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import type { StartGuideSnapshot } from "../../features/guide/start-steps";
import type { CardBatch } from "../../app/(app)/app/contacts/card-batch-0918/use-card-batch";
import { StartGuide, type StartGuideProps } from "../../app/(app)/app/start/start-guide";
import { StepCards } from "../../app/(app)/app/start/start-step-cards";
import { START_PLAN_BOOTSTRAP_URL } from "../../app/(app)/app/start/start-step-plan";

const SNAPSHOT: StartGuideSnapshot = {
  completedAt: null,
  confirmedContacts: 0,
  contactSamples: [],
  currentStep: null,
  grandfathered: false,
  hasActivePlan: false,
  step1Skipped: false,
};

interface Harness {
  assigned: string[];
  bootstraps: Record<string, unknown>[];
  patches: Record<string, unknown>[];
  profilePuts: Record<string, unknown>[];
  refreshes: () => number;
  requests: string[];
}

function stubBrowser(
  t: TestContext,
  options: {
    activeBatch?: string;
    /** W0008：计划生成接口的响应（按调用次序）。 */
    bootstrap?: Array<() => Response>;
    failPatch?: boolean;
    relationshipGoal?: string;
  } = {},
): Harness {
  const store = new Map<string, string>();
  if (options.activeBatch) store.set("orbit.cardBatches.active.v1", JSON.stringify([options.activeBatch]));
  const assigned: string[] = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      clearInterval,
      clearTimeout,
      dispatchEvent() {
        return true;
      },
      getSelection: () => null,
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
      },
      location: {
        assign(href: string) {
          assigned.push(href);
        },
      },
      removeEventListener() {},
      scrollTo() {},
      setInterval,
      setTimeout,
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete (globalThis as { window?: unknown }).window;
  });

  const patches: Record<string, unknown>[] = [];
  const profilePuts: Record<string, unknown>[] = [];
  const requests: string[] = [];
  const bootstraps: Record<string, unknown>[] = [];
  let profile: Record<string, unknown> = {
    relationshipGoal: options.relationshipGoal ?? "",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  let mutationId: string | undefined;
  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/guide/state" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      patches.push(body);
      if (options.failPatch) return Response.json({ success: false }, { status: 500 });
      return Response.json({ success: true, data: body });
    }
    if (url === "/api/profile" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      profilePuts.push(body);
      const { expectedUpdatedAt: _expected, mutationId: id, ...fields } = body;
      profile = { ...profile, ...fields, updatedAt: "2026-10-01T00:00:01.000Z" };
      mutationId = String(id);
      return Response.json({ success: true, data: { mutationId, profile } });
    }
    if (url === "/api/profile") return Response.json({ success: true, data: { mutationId, profile } });
    if (url === START_PLAN_BOOTSTRAP_URL && init?.method === "POST") {
      bootstraps.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      const next = options.bootstrap?.[bootstraps.length - 1];
      return next ? next() : Response.json({ success: false }, { status: 500 });
    }
    return Response.json({ success: false }, { status: 404 });
  });
  return { assigned, bootstraps, patches, profilePuts, refreshes: () => refreshCount, requests };
}

let refreshCount = 0;
const router = {
  back: () => undefined,
  forward: () => undefined,
  prefetch: async () => undefined,
  push: () => undefined,
  refresh: () => {
    refreshCount += 1;
  },
  replace: () => undefined,
};

function props(
  overrides: Partial<Omit<StartGuideProps, "snapshot">> & { snapshot?: Partial<StartGuideSnapshot> } = {},
): StartGuideProps {
  return {
    cardScanAvailable: true,
    profileUpdatedAt: "2026-10-01T00:00:00.000Z",
    relationshipGoal: "",
    ...overrides,
    snapshot: { ...SNAPSHOT, ...overrides.snapshot },
  };
}

async function mount(input: StartGuideProps): Promise<ReactTestRenderer> {
  refreshCount = 0;
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(
      <AppRouterContext.Provider value={router}>
        <StartGuide {...input} />
      </AppRouterContext.Provider>,
      { createNodeMock: () => ({ focus() {}, setSelectionRange() {}, value: "" }) },
    );
  });
  await settle();
  return root;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const text = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : text(child))).join("");
const byData = (root: ReactTestRenderer, attribute: string, value?: string) =>
  root.root.findAll(
    (node) => typeof node.type === "string" && (value === undefined ? node.props[attribute] !== undefined : String(node.props[attribute]) === value),
  );
const one = (root: ReactTestRenderer, attribute: string, value?: string) => {
  const found = byData(root, attribute, value);
  assert.equal(found.length, 1, `${attribute}=${value ?? "*"} should match exactly one node, got ${found.length}`);
  return found[0]!;
};
const view = (root: ReactTestRenderer) => one(root, "data-start-guide").props["data-start-view"];
const stepStatuses = (root: ReactTestRenderer) =>
  byData(root, "data-start-step").map((node) => node.props["data-status"] as string);
const click = async (node: ReactTestInstance) => {
  await act(async () => {
    await node.props.onClick();
  });
  await settle();
};

/* ── 步骤条与顺序锁（SC-02） ───────────────────────────────────────────── */

/** 页面上不能再出现的第 4 步措辞与入口（W0035）。 */
function assertNoStepFour(root: ReactTestRenderer) {
  const all = text(root.root);
  for (const banned of ["第 4 步", "共 4 步", "4 步，", "做第 4 步", "先看活动", "随时可做", "已加入社群"]) {
    assert.ok(!all.includes(banned), `should not mention ${banned}`);
  }
  assert.equal(byData(root, "data-start-step", "4").length, 0);
  assert.equal(byData(root, "data-start-do-step4").length, 0);
  assert.equal(byData(root, "data-start-event").length, 0);
  assert.equal(byData(root, "data-events-community").length, 0);
}

test("a new user opens on step 1 of 3: current / locked statuses and the page chrome", async (t) => {
  stubBrowser(t);
  const root = await mount(props());
  assert.equal(view(root), "1");
  assert.deepEqual(stepStatuses(root), ["current", "locked", "locked"]);
  assert.equal(text(one(root, "data-start-nav-step")), "引导 · 第 1 步 / 共 3 步");
  assert.equal(one(root, "data-start-back").props.href, "/app/agent");
  const steps = byData(root, "data-start-step");
  assert.match(text(steps[1]!), /完成第 1 步后解锁/);
  assert.equal(steps[1]!.props["aria-disabled"], "true");
  assert.match(text(steps[0]!), /已确认 0 \/ 3 · 进行中/);
  assert.equal(root.root.find((node) => node.type === "ol").props["aria-label"], "引导 3 步");
  // 手机进度线：3 段，「第 1 步 / 共 3 步」，没有跳到活动的链接。
  const mini = one(root, "data-start-steps-mini");
  assert.equal(mini.findAll((node) => node.type === "i").length, 3);
  assert.equal(text(mini), "第 1 步 / 共 3 步");
  const all = text(root.root);
  assert.ok(all.includes("3 步，让 iOrbit 开始为你工作"));
  assert.ok(all.includes("做完这 3 步，iOrbit 和人脉页就会从示例换成你自己的数据。"));
  assert.ok(all.includes("可以随时离开，进度会保留"));
  assertNoStepFour(root);
  act(() => root.unmount());
});

test("clicking a locked step only says which step to finish first; an open step switches and records currentStep", async (t) => {
  const api = stubBrowser(t);
  // 有目标、名片没做完：第 2 步已完成（可重开），第 3 步锁着。
  const root = await mount(props({ relationshipGoal: "找渠道" }));
  await click(one(root, "data-start-step", "3"));
  assert.equal(view(root), "1", "no switch");
  assert.equal(text(one(root, "data-start-locked-note")), "先完成第 1 步");
  assert.deepEqual(api.patches, [], "a locked click writes nothing");

  await click(one(root, "data-start-step", "2"));
  assert.equal(view(root), "2");
  assert.equal(text(one(root, "data-start-locked-note")), "");
  assert.deepEqual(api.patches, [{ currentStep: 2 }]);

  await click(one(root, "data-start-step", "1"));
  assert.equal(view(root), "1");
  assert.deepEqual(api.patches, [{ currentStep: 2 }, { currentStep: 1 }]);
  assertNoStepFour(root);
  act(() => root.unmount());
});

test("the recorded currentStep is reopened when allowed; a recorded locked step falls back to the first unfinished one", async (t) => {
  stubBrowser(t);
  const onTwo = await mount(props({ relationshipGoal: "找渠道", snapshot: { currentStep: 2 } }));
  assert.equal(view(onTwo), "2");
  act(() => onTwo.unmount());
  const locked = await mount(props({ snapshot: { currentStep: 3 } }));
  assert.equal(view(locked), "1");
  act(() => locked.unmount());
});

test("W0035: a stored step 4 (mapped to null by the server) lands on the first unfinished step or the finish card, without a PATCH", async (t) => {
  const api = stubBrowser(t);
  // 未完成 + 存量 4：停在第一个未完成的步骤。
  const open = await mount(props({ snapshot: { currentStep: null } }));
  assert.equal(view(open), "1");
  assertNoStepFour(open);
  act(() => open.unmount());
  // 已完成 + 存量 4：完成卡片。
  const done = await mount(
    props({
      relationshipGoal: "找渠道",
      snapshot: { completedAt: "2026-09-30T00:00:00.000Z", confirmedContacts: 3, currentStep: null, hasActivePlan: true },
    }),
  );
  assert.equal(view(done), "finish");
  assertNoStepFour(done);
  act(() => done.unmount());
  assert.deepEqual(api.patches, []);
  assert.ok(!api.requests.some((request) => request.startsWith("PATCH")));
});

test("W0022: ?step=3 opens step 3 for a legacy user recorded on step 1, without writing the guide record", async (t) => {
  const api = stubBrowser(t);
  const root = await mount(props({ requestedStep: 3, snapshot: { confirmedContacts: 12, currentStep: 1, grandfathered: true } }));
  assert.equal(view(root), "3");
  assert.deepEqual(api.patches, [], "loading with ?step never PATCHes /api/guide/state");
  assert.ok(!api.requests.some((request) => request.startsWith("PATCH /api/guide/state")));
  act(() => root.unmount());
  // 同一人不带参数：仍停在记录的第 1 步（原逻辑）。
  const plain = await mount(props({ snapshot: { confirmedContacts: 12, currentStep: 1, grandfathered: true } }));
  assert.equal(view(plain), "1");
  act(() => plain.unmount());
});

test("W0022: a locked ?step=3 does not unlock anything and does not write the record", async (t) => {
  const api = stubBrowser(t);
  const locked = await mount(props({ requestedStep: 3 }));
  assert.equal(view(locked), "1");
  assert.deepEqual(stepStatuses(locked), ["current", "locked", "locked"]);
  act(() => locked.unmount());
  assert.deepEqual(api.patches, []);
});

test("a D2 legacy user starts on step 3 with steps 1–2 already done", async (t) => {
  stubBrowser(t);
  const root = await mount(props({ snapshot: { confirmedContacts: 12, grandfathered: true } }));
  assert.equal(view(root), "3");
  assert.deepEqual(stepStatuses(root), ["done", "done", "current"]);
  act(() => root.unmount());
});

test("all 3 steps done: the finish card only offers iOrbit", async (t) => {
  const api = stubBrowser(t);
  const done = { confirmedContacts: 3, hasActivePlan: true };
  const root = await mount(props({ relationshipGoal: "三个月内找到 5 家试用客户（3 个月内）", snapshot: done }));
  assert.equal(view(root), "finish");
  assert.match(text(one(root, "data-start-finish")), /✓ 3 步都完成了/);
  assert.equal(text(one(root, "data-start-nav-step")), "引导 · 3 步已完成");
  assert.equal(one(root, "data-start-go-iorbit").props.href, "/app/agent");
  assert.equal(one(root, "data-start-finish").findAll((node) => node.type === "button").length, 0);
  assertNoStepFour(root);
  assert.deepEqual(api.patches, []);
  act(() => root.unmount());
});

/* ── 第 1 步（SC-03） ───────────────────────────────────────────────────── */

test("step 1 shows confirmed x / 3 with named slots, opens the batch uploader, and skipping writes step1Skipped", async (t) => {
  const api = stubBrowser(t);
  const root = await mount(
    props({
      snapshot: {
        confirmedContacts: 1,
        contactSamples: [{ displayName: "王砚", organization: "北辰精工", role: "采购部长" }],
      },
    }),
  );
  const slots = byData(root, "data-slot").map((node) => node.props["data-slot"]);
  assert.deepEqual(slots, ["confirmed", "empty", "empty"]);
  assert.match(text(one(root, "data-slot", "confirmed")), /✓ 已确认王砚北辰精工 · 采购部长/);
  assert.equal(text(one(root, "data-start-card-count")), "已确认 1 / 3");
  assert.match(text(one(root, "data-start-skip")), /只有 1 位联系人也可以继续，但计划里「现有人脉能帮上什么」会比较单薄。/);

  assert.equal(byData(root, "data-card-uploader").length, 0);
  await click(one(root, "data-start-scan"));
  assert.equal(byData(root, "data-card-uploader").length, 1, "the shared batch uploader opens in place");

  await click(one(root, "data-start-skip-button"));
  assert.deepEqual(api.patches, [{ currentStep: 2, step1Skipped: true }], "one request: skip + move on");
  assert.equal(view(root), "2");
  assert.deepEqual(stepStatuses(root).slice(0, 2), ["done", "current"]);
  assert.match(text(one(root, "data-start-step", "1")), /已先跳过/);
  act(() => root.unmount());
});

test("a failed skip stays on step 1 with an error and does not unlock step 2", async (t) => {
  stubBrowser(t, { failPatch: true });
  const root = await mount(props());
  await click(one(root, "data-start-skip-button"));
  assert.equal(view(root), "1");
  assert.deepEqual(stepStatuses(root).slice(0, 2), ["current", "locked"]);
  assert.ok(text(root.root).includes("没有保存成功，请再试一次。"));
  act(() => root.unmount());
});

test("the guide page takes over this browser's in-progress card batch (the site-wide host yields here)", async (t) => {
  const api = stubBrowser(t, { activeBatch: "batch-guide-1" });
  const root = await mount(props());
  assert.ok(
    api.requests.some((request) => request.startsWith("GET ") && request.endsWith("/batch-guide-1")),
    "the page's own state machine loads the batch",
  );
  act(() => root.unmount());
});

test("step 1 slots list pending cards from the batch with their count", () => {
  const batch = {
    batchId: null,
    drafts: { c1: { fields: { displayName: "佐藤美咲" } }, c2: { fields: { displayName: "" } } },
    pending: [{ cardId: "c1" }, { cardId: "c2" }, { cardId: "c3" }],
    reviewing: true,
  } as unknown as CardBatch;
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <StepCards
        batch={batch}
        cardScanAvailable
        confirmedContacts={1}
        done={false}
        onBatchStarted={() => undefined}
        onNext={() => undefined}
        onReset={() => undefined}
        onScan={() => undefined}
        onSkip={() => undefined}
        samples={[{ displayName: "王砚", organization: null, role: null }]}
        scanOpen={false}
        skipError=""
        skipped={false}
        skipping={false}
      />,
    );
  });
  assert.deepEqual(
    byData(root, "data-slot").map((node) => node.props["data-slot"]),
    ["confirmed", "pending", "pending"],
  );
  assert.match(text(byData(root, "data-slot", "pending")[0]!), /待确认佐藤美咲/);
  assert.match(text(byData(root, "data-slot", "pending")[1]!), /姓名待确认/);
  assert.equal(text(one(root, "data-start-pending-count")), "待确认 3 张");
  act(() => root.unmount());
});

/* ── 第 2、3 步（SC-03） ────────────────────────────────────────────────── */

test("step 2 with a goal from onboarding is already done, carries the goal in, and moves on without rewriting it", async (t) => {
  const api = stubBrowser(t, { relationshipGoal: "三个月内认识 3 位日本市场的渠道伙伴（3 个月内）" });
  const root = await mount(
    props({
      relationshipGoal: "三个月内认识 3 位日本市场的渠道伙伴（3 个月内）",
      snapshot: { confirmedContacts: 3, currentStep: 2 },
    }),
  );
  assert.equal(view(root), "2");
  assert.equal(one(root, "data-start-step", "2").props["data-status"], "done");
  assert.equal(byData(root, "data-start-goal-carried").length, 1);
  assert.equal(root.root.findAll((node) => node.props.className === "ge-reminder").length, 1);
  assert.equal(
    root.root.findByProps({ "aria-label": "你的目标", className: "ge-input" }).props.value,
    "三个月内认识 3 位日本市场的渠道伙伴",
  );
  await click(one(root, "data-start-goal-save"));
  assert.equal(view(root), "3");
  assert.deepEqual(api.profilePuts, [], "unchanged goal is not rewritten");
  assert.deepEqual(api.patches, [{ currentStep: 3 }]);
  act(() => root.unmount());
});

test("step 2 saves a new goal through the profile API and advances to step 3", async (t) => {
  const api = stubBrowser(t);
  const root = await mount(props({ snapshot: { confirmedContacts: 3 } }));
  assert.equal(view(root), "2");
  const input = root.root.findByProps({ "aria-label": "你的目标", className: "ge-input" });
  await act(async () => {
    input.props.onChange({ target: { value: "年内找到 2 家稳定的日本供应商" } });
  });
  await click(one(root, "data-start-goal-save"));
  assert.deepEqual(api.profilePuts.map((body) => body.relationshipGoal), ["年内找到 2 家稳定的日本供应商（3 个月内）"]);
  assert.equal(view(root), "3");
  assert.deepEqual(api.patches, [{ currentStep: 3 }]);
  assert.ok(api.refreshes() >= 1, "server progress is re-read after the save");
  act(() => root.unmount());
});

test("step 3: edit the goal in place as a draft — cancel keeps the saved goal, save writes the profile goal", async (t) => {
  const goal = "三个月内拿到 10 家企业客户的试用（3 个月内）";
  const api = stubBrowser(t, { relationshipGoal: goal });
  const root = await mount(props({ relationshipGoal: goal, snapshot: { confirmedContacts: 3 } }));
  assert.equal(view(root), "3");
  assert.equal(text(one(root, "data-start-goal-text")), "三个月内拿到 10 家企业客户的试用");
  assert.equal(
    text(one(root, "data-start-question")),
    "问根据我的目标和人脉信息，我该如何实现目标？",
  );
  assert.equal(one(root, "data-start-outline").children.length, 6);
  assert.equal(one(root, "data-start-supplement").props.maxLength, 60);

  // 修改 → 草稿 → 取消：不写、不覆盖。
  await click(one(root, "data-start-goal-edit"));
  const editor = () => root.root.findByProps({ "aria-label": "你的目标", className: "ge-input" });
  assert.equal(editor().props.value, "三个月内拿到 10 家企业客户的试用");
  await act(async () => {
    editor().props.onChange({ target: { value: "被取消的草稿" } });
  });
  assert.equal(one(root, "data-start-analyze").props.disabled, true, "no asking while the draft is open");
  await click(one(root, "data-start-goal-cancel"));
  assert.equal(text(one(root, "data-start-goal-text")), "三个月内拿到 10 家企业客户的试用");
  assert.deepEqual(api.profilePuts, []);

  // 再改 → 保存：写资料里的目标。
  await click(one(root, "data-start-goal-edit"));
  assert.equal(editor().props.value, "三个月内拿到 10 家企业客户的试用", "a new draft starts from the saved goal");
  await act(async () => {
    editor().props.onChange({ target: { value: "三个月内拿到 20 家企业客户的试用" } });
  });
  await click(one(root, "data-start-goal-edit-save"));
  assert.deepEqual(api.profilePuts.map((body) => body.relationshipGoal), ["三个月内拿到 20 家企业客户的试用（3 个月内）"]);
  assert.equal(text(one(root, "data-start-goal-text")), "三个月内拿到 20 家企业客户的试用");
  assert.equal(view(root), "3", "editing the goal keeps you on step 3");
  act(() => root.unmount());
});

const planCreated = (planId: string) => () =>
  Response.json({ data: { planId, replayed: false, version: 1 }, success: true }, { status: 201 });

test("step 3 'Start analysis' sends the fixed question straight to plan bootstrap and opens the saved plan with the reveal", async (t) => {
  const api = stubBrowser(t, { bootstrap: [planCreated("plan:v1")] });
  const root = await mount(props({ relationshipGoal: "找渠道（3 个月内）", snapshot: { confirmedContacts: 3 } }));
  await act(async () => {
    one(root, "data-start-supplement").props.onChange({ target: { value: "  我更想先从制造业客户开始 " } });
  });
  await click(one(root, "data-start-analyze"));

  assert.equal(api.bootstraps.length, 1);
  const [body] = api.bootstraps;
  assert.equal(body!.supplement, "我更想先从制造业客户开始");
  assert.equal(body!.locale, "zh");
  assert.match(String(body!.idempotencyKey), /^plan-[A-Za-z0-9-]+$/);
  assert.equal("goal" in body!, false, "the goal is read on the server, never sent by the client");
  assert.deepEqual(api.assigned, ["/app/agent?plan=plan%3Av1&reveal=1"]);
  assert.ok(!api.requests.some((request) => request.includes("/api/ai/conversations")), "the fixed question skips the chat API");
  assert.deepEqual(api.patches, [], "no guide write either");
  act(() => root.unmount());
});

test("step 3: a failed generation saves nothing, offers a retry with the same key, and a changed question gets a new key", async (t) => {
  const failed = () =>
    Response.json({ error: { code: "SERVICE_UNAVAILABLE", context: { reason: "PLAN_GENERATION_FAILED" } }, success: false }, { status: 503 });
  const api = stubBrowser(t, { bootstrap: [failed, failed, planCreated("plan:v1")] });
  const root = await mount(props({ relationshipGoal: "找渠道", snapshot: { confirmedContacts: 3 } }));

  await click(one(root, "data-start-analyze"));
  assert.match(text(one(root, "data-start-plan-error")), /计划没有生成成功，没有保存任何内容/);
  assert.equal(text(one(root, "data-start-analyze")), "重试");
  assert.deepEqual(api.assigned, []);

  await click(one(root, "data-start-analyze"));
  assert.equal(api.bootstraps[1]!.idempotencyKey, api.bootstraps[0]!.idempotencyKey, "a retry of the same question reuses its key");

  await act(async () => {
    one(root, "data-start-supplement").props.onChange({ target: { value: "先做东京" } });
  });
  await click(one(root, "data-start-analyze"));
  assert.notEqual(api.bootstraps[2]!.idempotencyKey, api.bootstraps[0]!.idempotencyKey, "a different question is a new request");
  assert.deepEqual(api.assigned, ["/app/agent?plan=plan%3Av1&reveal=1"]);
  act(() => root.unmount());
});

test("step 3: when a plan already exists the button opens that plan instead of making another", async (t) => {
  const conflict = () =>
    Response.json(
      { error: { code: "CONFLICT", context: { planId: "plan:old", reason: "PLAN_ALREADY_EXISTS" } }, success: false },
      { status: 409 },
    );
  const api = stubBrowser(t, { bootstrap: [conflict] });
  const root = await mount(props({ relationshipGoal: "找渠道", snapshot: { confirmedContacts: 3, currentStep: 3 } }));
  await click(one(root, "data-start-analyze"));
  assert.deepEqual(api.assigned, ["/app/agent?plan=plan%3Aold"]);
  act(() => root.unmount());
});

/* ── currentStep 写入顺序（SC-04） ─────────────────────────────────────── */

test("every currentStep write goes through one serial queue: 2 → 1 then skip ends at {step1Skipped: true, currentStep: 3}", async (t) => {
  stubBrowser(t);
  // 覆盖 stubBrowser 的 fetch：PATCH 的响应由测试手动放行，而且总是先放行**最后**发出的那个
  // （模拟网络倒序到达）；服务端按放行顺序落库。串行队列下同一时刻只会有一个请求在路上。
  const server: Record<string, unknown> = {};
  const sent: Record<string, unknown>[] = [];
  const pending: Array<{ body: Record<string, unknown>; resolve: (response: Response) => void }> = [];
  let maxInFlight = 0;
  t.mock.method(globalThis, "fetch", (input: unknown, init?: RequestInit) => {
    if (String(input) !== "/api/guide/state" || init?.method !== "PATCH") {
      return Promise.resolve(Response.json({ success: false }, { status: 404 }));
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    sent.push(body);
    return new Promise<Response>((resolve) => {
      pending.push({ body, resolve });
      maxInFlight = Math.max(maxInFlight, pending.length);
    });
  });
  const releaseLatest = async () => {
    const next = pending.pop();
    assert.ok(next, "a request should be waiting");
    Object.assign(server, next.body);
    await act(async () => {
      next.resolve(Response.json({ success: true, data: { ...server } }));
    });
    await settle();
  };

  // 有目标：第 2 步已完成可重开；跳过第 1 步后前进到第 3 步。
  const root = await mount(props({ relationshipGoal: "找渠道" }));
  await click(one(root, "data-start-step", "2"));
  await click(one(root, "data-start-step", "1"));
  assert.equal(view(root), "1");
  await act(async () => {
    one(root, "data-start-skip-button").props.onClick();
  });
  await settle();
  assert.deepEqual(sent, [{ currentStep: 2 }], "later writes wait for the one in flight");

  while (pending.length) await releaseLatest();

  assert.deepEqual(sent, [{ currentStep: 2 }, { currentStep: 1 }, { currentStep: 3, step1Skipped: true }]);
  assert.equal(maxInFlight, 1);
  assert.deepEqual(server, { currentStep: 3, step1Skipped: true });
  assert.equal(view(root), "3");
  // 跳过确认后不会再补发更早的 {currentStep: 1}。
  await settle();
  assert.equal(sent.length, 3);
  act(() => root.unmount());
});
