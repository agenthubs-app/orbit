import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";

test("both contact detail layouts expose industry editing even for an unclassified contact", async () => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  assert.equal(route.routeState, "success");
  if (route.routeState !== "success") throw new Error("Missing fixture");
  const model = contactDetailRouteToOrbitContactsViewModel(route);
  model.connections[0].primaryIndustryId = undefined;
  model.connections[0].industry = "";
  const html = renderToStaticMarkup(<OrbitRealCardConnection contactId={route.contact.id} viewModel={model} />);
  assert.equal((html.match(/aria-label="编辑主要行业"/g) ?? []).length, 2);
});

async function mount(t: TestContext, fetcher: typeof fetch, initialIndustryId?: string, contactId = "contact:one/two") {
  t.mock.method(globalThis, "fetch", fetcher);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  const { ContactIndustryEditor } = await import("../../app/(app)/app/contacts/contact-industry-editor");
  let saved = 0;
  let root!: ReactTestRenderer;
  const element = (industry = initialIndustryId) => <ContactIndustryEditor contactId={contactId} initialIndustryId={industry} language="zh" onClose={() => {}} onSaved={() => { saved += 1; }} />;
  await act(async () => { root = create(element()); });
  t.after(() => {
    act(() => root.unmount());
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  });
  return { root, element, saved: () => saved, select: () => root.root.findByType("select"), save: () => root.root.findByProps({ "data-industry-save": true }) };
}

const acknowledged = (primaryIndustryId?: string) => Response.json({ success: true, data: {
  state: "ready", contact: { id: "contact:one/two", primaryIndustryId },
} });

