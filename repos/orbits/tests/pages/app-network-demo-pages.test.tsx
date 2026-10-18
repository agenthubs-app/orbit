/**
 * W0005 页面级：人脉四个入口（所有人脉、概览／分析、关系管线、联系人详情）在示例模式开／关下
 * 读哪些数据、渲染什么。
 *
 * 用 require.cache 替换页面依赖（与 `app-agent-guide-demo-page.test.tsx` 同一写法）：真实的
 * 联系人读取（`loadContactCardRoute`、`loadAppContactsRouteViewModel`、`loadContactsAnalysis`、
 * `loadAppContactDetailRoute`）换成记录调用的桩；`_demo/demo-guide-view.ts` 用真实实现，
 * 只替换它底下的引导进度与本人资料读取。
 *   - 开关关（SC-01）：真实读取照常发生，引导进度与资料一个都不读，页面结构与改动前相同；
 *   - 开关开 + 在引导期（SC-02／SC-03）：真实读取一个都不调用，渲染示例外框与 30 位示例联系人；
 *   - `demo:` id（SC-03）：开关关或不在引导期一律 404，且不交给真实详情读取。
 * W0054：示例期「AI 人脉分析」三个标签渲染前端静态的完整示例快照（结构／机会／洞察），概览驾驶舱带示例快照句子；
 * 门槛读数、洞察标签与详情洞察读取同样算真实读取，示例期 0 次。
 */
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import type { ReactElement } from "react";

const root = join(fileURLToPath(import.meta.url), "../../..");
const require = createRequire(import.meta.url);

type PageName = "contacts" | "dashboard" | "detail" | "drilldown";

const PAGE_PATHS: Record<PageName, string> = {
  contacts: "app/(app)/app/contacts/page.tsx",
  dashboard: "app/(app)/app/contacts/dashboard/page.tsx",
  detail: "app/(app)/app/contacts/[id]/page.tsx",
  drilldown: "app/(app)/app/contacts/analysis/[dimension]/[bucketId]/page.tsx",
};

// R11b：分析页与下钻页的真实读取 = networkAnalysis（服务端加载器）/ count（下钻页的人数锁）。
const REAL_READS = ["cards", "contacts", "detail", "networkAnalysis", "count", "threshold", "insightDetail"];
const GUIDE_READS = ["profile", "guide"];

interface Scenario {
  flag?: string;
  /** readGuideStatusForActor 的结果：in-demo / out（已完成或老用户）。 */
  guide?: "in-demo" | "out";
  profileFails?: boolean;
  /** 界面语言（缺省 zh）。 */
  language?: "zh" | "en" | "ja";
}

function named<T extends (props: Record<string, unknown>) => null>(name: string, fn: T): T {
  Object.defineProperty(fn, "name", { value: name });
  return fn;
}

