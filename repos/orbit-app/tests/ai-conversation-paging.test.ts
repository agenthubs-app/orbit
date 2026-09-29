import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import { entityArtifactToDisplay } from "../src/api/schema/ai-artifacts";

const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;

// Sprint 0112: an opened AI session shows its latest 20 messages; the top of the
// history loads 20 earlier ones at a time without moving what the reader was
// looking at, and each earlier page brings the cards of its own turns. The
// screen, the resource hook and the API client are real; auth, navigation
// chrome and the HTTP service are the boundaries. The stub pages a 150-message
// session the way GET /api/ai/conversations/sessions/[id] does (covered against
// Postgres in orbits' ai-session-paging-postgres.test.ts).
const fixtures = JSON.parse(readFileSync(new URL("./helpers/ai-entity-artifact-fixtures.json", import.meta.url), "utf8")) as Record<string, {
  taskKind: string; presentation: Record<string, unknown>; sections: Array<{ items: Array<Record<string, unknown>> }>;
}>;
function cardFor(turn: number): unknown {
  const fixture = fixtures.contact!;
  const sections = [{ ...fixture.sections[0], items: [{ ...fixture.sections[0]!.items[0], id: `contact-recommendation:contact_${turn}`, title: `候选人${turn}号` }] }];
  const shared = { artifactId: `artifact:${turn}`, taskId: `task:${turn}`, status: "ready", presentation: fixture.presentation };
  return entityArtifactToDisplay({
    task: { ...shared, conversationId: "runtime:paging", kind: fixture.taskKind, artifactProducer: "contact_recommendation_producer", query: "q", createdAt: "2026-09-20", updatedAt: "2026-09-20" },
    result: { ...shared, kind: fixture.taskKind, generatedView: { summary: "摘要", sections }, nextAction: "" },
  });
}
// Turns whose replies carry a card: one early (page 7), one in the middle (page 3), one on the first page.
const CARD_TURNS = [5, 91, 141];
const cards = Object.fromEntries(CARD_TURNS.map((turn) => [turn, cardFor(turn)]));

