import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {build} from 'esbuild';
import {chromium,type Browser,type Page} from 'playwright';

const require=createRequire(import.meta.url);
let browser:Browser,script:string;
const fixture=`
import React,{useEffect,useSyncExternalStore} from 'react';
let revision=0,next=0;const listeners=new Set();
const state=window.fixture={actor:'owner',ready:true,mode:'open',baseUrl:'https://orbit.example',cookie:'',navigation:[],requests:[],snapshots:0,...window.initialFixture,
update(patch){Object.assign(state,patch);revision++;listeners.forEach(fn=>fn());}};
export const useFixture=()=>{useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>revision);return state;};
export const useOrbitAuthSession=()=>{useFixture();return{actorId:state.actor,ready:state.ready,signedIn:Boolean(state.actor),cookieHeader:state.cookie};};
export const useOrbitApiBaseUrl=()=>{useFixture();return{ready:true,baseUrl:state.baseUrl};};
export const useOrbitLocale=()=>({language:'zh'});
export const useRouter=()=>({push(href){state.navigation.push(href);}});
export const useFocusEffect=callback=>useEffect(callback,[]);
export const readSnapshot=async()=>{state.snapshots++;return null;};
export const writeSnapshot=async()=>{state.snapshots++;};
export const randomUUID=()=> 'scope-'+ ++next;
`;
test.before(async()=>{
  const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{RelationshipLifecycleList}from'./src/screens/tasks/RelationshipLifecycleList';import{useFixture}from'fixture';function App(){const s=useFixture();return <RelationshipLifecycleList scopeKey="caller" ready={s.ready} mode={s.mode}/>;}createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"','process.env':'{}',__DEV__:'false'},plugins:[{name:'task-page-boundaries',setup(plugin){
    plugin.onResolve({filter:/^react-native$/},()=>({path:require.resolve('react-native-web')}));
    plugin.onResolve({filter:/^(fixture|expo-router|expo-crypto)$|\/(AuthSessionProvider|ApiBaseUrlProvider|OrbitLocaleContext|snapshot-store)$/},()=>({path:'fixture',namespace:'task-pages'}));
    plugin.onLoad({filter:/.*/,namespace:'task-pages'},()=>({contents:fixture,loader:'jsx',resolveDir:process.cwd()}));
  }}]});script=result.outputFiles[0]!.text;browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();});
