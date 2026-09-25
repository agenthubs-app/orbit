import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { todayTaskWindow } from "../src/view-models/today-task-pages";

let browser: Browser;
let script: string;
const fixture = `
import {useSyncExternalStore} from 'react';
let revision=0;const listeners=new Set();
const state=window.fixture={actor:'account:one',signedIn:true,cookieHeader:'session=one',baseUrl:'https://orbit.test',timeZone:'Asia/Tokyo',date:'2026-09-26',requests:[],pending:[],
 update(patch){Object.assign(state,patch);revision++;listeners.forEach(fn=>fn())},
 reply(index,data,status=200){state.pending[index](new Response(JSON.stringify(status>=200&&status<300?{success:true,data}:{success:false,error:{code:'SERVICE_UNAVAILABLE',message:'服务暂不可用'}}),{status,headers:{'Content-Type':'application/json'}}))}};
const observe=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>revision);
export const useFixture=()=>{observe();return state};
export const useOrbitAuthSession=()=>{observe();return {actorId:state.actor,ready:true,signedIn:state.signedIn,cookieHeader:state.cookieHeader}};
export const useOrbitApiBaseUrl=()=>{observe();return {baseUrl:state.baseUrl,ready:true}};
window.fetch=(input,init)=>new Promise((resolve,reject)=>{const index=state.requests.length;state.requests.push({url:String(input),signal:init.signal});state.pending[index]=resolve;init.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})});
`;

