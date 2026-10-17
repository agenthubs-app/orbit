import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { CalendarPersonalEditor } from "../../app/(app)/app/orbit-2026/calendar/CalendarPersonalEditor";
import { createPersonalScheduleClient } from "../../app/(app)/app/tasks/personal-schedule-client";
import { Orbit2026Scope } from "../../app/(app)/app/orbit-2026/ui";
import type { PersonalScheduleContract } from "../../shared/contract/tasks";

const at = "2030-03-01T00:00:00Z";
const value: PersonalScheduleContract = { id: "personal:new", sourceId: "personal:new", accountId: "a", ownerUserId: "a", kind: "personal", category: "personal", title: "Created", state: "upcoming", startsAt: "2030-04-01T00:00:00Z", endsAt: "2030-04-01T01:00:00Z", timeZone: "Asia/Tokyo", createdAt: at, updatedAt: at };
const coverage = { from: "2030-03-31T15:00:00Z", to: "2030-04-01T15:00:00Z", complete: false };
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");
const button = (root: ReactTestRenderer, label: string) => { const found = root.root.findAllByType("button").find(node => text(node) === label); assert.ok(found, `Missing button: ${label}`); return found; };
const field = (root: ReactTestRenderer, label: string) => { const found = root.root.findAllByType("input").find(node => node.props["aria-label"] === label); assert.ok(found, `Missing field: ${label}`); return found; };
function stubDocument() { const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document"); Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } }); return () => descriptor ? Object.defineProperty(globalThis, "document", descriptor) : Reflect.deleteProperty(globalThis, "document"); }

test("new personal editor keeps selected local date and writes native recurrence/reminder only after receipt/readback", async t => {
  const restore = stubDocument(); const writes: any[] = []; const saved: unknown[] = [];
  let canonical = value;
  const client = createPersonalScheduleClient("a", async (_url, init) => {
    if (init?.method === "POST") { const body = JSON.parse(String(init.body)); writes.push(body); const { idempotencyKey: _key, ...fields } = body; canonical = { ...value, ...fields }; }
    return Response.json({ success: true, data: { scheduleItem: canonical } });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><CalendarPersonalEditor item={null} date="2030-04-01" timeZone="Asia/Tokyo" client={client} entries={[]} coverage={coverage} onSaved={item => { saved.push(item); }} onClose={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  assert.equal(field(root!, "開始日").props.value, "2030-04-01");
  await act(async () => field(root!, "予定のタイトル").props.onChange({ target: { value: "Created" } }));
  await act(async () => root!.root.findByProps({ "aria-label": "繰り返し" }).props.onChange({ target: { value: "weekly" } }));
  await act(async () => root!.root.findByProps({ "aria-label": "リマインダー" }).props.onChange({ target: { value: "15" } }));
  await act(async () => root!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(writes.length, 1); assert.equal(writes[0].startsAt, "2030-04-01T00:00:00.000Z");
  assert.deepEqual(writes[0].recurrence, { frequency: "weekly" }); assert.equal(writes[0].reminderMinutes, 15);
  assert.equal(saved.length, 1);
});

test("known overlap requires explicit save, and a failed native write preserves input and retry identity", async t => {
  const restore = stubDocument(); const writes: any[] = []; let fail = true; let canonical = value;
  const client = createPersonalScheduleClient("a", async (_url, init) => {
    if (init?.method === "POST") { const body = JSON.parse(String(init.body)); writes.push(body); if (fail) return Response.json({ success: false }, { status: 503 }); const { idempotencyKey: _key, ...fields } = body; canonical = { ...value, ...fields }; }
    return Response.json({ success: true, data: { scheduleItem: canonical } });
  });
  let root: ReactTestRenderer;
  const entry = { key: "external:g", id: "g", sourceId: "g", kind: "external" as const, title: "Known conflict", startsAt: value.startsAt, endsAt: value.endsAt, allDay: false, readOnly: true };
  await act(async () => { root = create(<Orbit2026Scope language="ja"><CalendarPersonalEditor item={null} date="2030-04-01" timeZone="Asia/Tokyo" client={client} entries={[entry]} coverage={coverage} onSaved={() => {}} onClose={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => field(root!, "予定のタイトル").props.onChange({ target: { value: "Created" } }));
  await act(async () => root!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(writes.length, 0); assert.ok(JSON.stringify(root!.toJSON()).includes("Known conflict"));
  await act(async () => button(root!, "このまま保存").props.onClick());
  assert.equal(field(root!, "予定のタイトル").props.value, "Created"); assert.ok(root!.root.findAllByProps({ role: "alert" }).length > 0);
  fail = false;
  await act(async () => button(root!, "このまま保存").props.onClick());
  assert.equal(writes.length, 2); assert.equal(writes[0].idempotencyKey, writes[1].idempotencyKey);
});

test("recurring occurrence requires explicit scope, disables series rules and preserves dirty input when scope changes", async t => {
  const restore = stubDocument(); const writes: any[] = [];
  const baseline: PersonalScheduleContract = { ...value, id: "series:occurrence:2030-04-01", sourceId: "series", seriesId: "series", occurrenceDate: "2030-04-01", recurrence: { frequency: "weekly" } };
  let canonical = baseline;
  const client = createPersonalScheduleClient("a", async (_url, init) => { if (init?.method === "PATCH") { const body = JSON.parse(String(init.body)); writes.push(body); canonical = { ...baseline, ...body.patch, updatedAt: "2030-03-01T00:00:01Z" }; } return Response.json({ success: true, data: { scheduleItem: canonical } }); });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><CalendarPersonalEditor item={baseline} date="2030-04-01" timeZone="Asia/Tokyo" client={client} entries={[]} coverage={coverage} onSaved={() => {}} onClose={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  assert.equal(button(root!, "保存").props.disabled, true);
  await act(async () => button(root!, "この予定だけ").props.onClick());
  await act(async () => field(root!, "予定のタイトル").props.onChange({ target: { value: "Updated" } }));
  assert.equal(button(root!, "シリーズ全体").props.disabled, true);
  assert.equal(root!.root.findByProps({ "aria-label": "繰り返し" }).props.disabled, true);
  await act(async () => root!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(writes[0].scope, "occurrence"); assert.deepEqual(writes[0].patch, { title: "Updated" });
});

test("series scope is loaded from native series identity before rules can be changed", async t => {
  const restore = stubDocument(); const reads: string[] = [];
  const occurrence: PersonalScheduleContract = { ...value, id: "series:occurrence:2030-04-01", sourceId: "series", seriesId: "series", occurrenceDate: "2030-04-01", recurrence: { frequency: "weekly" } };
  const series = { ...value, id: "series", sourceId: "series", title: "Series authority", recurrence: { frequency: "weekly" as const } };
  const client = createPersonalScheduleClient("a", async url => { reads.push(String(url)); return Response.json({ success: true, data: { scheduleItem: series } }); });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><CalendarPersonalEditor item={occurrence} date="2030-04-01" timeZone="Asia/Tokyo" client={client} entries={[]} coverage={coverage} onSaved={() => {}} onClose={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, "シリーズ全体").props.onClick());
  assert.deepEqual(reads, ["/api/schedule-items/series"]);
  assert.equal(field(root!, "予定のタイトル").props.value, "Series authority");
  assert.equal(root!.root.findByProps({ "aria-label": "繰り返し" }).props.disabled, false);
  await act(async () => button(root!, "予定を削除").props.onClick());
  assert.ok(JSON.stringify(root!.toJSON()).includes("シリーズ全体を削除しますか？"));
});

test("personal deletion requires confirmation and verified native disappearance", async t => {
  const restore = stubDocument(); const writes: string[] = []; const saved: unknown[] = [];
  const client = createPersonalScheduleClient("a", async (_url, init) => {
    if (init?.method === "DELETE") { writes.push("DELETE"); return Response.json({ success: true, data: { deleted: true, scheduleItem: { ...value, state: "cancelled", updatedAt: "2030-03-01T00:00:01Z" } } }); }
    return Response.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><CalendarPersonalEditor item={value} date="2030-04-01" timeZone="Asia/Tokyo" client={client} entries={[]} coverage={coverage} onSaved={item => { saved.push(item); }} onClose={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, "予定を削除").props.onClick());
  assert.deepEqual(writes, []); assert.equal(root!.root.findAll(node => node.type === "div" && node.props.role === "alertdialog").length, 1);
  await act(async () => button(root!, "削除する").props.onClick());
  assert.deepEqual(writes, ["DELETE"]); assert.deepEqual(saved, [null]);
});

test("all-day creation keeps 25-hour DST date boundaries", async t => {
  const restore = stubDocument(); const writes: any[] = []; let canonical = value;
  const client = createPersonalScheduleClient("a", async (_url, init) => { if (init?.method === "POST") { const body = JSON.parse(String(init.body)); writes.push(body); const { idempotencyKey: _key, ...fields } = body; canonical = { ...value, ...fields }; } return Response.json({ success: true, data: { scheduleItem: canonical } }); });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><CalendarPersonalEditor item={null} date="2026-11-01" timeZone="America/New_York" client={client} entries={[]} coverage={coverage} onSaved={() => {}} onClose={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => field(root!, "予定のタイトル").props.onChange({ target: { value: "All day" } }));
  await act(async () => root!.root.findByProps({ role: "switch" }).props.onClick());
  await act(async () => root!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(Date.parse(writes[0].endsAt) - Date.parse(writes[0].startsAt), 25 * 3600000);
});
test("dirty editor close retains input until explicit discard", async t => {
  const restore = stubDocument(); let closed = 0;
  const client = createPersonalScheduleClient("a", async () => { throw Error("MUST_NOT_READ_OR_WRITE"); });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><CalendarPersonalEditor item={null} date="2026-11-01" timeZone="UTC" client={client} entries={[]} coverage={coverage} onSaved={() => {}} onClose={() => { closed++; }} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => field(root!, "予定のタイトル").props.onChange({ target: { value: "Unsaved" } }));
  await act(async () => root!.root.findAllByType("button").find(node => node.props["aria-label"] === "閉じる")!.props.onClick());
  assert.equal(closed, 0);
  await act(async () => button(root!, "変更を破棄").props.onClick());
  assert.equal(closed, 1);
});
