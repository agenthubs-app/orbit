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
import { createOrbitAgentStarterViewModel } from "../../app/(app)/app/orbit-agent-route-view-model";
// W0040：真实首页组合函数（在页面桩替换 require.cache 之前载入），用于证明那 1 次首页读取不算资料建议。
import { loadAppHomeRouteViewModel as realLoadAppHomeRouteViewModel } from "../../app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import { profileSignalReviewQueueServiceFactory } from "../../features/profile/service-factory";
// W0041：首页联系人改读计数服务；联系人列表服务解析时记调用栈，区分是否经过联系人页模型。
import { homeContactsSummaryServiceFactory } from "../../features/contacts/home-contacts-summary";
import { contactsListSearchAndFilterServiceFactory } from "../../features/contacts/service-factory";

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
  /** W0036：示例期「近期可报名」的公开目录（默认一场未来活动）；"throw" 表示读取失败。 */
  catalogue?: Record<string, unknown> | "throw";
  /**
   * W0040：首页桩先用页面传入的同一 actor 跑一遍真实 `loadAppHomeRouteViewModel`（mock 模式），
   * 资料建议 `listUpdateSuggestions` 每次调用记一笔 "profile-suggestions"；桩的返回值不变。
   */
  throughRealHomeLoader?: boolean;
}

