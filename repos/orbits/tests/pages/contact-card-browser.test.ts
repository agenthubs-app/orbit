import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("actual card UI reuses SSR data, pages only on demand and never treats one page as all contacts", async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react"; import {createRoot} from "react-dom/client";
    import {NetworkCards} from "./app/(app)/app/contacts/network-0918/network-cards";
    window.calls=[];
    window.fetch=async(path)=>{window.calls.push(String(path)); return Response.json({success:true,data:{
      items:[{id:"c2",displayName:"第二页联系人",organization:"公司",role:"设计师",sourceType:"manual",status:"active",pendingInitialization:false,nextActionPreview:"联系",updatedAt:"2026-09-25T00:00:00Z"}],
      hasMore:false,nextCursor:null,asOf:"2026-09-25T00:00:00Z",relationshipTiers:[{contactId:"c2",tier:"active",dormant:true}]}});};
    createRoot(document.getElementById("root")).render(<NetworkCards view={{
      list:{items:[{id:"c1",name:"第一页联系人",initial:"第",org:"公司",title:"设计师",source:"other",tier:"core",next:"联系",href:"/app/contacts/c1"}],nextPath:"/api/contacts/page?cursor=signed&tiers=1"},
      total:100000,counts:{all:100000,event:0,referral:0,contact:0,scan:0,other:100000},query:"",source:"all",params:"limit=30"
    }} />);
  ` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.abort());
    await page.setContent('<style>body{margin:0}</style><div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    await page.getByText("第一页联系人", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).calls.length), 0, "hydration must not refetch");
    assert.match(await page.locator(".nw-card-hint").innerText(), /100000/);
    // W0047：首屏档位点 + 档位，不再显示手动阶段或「待设置关系」。
    assert.equal(await page.locator('[data-network-tier="core"] .nw-tier-dot').count(), 1);
    assert.match(await page.locator('[data-network-tier="core"]').innerText(), /核心/);
    assert.equal(await page.getByText(/待设置关系|正在推进|保持联系|待了解|已归档/).count(), 0);
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await page.getByText("第二页联系人", { exact: true }).waitFor();
    assert.equal(await page.locator(".nw-row").count(), 1, "replace the bounded window instead of accumulating all pages");
    assert.deepEqual(await page.evaluate(() => (window as any).calls), ["/api/contacts/page?cursor=signed&tiers=1"]);
    // 翻页响应里合并的档位：待唤醒优先。
    assert.match(await page.locator('[data-network-tier="dormant"]').innerText(), /待唤醒/);
    assert.match(await page.locator(".nw-card-hint").innerText(), /100000/);
    assert.equal(await page.getByRole("button", { name: "下一页", exact: true }).count(), 0);
    assert.equal(await page.locator('form[method="get"]').getAttribute("action"), "/app/contacts");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
