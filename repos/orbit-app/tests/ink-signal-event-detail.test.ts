import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { goalPayload, openingLinePayload, peoplePayload, personalPayloads, readinessPayload, reviewConfirmationPayload, reviewPayload } from "./helpers/event-detail-fixtures";

const require = createRequire(import.meta.url);
const iconFont = readFileSync("node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf").toString("base64");
let browser: Browser;
let script: string;
// Only HTTP, native capabilities, auth/focus and the device environment are doubled.
// Route, resource/client validation, view-models and the complete screen render for real.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import { onSessionExpired } from "./src/api/session-expiry";
import { createTranslator } from "./src/i18n/messages";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const source = { id: "event-core:event:1:v1", type: "event_import", label: "活动主办方", captureMethod: "organizer_feed", provider: "event-core-postgres", providerRecordId: "event:1", importedAt: "2026-09-12T00:00:00Z", calendarSyncRequested: false, externalNetworkRequested: false, liveDatabaseWriteExecuted: false, organizerFeedRequested: false };
const event = { id: "event:1", title: "周末产品交流会", startsAt: "2026-09-12T05:00:00Z", endsAt: "2026-09-12T08:00:00Z", status: "imported", venue: "东京 · 涩谷", organizer: "星野社区", description: "带着一个正在推进的产品问题，和其他参与者交流做法与经验。", recommendedPreparation: "带上想交流的产品问题。", relationshipContext: "与产品同行交流实际经验。", nextAction: "先确认活动要求，再继续报名。", sourceMetadata: source, evidence: [], aiProviderRequested: false, calendarProviderRequested: false, calendarSyncRequested: false, emailProviderRequested: false, externalNetworkRequested: false, liveDatabaseWriteExecuted: false, notificationDelivered: false, organizerFeedRequested: false,
  coverPath: "/orbit-covers/meeting.jpg", stats: { count: 24, youRsvped: false }, feeLabel: "免费", agenda: [{ time: "14:00", label: "见面与介绍", description: "主办方介绍、参与者自我介绍" }, { time: "14:30", label: "小组讨论", description: "围绕实际问题展开交流" }, { time: "16:00", label: "自由交流", description: "开放讨论与建立联系" }]
};
const state = window.fixture = { requests: [], pending: [], navigation: [], presses: {}, shares: [], expiries: 0, actor: "actor-1", cookieHeader: "", baseUrl: "https://orbit.example", ready: true, baseReady: true, signedIn: false, focused: true, mounted: true, id: "public-product", width: 390, fontScale: 1, language: "zh", event, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  data(path) { if (path.startsWith("/api/events/public/")) return state.invalid ? {} : { event: { ...state.event, ...state.eventPatch } }; if (path.endsWith("/registration")) return state.registration ?? { eligibility: { allowedActions: ["register"], applicationVersion: null, evaluatedAt: "2026-09-12T00:00:00.000Z", policyVersion: null, reason: "open", registrationVersion: null, state: "open" }, questionSet: { questions: [] }, registration: null }; return state.personal?.[path] ?? {}; },
  reply(index, status = 200, payload) { const r = state.requests[index]; state.pending[index]?.(new Response(JSON.stringify(status === 200 || payload !== undefined ? { success: true, data: payload === undefined ? state.data(r.path) : payload } : { success: false, error: { code: status === 404 ? "NOT_FOUND" : "UNAVAILABLE", message: "暂时无法读取，请重试" } }), { status, headers: { "Content-Type": "application/json" } })); }
};
Date.now = () => Date.parse("2026-09-12T00:00:00Z");
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => {
  const index = state.requests.length; const path = new URL(String(input)).pathname;
  state.requests.push({ path, url: String(input), method: init.method, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
  const pending = new Promise(resolve => state.pending[index] = resolve);
  if (!(state.holdReads && init.method === "GET") && !(state.holdWrites && init.method !== "GET")) queueMicrotask(() => {
    const ownerRead = path === "/api/events/event%3A1";
    state.reply(index, init.method !== "GET" || state.failure ? 503 : ownerRead ? state.ownerStatus ?? 200 : 200,
      ownerRead && (state.ownerStatus === undefined || state.ownerStatus === 200) ? state.ownerDetail ?? { event: { ...state.event, ...state.eventPatch } } : undefined);
  });
  return pending;
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, actorId: state.signedIn ? state.actor : null, user: state.signedIn ? { id: "subject-" + state.actor } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useOrbitLocale = () => { observe(); return { language: state.language, t: createTranslator(state.language) }; };
export const useIsFocused = () => { observe(); return state.focused; };
export const useLocalSearchParams = () => { observe(); return { id: state.id }; };
export const usePathname = () => "/events/" + state.id;
export const useRouter = () => ({ canGoBack: () => Boolean(state.canGoBack), back() { state.navigation.push("back"); }, replace(href) { state.navigation.push(href); }, push(href) { state.navigation.push(href); } });
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, edges?.includes?.("top") && { paddingTop: 48 }, edges?.includes?.("bottom") && { paddingBottom: 24 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size, fontFamily: "OrbitTestIonicons", fontSize: size, lineHeight: 1, color }}>{String.fromCodePoint(glyphs[name])}</span>;
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/events/[id]"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(<App />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "event-detail-http-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "detail" }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|OrbitLocaleContext|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "detail" }));
      plugin.onLoad({ filter: /.*/, namespace: "detail" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Pressable as RealPressable, Text as RealText, TextInput as RealTextInput, RefreshControl as RealRefreshControl, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web";
import { useFixture } from "fixture"; export * from "react-native-web";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
export const Pressable = props => { const text = React.Children.toArray(props.children).find(child => React.isValidElement(child) && typeof child.props.children === "string"); const label = props.accessibilityLabel || text?.props.children; if (label) window.fixture.presses[label] = props.onPress; return <RealPressable {...props} />; };
export const RefreshControl = props => { window.fixture.refresh = props.onRefresh; return <RealRefreshControl {...props} />; };
const scaled = (props, scale) => { const style = StyleSheet.flatten(props.style) || {}; return !style.fontSize || props.allowFontScaling === false ? props.style : [props.style, { fontSize: style.fontSize * scale, ...(style.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }]; };
export const Text = props => { const s = useFixture(); return <RealText {...props} style={scaled(props, s.fontScale)} />; };
export const TextInput = props => { const s = useFixture(); return <RealTextInput {...props} style={scaled(props, s.fontScale)} />; };
export const Share = { share: async content => { const s = window.fixture; s.shares.push(content); if (s.holdShare) return new Promise((resolve, reject) => s.finishShare = error => error ? reject(new Error(error)) : resolve({ action: "dismissedAction" })); if (s.shareError) throw new Error("Share unavailable"); return { action: "dismissedAction" }; } };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }]
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const p = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, deviceScaleFactor: 2, colorScheme: patch.dark ? "dark" : "light" });
  p.setDefaultTimeout(1800); const errors: string[] = []; p.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  const cover = readFileSync("../orbits/public/orbit-covers/meeting.jpg");
  await p.route("**/*", r => r.request().url().endsWith("/orbit-covers/meeting.jpg") ? r.fulfill({ contentType: "image/jpeg", body: cover }) : r.abort());
  await p.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch); await p.addScriptTag({ content: script });
  await settle(p); await p.evaluate(() => document.fonts.ready);
  return p;
}
async function press(p: Page, name: string) { await p.getByRole("button", { name, exact: true }).click(); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function writes(p: Page) { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET").map((r: any) => ({ method: r.method, path: r.path, body: r.body }))); }

async function personalPage(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const p = await open(t, { signedIn: true, personal: personalPayloads, holdWrites: true, ...patch });
  await p.getByPlaceholder("写清楚这场活动想换到什么关系结果").waitFor();
  return p;
}

async function replyWrite(p: Page, payload: unknown, status = 200) {
  await p.evaluate(({ payload, status }) => { const s = (window as any).fixture; s.reply(s.requests.findLastIndex((r: any) => r.method !== "GET"), status, payload); }, { payload, status });
  await settle(p);
}

test("public detail does not advertise an owner-only attendee roster to a signed-out viewer", async t => {
  const p = await open(t);
  assert.equal(await p.getByRole("button", { name: "查看参会者", exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

for (const ownerStatus of [401, 403, 404, 503]) test("public detail with denied or unavailable owner access does not offer attendee navigation " + ownerStatus, async t => {
  const p = await open(t, { signedIn: true, ownerStatus });
  assert.equal(await p.getByRole("button", { name: "查看参会者", exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

test("public detail only enables the exact canonical event roster after an owner lookup", async t => {
  const p = await open(t, { signedIn: true });
  await press(p, "查看参会者");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/events/event%3A1/attendees"]);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.path === "/api/events/event%3A1").length), 1);
});

test("native weekday segmentation does not corrupt the event date or share text", async t => {
  const p = await open(t, { mounted: false, eventPatch: { startsAt: "2026-08-29T02:30:00Z", endsAt: "2026-08-29T04:00:00Z" } });
  await p.evaluate(() => {
    const original = Intl.DateTimeFormat.prototype.formatToParts;
    Intl.DateTimeFormat.prototype.formatToParts = function (value) {
      const options = this.resolvedOptions();
      // Actual native Intl output for a Chinese month/day/weekday combination.
      if (options.locale === "zh-CN" && options.weekday && options.day) return [
        { type: "month", value: "8" }, { type: "literal", value: "/" }, { type: "day", value: "29周六" },
      ];
      return original.call(this, value);
    };
  });
  await update(p, { mounted: true });
  assert.equal(await p.getByText("8月29日 周六", { exact: true }).count(), 1);
  assert.equal(await p.getByText("11:30 – 13:00", { exact: true }).count(), 1);
  await press(p, "分享活动");
  assert.match(await p.evaluate(() => (window as any).fixture.shares[0].message), /8月29日 周六/);
  assert.deepEqual(await writes(p), []);
});

test("switching event-detail language localizes chrome while preserving literal event data and id", async t => {
  const p = await open(t);
  await update(p, { language: "ja" });
  assert.equal(await p.getByRole("button", { name: "イベントを共有", exact: true }).count(), 1);
  assert.equal(await p.getByRole("heading", { name: "イベント紹介", exact: true }).count(), 1);
  assert.equal(await p.getByText("日付", { exact: true }).count(), 1);
  assert.equal(await p.getByText("周末产品交流会", { exact: true }).count(), 1);
  assert.equal(await p.getByText("东京 · 涩谷", { exact: true }).count(), 1);

  await update(p, { language: "en" });
  assert.equal(await p.getByRole("button", { name: "Share event", exact: true }).count(), 1);
  assert.equal(await p.getByRole("heading", { name: "About this event", exact: true }).count(), 1);
  assert.equal(await p.getByText("Date", { exact: true }).count(), 1);
  assert.equal(await p.getByText("周末产品交流会", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

test("ended canonical detail says ended and never sends the footer into registration", async t => {
  const p = await open(t, { eventPatch: { status: "cancelled", startsAt: "2026-09-10T05:00:00Z", endsAt: "2026-09-10T08:00:00Z", sourceMetadata: { label: "event-core-postgres" } } });
  assert.equal(await p.getByText("已结束", { exact: true }).count(), 1);
  const footer = p.getByRole("button", { name: "活动已结束", exact: true });
  assert.equal(await footer.isDisabled(), true);
  assert.equal(await p.getByText("已取消", { exact: true }).count(), 0);
  await p.evaluate(() => (window as any).fixture.presses["活动已结束"]?.()); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
  assert.equal(await p.getByRole("button", { name: "查看参会者", exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

test("an explicitly cancelled future event cannot open registration", async t => {
  const p = await open(t, { eventPatch: { status: "cancelled" } });
  assert.equal(await p.getByText("已取消", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "活动已取消", exact: true }).isDisabled(), true);
  assert.equal(await p.getByRole("button", { name: "报名参加", exact: true }).count(), 0);
});

test("signed-in detail uses server eligibility for closed and pending registration states", async t => {
  const closed = await open(t, {
    signedIn: true,
    registration: {
      eligibility: {
        allowedActions: [], applicationVersion: null,
        evaluatedAt: "2038-01-19T03:14:07.000Z", policyVersion: null,
        reason: "registration_closed", registrationVersion: null,
        state: "registration_closed"
      },
      questionSet: { questions: [] }, registration: null
    }
  });
  const closedButton = closed.getByRole("button", { name: "报名已截止", exact: true });
  assert.equal(await closedButton.isDisabled(), true);
  assert.equal(await closed.evaluate(() => (window as any).fixture.requests.some((request: any) => request.path.endsWith("/registration"))), true);

  const pending = await open(t, {
    signedIn: true,
    registration: {
      eligibility: {
        allowedActions: ["withdraw"], applicationVersion: 2,
        evaluatedAt: "2038-01-19T03:14:07.000Z", policyVersion: 1,
        reason: "pending_review", registrationVersion: null,
        state: "pending_review"
      },
      questionSet: { questions: [] }, registration: null
    }
  });
  await press(pending, "查看申请");
  assert.deepEqual(await pending.evaluate(() => (window as any).fixture.navigation), ["/events/event%3A1/register"]);
});

test("open admission can enter the registration interview from event detail", async t => {
  const p = await open(t, {
    signedIn: true,
    registration: {
      eligibility: {
        allowedActions: ["apply"], applicationVersion: null,
        evaluatedAt: "2038-01-19T03:14:07.000Z", policyVersion: 1,
        reason: "open", registrationVersion: null,
        state: "open"
      },
      questionSet: { questions: [] }, registration: null
    }
  });
  const apply = p.getByRole("button", { name: "报名参加", exact: true });
  assert.equal(await apply.isDisabled(), false);
  await apply.click();
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/events/event%3A1/register"]);
});

test("canonical service placeholders become readable labels without replacing real business copy", async t => {
  const p = await open(t, { eventPatch: { description: "", relationshipContext: "Published event context.",
    sourceMetadata: { label: "event-core-postgres" }, evidence: [{ excerpt: "Canonical event event:1." }],
    recommendedPreparation: "Review the event details and complete the event-scoped registration profile.",
    nextAction: "Sign in and register before viewing the attendee list." } });
  const text = await p.locator("body").innerText();
  for (const placeholder of ["event-core-postgres", "Canonical event", "Published event context", "Review the event", "Sign in and register"]) assert.equal(text.includes(placeholder), false);
  assert.equal(await p.getByText("主办方活动记录", { exact: true }).count(), 1);
  assert.equal(await p.getByText("查看活动详情，并完善本次活动的报名资料。", { exact: true }).count(), 1);
  assert.equal(await p.getByText("登录并完成报名后，可查看完整参会者名单。", { exact: true }).count(), 1);
  await update(p, { eventPatch: { description: "Real product discussion", recommendedPreparation: "Bring your research notes", nextAction: "Meet at the reception", evidence: [{ excerpt: "Organizer announcement" }], sourceMetadata: { label: "Hoshino Community" } } });
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  for (const copy of ["Real product discussion", "Bring your research notes", "Meet at the reception", "Organizer announcement", "Hoshino Community"]) assert.ok((await p.locator("body").innerText()).includes(copy));
});

test("personal modules read canonical event IDs without writing and expose the goal editor accessibly", async t => {
  const p = await personalPage(t);
  assert.equal(await p.getByRole("textbox", { name: "自定义活动目标", exact: true }).count(), 1);
  assert.equal(await p.getByText("会前准备度", { exact: true }).count(), 1);
  assert.equal(await p.getByText("推荐认识的人", { exact: true }).count(), 1);
  assert.equal(await p.getByText("会后复核", { exact: true }).count(), 1);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.map((r: any) => r.path).sort()), ["/api/events/public/public-product", "/api/events/event%3A1", "/api/events/event%3A1/registration", ...Object.keys(personalPayloads)].sort());
  assert.deepEqual(await writes(p), []);
  if (process.env.APP_STYLE_SCREENSHOTS) { await p.getByText("会前准备度", { exact: true }).scrollIntoViewIfNeeded(); await p.screenshot({ path: "/tmp/orbit-ink-signal-event-detail-private-390.png" }); }
});

test("personal loading, pending and empty states remain visible with independent read-only retries", async t => {
  const p = await open(t, { signedIn: true, holdReads: true });
  await p.evaluate(() => (window as any).fixture.reply(0)); await settle(p);
  for (const label of ["正在读取会前准备", "正在读取推荐对象", "正在读取会后复核"]) assert.equal(await p.getByText(label, { exact: true }).count(), 1);
  if (process.env.APP_STYLE_SCREENSHOTS) { await p.getByText("正在读取会前准备", { exact: true }).scrollIntoViewIfNeeded(); await p.screenshot({ path: "/tmp/orbit-ink-signal-event-detail-private-loading.png" }); }
  const pendingPayloads = { ...personalPayloads,
    "/api/events/event%3A1/readiness": { ...readinessPayload, state: "pending" },
    "/api/recommendations/event/event%3A1": { ...peoplePayload, state: "pending", recommendations: [] },
    "/api/events/event%3A1/post-event": { ...reviewPayload, state: "pending", contacts: [] }
  };
  await p.evaluate(payloads => { const s = (window as any).fixture; for (let i = 1; i < s.requests.length; i++) s.reply(i, 200, payloads[s.requests[i].path as keyof typeof payloads] ?? s.data(s.requests[i].path)); }, pendingPayloads); await settle(p);
  for (const label of ["会前准备还在更新", "推荐对象还在准备中", "会后资料还在准备中"]) assert.equal(await p.getByText(label, { exact: true }).count(), 1);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-event-detail-private-pending.png" });
  const emptyPayloads = {
    "/api/events/event%3A1/readiness": { ...readinessPayload, state: "empty", goal: null, suggestedGoals: [], readinessChecklist: [], preparationState: { ...readinessPayload.preparationState, readinessScore: 0 } },
    "/api/recommendations/event/event%3A1": { ...peoplePayload, state: "empty", recommendations: [] },
    "/api/events/event%3A1/post-event": { ...reviewPayload, state: "empty", contacts: [] }
  };
  await update(p, { personal: emptyPayloads, holdReads: false });
  for (const label of ["重新读取会前准备", "重新读取推荐对象", "重新读取会后复核"]) await press(p, label);
  for (const label of ["还没有会前准备记录", "暂无推荐对象", "暂无会后复核候选"]) assert.equal(await p.getByText(label, { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "报名参加", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "换一句", exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "确认这些候选", exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
  if (process.env.APP_STYLE_SCREENSHOTS) { await p.getByText("还没有会前准备记录", { exact: true }).scrollIntoViewIfNeeded(); await p.screenshot({ path: "/tmp/orbit-ink-signal-event-detail-private-empty.png" }); }
});

for (const [path, valid, failureLabel, retryLabel, invalids] of [
  ["/api/events/event%3A1/readiness", readinessPayload, "暂时取不到会前准备", "重新读取会前准备", [{}, { ...readinessPayload, event: { ...readinessPayload.event, id: "event:2" } }, { ...readinessPayload, preparationState: { ...readinessPayload.preparationState, readinessScore: "75" } }]],
  ["/api/recommendations/event/event%3A1", peoplePayload, "暂时取不到推荐对象", "重新读取推荐对象", [{}, { ...peoplePayload, event: { ...peoplePayload.event, id: "event:2" } }, { ...peoplePayload, recommendations: [...peoplePayload.recommendations, ...peoplePayload.recommendations] }]],
  ["/api/events/event%3A1/post-event", reviewPayload, "暂时取不到会后复核", "重新读取会后复核", [{}, { ...reviewPayload, event: { ...reviewPayload.event, id: "event:2" } }, { ...reviewPayload, contacts: [{ ...reviewPayload.contacts[0], contactDraftId: "" }] }]]
] as const) for (const invalid of invalids) test("invalid private reads are recoverable without hiding public detail " + path + " " + JSON.stringify(invalid).slice(0, 95), async t => {
  const p = await open(t, { signedIn: true, personal: { ...personalPayloads, [path]: invalid } });
  assert.equal(await p.getByText(failureLabel, { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "报名参加", exact: true }).count(), 1);
  if (process.env.APP_STYLE_SCREENSHOTS && path.endsWith("/readiness") && Object.keys(invalid).length === 0) {
    await p.getByText(failureLabel, { exact: true }).scrollIntoViewIfNeeded(); await p.screenshot({ path: "/tmp/orbit-ink-signal-event-detail-private-failure.png" });
  }
  await update(p, { personal: { ...personalPayloads, [path]: valid } });
  const count = await p.evaluate(() => (window as any).fixture.requests.length); await press(p, retryLabel);
  assert.equal(await p.getByText(failureLabel, { exact: true }).count(), 0);
  assert.deepEqual(await p.evaluate(count => (window as any).fixture.requests.slice(count).map((r: any) => r.path), count), [path]);
  assert.deepEqual(await writes(p), []);
});

test("goal confirmation locks synchronously and requires the accepted goal before showing success", async t => {
  const p = await personalPage(t); await p.getByRole("button", { name: /产品交流/ }).click(); await settle(p);
  await p.evaluate(() => { const confirm = (window as any).fixture.presses["确认目标"]; confirm(); confirm(); }); await settle(p);
  assert.deepEqual(await writes(p), [{ method: "PUT", path: "/api/events/event%3A1/goal", body: { goalText: "交流一次用户访谈经验", selectedSuggestionId: "suggestion:1" } }]);
  assert.equal(await p.getByText("活动目标已确认。", { exact: true }).count(), 0);
  await update(p, { personal: { ...personalPayloads, "/api/events/event%3A1/readiness": goalPayload } });
  await replyWrite(p, goalPayload);
  assert.equal(await p.getByText("活动目标已确认。", { exact: true }).count(), 1);
  assert.equal(await p.getByPlaceholder("写清楚这场活动想换到什么关系结果").inputValue(), "交流一次用户访谈经验");
});

test("editing a custom goal clears the old suggestion and failures preserve the exact draft", async t => {
  const p = await personalPage(t); const input = p.getByPlaceholder("写清楚这场活动想换到什么关系结果");
  await input.fill("  认识三位正在开展用户研究的同行  "); await settle(p); await press(p, "确认目标");
  assert.deepEqual(await writes(p), [{ method: "PUT", path: "/api/events/event%3A1/goal", body: { goalText: "认识三位正在开展用户研究的同行" } }]);
  await replyWrite(p, {}, 503);
  assert.equal(await input.inputValue(), "  认识三位正在开展用户研究的同行  ");
  assert.equal(await p.getByText("活动目标已确认。", { exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "确认目标", exact: true }).isEnabled(), true);
});

test("personal goal text and suggestions preserve non-Chinese business content", async t => {
  const p = await personalPage(t, { personal: { ...personalPayloads, "/api/events/event%3A1/readiness": {
    ...readinessPayload, goal: { ...readinessPayload.goal, intent: "Meet two product leads" },
    suggestedGoals: [{ ...readinessPayload.suggestedGoals[0], label: "Product research", intent: "Discuss customer interviews", rationale: "Exchange research experience" }]
  } } });
  assert.equal(await p.getByPlaceholder("写清楚这场活动想换到什么关系结果").inputValue(), "Meet two product leads");
  await p.getByRole("button", { name: /Product research/ }).click(); await settle(p);
  assert.equal(await p.getByPlaceholder("写清楚这场活动想换到什么关系结果").inputValue(), "Discuss customer interviews");
  assert.deepEqual(await writes(p), []);
});

test("readiness checklist and next step retain the actual multilingual instructions", async t => {
  const p = await personalPage(t, { personal: { ...personalPayloads, "/api/events/event%3A1/readiness": {
    ...readinessPayload, readinessChecklist: [{ ...readinessPayload.readinessChecklist[0], label: "Bring research notes", rationale: "Compare three customer interviews" }],
    preparationState: { ...readinessPayload.preparationState, nextPreparationStep: "受付で参加証を受け取る" }
  } } });
  for (const value of ["Bring research notes", "Compare three customer interviews", "受付で参加証を受け取る"]) assert.equal(await p.getByText(value, { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

test("recommendation reasons and next actions retain the actual multilingual instructions", async t => {
  const p = await personalPage(t, { personal: { ...personalPayloads, "/api/recommendations/event/event%3A1": {
    ...peoplePayload, nextAction: "Start with the research group", recommendations: [{ ...peoplePayload.recommendations[0],
      reasons: ["Both teams interview the same customer segment", "Keep the second business reason"], recommendedAction: "Meet at the west entrance" }]
  } } });
  for (const value of ["Start with the research group", "Meet at the west entrance"]) assert.equal(await p.getByText(value, { exact: true }).count(), 1);
  const text = await p.locator("body").innerText();
  for (const value of ["Both teams interview the same customer segment", "Keep the second business reason"]) assert.ok(text.includes(value));
  assert.deepEqual(await writes(p), []);
});

test("post-event next actions retain the actual read and confirmed instructions", async t => {
  const p = await personalPage(t, { personal: { ...personalPayloads, "/api/events/event%3A1/post-event": { ...reviewPayload, nextAction: "Review the conversation notes first" } } });
  assert.equal(await p.getByText("Review the conversation notes first", { exact: true }).count(), 1);
  await press(p, "确认这些候选");
  await replyWrite(p, { ...reviewConfirmationPayload, nextAction: "Check the saved contact before writing a message" });
  assert.equal(await p.getByText("Check the saved contact before writing a message", { exact: true }).count(), 1);
  assert.equal((await writes(p)).length, 1);
});

test("known readiness service placeholders are translated without exposing implementation labels", async t => {
  const p = await personalPage(t, { personal: { ...personalPayloads, "/api/events/event%3A1/readiness": {
    ...readinessPayload,
    goal: { ...readinessPayload.goal, intent: "Find two AI workflow PoC or restaurant CRM pilot partners from generated attendees." },
    suggestedGoals: [
      { ...readinessPayload.suggestedGoals[0], label: "Find live pilot partners", intent: "Find two AI workflow PoC or restaurant CRM pilot partners from generated attendees.", rationale: "Generated attendee intents include PoC, workflow, pilot, and CRM signals." },
      { ...readinessPayload.suggestedGoals[0], goalId: "suggestion:2", label: "Map warm operator paths", intent: "Identify warm operator introduction paths among known contacts and partner-channel attendees.", rationale: "Generated roster tags include known-contact and partner-path signals." },
      { ...readinessPayload.suggestedGoals[0], goalId: "suggestion:3", label: "Capture investor context", intent: "Collect investor-context feedback on the strongest generated relationship opportunities.", rationale: "Generated relationship records include investor, seed, or founder feedback context." }
    ],
    readinessChecklist: [
      { ...readinessPayload.readinessChecklist[0], label: "Review generated attendee intents", rationale: "24 generated attendee records are available for goal planning." },
      { ...readinessPayload.readinessChecklist[0], itemId: "check:2", label: "Check known-contact paths first", rationale: "3 generated attendees already map to known contacts." },
      { ...readinessPayload.readinessChecklist[0], itemId: "check:3", label: "Review eligible recommendation pool", rationale: "8 attendees are eligible for follow-up review." },
      { ...readinessPayload.readinessChecklist[0], itemId: "check:4", label: "Confirm the primary event goal", rationale: "A source-backed goal is ready for operator review." }
    ],
    preparationState: { ...readinessPayload.preparationState, nextPreparationStep: "Review the generated attendee evidence attached to the primary goal." }
  } } });
  const text = await p.locator("body").innerText();
  assert.doesNotMatch(text, /generated|live pilot|source-backed/iu);
  for (const value of ["寻找试点伙伴", "梳理熟人引荐路径", "了解投资人的反馈", "查看参会者意向", "有 24 位参会者的资料可用于准备活动目标。", "其中 3 位参会者已经是你的人脉。", "有 8 位参会者可供会后联系复核。", "活动目标已有来源信息，等待你复核。", "查看与当前目标相关的参会者来源信息。"]) assert.equal(await p.getByText(value, { exact: true }).count(), 1);
  assert.equal(await p.getByPlaceholder("写清楚这场活动想换到什么关系结果").inputValue(), "从参会者中寻找两位 AI 工作流概念验证或餐饮 CRM 试点伙伴。");
  assert.deepEqual(await writes(p), []);
  if (process.env.APP_STYLE_SCREENSHOTS) { await p.getByText("会前准备度", { exact: true }).scrollIntoViewIfNeeded(); await p.screenshot({ path: "/tmp/orbit-ink-signal-event-detail-service-copy.png" }); }
});

test("business uses of live generated and provider remain untouched", async t => {
  const goal = "Find live music partners";
  const p = await personalPage(t, { personal: { ...personalPayloads,
    "/api/events/event%3A1/readiness": { ...readinessPayload, goal: { ...readinessPayload.goal, intent: goal },
      suggestedGoals: [{ ...readinessPayload.suggestedGoals[0], label: "Our generated revenue", intent: "Meet a cloud provider", rationale: "We run live workshops" }],
      preparationState: { ...readinessPayload.preparationState, nextPreparationStep: "Compare provider pricing" } },
    "/api/recommendations/event/event%3A1": { ...peoplePayload, recommendations: [{ ...peoplePayload.recommendations[0], reasons: ["Both teams build generated art"], recommendedAction: "Visit the live music area" }] }
  } });
  for (const value of [goal, "Our generated revenue", "We run live workshops", "Compare provider pricing", "Both teams build generated art", "Visit the live music area"]) assert.ok((await p.locator("body").innerText()).includes(value));
  await p.getByRole("button", { name: /Our generated revenue/ }).click(); await settle(p);
  assert.equal(await p.getByPlaceholder("写清楚这场活动想换到什么关系结果").inputValue(), "Meet a cloud provider");
});

for (const value of ["__proto__", "constructor", "toString"]) test("literal prototype-name business text stays text through read and goal confirmation " + value, async t => {
  const p = await personalPage(t, { personal: { ...personalPayloads,
    "/api/events/event%3A1/readiness": { ...readinessPayload, goal: { ...readinessPayload.goal, intent: value },
      suggestedGoals: [{ ...readinessPayload.suggestedGoals[0], label: value, intent: value, rationale: value }] },
    "/api/recommendations/event/event%3A1": { ...peoplePayload, nextAction: value }
  } });
  const input = p.getByPlaceholder("写清楚这场活动想换到什么关系结果");
  assert.equal(await input.inputValue(), value);
  assert.ok((await p.locator("body").innerText()).includes(value));
  await input.fill(value + " draft"); await input.fill(value); await press(p, "确认目标");
  const receipt = { ...goalPayload, acceptedGoalText: value, goal: { ...goalPayload.goal, intent: value, selectedSuggestionId: null } };
  await update(p, { personal: { ...personalPayloads, "/api/events/event%3A1/readiness": receipt } });
  await replyWrite(p, receipt);
  assert.equal(await input.inputValue(), value);
  assert.equal(await p.getByText("活动目标已确认。", { exact: true }).count(), 1);
  assert.equal((await writes(p))[0]?.body.goalText, value);
});

for (const [value, expected] of [
  ["Review confirmed contacts before any formal Contacts write or follow-up send.", "正式保存联系人或发送跟进消息前，请再次复核已确认的联系人。"],
  ["Route any follow-up send through a separate confirmation guard before external action execution.", "发送跟进消息需要再次确认；本次确认不会发送消息。"]
] as const) test("actual service confirmation next step is readable " + value, async t => {
  const p = await personalPage(t);
  await press(p, "确认这些候选");
  await replyWrite(p, { ...reviewConfirmationPayload, nextAction: value });
  assert.equal(await p.getByText(expected, { exact: true }).count(), 1);
  assert.equal(await p.getByText(value, { exact: true }).count(), 0);
  assert.equal((await writes(p)).length, 1);
});

for (const [value, expected] of [
  ["Choose a live storage goal or enter a concise event goal.", "选择一个建议目标，或写下本次活动的目标。"],
  ["Review the live storage readiness checklist before the event.", "活动开始前，再检查一次准备清单。"],
  ["Review the generated goal and readiness checklist before the event.", "活动开始前，复核目标和准备清单。"],
  ["Verify generated attendee records before setting an event goal.", "先核对参会者资料，再设置活动目标。"]
] as const) test("readiness fallback next step translates the exact service instruction " + value, async t => {
  const p = await personalPage(t, { personal: { ...personalPayloads, "/api/events/event%3A1/readiness": {
    ...readinessPayload, nextAction: value, preparationState: { ...readinessPayload.preparationState, nextPreparationStep: "" }
  } } });
  assert.equal(await p.getByText(expected, { exact: true }).count(), 1);
  assert.equal(await p.getByText(value, { exact: true }).count(), 0);
});

test("actual fixture readiness and recommendation instructions avoid implementation copy", async t => {
  // Literal strings verified in Web goal-readiness/fixtures.ts and recommendations/fixtures.ts.
  // The HTTP structures remain complete App fixtures; no server implementation is imported.
  const rationales = [
    ["The event fixture overlaps with operator attendees and the active storage pilot relationship context.", "参会者和当前储能试点的合作需求相关。"],
    ["Local fixture rules connect the dinner to storage pilot operators and partner-path contacts.", "晚餐参会者中有储能试点负责人，以及可以引荐的合作伙伴。"],
    ["The event fixture includes operator investors, but the recommended preparation keeps evidence before outreach.", "参会者中有业务负责人和投资人，建议先核对信息，再发起联系。"]
  ];
  const checklist = [
    ["A primary event goal is set from deterministic local suggestions.", "已根据建议选定本次活动的主要目标。"],
    ["The mock keeps follow-up ownership pending so the operator can confirm it before the event.", "跟进负责人尚未确认，请在活动开始前确认。"],
    ["A deterministic local rule says the fixture has no time conflict.", "参考日程未见时间冲突，请再核对你的实际日程。"]
  ];
  const p = await personalPage(t, { personal: { ...personalPayloads,
    "/api/events/event%3A1/readiness": { ...readinessPayload,
      suggestedGoals: rationales.map(([rationale], index) => ({ ...readinessPayload.suggestedGoals[0], goalId: "fixture-goal:" + index, rationale })),
      readinessChecklist: checklist.map(([rationale], index) => ({ ...readinessPayload.readinessChecklist[0], itemId: "fixture-check:" + index, rationale })),
      preparationState: { ...readinessPayload.preparationState, nextPreparationStep: "Set a local mock goal before composing pre-event preparation." } },
    "/api/recommendations/event/event%3A1": { ...peoplePayload, recommendations: [{ ...peoplePayload.recommendations[0], reasons: [
      "The opening line can cite only local event roster evidence.",
      "The recommended action is a source-backed context check, not immediate outreach."
    ] }] }
  } });
  const text = await p.locator("body").innerText();
  assert.doesNotMatch(text, /fixture|deterministic|mock|source-backed/iu);
  for (const [, expected] of [...rationales, ...checklist]) assert.ok(text.includes(expected!));
  for (const expected of ["先设置活动目标，再准备会前介绍。", "开场白仅参考本次活动的参会者资料。", "建议先核对来源和背景，暂不发起联系。"]) assert.ok(text.includes(expected));
  assert.deepEqual(await writes(p), []);
});

test("recommendation and post-event service next steps use readable copy", async t => {
  const p = await personalPage(t, { personal: { ...personalPayloads,
    "/api/recommendations/event/event%3A1": { ...peoplePayload, nextAction: "Review the top live recommendation before using its opening line." },
    "/api/events/event%3A1/post-event": { ...reviewPayload, nextAction: "Review generated contact drafts before confirming any records." }
  } });
  for (const text of ["使用开场白前，先查看推荐对象的资料。", "确认记录前，先复核联系人草稿。"]) assert.equal(await p.getByText(text, { exact: true }).count(), 1);
});

test("an acknowledged non-Chinese goal survives the following readiness read", async t => {
  const p = await personalPage(t); const input = p.getByPlaceholder("写清楚这场活动想换到什么关系结果");
  await input.fill("Meet two product leads"); await press(p, "确认目标");
  const receipt = { ...goalPayload, acceptedGoalText: "Meet two product leads", goal: { ...goalPayload.goal, intent: "Meet two product leads", selectedSuggestionId: null } };
  await update(p, { personal: { ...personalPayloads, "/api/events/event%3A1/readiness": receipt } });
  await replyWrite(p, receipt);
  assert.equal(await input.inputValue(), "Meet two product leads");
  assert.equal(await p.getByText("活动目标已确认。", { exact: true }).count(), 1);
});

test("editing during goal confirmation preserves the newer unsubmitted draft", async t => {
  const p = await personalPage(t); const input = p.getByPlaceholder("写清楚这场活动想换到什么关系结果");
  await p.getByRole("button", { name: /产品交流/ }).click(); await press(p, "确认目标");
  await input.fill("这份新目标尚未提交"); await settle(p);
  await update(p, { personal: { ...personalPayloads, "/api/events/event%3A1/readiness": goalPayload } });
  await replyWrite(p, goalPayload);
  assert.equal(await input.inputValue(), "这份新目标尚未提交");
  assert.equal(await p.getByText("活动目标已确认。", { exact: true }).count(), 0);
  assert.equal((await writes(p)).length, 1);
});

test("refreshing detail preserves a dirty goal draft and revokes its pending write", async t => {
  const p = await personalPage(t); const input = p.getByPlaceholder("写清楚这场活动想换到什么关系结果");
  await input.fill("这份目标还在编辑"); await settle(p); await press(p, "确认目标");
  await p.evaluate(() => (window as any).fixture.refresh()); await settle(p);
  assert.equal(await input.inputValue(), "这份目标还在编辑");
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method === "PUT").signal?.aborted), true);
  await replyWrite(p, { ...goalPayload, acceptedGoalText: "这份目标还在编辑", goal: { ...goalPayload.goal, intent: "这份目标还在编辑", selectedSuggestionId: null } });
  assert.equal(await input.inputValue(), "这份目标还在编辑");
  assert.equal(await p.getByText("活动目标已确认。", { exact: true }).count(), 0);
});

for (const [label, payload, status] of [
  ["missing", {}, 200], ["pending", { ...goalPayload, state: "pending" }, 202], ["other event", { ...goalPayload, event: { ...goalPayload.event, id: "event:2" } }, 200],
  ["other goal", { ...goalPayload, acceptedGoalText: "不是用户选中的目标" }, 200], ["other goal record", { ...goalPayload, goal: { ...goalPayload.goal, intent: "不同内容" } }, 200],
  ["other goal event", { ...goalPayload, goal: { ...goalPayload.goal, eventId: "event:2" } }, 200], ["other suggestion", { ...goalPayload, goal: { ...goalPayload.goal, selectedSuggestionId: "suggestion:other" } }, 200], ["not 2xx", goalPayload, 503]
] as const) test("unacknowledged goal writes stay editable " + label, async t => {
  const p = await personalPage(t); await p.getByRole("button", { name: /产品交流/ }).click(); await press(p, "确认目标");
  await replyWrite(p, payload, status);
  assert.equal(await p.getByText("活动目标已确认。", { exact: true }).count(), 0);
  assert.equal(await p.getByText("活动目标暂时未能确认，请重试。", { exact: true }).count(), 1);
  assert.equal(await p.getByPlaceholder("写清楚这场活动想换到什么关系结果").inputValue(), "交流一次用户访谈经验");
});

test("opening-line refresh locks synchronously and uses the returned attendee-specific text", async t => {
  const p = await personalPage(t);
  await p.evaluate(() => { const action = (window as any).fixture.presses["换一句"]; action(); action(); }); await settle(p);
  assert.deepEqual(await writes(p), [{ method: "POST", path: "/api/recommendations/event/event%3A1/opening-line", body: { attendeeId: "attendee:li", style: "context_question" } }]);
  await replyWrite(p, openingLinePayload);
  assert.equal(await p.getByText("这轮访谈里，哪个发现改变了你们的产品计划？", { exact: true }).count(), 1);
  assert.equal(await p.getByText("开场白已更新", { exact: true }).count(), 1);
});

test("a valid non-Chinese opening line is shown verbatim after refresh", async t => {
  const p = await personalPage(t); await press(p, "换一句");
  await replyWrite(p, { ...openingLinePayload, openingLine: { ...openingLinePayload.openingLine, text: "Which customer interview changed your roadmap?" } });
  assert.equal(await p.getByText("Which customer interview changed your roadmap?", { exact: true }).count(), 1);
  assert.equal(await p.getByText("开场白已更新", { exact: true }).count(), 1);
});

test("personal generated drafts retain actual text when read in another language", async t => {
  const p = await personalPage(t, { personal: { ...personalPayloads,
    "/api/recommendations/event/event%3A1": { ...peoplePayload, recommendations: [{ ...peoplePayload.recommendations[0], openingLine: { ...peoplePayload.recommendations[0]!.openingLine, text: "What did you learn from your customer interviews?" } }] },
    "/api/events/event%3A1/post-event": { ...reviewPayload, contacts: [{ ...reviewPayload.contacts[0], summary: { ...reviewPayload.contacts[0]!.summary, headline: "Continue our product research discussion", whyNow: "We both have ongoing research" }, tags: [{ ...reviewPayload.contacts[0]!.tags[0], label: "Product research" }], followUpSuggestion: { ...reviewPayload.contacts[0]!.followUpSuggestion, messageDraft: "Would you like to compare interview notes next week?" } }] }
  } });
  for (const text of ["What did you learn from your customer interviews?", "Continue our product research discussion", "We both have ongoing research", "Product research", "Would you like to compare interview notes next week?"]) assert.equal(await p.getByText(text, { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

for (const section of ["goal", "opener", "followup"]) test("personal long content stays readable at 320pt and large text " + section, async t => {
  const longTitle = "本次目标建议：交流日本市场用户研究与产品开发协作的具体经验";
  const longOpener = "你们最近在日本市场的用户访谈中，有哪些发现改变了产品开发的优先顺序？我想了解你们如何把访谈结果转化成具体的合作计划。";
  const longFollowup = "很高兴今天交流了日本市场用户研究和产品开发的经验。我们下周可以继续比较访谈记录，讨论如何推进下一阶段的跨团队合作。";
  const p = await personalPage(t, { width: 320, fontScale: 1.6, personal: { ...personalPayloads,
    "/api/events/event%3A1/readiness": { ...readinessPayload, suggestedGoals: [{ ...readinessPayload.suggestedGoals[0], label: longTitle }] },
    "/api/recommendations/event/event%3A1": { ...peoplePayload, recommendations: [{ ...peoplePayload.recommendations[0], openingLine: { ...peoplePayload.recommendations[0]!.openingLine, text: longOpener } }] },
    "/api/events/event%3A1/post-event": { ...reviewPayload, contacts: [{ ...reviewPayload.contacts[0], followUpSuggestion: { ...reviewPayload.contacts[0]!.followUpSuggestion, messageDraft: longFollowup } }] }
  } });
  const text = p.getByText(section === "goal" ? longTitle : section === "opener" ? longOpener : longFollowup, { exact: true });
  await text.scrollIntoViewIfNeeded();
  const box = (await text.boundingBox())!;
  assert.ok(box.x >= 16 && box.x + box.width <= 304, "personal text fits the content width");
  assert.equal(await text.evaluate(el => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1), false, "personal text must wrap without ellipsis");
  const action = p.getByRole("button", { name: section === "goal" ? "确认目标" : section === "opener" ? "换一句" : "确认这些候选", exact: true });
  await action.scrollIntoViewIfNeeded(); const actionBox = (await action.boundingBox())!;
  assert.ok(actionBox.height >= 44 && actionBox.x >= 16 && actionBox.x + actionBox.width <= 304);
  if (section === "followup") {
    const safety = (await p.getByText("确认后不会发送消息", { exact: true }).boundingBox())!;
    assert.ok(safety.y >= actionBox.y + actionBox.height, "large-text confirmation safety copy gets its own full-width row");
  }
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-event-detail-private-320-" + section + ".png" });
  assert.deepEqual(await writes(p), []);
});

for (const [label, payload, status] of [
  ["missing", {}, 200], ["pending", { ...openingLinePayload, state: "pending" }, 202], ["other attendee", { ...openingLinePayload, openingLine: { ...openingLinePayload.openingLine, attendeeId: "attendee:other" } }, 200],
  ["other event", { ...openingLinePayload, openingLine: { ...openingLinePayload.openingLine, eventId: "event:2" } }, 200], ["blank text", { ...openingLinePayload, openingLine: { ...openingLinePayload.openingLine, text: "" } }, 200],
  ["other recommendation", { ...openingLinePayload, recommendation: { ...openingLinePayload.recommendation, recommendationId: "recommendation:other" } }, 200],
  ["other style", { ...openingLinePayload, openingLine: { ...openingLinePayload.openingLine, style: "post_event_follow_up" } }, 200],
  ["notification", { ...openingLinePayload, openingLine: { ...openingLinePayload.openingLine, notificationDelivered: true } }, 200],
  ["missing safety", { ...openingLinePayload, provenance: {} }, 200], ["not 2xx", openingLinePayload, 503]
] as const) test("unacknowledged opening lines never replace the existing text " + label, async t => {
  const p = await personalPage(t); await press(p, "换一句"); await replyWrite(p, payload, status);
  assert.equal(await p.getByText("开场白已更新", { exact: true }).count(), 0);
  assert.equal(await p.getByText("你们最近的用户访谈有哪些发现？", { exact: true }).count(), 1);
  assert.equal(await p.getByText("暂时没能生成新的开场白，请重试。", { exact: true }).count(), 1);
});

test("post-event confirmation locks synchronously and only valid selected candidates enable review navigation", async t => {
  const p = await personalPage(t);
  await p.evaluate(() => { const action = (window as any).fixture.presses["确认这些候选"]; action(); action(); }); await settle(p);
  assert.deepEqual(await writes(p), [{ method: "POST", path: "/api/events/event%3A1/post-event/confirm", body: { contactDraftIds: ["draft:li"] } }]);
  assert.equal(await p.getByRole("button", { name: "去复核联系人", exact: true }).count(), 0);
  await replyWrite(p, reviewConfirmationPayload);
  assert.equal(await p.getByText("已确认 1 位候选。发送消息仍需另外确认。", { exact: true }).count(), 1);
  await press(p, "去复核联系人"); assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), "/contacts/new");
  assert.equal((await writes(p)).length, 1);
});

for (const [label, payload, status] of [
  ["missing", {}, 200], ["pending", { ...reviewConfirmationPayload, state: "pending" }, 202], ["other event", { ...reviewConfirmationPayload, eventId: "event:2" }, 200],
  ["other review", { ...reviewConfirmationPayload, reviewId: "review:other" }, 200], ["other candidate", { ...reviewConfirmationPayload, confirmedContacts: [{ ...reviewConfirmationPayload.confirmedContacts[0], contactDraftId: "draft:other" }] }, 200],
  ["empty", { ...reviewConfirmationPayload, confirmedContacts: [] }, 200], ["sent", { ...reviewConfirmationPayload, confirmedContacts: [{ ...reviewConfirmationPayload.confirmedContacts[0], externalMessageSendRequested: true }] }, 200],
  ["nested event", { ...reviewConfirmationPayload, event: { ...reviewConfirmationPayload.event, id: "event:2" } }, 200],
  ["duplicate candidates", { ...reviewConfirmationPayload, confirmedContacts: [...reviewConfirmationPayload.confirmedContacts, ...reviewConfirmationPayload.confirmedContacts] }, 200],
  ["nested send", { ...reviewConfirmationPayload, confirmedContacts: [{ ...reviewConfirmationPayload.confirmedContacts[0], followUpSuggestion: { ...reviewConfirmationPayload.confirmedContacts[0]!.followUpSuggestion, externalMessageSendRequested: true } }] }, 200],
  ["missing safety", { ...reviewConfirmationPayload, provenance: {} }, 200], ["not 2xx", reviewConfirmationPayload, 503]
] as const) test("post-event confirmation is not fabricated from " + label, async t => {
  const p = await personalPage(t); await press(p, "确认这些候选"); await replyWrite(p, payload, status);
  assert.equal(await p.getByRole("button", { name: "去复核联系人", exact: true }).count(), 0);
  assert.equal(await p.getByText("候选暂时未能确认，请重试。", { exact: true }).count(), 1);
  assert.equal(await p.getByText("可以继续交流用户研究", { exact: true }).count(), 1);
});

for (const action of ["确认目标", "换一句", "确认这些候选"]) for (const patch of [{ actor: "actor-2" }, { cookieHeader: "fixture-2" }, { baseUrl: "https://second.example" }, { id: "event:2" }, { focused: false }, { signedIn: false }, { mounted: false }, { refresh: true }]) test("obsolete personal write and retained callback cannot mutate current detail " + action + JSON.stringify(patch), async t => {
  const p = await personalPage(t);
  await p.evaluate(action => { const s = (window as any).fixture; s.oldAction = s.presses[action]; s.oldAction(); }, action); await settle(p);
  if ("refresh" in patch) { await p.evaluate(() => (window as any).fixture.refresh()); await settle(p); } else await update(p, patch);
  const before = (await writes(p)).length;
  await p.evaluate(() => (window as any).fixture.oldAction()); await settle(p); await replyWrite(p, undefined, 401);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.find((r: any) => r.method !== "GET").signal?.aborted), true);
  assert.equal((await writes(p)).length, before);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.getByText("活动目标已确认。", { exact: true }).count(), 0);
  assert.equal(await p.getByText("开场白已更新", { exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "去复核联系人", exact: true }).count(), 0);
});

for (const patch of [{ actor: "actor-2" }, { cookieHeader: "fixture-2" }, { baseUrl: "https://second.example" }, { id: "event:2" }, { focused: false }, { signedIn: false }, { mounted: false }, { refresh: true }]) test("obsolete private reads cannot expire the new scope " + JSON.stringify(patch), async t => {
  const p = await open(t, { signedIn: true, holdReads: true });
  await p.evaluate(() => (window as any).fixture.reply(0)); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 6);
  if ("refresh" in patch) { await p.evaluate(() => (window as any).fixture.refresh()); await settle(p); } else await update(p, patch);
  for (const index of [1, 2, 3, 4, 5]) {
    assert.equal(await p.evaluate(index => (window as any).fixture.requests[index].signal?.aborted, index), true);
    await p.evaluate(index => (window as any).fixture.reply(index, 401), index); await settle(p);
  }
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.deepEqual(await writes(p), []);
});

test("detail places its title below the compact cover and keeps registration fixed outside scrolling content", async t => {
  const p = await open(t);
  const title = p.getByRole("heading", { name: "周末产品交流会", exact: true }); await title.waitFor();
  const cover = (await p.getByTestId("event-detail-cover").boundingBox())!;
  const heading = (await title.boundingBox())!;
  assert.equal(cover.height, 96); assert.equal(cover.x, 16); assert.equal(cover.width, 358);
  assert.ok(heading.y >= cover.y + cover.height && heading.y <= cover.y + cover.height + 16);
  assert.equal(await title.evaluate(el => getComputedStyle(el).fontSize), "24px");
  assert.equal(await p.getByRole("heading", { name: "活动详情", exact: true }).count(), 1);
  assert.equal(await p.getByRole("tablist", { name: "主导航" }).count(), 0);
  const register = p.getByRole("button", { name: "报名参加", exact: true }); const before = (await register.boundingBox())!;
  assert.ok(before.height >= 50 && before.y > 700 && before.y + before.height <= 820);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-event-detail-390-" + (process.env.EVENT_DETAIL_QA_PASS ?? "current") + ".png" });
  await p.getByText("先确认活动要求，再继续报名。", { exact: true }).scrollIntoViewIfNeeded();
  assert.deepEqual(await register.boundingBox(), before);
  assert.deepEqual(await writes(p), []);
});

test("detail uses actual Tokyo date, time range, organizer and agenda with four-grid hierarchy", async t => {
  const p = await open(t);
  const date = p.getByText("9月12日 周六", { exact: true }); const time = p.getByText("14:00 – 17:00", { exact: true });
  await date.waitFor(); const d = (await date.boundingBox())!; const timeBox = (await time.boundingBox())!;
  assert.ok(timeBox.x > d.x + 100 && Math.abs(timeBox.y - d.y) < 2);
  assert.equal(await p.getByText("星野社区主办 · 24 人已报名", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("heading", { name: "活动介绍", exact: true }).count(), 1);
  assert.equal(await p.getByRole("heading", { name: "当天安排", exact: true }).count(), 1);
  const firstAgenda = (await p.getByText("见面与介绍", { exact: true }).boundingBox())!;
  const nextAgenda = (await p.getByText("小组讨论", { exact: true }).boundingBox())!;
  assert.ok(nextAgenda.y - firstAgenda.y >= 48 && nextAgenda.y - firstAgenda.y <= 52, "agenda matches the source's roughly 50pt row rhythm");
  assert.equal(await p.getByText("见面与介绍", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: /星野社区/ }).count(), 0, "no organizer navigation without a supported target");
  assert.equal(await p.getByText("免费", { exact: true }).count(), 1);
});

test("public-code reads navigate to canonical event IDs without registering", async t => {
  const p = await open(t); await press(p, "报名参加"); await press(p, "打开活动现场");
  assert.equal(await p.getByRole("button", { name: "查看参会者", exact: true }).count(), 0);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/events/event%3A1/register", "/party?eventId=event%3A1"]);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.map((r: any) => r.path)), ["/api/events/public/public-product"]);
  assert.deepEqual(await writes(p), []);
});

for (const patch of [{ actor: "actor-2" }, { baseUrl: "https://second.example" }, { id: "event:2" }, { signedIn: false }]) test("late owner qualification cannot enable the obsolete detail roster " + JSON.stringify(patch), async t => {
  const p = await open(t, { signedIn: true, holdReads: true });
  await p.evaluate(() => (window as any).fixture.reply(0)); await settle(p);
  assert.equal(await p.getByRole("button", { name: "查看参会者", exact: true }).count(), 0);
  const index = await p.evaluate(() => (window as any).fixture.requests.findIndex((r: any) => r.path === "/api/events/event%3A1"));
  assert.ok(index > 0);
  await update(p, patch);
  assert.equal(await p.evaluate(index => (window as any).fixture.requests[index].signal.aborted, index), true);
  await p.evaluate(index => { const s = (window as any).fixture; s.reply(index, 200, { event: s.event }); }, index); await settle(p);
  assert.equal(await p.getByRole("button", { name: "查看参会者", exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

test("missing optional public metadata is not filled with design sample counts or agenda", async t => {
  const p = await open(t, { eventPatch: { stats: undefined, agenda: undefined, organizer: undefined, feeLabel: undefined } });
  assert.equal(await p.getByText("报名人数待确认", { exact: false }).count(), 1);
  assert.equal(await p.getByText("主办方待确认", { exact: true }).count(), 1);
  assert.equal(await p.getByText("小组讨论", { exact: true }).count(), 0);
  assert.equal(await p.getByText(/24 人/).count(), 0);
  assert.equal(await p.getByText("活动开始", { exact: true }).count(), 1);
});

for (const eventPatch of [{ title: 42 }, { id: "" }, { startsAt: "yesterday" }, { endsAt: "2026-09-11T08:00:00Z" }, { status: "invented" }, { stats: { count: "24" } }, { agenda: [{ time: 14, label: "wrong" }] }]) test("bad public event fields do not produce usable detail " + JSON.stringify(eventPatch), async t => {
  const p = await open(t, { eventPatch });
  assert.equal(await p.getByText("暂时取不到活动详情", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "报名参加", exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "分享活动", exact: true }).count(), 0);
  await update(p, { eventPatch: {} }); await press(p, "重新读取活动");
  assert.equal(await p.getByRole("button", { name: "报名参加", exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

for (const patch of [{ invalid: true }, { failure: true }]) test("detail read errors have a retry instead of an invented event " + JSON.stringify(patch), async t => {
  const p = await open(t, patch);
  assert.equal(await p.getByText("暂时取不到活动详情", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "报名参加", exact: true }).count(), 0);
  if (process.env.APP_STYLE_SCREENSHOTS && "failure" in patch) await p.screenshot({ path: "/tmp/orbit-ink-signal-event-detail-public-failure.png" });
  await update(p, { invalid: false, failure: false }); await press(p, "重新读取活动");
  assert.equal(await p.getByRole("heading", { name: "周末产品交流会", exact: true }).count(), 1);
});

for (const patch of [{ ready: false }, { baseReady: false }, { focused: false }, { id: undefined }]) test("inactive or incomplete detail route does not read or expose actions " + JSON.stringify(patch), async t => {
  const p = await open(t, patch);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests), []);
  assert.equal(await p.getByRole("button", { name: "报名参加", exact: true }).count(), 0);
});

for (const patch of [{ actor: "actor-2" }, { cookieHeader: "fixture-2" }, { baseUrl: "https://second.example" }, { focused: false }, { signedIn: false }, { id: "event:2" }, { mounted: false }]) test("obsolete detail reads cannot expire the active session " + JSON.stringify(patch), async t => {
  const p = await open(t, { signedIn: true, holdReads: true }); await update(p, patch);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[0]?.signal?.aborted), true);
  await p.evaluate(() => (window as any).fixture.reply(0, 401)); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
});

for (const patch of [{ actor: "actor-2" }, { cookieHeader: "fixture-2" }, { baseUrl: "https://second.example" }, { focused: false }, { signedIn: false }, { id: "event:2" }, { mounted: false }]) test("retained detail navigation and refresh callbacks are inert after scope changes " + JSON.stringify(patch), async t => {
  const p = await open(t, { signedIn: true }); await p.getByRole("button", { name: "报名参加", exact: true }).waitFor();
  await p.evaluate(() => { const s = (window as any).fixture; s.retained = [s.presses["报名参加"], s.presses["查看参会者"], s.presses["打开活动现场"], s.presses["返回活动"], s.refresh]; });
  await update(p, { holdReads: true, ...patch });
  const before = await p.evaluate(() => (window as any).fixture.requests.length);
  await p.evaluate(() => (window as any).fixture.retained.forEach((action: () => void) => action())); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), before);
});

test("share uses current public text once, treats dismissal quietly and exposes retryable failure", async t => {
  const p = await open(t, { holdShare: true }); await p.getByRole("button", { name: "分享活动", exact: true }).waitFor();
  await p.evaluate(() => { const share = (window as any).fixture.presses["分享活动"]; share(); share(); }); await settle(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.shares), [{ message: "周末产品交流会\n9月12日 周六 14:00 – 17:00\n东京 · 涩谷" }]);
  await p.evaluate(() => (window as any).fixture.finishShare()); await settle(p);
  assert.equal(await p.getByText("分享成功", { exact: false }).count(), 0);
  await update(p, { holdShare: false, shareError: true }); await press(p, "分享活动");
  assert.equal(await p.getByText("暂时无法分享，请重试。", { exact: true }).count(), 1);
  await update(p, { shareError: false }); await press(p, "分享活动");
  assert.equal(await p.getByText("暂时无法分享，请重试。", { exact: true }).count(), 0);
  assert.deepEqual(await writes(p), []);
});

test("a dismissed old share cannot update a new detail or run its retained callback", async t => {
  const p = await open(t, { holdShare: true }); await p.getByRole("button", { name: "分享活动", exact: true }).waitFor();
  await p.evaluate(() => { const s = (window as any).fixture; s.oldShare = s.presses["分享活动"]; s.oldShare(); }); await settle(p);
  await update(p, { id: "event:2" });
  await p.evaluate(() => { const s = (window as any).fixture; s.oldShare(); s.finishShare("failed"); }); await settle(p);
  assert.equal(await p.evaluate(() => (window as any).fixture.shares.length), 1);
  assert.equal(await p.getByText("暂时无法分享，请重试。", { exact: true }).count(), 0);
});

for (const canGoBack of [false, true]) test("detail back uses actual history or the public event list " + canGoBack, async t => {
  const p = await open(t, { canGoBack }); await press(p, canGoBack ? "返回" : "返回活动");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), [canGoBack ? "back" : "/events"]);
});

for (const patch of [{ width: 320, fontScale: 1.6 }, { width: 820 }, { dark: true }]) test("detail keeps long text and the final content accessible across sizes " + JSON.stringify(patch), async t => {
  const longTitle = "面向跨境产品与工程团队的周末交流会：从用户访谈到长期合作";
  const p = await open(t, { ...patch, eventPatch: { title: longTitle, venue: "东京 · 涩谷国际交流中心三层多功能会议室，入口在东侧", organizer: "星野产品与工程跨境交流社区" } });
  const title = p.getByRole("heading", { name: longTitle, exact: true }); await title.waitFor();
  for (const locator of [title, p.getByText("东京 · 涩谷国际交流中心三层多功能会议室，入口在东侧", { exact: true }).first()]) {
    assert.equal(await locator.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1), true);
    const box = (await locator.boundingBox())!; assert.ok(box.x >= 0 && box.x + box.width <= (patch.width ?? 390));
  }
  const footer = p.getByRole("button", { name: "报名参加", exact: true }); const box = (await footer.boundingBox())!;
  assert.ok(box.y > 500 && box.y + box.height <= 820 && box.height >= 50);
  if (process.env.APP_STYLE_SCREENSHOTS) await p.screenshot({ path: "/tmp/orbit-ink-signal-event-detail-" + (patch.width ?? 390) + (patch.dark ? "-dark" : "") + ".png" });
  const last = p.getByText("先确认活动要求，再继续报名。", { exact: true }); await last.scrollIntoViewIfNeeded();
  const lastBox = (await last.boundingBox())!; assert.ok(lastBox.y >= 48 && lastBox.y + lastBox.height < box.y);
  await footer.click(); assert.equal(await p.evaluate(() => (window as any).fixture.navigation.at(-1)), "/events/event%3A1/register");
});

test("event confirmation and zero participants never imply the viewer is registered", async t => {
  const p = await open(t, { eventPatch: { status: "confirmed", stats: { count: 0, youRsvped: false } } });
  assert.equal(await p.getByText("活动已确认", { exact: true }).count(), 1);
  assert.equal(await p.getByText("星野社区主办 · 0 人已报名", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "报名参加", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "管理报名", exact: true }).count(), 0);
});
