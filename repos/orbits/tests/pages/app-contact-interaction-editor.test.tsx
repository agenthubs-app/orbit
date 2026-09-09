import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";

const initial = { channel: "email_signal", occurredAt: "2026-09-07T03:04:05.123Z", summary: "CRM:Original" };
const contactId = "contact:interaction/one";
const ack = (interaction = initial, id = contactId) => Response.json({ success: true, data: { contact: { id, lastInteraction: interaction } } });

test("detail exposes raw interaction fields and editing even when the summary is empty", async () => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  if (route.routeState !== "success") throw new Error("Missing fixture");
  const model = contactDetailRouteToOrbitContactsViewModel({ ...route, contact: { ...route.contact,
    lastInteraction: { ...route.contact.lastInteraction, channel: "email_signal", occurredAt: initial.occurredAt, summary: "" },
  } });
  assert.deepEqual(model.connections[0].editableInteraction, { ...initial, summary: "" });
  const html = renderToStaticMarkup(<OrbitRealCardConnection contactId={route.contact.id} viewModel={model} />);
  assert.equal((html.match(/aria-label="编辑最近互动"/g) ?? []).length, 2);
});

async function mount(t: TestContext, fetcher: typeof fetch, id = contactId, initialValue = initial) {
  t.mock.method(globalThis, "fetch", fetcher);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  const module = await import("../../app/(app)/app/contacts/contact-interaction-editor");
  assert.equal(typeof module.ContactInteractionEditor, "function");
  const saved: typeof initial[] = [];
  let root!: ReactTestRenderer;
  const element = (value = initialValue) => <module.ContactInteractionEditor contactId={id} initialInteraction={value} language="zh" onClose={() => {}} onSaved={(value) => saved.push(value)} />;
  await act(async () => { root = create(element()); });
  t.after(() => {
    act(() => root.unmount());
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  });
  return { root, saved, element,
    change: async (label: string, value: string) => { await act(async () => { root.root.findByProps({ "aria-label": label }).props.onChange({ target: { value } }); }); },
    save: () => root.root.findByProps({ "data-interaction-save": true }),
  };
}

