import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { attendeeFixture, participantFixture } from "./helpers/attendee-operations-fixtures";
const require = createRequire(import.meta.url);
let browser: Browser; const scripts = new Map<string, string>();

// The page renders the real route files. Only platform boundaries are replaced: expo-router
// hooks, auth/base-url providers, the snapshot store and `fetch`. `fetch` is answered by an
// in-page stand-in for the documented HTTP contracts (operations workspace + participant,
// check-in, contact-requests create/respond/withdraw, encounters, appointments), which
// records every request so the tests can assert exact method, path, body, cookie and key.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
const listeners = new Set(); let rev = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => rev);
const s = window.fixture = { actor: "account-one", raw: "raw-one", cookie: "authjs.session-token=one", baseUrl: "https://orbit.example", params: { id: "event_1" }, path: "/events/event_1/live", focused: true, requests: [], held: [], hold: false, navigation: [], uuid: 0, statuses: {}, network: false, appointments: [], ...window.initialFixture,
  update(patch) { Object.assign(s, patch); rev++; listeners.forEach(fn => fn()); }
};
Date.now = () => Date.parse("2026-09-17T01:30:00Z");
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ok = (data, status = 200) => json(status, { success: true, data });
const fail = (status, message) => json(status, { success: false, error: { code: status === 403 ? "FORBIDDEN" : status === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE", message } });
function pairRequest(other) { return s.workspace.contactRequests.find(r => (r.requesterParticipantId === "p_me" && r.targetParticipantId === other) || (r.targetParticipantId === "p_me" && r.requesterParticipantId === other)); }
function detailFor(pid) {
  const person = s.workspace.directory.find(p => p.participantId === pid);
  const r = pairRequest(pid);
  return { ...s.participant, participantId: pid, displayName: person.displayName, contactRequest: r ? { contactId: r.contactId, direction: r.requesterParticipantId === "p_me" ? "outgoing" : "incoming", requestId: r.requestId, revision: r.revision, status: r.status } : { contactId: null, direction: null, requestId: null, revision: null, status: "none" } };
}
function answer(url, method, body, key) {
  const path = url.pathname; const e = "/api/events/event_1/operations";
  if (s.network) throw new TypeError("Network request failed");
  if (s.statuses[method + " " + path]) return fail(s.statuses[method + " " + path], "Only registered attendees can open the live workspace.");
  if (method === "GET" && path === "/api/events/public/event_1") return ok({ event: { id: "event_1", title: "东京 AI 产品增长夜", startsAt: "2026-09-17T01:00:00Z", endsAt: "2026-09-17T23:00:00Z", status: "confirmed", venue: "Shibuya Hall" } });
  if (method === "GET" && path === e) return ok(s.workspace);
  const participant = /\\/participants\\/([^/]+)$/.exec(path);
  if (method === "GET" && participant) return ok(detailFor(decodeURIComponent(participant[1])));
  if (method === "POST" && path === e + "/check-in") { s.workspace.checkIn = { participantId: "p_me", checkedInAt: "2026-09-17T01:30:00Z" }; return ok({ eventId: "event_1", participantId: "p_me", actorId: "account-one", checkedInAt: "2026-09-17T01:30:00Z", evidenceId: "ev1" }, 201); }
  if (method === "POST" && path === e + "/contact-requests") {
    const prior = pairRequest(body.targetParticipantId);
    const r = { contactId: null, requestId: prior ? prior.requestId : "req_new", revision: (prior ? prior.revision : 0) + 1, requesterParticipantId: "p_me", targetParticipantId: body.targetParticipantId, status: "awaiting_target_consent", withdrawnAt: null };
    s.workspace.contactRequests = [...s.workspace.contactRequests.filter(x => x !== prior), r]; return ok({ ...r, eventId: "event_1" }, 201);
  }
  const command = /\\/contact-requests\\/([^/]+)\\/(respond|withdraw)$/.exec(path);
  if (method === "POST" && command) {
    const r = s.workspace.contactRequests.find(x => x.requestId === command[1]);
    if (body.expectedRevision !== r.revision) return fail(409, "stale");
    Object.assign(r, { revision: r.revision + 1, status: command[2] === "withdraw" ? "withdrawn" : body.accept ? "accepted" : "declined", withdrawnAt: command[2] === "withdraw" ? "2026-09-17T01:30:00Z" : null, contactId: command[2] === "respond" && body.accept ? "contact_owner" : null });
    return ok({ ...r, eventId: "event_1" });
  }
  if (method === "POST" && path === "/api/encounters") return ok({ encounterId: "enc_1", contactId: body.contactId, eventId: body.eventId, noteText: body.noteText }, 201);
  if (method === "GET" && path === "/api/appointments") return ok(s.appointments);
  if (method === "POST" && path === "/api/appointments") { const a = { appointmentId: "apt_1", authorityRequestId: body.eventContactRequestId, contactId: "contact_owner", eventId: body.eventId, status: "draft", version: 1, confirmed: null, proposals: [] }; s.appointments.push(a); return ok(a, 201); }
  if (method === "POST" && path === "/api/appointments/apt_1/commands") { const a = s.appointments[0]; Object.assign(a, { status: "awaiting_response", version: a.version + 1, proposals: [body.proposal] }); return ok(a); }
  return fail(404, "missing " + method + " " + path);
}
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input)); const method = init.method || "GET"; const headers = new Headers(init.headers);
  const body = init.body ? JSON.parse(init.body) : null;
  s.requests.push({ path: url.pathname, method, body, cookie: headers.get("Cookie"), key: headers.get("idempotency-key"), signal: init.signal });
  if (s.hold) return new Promise(resolve => s.held.push(() => resolve(answer(url, method, body))));
  return answer(url, method, body);
};
export const useOrbitAuthSession = () => { observe(); return { actorId: s.actor, user: { id: s.raw }, cookieHeader: s.cookie, ready: true, signedIn: true }; };
export const useOrbitApiBaseUrl = () => { observe(); return { baseUrl: s.baseUrl, ready: true }; };
export const useLocalSearchParams = () => { observe(); return s.params; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => { observe(); return s.path; };
export const useIsFocused = () => { observe(); return s.focused; };
export const useRouter = () => ({ canGoBack: () => false, back() { s.navigation.push("back"); }, replace(href) { s.navigation.push(href); }, push(href) { s.navigation.push(href); } });
export const Redirect = ({ href }) => { s.navigation.push("redirect:" + href); return null; };
export const Stack = () => null;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
export const Ionicons = () => null;
export const randomUUID = () => "uuid-" + (++s.uuid);
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
// Sprint 0115: the device copy of the event day (three sync domains); empty unless a test seeds it.
export const useLocalEventDay = () => { observe(); const local = s.local ?? { registrations: [], events: [], results: [] }; return { records: local, freshness: { readable: true, loading: false, failure: null, refreshing: false, offline: Boolean(s.network), lastSyncedAt: s.localSyncedAt ?? null, syncLabelKey: "sync.fresh" }, refresh() {} }; };
`;
async function bundle(route: string) {
  const cached = scripts.get(route); if (cached) return cached;
  const result = await build({ stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/${route}"; createRoot(document.getElementById("root")).render(<Route />);`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, jsx: "automatic", format: "iife", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js", ".json"], plugins: [{ name: "boundaries", setup(p) {
    p.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "fixture" }));
    p.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store|useLocalEventDay)$/ }, () => ({ path: "fixture", namespace: "fixture" }));
    p.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents: a.path === "fixture" ? fixture : 'export * from "react-native-web";', loader: "jsx", resolveDir: process.cwd() }));
    p.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
  } }] });
  const script = result.outputFiles[0]!.text; scripts.set(route, script); return script;
}
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(async () => { await browser?.close(); });

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}, route = "events/[id]/live") {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); p.setDefaultTimeout(4000); const errors: string[] = []; p.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort()); await p.setContent('<div id="root"></div>');
  await p.evaluate(value => { (window as any).initialFixture = value; }, { workspace: attendeeFixture(), participant: participantFixture(), ...patch });
  await p.addScriptTag({ content: await bundle(route) }); return p;
}
const requests = (p: Page) => p.evaluate(() => (window as any).fixture.requests.map(({ signal, ...rest }: any) => rest));
const posts = async (p: Page) => (await requests(p)).filter((r: any) => r.method === "POST");
const tab = (p: Page, name: string) => p.getByRole("tab", { name, exact: true }).click();

