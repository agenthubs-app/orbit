import assert from "node:assert/strict";
import test from "node:test";
import { bundleScenarios, launch, openScenario } from "./helpers/ui-harness";

async function accountControllerScript(screen: "Iorbit" | "Suggestions" | "Integrations" | "MyPage" = "Iorbit") {
  const component = screen === "MyPage" ? "MyPageScreen" : `Account${screen}Screen`;
  return bundleScenarios(`
    import React from "react"; import {createRoot} from "react-dom/client";
    import {${component}} from "./src/screens/me/${component}";
    const active=()=>true;
    createRoot(document.getElementById("root")).render(<${component} scopeKey="test" isScopeCurrent={active}/>);
  `, [{ name: "r18a-controller-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /\/useAccountEditor$|\/useAccountSettingsApi$|\/useAccountDesign$|\/useAccountProfile$|\/useOrbitApiClient$|\/ApiBaseUrlProvider$|\/(suggestions|account)-api$|\/AppScreen$|^expo-router$|^expo-(crypto|document-picker|image-picker|file-system|web-browser)$|^@react-native-async-storage\/async-storage$/ }, () => ({ path: "fixture", namespace: "r18a-state" }));
    plugin.onLoad({ filter: /.*/, namespace: "r18a-state" }, () => ({ loader: "jsx", resolveDir: process.cwd(), contents: `
      import React from "react";
      import {demoAccountProfiles} from "../orbits/shared/mock/demo-world/account";
      import {accountDesignFixtures} from "./fixtures/account-design";
      const api={memories:async()=>{window.memoryReads=(window.memoryReads??0)+1;if(window.uiFixture.actorSwitch)return [{memoryId:"old",content:"前のアカウントのメモ",source:"manual",createdAt:"2026-10-01"}];return window.memoryReads===1?null:[{memoryId:"m1",content:"再取得したメモ",source:"manual",createdAt:"2026-10-01"}];},goal:async()=>undefined,semanticAvailable:async()=>false};
      api.list=async()=>window.uiFixture.listFailure?null:[{id:"old-suggestion",status:"pending",sourceKind:"chat",sourceLabel:"会話",createdAt:"2026-10-01",targetProfileField:"role",currentValue:"担当",suggestedValue:"前のアカウントの提案"}];
      api.integrations=async()=>[{provider:"gmail",status:"active",healthStatus:"healthy"},{provider:"google_calendar",status:"pending",healthStatus:"not_checked"}];
      api.acceptCandidate=async(profile,value)=>{const next=structuredClone(demoAccountProfiles.regular);next.profile.seeking=[value];next.profile.updatedAt="2026-10-08T00:00:00.000Z";next.completeness.card.score=75;next.completeness.card.items.find(item=>item.key==="seeking").done=true;return next;};
      const nextApi={...api,memories:()=>new Promise(resolve=>{window.resolveNextMemories=resolve;}),list:()=>new Promise(resolve=>{window.resolveNextSuggestions=resolve;})};
      const state={path:"/api/profile",baseProfile:{id:"p1",displayName:"佐藤",updatedAt:"2026-10-01"},session:{draft:{bio:"紹介"}},copy:null,resource:{kind:"success"},feedback:null,saving:false,offline:false,canSave:false,patch(){},refresh(){},save:async()=>false};
      const designState={...state,path:"/api/profile?design=50"};
      const profileState={path:"/api/profile?design=50",data:demoAccountProfiles.regular,scopeKey:"test",offline:false,copy:null,resource:{kind:"success",refresh(){}}};
      const design={variant:"few",fixtures:{...accountDesignFixtures,seekCandidates:["候補A","候補B"],eventSummary:{hosted:0,active:0,attending:0},unread:{new:0,regular:0}}};
      function useScopedApi(){const[value,setValue]=React.useState(api);window.switchAccountApi=()=>setValue(nextApi);return value;}
      export const useAccountEditor=()=>window.uiFixture.designIorbit?designState:state; export const useAccountSettingsApi=useScopedApi; export const useOrbitApiClient=useScopedApi; export const createAccountSuggestionsApi=client=>client; export const createAccountApi=client=>client; export const accountDestination=path=>path; export const useAccountDesign=()=>window.uiFixture.mypage||window.uiFixture.designIorbit?design:null; export const useAccountProfile=()=>profileState;
      export const useAccountPath=()=>"/api/profile"; export const useOrbitApiBaseUrl=()=>({baseUrl:"http://fixture",ready:true});
      export const AppScreen=({children})=><main>{children}</main>; export const useRouter=()=>({push(){}});
      export const randomUUID=()=>"test-mutation"; export class File{}; export const openBrowserAsync=()=>new Promise(resolve=>{window.resolveBrowser=resolve;});
      export const getDocumentAsync=async()=>({canceled:true}); export const requestCameraPermissionsAsync=async()=>({granted:false}); export const requestMediaLibraryPermissionsAsync=requestCameraPermissionsAsync; export const launchCameraAsync=async()=>({canceled:true}); export const launchImageLibraryAsync=launchCameraAsync;
      export default {getItem:async()=>window.uiFixture.semanticOff?"off":null,setItem:async(key,value)=>{window.savedSemantic={key,value};}};
    ` }));
  } }]);
}

