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

type PageName = "contacts" | "dashboard" | "pipeline" | "detail" | "drilldown";

const PAGE_PATHS: Record<PageName, string> = {
  contacts: "app/(app)/app/contacts/page.tsx",
  dashboard: "app/(app)/app/contacts/dashboard/page.tsx",
  detail: "app/(app)/app/contacts/[id]/page.tsx",
  drilldown: "app/(app)/app/contacts/analysis/[dimension]/[bucketId]/page.tsx",
  pipeline: "app/(app)/app/contacts/pipeline/page.tsx",
};

const REAL_READS = ["cards", "contacts", "analysis", "detail", "structure", "structureTab", "opportunitiesTab", "overviewCockpit", "threshold", "insightsTab", "insightDetail"];
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
    [join(root, "app/(app)/app/contacts/analysis/contacts-analysis-route-service.ts")]: { loadContactsAnalysis: stub("analysis", { state: "pending" }) },
    // W0049／W0050：分析子页两个标签的附加读取（示例期间同样一个都不许调用）。
    [join(root, "app/(app)/app/contacts/analysis/structure-tab-loader.ts")]: { loadStructureTabExtras: stub("structureTab", undefined) },
    [join(root, "app/(app)/app/contacts/analysis/opportunities-route-service.ts")]: { loadOpportunitiesTab: stub("opportunitiesTab", undefined) },
    // W0052：概览驾驶舱附加数据（快照、时间线、计划……）：示例期间一个都不许调用。
    [join(root, "app/(app)/app/contacts/analysis/overview-cockpit-loader.ts")]: {
      loadOverviewCockpit: stub("overviewCockpit", {
        board: null, names: null, pendingMatches: null, plan: undefined,
        snapshot: { blocks: [], contactCount: 0, freshness: { job: "none", newContactCount: 0, stale: false }, generatedAt: null, state: "unavailable" },
        timeline: null,
      }),
    },
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
    [join(root, "app/(app)/app/contacts/network-0918/network-overview.tsx")]: { NetworkOverview: component("NetworkOverview") },
    [join(root, "app/(app)/app/contacts/network-0918/network-analysis.tsx")]: { NetworkAnalysis: component("NetworkAnalysis") },
    [join(root, "app/(app)/app/contacts/network-0918/network-pipeline.tsx")]: { NetworkPipeline: component("NetworkPipeline") },
    [join(root, "app/(app)/app/contacts/network-0918/network-demo-frame.tsx")]: { NetworkDemoFrame: component("NetworkDemoFrame") },
    [join(root, "app/(app)/app/contacts/network-0918/network-shell.tsx")]: {
      NetworkShell: component("NetworkShell"),
    },
    // W0054：门槛读数、洞察标签与详情洞察（示例期间一个都不许调用）。
    [join(root, "features/network-analysis/analysis-threshold-reader.ts")]: {
      readAnalysisThreshold: stub("threshold", { confirmed: 5, met: true, missing: 0 }),
    },
    // 纯函数（查询解析、视图组装）照用真实实现，只把读取换成记录调用的桩。
    [join(root, "app/(app)/app/contacts/analysis/insights-tab.ts")]: {
      ...(require(join(root, "app/(app)/app/contacts/analysis/insights-tab.ts")) as Record<string, unknown>),
      loadInsightsTab: stub("insightsTab", undefined),
    },
    [join(root, "features/contacts/insights/read.ts")]: {
      readContactInsightDetail: stub("insightDetail", { goal: null, goalKnown: false, quotaExhausted: false, row: null }),
    },
    [join(root, "app/(app)/app/contacts/analysis/contacts-structure-route-service.ts")]: { loadContactsStructureDetail: stub("structure", { state: "pending" }) },
    [join(root, "app/(app)/app/contacts/analysis/contacts-structure-detail.tsx")]: { ContactsStructureDetail: component("ContactsStructureDetail") },
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

for (const [name, reads] of [
  ["contacts", ["cards", "contacts"]],
  ["dashboard", ["analysis", "contacts", "overviewCockpit", "threshold"]],
  ["pipeline", ["contacts", "analysis"]],
] as const) {
  test(`flag off: /${name} reads real contacts as before and reads no guide state`, async (t) => {
    const { calls, page } = loadPage(t, name);
    const tree = await page({ searchParams: Promise.resolve({}) });
    assert.deepEqual(operations(calls, REAL_READS).sort(), [...reads].sort());
    assert.deepEqual(operations(calls, GUIDE_READS), []);
    assert.equal(find(tree, "NetworkDemoFrame"), null);
  });
}