test("registered attendee sees the live home from the workspace, and every tab renders real sections", async t => {
  const p = await open(t);
  await p.getByText("东京 AI 产品增长夜", { exact: true }).waitFor();
  await p.getByText("1 号桌", { exact: true }).waitFor();
  await p.getByText("第 1 轮 · 2 人", { exact: true }).waitFor();
  await p.getByText("90%", { exact: true }).waitFor();
  const reads = (await requests(p)).map((r: any) => `${r.method} ${r.path}`).sort();
  assert.deepEqual(reads, ["GET /api/events/event_1/operations", "GET /api/events/public/event_1"]);
  assert.ok((await requests(p)).every((r: any) => r.cookie === "authjs.session-token=one"));
  await tab(p, "推荐"); await p.getByText("Shared AI interests", { exact: true }).waitFor();
  await tab(p, "参会者"); await p.getByRole("button", { name: "Other person", exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: "My name", exact: true }).count(), 0);
  await p.getByLabel("搜索参会者").fill("nobody"); await p.getByText("没有匹配的参会者。", { exact: true }).waitFor();
  await tab(p, "分组"); await p.getByText("本组主题：Collaboration", { exact: true }).waitFor(); await p.getByText("Your interests", { exact: true }).waitFor();
  await p.getByRole("button", { name: "切换轮次", exact: true }).click(); await p.getByText("第 2 轮分组", { exact: true }).waitFor();
  await tab(p, "议程"); await p.getByText("还没有发布议程", { exact: true }).waitFor();
  for (const text of ["开始签到", "第一轮分桌", "第二轮话题桌", "进行中"]) await p.getByText(text, { exact: true }).first().waitFor();
  await p.getByText("现场关系", { exact: true }).waitFor();
  assert.deepEqual(await posts(p), []);
});

