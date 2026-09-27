import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

/**
 * Sprint 0122 (Codex 98-C): the web notification filter announces which
 * category is selected, as the App now does. Only the HTTP service is stubbed.
 */
test("Web notification filter tabs expose the selected category to assistive technology", async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react"; import {createRoot} from "react-dom/client";
    import {TypedNotificationsTab} from "./app/(app)/app/inbox/typed-notifications-tab";
    const at="2026-09-27T00:00:00Z";
    window.fetch=async(url)=>{
      const path=String(url);const ok=data=>Response.json({success:true,data});
      if(path==="/api/account/me")return ok({account:{id:"a"}});
      if(path.startsWith("/api/inbox/notifications"))return ok({enabled:true,items:[],unreadCount:0,nextCursor:null,asOf:at});
      return Response.json({success:false,error:{code:"NOT_FOUND"}},{status:404});
    };
    createRoot(document.getElementById("root")).render(<TypedNotificationsTab actorId="a" onIdentityChanged={()=>{}} />);
  ` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("https://orbit.test/", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    await page.goto("https://orbit.test/");
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    const all = page.getByRole("tab", { name: "全部", exact: true });
    await all.waitFor();
    assert.equal(await all.getAttribute("aria-selected"), "true");
    await page.getByRole("tab", { name: "提醒", exact: true }).click();
    assert.equal(await page.getByRole("tab", { name: "提醒", exact: true }).getAttribute("aria-selected"), "true");
    assert.equal(await all.getAttribute("aria-selected"), "false");
    assert.equal(await page.locator('[role="tab"][aria-selected="true"]').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
