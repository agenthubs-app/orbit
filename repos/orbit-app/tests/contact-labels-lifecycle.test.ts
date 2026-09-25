import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium,type Browser,type Page } from "playwright";

let browser:Browser,script:string;
const fixture=`
import {useSyncExternalStore} from 'react';
let revision=0;const listeners=new Set();
const state=window.fixture={actor:'a',signedIn:true,cookie:'',baseUrl:'https://orbit.test',ids:[],requests:[],pending:[],snapshots:0,
update(patch){Object.assign(state,patch);revision++;listeners.forEach(fn=>fn())},
reply(index,data,status=200){state.pending[index](new Response(JSON.stringify(status===200?{success:true,data}:{success:false,error:{code:'FORBIDDEN',message:'No access'}}),{status,headers:{'Content-Type':'application/json'}}))}};
const observe=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>revision);
export const useFixture=()=>{observe();return state};
export const useOrbitAuthSession=()=>{observe();return {actorId:state.actor,ready:true,signedIn:state.signedIn,cookieHeader:state.cookie}};
export const useOrbitApiBaseUrl=()=>{observe();return {baseUrl:state.baseUrl,ready:true}};
export const readSnapshot=async()=>{state.snapshots++;throw Error('no private snapshots')};
export const writeSnapshot=async()=>{state.snapshots++;throw Error('no private snapshots')};
window.fetch=async(input,init)=>{const index=state.requests.length;state.requests.push({url:String(input),signal:init.signal});return new Promise(resolve=>state.pending[index]=resolve)};
`;
test.before(async()=>{
  const output=await build({stdin:{loader:"tsx",resolveDir:process.cwd(),contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {useFixture} from 'fixture';import {useContactLabels} from './src/hooks/useContactLabels';
function App(){const s=useFixture();const result=useContactLabels(s.ids,'task-page');return <><output aria-label="names">{result.items.map(item=>item.name).join(',')}</output><output aria-label="failure">{String(result.failure)}</output><button onClick={result.refresh}>refresh</button></>};createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"',"process.env":"{}",__DEV__:"false"},plugins:[{name:"boundaries",setup(plugin){
    plugin.onResolve({filter:/^fixture$|\/(AuthSessionProvider|ApiBaseUrlProvider|snapshot-store)$/},()=>({path:"fixture",namespace:"labels"}));
    plugin.onLoad({filter:/.*/,namespace:"labels"},()=>({contents:fixture,loader:"jsx",resolveDir:process.cwd()}));
  }}]});script=output.outputFiles[0]!.text;browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();});
const settle=async(page:Page)=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
async function open(t:{after(fn:()=>Promise<void>):void}){
  const page=await browser.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});await page.route("**/*",r=>r.abort());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:script});await settle(page);return page;
}
const update=async(page:Page,patch:object)=>{await page.evaluate(p=>(window as any).fixture.update(p),patch);await settle(page);};
const reply=async(page:Page,index:number,actorId:string,id:string,name:string,status=200)=>{await page.evaluate(p=>(window as any).fixture.reply(p.index,p.data,p.status),{index,status,data:{actorId,items:[{id,namePreview:name,organizationPreview:"Org"}],asOf:"2026-09-25T00:00:00Z"}});await settle(page);};
test("only current-page IDs are read; stale scope, denied, wrong actor and unrequested IDs hide names",async t=>{
  const page=await open(t);
  assert.equal(await page.evaluate(()=>(window as any).fixture.requests.length),0);
  await update(page,{ids:["c","c"]});
  const urls=await page.evaluate(()=>(window as any).fixture.requests.map((r:any)=>r.url));
  assert.equal(urls.length,1);assert.equal(new URL(urls[0]).pathname,"/api/contacts/labels");assert.deepEqual(new URL(urls[0]).searchParams.getAll("id"),["c"]);
  await update(page,{actor:"b",cookie:"session=b",baseUrl:"https://other.test"});
  assert.equal(await page.evaluate(()=>(window as any).fixture.requests[0].signal.aborted),true);
  await reply(page,0,"a","c","OLD PRIVATE");assert.equal(await page.getByLabel("names").innerText(),"");
  await reply(page,1,"b","c","Own");assert.equal(await page.getByLabel("names").innerText(),"Own");
  await page.getByText("refresh",{exact:true}).click();await settle(page);assert.equal(await page.getByLabel("names").innerText(),"");
  await reply(page,2,"b","c","Denied",403);assert.equal(await page.getByLabel("names").innerText(),"");assert.equal(await page.getByLabel("failure").innerText(),"true");
  await page.getByText("refresh",{exact:true}).click();await settle(page);await reply(page,3,"a","c","Wrong actor");assert.equal(await page.getByLabel("names").innerText(),"");
  await page.getByText("refresh",{exact:true}).click();await settle(page);await reply(page,4,"b","not-requested","Injected");assert.equal(await page.getByLabel("names").innerText(),"");
  await update(page,{signedIn:false});await page.getByText("refresh",{exact:true}).click();await settle(page);
  assert.equal(await page.evaluate(()=>(window as any).fixture.requests.length),5);assert.equal(await page.evaluate(()=>(window as any).fixture.snapshots),0);
});
test("too many IDs fail visibly without truncating or downloading every contact",async t=>{
  const page=await open(t);await update(page,{ids:Array.from({length:31},(_,n)=>`contact:${n}`)});
  assert.equal(await page.getByLabel("failure").innerText(),"true");assert.equal(await page.evaluate(()=>(window as any).fixture.requests.length),0);
});
