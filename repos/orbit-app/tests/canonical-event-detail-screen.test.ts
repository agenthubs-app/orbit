import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let script: string;
// Real route, screen, resource/client, schemas and adapters; only external boundaries are doubled.
const boundaries = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native-web";
import { createTranslator } from "./src/i18n/messages";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const registration = { eligibility: { allowedActions: [], applicationVersion: null, evaluatedAt: "2026-09-16T11:29:12.959Z", policyVersion: null, reason: "unavailable", registrationVersion: null, state: "unavailable" }, questionSet: { provenance: { aiProviderRequested: false, externalNetworkRequested: false, fallbackReason: "QUESTIONS_NOT_REQUESTED", generationMethod: "deterministic-not-requested", model: null, provider: null }, questions: [] }, registration: null };
const person = { participantId: "profile-1", displayName: "当前参会者", company: "", role: "", industry: "", languages: [], needs: [], offers: [], topics: [], experienceHighlight: "" };
const operations = { eventId: "event_signup_03", me: person, directory: [person], configuration: { eventId: "event_signup_03", eventStartsAt: "2026-10-27T09:00:00Z", eventEndsAt: "2026-10-27T11:00:00Z", checkInOpensAt: "2026-10-27T08:30:00Z", profileEditDeadlineAt: "2026-10-26T09:00:00Z", resultsAvailableAt: "2026-10-27T08:00:00Z", roundOneStartsAt: "2026-10-27T09:00:00Z", roundTwoStartsAt: "2026-10-27T10:00:00Z" }, resultsState: "not_generated", recommendations: null, graph: null, checkIn: null, checkInAvailable: false, contactRequests: [], profileEditable: true, roundOneTable: null, roundTwoTable: null };
const state = window.fixture = { actor: "actor-1", signedIn: true, ready: true, baseReady: true, focused: true, mounted: true, id: "event_signup_03", baseUrl: "https://orbit.invalid", cookieHeader: "", registration, operations, artifact: { eventId: "event_signup_03", artifact: null, status: "queued", failureCode: null, updatedAt: "2026-10-28T11:00:00Z" }, requests: [], navigation: [], pending: [], presses: {}, event: { id: "event_signup_03", title: "日中投资人与创业者沙龙", startsAt: "2026-10-27T09:00:00Z", endsAt: "2026-10-27T11:00:00Z", status: "confirmed", venue: "东京", sourceMetadata: { label: "event-core-postgres" }, evidence: [] }, ...window.initialFixture,
 update(patch) { Object.assign(state,patch); revision++; listeners.forEach(fn=>fn()); },
 reply(index) { const r=state.requests[index]; const path=new URL(r.url).pathname; const data=path.endsWith("/cancel")?state.cancelReceipt:path.includes("/public/")?{event:state.event}:path==="/api/events/"+encodeURIComponent(state.event.id)?{event:state.event}:path.endsWith("/registration")?state.readback??state.registration:path.endsWith("/operations")?state.operations:state.artifact; const code=state.statuses?.[path]??200; state.pending[index]?.(new Response(JSON.stringify(code===200?{success:true,data}:{success:false,error:{code:"SERVICE_UNAVAILABLE",message:"服务暂不可用"}}),{status:code,headers:{"Content-Type":"application/json"}})); }
};
window.fetch = async (input,init) => { const index=state.requests.length; state.requests.push({url:String(input),method:init.method,signal:init.signal,body:init.body?JSON.parse(init.body):null}); const promise=new Promise(resolve=>state.pending[index]=resolve); if(!state.holdReads && !(state.holdOwnerReads && new URL(String(input)).pathname==="/api/events/"+encodeURIComponent(state.event.id)))queueMicrotask(()=>state.reply(index)); return promise; };
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return {ready:state.ready,signedIn:state.signedIn,actorId:state.actor,user:state.signedIn?{id:state.actor}:null,cookieHeader:state.cookieHeader}; };
export const useOrbitApiBaseUrl = () => { observe(); return {ready:state.baseReady,baseUrl:state.baseUrl}; };
export const useOrbitLocale = () => ({language:"zh",t:createTranslator("zh")});
export const useLocalSearchParams = () => { observe(); return {id:state.id}; };
export const useIsFocused = () => { observe(); return state.focused; };
export const usePathname = () => "/events/"+state.id;
export const useRouter = () => ({canGoBack:()=>false,push:x=>state.navigation.push(x),replace:x=>state.navigation.push(x)});
export const SafeAreaView = ({edges,...props}) => <View {...props}/>;
export const Ionicons = () => null;
export const readSnapshot = async (_base,_actor,path) => { (window.fixture.snapshots??=[]).push(path);return null; };
export const writeSnapshot = async () => {};
export const Alert = { alert(title,message,buttons) { (state.alerts??=[]).push({title,message,buttons}); } };
`;

test.before(async () => {
  const result = await build({ stdin: { contents: 'import React from "react";import {createRoot} from "react-dom/client";import Route from "./app/events/[id]";import {useFixture} from "fixture";function App(){const s=useFixture();return s.mounted?<Route/>:null}createRoot(document.getElementById("root")).render(<App/>);', loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, plugins: [{ name: "canonical-external-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "canonical" }));
    plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
    plugin.onResolve({ filter: /^(fixture|expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|OrbitLocaleContext|snapshot-store)$/ }, () => ({ path: "fixture", namespace: "canonical" }));
    plugin.onLoad({ filter: /.*/, namespace: "canonical" }, args => ({ contents: args.path === "native" ? 'import React from "react";import {Platform as RealPlatform,Alert as RealAlert,Pressable as RealPressable,RefreshControl as RealRefreshControl} from "react-native-web";export * from "react-native-web";import {Alert as FixtureAlert} from "fixture";export const Platform={...RealPlatform,get OS(){return window.fixture.platform??"ios"}};export const Alert={alert(...args){return window.fixture.platform==="web"?RealAlert.alert(...args):FixtureAlert.alert(...args)}};export const Pressable=props=>{const label=props.accessibilityLabel;if(label)window.fixture.presses[label]=props.onPress;return <RealPressable {...props}/>};export const RefreshControl=props=>{window.fixture.refresh=props.onRefresh;return <RealRefreshControl {...props}/>};export const Share={share:async()=>({})};' : boundaries, loader: "jsx", resolveDir: process.cwd() }));
    plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
  } }] });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => browser?.close());
async function settle(page: Page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function open(t: { after(fn: () => Promise<void>): void }, patch: object = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/*", r => r.abort());
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(patch => { (window as any).initialFixture = patch; }, patch);
  await page.addScriptTag({ content: script }); await page.getByText("日中投资人与创业者沙龙", { exact: true }).waitFor(); await settle(page); return page;
}
async function update(page: Page, patch: object) { await page.evaluate(patch => (window as any).fixture.update(patch), patch); await settle(page); }
async function requests(page: Page): Promise<Array<{ path: string; method: string }>> { return page.evaluate(() => (window as any).fixture.requests.map((r: any) => ({ path: new URL(r.url).pathname + new URL(r.url).search, method: r.method }))); }
async function register(page: Page, ended = false) {
  await page.evaluate(ended => { const s=(window as any).fixture; const r=structuredClone(s.registration);r.eligibility={...r.eligibility,state:"registered",reason:"registered",allowedActions:["update"],evaluatedAt:ended?"2026-10-28T11:00:00Z":"2026-09-16T11:29:12.959Z"};r.registration={id:"registration-1",eventId:s.event.id,userId:s.actor,status:"rsvped",participantProfileId:"profile-1",participantProfile:{id:"profile-1",eventId:s.event.id,userId:s.actor,answers:{desiredOutcome:"寻找投资合作",targetAttendees:"投资人",valueOffered:"行业经验"}},updatedAt:"2026-09-16T00:00:00Z"};s.update({registration:r});s.refresh(); }, ended); await settle(page);
  await page.waitForFunction(() => /推荐结果尚未|推荐结果生成|已发布的推荐结果|暂时无法读取/.test(document.body.innerText));
  if (ended) await page.waitForFunction(() => /会后总结排队中|会后总结生成|会后总结服务|会后总结暂不可用|真实已存总结/.test(document.body.innerText));
}

test("canonical unavailable registration never calls legacy/protected services or offers registration", async t => {
  const page = await open(t);
  assert.match(await page.locator("body").innerText(), /报名暂不可用/);
  assert.deepEqual(await requests(page), [{ path: "/api/events/public/event_signup_03", method: "GET" }, { path: "/api/events/event_signup_03/registration?questions=false", method: "GET" }]);
  assert.equal(await page.getByRole("button", { name: "报名参加", exact: true }).count(), 0);
  assert.match(await page.locator("body").innerText(), /活动结束后可用/);
  await page.screenshot({ path: "/tmp/pw0012-canonical-synthetic.png", fullPage: true });
});

test("legacy source retains independent pending owner qualification and refresh revocation", async t => {
  const page = await open(t);
  await page.evaluate(() => { const s=(window as any).fixture;s.update({event:{...s.event,sourceMetadata:{label:"organizer-import"},stats:{count:2,attendees:[{name:"公开已发布人物"}]}},holdOwnerReads:true});s.refresh(); });
  await page.getByText("正在确认名单查看权限。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "查看参会者", exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), []);
  const ownerIndex = await page.evaluate(() => (window as any).fixture.requests.findLastIndex((r:any)=>new URL(r.url).pathname==="/api/events/event_signup_03"));
  assert.ok(ownerIndex >= 0);
  await page.evaluate(index => (window as any).fixture.reply(index), ownerIndex);
  await page.getByRole("button", { name: "查看参会者", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/events/event_signup_03/attendees"]);
  await page.evaluate(() => { const s=(window as any).fixture;s.update({holdOwnerReads:false,statuses:{"/api/events/event_signup_03":403}});s.refresh(); });
  await page.getByText("当前账号无法查看参会者名单。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "查看参会者", exact: true }).count(), 0);
  assert.equal(await page.getByText("公开已发布人物", { exact: true }).count(), 1);
  assert.equal((await requests(page)).some(r=>r.method!=="GET"), false);
});

test("canonical to legacy requires owner lookup while returning canonical never repeats that private read", async t => {
  const page = await open(t);
  await page.evaluate(() => { const s=(window as any).fixture;s.update({event:{...s.event,sourceMetadata:{label:"organizer-import"}}});s.refresh(); });
  await page.getByRole("button", { name: "查看参会者", exact: true }).waitFor();
  await page.evaluate(() => { const s=(window as any).fixture;s.update({event:{...s.event,sourceMetadata:{label:"event-core-postgres"}}});s.refresh(); });
  await page.getByTestId("event-registration-status").filter({ hasText: "报名暂不可用" }).waitFor();
  await settle(page);
  assert.equal(await page.getByRole("button", { name: "查看参会者", exact: true }).count(), 0);
  // The first refresh starts while the last validated DTO is still legacy.
  // Count only the next refresh from the now-confirmed canonical reading state.
  const before = (await requests(page)).length;
  await page.evaluate(() => (window as any).fixture.refresh());
  await settle(page);
  const delta = (await requests(page)).slice(before);
  assert.equal(delta.filter(r=>r.path==="/api/events/event_signup_03").length, 0);
  assert.equal(delta.filter(r=>r.path==="/api/events/event_signup_03/registration?questions=false").length, 1);
  assert.equal(delta.some(r=>r.method!=="GET"), false);
});

test("late legacy owner response is aborted and cannot publish after canonical source replaces it", async t => {
  const page = await open(t);
  await page.evaluate(() => { const s=(window as any).fixture;s.update({event:{...s.event,sourceMetadata:{label:"organizer-import"}},holdOwnerReads:true});s.refresh(); });
  await page.getByText("正在确认名单查看权限。", { exact: true }).waitFor();
  const ownerIndex = await page.evaluate(() => (window as any).fixture.requests.findLastIndex((r:any)=>new URL(r.url).pathname==="/api/events/event_signup_03"));
  await page.evaluate(() => { const s=(window as any).fixture;s.update({event:{...s.event,sourceMetadata:{label:"event-core-postgres"}}});s.refresh(); });
  await page.getByTestId("event-registration-status").filter({ hasText: "报名暂不可用" }).waitFor();
  assert.equal(await page.evaluate(index => (window as any).fixture.requests[index].signal.aborted, ownerIndex), true);
  await page.evaluate(index => (window as any).fixture.reply(index), ownerIndex);
  await settle(page);
  assert.equal(await page.getByRole("button", { name: "查看参会者", exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), []);
});
test("canonical cancel-only registration confirms the formal action before writing and reads the same record back", async t => {
  const page = await open(t); await register(page);
  await page.evaluate(() => { const s=(window as any).fixture;const r=structuredClone(s.registration);r.eligibility.allowedActions=["cancel"];r.eligibility.blockingReason="configuration_required";r.eligibility.registrationVersion=r.registration.updatedAt;s.update({registration:r});s.refresh(); }); await settle(page);
  const cancel = page.getByRole("button", { name: "取消本次报名", exact: true });
  await cancel.click(); await settle(page);
  assert.equal((await requests(page)).some(r=>r.method==="POST"), false);
  await page.evaluate(() => { const s=(window as any).fixture;const r=structuredClone(s.registration);r.registration.status="cancelled";r.registration.updatedAt="2026-09-16T01:00:00Z";r.eligibility={...r.eligibility,state:"unavailable",reason:"unavailable",allowedActions:[],registrationVersion:r.registration.updatedAt};s.readback=r;s.cancelReceipt={...r.registration,mutationReceipt:{action:"cancel",actorId:s.actor,eventId:s.id,recordId:r.registration.id,registrationVersion:r.registration.updatedAt}};const fn=s.alerts.at(-1).buttons.find((b:any)=>b.style==="destructive").onPress;fn();fn(); }); await settle(page);
  const posts = await page.evaluate(() => (window as any).fixture.requests.filter((r:any)=>r.method==="POST").map((r:any)=>r.body));
  assert.deepEqual(posts, [{intent:"cancel",expectedRegistrationVersion:"2026-09-16T00:00:00Z"}]);
  assert.equal((await requests(page)).filter(r=>r.path.includes("registration?questions=false")).length>=3,true);
});
test("invalid server evaluatedAt is a contract failure, not ordinary unregistered or device-time authorization", async t => {
  const page = await open(t); await page.evaluate(() => { const s=(window as any).fixture;const r=structuredClone(s.registration);r.eligibility.evaluatedAt="invalid";s.update({registration:r});s.refresh(); }); await settle(page);
  assert.match(await page.locator("body").innerText(), /数据版本暂时无法识别/);
  assert.equal((await requests(page)).some(r => /operations|artifact|readiness|recommendations/.test(r.path)), false);
});
test("registered future event reads operations states but never artifact or automatic writes", async t => {
  const page = await open(t); await register(page);
  assert.match(await page.locator("body").innerText(), /尚未生成/);
  for (const [state, copy] of [["locked", "尚未开放"], ["processing", "生成中"], ["failed", "生成失败"]] as const) {
    await page.evaluate(state => { const s=(window as any).fixture;s.update({operations:{...s.operations,resultsState:state}});s.refresh(); }, state); await settle(page);
    await page.getByText({ locked: "推荐结果尚未开放", processing: "推荐结果生成中", failed: "推荐结果生成失败" }[state], { exact: true }).waitFor();
    assert.match(await page.locator("body").innerText(), new RegExp(copy));
  }
  assert.equal((await requests(page)).filter(r => r.path.endsWith("/operations")).length, 4);
  assert.equal((await requests(page)).some(r => r.path.includes("artifact") || r.method !== "GET"), false);
});
test("registered ended event reads existing artifact with GET only and shows queued distinctly", async t => {
  const page = await open(t); await register(page, true);
  assert.match(await page.locator("body").innerText(), /会后总结排队中/);
  assert.equal((await requests(page)).filter(r => r.path.endsWith("/post-event/artifact")).length, 1);
  assert.equal((await requests(page)).some(r => r.method !== "GET"), false);
});
test("refresh revokes registered content and immediately unmounts protected reads", async t => {
  const page = await open(t); await register(page);
  await page.evaluate(() => { const s=(window as any).fixture;const r=structuredClone(s.registration);r.eligibility.state="registration_cancelled";r.eligibility.reason="registration_cancelled";r.eligibility.allowedActions=[];r.registration.status="cancelled";s.update({registration:r,holdReads:true});s.refresh(); }); await settle(page);
  assert.doesNotMatch(await page.locator("body").innerText(), /尚未生成/);
  await page.evaluate(() => { const s=(window as any).fixture;for(let i=0;i<s.requests.length;i++)if(!s.requests[i].signal?.aborted)s.reply(i); }); await settle(page);
  assert.doesNotMatch(await page.locator("body").innerText(), /尚未生成/);
  assert.equal((await requests(page)).filter(r => r.path.endsWith("/operations")).length, 1);
});
test("account change hides old personal responses and uses network-only account scope", async t => {
  const page = await open(t); await register(page); await update(page, { actor: "actor-2", holdReads: true });
  assert.doesNotMatch(await page.locator("body").innerText(), /尚未生成|寻找投资合作/);
  assert.equal((await requests(page)).some(r => r.method !== "GET"), false);
});

test("canonical fixed footer only navigates when validated allowedActions permits it", async t => {
  const page = await open(t); await register(page);
  const button = page.getByRole("button", { name: "查看报名", exact: true });
  assert.equal(await button.isEnabled(), true);
  await button.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/events/event_signup_03/register"]);
  await page.evaluate(() => { const s=(window as any).fixture;const r=structuredClone(s.registration);r.eligibility.allowedActions=[];s.update({registration:r});s.refresh(); }); await settle(page);
  assert.equal(await button.isDisabled(), true);
  assert.equal((await requests(page)).some(r => r.method !== "GET"), false);
});
test("canonical pending review without allowed registration actions cannot activate the footer", async t => {
  const page = await open(t);
  await page.evaluate(() => { const s=(window as any).fixture;const r=structuredClone(s.registration);r.eligibility.state="pending_review";r.eligibility.reason="pending_review";s.update({registration:r});s.refresh(); }); await settle(page);
  assert.equal(await page.getByRole("button", { name: "查看申请", exact: true }).isDisabled(), true);
  assert.equal((await requests(page)).some(r => /operations|artifact/.test(r.path)), false);
});
test("canonical ready recommendations show only referenced published attendee data", async t => {
  const page = await open(t);
  await page.evaluate(() => { const s=(window as any).fixture;s.update({operations:{...s.operations,resultsState:"ready",directory:[s.operations.me,{participantId:"participant-2",displayName:"已发布投资人",company:"示例公司",privateEmail:"hidden@example.invalid"},{participantId:"participant-3",displayName:"不可见无关人物"}],graph:{secret:"不可见关系图"},recommendations:{sourceParticipantId:"profile-1",noMatchReason:null,recommendations:[{targetParticipantId:"participant-2",score:82,reasons:["共同关注机器人"],memberHint:"交流产业经验",icebreakers:["聊聊机器人","交流投资方向"]}]}}}); }); await register(page);
  const text = await page.locator("body").innerText();
  assert.match(text, /已发布投资人|共同关注机器人/);
  assert.doesNotMatch(text, /不可见无关人物|不可见关系图|hidden@example/);
  assert.equal((await requests(page)).some(r => r.method !== "GET"), false);
});
for (const state of ["running", "failed", "unconfigured", "ready"] as const) test(`canonical existing artifact ${state} remains read-only and does not claim review confirmation`, async t => {
  const page = await open(t);
  await page.evaluate(state => { const s=(window as any).fixture;s.update({artifact:{...s.artifact,status:state,failureCode:state==="failed"?"AI_GENERATION_FAILED":null,artifact:state==="ready"?{summary:"真实已存总结",evidenceHash:"hash-1",evidenceIds:["evidence-1"],generatedAt:"2026-10-28T11:00:00Z",messageDraft:null,model:"saved-model",provider:"saved-provider",promptVersion:1,version:1}:null}}); }, state); await register(page,true);
  const text = await page.locator("body").innerText();
  assert.match(text, new RegExp({running:"会后总结生成中",failed:"会后总结生成失败",unconfigured:"会后总结服务尚未配置",ready:"真实已存总结"}[state]));
  assert.equal((await requests(page)).some(r => r.method !== "GET"), false);
  assert.equal(await page.getByRole("button", { name: /确认联系人|生成总结/ }).count(), 0);
});
for (const status of [403,503]) test(`protected operations HTTP ${status} remains a visible failure, not empty recommendations`, async t => {
  const page = await open(t,{statuses:{"/api/events/event_signup_03/operations":status}}); await register(page);
  assert.match(await page.locator("body").innerText(), /暂时无法读取/);
  assert.doesNotMatch(await page.locator("body").innerText(), /推荐结果尚未生成|已发布的推荐结果/);
});
test("registration response for another actor is rejected before protected requests", async t => {
  const page = await open(t);
  await page.evaluate(() => { const s=(window as any).fixture;const r=structuredClone(s.registration);r.eligibility.state="registered";r.eligibility.reason="registered";r.registration={id:"r",eventId:s.id,userId:"other-actor",status:"rsvped",participantProfileId:"p",participantProfile:{id:"p",eventId:s.id,userId:"other-actor",answers:{}},updatedAt:"2026-09-16T00:00:00Z"};s.update({registration:r});s.refresh(); }); await settle(page);
  assert.match(await page.locator("body").innerText(), /数据版本暂时无法识别/);
  assert.equal((await requests(page)).some(r => /operations|artifact/.test(r.path)), false);
});
for (const patch of [{baseUrl:"https://second.invalid"},{id:"other-event"},{signedIn:false},{focused:false}]) test(`canonical scope change clears old protected response ${JSON.stringify(patch)}`, async t => {
  const page=await open(t);await register(page);await update(page,{...patch,holdReads:true});
  assert.doesNotMatch(await page.locator("body").innerText(),/寻找投资合作|推荐结果尚未生成/);
  const personalSnapshots=await page.evaluate(()=>(window as any).fixture.snapshots.filter((p:string)=>!p.includes("/public/")));
  assert.deepEqual(personalSnapshots,[]);
});
test("complete self-consistent foreign operations payload is rejected against the verified registration profile", async t => {
  const page = await open(t);
  await page.evaluate(() => { const s=(window as any).fixture;const foreign={participantId:"foreign-profile",displayName:"其他账号"};s.update({operations:{...s.operations,resultsState:"ready",me:foreign,directory:[foreign,{participantId:"foreign-target",displayName:"不可泄漏推荐对象"}],recommendations:{sourceParticipantId:"foreign-profile",noMatchReason:null,recommendations:[{targetParticipantId:"foreign-target",score:82,reasons:["不可泄漏私有原因"],memberHint:"外账号",icebreakers:["外账号一","外账号二"]}]}}}); }); await register(page);
  const text=await page.locator("body").innerText();
  assert.match(text,/数据版本暂时无法识别/);
  assert.doesNotMatch(text,/不可泄漏推荐对象|不可泄漏私有原因/);
});
for (const [code, message] of [["SOURCE_HASH_CHANGED", "会后记录已更新"], ["UNRECOGNIZED_INTERNAL_CODE", "暂时无法读取可用的会后总结"]] as const) test(`artifact renderer explains ${code} without raw diagnostics`, async t => {
  const page=await open(t);
  await page.evaluate(code=>{const s=(window as any).fixture;s.update({artifact:{...s.artifact,status:"failed",artifact:null,failureCode:code}});},code);await register(page,true);
  const text=await page.locator("body").innerText();assert.match(text,new RegExp(message));assert.doesNotMatch(text,/SOURCE_HASH_CHANGED|UNRECOGNIZED_INTERNAL_CODE/);
});

test("canonical Web cancellation opens real confirmation instead of the empty Web Alert", async t => {
  const page = await open(t, { platform: "web" }); await register(page);
  await page.evaluate(() => { const s=(window as any).fixture;const r=structuredClone(s.registration);r.eligibility.allowedActions=["cancel"];r.eligibility.registrationVersion=r.registration.updatedAt;s.update({registration:r});s.refresh(); }); await settle(page);
  let dialogs=0; page.on("dialog",async dialog=>{dialogs++;assert.equal(dialog.type(),"confirm");await dialog.dismiss();});
  await page.getByRole("button",{name:"取消本次报名",exact:true}).click();await settle(page);
  assert.equal(dialogs,1);assert.equal((await requests(page)).some(r=>r.method==="POST"),false);
});

for(const mode of ["missing","throws"] as const)test(`canonical Web confirmation ${mode} reports no cancellation`,async t=>{
  const page=await open(t,{platform:"web"});await register(page);
  await page.evaluate(mode=>{const s=(window as any).fixture;const r=structuredClone(s.registration);r.eligibility.allowedActions=["cancel"];r.eligibility.registrationVersion=r.registration.updatedAt;s.update({registration:r});s.refresh();(window as any).confirm=mode==="missing"?undefined:()=>{throw new Error("Unavailable");};},mode);await settle(page);
  await page.getByRole("button",{name:"取消本次报名",exact:true}).click();await settle(page);
  await page.getByText("无法打开取消确认，尚未取消报名。请重试。",{exact:true}).waitFor();
  assert.equal((await requests(page)).some(r=>r.method==="POST"),false);
  assert.match(await page.locator("body").innerText(),/寻找投资合作/);
});

test("canonical Web approval writes once and verifies the same registration independently",async t=>{
  const page=await open(t,{platform:"web"});await register(page);
  await page.evaluate(()=>{const s=(window as any).fixture;const r=structuredClone(s.registration);r.eligibility.allowedActions=["cancel"];r.eligibility.registrationVersion=r.registration.updatedAt;s.update({registration:r});s.refresh();const readback=structuredClone(r);readback.registration.status="cancelled";readback.registration.updatedAt="2026-09-16T01:00:00Z";readback.eligibility={...readback.eligibility,state:"unavailable",reason:"unavailable",allowedActions:[],registrationVersion:readback.registration.updatedAt};s.cancelReadback=readback;s.cancelReceipt={...readback.registration,mutationReceipt:{action:"cancel",actorId:s.actor,eventId:s.id,recordId:r.registration.id,registrationVersion:readback.registration.updatedAt}};});await settle(page);
  let dialogs=0;page.on("dialog",async d=>{dialogs++;await d.accept();});
  // Activate the readback only when the write crosses the HTTP boundary.
  await page.evaluate(()=>{const s=(window as any).fixture;const fetch=window.fetch;window.fetch=(input,init)=>{if(init?.method==="POST")s.readback=s.cancelReadback;return fetch(input,init);};});
  await page.getByRole("button",{name:"取消本次报名",exact:true}).click();await settle(page);
  assert.equal(dialogs,1);
  assert.deepEqual(await page.evaluate(()=>(window as any).fixture.requests.filter((r:any)=>r.method==="POST").map((r:any)=>r.body)),[{intent:"cancel",expectedRegistrationVersion:"2026-09-16T00:00:00Z"}]);
  assert.ok((await requests(page)).filter(r=>r.path.includes("registration?questions=false")).length>=3);
  assert.equal(await page.getByText("暂时无法核对取消结果，请重新读取报名状态。",{exact:true}).count(),0);
});
