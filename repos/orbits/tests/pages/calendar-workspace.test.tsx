import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { SessionContext } from "next-auth/react";
import { CalendarWorkspace } from "../../app/(app)/app/orbit-2026/calendar/CalendarWorkspace";
import { CalendarTaskSlot } from "../../app/(app)/app/orbit-2026/calendar/CalendarTaskSlot";
import { MeetingProposalModal } from "../../app/(app)/app/orbit-2026/calendar/MeetingProposalModal";
import { ShellSlotsProvider } from "../../app/(app)/app/orbit-2026/shell/slots";
import { ConfirmDialog } from "../../app/(app)/app/orbit-2026/ui";
import type { PersonalScheduleContract } from "../../shared/contract/tasks";

const at = "2030-03-01T00:00:00Z";
const personal: PersonalScheduleContract = { id: "personal:p", sourceId: "personal:p", accountId: "a", ownerUserId: "a", title: "Private schedule", startsAt: "2030-04-01T09:00:00Z", endsAt: "2030-04-01T10:00:00Z", timeZone: "UTC", state: "upcoming", category: "personal", kind: "personal", createdAt: at, updatedAt: at };
const google = (connected = false) => Response.json({ success: true, data: { provider: "google_calendar", connection: connected ? "connected" : "not_connected", events: connected ? [{ id: "g", titlePreview: "External read-only", startsAt: "2030-04-01", allDay: true }] : [], asOf: at } });
const meetingSchedule = { id: "schedule:meeting:1", sourceId: "meeting:1", kind: "meeting", category: "meeting", state: "upcoming", title: "Meeting with B", startsAt: "2030-04-08T09:00:00Z", endsAt: "2030-04-08T10:00:00Z" };
const meeting = () => ({ appointmentId: "meeting:1", contactId: "contact-b", status: "confirmed", visibility: "participants", title: "Meeting with B", version: 3, updatedAt: at, details: "", detailsUpdatedAt: null, detailsUpdatedBy: null, eventId: "event:1", pendingProposalRevision: null, confirmed: { candidateId: "old:1", proposalRevision: 1, durationMinutes: 60, medium: { kind: "in_person", location: "Room 1" }, startsAtUtc: "2030-04-08T09:00:00Z", timezone: "UTC" }, proposals: [] });
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");
const button = (root: ReactTestRenderer, label: string) => { const buttons = root.root.findAllByType("button"); const found = buttons.find(node => node.props["aria-label"] === label || text(node) === label) ?? buttons.find(node => text(node).endsWith(label)); assert.ok(found, `Missing button: ${label}`); return found; };
function stubDocument() { const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document"); Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } }); return () => descriptor ? Object.defineProperty(globalThis, "document", descriptor) : Reflect.deleteProperty(globalThis, "document"); }

test("product calendar mode/navigation reads actual selected native windows", async t => {
  const ranges: URLSearchParams[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => { if (url.includes("external-events")) return google(); ranges.push(new URL(url, "http://localhost").searchParams); return Response.json({ success: true, data: { scheduleItems: [] } }); });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-01" />); });
  t.after(() => act(() => root.unmount()));
  assert.equal(ranges[0]?.get("scope"), "calendar");
  assert.equal(ranges[0]?.get("from"), "2030-04-01T00:00:00.000Z", "the Task calendar opens on the board's week");
  await act(async () => button(root!, "月").props.onClick());
  assert.equal(ranges.at(-1)?.get("from"), "2030-03-31T00:00:00.000Z");
  await act(async () => button(root!, "週").props.onClick());
  assert.equal(ranges.at(-1)?.get("from"), "2030-04-01T00:00:00.000Z");
  await act(async () => button(root!, "次の期間").props.onClick());
  assert.equal(ranges.at(-1)?.get("from"), "2030-04-08T00:00:00.000Z");
  await act(async () => button(root!, "日").props.onClick());
  assert.equal(ranges.at(-1)?.get("to"), "2030-04-09T00:00:00.000Z");
});
test("personal detail is verified before editing and save refreshes the mounted calendar", async t => {
  const restore = stubDocument(); const calls: string[] = []; let canonical = personal;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("external-events")) return google();
    if (url.includes("?scope=calendar")) return Response.json({ success: true, data: { scheduleItems: [canonical] } });
    if (init?.method === "PATCH") { const body = JSON.parse(String(init.body)); canonical = { ...canonical, ...body.patch, updatedAt: "2030-03-01T00:00:01Z" }; }
    return Response.json({ success: true, data: { scheduleItem: canonical } });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-01" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, "Private schedule").props.onClick());
  assert.ok(calls.includes("GET /api/schedule-items/personal%3Ap"));
  await act(async () => button(root!, "予定を編集").props.onClick());
  const title = root!.root.findAllByType("input").find(node => node.props["aria-label"] === "予定のタイトル")!;
  await act(async () => title.props.onChange({ target: { value: "Updated personal" } }));
  await act(async () => root!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.ok(calls.includes("PATCH /api/schedule-items/personal%3Ap"));
  assert.ok(JSON.stringify(root!.toJSON()).includes("Updated personal"));
  assert.ok(JSON.stringify(root!.toJSON()).includes("予定を保存しました"));
});
test("Google detail stays read-only and calendar quick-add opens the native personal form", async t => {
  const restore = stubDocument(); const writes: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => { if (init?.method && init.method !== "GET") writes.push(url); return url.includes("external-events") ? google(true) : Response.json({ success: true, data: { scheduleItems: [] } }); });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-01" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, "External read-only").props.onClick());
  assert.equal(root!.root.findAllByType("button").filter(node => text(node) === "予定を編集").length, 0);
  assert.equal(root!.root.findAllByType("button").filter(node => text(node) === "予定を削除").length, 0);
  await act(async () => root!.root.findAllByType("button").find(node => node.props["aria-label"] === "閉じる")!.props.onClick());
  await act(async () => root!.root.findAllByType("button").find(node => node.props["data-task-add"] === "")!.props.onClick());
  assert.ok(root!.root.findAllByType("input").some(node => node.props["aria-label"] === "予定のタイトル"));
  assert.deepEqual(writes, []);
});

