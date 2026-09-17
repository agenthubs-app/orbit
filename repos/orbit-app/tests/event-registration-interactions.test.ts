import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;

// Real route, screen, hooks, HTTP client and view-models. Only device/UI
// integration, auth/server providers, native snapshots and external fetch are replaced.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { onSessionExpired } from "./src/api/session-expiry";
import { createTranslator } from "./src/i18n/messages";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = {
  actor: "actor-1", eventId: "event:1", language: "zh", baseUrl: "https://orbit.example", cookieHeader: "", ready: true, baseReady: true, signedIn: true, mounted: true,
  requests: [], pending: [], presses: {}, alerts: [], navigation: [], expiries: 0, holdReads: false,
  eventStatus: 200, registrationStatus: 200, cachedRegistration: false, snapshotReads: [], snapshotWrites: [],
  version: 1, hash: "a".repeat(64), prompt: "Who would you like to meet?", savedAnswer: "Saved answer", registered: true,
  ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); },
  receipt(patch = {}) {
    const updatedAt = state.registrationVersion ?? "2026-09-13T00:00:00Z"; const action = state.receiptAction ?? (state.registered ? "update" : "cancel");
    return { id: "registration:1", eventId: state.eventId, userId: state.actor, status: state.registered ? "rsvped" : "cancelled",
      participantProfileId: "participant:1", registeredAt: "2026-09-10T00:00:00Z", cancelledAt: null, reactivatedAt: null,
      participantProfile: { id: "participant:1", eventId: state.eventId, userId: state.actor, answers: state.savedAnswers ?? { targetAttendees: state.savedAnswer }, createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z" },
      mutationReceipt: { action, actorId: state.actor, eventId: state.eventId, recordId: "registration:1", registrationVersion: updatedAt },
      sideEffects: { calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false, notificationDelivered: false, organizerMessageSent: false, refundRequested: false }, ...patch, updatedAt };
  },
  data(path) {
    if (state.omitRegistrationSource && path.endsWith("/registration/portrait")) return { portrait: state.portrait ?? null };
    if (path.includes("/recommendations/event/")) return state.recommendations ?? { state: "empty", event: { id: state.eventId }, recommendations: [], nextAction: "" };
    if (path.endsWith("/registration/portrait")) return { portrait: state.portrait ?? null, registrationSource: state.unregistered ? null : { actorId: state.actor, eventId: state.eventId, sourceVersion: state.registrationSourceVersion ?? "c".repeat(64), answers: Object.entries(state.savedAnswers ?? { targetAttendees: state.savedAnswer }).filter(([, answer]) => answer.trim()).map(([field, answer]) => ({ responseId: "legacy:" + field, field, label: { en: field, zh: field }, answer, question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion: state.registrationSourceVersion ?? "c".repeat(64) })) } };
    if (path.endsWith("/registration")) { const eligibilityState = state.eligibilityState ?? (state.registered ? "registered" : "registration_cancelled"); const allowedActions = state.allowedActions ?? (state.registered ? ["update", "cancel"] : ["reactivate"]); return { eligibility: { allowedActions, applicationVersion: state.applicationVersion ?? null, evaluatedAt: "2026-09-15T01:00:00.000Z", policyVersion: state.policyVersion ?? null, reason: eligibilityState, registrationVersion: state.unregistered ? null : state.registrationVersion ?? "2026-09-13T00:00:00Z", state: eligibilityState }, registration: state.unregistered ? null : state.receipt(), questionSet: { questionSetHash: state.hash, questionSetVersion: state.version,
      questions: (state.questions ?? [{ id: "target_attendees", intent: "target_attendees", participantProfileField: "targetAttendees", prompt: state.prompt, options: state.options ?? [], required: true }]).map(q => ({ ...q, portraitQuestionToken: "synthetic-formal-proof:" + q.id })),
      provenance: { aiProviderRequested: false, externalNetworkRequested: false, fallbackReason: null, generationMethod: "deterministic-fallback", model: null, provider: null } } }; }
    return { event: { id: state.eventId, title: "Networking meeting", startsAt: "2026-09-20T10:00:00+09:00", endsAt: "2026-09-20T12:00:00+09:00", status: "confirmed", venue: "Tokyo", location: "Tokyo", description: "Meet local founders", stats: { rsvpCount: state.registered ? 2 : 1, youRsvped: state.registered } } };
  },
  reply(index, status = 200, data) {
    state.pending[index]?.(new Response(JSON.stringify(data === undefined && status !== 200 ? { success: false, error: { code: status === 401 ? "UNAUTHORIZED" : status === 409 ? "CONFLICT" : "SERVICE_UNAVAILABLE", message: "Request not accepted" } } : { success: true, data: data === undefined ? state.data(state.requests[index].path) : data }), { status, headers: { "content-type": "application/json" } }));
  }
};
onSessionExpired(() => state.expiries++);
window.fetch = async (input, init) => { const index = state.requests.length; const url = new URL(String(input));
  state.requests.push({ method: init.method, path: url.pathname, query: url.search, origin: url.origin, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
  const response = new Promise(resolve => state.pending[index] = resolve);
  if (init.method === "GET" && !state.holdReads) queueMicrotask(() => state.reply(index, url.pathname.includes("/recommendations/event/") ? state.recommendationsStatus ?? 200 : url.pathname.endsWith("/registration") ? state.registrationStatus : state.eventStatus));
  return response;
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: state.ready, signedIn: state.signedIn, accountId: state.signedIn ? state.actor : null, actorId: state.signedIn ? state.actor : null, user: state.signedIn ? { id: state.actor } : null, cookieHeader: state.cookieHeader }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: state.baseReady, baseUrl: state.baseUrl }; };
export const useOrbitLocale = () => { observe(); return { language: state.language, t: createTranslator(state.language) }; };
export const useLocalSearchParams = () => { observe(); return { id: state.eventId }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => "/events/" + encodeURIComponent(state.eventId) + "/register";
export const useRouter = () => ({ canGoBack: () => false, back() {}, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); } });
export const Redirect = () => <div role="status">Sign in</div>;
export const Stack = () => null;
export const readSnapshot = async (baseUrl, actorId, path) => { state.snapshotReads.push(path); return state.cachedRegistration && path.includes("/registration?") ? { result: { success: true, status: 200, data: state.data(path.split("?")[0]), meta: { featureMode: null, privacy: null, runtimeBoundary: null } }, syncedAt: "2026-09-12T00:00:00Z" } : null; };
export const writeSnapshot = async (baseUrl, actorId, path) => { state.snapshotWrites.push(path); };
export const Ionicons = () => <span aria-hidden="true" />;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/events/[id]/register"; import { useFixture } from "fixture"; function App() { const s = useFixture(); return s.mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(<App />);', resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "registration-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "registration" }));
      plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|OrbitLocaleContext|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "registration" }));
      plugin.onLoad({ filter: /.*/, namespace: "registration" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Platform as RealPlatform, Alert as RealAlert, Pressable as RealPressable, RefreshControl as RealRefreshControl } from "react-native-web"; export * from "react-native-web";
export const Pressable = props => { const text = React.Children.toArray(props.children).find(child => React.isValidElement(child) && typeof child.props.children === "string"); const label = props.accessibilityLabel || text?.props.children; if (label) window.fixture.presses[label] = props.onPress; return <RealPressable {...props} />; };
export const RefreshControl = props => { window.fixture.refresh = props.onRefresh; return <RealRefreshControl {...props} />; };
export const Platform = { ...RealPlatform, get OS() { return window.fixture.platform ?? "ios"; } };
export const Alert = { alert(title, message, buttons) { if(window.fixture.platform==="web")return RealAlert.alert(title,message,buttons); window.fixture.alerts.push({ title, message, buttons: buttons.slice(0, 3) }); } };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
      plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

async function settle(p: Page) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }

