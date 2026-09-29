/**
 * W0004 SC-01 页面级：`/app/agent` 在开关关 / 开两种状态下下传给壳的 `guide`。
 *
 * 用 require.cache 替换页面的依赖（与 `app-canonical-agent-personal-scope.test.ts` 同一写法），
 * `features/guide/progress.ts` 用真实实现，只替换它底下的存储：
 *   - 开关关：`guide` 为 null，引导记录 / 联系人计数 / 计划一个都不读；
 *   - 开关开 + 新用户：`guide` 带进度（0 / 3，下一步名片），读取都以 canonical actor 进行；
 *   - 开关开 + D2 老用户：`guide` 为 null（真实首页）。
 *   - W0008 `?plan=<id>`：开关关、或开关开且前 3 步已完成（刚生成完计划）时，以 canonical actor 读这份
 *     计划并把回答卡片交给壳（直接落在对话，`reveal=1` 时揭示一次）；读不到的计划落回概览；
 *     仍在示例期时不读计划。
 */
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import type { ReactElement } from "react";

const root = join(fileURLToPath(import.meta.url), "../../..");
const require = createRequire(import.meta.url);

interface Scenario {
  /** W0008：本人是否已有生效计划（第 3 步）。 */
  activePlan?: boolean;
  contacts: number;
  createdAt?: string | null;
  flag: string | undefined;
  goal?: string;
  /** W0008：`getPlan(id)` 能读到的本人计划。 */
  plans?: Record<string, unknown>;
  since?: string;
  /** W0014：对话路由模型、报名／canonical id、社群、计划读取一律抛错（示例期间不许调用它们）。 */
  realLoadersThrow?: boolean;
  /** W0014：真实对话视图模型（suggests 带真实人名，用来验证示例壳不会拿到它）。 */
  realViewModel?: Record<string, unknown>;
  /** W0022：社群加入状态（默认 false）。 */
  communityJoined?: boolean;
  /** W0022：首页活动（route id）与其中本人已报名的。 */
  homeEvents?: string[];
  registeredEvents?: string[];
  /** W0022：`hasAnyActiveRegistration` 的结果；"throw" 表示读取失败。 */
  registeredAny?: boolean | "throw";
}

