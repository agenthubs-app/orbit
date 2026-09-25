import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

let browser: Browser;
let script: string;
const fixture = `
import {useSyncExternalStore} from 'react';
let revision=0;const listeners=new Set();
const state=window.fixture={actor:'a',signedIn:true,cookieHeader:'',baseUrl:'https://orbit.test',query:'',requests:[],pending:[],snapshots:0,
 update(patch){Object.assign(state,patch);revision++;listeners.forEach(fn=>fn())},
 reply(index,data,status=200){state.pending[index](new Response(JSON.stringify(status===200?{success:true,data}:{success:false,error:{code:'FORBIDDEN',message:'No access'}}),{status,headers:{'Content-Type':'application/json'}}))}};
const observe=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>revision);
export const useFixture=()=>{observe();return state};
export const useOrbitAuthSession=()=>{observe();return {actorId:state.actor,ready:true,signedIn:state.signedIn,cookieHeader:state.cookieHeader}};
export const useOrbitApiBaseUrl=()=>{observe();return {baseUrl:state.baseUrl,ready:true}};
export const readSnapshot=async()=>{state.snapshots++;throw Error('private snapshots are not allowed')};
export const writeSnapshot=async()=>{state.snapshots++;throw Error('private snapshots are not allowed')};
window.fetch=async(input,init)=>{const index=state.requests.length;state.requests.push({url:String(input),signal:init.signal});return new Promise(resolve=>state.pending[index]=resolve)};
`;
test.before(async () => {
  const bundle = await build({ stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import {useFixture} from 'fixture';
    import {useContactCardPages} from './src/hooks/useContactCardPages';
    function App(){const s=useFixture();const r=useContactCardPages({query:s.query});return <><output aria-label="state">{r.state.kind}</output><output aria-label="total">{r.summary?.total??'unknown'}</output><output aria-label="names">{r.page?.items.map(c=>c.displayName).join(',')??''}</output><button onClick={r.nextPage} disabled={!r.page?.hasMore}>next</button><button onClick={r.firstPage}>first</button><button onClick={r.state.refresh}>refresh</button></>};createRoot(document.getElementById('root')).render(<App/>);
  ` }, bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, plugins: [{ name: "boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^fixture$|\/(ApiBaseUrlProvider|AuthSessionProvider|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "pages" }));
    plugin.onLoad({ filter: /.*/, namespace: "pages" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
  } }] });
  script = bundle.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function settle(page: Page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }) {
  const page = await browser.newPage(); const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.abort()); await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: script }); await settle(page); return page;
}
const at = "2026-09-25T00:00:00Z";
const summary = { total: 10000, sources: { manual: 10000 }, statuses: { active: 10000 }, tags: [], values: {}, hasMoreTags: false, asOf: at };
const cards = (name: string, more = false) => ({ items: [{ id: name, displayName: name, organization: "Org", role: "Engineer", status: "active", sourceType: "manual", pendingInitialization: false, nextActionPreview: "Next", updatedAt: at }], hasMore: more, nextCursor: more ? "signed-cursor" : null, asOf: at });
async function requests(page: Page): Promise<{ url: string; aborted: boolean }[]> { return page.evaluate(() => (window as any).fixture.requests.map((r: any) => ({ url: r.url, aborted: !!r.signal?.aborted }))); }
async function reply(page: Page, index: number, data: unknown, status = 200) { await page.evaluate(({ index, data, status }) => (window as any).fixture.reply(index, data, status), { index, data, status }); await settle(page); }
async function update(page: Page, value: object) { await page.evaluate(value => (window as any).fixture.update(value), value); await settle(page); }

test("one page plus global summary, next page does not recount, query/refresh resets, and no full-list fallback", async t => {
  const page = await open(t); const first = await requests(page);
  assert.deepEqual(first.map(r => new URL(r.url).pathname).sort(), ["/api/contacts/page", "/api/contacts/summary"]);
  assert.equal(new URL(first[0]!.url).searchParams.get("limit"), "30");
  await reply(page, 0, cards("First", true)); await reply(page, 1, summary);
  assert.equal(await page.getByLabel("total").innerText(), "10000");
  await page.getByRole("button", { name: "next", exact: true }).click(); await settle(page);
  assert.equal((await requests(page)).length, 3); assert.match((await requests(page))[2]!.url, /cursor=signed-cursor/);
  assert.equal(await page.getByLabel("names").innerText(), "");
  await reply(page, 2, cards("Second")); assert.equal(await page.getByLabel("names").innerText(), "Second");
  await update(page, { query: "New" }); const changed = await requests(page);
  assert.equal(changed.length, 5); assert.ok(changed.slice(3).every(r => !r.url.includes("cursor=") && r.url.includes("query=New")));
  await reply(page, 3, cards("Filtered", true)); await reply(page, 4, { ...summary, total: 500 });
  await page.getByRole("button", { name: "next", exact: true }).click(); await settle(page); await reply(page, 5, cards("Filtered2"));
  await page.getByRole("button", { name: "refresh", exact: true }).click(); await settle(page);
  const refresh = (await requests(page)).slice(6); assert.equal(refresh.length, 2); assert.ok(refresh.every(r => !r.url.includes("cursor=")));
  await reply(page, 6, {}, 404); await reply(page, 7, summary);
  assert.equal(await page.getByLabel("state").innerText(), "failure"); assert.equal((await requests(page)).length, 8);
  assert.equal(await page.evaluate(() => (window as any).fixture.snapshots), 0);
});

test("scope replacement aborts old pages; revoked access clears rows and counts", async t => {
  const page = await open(t); await update(page, { actor: "b", cookieHeader: "session=b", baseUrl: "https://other.test" });
  const changed = await requests(page); assert.equal(changed.length, 4); assert.ok(changed.slice(0, 2).every(r => r.aborted));
  await reply(page, 0, cards("SECRET OLD")); await reply(page, 1, summary);
  assert.equal(await page.getByLabel("names").innerText(), "");
  await reply(page, 2, cards("Own")); await reply(page, 3, summary);
  assert.equal(await page.getByLabel("names").innerText(), "Own");
  await page.getByRole("button", { name: "refresh", exact: true }).click(); await settle(page);
  await reply(page, 4, cards("Must hide")); await reply(page, 5, {}, 403);
  assert.equal(await page.getByLabel("state").innerText(), "failure");
  assert.equal(await page.getByLabel("names").innerText(), ""); assert.equal(await page.getByLabel("total").innerText(), "unknown");
});

test("sign out without an actor change hides the last page and stays inert", async t => {
  const page = await open(t); await reply(page, 0, cards("Own")); await reply(page, 1, summary);
  await update(page, { signedIn: false });
  assert.equal(await page.getByLabel("names").innerText(), "");
  assert.equal(await page.getByLabel("total").innerText(), "unknown");
  assert.equal((await requests(page)).length, 2);
  await page.getByRole("button", { name: "refresh", exact: true }).click(); await settle(page);
  assert.equal((await requests(page)).length, 2);
});
