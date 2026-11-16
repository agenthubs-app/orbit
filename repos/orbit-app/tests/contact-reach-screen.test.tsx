import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

// contact-reach R42 (App): the NATIVE screens (no .web) rendered with react-native-web against a recording API client.
//   SC-02 連絡する · message: times from the day-list picker (可約時間, preselect 3, none when the calendar read is
//         incomplete) → ONE POST …/messages { body, qualificationVersion, proposal }; offline with times waits; plain
//         text offline goes to the device outbox; 409 shows the ongoing meeting + 日程を変更; drafts per account + contact + path.
//   SC-03 連絡する · e-mail draft: the paragraph of times, picking again replaces it, copy, mailto, no address → disabled,
//         no relationship request.
//   SC-04 the proposal card: これにする → accept { candidateId, expectedVersion } + Idempotency-Key → 確定; your own → 返事待ち;
//         all past → 期限切れ with only 別の時間を提案; a stale version re-reads.
//   SC-05 設定 › 日程: read, a change is saved with the whole settings, an invalid combination is not saved, a failed save rolls back.
let browser: Browser;
let server: Server;
let url: string;

const NOW = "2026-11-17T00:00:00.000Z"; // Tuesday 09:00 in Tokyo

const fixture = `
import React from "react";
import { View } from "react-native";
const contactRow = (id, name, email) => ({ id, payload: { id, card: { id, displayName: name, organization: "Example", role: "", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-10-01T00:00:00.000Z" },
  tags: [], search: { text: name, occurredAt: "2026-10-01T00:00:00.000000Z", updatedAt: "2026-10-01T00:00:00.000000Z", error: null },
  detail: { state: "success", contact: { id, displayName: name, organization: "Example", role: "", status: "active", primaryEmail: email, primaryPhone: "", nextAction: "", tags: [], publicProfile: { offering: [], seeking: [] }, notes: [], lastInteraction: null, fieldHistory: [] } } } });
export const state = window.fixture = { requests: [], navigation: [], copied: [], opened: [], enqueued: [], offline: false, outboxEnabled: true, ...window.initialFixture };
export const useLocalSearchParams = () => state.params ?? {};
export const useGlobalSearchParams = () => state.params ?? {};
export const usePathname = () => "/contacts/reach/x";
export const useIsFocused = () => true;
export const useFocusEffect = () => undefined;
export const useRouter = () => ({ canGoBack: () => true, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(typeof href === "string" ? href : JSON.stringify(href)); }, navigate(href) { state.navigation.push(String(href)); }, replace(href) { state.navigation.push("replace:" + href); }, setParams() {} });
const session = { async readOutboxOverlay() { return { serverRecords: [], queuedMutations: [] }; } };
export const useSyncCoordinatorSession = () => session;
export const useSyncedCollection = ({ kind }) => ({ status: "fresh", error: null, lastSyncedAt: "2026-11-16T00:00:00.000Z", workspaceId: "workspace:one",
  records: kind === "contact" ? [contactRow("c-ito", "伊藤 直子", "ito@example.test"), contactRow("c-suzuki", "鈴木 大輔", ""), contactRow("c-mori", "森田 健二", "")] : [],
  refresh: async () => null, invalidate: async () => null, currentSession: () => session });
export const useApiResource = () => ({ kind: "loading", refreshing: false, refresh() {} });
export const usePageCopyResource = () => ({ kind: "loading", refreshing: false, refresh() {}, copy: null });
export const useLocalRelationshipConversations = () => ({ available: true, conversations: [], outboxSession: null, freshness: { readable: true, loading: false, failure: null, refreshing: false, offline: state.offline, lastSyncedAt: null }, refresh: async () => null });
export const useLocalRelationshipThread = useLocalRelationshipConversations;
export const useRelationshipMessageOutbox = () => ({ enabled: state.outboxEnabled, messages: [], failure: null, async enqueue(input) { state.enqueued.push(input); }, async retry() {}, async discard() {}, async refresh() {} });
const ok = (data, status = 200) => ({ success: true, status, data, meta: {} });
const fail = (status, context) => ({ success: false, status, error: { code: "X", message: "x", ...(context ? { context } : {}) }, meta: {} });
const answer = (method, path, body) => {
  const custom = state.answers?.[method + " " + path];
  if (custom !== undefined) return typeof custom === "function" ? custom(body, state) : custom;
  if (path.startsWith("/api/relationship-communication/eligibility")) return fail(404);
  if (path.startsWith("/api/contacts/") && path.endsWith("/reconnect-draft")) return ok({ draft: { subject: "ご無沙汰しております", body: "ご無沙汰しております。\\n近況をお話しできればと思います。\\n\\nどうぞよろしくお願いいたします。", provider: "template" } });
  if (path === "/api/scheduling/availability" && method === "GET") return ok({ weekdays: ["mon", "tue", "wed", "thu", "fri"], start: "09:00", end: "18:00", lunch: null, durationMinutes: 60, minimumNotice: "15m", bufferMinutes: 0, timeZoneMode: "device", timeZone: null, updatedAt: null, ...state.availability });
  if (path === "/api/scheduling/availability" && method === "PUT") return state.putFails ? fail(503) : ok({ ...body, updatedAt: "2026-11-17T00:00:00.000Z" });
  if (path.startsWith("/api/schedule-items")) return ok({ scheduleItems: state.scheduleItems ?? [] });
  if (path.startsWith("/api/calendar/external-events")) return ok({ connection: state.calendar ?? "not_connected", provider: "google_calendar", events: [], asOf: "2026-11-17T00:00:00.000Z" });
  if (path === "/api/integrations") return ok([{ provider: "google_calendar", status: "active", healthStatus: "healthy" }]);
  if (path.startsWith("/api/appointments/") && method === "GET") { const id = decodeURIComponent(path.split("/")[3]); const meeting = state.meetings?.[id]; return meeting ? ok(typeof meeting === "function" ? meeting(state) : meeting) : fail(404); }
  return fail(404);
};
const record = (method, path, options) => { state.requests.push({ method, path, body: options?.body ?? null, headers: options?.headers ?? null }); };
const client = {
  async get(path, options) { record("GET", path, options); if (state.offline) return fail(0); return answer("GET", path); },
  async post(path, options) { record("POST", path, options); if (state.offline) return fail(0); if (state.holdPosts) await new Promise((resolve) => (state.releasePost = resolve)); return answer("POST", path, options?.body); },
  async put(path, options) { record("PUT", path, options); if (state.offline) return fail(0); return answer("PUT", path, options?.body); },
  async patch(path, options) { record("PATCH", path, options); return fail(404); },
  async delete(path, options) { record("DELETE", path, options); return fail(404); },
};
export const useOrbitApiClient = () => client;
const authSession = { ready: true, signedIn: true, accountId: "account:one", actorId: "account:one", cookieHeader: "", user: { id: "account:one" }, get offline() { return state.offline; } };
export const useOrbitAuthSession = () => authSession;
export const useOrbitApiBaseUrl = () => ({ baseUrl: "http://fixture", ready: true });
const memory = window.storage = new Map(Object.entries(window.initialFixture?.storage ?? {}));
export default { getItem: async (key) => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async (key) => { memory.delete(key); } };
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const useSafeAreaInsets = () => ({ top: 47, bottom: 34, left: 0, right: 0 });
export const setStringAsync = async (value) => { state.copied.push(value); return true; };
export const getStringAsync = async () => "";
let uuid = 0;
export const randomUUID = () => "00000000-0000-4000-8000-" + String(++uuid).padStart(12, "0");
`;