function loadPage(t: TestContext, scenario: Scenario) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const guideRecords = new Map<string, Record<string, unknown>>();
  const shellProps: Array<Record<string, unknown>> = [];
  const IOrbitShell = (props: Record<string, unknown>) => {
    shellProps.push(props);
    return null;
  };
  const stub = (operation: string, result: unknown) => async (...args: unknown[]) => {
    calls.push({ input: args, operation });
    return result;
  };
  // W0014：示例期间不应被调用的真实读取；`realLoadersThrow` 时调用即抛错（仍记一笔）。
  const realStub = (operation: string, result: unknown) => async (...args: unknown[]) => {
    calls.push({ input: args, operation });
    if (scenario.realLoadersThrow) throw new Error(`${operation} exploded`);
    return result;
  };

  const previousFlag = process.env.ORBIT_GUIDE_DEMO;
  const previousSince = process.env.ORBIT_GUIDE_DEMO_SINCE;
  if (scenario.flag === undefined) delete process.env.ORBIT_GUIDE_DEMO;
  else process.env.ORBIT_GUIDE_DEMO = scenario.flag;
  if (scenario.since === undefined) delete process.env.ORBIT_GUIDE_DEMO_SINCE;
  else process.env.ORBIT_GUIDE_DEMO_SINCE = scenario.since;

  const modules: Record<string, unknown> = {
    "next/navigation": { redirect: (href: string) => { throw new Error(`redirect:${href}`); } },
    [join(root, "auth.ts")]: { auth: stub("auth", { user: { email: "owner@example.test", id: "subject:external", name: "Owner" } }) },
    [join(root, "app/api/_shared/authenticated-actor.ts")]: { resolveAuthenticatedApiActorFromSession: stub("identity", { id: "account:canonical" }) },
    [join(root, "app/(app)/app/orbit-language-server.ts")]: { getOrbitServerLanguage: async () => "zh", localizeOrbitTree: (tree: unknown) => tree },
    [join(root, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(root, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
    [join(root, "app/(app)/app/agent/iorbit-0918/iorbit-shell.tsx")]: { IOrbitShell },
    [join(root, "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-route-view-model.ts")]: { loadAppChatRouteViewModel: realStub("chat", {}) },
    [join(root, "app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-view-model-adapter.ts")]: {
      composeOrbitAgentEntryViewModel: () => {
        calls.push({ operation: "compose" });
        return { state: "ready", viewModel: scenario.realViewModel ?? {} };
      },
    },
    [join(root, "app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx")]: {
      loadAppHomeRouteViewModel: stub("home", {
        home: {
          account: { relationshipGoal: scenario.goal ?? "" },
          events: (scenario.homeEvents ?? []).map((id) => ({ id, stats: {} })),
        },
        state: "success",
      }),
    },
    [join(root, "app/(app)/app/canonical-event-detail-view.ts")]: { resolveConfiguredActorEventCanonicalIds: realStub("events", {}) },
    [join(root, "features/events/registration/runtime.ts")]: {
      readRuntimeEventRegistrationStates: async (input: { eventIds: string[]; userId: string }) => {
        calls.push({ input: [input], operation: "registrations" });
        if (scenario.realLoadersThrow) throw new Error("registrations exploded");
        return Object.fromEntries(
          input.eventIds.map((id) => [id, { availability: "open", registered: scenario.registeredEvents?.includes(id) ?? false }]),
        );
      },
    },
    [join(root, "features/community/service-factory.ts")]: { readCommunityJoinedForActor: realStub("community", scenario.communityJoined ?? false) },
    [join(root, "features/events/registration/active-registration.ts")]: {
      hasAnyActiveRegistration: async (actorId: string) => {
        calls.push({ input: actorId, operation: "registered-any" });
        if (scenario.registeredAny === "throw" || scenario.realLoadersThrow) throw new Error("registered-any exploded");
        return scenario.registeredAny ?? false;
      },
    },
    [join(root, "app/(app)/app/orbit-event-presentation.ts")]: { presentOrbitEvents: (events: unknown[]) => events },
    // 真实 progress.ts 底下的四个来源：
    [join(root, "features/guide/service-factory.ts")]: {
      resolveGuideStateService: ({ actorId }: { actorId: string }) => {
        calls.push({ input: actorId, operation: "guide-state" });
        const read = () => ({
          bannerCollapsed: guideRecords.get(actorId)?.bannerCollapsed === true,
          grandfathered: (guideRecords.get(actorId)?.grandfathered as boolean | undefined) ?? null,
          version: 1,
        });
        return {
          mode: "mock",
          service: {
            get: async () => read(),
            recordGrandfathered: async (value: boolean) => {
              calls.push({ input: [actorId, value], operation: "grandfathered" });
              guideRecords.set(actorId, { ...guideRecords.get(actorId), grandfathered: value });
              return read();
            },
            setBannerCollapsed: async () => read(),
          },
          success: true,
        };
      },
    },
    [join(root, "shared/storage/configured-live-record-store.ts")]: {
      createConfiguredPostgresLiveRecordStore: () => ({
        client: {
          query: async (_sql: string, values: readonly unknown[]) => {
            calls.push({ input: values, operation: "contacts" });
            return { rows: [{ total: scenario.contacts }] };
          },
        },
        store: {},
        workspaceId: "workspace:test",
      }),
    },
    [join(root, "features/plans/service-factory.ts")]: {
      resolvePlanService: ({ actorId }: { actorId: string }) => {
        calls.push({ input: actorId, operation: "plan" });
        return {
          mode: "mock",
          service: {
            getCurrent: async () => (scenario.activePlan ? Object.values(scenario.plans ?? {})[0] ?? null : null),
            getPlan: async (planId: string) => {
              calls.push({ input: [actorId, planId], operation: "plan-read" });
              if (scenario.realLoadersThrow) throw new Error("plan-read exploded");
              return scenario.plans?.[planId] ?? null;
            },
          },
          success: true,
        };
      },
    },
    [join(root, "features/account/storage/account-live-record-provider.ts")]: {
      createConfiguredStorageAccountSessionProvider: () => ({
        readAccountSessionGraph: async (identity: unknown) => {
          calls.push({ input: identity, operation: "account" });
          return {
            accounts: [{ createdAt: scenario.createdAt ?? null, id: "account:canonical", name: "Owner", updatedAt: "" }],
            evidenceIds: [],
            generatedAt: "",
            profiles: [],
          };
        },
      }),
    },
  };
  const pagePath = join(root, "app/(app)/app/agent/page.tsx");
  const progressPath = join(root, "features/guide/progress.ts");
  const ids = [...Object.keys(modules), pagePath, progressPath].map((id) => require.resolve(id));
  const before = new Map(ids.map((id) => [id, require.cache[id]]));
  t.after(() => {
    for (const [id, previous] of before) {
      if (previous) require.cache[id] = previous;
      else delete require.cache[id];
    }
    if (previousFlag === undefined) delete process.env.ORBIT_GUIDE_DEMO;
    else process.env.ORBIT_GUIDE_DEMO = previousFlag;
    if (previousSince === undefined) delete process.env.ORBIT_GUIDE_DEMO_SINCE;
    else process.env.ORBIT_GUIDE_DEMO_SINCE = previousSince;
  });
  for (const [id, exports] of Object.entries(modules)) {
    const resolved = require.resolve(id);
    const replacement = new Module(resolved);
    replacement.filename = resolved;
    replacement.loaded = true;
    replacement.exports = exports;
    require.cache[resolved] = replacement;
  }
  delete require.cache[require.resolve(pagePath)];
  delete require.cache[require.resolve(progressPath)];
  return {
    calls,
    guideRecords,
    page: require(pagePath).default as (input?: { searchParams?: Promise<Record<string, string>> }) => Promise<ReactElement>,
    shellProps,
  };
}

/** 页面返回的是元素树（壳被替换成桩），找出传给壳的 props。 */
function shellPropsOf(tree: ReactElement): Record<string, unknown> {
  const nodes: unknown[] = [tree];
  while (nodes.length) {
    const node = nodes.pop() as { props?: Record<string, unknown>; type?: unknown } | null;
    if (!node || typeof node !== "object") continue;
    if (typeof node.type === "function" && (node.type as { name?: string }).name === "IOrbitShell") {
      return node.props ?? {};
    }
    const children = node.props?.children;
    nodes.push(...(Array.isArray(children) ? children : [children]));
  }
  assert.fail("IOrbitShell was not rendered");
}

const GUIDE_OPERATIONS = ["guide-state", "contacts", "plan", "account", "grandfathered"];

test("flag off: the shell gets no guide and not one guide source is read", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: undefined });
  const props = shellPropsOf(await page());
  assert.equal(props.guide, null);
  assert.deepEqual(
    calls.filter((call) => GUIDE_OPERATIONS.includes(call.operation)),
    [],
  );
});