test("7a missing physical registration reference fails privately without fabricating ISO proofs or blocking original enrollment", async t => {
  const p = await open(t, { omitRegistrationSource: true, savedAnswers: { targetAttendees: "Builders", valueOffered: "Reviews" } });
  assert.equal(await p.getByRole("button", { name: "更新报名资料", exact: true }).isEnabled(), true);
  await p.getByRole("button", { name: "补充画像", exact: true }).click(); await settle(p);
  assert.equal(await p.getByRole("button", { name: "更新报名资料", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "重新读取报名资料", exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

test("7a small navigation, history and result actions have actual 44px browser hit containers", async t => {
  const p = await open(t, { savedAnswers: { targetAttendees: "Builders", valueOffered: "Reviews" } });
  const check = async (name: string) => {
    const box = await p.getByRole("button", { name, exact: true }).boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, `${name} must have a 44px container; actual ${JSON.stringify(box)}`);
  };
  await check("返回活动");
  await press(p, "补充画像");
  await check("跳过"); await check("全部"); await check("改 希望认识");
  await press(p, "生成画像"); await reply(p, 200, previewFixture("Hit targets"));
  await check("编辑回答");
});
async function open(t: { after(fn: () => Promise<void>): void }, patch = {}, waitForForm = true) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.setDefaultTimeout(2000); const errors: string[] = []; p.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort()); await p.setContent('<div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch); await p.addScriptTag({ content: script });
  if (waitForForm) await p.getByPlaceholder("写一句具体的补充。", { exact: true }).first().waitFor();
  await settle(p); return p;
}
// Existing cases now take the real 7a navigation path instead of assuming an inline interview.
async function press(p: Page, name: string) {
  const actual = name === "生成活动画像" ? "生成画像" : name;
  if (await p.getByRole("button", { name: actual, exact: true }).count() === 0) {
    if (actual === "下一题" || actual === "生成画像") {
      const start = p.getByRole("button", { name: "补充画像", exact: true });
      const edit = p.getByRole("button", { name: "编辑回答", exact: true });
      if (await edit.count()) await edit.click();
      else if (await start.count()) await start.click();
      else { await p.getByRole("button", { name: "查看", exact: true }).click(); await p.getByRole("button", { name: "编辑回答", exact: true }).click(); }
    } else await p.getByRole("button", { name: "报名资料", exact: true }).click();
    await settle(p);
  }
  await p.getByRole("button", { name: actual, exact: true }).click(); await settle(p);
}
async function fill(p: Page, value: string, index = 0) { const interview = await p.getByRole("heading", { name: "活动画像", exact: true }).count(); await p.getByPlaceholder("写一句具体的补充。", { exact: true }).nth(interview && index === 1 ? 0 : index).fill(value); await settle(p); }
async function update(p: Page, patch: object) { await p.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(p); }
async function refresh(p: Page) { await p.evaluate(() => (window as any).fixture.refresh()); await settle(p); }
async function writes(p: Page): Promise<{ method: string; path: string; body: any }[]> { return p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "POST").map((r: any) => ({ method: r.method, path: r.path, body: r.body }))); }
async function reply(p: Page, status = 200, patch?: Record<string, any>) { await p.evaluate(({ status, patch }) => { const s = (window as any).fixture; const i = s.requests.findLastIndex((r: any) => r.method === "POST"); if (patch && (patch.question || patch.signedQuestion)) { const question = patch.signedQuestion?.question ?? patch.question; patch = { done: patch.done, signedQuestion: { question, questionToken: patch.signedQuestion?.questionToken ?? "synthetic-question:" + question.field, portraitAdaptiveToken: patch.signedQuestion?.portraitAdaptiveToken ?? "synthetic-workspace:" + question.field } }; } s.reply(i, status, patch === undefined ? (status === 200 ? s.receipt() : undefined) : patch); }, { status, patch }); await settle(p); }

function previewFixture(tagline: string) {
  return { persona: { tagline, energyStyle: "Listening", industryTags: ["Robotics"], offering: "Reviews", seeking: "Builders", tags: ["Hardware"], openers: ["What are you building?"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } }, generationToken: "synthetic-preview-token", answersVersion: "b".repeat(64), sourceRegistrationVersion: "2026-09-13T00:00:00Z" };
}

test("7a editing a reopened portrait cannot revive its old result after refresh and keeps its CAS version", async t => {
  const preview = previewFixture("Old confirmed private portrait");
  const portrait = { id: "portrait:old", actorId: "actor-1", eventId: "event:1", version: 1, updatedAt: "2026-09-17T10:00:00Z", generatedAt: "2026-09-17T09:59:00Z", sourceEventVersion: "event-core-postgres:event:1:v1", sourceQuestionSetHash: "a".repeat(64), sourceQuestionSetVersion: 1, sourceRegistrationVersion: preview.sourceRegistrationVersion, answersVersion: preview.answersVersion, persona: preview.persona, sourceAnswers: (["targetAttendees", "valueOffered"] as const).map(field => ({ field, responseId: `legacy:${field}`, label: { en: field, zh: field }, answer: field === "targetAttendees" ? "Builders" : "Reviews", question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion: preview.sourceRegistrationVersion })) };
  const questions = ["targetAttendees", "valueOffered"].map(field => ({ id: field === "targetAttendees" ? "target_attendees" : "value_offered", intent: field === "targetAttendees" ? "target_attendees" : "value_offered", participantProfileField: field, prompt: `Original ${field}?`, options: [], required: true }));
  const p = await open(t, { portrait, questions, savedAnswers: { targetAttendees: "Builders", valueOffered: "Reviews" } });
  await p.getByRole("button", { name: "查看", exact: true }).waitFor();
  await fill(p, "New reviews", 1); await refresh(p);
  assert.equal(await p.getByRole("button", { name: "补充画像", exact: true }).count(), 1);
  await press(p, "补充画像");
  assert.equal(await p.getByText("Old confirmed private portrait", { exact: true }).count(), 0);
  await p.getByText("New reviews", { exact: true }).waitFor();
  await press(p, "生成画像"); await reply(p, 200, previewFixture("New draft private portrait"));
  await press(p, "保存画像");
  const mutation = (await writes(p)).at(-1)!.body; assert.equal(mutation.expectedPortraitVersion, 1);
  const updated = { ...portrait, version: 2, updatedAt: "2026-09-17T10:01:00Z", persona: previewFixture("New draft private portrait").persona };
  await update(p, { portrait: updated }); await reply(p, 200, { portrait: updated, receipt: { mutationId: mutation.mutationId, portraitId: updated.id, actorId: updated.actorId, eventId: updated.eventId, portraitVersion: 2, answersVersion: updated.answersVersion, updatedAt: updated.updatedAt } });
  await p.getByRole("button", { name: "已保存", exact: true }).waitFor();
  assert.equal((await writes(p)).filter(call => call.path.endsWith("/registration")).length, 0);
});

test("7a unregistered formal core drafts generate a private preview without original enrollment writes", async t => {
  const questions = ["targetAttendees", "valueOffered"].map(field => ({ id: field === "targetAttendees" ? "target_attendees" : "value_offered", intent: field === "targetAttendees" ? "target_attendees" : "value_offered", participantProfileField: field, prompt: `Original formal ${field}?`, options: [], required: true }));
  const p = await open(t, { unregistered: true, registered: false, eligibilityState: "open", allowedActions: ["apply"], savedAnswers: {}, questions });
  await fill(p, "Builders", 0); await fill(p, "Reviews", 1);
  await press(p, "补充画像");
  assert.equal(await p.getByRole("button", { name: "生成画像", exact: true }).isEnabled(), true);
  await press(p, "生成画像");
  assert.deepEqual((await writes(p)).map(call => call.body), [{ mode: "portrait-preview", language: "zh", responses: [{ kind: "registration_question", portraitQuestionToken: "synthetic-formal-proof:target_attendees", answer: "Builders" }, { kind: "registration_question", portraitQuestionToken: "synthetic-formal-proof:value_offered", answer: "Reviews" }] }]);
  assert.equal((await writes(p)).filter(call => call.path.endsWith("/registration") || call.path.includes("/admission/")).length, 0);
});

test("7a expired unstored proofs preserve drafts and require actual new questions rather than re-signing", async t => {
  const p = await open(t, { allowedActions: ["apply"], savedAnswers: {}, questions: [] }, false);
  await p.getByRole("button", { name: "补充画像", exact: true }).waitFor();
  await press(p, "补充画像"); await press(p, "下一题");
  await reply(p, 200, { done: false, signedQuestion: { question: { field: "targetAttendees", prompt: "Original first question?", options: [], acknowledgment: "" }, questionToken: "expired:first", portraitAdaptiveToken: "expired:workspace:first" } });
  await fill(p, "Kept first draft"); await press(p, "下一题");
  await reply(p, 200, { done: false, signedQuestion: { question: { field: "valueOffered", prompt: "Original second question?", options: [], acknowledgment: "" }, questionToken: "expired:second", portraitAdaptiveToken: "expired:workspace:second" } });
  await fill(p, "Kept second draft"); await press(p, "生成画像"); await reply(p, 422);
  await press(p, "重新追问未保存的题目");
  await p.getByText("Kept first draft", { exact: true }).waitFor(); await p.getByText("Kept second draft", { exact: true }).waitFor();
  const before = (await writes(p)).length;
  assert.equal(await p.getByRole("button", { name: "生成画像", exact: true }).isDisabled(), true);
  await press(p, "下一题");
  assert.equal((await writes(p)).length, before + 1);
  assert.deepEqual((await writes(p)).at(-1)!.body.transcript, []);
  assert.equal((await writes(p)).filter(call => call.path.endsWith("/registration") || call.path.endsWith("/portrait")).length, 0);
});

test("7a navigation preserves registration draft and does not automatically generate or save", async t => {
  const p = await open(t); await fill(p, "Private draft");
  await press(p, "补充画像");
  assert.equal(await p.getByRole("button", { name: "下一题", exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "更新报名资料", exact: true }).count(), 0);
  await press(p, "全部");
  await p.getByText("旧回答未保留原题，显示已保存的字段与答案。", { exact: true }).waitFor();
  await press(p, "报名资料");
  assert.equal(await p.getByPlaceholder("写一句具体的补充。", { exact: true }).inputValue(), "Private draft");
  assert.deepEqual(await writes(p), []);
});

test("7a portrait preview is independent and saved completion requires receipt plus a separate durable GET", async t => {
  const p = await open(t, { savedAnswer: "Builders", savedAnswers: { targetAttendees: "Builders", valueOffered: "Reviews" } });
  await press(p, "补充画像"); await press(p, "生成画像");
  assert.deepEqual((await writes(p)).at(-1)?.body, { mode: "portrait-preview", language: "zh", responses: [{ kind: "stored_response", source: "registration", responseId: "legacy:targetAttendees", sourceVersion: "c".repeat(64), answer: "Builders" }, { kind: "stored_response", source: "registration", responseId: "legacy:valueOffered", sourceVersion: "c".repeat(64), answer: "Reviews" }] });
  const persona = { energyStyle: "Listening", industryTags: ["Robotics"], offering: "Reviews", openers: ["What are you building?"], seeking: "Builders", tagline: "Real generated portrait", tags: ["Robotics"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } };
  await reply(p, 200, { persona, generationToken: "server-generation-proof", answersVersion: "b".repeat(64), sourceRegistrationVersion: "2026-09-13T00:00:00Z" });
  await p.getByText("Real generated portrait", { exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: "保存画像", exact: true }).isEnabled(), true);
  await press(p, "保存画像");
  const save = (await writes(p)).at(-1)!;
  assert.equal(save.path, "/api/events/event%3A1/registration/portrait");
  assert.equal(save.body.expectedPortraitVersion, null);
  assert.equal(save.body.generationToken, "server-generation-proof");
  assert.ok(save.body.mutationId);
  const portrait = { id: "portrait:1", actorId: "actor-1", eventId: "event:1", version: 1, updatedAt: "2026-09-17T10:00:00.000Z", generatedAt: "2026-09-17T09:59:00.000Z", sourceEventVersion: "event-core-postgres:event:1:v1", sourceQuestionSetHash: "a".repeat(64), sourceQuestionSetVersion: 1, sourceRegistrationVersion: "2026-09-13T00:00:00Z", answersVersion: "b".repeat(64), persona, sourceAnswers: (["targetAttendees", "valueOffered"] as const).map(field => ({ field, responseId: `legacy:${field}`, label: { en: field, zh: field }, answer: field === "targetAttendees" ? "Builders" : "Reviews", question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion: "2026-09-13T00:00:00Z" })) };
  await update(p, { portrait });
  await reply(p, 200, { portrait, receipt: { mutationId: save.body.mutationId, portraitId: portrait.id, actorId: portrait.actorId, eventId: portrait.eventId, portraitVersion: 1, answersVersion: portrait.answersVersion, updatedAt: portrait.updatedAt } });
  await p.getByRole("button", { name: "已保存", exact: true }).waitFor();
  assert.equal((await writes(p)).length, 2);
  assert.equal((await writes(p)).some(write => write.path.endsWith("/registration")), false);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "GET" && r.path.endsWith("/registration/portrait")).length), 2);
  assert.equal(await p.evaluate(() => (window as any).fixture.snapshotWrites.some((path: string) => path.includes("/registration/portrait"))), false);
  await press(p, "报名资料");
  await p.getByText("活动画像已完成", { exact: true }).waitFor();
  await press(p, "查看");
  assert.equal((await writes(p)).length, 2);
  await update(p, { mounted: false }); await update(p, { mounted: true });
  await press(p, "查看");
  await p.getByText("Real generated portrait", { exact: true }).waitFor();
  assert.equal((await writes(p)).length, 2, "Reopening reads the saved portrait without calling the model.");
  await press(p, "报名资料"); await fill(p, "New registration draft");
  assert.equal(await p.getByText("活动画像已完成", { exact: true }).count(), 0);
  await press(p, "补充画像");
  assert.equal(await p.getByRole("button", { name: "保存画像", exact: true }).count(), 0);
  assert.equal(await p.getByText("Real generated portrait", { exact: true }).count(), 0);
  assert.equal((await writes(p)).length, 2, "Editing invalidates the portrait but cannot automatically regenerate it.");
});