test("flag off: a real contact detail id goes through the real detail read, no guide read", async (t) => {
  const { calls, page } = loadPage(t, "detail");
  const tree = await page({ params: Promise.resolve({ id: "contact-1" }), searchParams: Promise.resolve({}) });
  // W0054：门槛整页读一次（列表与详情共用），达到 3 位才读洞察。
  assert.deepEqual(operations(calls, REAL_READS), ["detail", "threshold", "cards", "contacts", "insightDetail"]);
  assert.deepEqual(operations(calls, GUIDE_READS), []);
  assert.equal(find(tree, "NetworkDemoFrame"), null);
  assert.ok(find(tree, "NetworkAll"));
});

test("W0054 review P3-2: the real detail page reads the threshold count once and hands the same result to the list loader (+1 statement, not +2)", async (t) => {
  const { calls, page } = loadPage(t, "detail");
  await page({ params: Promise.resolve({ id: "contact-1" }), searchParams: Promise.resolve({}) });
  assert.equal(calls.filter((call) => call.operation === "threshold").length, 1);
  const cardsCall = calls.find((call) => call.operation === "cards")!;
  const options = (cardsCall.input as unknown[])[2] as { readThreshold?: (actorId: string) => Promise<unknown> };
  assert.equal(typeof options?.readThreshold, "function", "the list loader gets the page's threshold");
  assert.deepEqual(await options.readThreshold!("account:canonical"), { confirmed: 5, met: true, missing: 0 });
  assert.equal(calls.filter((call) => call.operation === "threshold").length, 1, "reusing it reads nothing more");
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
  assert.deepEqual(operations(calls, REAL_READS), ["detail", "threshold", "cards", "contacts", "insightDetail"]);
  assert.deepEqual(operations(calls, GUIDE_READS), ["profile", "guide"]);
  assert.equal(find(tree, "NetworkDemoFrame"), null);
});

test("flag off: the analysis drill-down reads the real bucket and no guide state", async (t) => {
  const { calls, page } = loadPage(t, "drilldown");
  const tree = await page({ params: Promise.resolve({ bucketId: "b1", dimension: "industry" }) });
  assert.deepEqual(operations(calls, REAL_READS), ["structure"]);
  assert.deepEqual(operations(calls, GUIDE_READS), []);
  assert.ok(find(tree, "ContactsStructureDetail"));
});

test("demo: the analysis drill-down redirects back to the demo structure tab before any real read (W54-6: no demo list page)", async (t) => {
  const { calls, page } = loadPage(t, "drilldown", { flag: "on" });
  await assert.rejects(page({ params: Promise.resolve({ bucketId: "b1", dimension: "industry" }) }), /redirect:\/app\/contacts\/dashboard\?tab=structure$/);
  assert.deepEqual(operations(calls, REAL_READS), []);
});

test("flag on but out of the guide: the drill-down is the real page", async (t) => {
  const { calls, page } = loadPage(t, "drilldown", { flag: "on", guide: "out" });
  await page({ params: Promise.resolve({ bucketId: "b1", dimension: "industry" }) });
  assert.deepEqual(operations(calls, REAL_READS), ["structure"]);
});

test("flag on but the user is out of the guide (done or grandfathered): real pages", async (t) => {
  for (const name of ["contacts", "dashboard", "pipeline"] as const) {
    const { calls, page } = loadPage(t, name, { flag: "on", guide: "out" });
    const tree = await page({ searchParams: Promise.resolve({}) });
    assert.equal(find(tree, "NetworkDemoFrame"), null, name);
    assert.ok(operations(calls, REAL_READS).length > 0, name);
  }
});