test("summary-only update preserves the channel and exact timestamp, with one pending write", async (t) => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  let respond!: (response: Response) => void;
  const ui = await mount(t, (async (path, init) => { calls.push({ path: String(path), init }); return new Promise<Response>((resolve) => { respond = resolve; }); }) as typeof fetch);
  assert.equal(ui.save().props.disabled, true);
  await ui.change("互动摘要", "  CRM:Updated  ");
  let pending!: Promise<void>;
  await act(async () => { pending = ui.save().props.onClick(); void ui.save().props.onClick(); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/contacts/contact%3Ainteraction%2Fone");
  assert.equal(calls[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { lastInteraction: { channel: "email_signal", summary: "CRM:Updated" } });
  assert.ok(ui.root.root.findAllByType("button").every((button) => button.props.disabled));
  await act(async () => { respond(ack({ ...initial, summary: "CRM:Updated" })); await pending; });
  assert.deepEqual(ui.saved, [{ ...initial, summary: "CRM:Updated" }]);
});

test("local date/time is sent as UTC and blank fields do not clear existing metadata", async (t) => {
  const bodies: Array<{ lastInteraction: typeof initial }> = [];
  const ui = await mount(t, (async (_path, init) => {
    const body = JSON.parse(String(init?.body)); bodies.push(body);
    return ack({ ...initial, ...body.lastInteraction });
  }) as typeof fetch);
  await ui.change("互动摘要", "");
  await ui.change("互动时间", "2026-09-08T12:30:00");
  await ui.change("互动渠道", "event_note");
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(bodies, [{ lastInteraction: { channel: "event_note", occurredAt: new Date(2026, 8, 8, 12, 30, 0).toISOString() } }]);
  assert.equal(ui.saved[0].summary, initial.summary);
});

test("invalid dates cannot be submitted", async (t) => {
  let calls = 0;
  const ui = await mount(t, (async () => { calls += 1; return ack(); }) as typeof fetch);
  await ui.change("互动时间", "2026-02-30T12:00:00");
  await ui.change("互动摘要", "changed");
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(calls, 0);
  assert.ok(ui.root.root.findByProps({ role: "alert" }));
});

test("network failure and mismatched ACK keep the draft across prop refresh and retry", async (t) => {
  let attempts = 0;
  const bodies: unknown[] = [];
  const ui = await mount(t, (async (_path, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (++attempts === 1) throw new Error("offline");
    if (attempts === 2) return ack({ ...initial, summary: "wrong" });
    if (attempts === 3) return ack({ ...initial, summary: "kept" }, "another-contact");
    return ack({ ...initial, summary: "kept" });
  }) as typeof fetch);
  await ui.change("互动摘要", "kept");
  await act(async () => { ui.root.update(ui.element({ ...initial, summary: "remote" })); });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await act(async () => { await ui.save().props.onClick(); });
    assert.equal(ui.saved.length, 0);
    assert.equal(ui.root.root.findByType("textarea").props.value, "kept");
    assert.ok(ui.root.root.findByProps({ role: "alert" }));
  }
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(ui.saved.length, 1);
  assert.deepEqual(bodies, Array(4).fill({ lastInteraction: { channel: "email_signal", summary: "kept" } }));
});

test("a late response after unmount cannot update the previous contact", async (t) => {
  let respond!: (response: Response) => void;
  const ui = await mount(t, (() => new Promise<Response>((resolve) => { respond = resolve; })) as typeof fetch);
  await ui.change("互动摘要", "late");
  let pending!: Promise<void>;
  await act(async () => { pending = ui.save().props.onClick(); });
  act(() => ui.root.unmount());
  await act(async () => { respond(ack({ ...initial, summary: "late" })); await pending; });
  assert.equal(ui.saved.length, 0);
});

test("opening a legacy whitespace summary does not create an implicit edit", async (t) => {
  const ui = await mount(t, (async () => { throw new Error("No write expected"); }) as typeof fetch, contactId, { ...initial, summary: "  original  " });
  assert.equal(ui.save().props.disabled, true);
});

test("an invalid timestamp in a summary-only ACK retains the draft", async (t) => {
  const ui = await mount(t, (async () => ack({ ...initial, summary: "kept", occurredAt: "invalid" })) as typeof fetch);
  await ui.change("互动摘要", "kept");
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(ui.saved.length, 0);
  assert.equal(ui.root.root.findByType("textarea").props.value, "kept");
  assert.ok(ui.root.root.findByProps({ role: "alert" }));
});

test("an empty timestamp ACK cannot silently clear an existing interaction time", async (t) => {
  const ui = await mount(t, (async () => ack({ ...initial, summary: "kept", occurredAt: "" })) as typeof fetch);
  await ui.change("互动摘要", "kept");
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(ui.saved.length, 0);
  assert.ok(ui.root.root.findByProps({ role: "alert" }));
});

test("untouched fields returned by the server retain concurrent edits rather than enforcing a stale baseline", async (t) => {
  const remote = { channel: "event_note", occurredAt: "2026-09-08T02:03:04.567Z", summary: "another device's new summary" };
  const bodies: unknown[] = [];
  const ui = await mount(t, (async (_path, init) => { bodies.push(JSON.parse(String(init?.body))); return ack(remote); }) as typeof fetch);
  await ui.change("互动渠道", "event_note");
  await ui.change("互动摘要", "");
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(bodies, [{ lastInteraction: { channel: "event_note" } }]);
  assert.deepEqual(ui.saved, [remote]);
});

test("real PATCH persists interaction through a lost reply without overwriting other contact fields", async (t) => {
  const { createMemoryLiveRecordStore } = await import("../../shared/storage/live-record-store");
  const { seedGeneratedRelationshipFixturesIntoLiveStore } = await import("../../shared/storage/seed-generated-fixtures");
  const { createStorageContactGraphProvider } = await import("../../features/contacts/storage/contact-live-record-provider");
  const { createLiveContactDetailTagStatusService } = await import("../../features/contacts/live-detail-service");
  const { contactDetailTagStatusServiceFactory } = await import("../../features/contacts/service-factory");
  const { createContactDetailPatchHandler } = await import("../../app/api/contacts/[id]/handler");
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:interaction-editor";
  const actorId = "actor:interaction-editor";
  const id = "contact_078";
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    for (const record of await store.listRecords({ collectionName, workspaceId })) {
      await store.upsertRecord({ ...record, userId: actorId, payload: { ...record.payload, accountId: actorId } });
    }
  }
  const service = () => createLiveContactDetailTagStatusService({ provider: createStorageContactGraphProvider({ store, workspaceId }) });
  const before = await service().updateContactDetail({ actorId, contactId: id, primaryIndustryId: "finance_investment", addTags: ["远端标签"], lastInteraction: initial });
  if (!before.success || !before.data.contact) throw new Error("Missing owned fixture");
  const resolution = contactDetailTagStatusServiceFactory.create("mock");
  t.mock.method(contactDetailTagStatusServiceFactory, "create", () => ({ ...resolution, service: service() }));
  const patch = createContactDetailPatchHandler(async () => ({ id: actorId }));
  let attempts = 0;
  const ui = await mount(t, (async (path, init) => {
    assert.equal(path, "/api/contacts/contact_078");
    const response = await patch(new Request(`http://localhost${path}`, init), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 200);
    if (++attempts === 1) throw new Error("Lost reply after commit");
    return response;
  }) as typeof fetch, id);
  await ui.change("互动摘要", "已讨论下次见面的资料");
  await act(async () => { await ui.save().props.onClick(); });
  assert.ok(ui.root.root.findByProps({ role: "alert" }));
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(ui.saved, [{ ...initial, summary: "已讨论下次见面的资料" }]);
  const after = await service().getContactDetail({ actorId, contactId: id });
  if (!after.success || !after.data.contact) throw new Error("Missing saved fixture");
  assert.equal(after.data.contact.lastInteraction.summary, "已讨论下次见面的资料");
  assert.equal(after.data.contact.lastInteraction.occurredAt, initial.occurredAt);
  assert.equal(after.data.contact.lastInteraction.channel, "email_signal");
  assert.equal(after.data.contact.primaryIndustryId, "finance_investment");
  assert.deepEqual(after.data.contact.tags, before.data.contact.tags);
  assert.equal(after.data.contact.status, before.data.contact.status);
  assert.deepEqual(after.data.contact.notes, before.data.contact.notes);
});
