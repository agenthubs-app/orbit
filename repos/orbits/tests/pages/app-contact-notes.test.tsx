import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { OrbitRealCardConnection } from "../../app/(app)/app/contacts/orbit-real-card-connection";
import { ContactNotesEditor } from "../../app/(app)/app/contacts/contact-notes-editor";
import type { OrbitContactNoteView } from "../../app/(app)/app/orbit-contacts-route-view-model";

const contactId = "contact:one/two";
const body = "战略契合 / strategic_fit\nCRM mock 案例，刚刚聊过。";
const privateNote = { noteId: "note:private:1", body, createdAt: "2026-09-08T03:00:00.000Z", privacy: "private" as const, authorLabel: "我" };
const sharedNote = { ...privateNote, noteId: "note:shared:1", body: "双方可见的纪要", privacy: "relationship_shared" as const };
const ack = (notes: unknown[] = [privateNote, sharedNote], id = contactId) => Response.json({ success: true, data: { state: "success", contact: { id, notes } } });

test("both detail layouts expose contact notes, separately from shared interaction history", async () => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  if (route.routeState !== "success") throw new Error("Missing fixture");
  const model = contactDetailRouteToOrbitContactsViewModel(route);
  model.connections[0].notes = [{ id: privateNote.noteId, body, createdAt: privateNote.createdAt, privacy: "private" }, { id: sharedNote.noteId, body: sharedNote.body, createdAt: sharedNote.createdAt, privacy: "relationship_shared" }];
  const html = renderToStaticMarkup(<OrbitRealCardConnection contactId={route.contact.id} viewModel={model} />);
  assert.equal((html.match(/aria-label="添加联系人备注"/gu) ?? []).length, 2);
  assert.equal((html.match(/CRM mock 案例/gu) ?? []).length, 2, "private notes must not be duplicated in the timeline");
  assert.equal((html.match(/双方可见的纪要/gu) ?? []).length, 2);
});

test("detail presentation keeps private note text and identity intact in every UI language", async () => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  if (route.routeState !== "success") throw new Error("Missing fixture");
  route.contact.notes = [{ ...route.contact.notes[0], ...privateNote, evidenceIds: ["evidence:not-this-note"] }];
  const { contactDetailPageViewModel } = await import("../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-page-view-model");
  for (const language of ["zh", "en", "ja"] as const) {
    const view = contactDetailPageViewModel(route, language);
    assert.equal(view.connections[0].notes[0].body, body);
    assert.equal(view.connections[0].notes[0].id, privateNote.noteId);
  }
});

test("a confirmed note survives source refresh and an account-key change discards all prior local notes", async (t) => {
  const route = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  if (route.routeState !== "success") throw new Error("Missing fixture");
  let model = contactDetailRouteToOrbitContactsViewModel(route);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "http://localhost/app/contacts/demo-contact-1" }, addEventListener() {}, removeEventListener() {} } });
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: true, data: {} }));
  let root!: ReactTestRenderer;
  const element = (actor = "actor:A") => <OrbitRealCardConnection key={`${actor}:${route.contact.id}`} contactId={route.contact.id} viewModel={model} />;
  t.after(() => {
    if (root) act(() => root.unmount());
    if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document");
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
  });
  await act(async () => { root = create(element()); });
  await act(async () => { root.root.findAllByProps({ "aria-label": "添加联系人备注" })[0].props.onClick(); });
  const onSaved = root.root.findByType(ContactNotesEditor).props.onSaved;
  model = { ...model, connections: model.connections.map((contact) => ({ ...contact })) };
  await act(async () => { root.update(element()); });
  await act(async () => { onSaved([{ id: privateNote.noteId, body, createdAt: privateNote.createdAt, privacy: "private" }]); });
  assert.equal(root.root.findAllByProps({ children: body }).length, 2);
  await act(async () => { root.update(element("actor:B")); });
  assert.equal(root.root.findAllByProps({ children: body }).length, 0);
});

async function mount(t: TestContext, fetcher: typeof fetch, id = contactId) {
  t.mock.method(globalThis, "fetch", fetcher);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  const { ContactNotesEditor } = await import("../../app/(app)/app/contacts/contact-notes-editor");
  const saved: OrbitContactNoteView[][] = [];
  let root!: ReactTestRenderer;
  const element = () => <ContactNotesEditor contactId={id} language="zh" onClose={() => {}} onSaved={(notes) => saved.push(notes)} />;
  await act(async () => { root = create(element()); });
  t.after(() => {
    act(() => root.unmount());
    if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document");
  });
  return { root, element, saved, input: () => root.root.findByType("textarea"), save: () => root.root.findByProps({ "data-contact-note-save": true }) };
}

