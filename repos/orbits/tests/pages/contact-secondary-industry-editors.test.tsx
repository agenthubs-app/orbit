import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { contactDetailTagStatusServiceFactory } from "../../features/contacts/service-factory";
import { createContactDetailPatchHandler } from "../../app/api/contacts/[id]/handler";

test("contact detail saves a complete pair through HTTP, reopens it, and preserves a failed replacement draft", async t => {
  const descriptors = ["window", "document"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "contact-secondary-editor";
  const actorId = "contact-secondary-owner";
  const contactId = "contact_078";
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    for (const record of store.listRecords({ workspaceId, collectionName })) {
      store.upsertRecord({ ...record, userId: actorId, payload: { ...record.payload, accountId: actorId } });
    }
  }
  const service = createLiveContactDetailTagStatusService({ provider: createStorageContactGraphProvider({ store, workspaceId }) });
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  assert.equal(route.routeState, "success");
  if (route.routeState !== "success") throw new Error("Missing route fixture");
  const loaded = await service.getContactDetail({ actorId, contactId });
  assert.ok(loaded.success && loaded.data.contact);
  const model = contactDetailRouteToOrbitContactsViewModel({ ...route, contact: loaded.data.contact });
  const resolution = contactDetailTagStatusServiceFactory.create("mock");
  t.mock.method(contactDetailTagStatusServiceFactory, "create", () => ({ ...resolution, service }));
  const patch = createContactDetailPatchHandler(async () => ({ id: actorId }));
  let rejectSave = false;
  const writes: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", (async (path, init) => {
    assert.equal(path, `/api/contacts/${contactId}`);
    writes.push(JSON.parse(String(init?.body)));
    if (rejectSave) return Response.json({ success: false }, { status: 503 });
    return patch(new Request(`http://localhost${path}`, init), { params: Promise.resolve({ id: contactId }) });
  }) as typeof fetch);
  let root!: ReactTestRenderer;
  t.after(() => {
    if (root) act(() => root.unmount());
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  await act(async () => { root = create(<OrbitRealCardConnection contactId={contactId} viewModel={model} />); });
  const open = async () => { await act(async () => { root.root.findAllByProps({ "aria-label": "编辑主要行业" })[0].props.onClick(); }); };
  const primary = () => root.root.findByProps({ "aria-label": "主要行业", value: root.root.findAllByType("select")[0].props.value });
  const secondary = () => root.root.findAllByProps({ "aria-label": "二级行业" })[0];
  const save = () => root.root.findByProps({ "data-industry-save": true });
  await open();
  assert.equal(root.root.findAllByType("select").length, 2, "the real detail editor must expose both industry levels");
  await act(async () => { primary().props.onChange({ target: { value: "technology_internet" } }); });
  assert.equal(save().props.disabled, true, "a newly selected parent must not save without a child");
  await act(async () => { secondary().props.onChange({ target: { value: "technology_internet.ai_data" } }); });
  await act(async () => { await save().props.onClick(); });
  assert.deepEqual(writes, [{ primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" }]);
  const saved = await service.getContactDetail({ actorId, contactId });
  assert.ok(saved.success && saved.data.contact);
  assert.equal(saved.data.contact.secondaryIndustryId, "technology_internet.ai_data");
  assert.match(JSON.stringify(root.toJSON()), /人工智能与数据/);
  await open();
  assert.equal(secondary().props.value, "technology_internet.ai_data");
  await act(async () => { primary().props.onChange({ target: { value: "finance_investment" } }); });
  assert.equal(secondary().props.value, "");
  assert.equal(save().props.disabled, true);
  await act(async () => { secondary().props.onChange({ target: { value: "finance_investment.banking" } }); });
  rejectSave = true;
  await act(async () => { await save().props.onClick(); });
  assert.equal(root.root.findAllByProps({ role: "alert" }).length, 1);
  assert.equal(secondary().props.value, "finance_investment.banking");
  const unchanged = await service.getContactDetail({ actorId, contactId });
  assert.ok(unchanged.success && unchanged.data.contact);
  assert.equal(unchanged.data.contact.secondaryIndustryId, "technology_internet.ai_data");
  const remountModel = contactDetailRouteToOrbitContactsViewModel({ ...route, contact: unchanged.data.contact });
  await act(async () => { root.unmount(); root = create(<OrbitRealCardConnection contactId={contactId} viewModel={remountModel} />); });
  await open();
  assert.equal(primary().props.value, "technology_internet");
  assert.equal(secondary().props.value, "technology_internet.ai_data");
});
