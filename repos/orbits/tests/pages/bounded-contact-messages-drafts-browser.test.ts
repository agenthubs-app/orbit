import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

/**
 * Sprint 0104: the web inbox reply composer loads and saves the participant's
 * reply draft on the relationship conversation (UI wiring; the draft API itself
 * is covered against real Postgres in relationship-drafts-postgres.test.ts).
 */
test("Web loads the saved reply draft for the opened conversation, saves edits, reports a failed save, and clears it after sending", async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react"; import {createRoot} from "react-dom/client";
    import {BoundedContactMessagesTab} from "./app/(app)/app/inbox/bounded-contact-messages-tab";
    const at="2026-09-27T00:00:00Z";
    const conversation={conversationId:"c",contactId:"contact",participantAccountIds:["a","b"],participantDisplayNames:{a:"Self",b:"Remote"},qualificationVersion:"v",status:"active",createdAt:at,updatedAt:at};
    window.calls=[];window.draft="已保存的草稿";window.failPut=false;
    window.fetch=async(url,options={})=>{
      const path=String(url);window.calls.push({path,method:options.method||"GET",body:options.body});
      const ok=data=>Response.json({success:true,data});
      if(path==="/api/account/me")return ok({account:{id:"a"}});
      if(path.startsWith("/api/relationship-communication/conversation-summaries"))return ok({actorId:"a",items:[{...conversation,unreadCount:0,lastMessage:{messageId:"m1",senderAccountId:"b",sentAt:at,bodyPreview:"预览"}}],hasMore:false,nextCursor:null,asOf:at});
      if(path.includes("/messages?") && !options.method)return ok({actorId:"a",conversation,items:[{messageId:"m1",conversationId:"c",senderAccountId:"b",senderDisplayName:"Remote",body:"对方消息",sentAt:at,deliveryState:"delivered"}],nextCursor:null,newestCursor:"n",hasMore:false,direction:"older",asOf:at});
      if(path.endsWith("/read"))return ok({conversationId:"c",lastReadMessageId:JSON.parse(options.body).lastReadMessageId,readAt:at});
      if(path.endsWith("/draft")&&!options.method)return ok({conversationId:"c",body:window.draft,updatedAt:window.draft?at:null});
      if(path.endsWith("/draft")&&options.method==="PUT"){
        if(window.failPut)return Response.json({success:false,error:{code:"SERVICE_UNAVAILABLE"}},{status:503});
        window.draft=JSON.parse(options.body).body;return ok({conversationId:"c",body:window.draft,updatedAt:at});
      }
      if(path.endsWith("/messages")&&options.method==="POST")return ok({conversationId:"c",deliveryState:"delivered",message:{body:JSON.parse(options.body).body,senderAccountId:"a"}});
      return Response.json({success:false,error:{code:"NOT_FOUND"}},{status:404});
    };
    createRoot(document.getElementById("root")).render(<BoundedContactMessagesTab actorId="a" onIdentityChanged={()=>{}} />);
  ` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("https://orbit.test/", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    await page.goto("https://orbit.test/");
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    await page.getByRole("button", { name: /Remote/ }).click();
    const box = page.getByRole("textbox", { name: "回复消息", exact: true });
    await page.waitForFunction(() => (document.querySelector("textarea") as HTMLTextAreaElement | null)?.value === "已保存的草稿");

    await box.fill("改过的草稿");
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await page.getByText("草稿已保存，只有你能看到。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).draft), "改过的草稿");

    await page.evaluate(() => { (window as any).failPut = true; });
    await box.fill("保存会失败");
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await page.getByText("草稿没有保存，请重试。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).draft), "改过的草稿", "a failed save leaves the stored draft unchanged");

    await page.evaluate(() => { (window as any).failPut = false; });
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await page.waitForFunction(() => (window as any).calls.some((call: any) => call.method === "POST" && call.path.endsWith("/messages")));
    await page.waitForFunction(() => (document.querySelector("textarea") as HTMLTextAreaElement | null)?.value === "");
    // Sprint 0122 (Codex 104-C): the delivery retires the draft on the server; the
    // page sends no blanket clear that could fail or erase newer text.
    assert.deepEqual(await page.evaluate(() => (window as any).calls.filter((call: any) => call.method === "PUT" && JSON.parse(call.body).body === "")), []);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

/** Sprint 0122 (Codex 104-A): "saved" is bound to the saved text and conversation. */
test("Web never reports an edited reply as saved from a late receipt, and a save receipt cannot cross into another conversation", async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react"; import {createRoot} from "react-dom/client";
    import {BoundedContactMessagesTab} from "./app/(app)/app/inbox/bounded-contact-messages-tab";
    const at="2026-09-27T00:00:00Z";
    const conversation=id=>({conversationId:id,contactId:"contact-"+id,participantAccountIds:["a","b-"+id],participantDisplayNames:{a:"Self",["b-"+id]:"Remote "+id},qualificationVersion:"v",status:"active",createdAt:at,updatedAt:at});
    window.calls=[];window.drafts={c1:"",c2:""};window.held=[];
    window.fetch=async(url,options={})=>{
      const path=String(url);window.calls.push({path,method:options.method||"GET",body:options.body});
      const ok=data=>Response.json({success:true,data});
      const id=path.split("/conversations/")[1]?.split("/")[0];
      if(path==="/api/account/me")return ok({account:{id:"a"}});
      if(path.startsWith("/api/relationship-communication/conversation-summaries"))return ok({actorId:"a",items:["c1","c2"].map(c=>({...conversation(c),unreadCount:0,lastMessage:{messageId:"m-"+c,senderAccountId:"b-"+c,sentAt:at,bodyPreview:"预览"}})),hasMore:false,nextCursor:null,asOf:at});
      if(path.includes("/messages?"))return ok({actorId:"a",conversation:conversation(id),items:[{messageId:"m-"+id,conversationId:id,senderAccountId:"b-"+id,senderDisplayName:"Remote "+id,body:"对方消息",sentAt:at,deliveryState:"delivered"}],nextCursor:null,newestCursor:"n",hasMore:false,direction:"older",asOf:at});
      if(path.endsWith("/read"))return ok({conversationId:id,lastReadMessageId:JSON.parse(options.body).lastReadMessageId,readAt:at});
      if(path.endsWith("/draft")&&!options.method)return ok({conversationId:id,body:window.drafts[id],updatedAt:window.drafts[id]?at:null});
      if(path.endsWith("/draft")&&options.method==="PUT"){const body=JSON.parse(options.body).body;return new Promise(resolve=>window.held.push(()=>{window.drafts[id]=body;resolve(ok({conversationId:id,body,updatedAt:at}));}));}
      return Response.json({success:false,error:{code:"NOT_FOUND"}},{status:404});
    };
    createRoot(document.getElementById("root")).render(<BoundedContactMessagesTab actorId="a" onIdentityChanged={()=>{}} />);
  ` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("https://orbit.test/", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    await page.goto("https://orbit.test/");
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    const box = page.getByRole("textbox", { name: "回复消息", exact: true });
    const saved = page.getByText("草稿已保存，只有你能看到。", { exact: true });
    const release = () => page.evaluate(() => (window as any).held.shift()());
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    await page.getByRole("button", { name: /Remote c1/ }).click();
    await box.waitFor();
    await box.fill("第一版");
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await box.fill("第二版尚未保存");
    await release(); await settle(); await settle();
    assert.equal(await page.evaluate(() => (window as any).drafts.c1), "第一版");
    assert.equal(await box.inputValue(), "第二版尚未保存");
    assert.equal(await saved.count(), 0, "the edited text is not reported as saved");
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await release();
    await saved.waitFor();
    assert.equal(await page.evaluate(() => (window as any).drafts.c1), "第二版尚未保存");

    await box.fill("c1 里保存中的草稿");
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await page.getByRole("button", { name: /Remote c2/ }).click();
    await page.getByRole("heading", { name: "Remote c2" }).waitFor();
    await release(); await settle(); await settle();
    assert.equal(await saved.count(), 0, "c1's receipt does not mark c2 saved");
    assert.equal(await page.getByText("草稿没有保存，请重试。", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "保存草稿", exact: true }).isEnabled(), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