test("flag set to anything but on / true / 1 still behaves as off", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: "off" });
  assert.equal(shellPropsOf(await page()).guide, null);
  assert.equal(calls.filter((call) => GUIDE_OPERATIONS.includes(call.operation)).length, 0);
});

test("flag on + new user: the shell gets the demo view, read as the canonical actor", async (t) => {
  const { calls, guideRecords, page } = loadPage(t, { contacts: 0, flag: "on" });
  const props = shellPropsOf(await page());
  assert.deepEqual(props.guide, {
    bannerCollapsed: false,
    completed: 0,
    confirmedContacts: 0,
    nextStep: "contacts",
    steps: { contacts: false, goal: false, plan: false },
  });
  assert.deepEqual(calls.find((call) => call.operation === "contacts")?.input, ["workspace:test", "account:canonical"]);
  assert.equal(calls.find((call) => call.operation === "plan")?.input, "account:canonical");
  assert.equal(calls.find((call) => call.operation === "guide-state")?.input, "account:canonical");
  // 联系人不足 3 位：不读账号记录，首次判定 false 落库。
  assert.equal(calls.filter((call) => call.operation === "account").length, 0);
  assert.equal(guideRecords.get("account:canonical")?.grandfathered, false);
});

test("flag on + D2 legacy user (created before SINCE, ≥3 contacts): the real home", async (t) => {
  const { calls, guideRecords, page } = loadPage(t, {
    contacts: 4,
    createdAt: "2026-06-01T00:00:00.000Z",
    flag: "on",
    goal: "推进日本合作",
    since: "2026-10-15",
  });
  assert.equal(shellPropsOf(await page()).guide, null);
  assert.deepEqual(calls.find((call) => call.operation === "account")?.input, { userId: "subject:external" });
  assert.equal(guideRecords.get("account:canonical")?.grandfathered, true);
});