test("7a continuous answers use workspace proofs, retain complete review, and editing cancels or clears dependent answers", async t => {
  const p = await open(t); await press(p, "补充画像");
  const step = (field: string, prompt: string) => ({ done: false, signedQuestion: { question: { field, prompt, options: [], acknowledgment: "Understood." }, questionToken: `original-${field}`, portraitAdaptiveToken: `workspace-${field}` } });
  await press(p, "下一题");
  assert.equal((await writes(p)).at(-1)?.body.mode, "portrait-interview");
  await reply(p, 200, step("valueOffered", "First original question?"));
  await fill(p, "Engineering reviews"); await press(p, "下一题"); await reply(p, 503);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。", { exact: true }).inputValue(), "Engineering reviews");
  await press(p, "下一题"); await reply(p, 200, step("industry", "Second original question?"));
  await fill(p, "Robotics"); await press(p, "下一题"); await reply(p, 200, step("desiredOutcome", "Current original question?"));
  await p.getByText("已补充 3/8 项", { exact: true }).waitFor();
  await press(p, "全部");
  await p.getByText("First original question?", { exact: true }).waitFor(); await p.getByText("Second original question?", { exact: true }).waitFor();
  await press(p, "改 能够提供"); await fill(p, "Changed private value"); await press(p, "取消");
  assert.equal(await p.getByText("Engineering reviews", { exact: true }).count(), 1);
  await press(p, "改 能够提供"); await fill(p, "Changed private value"); await press(p, "保留修改");
  await p.getByText("Changed private value", { exact: true }).waitFor();
  assert.equal(await p.getByText("Robotics", { exact: true }).count(), 0);
  await press(p, "报名资料");
  assert.equal(await p.getByPlaceholder("写一句具体的补充。", { exact: true }).inputValue(), "Saved answer", "Private history edits cannot write registration answers.");
  assert.equal((await writes(p)).length, 4);
});

