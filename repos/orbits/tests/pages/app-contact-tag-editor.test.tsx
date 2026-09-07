import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { applyOrbitContactsPresentation } from "../../app/(app)/app/orbit-contacts-presentation";

type Tag = { value: string; label: string };
const initialTags = [{ value: "topic:community", label: "社群" }, { value: "CRM:Tier_A", label: "CRM:Tier_A" }];

test("detail mapping retains exact tag values and never translates or strips custom tag text", async () => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  assert.equal(route.routeState, "success");
  if (route.routeState !== "success") throw new Error("Missing fixture");
  const model = contactDetailRouteToOrbitContactsViewModel({ ...route, contact: {
    ...route.contact, tags: ["topic:community", "CRM:Tier_A", "Strategic fit"] as typeof route.contact.tags,
  } }, "zh");
  assert.deepEqual(model.connections[0].editableTags, [...initialTags, { value: "Strategic fit", label: "Strategic fit" }]);
  const localized = applyOrbitContactsPresentation(model, "zh");
  assert.deepEqual(localized.connections[0].valueTags, ["社群", "CRM:Tier_A", "Strategic fit"]);
});

test("empty tags still expose editing in both contact detail layouts", async () => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  if (route.routeState !== "success") throw new Error("Missing fixture");
  const model = contactDetailRouteToOrbitContactsViewModel({ ...route, contact: { ...route.contact, tags: [] } });
  const html = renderToStaticMarkup(<OrbitRealCardConnection contactId={route.contact.id} viewModel={model} />);
  assert.equal((html.match(/aria-label="编辑自定义标签"/g) ?? []).length, 2);
});

async function mount(t: TestContext, fetcher: typeof fetch, tags = initialTags, contactId = "contact:tags/one") {
  t.mock.method(globalThis, "fetch", fetcher);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  const { ContactTagEditor } = await import("../../app/(app)/app/contacts/contact-tag-editor");
  const saved: string[][] = [];
  let root!: ReactTestRenderer;
  const element = (nextTags = tags) => <ContactTagEditor contactId={contactId} initialTags={nextTags} language="zh" onClose={() => {}} onSaved={(values) => { saved.push(values); }} />;
  await act(async () => { root = create(element()); });
  t.after(() => {
    act(() => root.unmount());
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  });
  return { root, saved, element,
    add: async (value: string) => {
      await act(async () => { root.root.findByType("input").props.onChange({ target: { value } }); });
      await act(async () => { root.root.findByProps({ "data-tag-add": true }).props.onClick(); });
    },
    remove: async (label: string) => { await act(async () => { root.root.findByProps({ "aria-label": `移除标签：${label}` }).props.onClick(); }); },
    save: () => root.root.findByProps({ "data-tags-save": true }),
  };
}

const ack = (tags: string[], id = "contact:tags/one") => Response.json({ success: true, data: { contact: { id, tags } } });

