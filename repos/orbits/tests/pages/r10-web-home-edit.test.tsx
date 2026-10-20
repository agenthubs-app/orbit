import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { bundle, errorsOf, launch, open } from "../ui/support/orbit-2026-harness";
import { SHELL_STUBS } from "../ui/support/orbit-2026-shell-harness";

let browser: Browser;
let code: { js: string; css: string };

const stubs = {
  ...SHELL_STUBS,
  "network/ContactDrawer$": `export function ContactDrawer() { return null; }`,
  "add/TodayQuestionCard$": `export function TodayQuestionCard() { return <div data-question>Question fixture</div>; }`,
};

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { ShellSlotsProvider, useShellSlots } from "./app/(app)/app/orbit-2026/shell/slots";
    import { HomePlaceholder } from "./app/(app)/app/orbit-2026/home/HomePlaceholder";
    function Header() { const slots = useShellSlots(); return <div data-header style={{height:70}}>{slots.right}<div data-rail style={{position:"absolute",left:1000,top:0,width:320}}>{slots.rightRail}</div></div>; }
    createRoot(document.getElementById("root")).render(<ShellSlotsProvider><Header /><HomePlaceholder /></ShellSlotsProvider>);
  `, stubs);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function home(t: { after: (fn: () => Promise<void>) => void }): Promise<Page> {
  const page = await open(browser, code, { width: 1440, html: `<div id="root" style="width:970px"></div><script>
    window.shellFixture={lang:"ja",calls:[],path:"/app/home"};
    window.layout={revision:0,app:[{key:"today",size:"m"},{key:"planScore",size:"s"},{key:"nextEvent",size:"s"},{key:"network",size:"s"},{key:"secretary",size:"m"}],web:[{key:"today",size:"m"},{key:"planScore",size:"s"},{key:"nextEvent",size:"s"},{key:"network",size:"s"},{key:"secretary",size:"m"}]};
    window.writes=[];
    window.fetch=async (url,init={})=>{
      const path=String(url);
      if(path==="/api/home/layout") {
        if(init.method==="PUT") {const input=JSON.parse(init.body);window.writes.push(input);window.layout={...window.layout,revision:window.layout.revision+1,app:input.app,web:input.web,...(input.hintDismissedAt?{hintDismissedAt:input.hintDismissedAt}:{}),webCustomizedAt:new Date().toISOString()};}
        return Response.json({success:true,data:window.layout});
      }
      if(path==="/api/home/guide-progress") return Response.json({success:true,data:{kind:"progress",completed:0,confirmedContacts:0,nextStep:"contacts",steps:{contacts:false,goal:false,plan:false}}});
      if(path==="/api/todo/page") return Response.json({success:true,data:{date:"2026-10-20",timeZone:"Asia/Tokyo",asOf:"2026-10-20T00:00:00Z",counts:{decisions:0,nextMoves:0,followups:0,overdue:0},countsCapped:{decisions:false,nextMoves:false},decisions:{items:[],next:{}},nextMoves:{items:[],next:{}},followups:{items:[],next:{}},sources:{task:"ok"}}});
      if(path==="/api/schedule-items") return Response.json({success:true,data:{scheduleItems:[]}});
      if(path==="/api/inbox/secretary/preview") return Response.json({success:false},{status:503});
      return Response.json({success:false},{status:503});
    };
  </script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.locator("[data-widget=secretary]").waitFor();
  return page;
}

test("opening Edit keeps the first five card boxes; actual edit saves order, size, removal and library add", async t => {
  const page = await home(t);
  const boxes = async () => page.locator("[data-widget]").evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect(); return [node.getAttribute("data-widget"), Math.round(box.x), Math.round(box.width), Math.round(box.y)];
  }));
  const first = await boxes();
  await page.locator("[data-header]").getByRole("button", { name: "編集" }).click();
  assert.deepEqual(await boxes(), first, "entering Edit alone must not move a card");
  await page.getByRole("button", { name: "今日やること 下へ" }).click();
  await page.getByRole("button", { name: "今日やること サイズを変更" }).click();
  await page.getByRole("button", { name: "次のイベント 外す" }).click();
  assert.equal(await page.locator("[data-widget=nextEvent]").count(), 0);
  await page.getByRole("button", { name: "元に戻す" }).click();
  assert.equal(await page.locator("[data-widget=nextEvent]").count(), 1);
  await page.getByRole("searchbox", { name: "ウィジェットを検索" }).fill("メモ");
  await page.locator("[data-rail]").getByRole("button", { name: "+ 小" }).click();
  assert.equal(await page.locator("[data-widget=memo]").count(), 1);
  await page.locator("main").getByRole("button", { name: "完了" }).click();
  await page.waitForFunction(() => (window as any).writes.length === 1);
  const saved = await page.evaluate(() => (window as any).layout);
  assert.equal(saved.web[0].key, "planScore");
  assert.equal(saved.web.find((slot: { key: string }) => slot.key === "today").size, "s");
  assert.equal(saved.web.filter((slot: { key: string }) => slot.key === "memo").length, 1);
  assert.deepEqual(await page.locator("[data-widget]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-widget"))), saved.web.map((slot: { key: string }) => slot.key));
});

test("incomplete three-step guide belongs inside the Today card", async t => {
  const page = await home(t);
  await page.locator("[data-widget=today]").getByText("はじめの3ステップ").waitFor();
  assert.equal(await page.locator("[data-widget=today]").getByRole("link", { name: /名刺を3枚追加/ }).count(), 1);
  assert.equal(await page.locator("[data-widget=today] [data-question]").count(), 1, "a question remains available beside the empty guide");
  assert.equal(await page.locator("main > section").filter({ hasText: "はじめの3ステップ" }).count(), 0);
});
