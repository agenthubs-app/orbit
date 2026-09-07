import assert from "node:assert/strict";
import test from "node:test";
import { act, create } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { createConfiguredMobileContactsDashboardService } from "../../features/mobile/contacts-dashboard-service";
import { createOpportunityReminderAnalyticsService } from "../../features/dashboard/service-factory";
import { contactsAnalysisToView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { ContactsAnalysisContent, ContactsAnalysisShell } from "../../app/(app)/app/contacts/analysis/contacts-analysis-workspace";
import { CrmSidebar } from "../../app/(app)/app/contacts/orbit-crm-sidebar";
import { OrbitRealCardsList } from "../../app/(app)/app/contacts/orbit-real-contacts";
import { loadAppContactsRouteViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { contactsRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";

async function fixture() {
  const result = await createConfiguredMobileContactsDashboardService("mock").getDashboard({ actorId: "analysis-test" });
  if (!result.success) throw new Error("Missing fixture");
  return result.data;
}

test("one analysis sidebar entry replaces the old graph/dashboard split, including empty legacy graph", () => {
  for (const counts of [{ list: 78 }, { list: 0 }]) {
    const html = renderToStaticMarkup(<CrmSidebar active="graph" counts={counts} />);
    assert.equal((html.match(/href="\/app\/contacts\/dashboard"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /href="\/app\/contacts\/graph"/);
    assert.match(html, /人脉分析/);
    assert.match(html, /全部人脉/);
  }
});

test("the contacts list exposes one analysis link in each desktop and narrow navigation", async () => {
  const previous = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_MODULE_MODE = "mock";
  try {
    const route = await loadAppContactsRouteViewModel(undefined, "analysis-test");
    if (route.state !== "success") throw new Error("Missing contacts fixture");
    const html = renderToStaticMarkup(<OrbitRealCardsList viewModel={contactsRouteToOrbitContactsViewModel(route)} />);
    assert.equal((html.match(/href="\/app\/contacts\/dashboard"/g) ?? []).length, 2);
    assert.doesNotMatch(html, /href="\/app\/contacts\/graph"/);
    assert.equal((html.match(/>人脉分析</g) ?? []).length, 2);
  } finally { if (previous === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previous; }
});

test("analysis keeps narrow-screen section navigation available when the sidebar is hidden", () => {
  const html = renderToStaticMarkup(<ContactsAnalysisShell><p>Analysis</p></ContactsAnalysisShell>);
  const navigation = html.match(/<nav[^>]*data-analysis-mobile-nav[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(navigation, "Missing contextual navigation");
  for (const path of ["/app/contacts", "/app/contacts/pipeline", "/app/contacts/dashboard", "/app/contacts/intros", "/app/contacts/all-actions"]) assert.ok(navigation.includes(`href="${path}"`));
  assert.doesNotMatch(navigation, /\/app\/contacts\/graph/);
});

test("tabs switch actual panels and all dimensions expose selectable buckets and detail links", async (t) => {
  const data = await fixture();
  const view = contactsAnalysisToView(data, "zh");
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<ContactsAnalysisContent initialView={view} />); });
  t.after(() => act(() => root.unmount()));
  assert.equal(root.root.findAllByProps({ role: "tab" }).length, 3);
  assert.ok(root.root.findByProps({ "data-analysis-metrics": true }));
  await act(async () => { root.root.findByProps({ "data-analysis-tab": "structure" }).props.onClick(); });
  for (const dimension of ["industry", "location", "role", "relationship"] as const) {
    await act(async () => { root.root.findByProps({ "data-analysis-dimension": dimension }).props.onClick(); });
    const buckets = root.root.findAll((node) => node.type === "button" && node.props["data-analysis-bucket"] !== undefined);
    if (!buckets.length) continue;
    await act(async () => { buckets[buckets.length - 1].props.onClick(); });
    assert.equal(buckets[buckets.length - 1].props["aria-pressed"], true);
    const detail = root.root.findByProps({ "data-analysis-detail": true });
    assert.ok(detail.props.href.startsWith(`/app/contacts/analysis/${dimension}/`));
  }
  await act(async () => { root.root.findByProps({ "data-analysis-tab": "opportunities" }).props.onClick(); });
  assert.ok(root.root.findByProps({ "data-analysis-opportunities": true }));
  assert.equal(root.root.findAllByProps({ "data-analysis-metrics": true }).length, 0);
});

test("unavailable coverage is visible, and failed refresh retains the previous data", async (t) => {
  const data = await fixture(); data.gaps = null;
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: false }, { status: 503 }));
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<ContactsAnalysisContent initialView={contactsAnalysisToView(data, "zh")} />); });
  t.after(() => act(() => root.unmount()));
  assert.ok(root.root.findByProps({ "data-analysis-unavailable": "coverage" }));
  await act(async () => { await root.root.findByProps({ "data-analysis-refresh": true }).props.onClick(); });
  assert.ok(root.root.findByProps({ role: "alert" }));
  assert.ok(root.root.findByProps({ "data-analysis-metrics": true }));
});