test("saving sends only the stable industry ID and blocks duplicate writes while pending", async (t) => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  let respond!: (response: Response) => void;
  const ui = await mount(t, (async (path, init) => { calls.push({ path: String(path), init }); return new Promise<Response>((resolve) => { respond = resolve; }); }) as typeof fetch);
  assert.equal(ui.select().findAllByType("option").length, 15);
  await act(async () => { ui.select().props.onChange({ target: { value: "technology_internet" } }); });
  let pending!: Promise<void>;
  await act(async () => { pending = ui.save().props.onClick(); void ui.save().props.onClick(); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/contacts/contact%3Aone%2Ftwo");
  assert.equal(calls[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { primaryIndustryId: "technology_internet" });
  assert.equal(ui.select().props.disabled, true);
  await act(async () => { respond(acknowledged("technology_internet")); await pending; });
  assert.equal(ui.saved(), 1);
  assert.equal(ui.save().props.disabled, true);
  assert.ok(ui.root.root.findByProps({ role: "status" }));
});

test("clearing an industry explicitly sends null and accepts the canonical missing field on readback", async (t) => {
  const bodies: unknown[] = [];
  const ui = await mount(t, (async (_path, init) => { bodies.push(JSON.parse(String(init?.body))); return acknowledged(); }) as typeof fetch, "technology_internet");
  await act(async () => { ui.select().props.onChange({ target: { value: "" } }); });
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(bodies, [{ primaryIndustryId: null }]);
  assert.equal(ui.saved(), 1);
});

test("network or malformed acknowledgement preserves the draft and allows an explicit retry", async (t) => {
  let attempt = 0;
  const ui = await mount(t, (async () => {
    attempt += 1;
    if (attempt === 1) throw new Error("offline");
    if (attempt === 2) return Response.json({ success: true, data: { contact: { id: "other", primaryIndustryId: "finance_investment" } } });
    return acknowledged("finance_investment");
  }) as typeof fetch, "technology_internet");
  await act(async () => { ui.select().props.onChange({ target: { value: "finance_investment" } }); });
  for (let retry = 0; retry < 2; retry += 1) {
    await act(async () => { await ui.save().props.onClick(); });
    assert.ok(ui.root.root.findByProps({ role: "alert" }));
    assert.equal(ui.saved(), 0);
    assert.equal(ui.select().props.value, "finance_investment");
    assert.equal(ui.save().props.disabled, false);
  }
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(ui.saved(), 1);
});

test("a refreshed source cannot replace a draft while the editor is open", async (t) => {
  const ui = await mount(t, (async () => acknowledged("finance_investment")) as typeof fetch, "technology_internet");
  await act(async () => { ui.select().props.onChange({ target: { value: "finance_investment" } }); });
  await act(async () => { ui.root.update(ui.element("other")); });
  assert.equal(ui.select().props.value, "finance_investment");
});

test("a late response after leaving the editor cannot refresh a different contact", async (t) => {
  let respond!: (response: Response) => void;
  const ui = await mount(t, (async () => new Promise<Response>((resolve) => { respond = resolve; })) as typeof fetch);
  await act(async () => { ui.select().props.onChange({ target: { value: "other" } }); });
  let pending!: Promise<void>;
  await act(async () => { pending = ui.save().props.onClick(); });
  act(() => ui.root.unmount());
  await act(async () => { respond(acknowledged("other")); await pending; });
  assert.equal(ui.saved(), 0);
});

test("the editor payload works through the real authenticated handler and survives a fresh storage read", async (t) => {
  const { createMemoryLiveRecordStore } = await import("../../shared/storage/live-record-store");
  const { seedGeneratedRelationshipFixturesIntoLiveStore } = await import("../../shared/storage/seed-generated-fixtures");
  const { createStorageContactGraphProvider } = await import("../../features/contacts/storage/contact-live-record-provider");
  const { createLiveContactDetailTagStatusService } = await import("../../features/contacts/live-detail-service");
  const { contactDetailTagStatusServiceFactory } = await import("../../features/contacts/service-factory");
  const { createContactDetailPatchHandler } = await import("../../app/api/contacts/[id]/handler");
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:industry-editor";
  const actorId = "actor:industry-editor";
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    for (const record of await store.listRecords({ collectionName, workspaceId })) {
      await store.upsertRecord({ ...record, userId: actorId, payload: { ...record.payload, accountId: actorId } });
    }
  }
  const service = () => createLiveContactDetailTagStatusService({ provider: createStorageContactGraphProvider({ store, workspaceId }) });
  const resolution = contactDetailTagStatusServiceFactory.create("mock");
  t.mock.method(contactDetailTagStatusServiceFactory, "create", () => ({ ...resolution, service: service() }));
  const patch = createContactDetailPatchHandler(async () => ({ id: actorId }));
  const before = await service().getContactDetail({ actorId, contactId: "contact_078" });
  assert.equal(before.success, true);
  if (!before.success) throw new Error("Missing owned contact fixture");
  const ui = await mount(t, (async (path, init) => {
    assert.equal(path, "/api/contacts/contact_078");
    return patch(new Request(`http://localhost${path}`, init), { params: Promise.resolve({ id: "contact_078" }) });
  }) as typeof fetch, undefined, "contact_078");
  await act(async () => { ui.select().props.onChange({ target: { value: "finance_investment" } }); });
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(ui.saved(), 1);
  const readback = await service().getContactDetail({ actorId, contactId: "contact_078" });
  assert.equal(readback.success, true);
  if (!readback.success) throw new Error("Missing saved contact");
  assert.equal(readback.data.contact?.primaryIndustryId, "finance_investment");
  assert.deepEqual(readback.data.contact?.tags, before.data.contact?.tags);
  assert.equal(readback.data.contact?.status, before.data.contact?.status);
  await act(async () => { ui.select().props.onChange({ target: { value: "" } }); });
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(ui.saved(), 2);
  const cleared = await service().getContactDetail({ actorId, contactId: "contact_078" });
  assert.equal(cleared.success, true);
  if (!cleared.success) throw new Error("Missing cleared contact");
  assert.equal(cleared.data.contact?.primaryIndustryId, undefined);
});
