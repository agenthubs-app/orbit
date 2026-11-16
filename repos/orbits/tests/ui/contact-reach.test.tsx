import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";

// contact-reach R41 (SC-R41-01…05): the Web 連絡する flow rendered for real in Chromium with a recorded fetch.
//   ① drawer entry (path line from eligibility, 📅 in the head, no 下書きを作成 / 予定を追加 buttons, bone while reading)
//   ② message path: template → 候補の時間を入れる → one POST …/messages { body, proposal } (retry = same key),
//      canStart → conversations/start first, canProposeMeeting:false hides the insert, 409 → the ongoing meeting,
//      unsent text kept per account + contact + path and cleared after sending
//   ③ e-mail path: inserted paragraph, re-pick replaces it, mailto encoding, no address → disabled, 0 relationship calls
//   ④ picker: 可約時間 grid (busy / off / picked), 3 preselected, insert in one step, incomplete calendars → none
//   ⑤ 設定 › 日程: read + save on change, invalid combinations are not offered, failed save reverts
//   ⑥ proposal card: これにする → accept, own proposal / expired states, 409 → reread + notice
const NOW = Date.parse("2030-04-01T00:00:00.000Z"); // a Monday, 09:00 in Tokyo
const RULES = { weekdays: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "18:00", lunch: { start: "12:00", end: "13:00" }, durationMinutes: 60, minimumNotice: "15m", bufferMinutes: 0, timeZoneMode: "fixed", timeZone: "UTC", updatedAt: "2030-03-01T00:00:00.000Z" };
const candidate = (id: string, at: string) => ({ candidateId: id, startsAtUtc: at });
const meeting = (patch: Record<string, unknown> = {}) => ({
  appointmentId: "apt-1", confirmed: null, contactId: "c-mori", details: "", detailsUpdatedAt: null, detailsUpdatedBy: null, eventId: null, pendingProposalRevision: 1,
  proposals: [{ candidateTimes: [candidate("k1", "2030-04-02T10:00:00.000Z"), candidate("k2", "2030-04-03T14:00:00.000Z"), candidate("k3", "2030-04-05T16:00:00.000Z")], createdAt: "2030-03-31T00:00:00.000Z", durationMinutes: 60, medium: { kind: "video", provider: "other", joinUrl: null }, note: "", proposedBy: "other", revision: 1, timezone: "UTC" }],
  status: "awaiting_response", title: "面談", updatedAt: "2030-03-31T00:00:00.000Z", version: 2, visibility: "participants", ...patch,
});