test("7a unconfirmed portrait readback keeps the draft and retries the identical mutation without regenerating", async t => {
  const p = await open(t, { savedAnswers: { targetAttendees: "Builders", valueOffered: "Reviews" } });
  await press(p, "补充画像"); await press(p, "生成画像");
  const preview = previewFixture("Pending portrait");
  await reply(p, 200, preview);
  await update(p, { holdReads: true });
  await press(p, "保存画像");
  const mutation = (await writes(p)).at(-1)!.body;
  const portrait = { id: "portrait:pending", actorId: "actor-1", eventId: "event:1", version: 1, updatedAt: "2026-09-17T10:00:00.000Z", generatedAt: "2026-09-17T09:59:00.000Z", sourceEventVersion: "event-core-postgres:event:1:v1", sourceQuestionSetHash: "a".repeat(64), sourceQuestionSetVersion: 1, sourceRegistrationVersion: preview.sourceRegistrationVersion, answersVersion: preview.answersVersion, persona: preview.persona, sourceAnswers: (["targetAttendees", "valueOffered"] as const).map(field => ({ field, responseId: `legacy:${field}`, label: { en: field, zh: field }, answer: field === "targetAttendees" ? "Builders" : "Reviews", question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion: preview.sourceRegistrationVersion })) };
  const result = { portrait, receipt: { mutationId: mutation.mutationId, portraitId: portrait.id, actorId: portrait.actorId, eventId: portrait.eventId, portraitVersion: portrait.version, answersVersion: portrait.answersVersion, updatedAt: portrait.updatedAt } };
  await reply(p, 200, result);
  await p.evaluate(() => { const s = (window as any).fixture; s.reply(s.requests.length - 1, 503); }); await settle(p);
  assert.equal(await p.getByRole("button", { name: "已保存", exact: true }).count(), 0);
  await p.getByText("Pending portrait", { exact: true }).waitFor();
  const retry = p.getByRole("button", { name: "保存画像", exact: true });
  assert.equal(await retry.isEnabled(), true);
  await retry.click(); await settle(p);
  assert.deepEqual((await writes(p)).at(-1)!.body, mutation);
  await update(p, { portrait, holdReads: false }); await reply(p, 200, result);
  await p.getByRole("button", { name: "已保存", exact: true }).waitFor();
  const calls = await writes(p);
  assert.equal(calls.filter(call => call.path.endsWith("/persona")).length, 1);
  assert.equal(calls.filter(call => call.path.endsWith("/portrait")).length, 2);
  assert.equal(calls.filter(call => call.path.endsWith("/registration")).length, 0);
});

test("7a definite source rejection preserves answers and explicitly reloads sources before regenerating", async t => {
  const p = await open(t, { savedAnswers: { targetAttendees: "Builders", valueOffered: "Reviews" } });
  await press(p, "补充画像"); await press(p, "生成画像"); await reply(p, 200, previewFixture("Old source preview"));
  await press(p, "保存画像"); await reply(p, 409);
  assert.equal(await p.getByText("保存结果待确认，请重试核对。", { exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "已保存", exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "保存画像", exact: true }).isDisabled(), true);
  await update(p, { registrationVersion: "2026-09-17T11:00:00Z", registrationSourceVersion: "d".repeat(64) });
  await press(p, "重新读取画像来源");
  assert.equal((await writes(p)).length, 2, "Recovery reads cannot call the model or write registration.");
  await press(p, "生成画像");
  const body = (await writes(p)).at(-1)!.body;
  assert.deepEqual(body.responses.map((response: any) => [response.answer, response.sourceVersion]), [["Builders", "d".repeat(64)], ["Reviews", "d".repeat(64)]]);
  await reply(p, 200, previewFixture("Fresh source preview"));
  await press(p, "保存画像");
  assert.notDeepEqual((await writes(p)).at(-1)!.body.mutationId, (await writes(p))[1]!.body.mutationId);
  const mutation = (await writes(p)).at(-1)!.body;
  const preview = previewFixture("Fresh source preview");
  const portrait = { id: "portrait:recovered", actorId: "actor-1", eventId: "event:1", version: 1, updatedAt: "2026-09-17T11:01:00Z", generatedAt: "2026-09-17T11:00:30Z", sourceEventVersion: "event-core-postgres:event:1:v1", sourceQuestionSetHash: "a".repeat(64), sourceQuestionSetVersion: 1, sourceRegistrationVersion: "2026-09-17T11:00:00Z", answersVersion: preview.answersVersion, persona: preview.persona, sourceAnswers: (["targetAttendees", "valueOffered"] as const).map(field => ({ field, responseId: `legacy:${field}`, label: { en: field, zh: field }, answer: field === "targetAttendees" ? "Builders" : "Reviews", question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion: "2026-09-17T11:00:00Z" })) };
  await update(p, { portrait });
  await reply(p, 200, { portrait, receipt: { mutationId: mutation.mutationId, portraitId: portrait.id, actorId: portrait.actorId, eventId: portrait.eventId, portraitVersion: 1, answersVersion: portrait.answersVersion, updatedAt: portrait.updatedAt } });
  await p.getByRole("button", { name: "已保存", exact: true }).waitFor();
  assert.equal((await writes(p)).filter(call => call.path.endsWith("/registration")).length, 0);
});

for (const phase of ["preview", "save"] as const) for (const patch of [{ actor: "actor-2" }, { baseUrl: "https://second.example" }, { eventId: "event:2" }, { mounted: false }]) test(`7a private ${phase} drops late results and retained callbacks after scope change ${JSON.stringify(patch)}`, async t => {
  const p = await open(t, { savedAnswers: { targetAttendees: "Builders", valueOffered: "Reviews" } });
  await press(p, "补充画像"); await press(p, "生成画像");
  if (phase === "save") { await reply(p, 200, previewFixture("Old scope private preview")); await press(p, "保存画像"); }
  await p.evaluate(phase => { const s = (window as any).fixture; s.oldPrivateAction = s.presses[phase === "save" ? "保存画像" : "生成画像"]; s.privateRequest = s.requests.findLastIndex((r: any) => r.method === "POST"); }, phase);
  await update(p, { holdReads: true, ...patch });
  const before = await p.evaluate(() => (window as any).fixture.requests.length);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldPrivateAction(); s.reply(s.privateRequest, 401); }); await settle(p);
  assert.equal(await p.getByText("Old scope private preview", { exact: true }).count(), 0);
  assert.equal(await p.getByRole("button", { name: "已保存", exact: true }).count(), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), before, "An old callback/result cannot begin a new-scope request.");
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[(window as any).fixture.privateRequest].signal?.aborted), true);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
});

