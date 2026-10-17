import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright";
import { bundleScenarios, launch, openScenario } from "./helpers/ui-harness";

// Keep the real editor hook, edit-session store and receipt validator. Only the
// resource/auth-client/native boundaries are controlled, not save decisions.
async function editorScript() {
  return bundleScenarios(`
    import React from "react"; import {createRoot} from "react-dom/client";
    import {useAccountEditor} from "./src/screens/me/useAccountEditor";
    function Fixture(){const editor=useAccountEditor(); window.editor=editor;
      return <output>{JSON.stringify({saving:editor.saving,feedback:editor.feedback,draft:editor.session?.draft,canSave:editor.canSave})}</output>;}
    createRoot(document.getElementById("root")).render(<Fixture/>);
  `, [{ name: "editor-controlled-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /\/useProfileEditSessionScreen$|\/useOrbitApiClient$|\/useAccountProfile$|^expo-crypto$/ }, () => ({ path: "fixture", namespace: "editor-save" }));
    plugin.onLoad({ filter: /.*/, namespace: "editor-save" }, () => ({ loader: "jsx", resolveDir: process.cwd(), contents: `
      import React from "react";
      import {profilePayload} from "./tests/helpers/profile-detail-fixtures";
      import {openProfileEditSession,getProfileEditSession} from "./src/data/profile-edit-session";
      const scopes=[{actorId:"actor-1",apiOrigin:"https://one.test"},{actorId:"actor-2",apiOrigin:"https://two.test"}];
      const profiles=[profilePayload.profile,{...profilePayload.profile,id:"profile:2",displayName:"次のアカウント"}];
      window.calls=[]; window.refreshes=0; let sequence=0;
      const clients=scopes.map((scope,index)=>({put:async(path,options)=>new Promise(resolve=>window.calls.push({path,body:options.body,signal:options.signal,index,resolve}))}));
      export const randomUUID=()=>{if(window.uiFixture.failId)throw new Error("No random source"); return "editor-"+(++sequence);};
      export function useProfileEditSessionScreen(){const[index,setIndex]=React.useState(0);const[,revise]=React.useState(0);
        window.switchEditorScope=()=>setIndex(1); window.activeEditorIndex=index;
        React.useMemo(()=>openProfileEditSession(scopes[index],profiles[index]),[index]);
        return {scope:scopes[index],baseProfile:profiles[index],session:getProfileEditSession(scopes[index]),copy:window.uiFixture.offline?{offline:true}:null,resource:{kind:"success"},syncSession:()=>revise(value=>value+1),refresh:()=>window.refreshes++};}
      export const useAccountPath=()=>"/api/profile";
      export const useOrbitApiClient=()=>clients[window.activeEditorIndex??0];
      window.resolveEditorCall=(index,mode="ok")=>{const call=window.calls[index];const at="2026-09-12T00:00:01Z";
        const data={...profilePayload,onboarding:{policyVersion:1,status:"incomplete",missingFields:["birthDate"]},mutationId:call.body.mutationId,
          profile:{...profiles[call.index],...call.body,updatedAt:at},editor:{...profilePayload.editor,lastSavedAt:at}};
        if(mode==="wrong-id")data.mutationId="wrong";
        if(mode==="stale")data.profile.updatedAt=call.body.expectedUpdatedAt;
        call.resolve(mode==="503"?{success:false,status:503,error:{message:"retry"}}:{success:true,status:200,data});};
    ` }));
  } }]);
}
async function open(t: { after(fn: () => Promise<void>): void }, fixture: Record<string, unknown> = {}) {
  const browser = await launch(); t.after(() => browser.close());
  const page = await openScenario(browser, await editorScript(), fixture); t.after(() => page.close());
  return page;
}
async function run(page: Page, code: string) { await page.evaluate(code + ";undefined"); await page.waitForTimeout(30); }
async function state(page: Page) { return JSON.parse(await page.locator("output").innerText()); }