/** W0036：公开目录桩（`readRecords` 的形状，见 `features/events/core/public-catalogue.ts`）。 */
function demoCatalogue(records: Array<{ id: string; startsAt: string; title: string }>) {
  const full = records.map((record) => ({
    description: "公开活动",
    endsAt: new Date(Date.parse(record.startsAt) + 2 * 3600_000).toISOString(),
    evidence: [{ evidenceId: `evidence:${record.id}` }],
    id: record.id,
    sourceMetadata: {},
    startsAt: record.startsAt,
    status: "imported",
    title: record.title,
    venue: "渋谷",
  }));
  return {
    generatedAt: new Date().toISOString(),
    organizerIds: Object.fromEntries(records.map((record) => [record.id, "account:organizer"])),
    participantCounts: Object.fromEntries(records.map((record) => [record.id, 0])),
    publicCodes: Object.fromEntries(records.map((record) => [record.id, `CODE-${record.id}`])),
    records: full,
  };
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
  if (scenario.throughRealHomeLoader) {
    const previousMode = process.env.ORBIT_MODULE_MODE;
    process.env.ORBIT_MODULE_MODE = "mock";
    t.after(() => {
      if (previousMode === undefined) delete process.env.ORBIT_MODULE_MODE;
      else process.env.ORBIT_MODULE_MODE = previousMode;
    });
    const create = profileSignalReviewQueueServiceFactory.create;
    t.mock.method(profileSignalReviewQueueServiceFactory, "create", (mode?: string) => {
      const resolution = create(mode);
      if (!resolution.success) return resolution;
      const service = resolution.service;
      return {
        ...resolution,
        service: {
          ...service,
          listUpdateSuggestions(input: Parameters<typeof service.listUpdateSuggestions>[0]) {
            calls.push({ input, operation: "profile-suggestions" });
            return service.listUpdateSuggestions(input);
          },
        },
      };
    });
  }
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
    [join(root, "app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx")]: {
      loadAppHomeRouteViewModel: async (...args: unknown[]) => {
        calls.push({ input: args, operation: "home" });
        if (scenario.throughRealHomeLoader) {
          const real = await realLoadAppHomeRouteViewModel(
            args[0] as Parameters<typeof realLoadAppHomeRouteViewModel>[0],
            args[1] as Parameters<typeof realLoadAppHomeRouteViewModel>[1],
            { readCanonicalParticipantEventJourneys: async () => [] },
          );
          calls.push({ input: real.state, operation: "home-real" });
        }
        return {
          home: {
            account: { relationshipGoal: scenario.goal ?? "" },
            events: (scenario.homeEvents ?? []).map((id) => ({ id, stats: {} })),
          },
          state: "success",
        };
      },
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
    // W0036：示例期「近期可报名」的两条底层读取（目录、本人报名），各记一笔。
    [join(root, "features/events/core/public-catalogue-runtime.ts")]: {
      createConfiguredCanonicalPublicEventCatalogue: () => ({
        readRecords: async () => {
          calls.push({ operation: "catalogue" });
          if (scenario.catalogue === "throw") throw new Error("catalogue exploded");
          return scenario.catalogue ?? demoCatalogue([{ id: "event_01", startsAt: "2099-01-01T01:00:00.000Z", title: "未来活动" }]);
        },
      }),
    },
    [join(root, "features/events/event-operations/repository.ts")]: {
      createConfiguredEventOperationsRepository: () => ({
        listCanonicalRegistrationsForUser: async (userId: string, eventIds: readonly string[]) => {
          calls.push({ input: [userId, eventIds], operation: "demo-registrations" });
          return [];
        },
      }),
    },
    // 真实 progress.ts 底下的四个来源：
    [join(root, "features/guide/service-factory.ts")]: {
      resolveGuideStateService: ({ actorId }: { actorId: string }) => {
        calls.push({ input: actorId, operation: "guide-state" });
        const read = () => ({
          bannerCollapsed: guideRecords.get(actorId)?.bannerCollapsed === true,
          completedAt: (guideRecords.get(actorId)?.completedAt as string | undefined) ?? null,
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
            // W0054：首页路径第一次推导出 3 步完成时补写闩锁。
            markCompleted: async () => {
              calls.push({ input: actorId, operation: "mark-completed" });
              if (!guideRecords.get(actorId)?.completedAt) guideRecords.set(actorId, { ...guideRecords.get(actorId), completedAt: "2026-10-20T00:00:00.000Z" });
              return read();
            },
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
  const poolRuntimePath = join(root, "features/agent/home-event-pool-runtime.ts");
  const ids = [...Object.keys(modules), pagePath, progressPath, poolRuntimePath].map((id) => require.resolve(id));
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
  delete require.cache[require.resolve(poolRuntimePath)];
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

test("W0054 SC-02: flag on + completedAt recorded + only 2 contacts left: the real home, no contact count or plan read", async (t) => {
  const { calls, guideRecords, page } = loadPage(t, {
    contacts: 2,
    createdAt: "2026-10-20T00:00:00.000Z",
    flag: "on",
    goal: "",
    since: "2026-10-15",
  });
  guideRecords.set("account:canonical", { completedAt: "2026-10-01T00:00:00.000Z", grandfathered: false });
  assert.equal(shellPropsOf(await page()).guide, null);
  assert.equal(calls.filter((call) => call.operation === "contacts" || call.operation === "plan" || call.operation === "account").length, 0);
  assert.equal(calls.filter((call) => call.operation === "mark-completed").length, 0);
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

/* ── W0014：「我的计划」页（`/app/agent/plan`）──────────────────────────────────── */

// R07 (RD-20): /app/agent/plan no longer composes IOrbitPlan on the server — it only
// redirects to the Task page's plan segment, so the three W0014 plan-page read-order
// tests (flag off / flag on out of the guide / in the guide) have no page left to
// exercise. The IOrbitPlan guide behaviour (demo banner, persona, no-guide leak checks)
// stays covered through the component in app-agent-iorbit-screens.test.tsx.
test("R07 plan page: /app/agent/plan redirects to the Task page's plan segment without reading anything", (t) => {
  const pagePath = join(root, "app/(app)/app/agent/plan/page.tsx");
  const navigationId = require.resolve("next/navigation");
  const previousNavigation = require.cache[navigationId];
  const previousPage = require.cache[require.resolve(pagePath)];
  t.after(() => {
    if (previousNavigation) require.cache[navigationId] = previousNavigation;
    else delete require.cache[navigationId];
    if (previousPage) require.cache[require.resolve(pagePath)] = previousPage;
    else delete require.cache[require.resolve(pagePath)];
  });
  const replacement = new Module(navigationId);
  replacement.filename = navigationId;
  replacement.loaded = true;
  replacement.exports = { redirect: (href: string) => { throw new Error(`redirect:${href}`); } };
  require.cache[navigationId] = replacement;
  delete require.cache[require.resolve(pagePath)];
  const page = require(pagePath).default as () => unknown;
  assert.throws(() => page(), /^Error: redirect:\/app\/tasks\?tab=plan$/);
});

/* ── W0014：示例期间 `/app/agent` 不读真实对话／首页业务数据，也不把它们交给示例壳 ─────── */

// W0037：示例期放开社群状态读取（恰好 1 次，单独断言），其余仍为 0。
const REAL_BUSINESS_READS = ["events", "registrations", "plan-read", "registered-any"];
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
  // W0037：社群读取 1 次；它抛错时示例照常渲染，按未加入处理。
  assert.equal(calls.filter((call) => call.operation === "community").length, 1);
  assert.equal(props.communityJoined, false);
  // 首页数据只读一次（示例判定要用目标）；示例壳拿不到真实 home／viewModel。
  assert.equal(calls.filter((call) => call.operation === "home").length, 1);
  assert.equal(props.home, null);
  assert.equal(props.initialPlanCard, null);
  assert.ok(!JSON.stringify(props.viewModel).includes("甲斐真由美"), "no real suggests reach the demo shell");
});

test("W0014 flag off: the live path reads home, events, registrations and community exactly once each (legacy chat retired in 0104)", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: undefined });
  const props = shellPropsOf(await page());
  assert.equal(props.guide, null);
  for (const operation of ["home", "events", "registrations", "community"]) {
    assert.equal(calls.filter((call) => call.operation === operation).length, 1, operation);
  }
  assert.deepEqual(calls.filter((call) => GUIDE_OPERATIONS.includes(call.operation)), []);
  // Sprint 0104: the welcome suggests come from the fixed starter view model, never from a server read.
  assert.deepEqual(props.viewModel, createOrbitAgentStarterViewModel());
});

/* ── W0035：首页第 4 步提醒删除后，hasAnyActiveRegistration 在任何情况下都是 0 次 ─────── */

const step4Reads = (calls: Array<{ operation: string; input?: unknown }>) =>
  calls.filter((call) => call.operation === "registered-any");
const communityReads = (calls: Array<{ operation: string; input?: unknown }>) =>
  calls.filter((call) => call.operation === "community");

test("W0035 flag off: guideEnabled false, no guideStep4Pending prop, community read once, hasAnyActiveRegistration never called", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 4, flag: undefined, registeredAny: "throw" });
  const props = shellPropsOf(await page());
  assert.equal(props.guideEnabled, false);
  assert.ok(!("guideStep4Pending" in props));
  assert.equal(step4Reads(calls).length, 0);
  assert.equal(communityReads(calls).length, 1);
});