test("7a result reads real recommendations, opens only a supplied contact route and retries failures", async t => {
  const person = { recommendationId: "recommendation:1", eventId: "event:1", attendee: { attendeeId: "attendee:1", contactId: "contact:1", displayName: "Synthetic authorized partner", role: "Engineer", organization: "Lab" }, rank: 1, score: 95, reasons: ["Shared project"], openingLine: { lineId: "line:1", eventId: "event:1", attendeeId: "attendee:1", style: "warm_context", text: "How is your project?", notificationDelivered: false, emailProviderRequested: false }, recommendedAction: "Meet" };
  const p = await open(t, { savedAnswers: { targetAttendees: "Builders", valueOffered: "Reviews" }, recommendationsStatus: 503 });
  await press(p, "补充画像"); await press(p, "生成画像"); await reply(p, 200, previewFixture("Portrait with recommendations"));
  await p.getByText("推荐暂时无法读取，请重试。", { exact: true }).waitFor();
  assert.equal(await p.getByText("暂时没有可展示的推荐。", { exact: true }).count(), 0);
  await update(p, { recommendationsStatus: 403 }); await press(p, "重试");
  await p.getByText("推荐暂时无法读取，请重试。", { exact: true }).waitFor();
  await update(p, { recommendationsStatus: 200, recommendations: { state: "success", event: { id: "event:1" }, nextAction: "Meet", recommendations: [person] } });
  await press(p, "重试"); await p.getByText("Synthetic authorized partner", { exact: true }).waitFor();
  await press(p, "查看联系人");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), [{ pathname: "/contacts/[id]", params: { id: "contact:1" } }]);
  assert.equal((await writes(p)).length, 1, "Recommendations are read-only and cannot generate another persona.");
});

test("ordinary selection hides the input and other preserves only its own draft", async t => {
  const p = await open(t, { options: ["Founder", "Investor", "Other", "その他"], savedAnswer: "Founder" }, false);
  await p.getByRole("button", { name: "Founder", exact: true }).waitFor();
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").count(), 0);
  assert.equal(await p.getByRole("button", { name: "其他", exact: true }).count(), 1);
  await press(p, "其他"); await fill(p, "Independent advisor");
  await press(p, "Investor");
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").count(), 0);
  await press(p, "更新报名资料");
  assert.equal((await writes(p))[0]?.body.answers.targetAttendees, "Investor");
  await reply(p, 503); await press(p, "其他");
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Independent advisor");
  await press(p, "更新报名资料");
  assert.equal((await writes(p))[1]?.body.answers.targetAttendees, "Independent advisor");
});

test("adaptive history keeps real answered prompts once and failure preserves the current draft", async t => {
  const p = await open(t);
  const step = (prompt: string, field: string) => ({ done: false, signedQuestion: { question: { field, prompt, options: [], acknowledgment: "" }, questionToken: `signed-${field}` } });
  await press(p, "下一题"); await reply(p, 200, step("First real question?", "valueOffered"));
  await p.evaluate(() => { const s = (window as any).fixture; s.retainedNext = s.presses["下一题"]; });
  await fill(p, "Practical experience", 1); await press(p, "下一题"); await reply(p, 503);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").first().inputValue(), "Practical experience");
  await press(p, "下一题"); await reply(p, 200, step("Second real question?", "industry"));
  await p.evaluate(() => (window as any).fixture.retainedNext()); await settle(p);
  assert.equal((await writes(p)).length, 3, "a previous question callback cannot append its answer again");
  assert.equal(await p.getByText("First real question?", { exact: true }).count(), 0, "Compact history shows the answer; full review retains the original prompt.");
  assert.equal(await p.getByText("Practical experience", { exact: true }).count(), 1);
  await press(p, "全部"); assert.equal(await p.getByText("First real question?", { exact: true }).count(), 1); await press(p, "活动画像");
  await fill(p, "Climate", 1); await press(p, "下一题"); await reply(p, 200, step("Third real question?", "desiredOutcome"));
  await press(p, "全部");
  assert.equal(await p.getByText("First real question?", { exact: true }).count(), 1);
  assert.equal(await p.getByText("Second real question?", { exact: true }).count(), 1);
  assert.equal(await p.getByText("已补充 3/8 项", { exact: true }).count(), 1);
  await press(p, "活动画像");
  await fill(p, "Partnership", 1); await press(p, "生成活动画像");
  await reply(p, 200, previewFixture("Preview only"));
  await press(p, "编辑回答"); await press(p, "全部");
  assert.equal(await p.getByText("Third real question?", { exact: true }).count(), 1);
  await press(p, "活动画像");
  await press(p, "下一题"); await reply(p, 200, { done: true, question: null });
  assert.equal(await p.getByRole("button", { name: "下一题", exact: true }).isDisabled(), true);
});

test("coverage tracks an empty other draft, two cores and all eight fields without auto requests", async t => {
  const p = await open(t, { options: ["Founder"], savedAnswer: "" }, false);
  await p.getByRole("button", { name: "Founder", exact: true }).waitFor();
  assert.equal(await p.getByText("已补充 0/8 项", { exact: true }).count(), 1);
  await press(p, "其他"); await fill(p, "  ");
  assert.equal(await p.getByText("已补充 0/8 项", { exact: true }).count(), 1);
  await press(p, "Founder");
  assert.equal(await p.getByText("已补充 1/8 项", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
  const fields = ["positioning", "industry", "targetAttendees", "valueOffered", "desiredOutcome", "energyStyle", "experienceHighlight", "followUpPreference"];
  await update(p, { questions: fields.map(field => ({ id: field, intent: field, participantProfileField: field, prompt: `Real ${field}?`, options: [], required: false })) });
  await refresh(p); await press(p, "载入新问题");
  await p.evaluate(() => (window as any).fixture.alerts.at(-1).buttons[1].onPress()); await settle(p);
  for (let i = 0; i < fields.length; i++) await fill(p, `Answer ${i}`, i);
  assert.equal(await p.getByText("已补充 8/8 项", { exact: true }).count(), 1);
  await press(p, "补充画像");
  assert.equal(await p.getByRole("button", { name: "下一题", exact: true }).isDisabled(), true);
  assert.deepEqual(await writes(p), []);
});

test("custom answer readback and questionnaire chrome localize without translating the answer or options", async t => {
  const p = await open(t, { options: ["Founder"], savedAnswer: "独立顾问 / Independent advisor" });
  for (const [language, other, progress, placeholder] of [
    ["zh", "其他", "已补充 1/8 项", "写一句具体的补充。"],
    ["ja", "その他", "入力済み 1/8 項目", "具体的な内容を1文で入力してください。"],
    ["en", "Other", "1/8 fields filled", "Add a specific answer."],
  ] as const) {
    await update(p, { language });
    assert.equal(await p.getByRole("button", { name: other, exact: true }).count(), 1);
    assert.equal(await p.getByText(progress, { exact: true }).count(), 1);
    assert.equal(await p.getByRole("button", { name: "Founder", exact: true }).count(), 1);
    assert.equal(await p.getByPlaceholder(placeholder, { exact: true }).inputValue(), "独立顾问 / Independent advisor");
  }
  assert.deepEqual(await writes(p), []);
});

test("registration reads canonical public event context without a legacy private detail request", async t => {
  const p = await open(t);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.map((r: any) => ({ method: r.method, path: r.path, query: r.query })).sort((a: any, b: any) => a.path.localeCompare(b.path))), [
    { method: "GET", path: "/api/events/event%3A1/registration", query: "?language=zh&portraitProofs=true" },
    { method: "GET", path: "/api/events/event%3A1/registration/portrait", query: "" },
    { method: "GET", path: "/api/events/public/event%3A1", query: "" }
  ]);
  assert.equal(await p.getByText("Networking meeting", { exact: true }).count(), 1);
  assert.deepEqual(await writes(p), []);
});