test("check-in posts once, verifies the receipt and rereads before showing it", async t => {
  const p = await open(t);
  await p.getByRole("button", { name: "立即签到", exact: true }).click();
  await p.getByText("已完成签到", { exact: true }).waitFor();
  const writes = await posts(p);
  assert.equal(writes.length, 1); assert.equal(writes[0].path, "/api/events/event_1/operations/check-in"); assert.deepEqual(writes[0].body, {});
  assert.equal((await requests(p)).filter((r: any) => r.path === "/api/events/event_1/operations").length, 2);
});

test("closed check-in window shows the disabled state and cannot post", async t => {
  const workspace = attendeeFixture(); workspace.checkInAvailable = false;
  const p = await open(t, { workspace });
  await p.getByText("当前不在签到时间内", { exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: "立即签到" }).count(), 0);
});

test("person sheet: request, then withdraw, each with the exact command and a reread; closing reloads the page", async t => {
  const p = await open(t);
  await tab(p, "参会者"); await p.getByRole("button", { name: "Other person", exact: true }).click();
  await p.getByText("未交换", { exact: true }).waitFor();
  await p.getByText("第 1 轮 · 1 号桌", { exact: true }).waitFor();
  await p.getByRole("button", { name: "申请交换名片", exact: true }).click();
  await p.getByRole("button", { name: "已申请 · 撤回", exact: true }).click();
  await p.getByRole("button", { name: "再次申请交换", exact: true }).waitFor();
  const writes = await posts(p);
  assert.deepEqual(writes.map((w: any) => [w.path, w.body]), [
    ["/api/events/event_1/operations/contact-requests", { targetParticipantId: "p_other", expectedRevision: null }],
    ["/api/events/event_1/operations/contact-requests/req_new/withdraw", { expectedRevision: 1 }]
  ]);
  const before = (await requests(p)).filter((r: any) => r.path === "/api/events/event_1/operations").length;
  await p.getByRole("button", { name: "关闭", exact: true }).click();
  await p.waitForFunction(n => (window as any).fixture.requests.filter((r: any) => r.path === "/api/events/event_1/operations").length > n, before);
});

