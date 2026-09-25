import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium,type Browser,type Page } from "playwright";
let browser:Browser,script:string;
const fixture=`
import {useSyncExternalStore} from 'react';
let revision=0;const listeners=new Set();
const state=window.fixture={actor:'a',signedIn:true,ready:true,cookie:'',baseUrl:'https://orbit.test',cursor:null,view:'open',scope:'all',requests:[],pending:[],snapshots:0,
update(patch){Object.assign(state,patch);revision++;listeners.forEach(fn=>fn())},
reply(index,data,status=200){state.pending[index](new Response(JSON.stringify(status===200?{success:true,data}:{success:false,error:{code:'FORBIDDEN',message:'No access'}}),{status,headers:{'Content-Type':'application/json'}}))}};
const observe=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>revision);
export const useFixture=()=>{observe();return state};
export const useOrbitAuthSession=()=>{observe();return {actorId:state.actor,ready:state.ready,signedIn:state.signedIn,cookieHeader:state.cookie}};
export const useOrbitApiBaseUrl=()=>{observe();return {baseUrl:state.baseUrl,ready:state.ready}};
export const useSyncedCollection=()=>({status:'unsynced',records:[],lastSyncedAt:null,error:null});
export const useWebMirrorStatus=()=>({mode:'online-only'});
export const readSnapshot=async()=>{state.snapshots++;throw Error('no private snapshots')};
export const writeSnapshot=async()=>{state.snapshots++;throw Error('no private snapshots')};
window.fetch=async(input,init)=>{const index=state.requests.length;state.requests.push({url:String(input),signal:init.signal});return new Promise(resolve=>state.pending[index]=resolve)};
`;
test.before(async()=>{
  const output=await build({stdin:{loader:"tsx",resolveDir:process.cwd(),contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {useFixture} from 'fixture';import {useTaskListSource} from './src/screens/tasks/task-list-source.web';
function App(){const s=useFixture();const result=useTaskListSource({actorId:s.actor,ready:s.ready&&s.signedIn,scopeKey:JSON.stringify([s.actor,s.cookie,s.baseUrl,s.signedIn]),selection:{view:s.view,scope:s.scope},cursor:s.cursor});return <><output aria-label="titles">{result.canonical?.map(item=>item.title).join(',')??''}</output><output aria-label="failure">{String(!!result.failure)}</output><output aria-label="count">{result.counts?.open??'unknown'}</output><button onClick={result.refresh}>refresh</button></>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"',"process.env":"{}",__DEV__:"false"},plugins:[{name:"boundaries",setup(plugin){
    plugin.onResolve({filter:/^fixture$|\/(AuthSessionProvider|ApiBaseUrlProvider|snapshot-store|useSyncedCollection|useWebMirrorStatus)$/},()=>({path:"fixture",namespace:"pages"}));
    plugin.onLoad({filter:/.*/,namespace:"pages"},()=>({contents:fixture,loader:"jsx",resolveDir:process.cwd()}));
  }}]});script=output.outputFiles[0]!.text;browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();});
const settle=async(page:Page)=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
async function open(t:{after(fn:()=>Promise<void>):void}){
  const page=await browser.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});await page.route("**/*",r=>r.abort());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:script});await settle(page);return page;
}
const data=(actorId:string,title:string)=>({actorId,status:"open",scope:"all",query:"",items:[{id:title,titlePreview:title,status:"open",category:"work",priority:"normal",updatedAt:"2026-09-25T00:00:00Z",plannedDate:null,dueAt:null,locationPreview:null,relatedContact:null}],counts:{open:65,completed:0},total:65,hasMore:true,nextCursor:"signed",asOf:"2026-09-25T00:00:00Z"});
const update=async(page:Page,patch:object)=>{await page.evaluate(p=>(window as any).fixture.update(p),patch);await settle(page);};
const reply=async(page:Page,index:number,payload:unknown,status=200)=>{await page.evaluate(p=>(window as any).fixture.reply(p.index,p.payload,p.status),{index,payload,status});await settle(page);};
test("paged network source rejects stale identity, wrong scope and denied responses without a full read fallback",async t=>{
  const page=await open(t);
  await update(page,{cursor:"signed"});
  await reply(page,1,data("a","New page"));await reply(page,0,data("a","Late old page"));
  assert.equal(await page.getByLabel("titles").innerText(),"New page");
  await update(page,{actor:"b",cookie:"b",baseUrl:"https://other.test",cursor:null});
  assert.equal(await page.getByLabel("titles").innerText(),"");assert.equal(await page.getByLabel("count").innerText(),"unknown");
  await reply(page,2,data("a","Wrong account"));assert.equal(await page.getByLabel("titles").innerText(),"");assert.equal(await page.getByLabel("failure").innerText(),"true");
  await page.getByText("refresh",{exact:true}).click();await settle(page);await reply(page,3,{...data("b","Wrong filter"),scope:"relationship"});assert.equal(await page.getByLabel("titles").innerText(),"");
  await page.getByText("refresh",{exact:true}).click();await settle(page);await reply(page,4,data("b","Own"));assert.equal(await page.getByLabel("titles").innerText(),"Own");
  await page.getByText("refresh",{exact:true}).click();await settle(page);await reply(page,5,{},403);assert.equal(await page.getByLabel("titles").innerText(),"");
  await update(page,{signedIn:false});await page.getByText("refresh",{exact:true}).click();await settle(page);
  const requests=await page.evaluate(()=>(window as any).fixture.requests.map((r:any)=>r.url));
  assert.equal(requests.length,6);assert.ok(requests.every((url:string)=>new URL(url).pathname==="/api/tasks/page"));assert.equal(await page.evaluate(()=>(window as any).fixture.snapshots),0);
});
test("switching away from a local mirror offset starts the first network page",async t=>{
  const page=await open(t);await update(page,{cursor:"local:30"});
  const requests=await page.evaluate(()=>(window as any).fixture.requests.map((r:any)=>r.url));
  assert.ok(requests.every((url:string)=>!new URL(url).searchParams.has("cursor")));
});
