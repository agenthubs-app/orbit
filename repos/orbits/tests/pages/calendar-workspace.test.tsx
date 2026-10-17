import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { SessionContext } from "next-auth/react";
import { CalendarWorkspace } from "../../app/(app)/app/orbit-2026/calendar/CalendarWorkspace";
import { CalendarTaskSlot } from "../../app/(app)/app/orbit-2026/calendar/CalendarTaskSlot";
import type { PersonalScheduleContract } from "../../shared/contract/tasks";

const at = "2030-03-01T00:00:00Z";
const personal: PersonalScheduleContract = { id: "personal:p", sourceId: "personal:p", accountId: "a", ownerUserId: "a", title: "Private schedule", startsAt: "2030-04-01T09:00:00Z", endsAt: "2030-04-01T10:00:00Z", timeZone: "UTC", state: "upcoming", category: "personal", kind: "personal", createdAt: at, updatedAt: at };
const google = (connected = false) => Response.json({ success: true, data: { provider: "google_calendar", connection: connected ? "connected" : "not_connected", events: connected ? [{ id: "g", titlePreview: "External read-only", startsAt: "2030-04-01", allDay: true }] : [], asOf: at } });
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
  assert.equal(ranges.at(-1), "2030-03-31T00:00:00.000Z");
  await act(async () => { t.mock.timers.setTime(Date.parse("2030-05-01T00:00:00Z")); tick(); });
  assert.equal(ranges.at(-1), "2030-04-28T00:00:00.000Z");
  await act(async () => root.unmount());
  assert.equal(cleared, true);
});