test("calendar meeting verifies its native detail before offering the reschedule flow", async t => {
  const restore = stubDocument(); const reads: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("external-events")) return google();
    if (url.includes("scope=calendar")) return Response.json({ success: true, data: { scheduleItems: [meetingSchedule] } });
    reads.push(url);
    return Response.json({ success: true, data: meeting() });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-08" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => root!.root.findAllByType("button").find(node => text(node).includes("Meeting with B"))!.props.onClick());
  assert.deepEqual(reads, ["/api/appointments/meeting%3A1"]);
  assert.ok(root!.root.findAllByType("button").some(node => text(node) === "面談を動かす"));
  await act(async () => button(root!, "面談を動かす").props.onClick());
  const proposal = root!.root.findByType(MeetingProposalModal);
  assert.equal(proposal.props.appointmentId, "meeting:1");
  assert.equal(proposal.props.contactId, "contact-b");
});

test("calendar meeting cancellation waits for confirmation and a verified native readback", async t => {
  const restore = stubDocument(); let current = meeting(); const writes: string[] = []; let scheduleReads = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (url.includes("external-events")) return google();
    if (url.includes("scope=calendar")) { scheduleReads++; return Response.json({ success: true, data: { scheduleItems: current.status === "cancelled" ? [] : [meetingSchedule] } }); }
    if (init?.method === "POST") { writes.push(url); current = { ...current, status: "cancelled", version: 4 }; return Response.json({ success: true, data: { ...current, replayed: false } }); }
    return Response.json({ success: true, data: current });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-08" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => root!.root.findAllByType("button").find(node => text(node).includes("Meeting with B"))!.props.onClick());
  await act(async () => button(root!, "面談をキャンセル").props.onClick());
  assert.deepEqual(writes, []);
  assert.equal(root!.root.findByType(ConfirmDialog).props.open, true);
  await act(async () => root!.root.findByType(ConfirmDialog).props.onConfirm());
  assert.deepEqual(writes, ["/api/appointments/meeting%3A1/commands"]);
  assert.ok(scheduleReads >= 2, "the calendar refreshes after verified cancellation");
  assert.ok(JSON.stringify(root!.toJSON()).includes("面談をキャンセルしました"));
});