test("flag on + registered after SINCE with ≥3 contacts and a goal: still in the demo until a plan exists", async (t) => {
  const { page } = loadPage(t, {
    contacts: 3,
    createdAt: "2026-10-20T00:00:00.000Z",
    flag: "on",
    goal: "三个月内找到 5 家试用客户",
    since: "2026-10-15",
  });
  const guide = shellPropsOf(await page()).guide as { completed: number; nextStep: string } | null;
  assert.equal(guide?.completed, 2);
  assert.equal(guide?.nextStep, "plan");
});

/* ── W0008：?plan=<id> ─────────────────────────────────────────────── */

async function planScenario() {
  const { savedBootstrapPlan } = await import("../support/plan-bootstrap-fixture");
  const snapshot = await savedBootstrapPlan();
  return { planId: snapshot.plan.id, plans: { [snapshot.plan.id]: snapshot } };
}

test("flag off + ?plan=<id>&reveal=1: the actor's plan reaches the shell as the answer card, straight into the chat", async (t) => {
  const { planId, plans } = await planScenario();
  const { calls, page } = loadPage(t, { contacts: 0, flag: undefined, plans });
  const props = shellPropsOf(await page({ searchParams: Promise.resolve({ plan: planId, reveal: "1" }) }));
  assert.equal(props.guide, null);
  assert.equal(props.initialDeepLink, true);
  assert.equal(props.initialPlanReveal, true);
  const card = props.initialPlanCard as { planId: string; version: number; phases: unknown[] };
  assert.equal(card.planId, planId);
  assert.equal(card.version, 1);
  assert.equal(card.phases.length, 3);
  assert.deepEqual(calls.find((call) => call.operation === "plan-read")?.input, ["account:canonical", planId]);

  // 刷新（没有 reveal）：直接是已完成的卡片。
  const refreshed = shellPropsOf(await loadPage(t, { contacts: 0, flag: undefined, plans }).page({ searchParams: Promise.resolve({ plan: planId }) }));
  assert.equal(refreshed.initialPlanReveal, false);
  assert.ok(refreshed.initialPlanCard);
});

test("?plan= for a plan the actor cannot read falls back to the overview", async (t) => {
  const { page } = loadPage(t, { contacts: 0, flag: undefined, plans: {} });
  const props = shellPropsOf(await page({ searchParams: Promise.resolve({ plan: "plan:someone-elses", reveal: "1" }) }));
  assert.equal(props.initialPlanCard, null);
  assert.equal(props.initialDeepLink, false);
  assert.equal(props.initialPlanReveal, false);
});

test("flag on: right after step 3 saves the plan the user leaves the demo and sees the card; still in the demo, no plan is read", async (t) => {
  const { planId, plans } = await planScenario();
  const done = loadPage(t, {
    activePlan: true,
    contacts: 3,
    createdAt: "2026-10-20T00:00:00.000Z",
    flag: "on",
    goal: "三个月内拿到 10 家企业客户的试用",
    plans,
    since: "2026-10-15",
  });
  const props = shellPropsOf(await done.page({ searchParams: Promise.resolve({ plan: planId, reveal: "1" }) }));
  assert.equal(props.guide, null, "steps 1–3 are done, so the demo is over");
  assert.equal((props.initialPlanCard as { planId: string }).planId, planId);

  const demo = loadPage(t, { contacts: 0, flag: "on", plans });
  const demoProps = shellPropsOf(await demo.page({ searchParams: Promise.resolve({ plan: planId }) }));
  assert.ok(demoProps.guide, "a user still in the demo keeps the demo shell");
  assert.equal(demoProps.initialPlanCard, null);
  assert.equal(demo.calls.filter((call) => call.operation === "plan-read").length, 0);
});

/* ── W0014：「我的计划」页（`/app/agent/plan`）在示例模式开／关下读什么 ─────────────── */

interface PlanPageScenario {
  flag?: string;
  /** readGuideStatusForActor 的结果：in-demo / out（已完成或老用户）。 */
  guide?: "in-demo" | "out";
}

