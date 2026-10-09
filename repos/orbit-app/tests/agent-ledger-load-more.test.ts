import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;

// Sprint 0122 (Codex 103-A): the native All Actions ledger follows the server's
// cursor until there is no next page. The screen, resource hook and API client
// are real; auth, navigation chrome and the HTTP service are the boundaries.
// The stub service pages 501 entries 200 at a time, newest first, the way
// GET /api/agent/ledger does (covered against Postgres in orbits'
// agent-ledger-paging-postgres.test.ts).
const fixture = `
import React from "react";
import { View } from "react-native-web";
const at = i => new Date(Date.UTC(2026, 8, 1) + (600 - i) * 60000).toISOString();
const entry = i => ({ entryId: "action:" + String(i).padStart(4, "0"), createdAt: at(i), updatedAt: at(i), evidenceChips: [], evidenceIds: [], operations: [], sourceRefs: [], status: i === 500 ? "awaiting_confirmation" : "completed", title: "操作 " + i, undoable: false, whyNow: "测试" });
const all = Array.from({ length: 501 }, (_, i) => entry(i));
const state = window.fixture = { requests: [], holdNext: false, held: [], actor: "account:A" };
function page(cursor) {
  const start = cursor ? Number(cursor.replace("c", "")) : 0;
  const entries = all.slice(start, start + 200);
  const next = start + 200 < all.length ? "c" + (start + 200) : null;
  return { state: "success", entries, nextCursor: next, nextAction: "复核等待确认的操作。",
    summary: next ? "本页 " + entries.length + " 条记录，还有更早的记录，可继续翻页。" : cursor ? "最后一页 " + entries.length + " 条记录，可追溯、可撤销。" : "账本共 " + entries.length + " 条记录，可追溯、可撤销。" };
}
window.fetch = (input) => {
  const url = new URL(String(input)); state.requests.push(url.pathname + url.search);
  const respond = () => new Response(JSON.stringify({ success: true, data: page(url.searchParams.get("cursor")) }), { status: 200, headers: { "content-type": "application/json" } });
  if (state.holdNext && url.searchParams.get("cursor")) return new Promise(resolve => state.held.push(() => resolve(respond())));
  return Promise.resolve(respond());
};
export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, cookieHeader: "", accountId: state.actor, actorId: state.actor, user: { id: state.actor } });
// Sprint 0131: the screen reads page copies / the device mirror; this harness tests the network path (no mirror).
export const useSyncedCollection = () => ({ status: "unsynced", error: null, lastSyncedAt: null, workspaceId: null, records: [], refresh: async () => null, invalidate: async () => null, currentSession: () => null });
export const useSyncCoordinatorSession = () => null;
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "https://orbit.example" });
export const readSnapshot = async () => null;
export const writeSnapshot = async () => {};
export const useRouter = () => ({ back() {}, push() {}, replace() {}, canGoBack: () => false });
export const usePathname = () => "/contacts/all-actions";
export const Ionicons = () => <span aria-hidden="true" />;
export const SafeAreaView = ({ edges, ...props }) => <View {...props} />;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: 'import React from "react"; import { createRoot } from "react-dom/client"; import { AllActionsAgentLedgerScreen } from "./src/screens/agent/AgentLedgerScreen"; createRoot(document.getElementById("root")).render(<AllActionsAgentLedgerScreen />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "ledger-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(AuthSessionProvider|ApiBaseUrlProvider|snapshot-store|useSyncedCollection)$/ }, () => ({ path: "fixture", namespace: "ledger" }));
      plugin.onLoad({ filter: /.*/, namespace: "ledger" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

async function open(t: { after(fn: () => Promise<void>): void }): Promise<Page> {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); p.setDefaultTimeout(3000);
  const errors: string[] = []; p.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await p.close(); assert.deepEqual(errors, []); });
  await p.route("**/*", r => r.abort()); await p.setContent('<div id="root"></div>');
  await p.addScriptTag({ content: script });
  return p;
}
const ids = (p: Page) => p.evaluate(() => [...document.body.innerText.matchAll(/action:\d{4}/g)].map(m => m[0]));

test("All Actions loads every page of a 501-entry ledger with no duplicate or missing entry", async t => {
  const p = await open(t);
  await p.getByText("本页 200 条记录，还有更早的记录，可继续翻页。").waitFor();
  const more = p.getByRole("button", { name: "加载更多", exact: true });
  await more.click();
  await p.getByText(/已显示 400 条记录/).waitFor();
  await more.click();
  await p.getByText("已加载全部 501 条记录，可追溯、可撤销。").waitFor();
  assert.equal(await more.count(), 0, "no load-more after the last page");
  assert.equal(await p.getByText(/最后一页|本页 1 条/).count(), 0, "the last page's own count is never shown as the ledger total");
  const seen = await ids(p);
  const unique = new Set(seen);
  assert.equal(unique.size, 501);
  for (let i = 0; i < 501; i += 1) assert.ok(unique.has("action:" + String(i).padStart(4, "0")), "missing action " + i);
  assert.ok(await p.getByText("操作 500", { exact: true }).count() > 0, "the oldest awaiting entry is reachable");
  assert.deepEqual(await p.evaluate(() => (window as any).fixture.requests.map((r: string) => new URL(r, "https://x").searchParams.get("cursor"))), [null, "c200", "c400"]);
});

test("a load-more that is still in flight is not sent twice", async t => {
  const p = await open(t);
  await p.getByText("本页 200 条记录，还有更早的记录，可继续翻页。").waitFor();
  await p.evaluate(() => { (window as any).fixture.holdNext = true; });
  const more = p.getByRole("button", { name: "加载更多", exact: true });
  await more.click();
  await more.click({ force: true }).catch(() => undefined);
  assert.equal(await p.evaluate(() => (window as any).fixture.held.length), 1, "one next-page request at a time");
  await p.evaluate(() => { const s = (window as any).fixture; s.holdNext = false; });
  await p.evaluate(() => (window as any).fixture.held.shift()());
  await p.getByText(/已显示 400 条记录/).waitFor();
  assert.equal(new Set(await ids(p)).size, 400);
});
