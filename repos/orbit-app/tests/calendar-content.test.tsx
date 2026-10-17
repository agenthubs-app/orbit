import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";

import { CalendarContent } from "../src/screens/calendar/CalendarContent";
import type { CalendarExternalView } from "../src/screens/calendar/calendar-external-state";
import { calendarProjection } from "../src/screens/calendar/calendar-projection";
import { OrbitLocaleContext, type OrbitLocaleContextValue } from "../src/i18n/OrbitLocaleContext";
import { createTranslator } from "../src/i18n/messages";
import { renderToHtml, renderedText } from "./helpers/render";

const base = { actorId: "actor-1", dateKey: "2026-10-07", events: { events: [] }, language: "ja" as const, now: new Date("2026-10-07T01:00:00.000Z"), tasks: { tasks: [] }, timeZone: "Asia/Tokyo" };
const scheduleItems = { scheduleItems: [
  { id: "p:1", kind: "personal", title: "Visit", startsAt: "2026-10-07T05:30:00.000Z", endsAt: "2026-10-07T06:30:00.000Z" },
  { id: "m:1", kind: "meeting", title: "Call", startsAt: "2026-10-07T06:00:00.000Z", endsAt: "2026-10-07T06:45:00.000Z" },
] };
const locale: OrbitLocaleContextValue = { choice: "ja", deviceLanguage: "ja", error: null, language: "ja", preference: { mode: "system", language: null, updatedAt: null }, retryLanguageSave: async () => undefined, setLanguage: async () => undefined, source: "device", syncState: "idle", t: createTranslator("ja") };

function view(mode: "month" | "week" | "day", items: unknown = scheduleItems, external?: CalendarExternalView) {
  const projection = calendarProjection({ ...base, mode, scheduleItems: items });
  assert.equal(projection.kind, "ready");
  if (projection.kind !== "ready") throw new Error("fixture projection failed");
  return createElement(OrbitLocaleContext.Provider, { value: locale }, createElement(CalendarContent, {
    mode, projection, ...(external ? { external } : {}), timeZone: "Asia/Tokyo", onConnectExternal() {},
    onChangeMode() {}, onSelectDate() {}, onShift() {}, onToday() {}, onCreate() {}, onOpenItem() {}, onEditPersonal() {},
  }));
}

test("month renders selectable dates, two categories, and a real overlap indication", () => {
  const html = renderToHtml(view("month"));
  const text = renderedText(view("month"));
  assert.match(html, /aria-label="10月7日/u);
  assert.match(text, /Visit/u);
  assert.match(text, /Call/u);
  assert.match(text, /重なっています/u);
  assert.match(text, /時間を変える/u);
  assert.doesNotMatch(text, /空き時間に動かす/u, "no unimplemented one-tap move is presented");
});

test("week and day preserve the same selected agenda and switch controls", () => {
  const week = renderedText(view("week"));
  const day = renderedText(view("day"));
  for (const text of [week, day]) {
    assert.match(text, /日/u);
    assert.match(text, /週/u);
    assert.match(text, /月/u);
    assert.match(text, /Visit/u);
  }
});

test("empty month offers manual creation without pretending Google is connected", () => {
  const text = renderedText(view("month", { scheduleItems: [] }));
  assert.match(text, /個人予定を作成/u);
  assert.doesNotMatch(text, /連携中/u);
});

test("read-only Google events appear in month and day without an edit action", () => {
  const external: CalendarExternalView = { connection: "connected", events: [{ id: "google:one", titlePreview: "External call", startsAt: "2026-10-07T01:00:00.000Z", endsAt: "2026-10-07T02:00:00.000Z", allDay: false }] };
  const month = renderedText(view("month", { scheduleItems: [] }, external));
  const day = renderedText(view("day", { scheduleItems: [] }, external));
  for (const text of [month, day]) { assert.match(text, /External call/u); assert.match(text, /Google/u); }
  assert.doesNotMatch(day, /External call.*時間を変える/u);
});

test("unconnected and expired Google status offers truthful connection action", () => {
  assert.match(renderedText(view("month", { scheduleItems: [] }, { connection: "not_connected", events: [] })), /連携する/u);
  assert.match(renderedText(view("month", { scheduleItems: [] }, { connection: "needs_reconnect", events: [] })), /再連携/u);
  assert.match(renderedText(view("month", { scheduleItems: [] }, { connection: "unavailable", events: [] })), /Google の予定を読み込めません/u);
});

test("calendar container keeps device source and personal editor route instead of local writes", () => {
  // Native source and navigation cannot be exercised through react-native-web's static renderer.
  const source = readFileSync(join(process.cwd(), "src/screens/calendar/CalendarScreen.tsx"), "utf8");
  assert.match(source, /useScheduleCalendarSource/u);
  assert.match(source, /useGlobalSearchParams/u);
  assert.match(source, /calendarSelectionFromRoute/u);
  assert.match(source, /useCalendarExternalEvents/u);
  assert.match(source, /calendarProjection\(/u);
  assert.match(source, /returnTo=calendar/u);
  assert.match(source, /toast\.error\(t\("calendar\.view\.externalOpenFailed"\)\)/u);
  assert.match(source, /schedule\/personal\/new/u);
  assert.match(source, /schedule\/personal\/\$\{encodeURIComponent\(id\)\}\/edit/u);
  assert.doesNotMatch(source, /api\/schedule-items.*PATCH|client\.patch/u);
});

test("external calendar reads are network-only and scoped to the active account and server", () => {
  const source = readFileSync(join(process.cwd(), "src/screens/calendar/useCalendarExternalEvents.ts"), "utf8");
  assert.match(source, /cachePolicy: "network-only"/u);
  assert.match(source, /auth\.notificationSessionRevision/u);
  assert.match(source, /server\.baseUrl/u);
  assert.match(source, /server\.ready/u);
  assert.doesNotMatch(source, /writeSnapshot|useSyncedCollection/u);
});

test("week dot budget never becomes a negative slice when Orbit already fills the row", () => {
  const source = readFileSync(join(process.cwd(), "src/screens/calendar/CalendarContent.tsx"), "utf8");
  assert.match(source, /Math\.max\(0, 3 - \(day\?\.items\.length \?\? 0\)\)/u);
});