/**
 * `_demo/demo-guide-view.ts` 用真实实现（与人脉页同一套判定），只替换它底下的本人资料与引导进度；
 * 真实计划读取（`resolvePlanService`）与联系人名字（`readPlanContactNames`）换成记录调用的桩。
 */
function loadPlanPage(t: TestContext, scenario: PlanPageScenario) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const IOrbitPlan = (props: Record<string, unknown>) => {
    void props;
    return null;
  };
  const snapshot = { items: [], log: [], plan: { id: "plan:real" } };
  const previousFlag = process.env.ORBIT_GUIDE_DEMO;
  if (scenario.flag === undefined) delete process.env.ORBIT_GUIDE_DEMO;
  else process.env.ORBIT_GUIDE_DEMO = scenario.flag;
  const progress = { completed: 1, confirmedContacts: 3, nextStep: "goal", steps: { contacts: true, goal: false, plan: false } };

  const modules: Record<string, unknown> = {
    "next/navigation": { redirect: (href: string) => { throw new Error(`redirect:${href}`); } },
    [join(root, "auth.ts")]: { auth: async () => ({ user: { email: "owner@example.test", id: "subject:external", name: "Owner" } }) },
    [join(root, "app/api/_shared/authenticated-actor.ts")]: { resolveAuthenticatedApiActorFromSession: async () => ({ id: "account:canonical" }) },
    [join(root, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(root, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
    [join(root, "app/(app)/app/agent/iorbit-0918/iorbit-plan.tsx")]: { IOrbitPlan },
    [join(root, "features/plans/service-factory.ts")]: {
      resolvePlanService: ({ actorId }: { actorId: string }) => {
        calls.push({ input: actorId, operation: "plan" });
        return {
          mode: "mock",
          service: {
            // W0021：计划页与 API 同一个入口（阶段判定在里面），只调这一次。
            getCurrentView: async (options?: { includeLog?: boolean }) => {
              calls.push({ input: actorId, operation: options?.includeLog ? "view+log" : "view" });
              return snapshot;
            },
            reanalysisQuota: async () => {
              calls.push({ input: actorId, operation: "quota" });
              return { limit: 1, month: "2026-09", remaining: 1, used: 0 };
            },
          },
          success: true,
        };
      },
    },
    [join(root, "features/plans/contact-names.ts")]: {
      planContactIds: () => ["contact:1"],
      readPlanContactNames: async (actorId: string) => {
        calls.push({ input: actorId, operation: "contact-names" });
        return { "contact:1": { name: "Real person", subtitle: null } };
      },
    },
    [join(root, "features/profile/service-factory.ts")]: {
      createProfileService: () => ({
        getProfile: async (input: unknown) => {
          calls.push({ input, operation: "profile" });
          return { data: { profile: { relationshipGoal: "" } }, success: true };
        },
      }),
    },
    [join(root, "features/guide/progress.ts")]: {
      readGuideStatusForActor: async (input: unknown) => {
        calls.push({ input, operation: "guide" });
        return scenario.guide === "out"
          ? { bannerCollapsed: false, grandfathered: true, inDemo: false, progress: null }
          : { bannerCollapsed: false, grandfathered: false, inDemo: true, progress };
      },
    },
  };
  const pagePath = join(root, "app/(app)/app/agent/plan/page.tsx");
  const guideViewPath = join(root, "app/(app)/app/_demo/demo-guide-view.ts");
  // W0021：计划读取移到 read-current-plan.ts，它也要按本用例的桩重新加载。
  const readPlanPath = join(root, "app/(app)/app/agent/plan/read-current-plan.ts");
  const ids = [...Object.keys(modules), pagePath, guideViewPath, readPlanPath].map((id) => require.resolve(id));
  const before = new Map(ids.map((id) => [id, require.cache[id]]));
  t.after(() => {
    for (const [id, previous] of before) {
      if (previous) require.cache[id] = previous;
      else delete require.cache[id];
    }
    if (previousFlag === undefined) delete process.env.ORBIT_GUIDE_DEMO;
    else process.env.ORBIT_GUIDE_DEMO = previousFlag;
  });
  for (const [id, exports] of Object.entries(modules)) {
    const resolved = require.resolve(id);
    const replacement = new Module(resolved);
    replacement.filename = resolved;
    replacement.loaded = true;
    replacement.exports = exports;
    require.cache[resolved] = replacement;
  }
  delete require.cache[require.resolve(pagePath)];
  delete require.cache[require.resolve(guideViewPath)];
  delete require.cache[require.resolve(readPlanPath)];
  return { calls, page: require(pagePath).default as () => Promise<ReactElement>, snapshot };
}

function planPropsOf(tree: ReactElement): Record<string, unknown> {
  const nodes: unknown[] = [tree];
  while (nodes.length) {
    const node = nodes.pop() as { props?: Record<string, unknown>; type?: unknown } | null;
    if (!node || typeof node !== "object") continue;
    if (typeof node.type === "function" && (node.type as { name?: string }).name === "IOrbitPlan") return node.props ?? {};
    const children = node.props?.children;
    nodes.push(...(Array.isArray(children) ? children : [children]));
  }
  assert.fail("IOrbitPlan was not rendered");
}

test("W0014 plan page, flag off: the real plan and names are read, no guide source is touched, props as before", async (t) => {
  const { calls, page, snapshot } = loadPlanPage(t, { flag: undefined });
  const props = planPropsOf(await page());
  // W0012：读计划前惰性判定进入新阶段（W0021：与读取合在 getCurrentView 里，计划页带进展记录）；
  // 另读额度与资料里的目标（计划未到期，不读期间联系人）。
  assert.deepEqual(calls.map((call) => call.operation), ["plan", "view+log", "contact-names", "quota", "profile"]);
  // W0014 的三个 props 不变，没有 `guide`；W0012 另加 `tracking`。
  assert.deepEqual(Object.keys(props).sort(), ["contactNames", "guideEnabled", "initialSnapshot", "tracking"]);
  assert.deepEqual(props.tracking, { currentGoal: "", periodContacts: null, quotaRemaining: 1 });
  assert.equal(props.initialSnapshot, snapshot);
  assert.equal(props.guideEnabled, false);
  assert.deepEqual(props.contactNames, { "contact:1": { name: "Real person", subtitle: null } });
});

test("W0014 plan page, flag on but out of the guide: the real plan page", async (t) => {
  const { calls, page, snapshot } = loadPlanPage(t, { flag: "on", guide: "out" });
  const props = planPropsOf(await page());
  assert.deepEqual(calls.map((call) => call.operation), ["profile", "guide", "plan", "view+log", "contact-names", "quota", "profile"]);
  assert.equal(props.guide, undefined);
  assert.equal(props.initialSnapshot, snapshot);
  assert.equal(props.guideEnabled, true);
});

test("W0014 plan page, in the guide: no real plan or contact-name read; the screen gets the demo guide", async (t) => {
  const { calls, page } = loadPlanPage(t, { flag: "on", guide: "in-demo" });
  const props = planPropsOf(await page());
  assert.deepEqual(calls.map((call) => call.operation), ["profile", "guide"]);
  assert.deepEqual(props.guide, {
    bannerCollapsed: false,
    completed: 1,
    confirmedContacts: 3,
    nextStep: "goal",
    steps: { contacts: true, goal: false, plan: false },
  });
  assert.equal(props.initialSnapshot, null);
  // 读取都以 canonical actor 进行。
  assert.deepEqual(calls[1]!.input, { actorId: "account:canonical", relationshipGoal: "", userId: "subject:external" });
});

/* ── W0014：示例期间 `/app/agent` 不读真实对话／首页业务数据，也不把它们交给示例壳 ─────── */

const REAL_BUSINESS_READS = ["chat", "compose", "events", "registrations", "community", "plan-read", "registered-any"];
const POLLUTED_VIEW_MODEL = {
  history: [],
  scenarios: {},
  suggests: [{ icon: "users", label: "约真实联系人甲斐真由美", q: "给甲斐真由美（真实公司）的草稿" }],
};

test("W0014 in the guide: every real chat / home-business loader throws, yet the demo shell renders with zero such calls", async (t) => {
  const { calls, page } = loadPage(t, {
    contacts: 0,
    flag: "on",
    realLoadersThrow: true,
    realViewModel: POLLUTED_VIEW_MODEL,
  });
  const props = shellPropsOf(await page({ searchParams: Promise.resolve({ plan: "plan:x", q: "hi" }) }));
  assert.ok(props.guide, "the demo shell is rendered");
  assert.deepEqual(calls.filter((call) => REAL_BUSINESS_READS.includes(call.operation)), []);
  // 首页数据只读一次（示例判定要用目标）；示例壳拿不到真实 home／viewModel。
  assert.equal(calls.filter((call) => call.operation === "home").length, 1);
  assert.equal(props.home, null);
  assert.equal(props.initialPlanCard, null);
  assert.ok(!JSON.stringify(props.viewModel).includes("甲斐真由美"), "no real suggests reach the demo shell");
});

test("W0014 flag off: the live path still reads chat, home, events, registrations and community exactly once each", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: undefined, realViewModel: POLLUTED_VIEW_MODEL });
  const props = shellPropsOf(await page());
  assert.equal(props.guide, null);
  for (const operation of ["chat", "home", "events", "registrations", "community"]) {
    assert.equal(calls.filter((call) => call.operation === operation).length, 1, operation);
  }
  assert.deepEqual(calls.filter((call) => GUIDE_OPERATIONS.includes(call.operation)), []);
  assert.equal(props.viewModel, POLLUTED_VIEW_MODEL);
});