test("W0035 in the demo: no step-4 read and no guide-step-4 prop on the demo shell", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: "on" });
  const props = shellPropsOf(await page());
  assert.ok(props.guide);
  assert.ok(!("guideStep4Pending" in props));
  assert.equal(step4Reads(calls).length, 0);
});

const LEGACY = { contacts: 4, createdAt: "2026-06-01T00:00:00.000Z", flag: "on", goal: "推进日本合作", since: "2026-10-15" } as const;

test("W0035 flag on, out of the demo, nothing joined or registered: guideEnabled true, community read once, zero hasAnyActiveRegistration", async (t) => {
  const { calls, page } = loadPage(t, { ...LEGACY, homeEvents: ["ev-1"], registeredAny: "throw" });
  const props = shellPropsOf(await page());
  assert.equal(props.guide, null);
  assert.equal(props.guideEnabled, true);
  assert.ok(!("guideStep4Pending" in props));
  assert.equal(step4Reads(calls).length, 0);
  assert.deepEqual(communityReads(calls).map((call) => call.input), [[{ actorId: "account:canonical" }]]);
});

test("W0035 flag on: joined or registered changes nothing about step-4 reads (still zero)", async (t) => {
  const joined = loadPage(t, { ...LEGACY, communityJoined: true });
  const joinedProps = shellPropsOf(await joined.page());
  assert.equal(joinedProps.guideEnabled, true);
  assert.ok(!("guideStep4Pending" in joinedProps));
  assert.equal(step4Reads(joined.calls).length, 0);
  assert.equal(communityReads(joined.calls).length, 1);

  const registered = loadPage(t, { ...LEGACY, homeEvents: ["ev-1", "ev-2"], registeredEvents: ["ev-2"], registeredAny: true });
  assert.ok(!("guideStep4Pending" in shellPropsOf(await registered.page())));
  assert.equal(step4Reads(registered.calls).length, 0);
});


