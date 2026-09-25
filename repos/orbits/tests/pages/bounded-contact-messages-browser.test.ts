import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("Web reads previews first, one message window on selection, and retries sending with the same request identity", async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react"; import {createRoot} from "react-dom/client";
    import {BoundedContactMessagesTab} from "./app/(app)/app/inbox/bounded-contact-messages-tab";
    const at="2026-09-25T00:00:00Z";
    const conversation={conversationId:"c",contactId:"contact",participantAccountIds:["a","b"],participantDisplayNames:{a:"Self",b:"Remote"},qualificationVersion:"v",status:"active",createdAt:at,updatedAt:at};
    window.calls=[];window.failSend=true;window.changed=0;
    window.fetch=async(url,options={})=>{
      const path=String(url);window.calls.push({path,method:options.method||"GET",body:options.body});
      const ok=data=>Response.json({success:true,data});
      if(path==="/api/account/me")return ok({account:{id:"a"}});
      if(path.startsWith("/api/relationship-communication/conversation-summaries"))return ok({actorId:"a",items:[{...conversation,unreadCount:2,lastMessage:{messageId:"m2",senderAccountId:"b",sentAt:at,bodyPreview:"最新预览"}}],hasMore:false,nextCursor:null,asOf:at});
      if(path.includes("/messages?") && !options.method){const earlier=path.includes("cursor=");return ok({actorId:"a",conversation,items:[{messageId:earlier?"m1":"m2",conversationId:"c",senderAccountId:"b",senderDisplayName:"Remote",body:earlier?"历史正文":"最新正文",sentAt:at,deliveryState:"delivered"}],nextCursor:earlier?null:"earlier-signed",newestCursor:"newest-signed",hasMore:!earlier,direction:"older",asOf:at});}
      if(path.endsWith("/read"))return ok({conversationId:"c",lastReadMessageId:JSON.parse(options.body).lastReadMessageId,readAt:at});
      if(path.endsWith("/messages")&&options.method==="POST"){
        if(window.failSend){window.failSend=false;return Response.json({success:false,error:{code:"SERVICE_UNAVAILABLE"}},{status:503});}
        return ok({conversationId:"c",deliveryState:"delivered",message:{body:JSON.parse(options.body).body,senderAccountId:"a"}});
      }
      return Response.json({success:false,error:{code:"NOT_FOUND"}},{status:404});
    };
    createRoot(document.getElementById("root")).render(<BoundedContactMessagesTab actorId="a" onIdentityChanged={()=>window.changed++} />);
  ` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("https://orbit.test/", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    await page.goto("https://orbit.test/");
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    await page.getByText("最新预览", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).calls.filter((c: any) => c.path.includes("/messages")).length), 0);
    await page.getByRole("button", { name: /Remote/ }).click();
    await page.getByText("最新正文", { exact: true }).waitFor();
    await page.waitForFunction(() => (window as any).calls.some((c: any) => c.path.endsWith("/read")));
    await page.getByRole("button", { name: "更早的消息", exact: true }).click();
    await page.getByText("历史正文", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).calls.filter((c: any) => c.path.endsWith("/read")).length), 1, "older browsing does not move the read pointer backwards");
    await page.getByRole("button", { name: "返回最新消息", exact: true }).click();
    await page.getByText("最新正文", { exact: true }).waitFor();
    await page.getByRole("textbox", { name: "回复消息", exact: true }).fill("真实回复草稿");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await page.getByRole("button", { name: "重试发送", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "回复消息", exact: true }).inputValue(), "真实回复草稿");
    await page.getByRole("button", { name: "重试发送", exact: true }).click();
    await page.waitForFunction(() => (window as any).calls.filter((c: any) => c.path.endsWith("/messages") && c.method==="POST").length===2);
    const sends = await page.evaluate(() => (window as any).calls.filter((c: any) => c.path.endsWith("/messages") && c.method==="POST").map((c: any) => JSON.parse(c.body)));
    assert.equal(sends[0].requestId, sends[1].requestId);
    assert.equal(sends[0].body, sends[1].body);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
