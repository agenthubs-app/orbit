/**
 * W0004 SC-01 页面级：`/app/agent` 在开关关 / 开两种状态下下传给壳的 `guide`。
 *
 * 用 require.cache 替换页面的依赖（与 `app-canonical-agent-personal-scope.test.ts` 同一写法），
 * `features/guide/progress.ts` 用真实实现，只替换它底下的存储：
 *   - 开关关：`guide` 为 null，引导记录 / 联系人计数 / 计划一个都不读；
 *   - 开关开 + 新用户：`guide` 带进度（0 / 3，下一步名片），读取都以 canonical actor 进行；
 *   - 开关开 + D2 老用户：`guide` 为 null（真实首页）。
 *   - W0008 `?plan=<id>`：R25 起 v1 计划回答卡片删除，`?plan=` 不再读取、落在概览。
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
import { loadAppProfileRouteViewModel as realLoadAppProfileRouteViewModel } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
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
  const IOrbit2026 = (props: Record<string, unknown>) => {
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
    [join(root, "app/(app)/app/agent/iorbit-2026/IOrbit2026.tsx")]: { IOrbit2026 },
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
    // The page's one profile read: the demo check's goal and the live screen's greeting.
    [join(root, "app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model.ts")]: {
      loadAppProfileRouteViewModel: async (...args: unknown[]) => {
        calls.push({ input: args, operation: "profile" });
        if (scenario.throughRealHomeLoader) {
          const real = await realLoadAppProfileRouteViewModel(
            args[0] as Parameters<typeof realLoadAppProfileRouteViewModel>[0],
            args[1] as Parameters<typeof realLoadAppProfileRouteViewModel>[1],
          );
          calls.push({ input: real.state, operation: "profile-real" });
        }
        return { profile: { profile: { displayName: "Owner", relationshipGoal: scenario.goal ?? "" } }, state: "success" };
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
      // R22：引导进度也会问「有没有 v2 计划」（与 v1 同一后端）；替身里的后端是 mock，没有 v2 计划。
      resolvePlanBackend: () => ({ mode: "mock", service: { pool: null, referencesFor: () => ({ findMissingContactIds: async () => [], findMissingEventIds: async () => [] }), workspaceId: "workspace:test" }, success: true }),
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
    const screen = typeof node.type === "function" ? (node.type as { name?: string }).name : undefined;
    if (screen === "IOrbitShell" || screen === "IOrbit2026") {
      return { __screen: screen === "IOrbit2026" ? "live" : "demo", guide: null, ...node.props };
    }
    const children = node.props?.children;
    nodes.push(...(Array.isArray(children) ? children : [children]));
  }
  assert.fail("An iOrbit screen was not rendered");
}

const GUIDE_OPERATIONS = ["guide-state", "contacts", "plan", "account", "grandfathered"];

test("flag off: the shell gets no guide and not one guide source is read", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: undefined });
  const props = shellPropsOf(await page());
  assert.equal(props.__screen, "live");
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

test("2026-10-30: flag on + a new user still in the guide: the live iOrbit 2026, no guide source read, one profile read", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: "on" });
  const props = shellPropsOf(await page());
  assert.equal(props.__screen, "live");
  assert.deepEqual(calls.filter((call) => GUIDE_OPERATIONS.includes(call.operation)), []);
  assert.equal(calls.filter((call) => call.operation === "profile").length, 1);
  assert.equal(calls.filter((call) => call.operation === "home").length, 0);
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

/* ── W0008：?plan=<id>（R25 起不再读取） ──────────────────────────────── */

// R25：v1 计划回答卡片随 v1 计划界面删除。原三条 W0008 用例（读到卡片直接进对话、读不到落回概览、
// 示例期不读）改为这一条：带 `?plan=` 的旧链接落在概览、不读计划、壳不再收 `initialPlanCard`。
test("R25: ?plan=<id>&reveal=1 no longer reads a plan; the shell lands on the overview", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: undefined, plans: {} });
  const props = shellPropsOf(await page({ searchParams: Promise.resolve({ plan: "plan:any", reveal: "1" }) }));
  assert.equal(props.guide, null);
  assert.equal("initialDeepLink" in props, false);
  assert.equal("initialPlanCard" in props, false);
  assert.equal(calls.filter((call) => call.operation === "plan-read").length, 0);
});

/* ── W0014：示例期间 `/app/agent` 不读真实对话／首页业务数据，也不把它们交给示例壳 ─────── */

// W0037：示例期放开社群状态读取（恰好 1 次，单独断言），其余仍为 0。
const REAL_BUSINESS_READS = ["events", "registrations", "plan-read", "registered-any"];
const POLLUTED_VIEW_MODEL = {
  history: [],
  scenarios: {},
  suggests: [{ icon: "users", label: "约真实联系人甲斐真由美", q: "给甲斐真由美（真实公司）的草稿" }],
};