test("incoming request: accept creates the exchange; note and appointment then post the web contracts", async t => {
  const workspace = attendeeFixture();
  workspace.contactRequests = [{ contactId: null, requestId: "req_in", revision: 1, requesterParticipantId: "p_other", targetParticipantId: "p_me", status: "awaiting_target_consent", withdrawnAt: null }];
  const p = await open(t, { workspace, params: { id: "event_1", participant: "p_other" } });
  await p.getByText("对方申请交换", { exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: "记一条笔记", exact: true }).isDisabled(), true);
  await p.getByRole("button", { name: "接受", exact: true }).click();
  await p.getByRole("button", { name: "已交换 · 打开联系人", exact: true }).waitFor();
  await p.getByRole("button", { name: "记一条笔记", exact: true }).click();
  await p.getByLabel("聊了什么 *").fill("聊了日本渠道"); await p.getByLabel("对方需求").fill("找代理商");
  await p.getByRole("button", { name: "保存", exact: true }).click();
  await p.getByText("笔记已保存", { exact: true }).waitFor();
  await p.getByRole("button", { name: "关闭", exact: true }).last().click();
  await p.getByRole("button", { name: "约个时间", exact: true }).click();
  await p.getByText("选 3–5 个候选时段", { exact: false }).waitFor();
  await p.getByRole("button", { name: /9月18日/ }).click();
  for (const slot of ["10:00 - 10:30", "10:30 - 11:00", "14:00 - 14:30"]) await p.getByRole("button", { name: slot, exact: true }).click();
  await p.getByRole("button", { name: "发送邀约", exact: true }).click();
  await p.getByText("邀约已发送，等待对方确认", { exact: true }).waitFor();
  const writes = await posts(p);
  assert.deepEqual(writes.map((w: any) => w.path), ["/api/events/event_1/operations/contact-requests/req_in/respond", "/api/encounters", "/api/appointments", "/api/appointments/apt_1/commands"]);
  assert.deepEqual(writes[0].body, { accept: true, expectedRevision: 1 });
  assert.deepEqual({ ...writes[1].body, observedAt: "x" }, { commitments: [], contactId: "contact_owner", eventId: "event_1", nextStep: "", noteText: "聊了日本渠道\n对方需求：找代理商", observedAt: "x", privacy: "private", talked: "yes", tags: [] });
  assert.match(writes[1].key, /^encounter:uuid-\d+$/);
  assert.deepEqual(writes[2].body, { eventContactRequestId: "req_in", eventId: "event_1" });
  assert.deepEqual(writes[3].body, { command: "propose", expectedVersion: 1, proposal: { candidateTimes: [{ startsAtUtc: "2026-09-18T01:00:00.000Z" }, { startsAtUtc: "2026-09-18T01:30:00.000Z" }, { startsAtUtc: "2026-09-18T05:00:00.000Z" }], durationMinutes: 30, medium: { kind: "in_person", location: "Shibuya Hall" }, note: "", timezone: "Asia/Tokyo" } });
  assert.ok(writes[2].key && writes[3].key && writes[2].key !== writes[3].key);
  await p.getByRole("button", { name: "关闭", exact: true }).last().click();
  await p.getByRole("button", { name: "已交换 · 打开联系人", exact: true }).click();
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/contacts/contact_owner"]);
});

test("an unregistered account gets the denied state with the server message, no writes, and a way back to the event", async t => {
  const p = await open(t, { statuses: { "GET /api/events/event_1/operations": 403 } });
  await p.getByText("现场只对已报名的参会者开放", { exact: true }).waitFor();
  await p.getByRole("alert").waitFor();
  assert.equal(await p.getByRole("tab").count(), 0);
  assert.equal(await p.getByText("1 号桌").count(), 0);
  await p.getByRole("button", { name: "查看活动并报名", exact: true }).click();
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/events/event_1"]);
  assert.deepEqual(await posts(p), []);
});

