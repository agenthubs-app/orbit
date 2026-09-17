import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ContactRelationshipInitializationPanel, useContactRelationshipInitialization } from "../../app/(app)/app/contacts/contact-relationship-initialization";
import { hasPendingInitialization } from "../../app/(app)/app/contacts/contact-relationship-initialization-view-model";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";
import { contactsRouteToOrbitContactsViewModel as listAdapter } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";
import { contactsRouteToOrbitContactsViewModel as pipelineAdapter } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter";
import type { AppContactsPayloadViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";

const id = "contact:test/one";
const revision = "a".repeat(64);
const pending = () => Response.json({ success: true, data: { state: "pending", revision, connectionId: "connection:one" } });
const snapshot = (stage = "active", goal: string | null = "Build a partnership") => ({
  connection: { actorId: "owner:one", contactId: id, connectionId: "connection:one", stage, activeGoal: goal, version: 1, createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" }, tasks: [],
});
const ack = () => Response.json({ success: true, data: { snapshot: snapshot(), replayed: true } });

function Harness({ contactId = id }: { contactId?: string }) {
  const controller = useContactRelationshipInitialization(contactId);
  return <ContactRelationshipInitializationPanel controller={controller} language="zh" />;
}
async function mount(t: TestContext, fetcher: typeof fetch) {
  t.mock.method(globalThis, "fetch", fetcher);
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<Harness />); });
  t.after(() => act(() => root.unmount()));
  return { root,
    change: async (label: string, value: string) => act(async () => { root.root.findByProps({ "aria-label": label }).props.onChange({ target: { value } }); }),
    submit: async () => act(async () => { await root.root.findByType("form").props.onSubmit({ preventDefault() {} }); }),
    refresh: async () => act(async () => { await root.root.findByProps({ "data-initialization-refresh": true }).props.onClick(); }),
  };
}

test("only an explicit pending marker changes legacy display", () => {
  assert.equal(hasPendingInitialization({ lifecycleInitialization: "pending", status: "captured" }), true);
  for (const status of ["captured", "active", "unknown", "archived"]) assert.equal(hasPendingInitialization({ status }), false);
});

test("detail adapter honors explicit pending without changing ordinary legacy active", async () => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  if (route.routeState !== "success") throw new Error("Missing fixture");
  const contact = { ...route.contact, status: "active" as const, lifecycleInitialization: "pending" as const };
  const pendingView = contactDetailRouteToOrbitContactsViewModel({ ...route, contact });
  assert.equal(pendingView.connections[0].pipelineStatus, "pending_initialization");
  assert.equal(pendingView.connections[0].stage, "待设置关系");
  assert.equal(pendingView.connections[0].nextAction, null);
  assert.equal(contactDetailRouteToOrbitContactsViewModel({ ...route, contact: { ...route.contact, status: "active" } }).connections[0].pipelineStatus, "in_progress");
});

test("pending has no default stage, goal, or date and sends no write without a choice", async t => {
  const calls: RequestInit[] = [];
  const ui = await mount(t, (async (_path, init) => { calls.push(init ?? {}); return pending(); }) as typeof fetch);
  assert.equal(ui.root.root.findByType("select").props.value, "");
  await ui.submit();
  assert.equal(calls.length, 1);
  await ui.change("关系阶段", "active");
  assert.equal(ui.root.root.findByProps({ "aria-label": "关系目标" }).props.value, "");
  await ui.change("关系阶段", "needs_follow_up");
  assert.equal(ui.root.root.findByProps({ "aria-label": "下次跟进时间" }).props.value, "");
  assert.equal(ui.root.root.findByProps({ "aria-label": "跟进内容" }).props.value, "");
});