function loadPage(t: TestContext, name: PageName, scenario: Scenario = {}) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const stub = (operation: string, result: unknown) => async (...args: unknown[]) => {
    calls.push({ input: args, operation });
    return result;
  };
  const component = (label: string) => named(label, () => null);

  const previousFlag = process.env.ORBIT_GUIDE_DEMO;
  if (scenario.flag === undefined) delete process.env.ORBIT_GUIDE_DEMO;
  else process.env.ORBIT_GUIDE_DEMO = scenario.flag;

  const progress = {
    completed: 1,
    confirmedContacts: 3,
    nextStep: "goal",
    steps: { contacts: true, goal: false, plan: false },
  };
  const contactsSuccess = {
    payload: { availableFilters: { sources: [], statuses: [], values: [] }, contacts: [] },
    state: "success",
  };
  const detailSuccess = { routeState: "success" };

  const modules: Record<string, unknown> = {
    "next/navigation": {
      notFound: () => {
        calls.push({ operation: "notFound" });
        throw new Error("NEXT_NOT_FOUND");
      },
      redirect: (href: string) => {
        calls.push({ input: href, operation: "redirect" });
        throw new Error(`redirect:${href}`);
      },
    },
    [join(root, "auth.ts")]: { auth: stub("auth", { user: { email: "owner@example.test", id: "subject:external", name: "Owner" } }) },
    [join(root, "app/api/_shared/authenticated-actor.ts")]: { resolveAuthenticatedApiActorFromSession: stub("identity", { id: "account:canonical" }) },
    [join(root, "app/(app)/app/orbit-language-server.ts")]: {
      getOrbitServerLanguage: async () => scenario.language ?? "zh",
      localizeOrbitTree: (tree: unknown) => tree,
      makeOrbitServerT: () => (copy: { zh: string }) => copy.zh,
    },
    [join(root, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(root, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
    // 真实联系人读取：示例期间一个都不许调用。
    [join(root, "app/(app)/app/contacts/contact-card-route-service.ts")]: { loadContactCardRoute: stub("cards", null) },
    [join(root, "app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model.ts")]: {
      loadAppContactsRouteViewModel: stub("contacts", contactsSuccess),
    },
    [join(root, "app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter.ts")]: {
      contactsRouteToOrbitContactsViewModel: () => ({ connections: [], events: [], intros: [], pipelineStatuses: [] }),
    },
    [join(root, "app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter.tsx")]: {
      ContactsSubrouteStateBoundary: component("ContactsSubrouteStateBoundary"),
      contactsRouteToOrbitContactsViewModel: () => ({ connections: [], events: [], intros: [], pipelineStatuses: [] }),
    },
    [join(root, "app/(app)/app/orbit-contacts-presentation.ts")]: { applyOrbitContactsPresentation: (vm: unknown) => vm },
    [join(root, "app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts")]: {
      loadAppContactDetailRoute: stub("detail", detailSuccess),
      localizeAppContactDetailBoundaryModel: (model: unknown) => model,
    },
    [join(root, "app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-page-view-model.ts")]: {
      contactDetailPageViewModel: () => ({ connections: [{ id: "real-1" }] }),
    },
    // 人脉屏组件（桩，按名字在元素树里找）。
    [join(root, "app/(app)/app/contacts/network-0918/network-all.tsx")]: { NetworkAll: component("NetworkAll") },
    [join(root, "app/(app)/app/contacts/network-0918/network-cards.tsx")]: { NetworkCards: component("NetworkCards") },
    // R11b：新分析页 / 下钻页与它们的服务端读取（桩）。
    [join(root, "app/(app)/app/orbit-2026/network-analysis/NetworkAnalysisScreen.tsx")]: { NetworkAnalysisScreen: component("NetworkAnalysisScreen") },
    [join(root, "app/(app)/app/orbit-2026/network-analysis/NetworkAnalysisListScreen.tsx")]: { NetworkAnalysisListScreen: component("NetworkAnalysisListScreen") },
    [join(root, "features/network-analysis/analysis-page-loader.ts")]: {
      loadNetworkAnalysisPage: stub("networkAnalysis", { evidenceNames: {}, snapshot: null, view: { asOf: "2026-10-18T00:00:00.000Z", lock: { missing: 5, required: 10, state: "locked", total: 5 } } }),
    },
    [join(root, "features/network-analysis/analysis-handlers.ts")]: { resolveNetworkAnalysisReadDeps: async () => ({ readTotal: stub("count", 20) }) },
    [join(root, "app/(app)/app/contacts/network-0918/network-demo-frame.tsx")]: { NetworkDemoFrame: component("NetworkDemoFrame") },
    [join(root, "app/(app)/app/contacts/network-0918/network-shell.tsx")]: {
      NetworkShell: component("NetworkShell"),
    },
    // W0054：门槛读数、洞察标签与详情洞察（示例期间一个都不许调用）。
    [join(root, "features/network-analysis/analysis-threshold-reader.ts")]: {
      readAnalysisThreshold: stub("threshold", { confirmed: 5, met: true, missing: 0 }),
    },
    // 纯函数（查询解析、视图组装）照用真实实现，只把读取换成记录调用的桩。
    [join(root, "features/contacts/insights/read.ts")]: {
      readContactInsightDetail: stub("insightDetail", { goal: null, goalKnown: false, quotaExhausted: false, row: null }),
    },
    // 真实 demo-guide-view.ts 底下的两个来源：
    [join(root, "features/profile/service-factory.ts")]: {
      createProfileService: () => ({
        getProfile: async (input: unknown) => {
          calls.push({ input, operation: "profile" });
          if (scenario.profileFails) return { error: { message: "profile unavailable" }, success: false };
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

  const pagePath = join(root, PAGE_PATHS[name]);
  const guideViewPath = join(root, "app/(app)/app/_demo/demo-guide-view.ts");
  const ids = [...Object.keys(modules), pagePath, guideViewPath].map((id) => require.resolve(id));
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
  // R11a：详情页把旧详情拆到 legacy-detail-page.tsx，它也要按本次的替身重新加载。
  delete require.cache[require.resolve(join(root, "app/(app)/app/contacts/[id]/legacy-detail-page.tsx"))];
  delete require.cache[require.resolve(guideViewPath)];
  return {
    calls,
    page: require(pagePath).default as (props?: Record<string, unknown>) => Promise<ReactElement>,
  };
}

/** 页面返回的元素树里第一个名为 `name` 的组件元素的 props；没有返回 null。 */
function find(tree: ReactElement, name: string): Record<string, unknown> | null {
  const nodes: unknown[] = [tree];
  while (nodes.length) {
    const node = nodes.shift() as { props?: Record<string, unknown>; type?: unknown } | null;
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      nodes.push(...node);
      continue;
    }
    if (typeof node.type === "function" && (node.type as { name?: string }).name === name) return node.props ?? {};
    const children = node.props?.children;
    nodes.push(...(Array.isArray(children) ? children : [children]));
  }
  return null;
}

const operations = (calls: Array<{ operation: string }>, allowed: readonly string[]) =>
  calls.map((call) => call.operation).filter((operation) => allowed.includes(operation));

type DemoVm = { connections: Array<{ id: string; displayName: string }> };

/* ── SC-01：开关关闭 ───────────────────────────────────────────────── */

// R11a：/app/contacts 是新人脈页（NetworkScreen），服务端不读联系人（客户端走有界接口）；pipeline 已删除。
for (const [name, reads] of [
  ["contacts", []],
  ["dashboard", ["networkAnalysis"]],
] as const) {
  test(`flag off: /${name} reads real contacts as before and reads no guide state`, async (t) => {
    const { calls, page } = loadPage(t, name);
    const tree = await page({ searchParams: Promise.resolve({}) });
    assert.deepEqual(operations(calls, REAL_READS).sort(), [...reads].sort());
    assert.deepEqual(operations(calls, GUIDE_READS), []);
    assert.equal(find(tree, "NetworkDemoFrame"), null);
  });
}

test("flag off: a real contact detail id opens the new 人脈 page with the drawer (R11a), no server contact read, no guide read", async (t) => {
  const { calls, page } = loadPage(t, "detail");
  const tree = await page({ params: Promise.resolve({ id: "contact-1" }), searchParams: Promise.resolve({}) });
  assert.deepEqual(operations(calls, REAL_READS), []);
  assert.deepEqual(operations(calls, GUIDE_READS), []);
  assert.equal(find(tree, "NetworkDemoFrame"), null);
  assert.equal(find(tree, "NetworkScreen")?.initialContactId, "contact-1");
});

test("R11a: the meeting-memo / appointment deep links still use the old detail (events line)", async (t) => {
  const { calls, page } = loadPage(t, "detail");
  await page({ params: Promise.resolve({ id: "contact-1" }), searchParams: Promise.resolve({ capture: "meeting-memo", appointmentId: "a1", eventId: "e1" }) });
  assert.ok(operations(calls, REAL_READS).includes("detail"));
  assert.equal(calls.filter((call) => call.operation === "threshold").length, 1, "the old detail reads the threshold once");
});

test("demo: a real contact id redirects to the demo list before any real read", async (t) => {
  const { calls, page } = loadPage(t, "detail", { flag: "on" });
  await assert.rejects(page({ params: Promise.resolve({ id: "contact-1" }), searchParams: Promise.resolve({}) }), /redirect:\/app\/contacts$/);
  assert.deepEqual(operations(calls, REAL_READS), []);
  assert.deepEqual(operations(calls, GUIDE_READS), ["profile", "guide"]);
});

test("flag on but out of the guide: a real contact id takes the real path (one guide read is allowed)", async (t) => {
  const { calls, page } = loadPage(t, "detail", { flag: "on", guide: "out" });
  const tree = await page({ params: Promise.resolve({ id: "contact-1" }), searchParams: Promise.resolve({}) });
  assert.deepEqual(operations(calls, REAL_READS), []);
  assert.deepEqual(operations(calls, GUIDE_READS), ["profile", "guide"]);
  assert.equal(find(tree, "NetworkDemoFrame"), null);
  assert.ok(find(tree, "NetworkScreen"));
});

test("flag off: the analysis drill-down reads the real bucket and no guide state", async (t) => {
  const { calls, page } = loadPage(t, "drilldown");
  const tree = await page({ params: Promise.resolve({ bucketId: "b1", dimension: "industry" }) });
  assert.deepEqual(operations(calls, REAL_READS), ["count"]);
  assert.deepEqual(operations(calls, GUIDE_READS), []);
  assert.deepEqual(find(tree, "NetworkAnalysisListScreen")?.lock, { state: "open" });
});

test("demo: the analysis drill-down redirects back to the demo structure tab before any real read (W54-6: no demo list page)", async (t) => {
  const { calls, page } = loadPage(t, "drilldown", { flag: "on" });
  await assert.rejects(page({ params: Promise.resolve({ bucketId: "b1", dimension: "industry" }) }), /redirect:\/app\/contacts\/dashboard\?tab=structure$/);
  assert.deepEqual(operations(calls, REAL_READS), []);
});

test("flag on but out of the guide: the drill-down is the real page", async (t) => {
  const { calls, page } = loadPage(t, "drilldown", { flag: "on", guide: "out" });
  await page({ params: Promise.resolve({ bucketId: "b1", dimension: "industry" }) });
  assert.deepEqual(operations(calls, REAL_READS), ["count"]);
});

test("flag on but the user is out of the guide (done or grandfathered): real pages", async (t) => {
  for (const name of ["contacts", "dashboard"] as const) {
    const { calls, page } = loadPage(t, name, { flag: "on", guide: "out" });
    const tree = await page({ searchParams: Promise.resolve({}) });
    assert.equal(find(tree, "NetworkDemoFrame"), null, name);
    // R11a：人脈页的列表由客户端读（NetworkScreen），分析页仍在服务端读。
    if (name === "contacts") assert.ok(find(tree, "NetworkScreen"), name);
    else assert.ok(operations(calls, REAL_READS).length > 0, name);
  }
});

test("flag on but the profile goal cannot be read: fail closed to the real page", async (t) => {
  const { calls, page } = loadPage(t, "contacts", { flag: "on", profileFails: true });
  const tree = await page({ searchParams: Promise.resolve({}) });
  assert.equal(find(tree, "NetworkDemoFrame"), null);
  assert.deepEqual(operations(calls, GUIDE_READS), ["profile"]);
  assert.deepEqual(operations(calls, REAL_READS), []);
  assert.ok(find(tree, "NetworkScreen"));
});

/* ── SC-02／SC-03：开关开 + 在引导期 ───────────────────────────────── */

test("demo: /app/contacts renders 30 demo contacts and never calls a real contact loader", async (t) => {
  const { calls, page } = loadPage(t, "contacts", { flag: "on" });
  const tree = await page({ searchParams: Promise.resolve({ sourceGroup: "scan" }) });
  assert.deepEqual(operations(calls, REAL_READS), []);
  const frame = find(tree, "NetworkDemoFrame");
  assert.equal(frame?.route, "app-contacts-route");
  assert.deepEqual(frame?.guide, {
    bannerCollapsed: false,
    completed: 1,
    confirmedContacts: 3,
    nextStep: "goal",
    steps: { contacts: true, goal: false, plan: false },
  });
  const all = find(tree, "NetworkAll");
  const vm = all?.viewModel as DemoVm;
  assert.equal(vm.connections.length, 30);
  assert.ok(vm.connections.every((contact) => contact.id.startsWith("demo:")));
  assert.equal(all?.initialSource, "scan");
  // 引导判定以 canonical actor 进行，资料目标一并交给进度判定。
  assert.deepEqual(calls.find((call) => call.operation === "profile")?.input, { actorId: "account:canonical" });
  assert.deepEqual(calls.find((call) => call.operation === "guide")?.input, {
    actorId: "account:canonical",
    relationshipGoal: "",
    userId: "subject:external",
  });
});

test("demo: an unknown sourceGroup falls back to all sources", async (t) => {
  const { page } = loadPage(t, "contacts", { flag: "on" });
  const tree = await page({ searchParams: Promise.resolve({ sourceGroup: "bogus" }) });
  assert.equal(find(tree, "NetworkAll")?.initialSource, "all");
});

test("demo: /app/contacts/demo:wang-yan opens the full demo detail over the demo list, no real read", async (t) => {
  const { calls, page } = loadPage(t, "detail", { flag: "on" });
  const tree = await page({ params: Promise.resolve({ id: "demo%3Awang-yan" }), searchParams: Promise.resolve({}) });
  assert.deepEqual(operations(calls, REAL_READS), []);
  assert.equal(find(tree, "NetworkDemoFrame")?.route, "app-contact-detail-route");
  const all = find(tree, "NetworkAll");
  assert.equal((all?.viewModel as DemoVm).connections.length, 30);
  const detail = all?.openDetail as { closeHref: string; contact: { id: string; displayName: string; notes: unknown[] } };
  assert.equal(detail.closeHref, "/app/contacts");
  assert.equal(detail.contact.id, "demo:wang-yan");
  assert.equal(detail.contact.displayName, "王砚");
  assert.equal(detail.contact.notes.length, 2);
});

/* ── SC-03：demo: id 在非示例时 404 ─────────────────────────────────── */

test("flag off: /app/contacts/demo:* is a 404 and never reaches the real detail read", async (t) => {
  const { calls, page } = loadPage(t, "detail");
  await assert.rejects(page({ params: Promise.resolve({ id: "demo:wang-yan" }), searchParams: Promise.resolve({}) }), /NEXT_NOT_FOUND/);
  assert.deepEqual(operations(calls, REAL_READS), []);
  assert.deepEqual(operations(calls, GUIDE_READS), []);
});

test("flag on but out of the guide: /app/contacts/demo:* is a 404", async (t) => {
  const { calls, page } = loadPage(t, "detail", { flag: "on", guide: "out" });
  await assert.rejects(page({ params: Promise.resolve({ id: "demo%3Asato-misaki" }), searchParams: Promise.resolve({}) }), /NEXT_NOT_FOUND/);
  assert.deepEqual(operations(calls, REAL_READS), []);
});

test("demo: an unknown demo id is a 404 too", async (t) => {
  const { calls, page } = loadPage(t, "detail", { flag: "on" });
  await assert.rejects(page({ params: Promise.resolve({ id: "demo:nobody" }), searchParams: Promise.resolve({}) }), /NEXT_NOT_FOUND/);
  assert.deepEqual(operations(calls, REAL_READS), []);
});
test("R11b demo: the analysis page renders the new screen from the demo world (demo, no drill-down), with no real read", async (t) => {
  const { calls, page } = loadPage(t, "dashboard", { flag: "on" });
  const tree = await page({ searchParams: Promise.resolve({ tab: "opportunities" }) });
  const screen = find(tree, "NetworkAnalysisScreen");
  assert.equal(screen?.demo, true);
  assert.equal(screen?.initialTab, "opportunities");
  assert.equal(screen?.snapshot, null);
  const load = calls.find((call) => call.operation === "networkAnalysis");
  assert.ok(load && (load.input as unknown[])[2], "the demo load gets its own (fixture) reads");
  assert.deepEqual(operations(calls, ["cards", "contacts", "detail", "count", "threshold", "insightDetail"]), []);
});