test("flag on but the profile goal cannot be read: fail closed to the real page", async (t) => {
  const { calls, page } = loadPage(t, "contacts", { flag: "on", profileFails: true });
  const tree = await page({ searchParams: Promise.resolve({}) });
  assert.equal(find(tree, "NetworkDemoFrame"), null);
  assert.deepEqual(operations(calls, GUIDE_READS), ["profile"]);
  assert.deepEqual(operations(calls, REAL_READS), ["cards", "contacts"]);
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

test("demo: the overview renders demo contacts + demo analysis without loadContactsAnalysis / loadAppContactsRouteViewModel", async (t) => {
  const { calls, page } = loadPage(t, "dashboard", { flag: "on" });
  const tree = await page({ searchParams: Promise.resolve({}) });
  assert.deepEqual(operations(calls, REAL_READS), []);
  assert.equal(find(tree, "NetworkDemoFrame")?.route, "app-contacts-dashboard-route");
  const overview = find(tree, "NetworkOverview");
  assert.equal((overview?.analysis as { state: string }).state, "ready");
  // W0052：示例驾驶舱 = 示例数字与示例档位、动态（双语）；快照、时间线、计划读取 0 次（overviewCockpit 不在 calls 里）。
  // W0054：句子来自示例静态快照（诊断、第一条有据的缺口补法、本周计划句）与待唤醒数字模板。
  const data = overview?.overview as { total: number; meta: unknown; cards: Array<{ n: number | null; sentence: unknown }>; tiers: Array<{ id: string; count: number }>; activity: { state: string; rows: Array<{ name: string }> } };
  assert.equal(data.total, 30);
  assert.deepEqual(data.cards.map((card) => card.n), [30, 3, 6, 3]);
  assert.deepEqual(data.cards.map((card) => (card.sentence as { zh: string } | null)?.zh ?? null), [
    "能直接推进试用的 IT 负责人目前只有铃木健和佐藤美咲，渠道代理和商会方面的关键人脉还很薄。",
    "铃木健、佐藤美咲已经对上；还缺人，可以请王砚引荐北辰精工的 IT 决策人。",
    "本周先见王砚、约佐藤美咲聊试用，再请中村惠推荐试点企业。",
    "3 位曾有往来、60 天没有新记录",
  ]);
  assert.deepEqual(data.tiers.map((tier) => [tier.id, tier.count]), [["new", 9], ["active", 13], ["core", 5], ["dormant", 3]]);
  assert.deepEqual(data.activity.rows.map((row) => row.name), ["铃木健", "高桥由美", "王砚", "佐藤美咲", "中村惠"]);
});

test("demo (ja, review P2): the overview falls back to the English demo data like t() does", async (t) => {
  const { calls, page } = loadPage(t, "dashboard", { flag: "on", language: "ja" });
  const tree = await page({ searchParams: Promise.resolve({}) });
  assert.deepEqual(operations(calls, REAL_READS), []);
  const data = find(tree, "NetworkOverview")?.overview as { activity: { rows: Array<{ name: string; summary: { en: string } }> } };
  assert.deepEqual(data.activity.rows.map((row) => row.name), ["Suzuki Ken", "Takahashi Yumi", "Wang Yan", "Sato Misaki", "Nakamura Megumi"]);
});

test("W0054 SC-04: the three demo analysis tabs render the static demo snapshot through the real NetworkAnalysis with zero real reads", async (t) => {
  type Props = {
    analysis: { state: string; structure: { data: { dimensions: Record<string, Array<{ id: string; count: number; children?: unknown[] }>> } }; goal: { data: { canEdit: boolean } } };
    initialTab: string;
    structureExtras?: { gate: unknown; snapshot: { state: string; diagnosis: { text: string; evidence: Array<{ id: string }> } | null; insights: Array<{ evidence: Array<{ id: string }> }> }; highlights: { primary: string[] }; tierHistory: unknown };
    opportunities?: { gate: unknown; coverage: { state: string; percent: number; needs: Array<{ needId: string; have: number; target: number; missing: number; gapNote?: { text: string; evidence: Array<{ id: string }> } }> }; weekActions: { planActions: Array<{ href: string }> }; dormant: Array<{ contactId: string; draftAvailable: boolean }>; report: { state: string; blocks: unknown[]; contactCount: number } };
    insights?: { state: string; total: number; rows: Array<{ contactId: string; insight: { state: string; goalRelation: { zh: string; en: string } } }>; hasGoal: boolean };
    insightGate?: unknown;
  };
  const tabs = { insight: "insight", opportunities: "opp", structure: "struct" } as const;
  for (const [tab, key] of Object.entries(tabs)) {
    const { calls, page } = loadPage(t, "dashboard", { flag: "on" });
    const tree = await page({ searchParams: Promise.resolve({ tab }) });
    assert.deepEqual(operations(calls, REAL_READS), [], `${tab}: zero real reads (analysis, route model, snapshot/insight loaders, threshold)`);
    assert.ok(find(tree, "NetworkDemoFrame"), tab);
    const props = find(tree, "NetworkAnalysis") as unknown as Props;
    assert.ok(props, tab);
    assert.equal(props.initialTab, key);
    assert.equal(props.analysis.state, "ready");
    assert.equal(props.analysis.goal.data.canEdit, false, "the demo goal is read-only");
    if (tab === "structure") {
      const dims = props.analysis.structure.data.dimensions;
      for (const dimension of ["industry", "region", "seniority", "tier"]) {
        assert.ok(dims[dimension]!.length > 0, dimension);
        assert.equal(dims[dimension]!.reduce((sum, bucket) => sum + bucket.count, 0), 30, `${dimension} covers all 30 demo contacts`);
      }
      assert.ok(dims.industry!.some((bucket) => (bucket.children ?? []).length > 0), "industry has a second level");
      const extras = props.structureExtras!;
      assert.equal(extras.gate, null);
      assert.equal(extras.snapshot.state, "ready");
      assert.ok(extras.snapshot.diagnosis?.text);
      assert.ok(extras.snapshot.insights.length >= 2 && extras.snapshot.insights.length <= 3);
      const evidence = [extras.snapshot.diagnosis!, ...extras.snapshot.insights].flatMap((block) => block.evidence.map((person) => person.id));
      assert.ok(evidence.length > 0 && evidence.every((id) => id.startsWith("demo:")), "evidence points at demo contacts");
      assert.ok(extras.highlights.primary.length > 0);
      assert.ok(extras.tierHistory);
    }
    if (tab === "opportunities") {
      const view = props.opportunities!;
      assert.equal(view.gate, null);
      assert.equal(view.coverage.state, "ready");
      assert.deepEqual(view.coverage.needs.map((need) => [need.needId, need.have, need.target, need.missing]), [["demo-need-it", 2, 3, 1], ["demo-need-channel", 1, 3, 2], ["demo-need-chamber", 0, 2, 2]]);
      assert.ok(view.coverage.needs.every((need) => need.gapNote && need.gapNote.evidence.every((person) => person.id.startsWith("demo:"))), "every need has a demo gap note with evidence");
      assert.ok(view.weekActions.planActions.length > 0 && view.weekActions.planActions.every((action) => action.href.startsWith("/app/agent/plan#plan-action-")));
      assert.ok(view.dormant.length > 0 && view.dormant.every((row) => row.contactId.startsWith("demo:") && row.draftAvailable));
      assert.equal(view.report.state, "ready");
      assert.equal(view.report.contactCount, 30);
    }
    if (tab === "insight") {
      const view = props.insights!;
      assert.equal(view.state, "ready");
      assert.equal(view.hasGoal, true);
      assert.equal(view.total, 30);
      assert.equal(view.rows.length, 30);
      assert.ok(view.rows.every((row) => row.contactId.startsWith("demo:") && row.insight.state === "ready" && row.insight.goalRelation.zh && row.insight.goalRelation.en));
      assert.equal(props.insightGate, undefined);
    }
  }
});

test("W0054 SC-04: demo insight tab sorts and filters by URL like the real tab (tier / region / industry), still with zero reads", async (t) => {
  const { calls, page } = loadPage(t, "dashboard", { flag: "on", language: "en" });
  const tree = await page({ searchParams: Promise.resolve({ country: "CN", tab: "insight" }) });
  assert.deepEqual(operations(calls, REAL_READS), []);
  const insights = (find(tree, "NetworkAnalysis") as { insights: { rows: Array<{ name: string }>; total: number; query: { country: string } } }).insights;
  assert.equal(insights.query.country, "CN");
  assert.deepEqual(insights.rows.map((row) => row.name), ["Zhang Hao"]);
  const byTier = (find(await loadPage(t, "dashboard", { flag: "on" }).page({ searchParams: Promise.resolve({ tab: "insight", tier: "core" }) }), "NetworkAnalysis") as { insights: { rows: Array<{ tier: string }> } }).insights;
  assert.ok(byTier.rows.length > 0 && byTier.rows.every((row) => row.tier === "core"));
  const recent = (find(await loadPage(t, "dashboard", { flag: "on" }).page({ searchParams: Promise.resolve({ sort: "recent", tab: "insight" }) }), "NetworkAnalysis") as { insights: { rows: Array<{ contactId: string }> } }).insights;
  assert.ok(["demo:wang-yan", "demo:suzuki-ken", "demo:takahashi-yumi"].includes(recent.rows[0]!.contactId), "most recent contact first");
  const industry = (find(await loadPage(t, "dashboard", { flag: "on" }).page({ searchParams: Promise.resolve({ industry: "finance_investment", tab: "insight" }) }), "NetworkAnalysis") as { insights: { rows: Array<{ contactId: string }> } }).insights;
  assert.deepEqual(industry.rows.map((row) => row.contactId), ["demo:chen-siyuan"]);
});

test("demo: the pipeline renders demo data without a real loader", async (t) => {
  const { calls, page } = loadPage(t, "pipeline", { flag: "on" });
  const tree = await page({ searchParams: Promise.resolve({}) });
  assert.deepEqual(operations(calls, REAL_READS), []);
  assert.equal(find(tree, "NetworkDemoFrame")?.route, "app-contacts-pipeline-route");
  const pipeline = find(tree, "NetworkPipeline");
  assert.equal((pipeline?.viewModel as DemoVm).connections.length, 30);
  assert.equal((pipeline?.analysis as { state: string }).state, "ready");
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