test("lost ACK retries the exact same key/body; replay displays snapshot then refreshes", async t => {
  const bodies: string[] = [];
  const paths: string[] = [];
  const ui = await mount(t, (async (path, init) => {
    paths.push(String(path));
    if (init?.method !== "POST") return bodies.length > 1 ? Response.json({ success: true, data: { state: "initialized", snapshot: snapshot() } }) : pending();
    bodies.push(String(init.body));
    if (bodies.length === 1) throw new Error("lost ACK");
    return ack();
  }) as typeof fetch);
  await ui.change("关系阶段", "active");
  await ui.change("关系目标", "Build a partnership");
  await ui.submit();
  assert.match(JSON.stringify(ui.root.toJSON()), /lost ACK/);
  await ui.submit();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(JSON.parse(bodies[0]).choice, { stage: "active", activeGoal: "Build a partnership" });
  assert.equal(JSON.parse(bodies[0]).expectedRevision, revision);
  assert.ok(JSON.parse(bodies[0]).idempotencyKey);
  assert.ok(paths.every(path => path === "/api/contacts/contact%3Atest%2Fone/relationship-initialization"));
  assert.match(JSON.stringify(ui.root.toJSON()), /Build a partnership/);
  assert.match(JSON.stringify(ui.root.toJSON()), /已确认此前提交/);
  await ui.refresh();
  assert.equal(ui.root.root.findAllByType("form").length, 0);
});

test("404 hides the panel; forbidden and read failures remain visible", async t => {
  let status = 404;
  const ui = await mount(t, (async () => Response.json({ success: false, error: { code: "FORBIDDEN", message: "Owner scope denied" } }, { status })) as typeof fetch);
  assert.equal(ui.root.toJSON(), null);
  status = 403;
  await act(async () => { ui.root.update(<Harness contactId="other" />); });
  assert.match(JSON.stringify(ui.root.toJSON()), /FORBIDDEN.*Owner scope denied/);
  assert.equal(ui.root.root.findAllByType("form").length, 0);
  status = 500;
  await ui.refresh();
  assert.equal(ui.root.root.findAllByProps({ role: "alert" }).length, 1);
});

test("dated next step creates a stable task id and initialized view links by connection id", async t => {
  let body: Record<string, any> | undefined;
  const ui = await mount(t, (async (_path, init) => {
    if (init?.method !== "POST") return pending();
    body = JSON.parse(String(init.body));
    const s = snapshot("nurture", null);
    return Response.json({ success: true, data: { snapshot: { ...s, tasks: [{ ...s.connection, ...body!.choice.nextTask, purpose: "maintenance", status: "open" }] }, replayed: false } });
  }) as typeof fetch);
  await ui.change("关系阶段", "nurture");
  await ui.change("跟进内容", "Check in");
  await ui.change("下次跟进时间", "2026-09-18T10:30");
  await ui.submit();
  assert.equal(body?.choice.nextTask.dueAt, new Date("2026-09-18T10:30").toISOString());
  assert.ok(body?.choice.nextTask.taskId);
  assert.equal(ui.root.root.findByType("a").props.href, "/app/tasks/relationship/connection%3Aone");
  assert.match(JSON.stringify(ui.root.toJSON()), /维护中/);
});

test("409 is visible; refresh with a new revision unlocks a fresh explicit choice", async t => {
  let rev = revision;
  const bodies: Array<{ expectedRevision: string; idempotencyKey: string }> = [];
  const ui = await mount(t, (async (_path, init) => {
    if (init?.method !== "POST") return Response.json({ success: true, data: { state: "pending", revision: rev, connectionId: "connection:one" } });
    bodies.push(JSON.parse(String(init.body)));
    rev = "b".repeat(64);
    return Response.json({ success: false, error: { code: "REVISION_CONFLICT", message: "Refresh and choose again" } }, { status: 409 });
  }) as typeof fetch);
  await ui.change("关系阶段", "archived");
  await ui.submit();
  assert.match(JSON.stringify(ui.root.toJSON()), /REVISION_CONFLICT.*Refresh and choose again/);
  assert.equal(ui.root.root.findByType("select").props.disabled, true);
  await ui.refresh();
  assert.equal(ui.root.root.findByType("select").props.disabled, false);
  assert.equal(ui.root.root.findByType("select").props.value, "");
  await ui.change("关系阶段", "active");
  await ui.change("关系目标", "New deliberate goal");
  await ui.submit();
  assert.equal(bodies[1].expectedRevision, rev);
  assert.notEqual(bodies[0].idempotencyKey, bodies[1].idempotencyKey);
});

