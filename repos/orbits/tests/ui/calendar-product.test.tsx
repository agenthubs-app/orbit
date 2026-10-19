import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";
import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";

declare global { interface Window { calendar: { calls: { path: string; method: string }[] }; meetingState: { posts: number; detailReads: number } } }

let browser: Browser;
let code: { js: string; css: string };
test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { CalendarWorkspace } from "./app/(app)/app/orbit-2026/calendar/CalendarWorkspace";
    let sequence = 0;
    if (!crypto.randomUUID) Object.defineProperty(crypto, "randomUUID", { value: () => "test-calendar-" + (++sequence) });
    window.calendar = { calls: [], rows: [], revision: 0 };
    window.fetch = async (url, init = {}) => {
      const state = window.calendar, path = String(url), method = init.method || "GET";
      state.calls.push({ path, method });
      if (path.includes("external-events")) return Response.json({ success: true, data: { provider: "google_calendar", connection: "connected", events: [{ id: "google:1", titlePreview: "Google reference", startsAt: "2030-04-01", endsAt: "2030-04-02", allDay: true }], asOf: "2030-03-01T00:00:00Z" } });
      if (path.includes("scope=calendar")) return Response.json({ success: true, data: { scheduleItems: state.rows.filter(row => row.state !== "cancelled") } });
      const id = path.startsWith("/api/schedule-items/") ? decodeURIComponent(path.slice("/api/schedule-items/".length)) : null;
      if (method === "POST") {
        const { idempotencyKey, ...fields } = JSON.parse(init.body);
        const row = { id: "personal:browser", sourceId: "personal:browser", accountId: "a", ownerUserId: "a", kind: "personal", category: "personal", state: "upcoming", createdAt: "2030-03-01T00:00:00Z", updatedAt: "2030-03-01T00:00:01Z", ...fields };
        state.rows.push(row); return Response.json({ success: true, data: { scheduleItem: row } });
      }
      const row = state.rows.find(value => value.id === id);
      if (!row || row.state === "cancelled") return Response.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
      if (method === "PATCH") Object.assign(row, JSON.parse(init.body).patch, { updatedAt: "2030-03-01T00:00:02Z" });
      if (method === "DELETE") { Object.assign(row, { state: "cancelled", updatedAt: "2030-03-01T00:00:03Z" }); return Response.json({ success: true, data: { deleted: true, scheduleItem: row } }); }
      return Response.json({ success: true, data: { scheduleItem: row } });
    };
    createRoot(document.getElementById("root")).render(<CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-01" />);
  `, { "^next-auth/react$": 'import { createContext } from "react"; export const SessionContext = createContext(undefined);' });
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

test("browser: calendar quick add focuses the native form and create/edit/delete follow authoritative readbacks", async t => {
  const page = await open(browser, code);
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  await page.getByRole("button", { name: "予定を追加", exact: true }).click();
  const title = page.getByRole("textbox", { name: "予定のタイトル", exact: true });
  await title.waitFor();
  assert.equal(await title.evaluate(node => node === document.activeElement), true);
  await title.fill("Browser created");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByText("予定を保存しました", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Browser created/ }).first().click();
  await page.getByRole("button", { name: "予定を編集", exact: true }).click();
  await page.getByRole("textbox", { name: "予定のタイトル", exact: true }).fill("Browser edited");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("button", { name: /Browser edited/ }).first().waitFor();
  await page.getByRole("button", { name: /Browser edited/ }).first().click();
  await page.getByRole("button", { name: "予定を編集", exact: true }).click();
  await page.getByRole("button", { name: "予定を削除", exact: true }).click();
  await page.getByRole("alertdialog").waitFor();
  assert.equal(await page.evaluate(() => window.calendar.calls.filter(call => call.method === "DELETE").length), 0);
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await page.getByText("予定を削除しました", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Browser edited/ }).count(), 0);
  assert.deepEqual(await page.evaluate(() => window.calendar.calls.filter(call => call.method !== "GET").map(call => call.method)), ["POST", "PATCH", "DELETE"]);
});

test("browser: external detail is read-only and week/day controls read the selected range", async t => {
  const page = await open(browser, code);
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  await page.getByRole("button", { name: "Google reference", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "予定を編集", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "予定を削除", exact: true }).count(), 0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("tab", { name: "週", exact: true }).click();
  await page.getByRole("button", { name: "次の期間", exact: true }).click();
  await page.getByRole("tab", { name: "日", exact: true }).click();
  await page.waitForFunction(() => window.calendar.calls.some(call => call.path.includes("from=2030-04-08T00%3A00%3A00.000Z") && call.path.includes("to=2030-04-09T00%3A00%3A00.000Z")));
  assert.ok(await page.locator("[data-calendar-day-viewport]").evaluate(node => node.scrollTop) >= 360, "a past selected day opens near the working hours");
  assert.equal(await page.evaluate(() => window.calendar.calls.filter(call => call.method !== "GET").length), 0);
});

test("browser: week summary and selected-day agenda cards share a baseline", async t => {
  const page = await open(browser, code);
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  const cards = page.locator('section[aria-label="カレンダー"] > section');
  await cards.first().waitFor();
  assert.equal(await cards.count(), 2);
  const summary = await cards.nth(0).boundingBox();
  const agenda = await cards.nth(1).boundingBox();
  assert.ok(summary && agenda);
  assert.ok(Math.abs(summary.y - agenda.y) < 1);
  assert.ok(Math.abs(summary.height - agenda.height) < 1, "the two week cards should align at their bottoms");
});

test("browser: cancelling a calendar meeting requires confirmation and removes only the verified appointment", async t => {
  const appointment = { appointmentId: "meeting:1", contactId: "contact-b", status: "confirmed", visibility: "participants", title: "Meeting with B", version: 3, updatedAt: "2030-04-01T00:00:00Z", details: "", detailsUpdatedAt: null, detailsUpdatedBy: null, eventId: "event:1", pendingProposalRevision: null, confirmed: { candidateId: "old:1", proposalRevision: 1, durationMinutes: 60, medium: { kind: "in_person", location: "Room 1" }, startsAtUtc: "2030-04-08T09:00:00Z", timezone: "UTC" }, proposals: [] };
  const meetingCode = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { CalendarWorkspace } from "./app/(app)/app/orbit-2026/calendar/CalendarWorkspace";
    if (!crypto.randomUUID) Object.defineProperty(crypto, "randomUUID", { value: () => "calendar-meeting-test" });
    window.meetingState = { appointment: ${JSON.stringify(appointment)}, posts: 0, detailReads: 0 };
    window.fetch = async (url, init = {}) => {
      const state = window.meetingState, path = String(url);
      if (path.includes("external-events")) return Response.json({ success: true, data: { provider: "google_calendar", connection: "not_connected", events: [], asOf: "2030-04-01T00:00:00Z" } });
      if (path.includes("scope=calendar")) return Response.json({ success: true, data: { scheduleItems: state.appointment.status === "cancelled" ? [] : [{ id: "schedule:meeting:1", sourceId: "meeting:1", kind: "meeting", category: "meeting", state: "upcoming", title: "Meeting with B", startsAt: "2030-04-08T09:00:00Z", endsAt: "2030-04-08T10:00:00Z" }] } });
      if (path === "/api/appointments/meeting%3A1/commands" && init.method === "POST") { state.posts++; state.appointment = { ...state.appointment, status: "cancelled", version: 4 }; return Response.json({ success: true, data: { ...state.appointment, replayed: false } }); }
      if (path === "/api/appointments/meeting%3A1") { state.detailReads++; return Response.json({ success: true, data: state.appointment }); }
      throw Error("Unexpected calendar request: " + path);
    };
    createRoot(document.getElementById("root")).render(<CalendarWorkspace actorId="a" language="ja" timeZone="UTC" today="2030-04-08" />);
  `, { "^next-auth/react$": 'import { createContext } from "react"; export const SessionContext = createContext(undefined);' });
  const page = await open(browser, meetingCode);
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  await page.getByRole("button", { name: /Meeting with B/ }).first().click();
  await page.getByRole("button", { name: "面談をキャンセル", exact: true }).click();
  assert.equal(await page.evaluate(() => window.meetingState.posts), 0);
  await page.getByRole("alertdialog").getByRole("button", { name: "面談をキャンセル", exact: true }).click();
  await page.getByText("面談をキャンセルしました", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => [window.meetingState.posts, window.meetingState.detailReads]), [1, 2]);
  assert.equal(await page.getByRole("button", { name: /Meeting with B/ }).count(), 0);
});
