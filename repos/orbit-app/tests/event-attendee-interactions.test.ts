import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { attendeeFixture, participantFixture } from "./helpers/attendee-operations-fixtures";
const require = createRequire(import.meta.url);
let browser: Browser; let script: string;
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { onSessionExpired } from "./src/api/session-expiry";
const listeners = new Set(); let rev = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => rev);
const s = window.fixture = { actor: "account-one", raw: "raw-one", cookie: "authjs.session-token=one", baseUrl: "https://orbit.example", eventId: "event_1", participantId: "p_other", ready: true, signedIn: true, focused: true, mounted: true, requests: [], replies: [], navigation: [], presses: {}, expiries: 0, snapshotReads: [], snapshotWrites: [], ...window.initialFixture,
 update(patch) { Object.assign(s, patch); rev++; listeners.forEach(fn => fn()); },
 reply(index, data, status = 200) { s.replies[index](new Response(JSON.stringify(status < 300 ? { success: true, data } : { success: false, error: { code: status === 401 ? "UNAUTHORIZED" : "CONFLICT", message: "测试服务暂不可用" } }), { status, headers: { "content-type": "application/json" } })); }
};
Date.now = () => Date.parse("2026-09-17T02:00:00Z");
onSessionExpired(() => s.expiries++);
window.fetch = async (url, init) => { s.requests.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null, cookie: new Headers(init.headers).get("Cookie"), signal: init.signal }); return new Promise(resolve => s.replies.push(resolve)); };
export const useFixture = () => { observe(); return s; };
export const useOrbitAuthSession = () => { observe(); return { actorId: s.actor, user: { id: s.raw }, cookieHeader: s.cookie, ready: s.ready, signedIn: s.signedIn }; };
export const useOrbitApiBaseUrl = () => { observe(); return { baseUrl: s.baseUrl, ready: true }; };
export const useLocalSearchParams = () => { observe(); return { id: s.eventId, participantId: s.participantId }; };
export const useGlobalSearchParams = useLocalSearchParams;
export const usePathname = () => { observe(); return '/events/' + s.eventId + (s.participantId ? '/participants/' + s.participantId : '/attendees'); };
export const useIsFocused = () => { observe(); return s.focused; };
export const useRouter = () => ({ canGoBack: () => true, back() {}, replace(href) { s.navigation.push(href); }, push(href) { s.navigation.push(href); } });
export const Redirect = ({ href }) => <div>{href}</div>;
export const Stack = () => null;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
export const Ionicons = () => null;
export const readSnapshot = async (...args) => { s.snapshotReads.push(args); return { result: { success: true, status: 200, data: s.cachedWorkspace } }; };
export const writeSnapshot = async (...args) => { s.snapshotWrites.push(args); };
`;
test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import Route from "./app/events/[id]/participants/[participantId]"; import { useFixture } from "fixture"; function App() { return useFixture().mounted ? <Route /> : null; } createRoot(document.getElementById("root")).render(window.initialFixture.strict ? <React.StrictMode><App /></React.StrictMode> : <App />);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, jsx: "automatic", format: "iife", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js", ".json"], plugins: [{ name: "boundaries", setup(p) {
    p.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "fixture" }));
    p.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "fixture" }));
    p.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents: a.path === "fixture" ? fixture : 'import React from "react"; import { Pressable as Real } from "react-native-web"; export * from "react-native-web"; export const Pressable = props => { if (props.accessibilityLabel) window.fixture.presses[props.accessibilityLabel] = props.onPress; return <Real {...props} />; };', loader: "jsx", resolveDir: process.cwd() }));
    p.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
  } }] }); script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function open(t: { after(fn: () => Promise<void>): void }, patch = {}) {
  const p = await browser.newPage(); p.setDefaultTimeout(2500); const errors: string[] = []; p.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", route => route.abort()); await p.setContent('<div id="root"></div>');
  await p.evaluate(patch => { (window as any).initialFixture = patch; }, patch); await p.addScriptTag({ content: script }); return p;
}
async function count(p: Page, n: number) { await p.waitForFunction(n => (window as any).fixture.requests.length >= n, n); }
async function reply(p: Page, index: number, data: unknown, status = 200) { await p.evaluate(({ index, data, status }) => (window as any).fixture.reply(index, data, status), { index, data, status }); }
async function load(p: Page, w = attendeeFixture(), d: unknown = participantFixture(), start = 0) {
  await count(p, start + 1); await reply(p, start, w); await count(p, start + 2); await reply(p, start + 1, d); await p.getByText("Other person", { exact: true }).waitFor();
}
test("native hooks consume canonical HTTP and explicit accept rereads owner contact before navigation", async t => {
  const p = await open(t); const w = attendeeFixture();
  const r = { contactId: null, requestId: "req", revision: 1, requesterParticipantId: "p_other", targetParticipantId: "p_me", status: "awaiting_target_consent", withdrawnAt: null };
  w.contactRequests = [r]; const d = { ...participantFixture(), contactRequest: { ...r, direction: "incoming" } };
  await load(p, w, d); assert.equal(await p.getByRole("button", { name: "申请交换名片", exact: true }).count(), 0);
  await p.getByRole("button", { name: "同意交换名片", exact: true }).click(); await count(p, 3);
  const command = await p.evaluate(() => (window as any).fixture.requests[2]);
  assert.equal(command.url, "https://orbit.example/api/events/event_1/operations/contact-requests/req/respond");
  assert.equal(command.cookie, "authjs.session-token=one"); assert.deepEqual(command.body, { accept: true, expectedRevision: 1 });
  assert.equal(await p.getByRole("button", { name: "查看联系人", exact: true }).count(), 0);
  const accepted = { ...r, status: "accepted", revision: 2, contactId: "owner-contact" };
  await reply(p, 2, { ...accepted, eventId: "event_1" }); await count(p, 4); await reply(p, 3, { ...w, contactRequests: [accepted] });
  await count(p, 5); await reply(p, 4, { ...d, contactRequest: { ...accepted, direction: "incoming" } });
  await p.getByRole("button", { name: "查看联系人", exact: true }).click();
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), ["/contacts/owner-contact"]);
});
for (const patch of [{ actor: "account-two" }, { raw: "raw-two" }, { cookie: "authjs.session-token=two" }, { baseUrl: "https://two.example" }, { eventId: "event_2" }, { participantId: "p_three" }, { focused: false }, { signedIn: false }, { mounted: false }]) test("revokes old write/callback/401 for " + JSON.stringify(patch), async t => {
  const p = await open(t); await load(p);
  await p.evaluate(() => { const s = (window as any).fixture; s.oldPress = s.presses["申请交换名片"]; s.oldPress(); s.oldPress(); }); await count(p, 3);
  await p.evaluate(patch => (window as any).fixture.update(patch), patch);
  await p.waitForFunction(() => (window as any).fixture.requests[2].signal.aborted);
  await reply(p, 2, null, 401);
  await p.evaluate(() => (window as any).fixture.oldPress());
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method === "POST").length), 1);
  assert.equal(await p.evaluate(() => (window as any).fixture.expiries), 0);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.navigation), []);
});
test("cold directory check-in binds canonical actor and workspace participant; StrictMode still loads", async t => {
  const p = await open(t, { participantId: null, strict: true });
  await count(p, 2); await reply(p, 1, attendeeFixture());
  await p.getByRole("button", { name: "签到", exact: true }).click(); await count(p, 3);
  await reply(p, 2, { eventId: "event_1", participantId: "p_me", actorId: "account-one", evidenceId: "e", checkedInAt: "2026-09-17T02:00:00Z" });
  await count(p, 4); await reply(p, 3, { ...attendeeFixture(), checkIn: { participantId: "p_me", checkedInAt: "2026-09-17T02:00:00Z" } });
  await p.getByText(/已签到/).waitFor();
  assert.equal(await p.getByRole("alert").count(), 0);
});

for (const status of [401, 403, 404, 503]) test(`actual canonical attendee route revokes current and cached content on ${status}`, async t => {
  const workspace = attendeeFixture();
  const p = await open(t, { participantId: null, cachedWorkspace: workspace });
  await count(p, 1); await reply(p, 0, workspace);
  await p.getByText("Other person", { exact: true }).first().waitFor();
  await p.getByRole("button", { name: "重新读取", exact: true }).click(); await count(p, 2);
  assert.equal(await p.getByText("Other person", { exact: true }).count(), 0);
  await reply(p, 1, null, status);
  await p.getByText("测试服务暂不可用", { exact: true }).waitFor();
  assert.equal(await p.getByText("Other person", { exact: true }).count(), 0);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.snapshotReads), []);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.snapshotWrites), []);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.some((r: any) => r.method !== "GET")), false);
});

for (const patch of [{ actor: "account-two" }, { baseUrl: "https://two.example" }, { eventId: "event_2" }]) test(`actual canonical attendee route suppresses late read after ${JSON.stringify(patch)}`, async t => {
  const p = await open(t, { participantId: null }); await count(p, 1);
  await p.evaluate(patch => (window as any).fixture.update(patch), patch); await count(p, 2);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests[0].signal.aborted), true);
  const current = attendeeFixture();
  if (patch.eventId) { current.eventId = patch.eventId; current.configuration.eventId = patch.eventId; }
  current.directory[1]!.displayName = "当前账号私有名单";
  await reply(p, 1, current); await p.getByText("当前账号私有名单", { exact: true }).first().waitFor();
  const stale = attendeeFixture(); stale.directory[1]!.displayName = "旧账号迟到私有名单";
  await reply(p, 0, stale);
  await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await p.getByText("旧账号迟到私有名单", { exact: true }).count(), 0);
  // The canonical directory and recommendation section each render this participant.
  assert.equal(await p.getByText("当前账号私有名单", { exact: true }).count(), 2);
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.snapshotWrites), []);
  assert.equal(await p.evaluate(() => (window as any).fixture.requests.some((r: any) => r.method !== "GET")), false);
});