test("cold reload renders only authoritative canonical stage and goal without a POST", async t => {
  let calls = 0;
  const ui = await mount(t, (async (_path, init) => { calls++; assert.notEqual(init?.method, "POST"); return Response.json({ success: true, data: { state: "initialized", snapshot: snapshot() } }); }) as typeof fetch);
  assert.equal(calls, 1);
  assert.equal(ui.root.root.findAllByType("form").length, 0);
  assert.match(JSON.stringify(ui.root.toJSON()), /Build a partnership/);
});

test("both detail panels share one GET and override malformed legacy active headers", async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let root: ReactTestRenderer | undefined;
  Object.defineProperty(globalThis, "document", { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "http://localhost/app/contacts/one" }, addEventListener() {}, removeEventListener() {} } });
  t.after(() => {
    act(() => root?.unmount());
    if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document");
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
  });
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  if (route.routeState !== "success") throw new Error("Missing fixture");
  const model = contactDetailRouteToOrbitContactsViewModel({ ...route, contact: { ...route.contact, status: "active" } });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async path => { if (String(path).endsWith("/relationship-initialization")) calls++; return pending(); });
  await act(async () => { root = create(<OrbitRealCardConnection contactId={route.contact.id} viewModel={model} />); });
  assert.equal(calls, 1);
  assert.equal(root.root.findAllByType("form").length, 2);
  const pills = root.root.findAll(node => node.type === "span" && String(node.props.className).startsWith("nc-status nc-ps-"));
  assert.equal(pills.length, 2);
  for (const pill of pills) {
    assert.equal(pill.children.at(-1), "待设置关系");
    assert.match(pill.props.className, /pending_initialization/);
  }
});

test("list and kanban give pending its own display bucket, preserving ordinary legacy semantics", () => {
  const base = { databaseQueryExecuted: false, detailHref: "/app/contacts/one", displayName: "Contact", evidenceIds: [], externalServicesContacted: false,
    id: "one", location: "", needsAttention: false, nextAction: "Legacy suggestion", organization: "", profileSnippet: "", relationshipContextCopy: "",
    relationshipValueLabels: [], relationshipValueSummary: "", role: "", searchIndexReadExecuted: false, sourceLabel: "Exchange", sourceType: "event_import" as const,
    status: "active" as const, statusLabel: "Active", tags: [], valueRationale: "" };
  const payload: AppContactsPayloadViewModel = { appliedFilters: { query: "", sourceFilters: [], statusFilters: [], tagFilters: [], valueFilters: [] }, availableFilters: { sources: [], statuses: [], values: [] },
    contacts: [{ ...base, lifecycleInitialization: "pending" }, { ...base, id: "ordinary" }, { ...base, id: "archive", status: "archived" }],
    ledger: { knownPeople: 3, needsAttention: 0, sourceFilters: 0, valueTags: 0 }, listEvidenceIds: [], listSummary: "", reviewActionRequested: false };
  for (const vm of [listAdapter({ state: "success", payload }), pipelineAdapter(payload)]) {
    assert.deepEqual(vm.connections.map(contact => contact.pipelineStatus), ["pending_initialization", "in_progress", "archived"]);
    assert.equal(vm.connections[0].nextAction, null);
    assert.equal(vm.pipelineStatuses.find(status => status.value === "pending_initialization")?.label, "待设置关系");
  }
});

test("mismatched receipt is an error and retry retains the original identity", async t => {
  const bodies: string[] = [];
  const ui = await mount(t, (async (_path, init) => {
    if (init?.method !== "POST") return pending();
    bodies.push(String(init.body));
    const s = snapshot();
    return Response.json({ success: true, data: { snapshot: { ...s, connection: { ...s.connection, contactId: "other-owner-contact" } }, replayed: false } });
  }) as typeof fetch);
  await ui.change("关系阶段", "active");
  await ui.change("关系目标", "Build a partnership");
  await ui.submit();
  assert.match(JSON.stringify(ui.root.toJSON()), /identity mismatch/);
  await ui.submit();
  assert.equal(bodies[0], bodies[1]);
  assert.equal(ui.root.root.findAllByType("form").length, 1);
});
