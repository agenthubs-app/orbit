import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { CalendarPresenter } from "../../app/(app)/app/orbit-2026/calendar/CalendarPresenter";
import { CalendarAgendaRail } from "../../app/(app)/app/orbit-2026/calendar/CalendarAgendaRail";
import { calendarDaysView } from "../../app/(app)/app/orbit-2026/calendar/calendar-view-model";
import { Orbit2026Scope } from "../../app/(app)/app/orbit-2026/ui";

const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");
const noop = () => {};
const base = { date: "2026-10-18", today: "2026-10-18", timeZone: "UTC", mode: "month" as const, internalState: "ready" as const, externalState: "ready" as const, connection: "connected" as const, partial: false, onNavigate: noop, onToday: noop, onModeChange: noop, onDaySelect: noop, onEntrySelect: noop, onAddPersonal: noop, onRetry: noop };
const days = (mode: "month" | "week" | "day") => calendarDaysView({ date: base.date, mode, timeZone: "UTC", language: "ja", internal: [{ id: "p", sourceId: "p", kind: "personal", category: "personal", title: "Private schedule", state: "upcoming", startsAt: "2026-10-18T09:00:00Z", endsAt: "2026-10-18T10:00:00Z" }], external: [{ id: "g", titlePreview: "Google read-only", startsAt: "2026-10-18", allDay: true }] });

test("calendar date and entry controls render through the kit button system", async t => {
  let root: ReactTestRenderer;
  const render = (mode: "month" | "day") => <Orbit2026Scope language="ja"><CalendarPresenter {...base} mode={mode} days={days(mode)} /></Orbit2026Scope>;
  await act(async () => { root = create(render("month")); });
  t.after(() => act(() => root.unmount()));
  const allKitButtons = () => root!.root.findAllByType("button").every(node => String(node.props.className ?? "").split(/\s+/u).includes("btn"));
  assert.equal(allKitButtons(), true);
  await act(async () => root!.update(render("day")));
  assert.equal(allKitButtons(), true);
});

test("month grid renders natural weeks and real date/mode/entry navigation without fetching", async t => {
  const actions: unknown[] = [];
  t.mock.method(globalThis, "fetch", async () => { throw Error("PRESENTER_MUST_NOT_FETCH"); });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><CalendarPresenter {...base} days={days("month")} onNavigate={value => actions.push(value)} onModeChange={value => actions.push(value)} onEntrySelect={entry => actions.push(entry.key)} /></Orbit2026Scope>); });
  t.after(() => act(() => root.unmount()));
  assert.equal(root!.root.findAll(node => node.type === "section" && Boolean(node.props["data-calendar-date"])).length, 35);
  assert.ok(JSON.stringify(root!.toJSON()).includes("Google カレンダーの予定は読み取り専用です"));
  await act(async () => root!.root.findAllByType("button").find(node => node.props["aria-label"] === "次の期間")!.props.onClick());
  await act(async () => root!.root.findAllByType("button").find(node => node.props.role === "tab" && text(node) === "週")!.props.onClick());
  await act(async () => root!.root.findAllByType("button").find(node => text(node).includes("Private schedule"))!.props.onClick());
  assert.deepEqual(actions, [1, "week", "personal:p"]);
});
test("week board shows seven day summaries beside the selected day's timed agenda", async t => {
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><CalendarPresenter {...base} mode="week" days={days("week")} /></Orbit2026Scope>); });
  t.after(() => act(() => root.unmount()));
  const dates = root!.root.findAll(node => node.type === "section" && Boolean(node.props["data-calendar-date"]));
  assert.equal(dates.length, 8, "seven week summaries and one selected-day agenda");
  assert.equal(dates.filter(node => node.props["data-calendar-date"] === base.date).length, 2);
  assert.equal(root!.root.findAllByType("button").filter(node => text(node).includes("Private schedule")).length, 2);
});
test("week heading keeps the ending month when a week crosses a month boundary", async t => {
  const date = "2026-10-30";
  const boundaryDays = calendarDaysView({ date, mode: "week", timeZone: "UTC", language: "ja", internal: [], external: [] });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><CalendarPresenter {...base} date={date} mode="week" days={boundaryDays} /></Orbit2026Scope>); });
  t.after(() => act(() => root.unmount()));
  assert.ok(root!.root.findAllByType("h2").some(node => text(node).includes("10月26日–11月1日")));
});
test("week and day retain timed and all-day events, while external failures leave native entries visible", async t => {
  let root: ReactTestRenderer;
  const render = (mode: "week" | "day") => <Orbit2026Scope language="ja"><CalendarPresenter {...base} mode={mode} days={days(mode)} externalState="failed" connection="unavailable" partial /></Orbit2026Scope>;
  await act(async () => { root = create(render("week")); });
  t.after(() => act(() => root.unmount()));
  assert.equal(root!.root.findAll(node => node.type === "section" && Boolean(node.props["data-calendar-date"])).length, 8);
  assert.ok(JSON.stringify(root!.toJSON()).includes("Private schedule"));
  assert.ok(JSON.stringify(root!.toJSON()).includes("読み取れない予定を除いて表示しています。"));
  assert.ok(root!.root.findAllByProps({ role: "alert" }).length > 0);
  await act(async () => root.update(render("day")));
  assert.equal(root!.root.findAll(node => node.type === "section" && Boolean(node.props["data-calendar-date"])).length, 1);
});
test("not-connected/reconnect shows only whitelisted OAuth entry; unavailable sources never look like a complete empty calendar", async t => {
  let root: ReactTestRenderer;
  const empty = calendarDaysView({ date: base.date, mode: "day", timeZone: "UTC", language: "ja", internal: [], external: [] });
  const render = (connection: "not_connected" | "needs_reconnect" | "unavailable", failed = false) => <Orbit2026Scope language="ja"><CalendarPresenter {...base} mode="day" days={empty} connection={connection} internalState={failed ? "failed" : "ready"} /></Orbit2026Scope>;
  await act(async () => { root = create(render("not_connected")); });
  t.after(() => act(() => root.unmount()));
  assert.equal(root!.root.findByType("a").props.href, "/api/integrations/google_calendar/authorize?returnTo=calendar");
  await act(async () => root.update(render("needs_reconnect")));
  assert.ok(JSON.stringify(root!.toJSON()).includes("再連携"));
  await act(async () => root.update(render("unavailable", true)));
  assert.equal(root!.root.findAllByType("a").length, 0);
  assert.ok(!JSON.stringify(root!.toJSON()).includes("この期間に予定はありません"));
});