/* ── W0022：首页第 4 步提醒的服务端判定与读取计数 ─────────────────────── */

const step4Reads = (calls: Array<{ operation: string; input?: unknown }>) =>
  calls.filter((call) => call.operation === "registered-any");

test("W0022 flag off: guideEnabled false, no reminder, and hasAnyActiveRegistration is never called", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 4, flag: undefined });
  const props = shellPropsOf(await page());
  assert.equal(props.guideEnabled, false);
  assert.equal(props.guideStep4Pending, false);
  assert.equal(step4Reads(calls).length, 0);
});

test("W0022 in the demo: no step-4 read and no guide props on the demo shell", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: "on" });
  const props = shellPropsOf(await page());
  assert.ok(props.guide);
  assert.equal(props.guideStep4Pending, undefined);
  assert.equal(step4Reads(calls).length, 0);
});

const LEGACY = { contacts: 4, createdAt: "2026-06-01T00:00:00.000Z", flag: "on", goal: "推进日本合作", since: "2026-10-15" } as const;

test("W0022 flag on, out of the demo, nothing joined or registered: one hasAnyActiveRegistration read by the canonical actor → pending", async (t) => {
  const { calls, page } = loadPage(t, { ...LEGACY, homeEvents: ["ev-1"] });
  const props = shellPropsOf(await page());
  assert.equal(props.guide, null);
  assert.equal(props.guideEnabled, true);
  assert.equal(props.guideStep4Pending, true);
  assert.deepEqual(step4Reads(calls).map((call) => call.input), ["account:canonical"]);
});