let browser: Browser;
let code: { js: string; css: string };
test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { SessionContext } from "next-auth/react";
    import { Orbit2026Scope, ToastProvider } from "./app/(app)/app/orbit-2026/ui";
    import { OrbitLanguageProvider } from "./app/(app)/app/orbit-language-context";
    import { ContactReachModal } from "./app/(app)/app/orbit-2026/network/ContactReachModal";
    import { ContactDrawer } from "./app/(app)/app/orbit-2026/network/ContactDrawer";
    import { MeetingProposalModal } from "./app/(app)/app/orbit-2026/calendar/MeetingProposalModal";
    import { AppointmentProposalCard } from "./app/(app)/app/orbit-2026/inbox/AppointmentProposalCard";
    import { ScheduleSettings } from "./app/(app)/app/orbit-2026/account/ScheduleSettings";
    const realNow = Date.now.bind(Date);
    const offset = ${NOW} - realNow();
    Date.now = () => realNow() + offset;
    const f = window.fx = { calls: [], replies: {}, closes: 0, inserted: null };
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const ok = (data) => json(200, { success: true, data });
    window.fetch = async (input, init = {}) => {
      const url = String(input), method = init.method || "GET";
      const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      f.calls.push({ url, method, key: headers["idempotency-key"] || null, body: init.body ? JSON.parse(init.body) : undefined });
      const queued = Object.entries(f.replies).find(([pattern]) => new RegExp(pattern).test(method + " " + url));
      if (queued) { const list = queued[1]; const reply = Array.isArray(list) ? (list.length > 1 ? list.shift() : list[0]) : list; return json(reply.status, reply.body); }
      if (url.startsWith("/api/scheduling/availability")) return method === "PUT" ? ok({ ...JSON.parse(init.body), updatedAt: "2030-04-01T00:00:01.000Z" }) : ok(f.rules);
      if (url.startsWith("/api/schedule-items")) return ok({ scheduleItems: f.busy || [] });
      if (url.startsWith("/api/calendar/external-events")) return ok({ provider: "google_calendar", connection: "not_connected", events: [], asOf: "2030-04-01T00:00:00.000Z" });
      if (url.includes("/reconnect-draft")) return ok({ draft: { subject: "ご無沙汰しております", body: "森さん、ご無沙汰しております。\\n\\nどうぞよろしくお願いいたします。" } });
      if (url === "/api/integrations") return ok([{ provider: "google_calendar", status: "active", healthStatus: "healthy" }]);
      return json(404, { success: false, error: { code: "NOT_FOUND" } });
    };
    const session = { status: "authenticated", data: { user: { id: "acct-1" }, expires: "2099-01-01" }, update: async () => null };
    const root = createRoot(document.getElementById("root"));
    window.mount = (kind, props = {}) => {
      const close = () => { f.closes++; window.mount("none"); };
      const view = kind === "reach" ? <ContactReachModal open contactId="c-mori" name="森 健二" email="" eligibility={null} onClose={close} {...props} />
        : kind === "picker" ? <MeetingProposalModal mode="insert" open minimum={3} requirePlace onClose={close} onInsert={(value) => { f.inserted = value; }} {...props} />
        : kind === "card" ? <AppointmentProposalCard appointmentId="apt-1" peerName="森 健二" {...props} />
        : kind === "settings" ? <ScheduleSettings />
        : kind === "drawer" ? <ContactDrawer contactId="c-mori" inviteLinked={false} onClose={close} {...props} />
        : null;
      root.render(<SessionContext.Provider value={session}><OrbitLanguageProvider initialLanguage="ja"><Orbit2026Scope language="ja"><ToastProvider>{view}</ToastProvider></Orbit2026Scope></OrbitLanguageProvider></SessionContext.Provider>);
    };
  `, { "^next/link$": `import React from "react"; export default React.forwardRef(function Link({ href, prefetch, ...rest }, ref) { return <a ref={ref} href={String(href)} {...rest} />; });` });
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function page(t: { after: (fn: () => Promise<void>) => void }, setup: Record<string, unknown> = {}): Promise<Page> {
  // A real origin: localStorage (the unsent-draft store) is not available on about:blank.
  const p = await open(browser, code, { origin: "https://orbit.test/" });
  t.after(async () => { assert.deepEqual(errorsOf(p), []); await p.close(); });
  await p.evaluate((value) => { Object.assign((window as any).fx, { rules: value.rules, busy: value.busy ?? [] }, value.extra ?? {}); }, { rules: RULES, ...setup } as any);
  return p;
}
const calls = (p: Page) => p.evaluate(() => (window as any).fx.calls as { url: string; method: string; key: string | null; body?: any }[]);
const reply = (p: Page, pattern: string, value: unknown) => p.evaluate(([pattern, value]) => { (window as any).fx.replies[pattern as string] = value; }, [pattern, value] as const);
const mount = (p: Page, kind: string, props: Record<string, unknown> = {}) => p.evaluate(([kind, props]) => (window as any).mount(kind, props), [kind, props] as const);
const ORBIT = { canSend: false, canStart: true, canProposeMeeting: true, activeAppointmentId: null, conversationId: null, qualificationVersion: null };

test("④ picker: 可約時間 grid, busy / off cells, 3 preselected, insert in one step", async (t) => {
  const p = await page(t, { busy: [{ id: "personal:busy", sourceId: "personal:busy", accountId: "acct-1", ownerUserId: "acct-1", kind: "personal", category: "personal", state: "upcoming", title: "予定",
    startsAt: "2030-04-02T09:00:00.000Z", endsAt: "2030-04-02T10:00:00.000Z", createdAt: "2030-03-01T00:00:00.000Z", updatedAt: "2030-03-01T00:00:00.000Z" }] });
  await mount(p, "picker");
  await p.locator("[data-slot-picker]").waitFor();
  assert.match(await p.locator("[data-slot-rules]").innerText(), /平日 09:00–18:00 · 15分前まで/);
  assert.equal(await p.locator('[data-slot-rules] a').getAttribute("href"), "/app/settings/schedule");
  const picked = (await p.locator('button[aria-pressed="true"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-slot")))).sort();
  assert.deepEqual(picked, ["2030-04-02T10:00:00.000Z", "2030-04-03T09:00:00.000Z", "2030-04-04T09:00:00.000Z"], "next free slot per day, busy 09:00 on 4/2 skipped");
  const busy = p.locator('[data-slot="2030-04-02T09:00:00.000Z"]');
  assert.equal(await busy.getAttribute("data-slot-state"), "busy"); assert.equal(await busy.isDisabled(), true);
  const lunch = p.locator('[data-slot="2030-04-03T12:00:00.000Z"]');
  assert.equal(await lunch.getAttribute("data-slot-state"), "off"); assert.equal(await lunch.isDisabled(), true);
  assert.equal(await p.locator("[data-slot-hint]").innerText(), "Orbit の予定だけで判断しています");
  await p.locator('[data-slot="2030-04-05T15:00:00.000Z"]').click();
  await p.getByRole("button", { name: "4 件を挿入" }).click();
  const inserted = await p.evaluate(() => (window as any).fx.inserted);
  assert.equal(inserted.slots.length, 4); assert.equal(inserted.durationMinutes, 60); assert.equal(inserted.timeZone, "UTC");
  assert.deepEqual(inserted.medium, { kind: "video", provider: "other", joinUrl: null });
  assert.ok(!(await calls(p)).some((call) => call.method !== "GET"), "the picker never writes");
});

test("④ picker: incomplete calendars preselect nothing and need 3 for a proposal; in person needs a place", async (t) => {
  const p = await page(t);
  await reply(p, "GET /api/calendar/external-events", { status: 503, body: { success: false } });
  await mount(p, "picker");
  await p.locator("[data-slot-picker]").waitFor();
  assert.equal(await p.locator('button[aria-pressed="true"]').count(), 0);
  assert.equal(await p.locator('[data-slot="2030-04-02T10:00:00.000Z"]').getAttribute("data-slot-state"), "unknown");
  for (const at of ["2030-04-02T10:00:00.000Z", "2030-04-03T10:00:00.000Z"]) await p.locator(`[data-slot="${at}"]`).click();
  assert.equal(await p.locator("[data-slot-hint]").innerText(), "3〜5 件選んでください");
  assert.equal(await p.getByRole("button", { name: "2 件を挿入" }).isDisabled(), true);
  await p.locator('[data-slot="2030-04-04T10:00:00.000Z"]').click();
  await p.getByRole("tab", { name: "対面" }).click();
  assert.equal(await p.getByRole("button", { name: "3 件を挿入" }).isDisabled(), true, "in person without a place");
  await p.getByLabel("場所", { exact: true }).fill("渋谷オフィス");
  assert.equal(await p.getByRole("button", { name: "3 件を挿入" }).isDisabled(), false);
});

test("② message path: canStart → start, then ONE POST with body + proposal; retry reuses the key; draft cleared", async (t) => {
  const p = await page(t);
  await reply(p, "POST /api/relationship-communication/conversations/start", { status: 200, body: { success: true, data: { contactId: "c-mori", status: "confirmed", canInvite: false, canSend: true, canProposeMeeting: true, conversationId: "conv-1", qualificationVersion: "qv-1" } } });
  await reply(p, "POST /api/relationship-communication/conversations/conv-1/messages", [{ status: 503, body: { success: false, error: { code: "SERVICE_UNAVAILABLE" } } }, { status: 201, body: { success: true, data: { conversationId: "conv-1", deliveryState: "delivered", message: { messageId: "m1", appointmentId: "apt-9" } } } }]);
  await mount(p, "reach", { eligibility: ORBIT });
  await p.locator('[data-reach-path="orbit"]').waitFor();
  await p.locator("[data-reach-body]").waitFor();
  assert.match(await p.locator("[data-reach-body]").inputValue(), /森さん、ご無沙汰しております。/);
  await p.locator("[data-reach-insert]").click();
  await p.locator("[data-slot-picker]").waitFor();
  await p.getByRole("button", { name: "3 件を挿入" }).click();
  await p.locator("[data-reach-proposal]").waitFor();
  assert.match(await p.locator("[data-reach-proposal]").innerText(), /候補の時間 · 60分 · オンライン[\s\S]*4\/2（火）09:00 – 10:00/);
  assert.equal(await p.locator(".hint, [class*=hint]").filter({ hasText: "双方のカレンダー" }).count() > 0, true);
  await p.locator("[data-reach-send]").click();
  await p.locator('[data-reach-error="reachSendFailed"]').waitFor();
  assert.match(await p.locator("[data-reach-body]").inputValue(), /森さん/, "text kept after a failure");
  await p.locator("[data-reach-send]").click();
  await p.waitForFunction(() => (window as any).fx.closes === 1);
  const writes = (await calls(p)).filter((call) => call.method === "POST" && call.url.startsWith("/api/relationship-communication"));
  assert.deepEqual(writes.map((call) => call.url), ["/api/relationship-communication/conversations/start", "/api/relationship-communication/conversations/conv-1/messages", "/api/relationship-communication/conversations/conv-1/messages"]);
  const [first, second] = writes.slice(1);
  assert.ok(first!.key && first!.key === second!.key, "the retry reuses the Idempotency-Key");
  assert.equal(first!.body.qualificationVersion, "qv-1");
  assert.equal(first!.body.proposal.candidateTimes.length, 3);
  assert.deepEqual(Object.keys(first!.body.proposal).sort(), ["candidateTimes", "durationMinutes", "medium", "note", "timezone"]);
  assert.equal(first!.body.proposal.timezone, "UTC");
  assert.ok(!(await calls(p)).some((call) => call.url.startsWith("/api/appointments") && call.method === "POST"), "no separate initial-proposal write");
  assert.equal(await p.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("orbit.contactReach.draft:")).length), 0, "sent → draft cleared");
});

test("② canProposeMeeting:false hides the insert; the unsent text survives a reopen and stays with its contact", async (t) => {
  const p = await page(t);
  await mount(p, "reach", { eligibility: { ...ORBIT, canSend: true, canStart: false, canProposeMeeting: false, conversationId: "conv-1", qualificationVersion: "qv" } });
  await p.locator("[data-reach-body]").waitFor();
  assert.equal(await p.locator("[data-reach-insert]").count(), 0);
  await p.locator("[data-reach-body]").fill("まだ送らない文章");
  await p.getByRole("button", { name: "キャンセル" }).click();
  await mount(p, "reach", { eligibility: { ...ORBIT, canSend: true, canStart: false, canProposeMeeting: false, conversationId: "conv-1", qualificationVersion: "qv" } });
  await p.locator("[data-reach-body]").waitFor();
  assert.equal(await p.locator("[data-reach-body]").inputValue(), "まだ送らない文章");
  await mount(p, "none");
  await mount(p, "reach", { contactId: "c-other", name: "他の人", eligibility: { ...ORBIT, canSend: true, canStart: false, conversationId: "conv-2", qualificationVersion: "qv" } });
  await p.locator("[data-reach-body]").waitFor();
  assert.notEqual(await p.locator("[data-reach-body]").inputValue(), "まだ送らない文章");
  assert.deepEqual(await p.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("orbit.contactReach.draft:")).sort()), ["orbit.contactReach.draft:acct-1:c-mori:orbit", "orbit.contactReach.draft:acct-1:c-other:orbit"]);
});

test("② 409 MEETING_ALREADY_ACTIVE: the times give way to the ongoing meeting with 日程を変更; an active meeting shows instead of the insert", async (t) => {
  const p = await page(t);
  await reply(p, "POST /api/relationship-communication/conversations/conv-1/messages", { status: 409, body: { success: false, error: { code: "CONFLICT", context: { reason: "MEETING_ALREADY_ACTIVE", appointmentId: "apt-1" } } } });
  await reply(p, "GET /api/appointments/apt-1$", { status: 200, body: { success: true, data: meeting({ status: "confirmed", pendingProposalRevision: null, confirmed: { candidateId: "k2", proposalRevision: 1, durationMinutes: 60, medium: { kind: "video", provider: "other", joinUrl: null }, startsAtUtc: "2030-04-03T14:00:00.000Z", timezone: "UTC" } }) } });
  await mount(p, "reach", { eligibility: { ...ORBIT, canSend: true, canStart: false, conversationId: "conv-1", qualificationVersion: "qv" } });
  await p.locator("[data-reach-insert]").click();
  await p.getByRole("button", { name: "3 件を挿入" }).click();
  await p.locator("[data-reach-send]").click();
  await p.locator("[data-reach-active]").waitFor();
  await p.locator("[data-appointment-reschedule]").waitFor();
  assert.equal(await p.locator("[data-reach-proposal]").count(), 0);
  assert.equal(await p.locator("[data-reach-insert]").count(), 0);
  await mount(p, "none");
  await mount(p, "reach", { contactId: "c-x", eligibility: { ...ORBIT, activeAppointmentId: "apt-1" } });
  await p.locator("[data-appointment-confirmed]").waitFor();
  assert.equal(await p.locator("[data-reach-insert]").count(), 0, "D2b: no new times while a meeting is ongoing");
});

test("③ e-mail path: paragraph inserted and replaced, mailto encoded, no address → disabled, no relationship request", async (t) => {
  const p = await page(t);
  await mount(p, "reach", { email: "mori@example.test" });
  await p.locator('[data-reach-path="email"]').waitFor();
  await p.locator("[data-reach-body]").waitFor();
  assert.match(await p.locator("[data-reach-to]").innerText(), /mori@example\.test · 名刺のアドレス/);
  await p.locator("[data-reach-insert]").click();
  await p.locator('[data-slot="2030-04-02T09:00:00.000Z"]').waitFor();
  await p.getByRole("button", { name: "3 件を挿入" }).click();
  const first = await p.locator("[data-reach-body]").inputValue();
  assert.match(first, /以下の日時のいずれかで、60 分ほどお時間をいただけますでしょうか（オンライン）。\n・4\/2（火）09:00–10:00\n・4\/3（水）09:00–10:00\n・4\/4（木）09:00–10:00\n\nどうぞよろしくお願いいたします。$/);
  await p.locator("[data-reach-body]").fill(`追記：資料も添えます。\n${first}`);
  await p.getByRole("button", { name: "時間を選び直す" }).click();
  await p.locator('[data-slot="2030-04-04T09:00:00.000Z"]').click();
  await p.getByRole("button", { name: "2 件を挿入" }).click();
  const second = await p.locator("[data-reach-body]").inputValue();
  assert.ok(second.startsWith("追記：資料も添えます。\n"), "hand edits stay");
  assert.equal((second.match(/以下の日時のいずれかで/g) ?? []).length, 1, "only the inserted paragraph is replaced");
  assert.ok(!second.includes("4/4（木）"));
  const href = await p.locator("a[data-reach-mailto]").getAttribute("href");
  assert.ok(href!.startsWith("mailto:mori@example.test?subject=%E3%81%94"));
  assert.equal(decodeURIComponent(new URL(href!).searchParams.get("body") === null ? "" : href!.split("&body=")[1]!), second.replace(/\n/g, "\r\n"));
  await mount(p, "none");
  await mount(p, "reach", { contactId: "c-nomail", email: "" });
  await p.locator("[data-reach-body]").waitFor();
  assert.match(await p.locator("[data-reach-to]").innerText(), /名刺にメールアドレスがありません/);
  assert.equal(await p.locator("button[data-reach-mailto]").isDisabled(), true);
  assert.equal(await p.locator("[data-reach-send]").count(), 0);
  assert.ok(!(await calls(p)).some((call) => call.url.includes("/relationship-communication/") || call.url.startsWith("/api/appointments")), "0 relationship / appointment requests");
});

test("① drawer: bone while reading, then 連絡する with the path line; 📅 in the head; no 下書きを作成 / 予定を追加 buttons", async (t) => {
  const p = await page(t);
  const detail = { contact: { id: "c-mori", displayName: "森 健二", organization: "モリタ", role: "部長", status: "active", primaryEmail: "mori@example.test", nextAction: "近況を聞く", tags: [], notes: [], fieldHistory: [] } };
  await reply(p, "GET /api/contacts/c-mori$", { status: 200, body: { success: true, data: detail } });
  await reply(p, "GET /api/contacts/value-lines", { status: 200, body: { success: true, data: { lines: [{ contactId: "c-mori", relation: "ロボット業界の営業", evidence: [] }] } } });
  await p.evaluate(() => { (window as any).holdEligibility = new Promise((resolve) => { (window as any).releaseEligibility = resolve; }); const original = window.fetch; window.fetch = async (input, init) => { if (String(input).includes("/eligibility")) await (window as any).holdEligibility; return original(input, init); }; });
  await reply(p, "GET /api/relationship-communication/eligibility", { status: 200, body: { success: true, data: { contactId: "c-mori", status: "unregistered", canInvite: false, canSend: false, canStart: true, canProposeMeeting: true } } });
  await mount(p, "drawer");
  await p.locator('[data-network-reach="loading"]').waitFor();
  assert.equal(await p.locator("[data-network-reach-open]").isDisabled(), true);
  await p.waitForTimeout(800); // the drawer's slide-in has settled
  const before = await p.locator("[data-network-reach-open]").boundingBox();
  await p.evaluate(() => (window as any).releaseEligibility());
  await p.locator('[data-network-reach="orbit"]').waitFor();
  assert.match(await p.locator('[data-network-reach="orbit"]').innerText(), /連絡する\s*メッセージ · 相手は Orbit を利用中/);
  assert.deepEqual(await p.locator("[data-network-reach-open]").boundingBox(), before, "the button does not move when the path arrives");
  assert.equal(await p.locator("[data-network-schedule]").getAttribute("aria-label"), "予定を追加");
  assert.match((await p.locator("[data-network-schedule]").getAttribute("href"))!, /^\/app\/tasks\?tab=calendar&new=1&contactId=c-mori$/);
  const text = await p.locator("[data-contact-drawer]").innerText();
  assert.ok(!text.includes("下書きを作成") && !text.includes("送信はしません"));
  assert.equal(await p.getByRole("button", { name: "予定を追加" }).count(), 0);
  await p.locator("[data-network-reach-open]").click();
  await p.locator('[data-reach-path="orbit"]').waitFor();
});

test("① drawer: an unreadable eligibility falls back to the e-mail path", async (t) => {
  const p = await page(t);
  await reply(p, "GET /api/contacts/c-mori$", { status: 200, body: { success: true, data: { contact: { id: "c-mori", displayName: "森 健二", organization: "", role: "", status: "active", primaryEmail: "", nextAction: "近況を聞く", tags: [], notes: [], fieldHistory: [] } } } });
  await reply(p, "GET /api/relationship-communication/eligibility", { status: 503, body: { success: false } });
  await mount(p, "drawer");
  await p.locator('[data-network-reach="email"]').waitFor();
  assert.match(await p.locator('[data-network-reach="email"]').innerText(), /メールの下書き · 送信はご自身で/);
});

test("⑥ card: これにする accepts with the version; your own proposal waits; expired shows only 別の時間を提案; 409 rereads", async (t) => {
  const p = await page(t);
  await reply(p, "GET /api/appointments/apt-1$", { status: 200, body: { success: true, data: meeting() } });
  await reply(p, "POST /api/appointments/apt-1/commands", [{ status: 409, body: { success: false } }, { status: 200, body: { success: true, data: { ...meeting({ status: "confirmed", version: 3, pendingProposalRevision: null, confirmed: { candidateId: "k2", proposalRevision: 1, durationMinutes: 60, medium: { kind: "video", provider: "other", joinUrl: null }, startsAtUtc: "2030-04-03T14:00:00.000Z", timezone: "UTC" } }), replayed: false } } }]);
  await mount(p, "card");
  await p.locator('[data-appointment-card="pending"]').waitFor();
  assert.match(await p.locator("[data-appointment-card]").innerText(), /森 健二 さんから日程の提案 · 60分 · オンライン/);
  assert.equal(await p.getByRole("button", { name: "これにする" }).count(), 3);
  await p.locator('[data-appointment-pick="k2"]').click();
  await p.getByText("提案が更新されていました。最新の内容から選び直してください。").waitFor();
  await p.locator('[data-appointment-pick="k2"]').click();
  await p.locator("[data-appointment-confirmed]").waitFor();
  assert.match(await p.locator("[data-appointment-confirmed]").innerText(), /確定\s*4\/3（水）\d\d:00 – \d\d:00\s*· オンライン/);
  const commands = (await calls(p)).filter((call) => call.method === "POST");
  assert.deepEqual(commands.map((call) => call.body), [{ candidateId: "k2", command: "accept", expectedVersion: 2 }, { candidateId: "k2", command: "accept", expectedVersion: 2 }]);
  assert.ok(commands.every((call) => call.key));
  await reply(p, "GET /api/appointments/apt-1$", { status: 200, body: { success: true, data: meeting({ proposals: [{ ...meeting().proposals[0], proposedBy: "you" }] }) } });
  await mount(p, "none"); await mount(p, "card");
  await p.locator('[data-appointment-card="mine"]').waitFor();
  assert.equal(await p.getByRole("button", { name: "これにする" }).count(), 0);
  assert.match(await p.locator("[data-appointment-card]").innerText(), /返事待ち/);
  await reply(p, "GET /api/appointments/apt-1$", { status: 200, body: { success: true, data: meeting({ proposals: [{ ...meeting().proposals[0], candidateTimes: [candidate("o1", "2030-03-20T01:00:00.000Z"), candidate("o2", "2030-03-21T01:00:00.000Z"), candidate("o3", "2030-03-22T01:00:00.000Z")] }] }) } });
  await mount(p, "none"); await mount(p, "card");
  await p.locator('[data-appointment-card="expired"]').waitFor();
  assert.equal(await p.getByRole("button", { name: "これにする" }).count(), 0);
  assert.equal(await p.locator("[data-appointment-counter]").innerText(), "別の時間を提案");
});

test("⑤ 設定 › 日程: reads, saves each change, never offers an end before the start, reverts a failed save", async (t) => {
  const p = await page(t);
  await mount(p, "settings");
  await p.locator("[data-schedule-settings]").waitFor();
  await p.locator('[data-schedule-calendar="connected"]').waitFor();
  await p.locator('[data-schedule-day="sat"]').click();
  await p.waitForFunction(() => (window as any).fx.calls.some((call: any) => call.method === "PUT"));
  let puts = (await calls(p)).filter((call) => call.method === "PUT");
  assert.deepEqual(puts[0]!.body.weekdays, ["mon", "tue", "wed", "thu", "fri", "sat"]);
  assert.deepEqual(Object.keys(puts[0]!.body).sort(), ["bufferMinutes", "durationMinutes", "end", "lunch", "minimumNotice", "start", "timeZone", "timeZoneMode", "weekdays"]);
  await p.getByText("保存しました").first().waitFor();
  const endOptions = await p.getByLabel("時間帯 · 終了").locator("option").evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
  assert.ok(endOptions.every((time) => time > "09:00"), "no end at or before the start");
  await reply(p, "PUT /api/scheduling/availability", { status: 503, body: { success: false } });
  await p.getByLabel("最短の事前時間").selectOption("1d");
  await p.getByText("保存できませんでした").first().waitFor();
  assert.equal(await p.getByLabel("最短の事前時間").inputValue(), "15m", "a failed save goes back to what is stored");
  puts = (await calls(p)).filter((call) => call.method === "PUT");
  assert.equal(puts.length, 2);
});