test("R18a iOrbit failed memory read offers retry without claiming an empty list", { timeout: 15000 }, async t => {
  const script = await accountControllerScript();
  const browser = await launch(); t.after(() => browser.close());
  const page = await openScenario(browser, script, {}); t.after(() => page.close());
  assert.equal(await page.getByText("覚えていることはまだありません", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "再試行", exact: true }).click({ timeout: 3000 });
  await page.getByText("再取得したメモ", { exact: true }).waitFor({ timeout: 3000 });
  assert.equal(await page.evaluate(() => (window as unknown as { memoryReads: number }).memoryReads), 2);
});

test("R18a iOrbit clears previous-account memories when its scoped API changes", { timeout: 15000 }, async t => {
  const script = await accountControllerScript();
  const browser = await launch(); t.after(() => browser.close());
  const page = await openScenario(browser, script, { actorSwitch: true }); t.after(() => page.close());
  await page.getByText("前のアカウントのメモ", { exact: true }).waitFor({ timeout: 3000 });
  await page.evaluate(() => (window as unknown as { switchAccountApi: () => void }).switchAccountApi());
  await page.waitForFunction(() => Boolean((window as unknown as { resolveNextMemories?: unknown }).resolveNextMemories));
  assert.equal(await page.getByText("前のアカウントのメモ", { exact: true }).count(), 0);
});

test("R18a suggestions never restore previous-account cards after the next scoped read fails", { timeout: 15000 }, async t => {
  const script = await accountControllerScript("Suggestions");
  const browser = await launch(); t.after(() => browser.close());
  const page = await openScenario(browser, script, {}); t.after(() => page.close());
  await page.getByText("前のアカウントの提案", { exact: true }).waitFor({ timeout: 3000 });
  await page.evaluate(() => (window as unknown as { switchAccountApi: () => void }).switchAccountApi());
  await page.waitForFunction(() => Boolean((window as unknown as { resolveNextSuggestions?: unknown }).resolveNextSuggestions));
  await page.evaluate(() => (window as unknown as { resolveNextSuggestions: (value: null) => void }).resolveNextSuggestions(null));
  await page.getByRole("button", { name: "再試行", exact: true }).waitFor({ timeout: 3000 });
  assert.equal(await page.getByText("前のアカウントの提案", { exact: true }).count(), 0);
});

test("R18a failed suggestion reads show retry, not a successful empty queue", { timeout: 15000 }, async t => {
  const script = await accountControllerScript("Suggestions");
  const browser = await launch(); t.after(() => browser.close());
  const page = await openScenario(browser, script, { listFailure: true }); t.after(() => page.close());
  await page.getByRole("button", { name: "再試行", exact: true }).waitFor({ timeout: 3000 });
  assert.equal(await page.getByText("登録内容のちがいを見つけたら、ここに届きます", { exact: true }).count(), 0);
});

test("R18a integrations do not retain an old scope's pending OAuth busy state", { timeout: 15000 }, async t => {
  const script = await accountControllerScript("Integrations");
  const browser = await launch(); t.after(() => browser.close());
  const page = await openScenario(browser, script, {}); t.after(() => page.close());
  const connect = page.getByRole("button", { name: "接続する", exact: true });
  await connect.click({ timeout: 3000 });
  await page.waitForFunction(() => Boolean((window as unknown as { resolveBrowser?: unknown }).resolveBrowser));
  assert.equal(await connect.isDisabled(), true);
  await page.evaluate(() => (window as unknown as { switchAccountApi: () => void }).switchAccountApi());
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.getAttribute("aria-label") === "接続する" && !button.disabled), null, { timeout: 3000 });
  assert.equal(await connect.isDisabled(), false);
});

test("R18a my-page candidate accept updates completeness without discarding remaining dismissible choices", { timeout: 15000 }, async t => {
  const script = await accountControllerScript("MyPage");
  const browser = await launch(); t.after(() => browser.close());
  const page = await openScenario(browser, script, { mypage: true }); t.after(() => page.close());
  await page.getByRole("button", { name: "候補Aを採用", exact: true }).click({ timeout: 3000 });
  await page.getByText("75%", { exact: true }).waitFor({ timeout: 3000 });
  await page.getByRole("button", { name: "候補Bを見送る", exact: true }).click({ timeout: 3000 });
  assert.equal(await page.getByRole("button", { name: "候補Bを採用", exact: true }).count(), 0);
  await page.getByText("候補A", { exact: true }).waitFor({ timeout: 3000 });
});

test("R18a design iOrbit still restores the actual device semantic-search choice", { timeout: 15000 }, async t => {
  const script = await accountControllerScript();
  const browser = await launch(); t.after(() => browser.close());
  const page = await openScenario(browser, script, { designIorbit: true, semanticOff: true }); t.after(() => page.close());
  const toggle = page.getByRole("switch", { name: "意味検索", exact: true });
  await toggle.click({ timeout: 3000 });
  await page.waitForFunction(() => Boolean((window as unknown as { savedSemantic?: unknown }).savedSemantic));
  assert.deepEqual(await page.evaluate(() => (window as unknown as { savedSemantic: unknown }).savedSemantic), { key: "orbit.search.semantic", value: "on" });
});