test("missing readable opportunity evidence is disclosed without inventing a source", async () => {
  const data = await fixture();
  assert.ok(data.opportunities);
  data.opportunities.highPriorityOpportunities = [{ ...data.opportunities.highPriorityOpportunities[0], actionBrief: undefined, sourceRefs: [{ id: "missing-label" }] }];
  const html = renderToStaticMarkup(<ContactsAnalysisContent initialView={contactsAnalysisToView(data, "zh")} initialTab="opportunities" />);
  assert.match(html, /data-analysis-evidence-unavailable/);
  assert.doesNotMatch(html, /missing-label/);
});

test("recompute checks the acknowledgement and only refreshes after success", async (t) => {
  const data = await fixture(); const calls: string[] = []; let succeed = false;
  const recomputed = await createOpportunityReminderAnalyticsService("mock").recomputeOpportunityReminderAnalytics();
  t.mock.method(globalThis, "fetch", async (path, init) => {
    calls.push(`${init?.method ?? "GET"} ${String(path)}`);
    return Response.json(String(path).includes("recompute") ? (succeed ? recomputed : { success: false }) : { success: true, data });
  });
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<ContactsAnalysisContent initialView={contactsAnalysisToView(data, "zh")} initialTab="opportunities" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => { await root.root.findByProps({ "data-analysis-recompute": true }).props.onClick(); });
  assert.deepEqual(calls, ["POST /api/dashboard/opportunities/recompute"]);
  assert.ok(root.root.findByProps({ role: "alert" }));
  succeed = true;
  await act(async () => { await root.root.findByProps({ "data-analysis-recompute": true }).props.onClick(); });
  assert.deepEqual(calls.slice(1), ["POST /api/dashboard/opportunities/recompute", "GET /api/mobile/contacts-dashboard"]);
  assert.equal(root.root.findAllByProps({ role: "alert" }).length, 0);
});

test("saving a goal updates the visible goal immediately and keeps it when refresh fails", async (t) => {
  const data = await fixture();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  t.mock.method(globalThis, "fetch", async (path) => String(path) === "/api/profile" ? Response.json({ success: true, data: { profile: { id: data.profile?.profile?.id, relationshipGoal: "认识东京制造业伙伴" } } }) : Response.json({ success: false }, { status: 503 }));
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<ContactsAnalysisContent initialView={contactsAnalysisToView(data, "zh")} />); });
  t.after(() => { act(() => root.unmount()); if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document"); });
  await act(async () => { root.root.findByProps({ "data-analysis-goal-edit": true }).props.onClick(); });
  await act(async () => { root.root.findByType("textarea").props.onChange({ target: { value: "认识东京制造业伙伴" } }); });
  await act(async () => { await root.root.findByProps({ "data-analysis-goal-save": true }).props.onClick(); });
  await act(async () => { await root.root.findByProps({ "data-analysis-refresh": true }).props.onClick(); });
  assert.equal(root.root.findAllByProps({ role: "dialog" }).length, 0);
  assert.ok(root.root.findAllByType("p").some((node) => node.children.includes("认识东京制造业伙伴")));
  assert.ok(root.root.findByProps({ role: "status" }));
  assert.ok(root.root.findByProps({ role: "alert" }));
});

test("goal save keeps its acknowledgement without an automatic stale dashboard read", async (t) => {
  const data = await fixture();
  const recomputed = await createOpportunityReminderAnalyticsService("mock").recomputeOpportunityReminderAnalytics();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (path) => {
    calls.push(String(path));
    return Response.json(String(path).includes("recompute") ? recomputed : String(path) === "/api/profile" ? { success: true, data: { profile: { id: data.profile?.profile?.id, relationshipGoal: "新目标" } } } : { success: true, data });
  });
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<ContactsAnalysisContent initialView={contactsAnalysisToView(data, "zh")} />); });
  t.after(() => { act(() => root.unmount()); if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document"); });
  await act(async () => { root.root.findByProps({ "data-analysis-goal-edit": true }).props.onClick(); });
  await act(async () => { root.root.findByType("textarea").props.onChange({ target: { value: "新目标" } }); });
  await act(async () => { await root.root.findByProps({ "data-analysis-goal-save": true }).props.onClick(); });
  assert.ok(root.root.findAllByType("p").some((node) => node.children.includes("新目标")));
  assert.deepEqual(calls, ["/api/profile"]);
  assert.ok(root.root.findByProps({ role: "status" }));
  await act(async () => { root.root.findByProps({ "data-analysis-tab": "opportunities" }).props.onClick(); });
  await act(async () => { await root.root.findByProps({ "data-analysis-recompute": true }).props.onClick(); });
  assert.equal(root.root.findAllByProps({ role: "status" }).length, 0);
  assert.deepEqual(calls.slice(1), ["/api/dashboard/opportunities/recompute", "/api/mobile/contacts-dashboard"]);
});
