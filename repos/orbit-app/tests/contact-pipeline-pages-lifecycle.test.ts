import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

let browser: Browser;
let script: string;
const fixture = `
import {useSyncExternalStore} from 'react';
let revision=0;const listeners=new Set();
const state=window.fixture={actor:'account:one',signedIn:true,cookieHeader:'session=one',baseUrl:'https://orbit.test',stage:'to_contact',requests:[],pending:[],
 update(patch){Object.assign(state,patch);revision++;listeners.forEach(fn=>fn())},
 reply(index,data,status=200){state.pending[index](new Response(JSON.stringify(status>=200&&status<300?{success:true,data}:{success:false,error:{code:'SERVICE_UNAVAILABLE',message:'读取暂时失败'}}),{status,headers:{'Content-Type':'application/json'}}))}};
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
      import {useContactPipelinePages} from './src/hooks/useContactPipelinePages';
      function App(){const s=useFixture();const r=useContactPipelinePages(s.stage);const data=r.data;return <><output aria-label="state">{r.state.kind}</output><output aria-label="ids">{data?.page.items.map(item=>item.id).join(',')??''}</output><output aria-label="count">{data?.page.stageCounts[s.stage]??'unknown'}</output><output aria-label="more-error">{r.moreError??''}</output><output aria-label="loading-more">{String(r.loadingMore)}</output><button onClick={r.loadMore}>more</button><button onClick={r.state.refresh}>refresh</button></>};createRoot(document.getElementById('root')).render(<App/>);
    ` },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "contact-pipeline-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^fixture$|\/(ApiBaseUrlProvider|AuthSessionProvider)$/ }, () => ({ path: "fixture", namespace: "pipeline-pages" }));
      plugin.onLoad({ filter: /.*/, namespace: "pipeline-pages" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
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

function pageData(input: { stage?: "to_contact" | "in_progress" | "nurture" | "archived"; ids: string[]; count: number; hasMore: boolean; nextCursor: string | null }) {
  const stage = input.stage ?? "to_contact";
  return {
    asOf: "2026-09-26T00:00:00.000Z", stage,
    stageCounts: { to_contact: stage === "to_contact" ? input.count : 0, in_progress: stage === "in_progress" ? input.count : 0, nurture: stage === "nurture" ? input.count : 0, archived: stage === "archived" ? input.count : 0 },
    items: input.ids.map(id => ({ id, displayName: id, organization: "Orbit", role: "Partner" })),
    hasMore: input.hasMore, nextCursor: input.nextCursor, actions: [],
  };
}

test("pipeline reads one page, only loads more on demand, and keeps loaded rows when continuation fails", async t => {
  const page = await open(t);
  let sent = await requests(page);
  assert.equal(sent.length, 1);
  const firstUrl = new URL(sent[0]!.url);
  assert.equal(firstUrl.pathname, "/api/contacts/pipeline");
  assert.equal(firstUrl.searchParams.get("stage"), "to_contact");
  assert.equal(firstUrl.searchParams.get("limit"), "20");
  await reply(page, 0, pageData({ ids: Array.from({ length: 20 }, (_, index) => `contact:${index + 1}`), count: 23, hasMore: true, nextCursor: "signed:first" }));
  assert.equal((await page.getByLabel("ids").innerText()).split(",").length, 20);
  assert.equal(await page.getByLabel("count").innerText(), "23");
  assert.equal((await requests(page)).length, 1, "the hook must not automatically follow the cursor");

  await page.getByRole("button", { name: "more" }).click();
  await settle(page);
  sent = await requests(page);
  assert.equal(sent.length, 2);
  assert.equal(new URL(sent[1]!.url).searchParams.get("cursor"), "signed:first");
  assert.equal((await page.getByLabel("ids").innerText()).split(",").length, 20, "existing rows remain visible while loading more");
  await reply(page, 1, null, 503);
  assert.equal(await page.getByLabel("state").innerText(), "success");
  assert.equal((await page.getByLabel("ids").innerText()).split(",").length, 20);
  assert.match(await page.getByLabel("more-error").innerText(), /读取暂时失败/u);

  await page.getByRole("button", { name: "more" }).click();
  await settle(page);
  sent = await requests(page);
  assert.equal(sent.length, 3);
  assert.equal(new URL(sent[2]!.url).searchParams.get("cursor"), "signed:first", "retry retains the same signed cursor");
  await reply(page, 2, pageData({ ids: ["contact:21", "contact:22", "contact:23"], count: 23, hasMore: false, nextCursor: null }));
  assert.equal((await page.getByLabel("ids").innerText()).split(",").length, 23);
  assert.equal(await page.getByLabel("more-error").innerText(), "");
  assert.equal(await page.getByLabel("loading-more").innerText(), "false");
});

test("stage and account changes hide old rows, abort the old read, and sign-out stays inert", async t => {
  const page = await open(t);
  await update(page, { stage: "in_progress" });
  let sent = await requests(page);
  assert.equal(sent.length, 2);
  assert.equal(sent[0]!.aborted, true);
  assert.equal(new URL(sent[1]!.url).searchParams.get("stage"), "in_progress");
  assert.equal(await page.getByLabel("ids").innerText(), "");
  await reply(page, 0, pageData({ ids: ["old:private"], count: 1, hasMore: false, nextCursor: null }));
  assert.equal(await page.getByLabel("ids").innerText(), "");
  await reply(page, 1, pageData({ stage: "in_progress", ids: ["own:row"], count: 1, hasMore: false, nextCursor: null }));
  assert.equal(await page.getByLabel("ids").innerText(), "own:row");

  await update(page, { actor: "account:two", cookieHeader: "session=two" });
  sent = await requests(page);
  assert.equal(sent.length, 3);
  assert.equal(sent[1]!.aborted, true);
  assert.equal(await page.getByLabel("ids").innerText(), "");
  await reply(page, 2, pageData({ stage: "in_progress", ids: ["own:two"], count: 1, hasMore: false, nextCursor: null }));
  assert.equal(await page.getByLabel("ids").innerText(), "own:two");

  await update(page, { signedIn: false });
  assert.equal(await page.getByLabel("ids").innerText(), "");
  await page.getByRole("button", { name: "refresh" }).click();
  await settle(page);
  assert.equal((await requests(page)).length, 3);
});