const controls=new WeakMap<Page,{fail:boolean;hold:boolean;release?:()=>void;wrongActor:boolean}>();
async function open(t:{after(fn:()=>Promise<void>):void},initial:Record<string,unknown>={}){
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(3000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const control={fail:false,hold:false,wrongActor:false} as NonNullable<ReturnType<typeof controls.get>>;controls.set(page,control);
  t.after(async()=>{control.release?.();await page.unrouteAll({behavior:'wait'});await page.close();assert.deepEqual(errors,[]);});
  await page.route('https://orbit.example/**',async route=>{
    const headers={'Access-Control-Allow-Origin':'null','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'content-type,cookie'};
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    const url=new URL(route.request().url());
    const actor=await page.evaluate(url=>{const s=(window as any).fixture;s.requests.push(url);return s.actor;},url.href);
    assert.equal(url.pathname,'/api/relationship-tasks/page');assert.equal(url.searchParams.get('limit'),'30');
    const mode=url.searchParams.get('mode'),start=Number(url.searchParams.get('cursor')??0),total=actor==='owner'?(mode==='open'?65:2):0;
    const items=Array.from({length:Math.min(30,Math.max(0,total-start))},(_,i)=>({itemKey:`row:${start+i}`,taskId:`task:${start+i}`,connectionId:`connection:${start+i}`,contactId:'contact',titlePreview:`${mode==='open'?'跟进':'完成'} ${start+i}`,contactNamePreview:'联系人',status:mode==='open'?'open':'completed',dueAt:null}));
    const body=control.fail?{success:false,error:{code:'FORBIDDEN',message:'Unavailable'}}:{success:true,data:{actorId:control.wrongActor?'other':actor,mode,items,total,hasMore:start+30<total,nextCursor:start+30<total?String(start+30):null,asOf:'2026-09-25T00:00:00.000Z'}};
    const status=control.fail?403:200;
    if(control.hold){control.hold=false;await new Promise<void>(resolve=>{control.release=resolve;});}
    await route.fulfill({status,headers,json:body});
  });
  await page.setContent('<div id="root"></div>');await page.evaluate(initial=>{(window as any).initialFixture=initial;},initial);await page.addScriptTag({content:script});return page;
}
test('real task list replaces 30/30/5 windows, navigates detail and resets completed mode',async t=>{
  const page=await open(t);await page.getByText('跟进 29',{exact:true}).waitFor();
  assert.equal(await page.getByText(/^跟进 \d+$/).count(),30);
  await page.getByRole('button',{name:'下一页跟进'}).click();await page.getByText('跟进 59',{exact:true}).waitFor();
  assert.equal(await page.getByText('跟进 0',{exact:true}).count(),0);
  await page.getByRole('button',{name:'下一页跟进'}).click();await page.getByText('跟进 64',{exact:true}).waitFor();
  assert.equal(await page.getByText(/^跟进 \d+$/).count(),5);assert.equal(await page.getByRole('button',{name:'下一页跟进'}).count(),0);
  await page.getByRole('button',{name:/跟进 64/}).click();assert.deepEqual(await page.evaluate(()=>(window as any).fixture.navigation),['/tasks/relationship/connection%3A64']);
  await page.getByRole('button',{name:'返回跟进第一页'}).click();await page.getByText('跟进 0',{exact:true}).waitFor();
  await page.evaluate(()=>(window as any).fixture.update({mode:'completed'}));await page.getByText('完成 1',{exact:true}).waitFor();
  assert.equal(await page.getByText(/^跟进 \d+$/).count(),0);
  assert.equal(await page.evaluate(()=>(window as any).fixture.snapshots),0);
  await page.screenshot({path:'/tmp/orbit-relationship-task-page.png',fullPage:true});
});
test('disabled scope performs no reads; rejection and wrong actor never show a stale page',async t=>{
  const page=await open(t,{ready:false});
  assert.deepEqual(await page.evaluate(()=>(window as any).fixture.requests),[]);
  await page.evaluate(()=>(window as any).fixture.update({ready:true}));await page.getByText('跟进 0',{exact:true}).waitFor();
  controls.get(page)!.fail=true;await page.getByRole('button',{name:'刷新人脉跟进'}).click();
  await page.getByText('跟进读取失败，请刷新重试。',{exact:true}).waitFor();assert.equal(await page.getByText(/^跟进 \d+$/).count(),0);
  controls.get(page)!.fail=false;controls.get(page)!.wrongActor=true;await page.getByRole('button',{name:'刷新人脉跟进'}).click();
  await page.getByText('跟进读取失败，请刷新重试。',{exact:true}).waitFor();assert.equal(await page.getByText(/^跟进 \d+$/).count(),0);
});
test('late old page cannot restore data after an account switch, even with the same caller scope',async t=>{
  const page=await open(t);await page.getByText('跟进 0',{exact:true}).waitFor();
  const control=controls.get(page)!;control.hold=true;await page.getByRole('button',{name:'下一页跟进'}).click();
  await page.waitForFunction(()=>(window as any).fixture.requests.some((url:string)=>url.includes('cursor=30')));
  await page.evaluate(()=>(window as any).fixture.update({actor:'other'}));await page.getByText('暂无人脉跟进',{exact:true}).waitFor();
  control.release?.();assert.equal(await page.getByText(/^跟进 \d+$/).count(),0);
  await page.evaluate(()=>(window as any).fixture.update({actor:null}));assert.equal(await page.getByText(/^跟进 \d+$/).count(),0);
});