const fixture = `
// Sprint 0118: this harness exercises the network path; the device mirror is not available here.
export const useLocalInbox = () => ({ available: false, rows: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalAiSessions = () => ({ available: false, rows: [], freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useLocalAiConversation = () => ({ available: false, messages: [], cards: null, saveCards() {}, freshness: { readable: false, loading: false, failure: null, refreshing: false, offline: false, lastSyncedAt: null, syncLabelKey: "sync.syncing" }, refresh: async () => null });
export const useNotesWriteStatus = () => ({ offline: false, lastSyncedAt: null, syncLabelKey: null, queuedCount: 0, enqueueOfflineMutation: async () => {}, confirmSaved: async () => false });

import React from "react";
import { View } from "react-native-web";
const SESSION = "session:paging-150";
const TOTAL = 150;
const CARDS = ${JSON.stringify(cards)};
const id = i => i % 2 === 0 ? "user:" + i : "assistant:request:" + i;
const text = i => (i % 2 === 0 ? "第" + i + "条问题" : "第" + i + "条回答");
const state = window.fixture = { requests: [], posts: [], holdNext: false, held: [], failNext: false };
function page(cursor) {
  const end = cursor ? Number(cursor.slice(1)) : TOTAL;
  const start = Math.max(0, end - 20);
  const messages = [];
  for (let i = start; i < end; i += 1) messages.push({ id: id(i), role: i % 2 === 0 ? "user" : "assistant", text: text(i), createdAt: new Date(Date.UTC(2026, 8, 1) + i * 60000).toISOString() });
  const turns = messages.filter(m => m.role === "assistant" && CARDS[Number(m.id.split(":").pop())]).map(m => {
    const i = Number(m.id.split(":").pop());
    return { sessionId: SESSION, requestId: "request:" + i, userMessageId: id(i - 1), assistantMessageId: m.id, status: "ready", artifacts: [CARDS[i]] };
  });
  return { session: { id: SESSION, title: "长会话", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T03:00:00.000Z", messageRevision: TOTAL, messages },
    page: { hasMore: start > 0, nextCursor: start > 0 ? "c" + start : null, limit: 20 },
    artifactRecovery: { turns, truncated: false }, storage: { configured: true, persisted: true } };
}
window.fetch = (input, init) => {
  const url = new URL(String(input));
  const method = (init && init.method) || "GET";
  state.requests.push(method + " " + url.pathname + url.search);
  if (method !== "GET") { state.posts.push({ path: url.pathname, body: init && init.body ? String(init.body) : "" }); return Promise.resolve(new Response(JSON.stringify({ success: false, error: { code: "UNEXPECTED", message: "no writes in this test" } }), { status: 500, headers: { "content-type": "application/json" } })); }
  const respond = () => state.failNext
    ? (state.failNext = false, new Response(JSON.stringify({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "暂时不可用" } }), { status: 503, headers: { "content-type": "application/json" } }))
    : new Response(JSON.stringify({ success: true, data: page(url.searchParams.get("cursor")) }), { status: 200, headers: { "content-type": "application/json" } });
  if (state.holdNext && url.searchParams.get("cursor")) return new Promise(resolve => state.held.push(() => resolve(respond())));
  return Promise.resolve(respond());
};
export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, cookieHeader: "", accountId: "account:A", actorId: "account:A", user: { id: "account:A" } });
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "https://orbit.example" });
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
export const useRouter = () => ({ back() {}, push() {}, replace() {}, canGoBack: () => false });
export const useLocalSearchParams = () => ({ id: SESSION, source: "session" });
export const usePathname = () => "/ai/session:paging-150";
export const randomUUID = () => "00000000-0000-4000-8000-000000000000";
export const Ionicons = () => <span aria-hidden="true" />;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { AiConversationScreen } from "./src/screens/ai/AiConversationScreen"; createRoot(document.getElementById("root")).render(<div style={{ height: 844, display: "flex" }}><AiConversationScreen /></div>);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    loader: { ".png": "dataurl", ".jpg": "dataurl" },
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "conversation-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(expo-router|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|ApiBaseUrlProvider|snapshot-store|useLocalAiSessions|notes-source)$/ }, () => ({ path: "fixture", namespace: "conversation" }));
      plugin.onLoad({ filter: /.*/, namespace: "conversation" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

async function open(t: { after(fn: () => Promise<void>): void }): Promise<Page> {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); p.setDefaultTimeout(4000);
  const errors: string[] = []; p.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort()); await p.setContent('<div id="root"></div>');
  await p.addScriptTag({ content: script });
  await p.getByText("第149条回答").waitFor();
  return p;
}
const shownIndexes = (p: Page) => p.evaluate(() => [...document.body.innerText.matchAll(/第(\d+)条(问题|回答)/g)].map(m => Number(m[1])));
const loadEarlier = (p: Page) => p.getByRole("button", { name: "加载更早的消息", exact: true });

test("opening shows only the latest 20 messages, and each tap loads the 20 before them until everything is shown", async t => {
  const p = await open(t);
  assert.deepEqual(await shownIndexes(p), Array.from({ length: 20 }, (_, i) => 130 + i));
  assert.deepEqual(await p.evaluate(() => (window as unknown as { fixture: { requests: string[] } }).fixture.requests), ["GET /api/ai/conversations/sessions/session%3Apaging-150"]);
  for (let pageNumber = 1; pageNumber <= 7; pageNumber += 1) {
    await loadEarlier(p).click();
    await p.waitForFunction((count) => document.body.innerText.match(/第\d+条(问题|回答)/g)?.length === count, Math.min(150, 20 + pageNumber * 20));
  }
  await p.getByText("已加载全部消息").waitFor();
  assert.equal(await loadEarlier(p).count(), 0);
  const shown = await shownIndexes(p);
  assert.deepEqual(shown, Array.from({ length: 150 }, (_, i) => i), "oldest first, no repeat, no gap");
  const requests = await p.evaluate(() => (window as unknown as { fixture: { requests: string[] } }).fixture.requests);
  assert.deepEqual(requests.slice(1), ["c130", "c110", "c90", "c70", "c50", "c30", "c10"].map(c => `GET /api/ai/conversations/sessions/session%3Apaging-150?cursor=${c}`));
});

test("loading earlier messages keeps the message the reader was looking at in place", async t => {
  const p = await open(t);
  const anchor = p.getByText("第130条问题", { exact: true });
  await anchor.scrollIntoViewIfNeeded();
  const before = await anchor.boundingBox();
  await loadEarlier(p).click();
  await p.getByText("第110条问题", { exact: true }).waitFor({ state: "attached" });
  await p.waitForTimeout(100);
  const after = await anchor.boundingBox();
  assert.ok(before && after);
  assert.ok(Math.abs(after.y - before.y) <= 4, `anchor moved from ${before.y} to ${after.y}`);
});

test("a card for an earlier turn appears with its page, under its own reply, and not before", async t => {
  const p = await open(t);
  await p.getByText("候选人141号").waitFor();
  assert.equal(await p.getByText("候选人91号").count(), 0, "cards of unloaded turns are not fetched up front");
  const replyAbove = await p.getByText("第141条回答", { exact: true }).boundingBox();
  const card141 = await p.getByText("候选人141号").boundingBox();
  const nextQuestion = await p.getByText("第142条问题", { exact: true }).boundingBox();
  assert.ok(replyAbove!.y < card141!.y && card141!.y < nextQuestion!.y, "a restored card sits under the reply that produced it");
  for (let i = 0; i < 3; i += 1) await loadEarlier(p).click().then(() => p.waitForTimeout(50));
  await p.getByText("候选人91号").waitFor();
  const reply91 = await p.getByText("第91条回答", { exact: true }).boundingBox();
  const card91 = await p.getByText("候选人91号").boundingBox();
  const question92 = await p.getByText("第92条问题", { exact: true }).boundingBox();
  assert.ok(reply91!.y < card91!.y && card91!.y < question92!.y);
});

test("while an earlier page loads a neutral placeholder row is shown; a failure offers a visible retry", async t => {
  const p = await open(t);
  await p.evaluate(() => { (window as unknown as { fixture: { holdNext: boolean } }).fixture.holdNext = true; });
  await loadEarlier(p).click();
  await p.getByText("正在加载更早的消息…").waitFor();
  await p.evaluate(() => { const f = (window as unknown as { fixture: { holdNext: boolean; failNext: boolean; held: Array<() => void> } }).fixture; f.holdNext = false; f.failNext = true; f.held.splice(0).forEach(release => release()); });
  await p.getByText("没能加载更早的消息").waitFor();
  assert.deepEqual((await shownIndexes(p)).length, 20, "a failed page adds nothing");
  await p.getByRole("button", { name: "重试", exact: true }).click();
  await p.getByText("第110条问题", { exact: true }).waitFor();
  assert.equal(await p.getByText("没能加载更早的消息").count(), 0);
});

test("reading history never uploads the session", async t => {
  const p = await open(t);
  await loadEarlier(p).click();
  await p.getByText("第110条问题", { exact: true }).waitFor();
  const posts = await p.evaluate(() => (window as unknown as { fixture: { posts: unknown[] } }).fixture.posts);
  assert.deepEqual(posts, []);
});