test("W0014 flag off: the live path reads the profile once and no home, events, registrations or community (legacy chat retired in 0104)", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: undefined });
  const props = shellPropsOf(await page());
  assert.equal(props.guide, null);
  assert.equal(calls.filter((call) => call.operation === "profile").length, 1);
  assert.equal(props.accountName, "Owner");
  // The live iOrbit 2026 screen shows none of these; they are not read for it.
  for (const operation of ["home", "events", "registrations", "community"]) {
    assert.equal(calls.filter((call) => call.operation === operation).length, 0, operation);
  }
  assert.deepEqual(calls.filter((call) => GUIDE_OPERATIONS.includes(call.operation)), []);
  // Sprint 0104: the welcome suggests come from the fixed starter view model, never from a server read.
  assert.equal("viewModel" in props, false);
});

/* ── W0035：首页第 4 步提醒删除后，hasAnyActiveRegistration 在任何情况下都是 0 次 ─────── */

const step4Reads = (calls: Array<{ operation: string; input?: unknown }>) =>
  calls.filter((call) => call.operation === "registered-any");
const communityReads = (calls: Array<{ operation: string; input?: unknown }>) =>
  calls.filter((call) => call.operation === "community");

test("W0035 flag off: guideEnabled false, no guideStep4Pending prop, community never read, hasAnyActiveRegistration never called", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 4, flag: undefined, registeredAny: "throw" });
  const props = shellPropsOf(await page());
  assert.equal(props.__screen, "live");
  assert.equal("guideEnabled" in props, false);
  assert.ok(!("guideStep4Pending" in props));
  assert.equal(step4Reads(calls).length, 0);
  assert.equal(communityReads(calls).length, 0);
});

const LEGACY = { contacts: 4, createdAt: "2026-06-01T00:00:00.000Z", flag: "on", goal: "推进日本合作", since: "2026-10-15" } as const;

test("W0035 flag on, out of the demo, nothing joined or registered: no guideEnabled prop, community never read, zero hasAnyActiveRegistration", async (t) => {
  const { calls, page } = loadPage(t, { ...LEGACY, homeEvents: ["ev-1"], registeredAny: "throw" });
  const props = shellPropsOf(await page());
  assert.equal(props.guide, null);
  assert.equal(props.__screen, "live");
  assert.equal("guideEnabled" in props, false);
  assert.ok(!("guideStep4Pending" in props));
  assert.equal(step4Reads(calls).length, 0);
  assert.equal(communityReads(calls).length, 0);
});

test("W0035 flag on: joined or registered changes nothing about step-4 reads (still zero)", async (t) => {
  const joined = loadPage(t, { ...LEGACY, communityJoined: true });
  const joinedProps = shellPropsOf(await joined.page());
  assert.equal(joinedProps.__screen, "live");
  assert.equal("guideEnabled" in joinedProps, false);
  assert.ok(!("guideStep4Pending" in joinedProps));
  assert.equal(step4Reads(joined.calls).length, 0);
  assert.equal(communityReads(joined.calls).length, 0);

  const registered = loadPage(t, { ...LEGACY, homeEvents: ["ev-1", "ev-2"], registeredEvents: ["ev-2"], registeredAny: true });
  assert.ok(!("guideStep4Pending" in shellPropsOf(await registered.page())));
  assert.equal(step4Reads(registered.calls).length, 0);
});


/* ── W0036：示例期调用矩阵——只新增目录 1 次与本人报名 1 次（真实近期活动），其余仍为 0 ─────── */

// W0037：社群从禁止列表移出（示例期恰好读 1 次，见下方 W0037 用例）。
const DEMO_FORBIDDEN = ["events", "registrations", "plan-read", "registered-any"];

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

/* ── W0040：首页那 1 次复合读取不再触发资料建议（整 workspace signal graph） ─────── */

const suggestionReads = (calls: Array<{ operation: string; input?: unknown }>) =>
  calls.filter((call) => call.operation === "profile-suggestions");

test("W0040 flag off: one profile read and no home, events, registrations or community, zero profile suggestion reads", async (t) => {
  const { calls, page } = loadPage(t, { contacts: 0, flag: undefined, throughRealHomeLoader: true });
  const props = shellPropsOf(await page());
  assert.equal(props.guide, null);
  for (const operation of ["home", "events", "registrations", "community"]) {
    assert.equal(calls.filter((call) => call.operation === operation).length, 0, operation);
  }
  assert.deepEqual(calls.filter((call) => call.operation === "profile-real").map((call) => call.input), ["success"]);
  assert.deepEqual(suggestionReads(calls), []);
});

/* ── W0041：示例期不读首页数据（2026-10-28 起示例判定只读本人资料），联系人计数与页模型都不组合 ─────── */