test("R18a real editor does not write an unchanged or offline draft", { timeout: 15000 }, async t => {
  const page = await open(t);
  await run(page, "void window.editor.save()");
  assert.equal(await page.evaluate("window.calls.length"), 0);
  const offline = await open(t, { offline: true });
  await run(offline, 'window.editor.patch({bio:"オフラインの変更"})');
  await run(offline, "void window.editor.save()");
  assert.equal(await offline.evaluate("window.calls.length"), 0);
});

test("R18a real editor single-flight save validates receipt and keeps exact retry intent", { timeout: 15000 }, async t => {
  const page = await open(t);
  await run(page, 'window.editor.patch({bio:"新しい紹介"})');
  await run(page, "window.firstSave=window.editor.save(); void window.editor.save()");
  assert.equal(await page.evaluate("window.calls.length"), 1);
  await run(page, 'window.resolveEditorCall(0,"503")');
  assert.ok((await state(page)).feedback);
  await run(page, "window.retrySave=window.editor.save()");
  assert.deepEqual(await page.evaluate("window.calls[0].body"), await page.evaluate("window.calls[1].body"));
  await run(page, "window.resolveEditorCall(1)");
  assert.equal(await page.evaluate("window.retrySave"), true);
  assert.equal(await page.evaluate("window.refreshes"), 1);
});

for (const mode of ["wrong-id", "stale"]) test(`R18a real editor rejects ${mode} receipt without discarding its draft`, { timeout: 15000 }, async t => {
  const page = await open(t);
  await run(page, 'window.editor.patch({bio:"手元の紹介"})');
  await run(page, "window.pendingSave=window.editor.save()");
  await run(page, `window.resolveEditorCall(0,${JSON.stringify(mode)})`);
  assert.equal(await page.evaluate("window.pendingSave"), false);
  assert.equal((await state(page)).draft.bio, "手元の紹介");
  assert.equal(await page.evaluate("window.refreshes"), 0);
});

test("R18a real editor late save receipt cannot erase a newer local edit", { timeout: 15000 }, async t => {
  const page = await open(t);
  await run(page, 'window.editor.patch({bio:"保存中の紹介"})');
  await run(page, "window.pendingSave=window.editor.save()");
  await run(page, 'window.editor.patch({bio:"その後の手入力"})');
  await run(page, "window.resolveEditorCall(0)");
  assert.equal((await state(page)).draft?.bio, "その後の手入力");
  assert.equal(await page.evaluate("window.pendingSave"), false);
});

test("R18a real editor revokes old callbacks and permits the new scope while old save is pending", { timeout: 15000 }, async t => {
  const page = await open(t);
  await run(page, 'window.editor.patch({bio:"古い紹介"})');
  await run(page, "window.oldSave=window.editor.save; window.pendingSave=window.oldSave()");
  await run(page, "window.switchEditorScope()");
  assert.equal(await page.evaluate("window.calls[0].signal.aborted"), true);
  await run(page, 'window.editor.patch({bio:"次の紹介"})');
  await run(page, "void window.editor.save()");
  assert.equal(await page.evaluate("window.calls.length"), 2);
  await run(page, "window.resolveEditorCall(0)");
  assert.equal((await state(page)).saving, true, "the old finalizer must not unlock the new save");
  await run(page, "window.resolveEditorCall(1)");
  await run(page, "void window.oldSave()");
  assert.equal(await page.evaluate("window.calls.length"), 2);
});

test("R18a real editor random-source failure is visible without a write", { timeout: 15000 }, async t => {
  const page = await open(t, { failId: true });
  await run(page, 'window.editor.patch({bio:"紹介"})');
  const result = await page.evaluate("window.editor.save().then(value=>({value}),error=>({error:error.message}))");
  assert.deepEqual(result, { value: false });
  assert.ok((await state(page)).feedback);
  assert.equal(await page.evaluate("window.calls.length"), 0);
});