test("a stale calendar row cannot offer actions after the native meeting was cancelled", async t => {
  const restore = stubDocument();
  t.mock.method(globalThis, "fetch", async (url: string) => url.includes("external-events") ? google() : url.includes("scope=calendar") ? Response.json({ success: true, data: { scheduleItems: [meetingSchedule] } }) : Response.json({ success: true, data: { ...meeting(), status: "cancelled", version: 4 } }));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-08" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => root!.root.findAllByType("button").find(node => text(node).includes("Meeting with B"))!.props.onClick());
  assert.ok(JSON.stringify(root!.toJSON()).includes("この面談はキャンセルされています。"));
  assert.equal(root!.root.findAllByType("button").filter(node => text(node) === "面談を動かす" || text(node) === "面談をキャンセル").length, 0);
});

test("calendar meeting detail refuses actions when the native read is denied", async t => {
  const restore = stubDocument(); let writes = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (url.includes("external-events")) return google();
    if (url.includes("scope=calendar")) return Response.json({ success: true, data: { scheduleItems: [meetingSchedule] } });
    if (init?.method === "POST") writes++;
    return new Response(null, { status: 403 });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-08" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => root!.root.findAllByType("button").find(node => text(node).includes("Meeting with B"))!.props.onClick());
  assert.equal(root!.root.findAllByType("button").filter(node => text(node) === "面談を動かす" || text(node) === "面談をキャンセル").length, 0);
  assert.equal(writes, 0);
  assert.ok(JSON.stringify(root!.toJSON()).includes("予定を読み込めませんでした"));
});

test("calendar meeting cancellation never celebrates an unverified native readback", async t => {
  const restore = stubDocument(); let writes = 0; let detailReads = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (url.includes("external-events")) return google();
    if (url.includes("scope=calendar")) return Response.json({ success: true, data: { scheduleItems: [meetingSchedule] } });
    if (init?.method === "POST") { writes++; return Response.json({ success: true, data: { ...meeting(), status: "cancelled", version: 4, replayed: false } }); }
    detailReads++;
    return Response.json({ success: true, data: meeting() });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-08" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => root!.root.findAllByType("button").find(node => text(node).includes("Meeting with B"))!.props.onClick());
  await act(async () => button(root!, "面談をキャンセル").props.onClick());
  await act(async () => root!.root.findByType(ConfirmDialog).props.onConfirm());
  assert.equal(writes, 1);
  assert.equal(detailReads, 2);
  assert.ok(JSON.stringify(root!.toJSON()).includes("面談を更新できませんでした"));
  assert.ok(!JSON.stringify(root!.toJSON()).includes("面談をキャンセルしました"));
});

test("Task shell uses its header add button without showing a second calendar add button", async t => {
  const restore = stubDocument();
  t.mock.method(globalThis, "fetch", async (url: string) => url.includes("external-events") ? google() : Response.json({ success: true, data: { scheduleItems: [] } }));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<ShellSlotsProvider><CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-01" /></ShellSlotsProvider>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  const add = root!.root.findAllByType("button").find(node => node.props["data-task-add"] === "");
  assert.ok(add);
  assert.equal(add.props.hidden, true);
  assert.equal(add.parent?.parent?.props.style?.display, "none", "the hidden calendar add control must not reserve shell spacing");
  await act(async () => add.props.onClick());
  assert.ok(root!.root.findAllByType("input").some(node => node.props["aria-label"] === "予定のタイトル"));
});