/* ── W0036：示例期调用矩阵——只新增目录 1 次与本人报名 1 次（真实近期活动），其余仍为 0 ─────── */

// W0037：社群从禁止列表移出（示例期恰好读 1 次，见下方 W0037 用例）。
const DEMO_FORBIDDEN = ["events", "registrations", "plan-read", "registered-any"];

test("W0036 in the demo: one catalogue and one own-registration read, real upcoming events reach the demo shell, nothing else real", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: "on" });
  const props = shellPropsOf(await page());
  assert.ok(props.guide, "the demo shell is rendered");
  // 既有的示例判定复合 home 读取：1 次，且不注入示例壳。
  assert.equal(calls.filter((call) => call.operation === "home").length, 1);
  assert.equal(props.home, null);
  // 本 Sprint 新增：目录 1 次、本人报名 1 次（以 canonical actor 读）。
  assert.equal(calls.filter((call) => call.operation === "catalogue").length, 1);
  const registrations = calls.filter((call) => call.operation === "demo-registrations");
  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0]!.input, ["account:canonical", ["event_01"]]);
  assert.deepEqual(calls.filter((call) => DEMO_FORBIDDEN.includes(call.operation)), []);
  assert.deepEqual(props.demoEventCandidates, [
    {
      endsAt: "2099-01-01T03:00:00.000Z",
      eventId: "event_01",
      publicCode: "CODE-event_01",
      startsAt: "2099-01-01T01:00:00.000Z",
      title: "未来活动",
      venue: "渋谷",
    },
  ]);
});

test("W0036 in the demo: a failed catalogue read leaves an empty list and the demo still renders", async (t) => {
  const { calls, page } = loadPage(t, { catalogue: "throw", contacts: 0, flag: "on" });
  const props = shellPropsOf(await page());
  assert.ok(props.guide);
  assert.deepEqual(props.demoEventCandidates, []);
  assert.equal(calls.filter((call) => call.operation === "demo-registrations").length, 0);
});

test("W0036 the demo list is capped at the pool limit (8), earliest first", async (t) => {
  const records = Array.from({ length: 12 }, (_, index) => ({
    id: `event:${String(12 - index).padStart(2, "0")}`,
    startsAt: `2099-01-${String(12 - index).padStart(2, "0")}T01:00:00.000Z`,
    title: `活动 ${12 - index}`,
  }));
  const { page } = loadPage(t, { catalogue: demoCatalogue(records), contacts: 0, flag: "on" });
  const props = shellPropsOf(await page());
  assert.deepEqual(
    (props.demoEventCandidates as Array<{ eventId: string }>).map((item) => item.eventId),
    ["event:01", "event:02", "event:03", "event:04", "event:05", "event:06", "event:07", "event:08"],
  );
});

test("W0036 the live path never reads the demo upcoming events", async (t) => {
  for (const scenario of [{ contacts: 0, flag: undefined }, LEGACY]) {
    const { calls, page } = loadPage(t, scenario);
    const props = shellPropsOf(await page());
    assert.equal(props.guide, null);
    assert.equal(calls.filter((call) => call.operation === "catalogue" || call.operation === "demo-registrations").length, 0);
    assert.ok(!("demoEventCandidates" in props) || props.demoEventCandidates === undefined);
  }
});


/* ── W0037：示例期再放开社群状态 1 次（canonical actor），只多给示例壳 `communityJoined` ─────── */

test("W0037 in the demo: the community state is read once for the canonical actor and handed to the demo shell", async (t) => {
  for (const communityJoined of [false, true]) {
    const { calls, page } = loadPage(t, { communityJoined, contacts: 0, flag: "on" });
    const props = shellPropsOf(await page());
    assert.ok(props.guide, "the demo shell is rendered");
    assert.deepEqual(communityReads(calls).map((call) => call.input), [[{ actorId: "account:canonical" }]]);
    assert.equal(props.communityJoined, communityJoined);
    // 其余矩阵不变：复合 home 1 次（不注入）、目录 1 次、本人报名 1 次、其余 0 次。
    assert.equal(calls.filter((call) => call.operation === "home").length, 1);
    assert.equal(props.home, null);
    assert.equal(calls.filter((call) => call.operation === "catalogue").length, 1);
    assert.equal(calls.filter((call) => call.operation === "demo-registrations").length, 1);
    assert.deepEqual(calls.filter((call) => DEMO_FORBIDDEN.includes(call.operation)), []);
    assert.deepEqual(props.viewModel, createOrbitAgentStarterViewModel());
    // 示例壳相对 W0036 只多收到 communityJoined。
    assert.deepEqual(Object.keys(props).sort(), ["communityJoined", "demoEventCandidates", "guide", "home", "initialPlanCard", "viewModel"]);
  }
});

