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
    await page.waitForFunction(() => (window as any).draft === "");
    assert.equal(await box.inputValue(), "");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
