import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { loadContactsAnalysis } from "../../app/(app)/app/contacts/analysis/contacts-analysis-route-service";
import type { ReactElement } from "react";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function loadDashboardPage(t: TestContext, options: { signedIn?: boolean; actorId?: string | null; confirmed?: number | null } = {}) {
  const calls: Array<{ operation: string; input?: unknown }> = [];
  const redirected = new Error("Test redirect");
  const modules: Record<string, unknown> = {
    "next/navigation": { redirect: (href: string) => { calls.push({ operation: "redirect", input: href }); throw redirected; } },
    [join(projectRoot, "auth.ts")]: { auth: async () => {
      calls.push({ operation: "auth" });
      return options.signedIn === false ? null : { user: { id: "auth:external", email: "account@example.test", name: "Account fixture" } };
    } },
    [join(projectRoot, "app/api/_shared/authenticated-actor.ts")]: { resolveAuthenticatedApiActorFromSession: async (input: unknown) => {
      calls.push({ operation: "resolveActor", input });
      return options.actorId === null ? null : { id: options.actorId ?? "account:canonical", email: "account@example.test", name: "Account fixture" };
    } },
    [join(projectRoot, "app/(app)/app/orbit-language-server.ts")]: { getOrbitServerLanguage: async () => { calls.push({ operation: "language" }); return "en"; }, localizeOrbitTree: (tree: unknown) => tree },
    [join(projectRoot, "features/mobile/contacts-dashboard-service.ts")]: { createConfiguredMobileContactsDashboardService: () => ({
      getDashboard: async (input: unknown) => {
        calls.push({ operation: "dashboard", input });
        return { success: false, error: { code: "MOBILE_CONTACTS_DASHBOARD_REQUIRED_SECTION_FAILED", section: "aggregate" } };
      },
    }) },
    // W0054：人脉分析门槛（与引导第 1 步同一计数）；null = 读失败。
    [join(projectRoot, "features/network-analysis/analysis-threshold-reader.ts")]: { readAnalysisThreshold: async (actorId: string) => {
      calls.push({ operation: "threshold", input: actorId });
      const confirmed = options.confirmed === undefined ? 5 : options.confirmed;
      return confirmed === null ? null : { confirmed, met: confirmed >= 3, missing: Math.max(0, 3 - confirmed) };
    } },
    [join(projectRoot, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(projectRoot, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
    [join(projectRoot, "app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model.ts")]: { loadAppContactsRouteViewModel: async (params: unknown, actorId: string) => {
      calls.push({ operation: "contacts", input: { actorId, params } });
      return { state: "success", payload: { availableFilters: { sources: [{ count: 31, label: "Business card", selected: false, value: "business_card_ocr" }, { count: 4, label: "Manual", selected: false, value: "manual" }], statuses: [], values: [] }, contacts: [] } };
    } },
    [join(projectRoot, "app/(app)/app/orbit-account-shell.tsx")]: { AccountTopNav: () => null },
    [join(projectRoot, "app/(app)/app/contacts/network-0918/network-overview.tsx")]: { NetworkOverview: () => null },
    [join(projectRoot, "app/(app)/app/contacts/network-0918/network-analysis.tsx")]: { NetworkAnalysis: () => null },
    [join(projectRoot, "features/relationship-strength/read-model.ts")]: {
      ensureRelationshipStrengthsForPage: async () => null,
      readRelationshipTierLookup: async () => { calls.push({ operation: "tierLookup" }); return new Map(); },
    },
    // W0052：概览驾驶舱附加数据（只在概览读）。
    [join(projectRoot, "app/(app)/app/contacts/analysis/overview-cockpit-loader.ts")]: { loadOverviewCockpit: async (input: { actorId: string; language: string; threshold?: unknown }) => {
      calls.push({ operation: "overviewCockpit", input: { actorId: input.actorId, language: input.language } });
      calls.push({ operation: "overviewThreshold", input: input.threshold });
      return {
        board: { active: [], core: [] },
        names: new Map(),
        pendingMatches: 0,
        plan: null,
        snapshot: { blocks: [], contactCount: 0, freshness: { job: "none", newContactCount: 0, stale: false }, generatedAt: null, state: "none" },
        timeline: { items: [], unavailable: false },
      };
    } },
    [join(projectRoot, "app/(app)/app/contacts/analysis/structure-tab-loader.ts")]: { loadStructureTabExtras: async (input: unknown) => {
      calls.push({ operation: "structureTab", input });
      return { highlights: null, snapshot: { state: "none" }, tierHistory: null };
    } },
    [join(projectRoot, "app/(app)/app/contacts/analysis/insights-tab.ts")]: { loadInsightsTab: async (input: { actorId: string; goal: Promise<string | null>; search: Record<string, unknown> }) => {
      calls.push({ operation: "insightsTab", input: { actorId: input.actorId, goal: await input.goal, search: input.search } });
      return { rows: [], state: "ready" };
    } },
    [join(projectRoot, "app/(app)/app/contacts/analysis/opportunities-route-service.ts")]: { loadOpportunitiesTab: async (input: { actorId: string; goal: Promise<string | null>; language: string; threshold?: unknown }) => {
      calls.push({ operation: "opportunitiesTab", input: { actorId: input.actorId, goal: await input.goal, language: input.language } });
      calls.push({ operation: "opportunitiesThreshold", input: input.threshold });
      return { coverage: { state: "no_plan" }, dormant: [], report: { state: "none" }, weekActions: { pendingMatches: null, planActions: [] } };
    } },
  };
  const pagePath = join(projectRoot, "app/(app)/app/contacts/dashboard/page.tsx");
  const routePath = join(projectRoot, "app/(app)/app/contacts/analysis/contacts-analysis-route-service.ts");
  const ids = [...Object.keys(modules), pagePath, routePath].map((id) => testRequire.resolve(id));
  const previous = new Map(ids.map((id) => [id, testRequire.cache[id]]));
  t.after(() => {
    for (const [id, cached] of previous) {
      if (cached) testRequire.cache[id] = cached;
      else delete testRequire.cache[id];
    }
  });
  for (const [id, exports] of Object.entries(modules)) {
    const resolved = testRequire.resolve(id);
    const replacement = new Module(resolved);
    replacement.filename = resolved;
    replacement.loaded = true;
    replacement.exports = exports;
    testRequire.cache[resolved] = replacement;
  }
  delete testRequire.cache[testRequire.resolve(pagePath)];
  delete testRequire.cache[testRequire.resolve(routePath)];
  const page = testRequire(pagePath).default as (input?: {
    searchParams?: Promise<{ tab?: string | string[] }>;
  }) => Promise<ReactElement<{ children: Array<ReactElement<{ children: Array<ReactElement<{ analysis: unknown; initialTab?: string; opportunities?: unknown; structureExtras?: unknown; insights?: unknown }>> }>> }>>;
  return { calls, page, redirected };
}

test("contacts dashboard loads analysis for the resolved account rather than the external auth identity", async (t) => {
  const { calls, page } = loadDashboardPage(t);
  const rendered = await page({ searchParams: Promise.resolve({ tab: "structure" }) });
  assert.deepEqual(calls, [
    { operation: "auth" },
    { operation: "resolveActor", input: { email: "account@example.test", name: "Account fixture", userId: "auth:external" } },
    { operation: "language" },
    { operation: "threshold", input: "account:canonical" },
    { operation: "dashboard", input: { actorId: "account:canonical" } },
    { operation: "contacts", input: { actorId: "account:canonical", params: {} } },
    { operation: "structureTab", input: { actorId: "account:canonical", language: "en", strengthState: null, threshold: { confirmed: 5, met: true, missing: 0 } } },
    { operation: "tierLookup" },
  ]);
  // 外层 div → [AccountTopNav, 屏组件]；?tab=structure 进分析子页并把同一份 analysis 传下去。
  const screen = rendered.props.children[2].props.children[1];
  assert.deepEqual(screen.props.analysis, { state: "error" });
  assert.equal(screen.props.initialTab, "struct");
});

test("W0050 (W50-5): only the open analysis tab loads its extra data — opportunities reads opportunities, structure reads structure, overview reads neither", async (t) => {
  const opportunities = loadDashboardPage(t);
  const rendered = await opportunities.page({ searchParams: Promise.resolve({ tab: "opportunities" }) });
  const ops = opportunities.calls.map((call) => call.operation);
  assert.ok(ops.includes("opportunitiesTab"));
  assert.ok(!ops.includes("structureTab"), "the opportunities tab does not load structure extras");
  assert.deepEqual(opportunities.calls.find((call) => call.operation === "opportunitiesTab")?.input, { actorId: "account:canonical", goal: null, language: "en" });
  const screen = rendered.props.children[2].props.children[1];
  assert.equal(screen.props.initialTab, "opp");
  assert.deepEqual(screen.props.opportunities, { coverage: { state: "no_plan" }, dormant: [], report: { state: "none" }, weekActions: { pendingMatches: null, planActions: [] } });
  assert.equal(screen.props.structureExtras, undefined);

  const structure = loadDashboardPage(t);
  await structure.page({ searchParams: Promise.resolve({ tab: "structure" }) });
  assert.ok(structure.calls.some((call) => call.operation === "structureTab"));
  assert.ok(!structure.calls.some((call) => call.operation === "opportunitiesTab"), "the structure tab does not read opportunity data");

  const overview = loadDashboardPage(t);
  await overview.page();
  assert.ok(!overview.calls.some((call) => call.operation === "structureTab" || call.operation === "opportunitiesTab" || call.operation === "insightsTab"));
  // W0052：概览只读驾驶舱附加数据；分析标签不读它。
  assert.ok(overview.calls.some((call) => call.operation === "overviewCockpit"));
  for (const tab of [structure, opportunities]) assert.ok(!tab.calls.some((call) => call.operation === "overviewCockpit"));
  assert.ok(!structure.calls.some((call) => call.operation === "insightsTab"));
  assert.ok(!opportunities.calls.some((call) => call.operation === "insightsTab"));
});

test("W0051 SC-03: ?tab=insight loads only the insights page (with its sort/filter params) and passes it to the third tab", async (t) => {
  const insight = loadDashboardPage(t);
  const rendered = await insight.page({ searchParams: Promise.resolve({ sort: "tier", tab: "insight", tier: "core" }) });
  const ops = insight.calls.map((call) => call.operation);
  assert.ok(ops.includes("insightsTab"));
  assert.ok(!ops.includes("structureTab") && !ops.includes("opportunitiesTab"));
  assert.deepEqual(insight.calls.find((call) => call.operation === "insightsTab")?.input, { actorId: "account:canonical", goal: null, search: { sort: "tier", tab: "insight", tier: "core" } });
  const screen = rendered.props.children[2].props.children[1];
  assert.equal(screen.props.initialTab, "insight");
  assert.deepEqual(screen.props.insights, { rows: [], state: "ready" });
});

test("contacts dashboard without a tab renders the overview screen for the resolved account", async (t) => {
  const { calls, page } = loadDashboardPage(t);
  const rendered = await page();
  // W0052：概览读驾驶舱附加数据，不再读本页档位表（档位与重点联系人来自全量分布与档位看板）。
  assert.deepEqual(calls.map((call) => call.operation), ["auth", "resolveActor", "language", "threshold", "dashboard", "contacts", "overviewCockpit", "overviewThreshold"]);
  assert.deepEqual(calls.find((call) => call.operation === "overviewCockpit")?.input, { actorId: "account:canonical", language: "en" });
  const screen = rendered.props.children[2].props.children[1] as unknown as ReactElement<{ analysis: unknown; initialTab?: string; overview: { sources: unknown; total: unknown; meta: unknown } }>;
  assert.deepEqual(screen.props.analysis, { state: "error" });
  assert.equal(screen.props.initialTab, undefined);
  // 「按来源」= 名单读取已有的全量分面（不是名单条数）；分析读失败时总数为 null，meta 说明来源不可用。
  assert.deepEqual(screen.props.overview.sources, { contact: 0, event: 0, other: 4, referral: 0, scan: 31 });
  assert.equal(screen.props.overview.total, null);
  assert.deepEqual(screen.props.overview.meta, { kind: "error" });
});

test("contacts dashboard redirects anonymous users before resolving an account or reading analysis", async (t) => {
  const { calls, page, redirected } = loadDashboardPage(t, { signedIn: false });
  await assert.rejects(page(), (error) => error === redirected);
  assert.deepEqual(calls, [
    { operation: "auth" },
    { operation: "redirect", input: "/app/account/login?next=%2Fapp%2Fcontacts%2Fdashboard" },
  ]);
});

test("contacts dashboard fails closed when a signed-in identity has no Orbit account", async (t) => {
  const { calls, page } = loadDashboardPage(t, { actorId: null });
  await assert.rejects(page(), /Authenticated Orbit account membership is unavailable/);
  assert.deepEqual(calls.map((call) => call.operation), ["auth", "resolveActor"]);
});

test("contacts analysis forwards each authenticated actor and rejects an empty actor", async () => {
  const seen: string[] = [];
  const service = { getDashboard: async ({ actorId }: { actorId: string }) => {
    seen.push(actorId);
    return { success: false as const, error: { code: "MOBILE_CONTACTS_DASHBOARD_REQUIRED_SECTION_FAILED" as const, section: "aggregate" as const } };
  } };
  for (const actorId of ["account:one", "account:two"]) {
    assert.equal((await loadContactsAnalysis(actorId, "zh", service)).state, "error");
  }
  assert.equal((await loadContactsAnalysis(" ", "zh", service)).state, "error");
  assert.deepEqual(seen, ["account:one", "account:two"]);
});

test("contacts dashboard has a real zero-data state and no demo metrics or people", () => {
  const dashboardSource = source(
    "app/(app)/app/contacts/orbit-real-cards-dashboard.tsx",
  );

  assert.match(dashboardSource, /data-orbit-contacts-dashboard-empty/);
  assert.match(dashboardSource, /viewModel\.connections/);
  assert.doesNotMatch(dashboardSource, /Emily Wong|佐藤花|陈伟|刘洋/);
  assert.doesNotMatch(dashboardSource, /value: "128"|128 contacts|共 128 位/);
});

test("contacts dashboard responsive roots do not occupy or flow beside each other", () => {
  const dashboardSource = source(
    "app/(app)/app/contacts/orbit-real-cards-dashboard.tsx",
  );

  assert.match(
    dashboardSource,
    /className="orbit-page orbit-desktop-only"/,
  );
  assert.match(
    dashboardSource,
    /className="orbit-mobile-only"[\s\S]*?flexDirection: "column"/,
  );
  assert.doesNotMatch(
    dashboardSource,
    /className="orbit-page" data-orbit-real-page="contacts-dashboard"/,
  );
});

/* ── W0054：门槛（已确认联系人 < 3）只换 AI 块 ───────────────────── */

test("W0054 SC-03: with 2 confirmed contacts every tab reads the threshold once for the canonical actor and passes it on; the insight tab reads no insights and gets a threshold card", async (t) => {
  for (const tab of ["structure", "opportunities", "insight", undefined] as const) {
    const loaded = loadDashboardPage(t, { confirmed: 2 });
    const rendered = await loaded.page(tab ? { searchParams: Promise.resolve({ tab }) } : undefined);
    assert.deepEqual(loaded.calls.filter((call) => call.operation === "threshold"), [{ operation: "threshold", input: "account:canonical" }], String(tab));
    const below = { confirmed: 2, met: false, missing: 1 };
    const screen = rendered.props.children[2].props.children[1] as unknown as ReactElement<Record<string, unknown>>;
    if (tab === "structure") assert.deepEqual((loaded.calls.find((call) => call.operation === "structureTab")?.input as { threshold: unknown }).threshold, below);
    if (tab === "opportunities") assert.deepEqual(loaded.calls.find((call) => call.operation === "opportunitiesThreshold")?.input, below);
    if (tab === undefined) assert.deepEqual(loaded.calls.find((call) => call.operation === "overviewThreshold")?.input, below);
    if (tab === "insight") {
      assert.ok(!loaded.calls.some((call) => call.operation === "insightsTab"), "no insight read below the threshold");
      assert.equal(screen.props.insights, undefined);
      assert.deepEqual(screen.props.insightGate, { kind: "threshold", missing: 1 });
    } else if (tab) {
      assert.equal(screen.props.insightGate, null);
    }
  }
});

test("W0054: a failed threshold read is treated as unknown — the insight tab still loads and shows no gate", async (t) => {
  const loaded = loadDashboardPage(t, { confirmed: null });
  const rendered = await loaded.page({ searchParams: Promise.resolve({ tab: "insight" }) });
  assert.ok(loaded.calls.some((call) => call.operation === "insightsTab"));
  const screen = rendered.props.children[2].props.children[1] as unknown as ReactElement<Record<string, unknown>>;
  assert.equal(screen.props.insightGate, null);
});