test.before(async () => {
  const bundle = await build({
    stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';import {useFixture} from 'fixture';
      import {useTodayTaskPages} from './src/hooks/useTodayTaskPages';
      function App(){const s=useFixture();const r=useTodayTaskPages(s.timeZone,s.date);const data=r.data;return <><output aria-label="state">{r.state.kind}</output><output aria-label="ids">{data?.page.items.map(card=>card.id).join(',')??''}</output><output aria-label="task20-title">{data?.page.items.find(card=>card.id==='task:20')?.titlePreview??''}</output><output aria-label="total">{data?.page.total??'unknown'}</output><output aria-label="error">{r.moreError??''}</output><output aria-label="loading-more">{String(r.loadingMore)}</output><button onClick={r.loadMore}>more</button><button onClick={r.state.refresh}>refresh</button></>};createRoot(document.getElementById('root')).render(<App/>);
    ` },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "today-page-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^fixture$|\/(ApiBaseUrlProvider|AuthSessionProvider)$/ }, () => ({ path: "fixture", namespace: "today-pages" }));
      plugin.onLoad({ filter: /.*/, namespace: "today-pages" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  script = bundle.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true, ...(process.env.ORBIT_TEST_CHROME_PATH ? { executablePath: process.env.ORBIT_TEST_CHROME_PATH } : {}) });
});

test.after(async () => { await browser?.close(); });

async function settle(page: Page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function open(t: { after(fn: () => Promise<void>): void }) {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: script });
  await settle(page);
  return page;
}

async function requests(page: Page): Promise<{ url: string; aborted: boolean }[]> {
  return page.evaluate(() => (window as any).fixture.requests.map((request: any) => ({ url: request.url, aborted: !!request.signal?.aborted })));
}

async function reply(page: Page, index: number, data: unknown, status = 200) {
  await page.evaluate(({ index, data, status }) => (window as any).fixture.reply(index, data, status), { index, data, status });
  await settle(page);
}

async function update(page: Page, patch: object) {
  await page.evaluate(value => (window as any).fixture.update(value), patch);
  await settle(page);
}

function taskCard(id: string) {
  return {
    id, titlePreview: `Preview ${id}`, locationPreview: null, status: "open", category: "work", priority: "normal",
    plannedDate: "2026-09-26", dueAt: null, updatedAt: "2026-09-26T00:00:00.000Z", relatedContact: null,
  };
}

function taskPage(input: {
  actorId?: string; date?: string; timeZone?: string; ids: string[]; total: number; completed?: number; hasMore: boolean; nextCursor: string | null;
}) {
  const actorId = input.actorId ?? "account:one";
  const date = input.date ?? "2026-09-26";
  const timeZone = input.timeZone ?? "Asia/Tokyo";
  const completed = input.completed ?? 4;
  const page = {
    actorId, status: "open", scope: "all", query: "", dueWindow: todayTaskWindow(date, timeZone),
    items: input.ids.map(taskCard), counts: { open: input.total, completed }, total: input.total,
    hasMore: input.hasMore, nextCursor: input.nextCursor, asOf: "2026-09-26T00:00:00.000Z",
  };
  return {
    taskMode: "page", date, timeZone, taskPage: page, completedCount: completed, suggestions: [], schedule: [],
    summary: { openTaskCount: input.total, completedCount: completed, suggestionCount: 0, scheduleCount: 0 },
  };
}

test("Today retries a first-page failure, preserves loaded cards on continuation failure, and merges live counts with deduplication", async t => {
  const page = await open(t);
  let sent = await requests(page);
  assert.equal(sent.length, 1);
  const firstUrl = new URL(sent[0]!.url);
  assert.equal(firstUrl.pathname, "/api/today");
  assert.equal(firstUrl.searchParams.get("taskMode"), "page");
  assert.equal(firstUrl.searchParams.get("timeZone"), "Asia/Tokyo");
  assert.equal(firstUrl.searchParams.get("limit"), "20");

  await reply(page, 0, null, 503);
  assert.equal(await page.getByLabel("state").innerText(), "failure");
  assert.equal(await page.getByLabel("ids").innerText(), "", "an initial failure is not rendered as an empty task list");

  await page.getByRole("button", { name: "refresh" }).click();
  await settle(page);
  sent = await requests(page);
  assert.equal(sent.length, 2);
  await reply(page, 1, taskPage({ ids: Array.from({ length: 20 }, (_, index) => `task:${index + 1}`), total: 21, hasMore: true, nextCursor: "signed:first" }));
  assert.equal(await page.getByLabel("state").innerText(), "success");
  assert.equal((await page.getByLabel("ids").innerText()).split(",").length, 20);

  await page.getByRole("button", { name: "more" }).click();
  await settle(page);
  sent = await requests(page);
  assert.equal(sent.length, 3);
  const continuation = new URL(sent[2]!.url);
  assert.equal(continuation.pathname, "/api/tasks/page");
  assert.equal(continuation.searchParams.get("status"), "open");
  assert.equal(continuation.searchParams.get("scope"), "all");
  assert.equal(continuation.searchParams.get("query"), "");
  assert.equal(continuation.searchParams.get("limit"), "20");
  assert.equal(continuation.searchParams.get("plannedThrough"), "2026-09-26");
  assert.equal(continuation.searchParams.get("dueBefore"), todayTaskWindow("2026-09-26", "Asia/Tokyo").dueBefore);
  assert.equal(continuation.searchParams.get("cursor"), "signed:first");
  await reply(page, 2, null, 503);
  assert.equal(await page.getByLabel("state").innerText(), "success");
  assert.equal((await page.getByLabel("ids").innerText()).split(",").length, 20);
  assert.match(await page.getByLabel("error").innerText(), /服务暂不可用/u);

  await page.getByRole("button", { name: "more" }).click();
  await settle(page);
  sent = await requests(page);
  assert.equal(sent.length, 4);
  assert.equal(new URL(sent[3]!.url).searchParams.get("cursor"), "signed:first", "a failed continuation keeps the same cursor for retry");
  const liveSecondPage = taskPage({ ids: ["task:20", "task:21"], total: 18, completed: 8, hasMore: true, nextCursor: "signed:second" }).taskPage;
  liveSecondPage.items[0]!.titlePreview = "Current preview task:20";
  await reply(page, 3, liveSecondPage);
  assert.equal(await page.getByLabel("error").innerText(), "", "a valid live page should be merged");
  assert.equal(await page.getByLabel("task20-title").innerText(), "Current preview task:20", "a repeated live row refreshes its preview without changing its position");
  const loadedAfterSecond = (await page.getByLabel("ids").innerText()).split(",");
  assert.equal(loadedAfterSecond.length, 21);
  assert.equal(new Set(loadedAfterSecond).size, 21, "an overlapping live keyset row is rendered once");
  assert.equal(await page.getByLabel("total").innerText(), "18", "the latest continuation count replaces the initial count");

  await page.getByRole("button", { name: "more" }).click();
  await settle(page);
  await reply(page, 4, taskPage({ ids: ["task:22"], total: 17, completed: 9, hasMore: false, nextCursor: null }).taskPage);
  const loadedAfterThird = (await page.getByLabel("ids").innerText()).split(",");
  assert.equal(loadedAfterThird.length, 22);
  assert.equal(await page.getByLabel("total").innerText(), "17", "loaded cards may outnumber a live total after concurrent changes");
  assert.equal(await page.getByLabel("loading-more").innerText(), "false");
});

test("actor, cookie, API host, local date, and time zone changes clear pages and reject late responses", async t => {
  const page = await open(t);
  let sent = await requests(page);
  assert.equal(sent.length, 1);
  await update(page, { actor: "account:two", cookieHeader: "session=two", baseUrl: "https://other.test", timeZone: "UTC", date: "2026-09-27" });
  sent = await requests(page);
  assert.equal(sent.length, 2);
  assert.equal(sent[0]!.aborted, true);
  assert.equal(new URL(sent[1]!.url).origin, "https://other.test");
  assert.equal(new URL(sent[1]!.url).searchParams.get("timeZone"), "UTC");
  assert.equal(await page.getByLabel("ids").innerText(), "");

  await reply(page, 0, taskPage({ actorId: "account:one", ids: ["old:private"], total: 1, hasMore: false, nextCursor: null }));
  assert.equal(await page.getByLabel("ids").innerText(), "", "a late prior-scope page cannot be displayed");
  await reply(page, 1, taskPage({ actorId: "account:two", date: "2026-09-27", timeZone: "UTC", ids: ["own:private"], total: 1, hasMore: false, nextCursor: null }));
  assert.equal(await page.getByLabel("ids").innerText(), "own:private");

  await update(page, { cookieHeader: "session=rotated" });
  sent = await requests(page);
  assert.equal(sent.length, 3, "same-account cookie rotation also starts a fresh scoped read");
  assert.equal(await page.getByLabel("ids").innerText(), "", "old account data is hidden while the rotated session is checked");
  await reply(page, 2, taskPage({ actorId: "account:two", date: "2026-09-27", timeZone: "UTC", ids: ["rotated:private"], total: 1, hasMore: false, nextCursor: null }));
  assert.equal(await page.getByLabel("ids").innerText(), "rotated:private");
});
