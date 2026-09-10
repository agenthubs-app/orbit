import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function loadDashboardPage(t: TestContext, options: { signedIn?: boolean; actorId?: string | null } = {}) {
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
    [join(projectRoot, "app/(app)/app/orbit-language-server.ts")]: { getOrbitServerLanguage: async () => { calls.push({ operation: "language" }); return "en"; } },
    [join(projectRoot, "features/mobile/contacts-dashboard-service.ts")]: { createConfiguredMobileContactsDashboardService: () => ({
      getDashboard: async (input: unknown) => {
        calls.push({ operation: "dashboard", input });
        return { success: false, error: { code: "MOBILE_CONTACTS_DASHBOARD_REQUIRED_SECTION_FAILED", section: "aggregate" } };
      },
    }) },
    [join(projectRoot, "app/(app)/app/orbit-reference-styles.tsx")]: { OrbitReferenceStyles: () => null },
    [join(projectRoot, "app/(app)/app/orbit-visual-freeze-runtime.tsx")]: { OrbitVisualFreezeRuntime: () => null },
    [join(projectRoot, "app/(app)/app/contacts/analysis/contacts-analysis-workspace.tsx")]: { ContactsAnalysisWorkspace: () => null },
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
  }) => Promise<ReactElement<{ children: Array<ReactElement<{ initialView: unknown; initialTab: string }>> }>>;
  return { calls, page, redirected };
}

test("contacts dashboard loads analysis for the resolved account rather than the external auth identity", async (t) => {
  const { calls, page } = loadDashboardPage(t);
  const rendered = await page({ searchParams: Promise.resolve({ tab: "structure" }) });
  assert.deepEqual(calls, [
    { operation: "auth" },
    { operation: "resolveActor", input: { email: "account@example.test", name: "Account fixture", userId: "auth:external" } },
    { operation: "language" },
    { operation: "dashboard", input: { actorId: "account:canonical" } },
  ]);
  assert.deepEqual(rendered.props.children[2].props.initialView, { state: "error" });
  assert.equal(rendered.props.children[2].props.initialTab, "structure");
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