test("switching registration language preserves a dirty answer and requests localized product copy", async t => {
  const p = await open(t);
  await fill(p, "日本産業パートナー / Climate founders");
  await update(p, { language: "ja" });
  await p.getByRole("heading", { name: "参加登録情報", exact: true }).waitFor();
  await p.getByRole("button", { name: "登録情報を更新", exact: true }).waitFor();
  assert.equal(await p.getByPlaceholder("具体的な内容を1文で入力してください。", { exact: true }).inputValue(), "日本産業パートナー / Climate founders");
  assert.equal(await p.getByText("Networking meeting", { exact: true }).count(), 1);
  assert.ok(await p.evaluate(() => (window as any).fixture.requests.some((request: any) => request.query === "?language=ja&portraitProofs=true")));

  await update(p, { language: "en" });
  await p.getByRole("heading", { name: "Registration details", exact: true }).waitFor();
  await p.getByRole("button", { name: "Update registration", exact: true }).waitFor();
  assert.equal(await p.getByPlaceholder("Add a specific answer.", { exact: true }).inputValue(), "日本産業パートナー / Climate founders");
  assert.ok(await p.evaluate(() => (window as any).fixture.requests.some((request: any) => request.query === "?language=en&portraitProofs=true")));
  assert.deepEqual(await writes(p), []);
});

for (const failure of [{ eventStatus: 503 }, { registrationStatus: 500 }]) test(`registration read failure stays visible without a fallback or write ${JSON.stringify(failure)}`, async t => {
  const p = await open(t, failure, false);
  await p.getByText("页面暂时无法加载", { exact: true }).waitFor();
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").count(), 0);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.map((r: any) => r.path).sort()), ["/api/events/event%3A1/registration", "/api/events/event%3A1/registration/portrait", "/api/events/public/event%3A1"]);
  assert.deepEqual(await writes(p), []);
});

test("registration refresh preserves a dirty answer but still adopts clean server changes", async t => {
  const p = await open(t); assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Saved answer");
  await update(p, { savedAnswer: "Remote answer" }); await refresh(p);
  await p.waitForFunction(() => Array.from(document.querySelectorAll("textarea,input")).some(input => (input as HTMLInputElement).value === "Remote answer"));
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Remote answer");
  await fill(p, "Local answer"); await update(p, { savedAnswer: "Another remote answer" }); await refresh(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Local answer");
  assert.deepEqual(await writes(p), []);
});

test("registration ignores an old native snapshot on a failed read and only opens after retry", async t => {
  const p = await open(t, { cachedRegistration: true, registrationStatus: 500 }, false);
  await p.getByText("页面暂时无法加载", { exact: true }).waitFor();
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").count(), 0);
  assert.deepEqual(await writes(p), []);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.snapshotReads), ["/api/events/public/event%3A1"]);
  await update(p, { registrationStatus: 200, savedAnswer: "Fresh server answer" });
  await press(p, "重新读取报名资料");
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Fresh server answer");
  assert.equal(await p.getByRole("button", { name: "更新报名资料", exact: true }).isEnabled(), true);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 6);
  for (const start of [0, 3]) assert.deepEqual(await p.evaluate(start => (window as any).fixture.requests.slice(start, start + 3).map((r: any) => r.path).sort(), start), [
    "/api/events/event%3A1/registration", "/api/events/event%3A1/registration/portrait", "/api/events/public/event%3A1"
  ]);
  assert.equal(await p.evaluate(() => (window as any).fixture.snapshotWrites.some((path: string) => path.includes("/registration"))), false);
});

test("failed registration refresh retains drafts but disables every write until retry confirms the questions", async t => {
  const p = await open(t); await fill(p, "Unsaved local answer");
  await press(p, "下一题");
  await reply(p, 200, { done: false, question: { field: "desiredOutcome", prompt: "What outcome?", acknowledgment: "", options: [] } });
  await fill(p, "Unsaved auxiliary answer", 1);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldWrites = ["更新报名资料", "取消报名", "下一题", "生成画像"].map(name => s.presses[name]); });
  await update(p, { registrationStatus: 500 }); await refresh(p);
  await p.getByText("页面暂时无法加载", { exact: true }).waitFor();
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").first().inputValue(), "Unsaved auxiliary answer");
  for (const name of ["下一题", "生成画像"]) assert.equal(await p.getByRole("button", { name, exact: true }).isDisabled(), true, name);
  await press(p, "报名资料");
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").first().inputValue(), "Unsaved local answer");
  for (const name of ["更新报名资料", "取消报名"]) assert.equal(await p.getByRole("button", { name, exact: true }).isDisabled(), true, name);
  await p.evaluate(() => (window as any).fixture.oldWrites.forEach((fn: () => void) => fn())); await settle(p);
  assert.equal((await writes(p)).length, 1);
  await update(p, { registrationStatus: 200, savedAnswer: "Remote change" }); await press(p, "重新读取报名资料");
  assert.equal(await p.getByText("页面暂时无法加载", { exact: true }).count(), 0);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").first().inputValue(), "Unsaved local answer");
  await press(p, "补充画像");
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").first().inputValue(), "Unsaved auxiliary answer");
  await press(p, "更新报名资料");
  assert.deepEqual((await writes(p)).at(-1)?.body, { answers: { targetAttendees: "Unsaved local answer" }, intent: "update", expectedRegistrationVersion: "2026-09-13T00:00:00Z", questionSetHash: "a".repeat(64), questionSetVersion: 1 });
});

test("registration disables stale write callbacks immediately when a refresh starts", async t => {
  const p = await open(t); await fill(p, "Draft before refresh");
  await update(p, { holdReads: true });
  await p.evaluate(() => { const s = (window as any).fixture; const submit = s.presses["更新报名资料"]; s.refresh(); submit(); }); await settle(p);
  assert.deepEqual(await writes(p), []);
  assert.equal(await p.getByRole("button", { name: "更新报名资料", exact: true }).isDisabled(), true);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Draft before refresh");
});

test("registration refresh preserves the auxiliary question, answer, transcript and generated persona", async t => {
  const p = await open(t, { savedAnswers: { targetAttendees: "Saved answer", valueOffered: "Reviews" } }); await fill(p, "Local answer"); await press(p, "下一题");
  await reply(p, 200, { done: false, question: { field: "desiredOutcome", prompt: "What outcome?", acknowledgment: "Thanks", options: [] } });
  await fill(p, "Auxiliary answer", 1); await refresh(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").first().inputValue(), "Auxiliary answer");
  await press(p, "生成活动画像");
  assert.deepEqual((await writes(p)).at(-1)?.body, { mode: "portrait-preview", language: "zh", responses: [{ kind: "stored_response", source: "registration", responseId: "legacy:targetAttendees", sourceVersion: "c".repeat(64), answer: "Local answer" }, { kind: "stored_response", source: "registration", responseId: "legacy:valueOffered", sourceVersion: "c".repeat(64), answer: "Reviews" }, { kind: "signed_question", questionToken: "synthetic-question:desiredOutcome", portraitAdaptiveToken: "synthetic-workspace:desiredOutcome", answer: "Auxiliary answer" }] });
  await reply(p, 200, previewFixture("Prepared introduction")); await refresh(p);
  assert.equal(await p.getByText("Prepared introduction", { exact: true }).count(), 1);
  await press(p, "下一题"); assert.equal((await writes(p)).at(-1)?.body.transcript.find((turn: { field: string }) => turn.field === "desiredOutcome").answer, "Auxiliary answer");
});

test("registration submission is single-flight and refreshes both current resources", async t => {
  const p = await open(t); await fill(p, "  Local answer  ");
  await p.evaluate(() => { const fn = (window as any).fixture.presses["更新报名资料"]; fn(); fn(); }); await settle(p);
  assert.deepEqual(await writes(p), [{ method: "POST", path: "/api/events/event%3A1/registration", body: { answers: { targetAttendees: "Local answer" }, intent: "update", expectedRegistrationVersion: "2026-09-13T00:00:00Z", questionSetHash: "a".repeat(64), questionSetVersion: 1 } }]);
  await update(p, { savedAnswer: "Local answer" }); await reply(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "GET").slice(3).map((r: any) => r.path).sort()), ["/api/events/event%3A1/registration", "/api/events/event%3A1/registration", "/api/events/public/event%3A1"]);
  assert.equal(await p.getByText("报名资料已保存。", { exact: true }).count(), 1);
});