test("midnight preserves an unsaved personal draft but account changes discard its private contents", async t => {
  const restore = stubDocument();
  t.mock.method(globalThis, "fetch", async (url: string) => url.includes("external-events") ? google() : Response.json({ success: true, data: { scheduleItems: [] } }));
  const render = (account: string, today: string) => <SessionContext.Provider value={{ status: "authenticated", data: { user: { id: account }, expires: "2099-01-01" }, update: async () => null }}><CalendarWorkspace actorId={account} language="ja" timeZone="UTC" today={today} initialAdd /></SessionContext.Provider>;
  let root: ReactTestRenderer;
  await act(async () => { root = create(render("a", "2030-04-01")); });
  t.after(() => { act(() => root.unmount()); restore(); });
  const input = (label: string) => root!.root.findAllByType("input").find(node => node.props["aria-label"] === label)!;
  await act(async () => input("予定のタイトル").props.onChange({ target: { value: "Private unsaved draft" } }));
  await act(async () => root.update(render("a", "2030-04-02")));
  assert.equal(input("予定のタイトル").props.value, "Private unsaved draft");
  assert.equal(root!.root.findAllByType("input").find(node => node.props.type === "date")!.props.value, "2030-04-01");
  await act(async () => root.update(render("b", "2030-04-02")));
  assert.equal(input("予定のタイトル").props.value, "");
  assert.ok(!JSON.stringify(root!.toJSON()).includes("Private unsaved draft"));
});

test("a denied personal read clears an unsaved editor instead of reviving it after retry", async t => {
  const restore = stubDocument(); let denied = false;
  t.mock.method(globalThis, "fetch", async (url: string) => url.includes("external-events") ? denied ? Response.json({ success: false }, { status: 401 }) : google() : Response.json({ success: true, data: { scheduleItems: [] } }));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-01" initialAdd />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  const title = root!.root.findAllByType("input").find(node => node.props["aria-label"] === "予定のタイトル")!;
  await act(async () => title.props.onChange({ target: { value: "No revival after denial" } }));
  denied = true;
  await act(async () => root.update(<CalendarWorkspace actorId="a" language="en" timeZone="UTC" today="2030-04-01" initialAdd />));
  assert.equal(root!.root.findAllByType("input").length, 0);
  denied = false;
  await act(async () => button(root!, "Try again").props.onClick());
  assert.equal(root!.root.findAllByType("input").length, 0);
  assert.ok(!JSON.stringify(root!.toJSON()).includes("No revival after denial"));
});

test("Task calendar slot follows the device local day and clears its clock on unmount", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2030-04-30T23:59:00Z") });
  const resolved = Intl.DateTimeFormat.prototype.resolvedOptions;
  t.mock.method(Intl.DateTimeFormat.prototype, "resolvedOptions", function (this: Intl.DateTimeFormat) { return { ...resolved.call(this), timeZone: "UTC" }; });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window"); let tick!: () => void, cleared = false;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setInterval(callback: () => void, delay: number) { assert.equal(delay, 60_000); tick = callback; return 123; }, clearInterval(id: number) { assert.equal(id, 123); cleared = true; } } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); });
  const ranges: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => { if (url.includes("external-events")) return google(); ranges.push(new URL(url, "http://localhost").searchParams.get("from")!); return Response.json({ success: true, data: { scheduleItems: [] } }); });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<CalendarTaskSlot actorId="a" />); });
  assert.equal(ranges.at(-1), "2030-04-29T00:00:00.000Z");
  await act(async () => { t.mock.timers.setTime(Date.parse("2030-05-01T00:00:00Z")); tick(); });
  assert.equal(ranges.at(-1), "2030-04-29T00:00:00.000Z");
  await act(async () => root.unmount());
  assert.equal(cleared, true);
});
