import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SessionContext } from "next-auth/react";
import { useCalendarPage } from "../../app/(app)/app/orbit-2026/calendar/useCalendarPage";

const item = { id: "p", sourceId: "p", kind: "personal", category: "personal", title: "Private", startsAt: "2026-10-18T09:00:00Z", state: "upcoming" };
const native = () => Response.json({ success: true, data: { scheduleItems: [item] } });
const google = (connection = "connected") => Response.json({ success: true, data: { provider: "google_calendar", connection, events: [{ id: "g", titlePreview: "Google", startsAt: "2026-10-18", allDay: true }], asOf: "2026-10-18T00:00:00Z" } });
let current: ReturnType<typeof useCalendarPage>;
function Reader({ date = "2026-10-18", zone = "UTC", enabled = true }: { date?: string; zone?: string; enabled?: boolean }) { current = useCalendarPage(zone, date, "day", "ja", enabled); return null; }

test("calendar internal and external reads settle independently so a failed Google source does not erase native schedules", async t => {
  let settle!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", (url: string) => url.includes("external-events") ? new Promise<Response>(resolve => { settle = resolve; }) : Promise.resolve(native()));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Reader />); });
  t.after(() => act(() => root.unmount()));
  assert.equal(current.internal.state, "ready"); assert.equal(current.internal.data?.items[0]?.id, "p");
  assert.equal(current.external.state, "loading");
  await act(async () => settle(Response.json({ success: false }, { status: 503 })));
  assert.equal(current.external.state, "failed"); assert.equal(current.internal.data?.items[0]?.id, "p");
});
test("range/timezone/account changes hide old data immediately and ignore late prior responses", async t => {
  const pending: ((response: Response) => void)[] = [];
  t.mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => pending.push(resolve)));
  const render = (account: string, date: string, zone = "UTC") => <SessionContext.Provider value={{ status: "authenticated", data: { user: { id: account }, expires: "2099-01-01" }, update: async () => null }}><Reader date={date} zone={zone} /></SessionContext.Provider>;
  let root: ReactTestRenderer;
  await act(async () => { root = create(render("a", "2026-10-18")); });
  t.after(() => act(() => root.unmount()));
  await act(async () => root.update(render("a", "2026-10-19", "Asia/Tokyo")));
  assert.equal(current.internal.data, null); assert.equal(current.external.data, null);
  await act(async () => { pending[2]!(native()); pending[3]!(google()); });
  assert.equal(current.internal.state, "ready");
  await act(async () => { pending[0]!(Response.json({ success: true, data: { scheduleItems: [{ ...item, title: "OLD_ACCOUNT_SECRET" }] } })); pending[1]!(google()); });
  assert.equal(current.internal.data?.items[0]?.title, "Private");
  await act(async () => root.update(render("b", "2026-10-19", "Asia/Tokyo")));
  assert.equal(current.internal.data, null); assert.equal(current.external.data, null);
  await act(async () => { pending[4]!(native()); pending[5]!(google("not_connected")); });
  assert.equal(current.external.data?.connection, "not_connected"); assert.deepEqual(current.external.data?.events, []);
});
test("a denial from either endpoint clears both private source snapshots and cannot be undone by late success", async t => {
  let denied = false;
  t.mock.method(globalThis, "fetch", async (url: string) => url.includes("external-events") ? denied ? Response.json({ success: false }, { status: 401 }) : google() : native());
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Reader />); });
  t.after(() => act(() => root.unmount()));
  assert.equal(current.internal.state, "ready"); assert.equal(current.external.state, "ready");
  denied = true;
  await act(async () => { await current.refresh(); });
  assert.equal(current.denied, true);
  assert.equal(current.internal.state, "failed"); assert.equal(current.internal.data, null); assert.equal(current.external.data, null);
});
test("disabled, unresolved-session and invalid-date readers make no request", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return native(); });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Reader enabled={false} />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => root.update(<SessionContext.Provider value={{ status: "loading", data: null, update: async () => null }}><Reader /></SessionContext.Provider>));
  await act(async () => root.update(<Reader date="2026-02-30" />));
  assert.equal(calls, 0); assert.equal(current.internal.state, "failed");
});