test("registration save acknowledgement and refresh do not overwrite a newer edit", async t => {
  const p = await open(t); await fill(p, "Submitted answer"); await press(p, "更新报名资料"); await fill(p, "Newer answer");
  await update(p, { savedAnswer: "Submitted answer" }); await reply(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Newer answer");
});

test("registration cancellation is single-flight and reads status and event again", async t => {
  const p = await open(t); await fill(p, "Keep unsaved answer");
  await p.evaluate(() => { const fn = (window as any).fixture.presses["取消报名"]; fn(); fn(); }); await settle(p);
  assert.deepEqual(await writes(p), []);
  await p.evaluate(() => { const fn = (window as any).fixture.alerts.at(-1).buttons.find((b: any) => b.style === "destructive").onPress; fn(); fn(); }); await settle(p);
  assert.deepEqual(await writes(p), [{ method: "POST", path: "/api/events/event%3A1/registration/cancel", body: { expectedRegistrationVersion: "2026-09-13T00:00:00Z", intent: "cancel" } }]);
  await update(p, { registered: false }); await reply(p);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "GET").slice(3).map((r: any) => r.path).sort()), ["/api/events/event%3A1/registration", "/api/events/event%3A1/registration", "/api/events/public/event%3A1"]);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Keep unsaved answer");
  assert.equal(await p.getByRole("button", { name: "重新报名", exact: true }).count(), 1);
});

test("cancellation confirmation is revoked when the registration version changes", async t => {
  const p = await open(t); await press(p, "取消报名");
  await update(p, { registrationVersion: "2026-09-14T00:00:00Z" }); await refresh(p);
  await p.evaluate(() => (window as any).fixture.alerts.at(-1).buttons.find((b: any) => b.style === "destructive").onPress()); await settle(p);
  assert.deepEqual(await writes(p), []);
});

test("a valid save receipt cannot claim persistence when independent readback fails", async t => {
  const p = await open(t); await fill(p, "Keep my answer"); await press(p, "更新报名资料");
  await update(p, { registrationStatus: 503 }); await reply(p);
  assert.equal(await p.getByText("报名资料已保存。", { exact: true }).count(), 0);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Keep my answer");
});
test("an open cancelled registration explicitly reactivates the same record with its version", async t => {
  const p = await open(t, { registered: false }); await fill(p, "New answer");
  await press(p, "重新报名");
  assert.deepEqual((await writes(p)).at(-1)?.body, { intent: "reactivate", expectedRegistrationVersion: "2026-09-13T00:00:00Z", answers: { targetAttendees: "New answer" }, questionSetHash: "a".repeat(64), questionSetVersion: 1 });
  await update(p, { registered: true, receiptAction: "reactivate", savedAnswer: "New answer" }); await reply(p);
  assert.equal(await p.getByText("报名资料已保存。", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "取消报名", exact: true }).count(), 1);
});
test("cancel-only registration stays non-writable while its independent private portrait interview is available", async t => {
  const p = await open(t, { allowedActions: ["cancel"], eligibilityState: "registered" });
  assert.equal(await p.getByRole("button", { name: "报名资料不可修改", exact: true }).isDisabled(), true);
  assert.equal(await p.getByRole("button", { name: "取消报名", exact: true }).isEnabled(), true);
  await press(p, "下一题");
  assert.equal((await writes(p)).length, 1);
  assert.equal((await writes(p))[0]!.path, "/api/events/event%3A1/registration/interview");
  assert.equal((await writes(p))[0]!.body.mode, "portrait-interview");
});

test("server eligibility revocation disables writes and invalidates retained callbacks", async t => {
  const p = await open(t);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSubmit = s.presses["更新报名资料"]; s.oldCancel = s.presses["取消报名"]; });
  await update(p, { eligibilityState: "registration_closed", allowedActions: [], registrationVersion: "version:2" });
  await refresh(p);
  assert.ok(await p.getByText("报名已截止", { exact: true }).count());
  assert.equal(await p.getByRole("button", { name: "报名已截止", exact: true }).isDisabled(), true);
  assert.equal(await p.getByRole("button", { name: "取消报名", exact: true }).count(), 0);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSubmit(); s.oldCancel(); });
  await settle(p);
  assert.deepEqual(await writes(p), []);
});

test("pending admission uses the versioned withdrawal endpoint and verifies the actor receipt", async t => {
  const p = await open(t, {
    allowedActions: ["withdraw"],
    applicationVersion: 2,
    eligibilityState: "pending_review"
  });
  await p.evaluate(() => { const fn = (window as any).fixture.presses["撤回申请"]; fn(); fn(); });
  await settle(p);
  assert.deepEqual(await p.evaluate(() => {
    const request = (window as any).fixture.requests.at(-1);
    return { body: request.body, method: request.method, path: request.path };
  }), {
    body: { expectedApplicationVersion: 2 },
    method: "DELETE",
    path: "/api/events/event%3A1/admission/application"
  });
  await p.evaluate(() => {
    const s = (window as any).fixture;
    const index = s.requests.findLastIndex((request: any) => request.method === "DELETE");
    s.reply(index, 200, {
      actorId: s.actor,
      applicationVersion: 3,
      eventId: s.eventId,
      status: "withdrawn"
    });
  });
  await settle(p);
  assert.equal(await p.getByText("已撤回申请。", { exact: true }).count(), 1);
});

test("open admission collects two server-signed answers and submits the scoped application", async t => {
  const p = await open(t, {
    unregistered: true,
    savedAnswers: {},
    questions: [],
    allowedActions: ["apply"],
    applicationVersion: null,
    eligibilityState: "open",
    registered: false
  }, false);
  await p.getByRole("button", { name: "提交审核申请", exact: true }).waitFor();
  assert.equal(await p.getByRole("button", { name: "提交审核申请", exact: true }).isEnabled(), true);

  await press(p, "下一题");
  assert.deepEqual((await writes(p)).at(-1)?.body, { mode: "portrait-interview", language: "zh", transcript: [] });
  await reply(p, 200, {
    done: false,
    signedQuestion: {
      question: { acknowledgment: "", field: "targetAttendees", options: [], prompt: "你想认识谁？" },
      questionToken: "signed-target"
    }
  });
  await fill(p, "日本产业伙伴", 1);
  await press(p, "下一题");
  assert.deepEqual((await writes(p)).at(-1)?.body.transcript, [
    { answer: "日本产业伙伴", field: "targetAttendees", prompt: "你想认识谁？" }
  ]);
  await reply(p, 200, {
    done: false,
    signedQuestion: {
      question: { acknowledgment: "收到", field: "valueOffered", options: [], prompt: "你能提供什么？" },
      questionToken: "signed-value"
    }
  });
  await fill(p, "产品工程经验", 1);
  await press(p, "提交审核申请");
  assert.deepEqual((await writes(p)).at(-1), {
    body: {
      responses: [
        { answer: "日本产业伙伴", questionToken: "signed-target" },
        { answer: "产品工程经验", questionToken: "signed-value" }
      ]
    },
    method: "POST",
    path: "/api/events/event%3A1/admission/application"
  });
  await update(p, {
    allowedActions: ["withdraw"],
    applicationVersion: 1,
    eligibilityState: "pending_review"
  });
  await reply(p, 200, {
    actorId: "actor-1",
    applicationVersion: 1,
    eventId: "event:1",
    status: "pending_review"
  });
  assert.equal(await p.getByText("申请已提交，等待审核。", { exact: true }).count(), 1);
});