test("tag edits send only raw additions/removals and retain concurrent server tags", async (t) => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  let respond!: (response: Response) => void;
  const ui = await mount(t, (async (path, init) => { calls.push({ path: String(path), init }); return new Promise<Response>((resolve) => { respond = resolve; }); }) as typeof fetch);
  await ui.remove("社群");
  await ui.add("  日本市场  ");
  let pending!: Promise<void>;
  await act(async () => { pending = ui.save().props.onClick(); void ui.save().props.onClick(); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/contacts/contact%3Atags%2Fone");
  assert.equal(calls[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { addTags: ["日本市场"], removeTags: ["topic:community"] });
  assert.ok(ui.root.root.findAllByType("button").every((button) => button.props.disabled));
  await act(async () => { respond(ack(["CRM:Tier_A", "日本市场", "另一端新标签"])); await pending; });
  assert.deepEqual(ui.saved, [["CRM:Tier_A", "日本市场", "另一端新标签"]]);
});

test("case-insensitive duplicates and oversized new tags cannot enter the draft", async (t) => {
  const ui = await mount(t, (async () => { throw new Error("No request expected"); }) as typeof fetch);
  await ui.add(" crm:tier_a ");
  assert.ok(ui.root.root.findByProps({ role: "alert" }));
  assert.equal(ui.root.root.findAllByProps({ "data-tag-value": "crm:tier_a" }).length, 0);
  await ui.add("文".repeat(33));
  assert.ok(ui.root.root.findByProps({ role: "alert" }));
  assert.equal(ui.save().props.disabled, true);
  await ui.add("😀".repeat(32));
  assert.equal(ui.save().props.disabled, false, "length is measured in Unicode characters, not UTF-16 units");
});

test("existing oversized tags remain visible/removable while new additions respect the contact limit", async (t) => {
  const tags: Tag[] = Array.from({ length: 21 }, (_, index) => ({ value: `legacy-${index}`, label: `旧标签${index}` }));
  tags[0] = { value: "旧".repeat(40), label: "旧".repeat(40) };
  const bodies: unknown[] = [];
  const ui = await mount(t, (async (_path, init) => { bodies.push(JSON.parse(String(init?.body))); return ack(tags.slice(2).map((tag) => tag.value)); }) as typeof fetch, tags);
  await ui.add("新标签");
  assert.ok(ui.root.root.findByProps({ role: "alert" }));
  assert.equal(ui.save().props.disabled, true);
  await ui.remove(tags[0].label);
  await ui.remove(tags[1].label);
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(bodies, [{ removeTags: [tags[0].value, "legacy-1"] }]);
});

test("failed or unconfirmed saves preserve tag changes and the original delta for retry", async (t) => {
  let attempts = 0;
  const bodies: unknown[] = [];
  const ui = await mount(t, (async (_path, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (++attempts === 1) throw new Error("offline");
    if (attempts === 2) return ack(["topic:community", "CRM:Tier_A"]);
    return ack(["CRM:Tier_A", "新标签"]);
  }) as typeof fetch);
  await ui.remove("社群");
  await ui.add("新标签");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await act(async () => { await ui.save().props.onClick(); });
    assert.ok(ui.root.root.findByProps({ role: "alert" }));
    assert.equal(ui.saved.length, 0);
    assert.ok(ui.root.root.findByProps({ "data-tag-value": "新标签" }));
  }
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(ui.saved.length, 1);
  assert.deepEqual(bodies, Array(3).fill({ addTags: ["新标签"], removeTags: ["topic:community"] }));
});

test("a removed tag still present with different casing is not a confirmed removal", async (t) => {
  const ui = await mount(t, (async () => ack(["topic:community", "crm:tier_a"])) as typeof fetch);
  await ui.remove("CRM:Tier_A");
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(ui.saved, []);
  assert.ok(ui.root.root.findByProps({ role: "alert" }));
});

test("an explicit case-only replacement requires the requested new spelling", async (t) => {
  let attempts = 0;
  const ui = await mount(t, (async () => ack(["topic:community", ++attempts === 1 ? "Crm:Tier_A" : "crm:tier_a"])) as typeof fetch);
  await ui.remove("CRM:Tier_A");
  await ui.add("crm:tier_a");
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(ui.saved, []);
  assert.ok(ui.root.root.findByProps({ role: "alert" }));
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(ui.saved, [["topic:community", "crm:tier_a"]]);
});

test("new source props preserve an open draft and late writes after unmount do not update the page", async (t) => {
  let respond!: (response: Response) => void;
  const ui = await mount(t, (async () => new Promise<Response>((resolve) => { respond = resolve; })) as typeof fetch);
  await ui.add("新标签");
  await act(async () => { ui.root.update(ui.element([])); });
  assert.ok(ui.root.root.findByProps({ "data-tag-value": "CRM:Tier_A" }));
  let pending!: Promise<void>;
  await act(async () => { pending = ui.save().props.onClick(); });
  act(() => ui.root.unmount());
  await act(async () => { respond(ack(["topic:community", "CRM:Tier_A", "新标签"])); await pending; });
  assert.deepEqual(ui.saved, []);
});

test("real PATCH retries after a lost acknowledgement preserve remote tags and unrelated contact fields", async (t) => {
  const { createMemoryLiveRecordStore } = await import("../../shared/storage/live-record-store");
  const { seedGeneratedRelationshipFixturesIntoLiveStore } = await import("../../shared/storage/seed-generated-fixtures");
  const { createStorageContactGraphProvider } = await import("../../features/contacts/storage/contact-live-record-provider");
  const { createLiveContactDetailTagStatusService } = await import("../../features/contacts/live-detail-service");
  const { contactDetailTagStatusServiceFactory } = await import("../../features/contacts/service-factory");
  const { createContactDetailPatchHandler } = await import("../../app/api/contacts/[id]/handler");
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:tag-editor";
  const actorId = "actor:tag-editor";
  const contactId = "contact_078";
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    for (const record of await store.listRecords({ collectionName, workspaceId })) {
      await store.upsertRecord({ ...record, userId: actorId, payload: { ...record.payload, accountId: actorId } });
    }
  }
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  await provider.upsertContactDetailState!({ actorId, contactId, status: "active", tags: initialTags.map((tag) => tag.value), notes: [], updatedAt: "2026-09-08T00:00:00Z" });
  const service = () => createLiveContactDetailTagStatusService({ provider: createStorageContactGraphProvider({ store, workspaceId }) });
  const before = await service().updateContactDetail({ actorId, contactId, primaryIndustryId: "finance_investment", addTags: ["远端新标签"] });
  assert.equal(before.success, true);
  if (!before.success) throw new Error("Missing owned fixture");
  const resolution = contactDetailTagStatusServiceFactory.create("mock");
  t.mock.method(contactDetailTagStatusServiceFactory, "create", () => ({ ...resolution, service: service() }));
  const patch = createContactDetailPatchHandler(async () => ({ id: actorId }));
  let attempts = 0;
  const ui = await mount(t, (async (path, init) => {
    assert.equal(path, "/api/contacts/contact_078");
    const result = await patch(new Request(`http://localhost${path}`, init), { params: Promise.resolve({ id: contactId }) });
    assert.equal(result.status, 200);
    if (++attempts === 1) throw new Error("Reply lost after storage committed");
    return result;
  }) as typeof fetch, initialTags, contactId);
  await ui.remove("社群");
  await ui.add("用户新增");
  await act(async () => { await ui.save().props.onClick(); });
  assert.ok(ui.root.root.findByProps({ role: "alert" }));
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(ui.saved, [["CRM:Tier_A", "远端新标签", "用户新增"]]);
  const after = await service().getContactDetail({ actorId, contactId });
  assert.equal(after.success, true);
  if (!after.success) throw new Error("Missing saved fixture");
  assert.deepEqual(after.data.contact?.tags, ["CRM:Tier_A", "远端新标签", "用户新增"]);
  assert.equal(after.data.contact?.primaryIndustryId, "finance_investment");
  assert.equal(after.data.contact?.status, before.data.contact?.status);
  assert.deepEqual(after.data.contact?.notes, before.data.contact?.notes);
});