test("a server failure is shown as an error with retry, and no network shows the offline banner", async t => {
  const failed = await open(t, { statuses: { "GET /api/events/event_1/operations": 503 } });
  await failed.getByRole("button", { name: "重新读取", exact: true }).waitFor();
  assert.equal(await failed.getByText("现场只对已报名的参会者开放").count(), 0);
  const offline = await open(t, { network: true });
  await offline.getByText("没有网络 · 连上后点「重新读取」", { exact: true }).waitFor();
});

test("a late workspace read from the previous account is dropped after the account changes", async t => {
  const p = await open(t, { hold: true });
  await p.waitForFunction(() => (window as any).fixture.held.length >= 1);
  await p.evaluate(() => { const s = (window as any).fixture; s.stale = s.held.slice(); s.held = []; s.workspace.directory[1].displayName = "旧账号迟到名单"; });
  await p.evaluate(() => (window as any).fixture.update({ actor: "account-two" }));
  await p.waitForFunction(() => (window as any).fixture.requests.some((r: any) => r.path === "/api/events/event_1/operations" && r.signal?.aborted));
  await p.evaluate(() => { const s = (window as any).fixture; s.stale.forEach((fn: () => void) => fn()); });
  await p.evaluate(() => { const s = (window as any).fixture; s.workspace.directory[1].displayName = "当前账号名单"; s.hold = false; s.held.forEach((fn: () => void) => fn()); });
  await tab(p, "参会者"); await p.getByRole("button", { name: "当前账号名单", exact: true }).waitFor();
  assert.equal(await p.getByText("旧账号迟到名单").count(), 0);
});

test("old routes redirect: attendees and participant links to the live page, party links to live or the catalogue", async t => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["events/[id]/attendees", { id: "event 1" }, "redirect:/events/event%201/live?tab=all"],
    ["events/[id]/participants/[participantId]", { id: "event_1", participantId: "p_other" }, "redirect:/events/event_1/live?tab=all&participant=p_other"],
    ["party", { eventId: "event_1" }, "redirect:/events/event_1/live"],
    ["party", {}, "redirect:/events"],
    ["party/checkin", { code: "SMALL" }, "redirect:/events/SMALL/live"],
    ["party/graph", { eventId: "event_1" }, "redirect:/events/event_1/live?tab=agenda"]
  ];
  for (const [route, params, expected] of cases) {
    const p = await open(t, { params }, route);
    await p.waitForFunction(() => (window as any).fixture.navigation.length > 0);
    assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), [expected], route);
    assert.deepEqual(await requests(p), [], route);
  }
});

test("an exchange write in flight is aborted, not resent and not applied when the account changes", async t => {
  const p = await open(t, { params: { id: "event_1", participant: "p_other" } });
  await p.getByRole("button", { name: "申请交换名片", exact: true }).waitFor();
  await p.evaluate(() => { (window as any).fixture.hold = true; });
  await p.getByRole("button", { name: "申请交换名片", exact: true }).click();
  await p.waitForFunction(() => (window as any).fixture.held.length === 1);
  await p.evaluate(() => (window as any).fixture.update({ actor: "account-two" }));
  await p.waitForFunction(() => (window as any).fixture.requests.find((r: any) => r.method === "POST")?.signal?.aborted === true);
  await p.evaluate(() => { const s = (window as any).fixture; s.hold = false; s.held.forEach((fn: () => void) => fn()); s.held = []; });
  await p.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)));
  assert.equal((await posts(p)).length, 1);
});