/* ── W0040：首页那 1 次复合读取不再触发资料建议（整 workspace signal graph） ─────── */

const suggestionReads = (calls: Array<{ operation: string; input?: unknown }>) =>
  calls.filter((call) => call.operation === "profile-suggestions");

test("W0040 in the demo: still exactly one home read, no home in the demo shell, and zero profile suggestion reads", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: "on", throughRealHomeLoader: true });
  const props = shellPropsOf(await page());
  assert.ok(props.guide, "an empty goal keeps the user in the demo");
  assert.equal(calls.filter((call) => call.operation === "home").length, 1);
  assert.deepEqual(calls.filter((call) => call.operation === "home-real").map((call) => call.input), ["success"]);
  assert.equal(props.home, null);
  assert.deepEqual(suggestionReads(calls), []);
});

test("W0040 flag off: home, events, registrations and community once each, zero profile suggestion reads", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: undefined, throughRealHomeLoader: true });
  const props = shellPropsOf(await page());
  assert.equal(props.guide, null);
  for (const operation of ["home", "events", "registrations", "community"]) {
    assert.equal(calls.filter((call) => call.operation === operation).length, 1, operation);
  }
  assert.deepEqual(calls.filter((call) => call.operation === "home-real").map((call) => call.input), ["success"]);
  assert.deepEqual(suggestionReads(calls), []);
});

test("W0040 flag on + D2 legacy user with a goal: the real home, one home read, zero profile suggestion reads", async (t) => {
  const { calls, guideRecords, page } = loadPage(t, {
    contacts: 4,
    createdAt: "2026-06-01T00:00:00.000Z",
    flag: "on",
    goal: "推进日本合作",
    since: "2026-10-15",
    throughRealHomeLoader: true,
  });
  assert.equal(shellPropsOf(await page()).guide, null);
  assert.equal(guideRecords.get("account:canonical")?.grandfathered, true);
  assert.equal(calls.filter((call) => call.operation === "home").length, 1);
  assert.deepEqual(suggestionReads(calls), []);
});

/* ── W0041：示例期那 1 次首页读取不再组合联系人页模型（计数服务 1 次） ─────── */

test("W0041 in the demo: the one home read counts contacts through the summary service once and never composes the contacts page model", async (t) => {
  const listStacks: string[] = [];
  const listCreate = contactsListSearchAndFilterServiceFactory.create;
  t.mock.method(contactsListSearchAndFilterServiceFactory, "create", (mode?: string) => {
    listStacks.push(new Error().stack ?? "");
    return listCreate.call(contactsListSearchAndFilterServiceFactory, mode);
  });
  let summaryCreates = 0;
  const summaryCreate = homeContactsSummaryServiceFactory.create;
  t.mock.method(homeContactsSummaryServiceFactory, "create", (mode?: string) => {
    summaryCreates += 1;
    return summaryCreate.call(homeContactsSummaryServiceFactory, mode);
  });
  const { calls, page } = loadPage(t, { contacts: 0, flag: "on", throughRealHomeLoader: true });
  const props = shellPropsOf(await page());
  assert.ok(props.guide, "an empty goal keeps the user in the demo");
  assert.equal(props.home, null);
  assert.equal(calls.filter((call) => call.operation === "home").length, 1);
  assert.deepEqual(calls.filter((call) => call.operation === "home-real").map((call) => call.input), ["success"]);
  assert.equal(summaryCreates, 1, "the contacts summary service is resolved once");
  assert.equal(listStacks.filter((stack) => stack.includes("contacts-route-view-model")).length, 0, "no contacts page model composition");
  assert.deepEqual(suggestionReads(calls), []);
});