for (const kind of ["error", "empty", "wrong-event", "wrong-actor", "wrong-status", "http-error"]) test(`registration ${kind} receipt cannot claim persistence or discard input`, async t => {
  const p = await open(t); await fill(p, "Keep answer"); await press(p, "更新报名资料");
  if (kind === "error") await reply(p, 409);
  else { const data = await p.evaluate(kind => { const s = (window as any).fixture; return kind === "empty" ? {} : s.receipt(kind === "wrong-event" ? { eventId: "other" } : kind === "wrong-actor" ? { userId: "other" } : kind === "wrong-status" ? { status: "cancelled" } : {}); }, kind); await reply(p, kind === "http-error" ? 503 : 200, data); }
  assert.equal(await p.getByText("报名资料已保存。", { exact: true }).count(), 0);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Keep answer");
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.length), 4);
});

test("changed registration questions keep old drafts until explicit discard confirmation", async t => {
  const p = await open(t); await fill(p, "Keep old answer"); await update(p, { version: 2, hash: "b".repeat(64), prompt: "What should the new group focus on?" }); await refresh(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Keep old answer");
  assert.equal(await p.getByText("Who would you like to meet?", { exact: true }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "更新报名资料", exact: true }).isDisabled(), true);
  await press(p, "载入新问题"); await p.evaluate(() => { const a = (window as any).fixture.alerts.at(-1); a.buttons.find((b: any) => b.style === "cancel").onPress?.(); }); await settle(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Keep old answer");
  await press(p, "载入新问题"); await p.evaluate(() => { const a = (window as any).fixture.alerts.at(-1); const fn = a.buttons.find((b: any) => b.style === "destructive").onPress; fn(); fn(); }); await settle(p);
  assert.equal(await p.getByText("What should the new group focus on?", { exact: true }).count(), 1);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "", "old stored answers must not be attached to changed questions");
  await refresh(p); assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "", "refresh must not restore the old answer after explicit discard");
  assert.deepEqual(await writes(p), []); await fill(p, "New question answer"); await press(p, "更新报名资料");
  assert.equal((await writes(p)).at(-1)?.body.questionSetVersion, 2);
});

test("registration cannot submit a retained callback after its draft changes", async t => {
  const p = await open(t); await p.evaluate(() => { const s = (window as any).fixture; s.oldSubmit = s.presses["更新报名资料"]; });
  await fill(p, "Newer intended answer");
  await p.evaluate(() => { (window as any).fixture.oldSubmit(); }); await settle(p);
  assert.deepEqual(await writes(p), []);
  await press(p, "更新报名资料"); assert.equal((await writes(p)).at(-1)?.body.answers.targetAttendees, "Newer intended answer");
});

for (const change of ["edit", "version", "actor"]) test(`registration discard confirmation is revoked by subsequent ${change}`, async t => {
  const p = await open(t); await fill(p, "Keep draft"); await update(p, { version: 2, hash: "b".repeat(64), prompt: "New question" }); await refresh(p); await press(p, "载入新问题");
  if (change === "edit") await fill(p, "Newer draft");
  else if (change === "version") { await update(p, { version: 3, hash: "c".repeat(64), prompt: "Third question" }); await refresh(p); }
  else await update(p, { actor: "actor-2", savedAnswer: "Other actor answer" });
  await p.evaluate(() => { const a = (window as any).fixture.alerts[0]; a.buttons.find((b: any) => b.style === "destructive").onPress(); }); await settle(p);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), change === "edit" ? "Newer draft" : change === "actor" ? "Other actor answer" : "Keep draft");
  assert.deepEqual(await writes(p), []);
});

test("registration auxiliary operations are single-flight and preserve input typed while pending", async t => {
  const p = await open(t); await press(p, "补充画像");
  await p.evaluate(() => { const fn = (window as any).fixture.presses["下一题"]; fn(); fn(); }); await settle(p);
  assert.equal((await writes(p)).length, 1);
  await reply(p, 200, { done: false, question: { field: "desiredOutcome", prompt: "What outcome?", acknowledgment: "", options: [] } });
  await fill(p, "First auxiliary answer", 1); await press(p, "下一题"); await fill(p, "Newer auxiliary answer", 1);
  await reply(p, 200, { done: false, question: { field: "energyStyle", prompt: "What setting?", acknowledgment: "", options: [] } });
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").first().inputValue(), "Newer auxiliary answer");
  assert.equal(await p.getByText("What outcome?", { exact: true }).count(), 1);
});

for (const patch of [{ actor: "actor-2" }, { baseUrl: "https://second.example" }, { eventId: "event:2" }, { mounted: false }]) test(`registration drops stale write completions and callbacks after scope change ${JSON.stringify(patch)}`, async t => {
  const p = await open(t); await fill(p, "Private old answer");
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSubmit = s.presses["更新报名资料"]; s.oldRefresh = s.refresh; }); await press(p, "更新报名资料");
  await update(p, { holdReads: true, ...patch });
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").count(), 0);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldSubmit(); s.oldRefresh(); s.reply(s.requests.findLastIndex((r: any) => r.method === "POST"), 401); }); await settle(p);
  assert.equal((await writes(p)).length, 1);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.findLast((r: any) => r.method === "POST").signal?.aborted), true);
});

// Catches direct use of the real Web Alert (an empty implementation).
test("Web cancellation opens a real browser confirmation and rejection preserves the draft", async t => {
  const p = await open(t, { platform: "web" }); await fill(p, "Keep my draft");
  let dialogs = 0; p.on("dialog", async dialog => { dialogs++; assert.equal(dialog.type(), "confirm"); await dialog.dismiss(); });
  await press(p, "取消报名");
  assert.equal(dialogs, 1); assert.deepEqual(await writes(p), []);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(), "Keep my draft");
});

for (const mode of ["missing", "throws"] as const) test(`Web confirmation ${mode} fails visibly without cancellation or draft loss`, async t => {
  const p=await open(t,{platform:"web"});await fill(p,"Keep my draft");
  await p.evaluate(mode=>{(window as any).confirm=mode==="missing"?undefined:()=>{throw new Error("Unavailable");};},mode);
  await press(p,"取消报名");assert.deepEqual(await writes(p),[]);
  await p.getByText("无法打开取消确认，尚未取消报名。请重试。",{exact:true}).waitFor();
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(),"Keep my draft");
});
test("Web confirmed cancellation writes once and requires independent readback",async t=>{
  const p=await open(t,{platform:"web"});await fill(p,"Keep my draft");let dialogs=0;
  p.on("dialog",async d=>{dialogs++;await d.accept();});
  await press(p,"取消报名");assert.equal(dialogs,1);
  assert.deepEqual(await writes(p),[{method:"POST",path:"/api/events/event%3A1/registration/cancel",body:{expectedRegistrationVersion:"2026-09-13T00:00:00Z",intent:"cancel"}}]);
  await update(p,{registered:false,registrationStatus:503});await reply(p);
  assert.equal(await p.getByRole("button",{name:"重新报名",exact:true}).count(),0);
  assert.equal(await p.getByPlaceholder("写一句具体的补充。").inputValue(),"Keep my draft");
});
for(const change of ["actor","origin","event","allowedActions"] as const)test(`native cancellation confirmation rejects stale ${change}`,async t=>{
  const p=await open(t);await press(p,"取消报名");
  await update(p,change==="actor"?{actor:"actor-2"}:change==="origin"?{baseUrl:"https://other.example"}:change==="event"?{eventId:"event:2"}:{allowedActions:["update"]});
  if(change==="allowedActions")await refresh(p);
  await p.evaluate(()=>{const s=(window as any).fixture;s.alerts[0].buttons.find((b:any)=>b.style==="destructive").onPress();});await settle(p);
  assert.deepEqual(await writes(p),[]);
});