const sheetUi = `
const Stub = () => null;
export default Stub; export const Ionicons = Stub;
export const Svg = Stub, Path = Stub, Circle = Stub, G = Stub, Rect = Stub, Line = Stub, Defs = Stub, LinearGradient = Stub, RadialGradient = Stub, Stop = Stub, Text = Stub, Ellipse = Stub, Polygon = Stub, Polyline = Stub, ClipPath = Stub, Use = Stub, Symbol = Stub;
export const BlurView = Stub; export const impactAsync = async () => {}; export const selectionAsync = async () => {}; export const notificationAsync = async () => {};
export const ImpactFeedbackStyle = {}; export const NotificationFeedbackType = {}; export const shareAsync = async () => {}; export const isAvailableAsync = async () => false;
export const createURL = (p) => p; export const openBrowserAsync = async () => ({});
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client";
        import { ContactReachScreen } from "./src/screens/network/ContactReachScreen";
        import { AppointmentProposalCard } from "./src/screens/inbox/AppointmentProposalCard";
        import { ScheduleAvailabilityScreen } from "./src/screens/settings/ScheduleAvailabilityScreen";
        import { ToastProvider, UiPortalHost } from "./src/components/ui";
        import { OrbitLocaleContext } from "./src/i18n/OrbitLocaleContext";
        import { createTranslator } from "./src/i18n/messages";
        const language = window.initialFixture?.language ?? "ja";
        const locale = { choice: language, deviceLanguage: language, error: null, language, preference: { mode: "manual", language, updatedAt: null }, retryLanguageSave: async () => {}, setLanguage: async () => {}, source: "account", syncState: "idle", t: createTranslator(language) };
        function Root() {
          const [screen, setScreen] = React.useState(window.initialFixture?.screen ?? "reach");
          const [contactId, setContactId] = React.useState(window.initialFixture?.contactId ?? "c-suzuki");
          window.showScreen = setScreen; window.showContact = setContactId;
          if (screen === "none") return null;
          if (screen === "card") return <AppointmentProposalCard appointmentId={window.initialFixture.appointmentId} peerName="森田 健二" now={() => Date.parse("${NOW}")} />;
          if (screen === "settings") return <ScheduleAvailabilityScreen />;
          return <ContactReachScreen key={contactId} contactId={contactId} />;
        }
        createRoot(document.getElementById("root")).render(<OrbitLocaleContext.Provider value={locale}><UiPortalHost><ToastProvider><Root /></ToastProvider></UiPortalHost></OrbitLocaleContext.Provider>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"ja"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{
      name: "contact-reach-native-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "reach" }));
        plugin.onResolve({ filter: /^react-native-safe-area-context$|^expo-router$|^expo-clipboard$|^expo-crypto$|\/(useApiResource|usePageCopyResource|useOrbitApiClient|useSyncedCollection|AuthSessionProvider|ApiBaseUrlProvider|useLocalRelationshipMessages|useRelationshipMessageOutbox)$|^@react-native-async-storage\/async-storage$/ }, () => ({ path: "fixture", namespace: "reach" }));
        plugin.onResolve({ filter: /^react-native-reanimated$|^react-native-gesture-handler$|^expo-haptics$|^expo-blur$|^react-native-svg$/ }, (args) => ({ path: `${process.cwd()}/tests/helpers/stubs/${args.path}.js` }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$|^expo-camera$|^expo-image-picker$|^expo-sharing$|^expo-linking$|^expo-web-browser$/ }, () => ({ path: "icons", namespace: "reach" }));
        plugin.onLoad({ filter: /^fixture$/, namespace: "reach" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^native$/, namespace: "reach" }, () => ({ contents: `export * from "react-native-web"; export const findNodeHandle = () => null; export const Linking = { openURL: async (url) => { if (window.fixture.mailFails) throw new Error("no mail app"); window.fixture.opened.push(url); }, canOpenURL: async () => true };`, loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({ filter: /^icons$/, namespace: "reach" }, () => ({ contents: sheetUi, loader: "js" }));
      },
    }],
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROME_PATH ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH } : {}) });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

type Request = { method: string; path: string; body: any; headers: Record<string, string> | null };
const ORBIT_ELIGIBILITY = (extra: Record<string, unknown> = {}) => ({ success: true, status: 200, meta: {}, data: { contactId: "c-suzuki", status: "confirmed", canInvite: false, canSend: true, conversationId: "conv-1", qualificationVersion: "qv-1", canProposeMeeting: true, activeAppointmentId: null, ...extra } });
const ELIGIBILITY_PATH = "GET /api/relationship-communication/eligibility?contactId=c-suzuki";
const MESSAGES_PATH = "POST /api/relationship-communication/conversations/conv-1/messages";
/** Page-side source of a delivered receipt for the posted body (functions cannot cross into the page). */
const receipt = (withAppointment: boolean) => `(body) => ({ success: true, status: 201, meta: {}, data: { conversationId: "conv-1", qualificationVersion: body.qualificationVersion, deliveryState: "delivered",
  message: { messageId: "m-new", conversationId: "conv-1", senderAccountId: "account:one", senderDisplayName: "私", body: body.body, sentAt: "2026-11-17T00:00:01.000Z", deliveryState: "delivered"${withAppointment ? ', appointmentId: "appt-new"' : ""} } } })`;

async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}, fixed = true): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.log("PAGEERROR", error.message); });
  if (fixed) await page.clock.setFixedTime(new Date(NOW));
  // Functions in answers cannot cross the boundary: tests name them and the page builds them.
  await page.addInitScript((initialFixture) => { (window as any).initialFixture = initialFixture; }, patch);
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], "no page errors"); });
  await page.goto(url);
  return page;
}
const requests = (page: Page) => page.evaluate(() => (window as any).fixture.requests as Request[]);
const answers = (page: Page, source: string) => page.evaluate((code) => { const s = (window as any).fixture; s.answers = { ...(s.answers ?? {}), ...(0, eval)(`(${code})`) }; }, source);
const bodyValue = (page: Page) => page.getByTestId("contact-reach-body").inputValue();

async function openOrbit(t: { after(fn: () => Promise<void>): void }, eligibility: Record<string, unknown> = {}, patch: Record<string, unknown> = {}) {
  const page = await open(t, { contactId: "c-suzuki", answers: { [ELIGIBILITY_PATH]: ORBIT_ELIGIBILITY(eligibility) }, ...patch });
  await page.getByTestId("contact-reach-body").waitFor();
  return page;
}

test("SC-02: message path — tag, template body, 候補の時間を入れる opens the day list with 3 slots picked from 可約時間, insert, one POST …/messages with the proposal", async (t) => {
  const page = await openOrbit(t);
  await page.getByText("メッセージ", { exact: true }).first().waitFor();
  await page.getByText("鈴木 大輔 さんに連絡", { exact: true }).waitFor();
  assert.match(await bodyValue(page), /^ご無沙汰しております。/);
  assert.equal(await page.getByText("宛先", { exact: true }).count(), 0, "no recipient row on the message path");
  await page.getByTestId("contact-reach-insert").click();
  await page.getByTestId("slot-picker").waitFor();
  await page.getByTestId("slot-hint").getByText("Orbit の予定だけで判断しています", { exact: true }).waitFor();
  await page.getByTestId("slot-rules").getByText(/あなたの空き時間：平日 09:00–18:00 · 15分前まで/).waitFor();
  // Days follow the rules (Mon–Fri) and today's past cells are gone; weekends are not listed.
  await page.getByTestId("slot-day-2026-11-18").waitFor();
  assert.equal(await page.getByTestId("slot-day-2026-11-21").count(), 0, "Saturday is outside the rules");
  await page.getByText("3 件を挿入", { exact: true }).click();
  const proposal = page.getByTestId("contact-reach-proposal");
  await proposal.waitFor();
  await proposal.getByText("候補の時間 · 60分 · オンライン", { exact: true }).waitFor();
  await proposal.getByText("11/18（水）09:00 – 10:00", { exact: true }).waitFor();
  await proposal.getByText("11/19（木）09:00 – 10:00", { exact: true }).waitFor();
  await proposal.getByText("11/20（金）09:00 – 10:00", { exact: true }).waitFor();
  await page.getByText("相手が時間を選ぶと確定し、双方のカレンダーに入ります", { exact: true }).waitFor();
  assert.equal((await requests(page)).filter((r) => r.method !== "GET" && r.path !== "/api/contacts/c-suzuki/reconnect-draft").length, 0, "picking writes nothing");
  await answers(page, `{ ${JSON.stringify(MESSAGES_PATH)}: ${receipt(true)} }`);
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.includes("back"));
  const writes = (await requests(page)).filter((r) => r.method === "POST" && r.path.startsWith("/api/relationship-communication"));
  assert.equal(writes.length, 1, "one command, no separate start or initial-proposal");
  assert.equal(writes[0]!.path, "/api/relationship-communication/conversations/conv-1/messages");
  assert.match(writes[0]!.headers!["Idempotency-Key"]!, /^reach:.+:0$/);
  assert.deepEqual(writes[0]!.body.proposal, {
    candidateTimes: [{ startsAtUtc: "2026-11-18T00:00:00.000Z" }, { startsAtUtc: "2026-11-19T00:00:00.000Z" }, { startsAtUtc: "2026-11-20T00:00:00.000Z" }],
    durationMinutes: 60, medium: { kind: "video", provider: "other", joinUrl: null }, note: "", timezone: "Asia/Tokyo",
  });
  assert.equal(writes[0]!.body.qualificationVersion, "qv-1");
  assert.equal((await requests(page)).some((r) => r.path.startsWith("/api/appointments/initial-proposal")), false);
  await page.getByText("送信しました", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => (window as any).storage.has("orbit.contactReach.draft:account:one:c-suzuki:orbit")), false, "a sent message leaves no draft");
});

test("SC-02: canStart only — POST conversations/start, then the message; a failure keeps the text and the retry reuses the key", async (t) => {
  const page = await openOrbit(t, { canSend: false, canStart: true, status: "unregistered", conversationId: undefined, qualificationVersion: undefined });
  await answers(page, `{ "POST /api/relationship-communication/conversations/start": { success: true, status: 200, meta: {}, data: { contactId: "c-suzuki", canSend: true, conversationId: "conv-1", qualificationVersion: "qv-2" } },
    ${JSON.stringify(MESSAGES_PATH)}: (body, s) => (s.sendCount = (s.sendCount ?? 0) + 1) === 1 ? { success: false, status: 503, meta: {}, error: { code: "X", message: "x" } } : (${receipt(false)})(body) }`);
  await page.getByTestId("contact-reach-body").fill("はじめまして。");
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await page.getByTestId("contact-reach-error").getByText("送信できませんでした。内容はそのまま残っています。", { exact: true }).waitFor();
  assert.equal(await bodyValue(page), "はじめまして。");
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.navigation.includes("back"));
  const writes = (await requests(page)).filter((r) => r.method === "POST" && r.path.startsWith("/api/relationship-communication"));
  assert.deepEqual(writes.map((r) => r.path), ["/api/relationship-communication/conversations/start", "/api/relationship-communication/conversations/conv-1/messages", "/api/relationship-communication/conversations/conv-1/messages"]);
  assert.deepEqual(writes[0]!.body, { contactId: "c-suzuki" });
  assert.equal(writes[1]!.headers!["Idempotency-Key"], writes[2]!.headers!["Idempotency-Key"], "the same content retried keeps its key");
  assert.equal(writes[1]!.body.qualificationVersion, "qv-2");
  assert.equal("proposal" in writes[1]!.body, false, "plain text carries no proposal");
});

test("SC-02: 409 MEETING_ALREADY_ACTIVE — the inserted times give way to that meeting and 日程を変更", async (t) => {
  const page = await openOrbit(t, {}, { meetings: { "appt-9": { appointmentId: "appt-9", contactId: "c-suzuki", status: "confirmed", version: 3, visibility: "participants", eventId: null, title: "面談", details: "", detailsUpdatedAt: null, detailsUpdatedBy: null, updatedAt: "2026-11-16T00:00:00.000Z", pendingProposalRevision: null,
    confirmed: { startsAtUtc: "2026-11-20T05:00:00.000Z", durationMinutes: 60, medium: { kind: "video", provider: "other", joinUrl: null }, timezone: "Asia/Tokyo", candidateId: "c1", proposalRevision: 1 },
    proposals: [{ revision: 1, proposedBy: "you", createdAt: "2026-11-15T00:00:00.000Z", durationMinutes: 60, medium: { kind: "video", provider: "other", joinUrl: null }, note: "", timezone: "Asia/Tokyo", candidateTimes: [{ candidateId: "c1", startsAtUtc: "2026-11-20T05:00:00.000Z" }, { candidateId: "c2", startsAtUtc: "2026-11-21T05:00:00.000Z" }, { candidateId: "c3", startsAtUtc: "2026-11-22T05:00:00.000Z" }] }] } } });
  await answers(page, `{ ${JSON.stringify(MESSAGES_PATH)}: { success: false, status: 409, meta: {}, error: { code: "CONFLICT", message: "x", context: { reason: "MEETING_ALREADY_ACTIVE", appointmentId: "appt-9" } } } }`);
  await page.getByTestId("contact-reach-insert").click();
  await page.getByText("3 件を挿入", { exact: true }).click();
  await page.getByRole("button", { name: "送信", exact: true }).click();
  const active = page.getByTestId("contact-reach-active");
  await active.getByText("この相手とは進行中の面談があります", { exact: true }).waitFor();
  await active.getByText("確定", { exact: true }).waitFor();
  await active.getByText("11/20（金）14:00 – 15:00 · オンライン", { exact: true }).waitFor();
  await active.getByRole("button", { name: "日程を変更" }).waitFor();
  assert.equal(await page.getByTestId("contact-reach-proposal").count(), 0);
  assert.ok(await bodyValue(page), "the text stays");
});

test("SC-02: an ongoing meeting from the eligibility read shows at once; canProposeMeeting:false offers no times", async (t) => {
  const page = await openOrbit(t, { activeAppointmentId: "appt-x" });
  await page.getByTestId("contact-reach-active").waitFor();
  assert.equal(await page.getByTestId("contact-reach-insert").count(), 0);
  const mail = await openOrbit(t, { canProposeMeeting: false });
  await mail.getByText("相手の Orbit 受信箱に届きます", { exact: true }).waitFor();
  assert.equal(await mail.getByTestId("contact-reach-insert").count(), 0, "an e-mail-invitation conversation cannot carry times");
});

test("SC-02: offline — with times 送信 waits and says why (text kept); plain text goes to the device outbox and nothing is posted", async (t) => {
  const page = await openOrbit(t);
  await page.getByTestId("contact-reach-insert").click();
  await page.getByText("3 件を挿入", { exact: true }).click();
  await page.getByTestId("contact-reach-proposal").waitFor();
  await page.evaluate(() => { (window as any).fixture.offline = true; (window as any).showScreen("none"); });
  await page.evaluate(() => (window as any).showScreen("reach"));
  await page.getByTestId("contact-reach-proposal").waitFor();
  await page.getByTestId("contact-reach-offline").getByText("時間の候補つきの送信には接続が必要です。内容はそのまま残っています。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "送信", exact: true }).getAttribute("aria-disabled"), "true");
  await page.getByRole("button", { name: "外す" }).click();
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.enqueued.length === 1);
  const [queued] = await page.evaluate(() => (window as any).fixture.enqueued);
  assert.equal(queued.conversationId, "conv-1");
  assert.equal(queued.qualificationVersion, "qv-1");
  assert.match(queued.body, /^ご無沙汰しております。/);
  assert.equal((await requests(page)).filter((r) => r.method === "POST" && r.path.includes("/messages")).length, 0);
  await page.getByText("つながったら送信します", { exact: true }).waitFor();
});

test("SC-02: the unsent text is kept per account + contact + path — restored on reopen, never shown for another contact", async (t) => {
  const page = await openOrbit(t);
  await page.getByTestId("contact-reach-body").fill("書きかけのメッセージ");
  await page.waitForFunction(() => (window as any).storage.get("orbit.contactReach.draft:account:one:c-suzuki:orbit")?.includes("書きかけ"));
  await page.evaluate(() => (window as any).showScreen("none"));
  await page.evaluate(() => (window as any).showScreen("reach"));
  await page.getByTestId("contact-reach-body").waitFor();
  assert.equal(await bodyValue(page), "書きかけのメッセージ");
  const before = (await requests(page)).filter((r) => r.path.endsWith("/reconnect-draft")).length;
  assert.equal(before, 1, "a kept draft is not replaced by the template");
  await page.evaluate(() => (window as any).showContact("c-mori"));
  await page.getByTestId("contact-reach-body").waitFor();
  assert.notEqual(await bodyValue(page), "書きかけのメッセージ", "another person never sees it");
});

test("SC-02: an incomplete calendar read picks nothing, says so, and unknown times can still be picked by hand", async (t) => {
  const page = await openOrbit(t, {}, { calendar: "unavailable" });
  await page.getByTestId("contact-reach-insert").click();
  await page.getByTestId("slot-hint").getByText("予定を確認しきれていないため、自動では選んでいません", { exact: true }).waitFor();
  await page.getByTestId("slot-count-hint").getByText("3〜5 件選んでください", { exact: true }).waitFor();
  assert.equal(await page.getByText("0 件を挿入", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "11/18（水） 10:00 · 未確認" }).click();
  await page.getByRole("button", { name: "11/19（木） 10:00 · 未確認" }).click();
  await page.getByRole("button", { name: "11/20（金） 10:00 · 未確認" }).click();
  await page.getByText("3 件を挿入", { exact: true }).click();
  await page.getByTestId("contact-reach-proposal").getByText("11/18（水）10:00 – 11:00", { exact: true }).waitFor();
});

test("SC-02: busy times from Orbit's schedule are shown struck and cannot be picked; in person needs a place", async (t) => {
  const page = await openOrbit(t, {}, { scheduleItems: [{ id: "s1", sourceId: "s1", title: "会議", kind: "personal", category: "work", state: "upcoming", startsAt: "2026-11-18T00:00:00.000Z", endsAt: "2026-11-18T02:00:00.000Z" }] });
  await page.getByTestId("contact-reach-insert").click();
  const busy = page.getByRole("button", { name: "11/18（水） 09:00 · 予定あり" });
  await busy.waitFor();
  assert.equal(await busy.getAttribute("aria-disabled"), "true");
  await page.getByRole("tab", { name: "対面" }).click();
  assert.equal(await page.getByRole("button", { name: /件を挿入/ }).getAttribute("aria-disabled"), "true");
  await page.getByText("会う場所を入れてください", { exact: true }).waitFor();
});

test("SC-03: e-mail path — recipient from the card, the paragraph of times, picking again replaces only it, copy and mailto; no relationship write", async (t) => {
  const page = await open(t, { contactId: "c-ito" });
  await page.getByTestId("contact-reach-body").waitFor();
  await page.getByText("メールの下書き", { exact: true }).first().waitFor();
  await page.getByTestId("contact-reach-to").getByText(/ito@example\.test/).waitFor();
  assert.equal(await page.getByTestId("contact-reach-subject").inputValue(), "ご無沙汰しております");
  await page.getByText("Orbit からはメールを送りません", { exact: true }).waitFor();
  await page.getByTestId("contact-reach-insert").click();
  await page.getByText("3 件を挿入", { exact: true }).click();
  await page.waitForFunction(() => (document.querySelector('[data-testid="contact-reach-body"]') as HTMLTextAreaElement | null)?.value.includes("以下の日時"));
  const first = await bodyValue(page);
  assert.match(first, /以下の日時のいずれかで、60 分ほどお時間をいただけますでしょうか（オンライン）。\n・11\/18（水）09:00–10:00\n・11\/19（木）09:00–10:00\n・11\/20（金）09:00–10:00/);
  assert.ok(first.indexOf("以下の日時") < first.indexOf("どうぞよろしくお願いいたします。"), "the paragraph goes before the closing line");
  await page.getByTestId("contact-reach-body").fill(first.replace("近況をお話しできればと思います。", "手で書き足した一文。"));
  await page.getByRole("button", { name: "時間を選び直す" }).click();
  await page.getByRole("button", { name: "11/18（水） 09:00 · 選択中" }).click();
  await page.getByText("2 件を挿入", { exact: true }).click();
  await page.waitForFunction(() => !(document.querySelector('[data-testid="contact-reach-body"]') as HTMLTextAreaElement).value.includes("11/18（水）09:00"));
  const second = await bodyValue(page);
  assert.match(second, /手で書き足した一文。/, "the hand-edited text stays");
  assert.equal((second.match(/以下の日時/g) ?? []).length, 1, "the paragraph is replaced, not added twice");
  await page.getByRole("button", { name: "コピー", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.copied.length === 1);
  assert.match((await page.evaluate(() => (window as any).fixture.copied[0])) as string, /^ご無沙汰しております\n\n/);
  await page.getByRole("button", { name: "メールアプリで開く" }).click();
  await page.waitForFunction(() => (window as any).fixture.opened.length === 1);
  const href = (await page.evaluate(() => (window as any).fixture.opened[0])) as string;
  assert.match(href, /^mailto:ito@example\.test\?subject=%E3%81%94/);
  assert.match(href, /%0D%0A/, "line breaks as CRLF");
  assert.equal((await requests(page)).filter((r) => r.method !== "GET" && r.path.startsWith("/api/relationship-communication")).length, 0, "the e-mail path never writes a relationship message");
});

test("SC-03: no address on the card — 宛先 says so and メールアプリで開く is disabled; a failing mail app says to copy", async (t) => {
  const page = await open(t, { contactId: "c-mori" });
  await page.getByTestId("contact-reach-body").waitFor();
  await page.getByText("名刺にメールアドレスがありません", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "メールアプリで開く" }).getAttribute("aria-disabled"), "true");
  const other = await open(t, { contactId: "c-ito", mailFails: true });
  await other.getByTestId("contact-reach-body").waitFor();
  await other.getByRole("button", { name: "メールアプリで開く" }).click();
  await other.getByText("メールアプリを開けませんでした。コピーして使ってください。", { exact: true }).waitFor();
});

const meeting = (extra: Record<string, unknown>) => ({ appointmentId: "appt-1", contactId: "c-mori", status: "awaiting_response", version: 2, visibility: "participants", eventId: null, title: "面談", details: "", detailsUpdatedAt: null, detailsUpdatedBy: null,
  updatedAt: "2026-11-16T00:00:00.000Z", confirmed: null, pendingProposalRevision: 1,
  proposals: [{ revision: 1, proposedBy: "other", createdAt: "2026-11-16T00:00:00.000Z", durationMinutes: 60, medium: { kind: "video", provider: "other", joinUrl: null }, note: "", timezone: "Asia/Tokyo",
    candidateTimes: [{ candidateId: "k1", startsAtUtc: "2026-11-18T01:00:00.000Z" }, { candidateId: "k2", startsAtUtc: "2026-11-19T05:00:00.000Z" }, { candidateId: "k3", startsAtUtc: "2026-11-21T07:00:00.000Z" }] }], ...extra });

test("SC-04: their proposal — これにする on each time → accept { candidateId, expectedVersion } with a key → 確定 line", async (t) => {
  const confirmed = meeting({ status: "confirmed", version: 3, pendingProposalRevision: null, confirmed: { startsAtUtc: "2026-11-19T05:00:00.000Z", durationMinutes: 60, medium: { kind: "video", provider: "other", joinUrl: null }, timezone: "Asia/Tokyo", candidateId: "k2", proposalRevision: 1 } });
  const page = await open(t, { screen: "card", appointmentId: "appt-1", meetings: { "appt-1": meeting({}) }, answers: { "POST /api/appointments/appt-1/commands": { success: true, status: 200, meta: {}, data: confirmed } } });
  await page.getByTestId("appointment-card-pending").waitFor();
  await page.getByText("森田 健二 さんから日程の提案 · 60分 · オンライン", { exact: true }).waitFor();
  await page.getByText("11/18（水）10:00 – 11:00", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^これにする/ }).count(), 3);
  await page.getByRole("button", { name: "これにする 2" }).click();
  await page.getByTestId("appointment-confirmed").getByText("11/19（木）14:00 – 15:00 · オンライン", { exact: true }).waitFor();
  await page.getByText("日程が確定しました", { exact: true }).waitFor();
  const [command] = (await requests(page)).filter((r) => r.method === "POST");
  assert.equal(command!.path, "/api/appointments/appt-1/commands");
  assert.deepEqual(command!.body, { candidateId: "k2", command: "accept", expectedVersion: 2 });
  assert.match(command!.headers!["Idempotency-Key"]!, /^app:appointment-card:/);
});

test("SC-04: your own proposal waits (返事待ち, no pick); all past → 期限切れ with only 別の時間を提案; a stale version re-reads", async (t) => {
  const mine = await open(t, { screen: "card", appointmentId: "appt-1", meetings: { "appt-1": meeting({ proposals: [{ ...meeting({}).proposals[0], proposedBy: "you" }] }) } });
  await mine.getByTestId("appointment-card-mine").getByText("返事待ち", { exact: true }).waitFor();
  assert.equal(await mine.getByRole("button", { name: /^これにする/ }).count(), 0);
  assert.equal(await mine.getByRole("button", { name: /提案/ }).count(), 0);
  const past = meeting({ proposals: [{ ...meeting({}).proposals[0], candidateTimes: [{ candidateId: "k1", startsAtUtc: "2026-11-10T01:00:00.000Z" }, { candidateId: "k2", startsAtUtc: "2026-11-11T01:00:00.000Z" }, { candidateId: "k3", startsAtUtc: "2026-11-12T01:00:00.000Z" }] }] });
  const expired = await open(t, { screen: "card", appointmentId: "appt-1", meetings: { "appt-1": past } });
  await expired.getByTestId("appointment-card-expired").getByText("期限切れ", { exact: true }).waitFor();
  assert.equal(await expired.getByRole("button", { name: /^これにする/ }).count(), 0);
  await expired.getByRole("button", { name: "別の時間を提案" }).waitFor();
  const stale = await open(t, { screen: "card", appointmentId: "appt-1", meetings: { "appt-1": meeting({}) }, answers: { "POST /api/appointments/appt-1/commands": { success: false, status: 409, meta: {}, error: { code: "CONFLICT", message: "x" } } } });
  await stale.getByRole("button", { name: "これにする 1" }).click();
  await stale.getByText("提案が更新されていました。最新の内容から選び直してください。", { exact: true }).waitFor();
  assert.equal((await requests(stale)).filter((r) => r.method === "GET" && r.path === "/api/appointments/appt-1").length, 2, "the meeting is read again");
});

test("SC-05: 設定 › 日程 — reads the rules, a weekday tap saves the whole settings, the end never offers ≤ start, the last day cannot be removed, a failed save rolls back", async (t) => {
  const page = await open(t, { screen: "settings", availability: { weekdays: ["mon"] } });
  await page.getByText("提案できる時間", { exact: true }).waitFor();
  await page.getByText("Google カレンダー · 接続済み（予定のある時間を避けます）", { exact: true }).waitFor();
  await page.getByTestId("schedule-day-mon").click();
  await page.getByTestId("schedule-problem").getByText("曜日を 1 つ以上選んでください", { exact: true }).waitFor();
  assert.equal((await requests(page)).filter((r) => r.method === "PUT").length, 0, "an invalid combination is not saved");
  await page.getByTestId("schedule-day-sat").click();
  await page.getByText("保存しました", { exact: true }).waitFor();
  const [put] = (await requests(page)).filter((r) => r.method === "PUT");
  assert.equal(put!.path, "/api/scheduling/availability");
  assert.deepEqual(put!.body, { weekdays: ["mon", "sat"], start: "09:00", end: "18:00", lunch: null, durationMinutes: 60, minimumNotice: "15m", bufferMinutes: 0, timeZoneMode: "device", timeZone: null });
  await page.getByTestId("schedule-time-end").click();
  const options = await page.getByTestId("schedule-time-options").locator("[role='button']").allTextContents();
  assert.equal(options[0], "09:30", "the end list starts after the start");
  assert.ok(!options.includes("09:00"));
  await page.getByRole("button", { name: "17:00", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.filter((r: any) => r.method === "PUT").length === 2);
  await page.evaluate(() => { (window as any).fixture.putFails = true; });
  await page.getByTestId("schedule-day-sun").click();
  await page.getByText("保存できませんでした", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="schedule-day-sun"]')?.getAttribute("aria-checked") === "false");
  assert.equal(await page.getByTestId("schedule-day-sat").getAttribute("aria-checked"), "true");
});

test("SC-05: lunch break — on gives 12:00–13:00 inside the hours; the picker rules line opens 設定 › 日程", async (t) => {
  const page = await open(t, { screen: "settings" });
  await page.getByText("提案できる時間", { exact: true }).waitFor();
  await page.getByRole("switch", { name: "昼休み" }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.some((r: any) => r.method === "PUT" && r.body.lunch?.start === "12:00" && r.body.lunch?.end === "13:00"));
  const reach = await openOrbit(t);
  await reach.getByTestId("contact-reach-insert").click();
  await reach.getByTestId("slot-rules").click();
  assert.ok((await reach.evaluate(() => (window as any).fixture.navigation as string[])).includes("/settings/schedule"));
});