test("note save sends only the reviewed note and blocks empty or duplicate pending writes", async (t) => {
  const calls: { path: string; init?: RequestInit }[] = [];
  let respond!: (value: Response) => void;
  const ui = await mount(t, (async (path, init) => { calls.push({ path: String(path), init }); return new Promise<Response>((resolve) => { respond = resolve; }); }) as typeof fetch);
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(calls.length, 0);
  await act(async () => { ui.input().props.onChange({ target: { value: `  ${body}  ` } }); });
  let pending!: Promise<void>;
  await act(async () => { pending = ui.save().props.onClick(); void ui.save().props.onClick(); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/contacts/contact%3Aone%2Ftwo");
  assert.equal(calls[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { note: { body, authorLabel: "我" } });
  assert.equal(ui.input().props.disabled, true);
  await act(async () => { respond(ack()); await pending; });
  assert.deepEqual(ui.saved, [[{ id: privateNote.noteId, body, createdAt: privateNote.createdAt, privacy: "private" }]]);
  assert.equal(ui.input().props.value, "");
});

test("failed or unconfirmed responses preserve the draft until a valid private note is acknowledged", async (t) => {
  let attempt = 0;
  const ui = await mount(t, (async () => {
    attempt++;
    if (attempt === 1) throw new Error("offline");
    if (attempt === 2) return ack([privateNote], "another-contact");
    if (attempt === 3) return ack([{ ...privateNote, body: "wrong body" }]);
    if (attempt === 4) return ack([{ ...privateNote, privacy: "relationship_shared" }]);
    if (attempt === 5) return ack([{ ...privateNote, createdAt: "" }]);
    if (attempt === 6) return Response.json({ success: true, data: {} });
    return ack();
  }) as typeof fetch);
  await act(async () => { ui.input().props.onChange({ target: { value: body } }); });
  for (let index = 0; index < 6; index++) {
    await act(async () => { await ui.save().props.onClick(); });
    assert.equal(ui.saved.length, 0);
    assert.equal(ui.input().props.value, body);
    assert.ok(ui.root.root.findByProps({ role: "alert" }));
  }
  await act(async () => { ui.root.update(ui.element()); });
  assert.equal(ui.input().props.value, body);
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(ui.saved.length, 1);
});

test("a late note response cannot update a contact after the editor closes", async (t) => {
  let respond!: (value: Response) => void;
  const ui = await mount(t, (async () => new Promise<Response>((resolve) => { respond = resolve; })) as typeof fetch);
  await act(async () => { ui.input().props.onChange({ target: { value: body } }); });
  let pending!: Promise<void>;
  await act(async () => { pending = ui.save().props.onClick(); });
  act(() => ui.root.unmount());
  await act(async () => { respond(ack()); await pending; });
  assert.equal(ui.saved.length, 0);
});

test("a matching legacy timestamp is accepted without narrowing the shared note contract", async (t) => {
  const ui = await mount(t, (async () => ack([{ ...privateNote, createdAt: "昨天" }])) as typeof fetch);
  await act(async () => { ui.input().props.onChange({ target: { value: body } }); });
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(ui.input().props.value, "");
  assert.equal(ui.saved[0]?.[0]?.createdAt, "昨天");
});

test("real PATCH and private storage survive a lost reply without duplicate notes or unrelated changes", async (t) => {
  const { createMemoryLiveRecordStore } = await import("../../shared/storage/live-record-store");
  const { seedGeneratedRelationshipFixturesIntoLiveStore } = await import("../../shared/storage/seed-generated-fixtures");
  const { createStorageContactGraphProvider } = await import("../../features/contacts/storage/contact-live-record-provider");
  const { createLiveContactDetailTagStatusService } = await import("../../features/contacts/live-detail-service");
  const { contactDetailTagStatusServiceFactory } = await import("../../features/contacts/service-factory");
  const { createContactDetailPatchHandler } = await import("../../app/api/contacts/[id]/handler");
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:notes-editor";
  const actorId = "actor:notes-editor";
  const id = "contact_078";
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    for (const record of await store.listRecords({ collectionName, workspaceId })) {
      await store.upsertRecord({ ...record, userId: actorId, payload: { ...record.payload, accountId: actorId } });
    }
  }
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  const service = () => createLiveContactDetailTagStatusService({ provider });
  const before = await service().updateContactDetail({ actorId, contactId: id, primaryIndustryId: "finance_investment", addTags: ["已有标签"], lastInteraction: { channel: "email_signal", occurredAt: "2026-09-07T01:00:00.000Z", summary: "已有互动" } });
  if (!before.success || !before.data.contact) throw new Error("Missing owned fixture");
  const resolution = contactDetailTagStatusServiceFactory.create("mock");
  t.mock.method(contactDetailTagStatusServiceFactory, "create", () => ({ ...resolution, service: service() }));
  const patch = createContactDetailPatchHandler(async () => ({ id: actorId }));
  let attempts = 0;
  const ui = await mount(t, (async (path, init) => {
    assert.equal(path, "/api/contacts/contact_078");
    assert.deepEqual(JSON.parse(String(init?.body)), { note: { body, authorLabel: "我" } });
    const response = await patch(new Request(`http://localhost${path}`, init), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 200);
    if (++attempts === 1) throw new Error("Lost reply after commit");
    return response;
  }) as typeof fetch, id);
  await act(async () => { ui.input().props.onChange({ target: { value: body } }); });
  await act(async () => { await ui.save().props.onClick(); });
  assert.ok(ui.root.root.findByProps({ role: "alert" }));
  assert.equal(ui.input().props.value, body);
  assert.equal(ui.saved.length, 0);
  const first = await provider.readContactDetailState!(id, actorId);
  const firstNote = first?.notes.find((note) => note.body === body);
  assert.ok(firstNote);
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(ui.saved.length, 1);
  assert.equal(ui.input().props.value, "");
  const after = await service().getContactDetail({ actorId, contactId: id });
  if (!after.success || !after.data.contact) throw new Error("Missing saved fixture");
  const notes = after.data.contact.notes.filter((note) => note.body === body);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].privacy, "private");
  assert.equal(notes[0].noteId, firstNote.noteId);
  assert.equal(notes[0].createdAt, firstNote.createdAt);
  assert.deepEqual(notes[0].evidenceIds, []);
  assert.equal(after.data.contact.primaryIndustryId, before.data.contact.primaryIndustryId);
  assert.equal(after.data.contact.status, before.data.contact.status);
  assert.deepEqual(after.data.contact.tags, before.data.contact.tags);
  assert.deepEqual(after.data.contact.lastInteraction, before.data.contact.lastInteraction);
});