// Sprint 0115: the device copy of the event day, as the three sync domains store it.
function localDay() {
  const workspace = attendeeFixture();
  const row = (kind: string, payload: Record<string, unknown>) => ({ actorId: "account-one", workspaceId: "w", kind, id: "event_1", revision: "9", updatedAt: "2026-09-17T00:40:00Z", deletedAt: null, payload, syncState: "synced", aiVisibility: "excluded" });
  const c = workspace.configuration;
  return {
    registrations: [row("event_registration", { eventId: "event_1", membershipStatus: "rsvped", admissionStatus: null })],
    events: [row("registered_event", { eventId: "event_1", participantId: "p_me", title: "东京 AI 产品增长夜", description: "Local description", venue: "Shibuya Hall", timeZone: "Asia/Tokyo", startsAt: "2026-09-17T01:00:00Z", endsAt: "2026-09-17T23:00:00Z", lifecycleState: "published", checkInOpensAt: c.checkInOpensAt, eventStartsAt: c.eventStartsAt, eventEndsAt: c.eventEndsAt, profileEditDeadlineAt: c.profileEditDeadlineAt, resultsAvailableAt: c.resultsAvailableAt, roundOneStartsAt: c.roundOneStartsAt, roundTwoStartsAt: c.roundTwoStartsAt })],
    results: [row("event_published_result", { eventId: "event_1", generationId: "g1", publishedAt: "2026-09-16T23:00:00Z", resultsAvailableAt: c.resultsAvailableAt, me: workspace.me, directory: workspace.directory, directoryComplete: true, recommendations: workspace.recommendations, roundOneTable: workspace.roundOneTable, roundTwoTable: workspace.roundTwoTable })],
  };
}

test("offline: the live page renders the device copy with the 截至 notice; check-in, exchange, notes and appointments need a connection and send nothing", async t => {
  const p = await open(t, { network: true, local: localDay(), localSyncedAt: "2026-09-17T00:40:00Z" });
  await p.getByText("东京 AI 产品增长夜", { exact: true }).waitFor();
  await p.getByText(/无法连接 · 显示截至 .+ 的内容/).waitFor();
  await p.getByText("1 号桌", { exact: true }).waitFor();
  await p.getByText("90%", { exact: true }).waitFor();
  await p.getByText("立即签到 · 需要联网", { exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: "立即签到", exact: true }).count(), 0, "no active check-in button");
  await tab(p, "参会者"); await p.getByRole("button", { name: "Other person", exact: true }).click();
  await p.getByRole("button", { name: "申请交换名片 · 需要联网", exact: true }).waitFor();
  await p.getByText("第 1 轮 · 1 号桌", { exact: true }).waitFor();
  await p.getByRole("button", { name: "记一条笔记 · 需要联网", exact: true }).waitFor();
  await p.getByRole("button", { name: "约个时间 · 需要联网", exact: true }).waitFor();
  await p.getByRole("button", { name: "关闭", exact: true }).click();
  await tab(p, "议程"); for (const text of ["开始签到", "第一轮分桌", "第二轮话题桌"]) await p.getByText(text, { exact: true }).first().waitFor();
  await tab(p, "分组"); await p.getByText("本组主题：Collaboration", { exact: true }).waitFor();
  const reads = (await requests(p)).map((r: any) => `${r.method} ${r.path}`);
  assert.ok(!reads.some((r: string) => r.includes("/participants/")), "the offline person sheet does not ask the network");
  assert.deepEqual(await posts(p), [], "nothing is written");
});

test("online, the server's workspace wins over the device copy; a 403 shows the denied page even with a device copy", async t => {
  const workspace = attendeeFixture(); workspace.roundOneTable.tableNumber = 7; workspace.roundTwoTable.tableNumber = 7;
  const online = await open(t, { workspace, local: localDay() });
  await online.getByText("7 号桌", { exact: true }).waitFor();
  assert.equal(await online.getByText(/无法连接 · 显示截至/).count(), 0);
  const denied = await open(t, { local: localDay(), statuses: { "GET /api/events/event_1/operations": 403 } });
  await denied.getByText("现场只对已报名的参会者开放", { exact: true }).waitFor();
  assert.equal(await denied.getByText("1 号桌", { exact: true }).count(), 0, "a server refusal is never covered by the device copy");
});