test("W0022 flag on: already in the community, or registered for a home event → done with zero extra reads", async (t) => {
  const joined = loadPage(t, { ...LEGACY, communityJoined: true });
  const joinedProps = shellPropsOf(await joined.page());
  assert.equal(joinedProps.guideEnabled, true);
  assert.equal(joinedProps.guideStep4Pending, false);
  assert.equal(step4Reads(joined.calls).length, 0);

  const registered = loadPage(t, { ...LEGACY, homeEvents: ["ev-1", "ev-2"], registeredEvents: ["ev-2"] });
  assert.equal(shellPropsOf(await registered.page()).guideStep4Pending, false);
  assert.equal(step4Reads(registered.calls).length, 0);
});

test("W0022 flag on: a registration anywhere (off the home list) clears the reminder; a failed read never shows it", async (t) => {
  const elsewhere = loadPage(t, { ...LEGACY, registeredAny: true });
  assert.equal(shellPropsOf(await elsewhere.page()).guideStep4Pending, false);
  assert.equal(step4Reads(elsewhere.calls).length, 1);

  const failed = loadPage(t, { ...LEGACY, registeredAny: "throw" });
  const props = shellPropsOf(await failed.page());
  assert.equal(props.guideStep4Pending, false, "unreadable registration state → no reminder");
  assert.equal(props.guideEnabled, true);
  assert.equal(step4Reads(failed.calls).length, 1);
});