test("a readable empty month offers connection and personal schedule actions without masking failures", async t => {
  const empty = calendarDaysView({ date: base.date, mode: "month", timeZone: "UTC", language: "ja", internal: [], external: [] });
  let added = 0;
  const render = (connection: "not_connected" | "unavailable", internalState: "ready" | "failed" = "ready") => <Orbit2026Scope language="ja"><CalendarPresenter {...base} days={empty} connection={connection} internalState={internalState} onAddPersonal={() => { added++; }} /></Orbit2026Scope>;
  let root: ReactTestRenderer;
  await act(async () => { root = create(render("not_connected")); });
  t.after(() => act(() => root.unmount()));
  assert.equal(root!.root.findAllByProps({ "data-calendar-empty-guide": "" }).length, 1);
  assert.ok(root!.root.findAllByType("a").some(node => text(node).includes("Google と連携") && node.props.href === "/api/integrations/google_calendar/authorize?returnTo=calendar"));
  await act(async () => root!.root.findAllByType("button").find(node => text(node).includes("個人の予定を追加"))!.props.onClick());
  assert.equal(added, 1);
  await act(async () => root.update(render("unavailable")));
  assert.equal(root!.root.findAllByProps({ "data-calendar-empty-guide": "" }).length, 0);
  await act(async () => root.update(render("not_connected", "failed")));
  assert.equal(root!.root.findAllByProps({ "data-calendar-empty-guide": "" }).length, 0);
});

test("calendar rail shows only readable selected-day entries and does not call an incomplete window empty", async t => {
  const selectedDay = days("month").find(day => day.date === base.date)!;
  const opened: string[] = [];
  const render = (internalState: "ready" | "failed", externalState: "ready" | "failed") => <Orbit2026Scope language="ja"><CalendarAgendaRail date={base.date} day={selectedDay} today={base.today} internalState={internalState} externalState={externalState} connection="connected" partial={false} onEntrySelect={entry => opened.push(entry.key)} /></Orbit2026Scope>;
  let root: ReactTestRenderer;
  await act(async () => { root = create(render("ready", "ready")); });
  t.after(() => act(() => root.unmount()));
  assert.ok(JSON.stringify(root!.toJSON()).includes("Private schedule"));
  assert.ok(JSON.stringify(root!.toJSON()).includes("Google read-only"));
  await act(async () => root!.root.findAllByType("button").find(node => text(node).includes("Private schedule"))!.props.onClick());
  assert.deepEqual(opened, ["personal:p"]);
  await act(async () => root.update(render("failed", "failed")));
  const failed = JSON.stringify(root!.toJSON());
  assert.ok(!failed.includes("Private schedule") && !failed.includes("Google read-only"));
  assert.ok(failed.includes("予定を読み込めませんでした"));
  assert.ok(!failed.includes("この期間に予定はありません"));
  const emptyDay = calendarDaysView({ date: base.date, mode: "day", timeZone: "UTC", language: "ja", internal: [], external: [] })[0]!;
  await act(async () => root.update(<Orbit2026Scope language="ja"><CalendarAgendaRail date={base.date} day={emptyDay} today={base.today} internalState="ready" externalState="ready" connection="not_connected" partial={false} onEntrySelect={() => {}} /></Orbit2026Scope>));
  const unconnected = JSON.stringify(root!.toJSON());
  assert.ok(unconnected.includes("Google カレンダーは未連携です"));
  assert.ok(!unconnected.includes("この期間に予定はありません"));
});
