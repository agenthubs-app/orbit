import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

// W0031 SC-02 (a)(d)(e) on the real notifications tab: reads share one identity confirmation,
// every action passes a fresh pre-write barrier, and an account switch stops the write.
test("notifications tab shares the read confirmation and confirms afresh before every action", async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react"; import {createRoot} from "react-dom/client";
    import {TypedNotificationsTab} from "./app/(app)/app/inbox/typed-notifications-tab";
    const at="2026-09-16T02:00:00Z";
    const row=(readAt)=>({id:"n",actorId:"a",revision:readAt?2:1,kind:"reminder",origin:"user",semanticKey:"s",title:"发送报价资料",reason:"会议中答应发送",sources:[{sourceKind:"note",sourceId:"note",sourceRevision:"1",occurredAt:at,readAt:at,excerpt:"原文承诺"}],target:{kind:"source",id:"note",href:"/notes/note",status:"available"},actions:["read","dismiss"],occurredAt:at,updatedAt:at,readAt,disposition:"open"});
    window.calls=[];window.account="a";window.changed=0;window.read=null;
    window.fetch=async(url,options={})=>{
      const path=String(url);window.calls.push({path,method:options.method||"GET"});
      const ok=data=>Response.json({success:true,data});
      if(path==="/api/account/me")return ok({account:{id:window.account}});
      if(path.startsWith("/api/inbox/notifications?"))return ok({enabled:true,items:[row(window.read)],unreadCount:window.read?0:1,nextCursor:null,asOf:at});
      if(path.includes("/actions")){window.read=at;return ok({notification:row(at)});}
      if(path.startsWith("/api/inbox/notifications/n"))return ok(row(window.read));
      return Response.json({success:false,error:{code:"NOT_FOUND"}},{status:404});
    };
    createRoot(document.getElementById("root")).render(<TypedNotificationsTab actorId="a" onIdentityChanged={()=>window.changed++} />);
  ` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("https://orbit.test/", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    await page.goto("https://orbit.test/");
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    const me = () => page.evaluate(() => (window as any).calls.filter((c: any) => c.path === "/api/account/me").length);
    const posts = () => page.evaluate(() => (window as any).calls.filter((c: any) => c.method === "POST").length);
    await page.getByText("发送报价资料").first().waitFor();
    assert.equal(await me(), 1, "list read: the before and after confirmations share one request");
    await page.getByText("发送报价资料").first().click();
    await page.getByRole("button", { name: "标为已读" }).waitFor();
    assert.equal(await me(), 1, "opening the detail inside the same cycle reuses it");
    await page.getByRole("button", { name: "标为已读" }).click();
    await page.waitForFunction(() => (window as any).calls.some((c: any) => c.method === "POST"));
    assert.equal(await me(), 2, "the action confirmed with its own fresh request");
    await page.getByText("已读").first().waitFor();
    // The account changes while the old identity is still reusable: the next action must notice.
    await page.evaluate(() => { (window as any).account = "b"; });
    await page.getByRole("button", { name: "忽略" }).click();
    await page.waitForFunction(() => (window as any).changed > 0);
    assert.equal(await me(), 3);
    assert.equal(await posts(), 1, "no action was sent for the switched account");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
