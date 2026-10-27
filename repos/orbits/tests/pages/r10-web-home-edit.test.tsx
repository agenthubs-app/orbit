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
    window.todoDecisions=[];
    window.todoMoves=[];
    window.todoReads=0;
    window.fetch=async (url,init={})=>{
      const path=String(url);
      if(path==="/api/home/layout") {
        if(init.method==="PUT") {const input=JSON.parse(init.body);window.writes.push(input);window.layout={...window.layout,revision:window.layout.revision+1,app:input.app,web:input.web,...(input.hintDismissedAt?{hintDismissedAt:input.hintDismissedAt}:{}),webCustomizedAt:new Date().toISOString()};}
        return Response.json({success:true,data:window.layout});
      }
      if(path==="/api/home/guide-progress") return Response.json({success:true,data:{kind:"progress",completed:0,confirmedContacts:0,nextStep:"contacts",steps:{contacts:false,goal:false,plan:false}}});
      // LF17: Home sends the browser's date and time zone.
      if(path.startsWith("/api/todo/page?date=")) { window.todoReads++; return Response.json({success:true,data:{date:"2026-10-20",timeZone:"Asia/Tokyo",asOf:"2026-10-20T00:00:00Z",counts:{decisions:window.todoDecisions.length,nextMoves:window.todoMoves.length,followups:0,overdue:0},countsCapped:{decisions:false,nextMoves:false},decisions:{items:window.todoDecisions,next:{}},nextMoves:{items:window.todoMoves,next:{}},followups:{items:[],next:{}},sources:{task:"ok"}}}); }
      if(path==="/api/schedule-items") return Response.json({success:true,data:{scheduleItems:[]}});
      if(path==="/api/ai/conversations/sessions?limit=3") return Response.json({success:true,data:{items:[{id:"session:one",title:"資本政策の相談"},{id:"",title:"無効"},{id:"session:empty",title:""}]}});
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
  await page.getByRole("button", { name: "今日やること 下へ" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "今日やること サイズを変更" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitemradio", { name: /小/ }).click();
  await page.getByRole("button", { name: "次のイベント 外す" }).click();
  assert.equal(await page.locator("[data-widget=nextEvent]").count(), 0);
  await page.getByRole("button", { name: "元に戻す" }).click();
  assert.equal(await page.locator("[data-widget=nextEvent]").count(), 1);
  await page.locator("[data-rail]").getByRole("button", { name: "メモ 小" }).click();
  assert.equal(await page.locator("[data-widget=memo]").count(), 1);
  await page.locator("main").getByRole("button", { name: "完了" }).click();
  await page.waitForFunction(() => (window as any).writes.length === 1);
  const saved = await page.evaluate(() => (window as any).layout);
  assert.equal(saved.web[0].key, "planScore");
  assert.equal(saved.web.find((slot: { key: string }) => slot.key === "today").size, "s");
  assert.equal(saved.web.filter((slot: { key: string }) => slot.key === "memo").length, 1);
  assert.deepEqual(await page.locator("[data-widget]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-widget"))), saved.web.map((slot: { key: string }) => slot.key));
});

test("Edit: a card follows the pointer and the order changes live; the drop is saved and opens no size menu", async t => {
  const page = await home(t);
  await page.locator("[data-header]").getByRole("button", { name: "編集" }).click();
  const order = () => page.locator("[data-widget]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-widget")));
  const centre = async (key: string) => { const box = (await page.locator(`[data-widget=${key}]`).boundingBox())!; return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
  const from = await centre("secretary"), to = await centre("today");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 20 });
  assert.equal((await order())[0], "secretary", "the order changes while the card is still held");
  assert.equal(await page.locator("[data-widget=secretary]").evaluate(node => node.style.transform !== ""), true, "the held card follows the pointer");
  await page.mouse.up();
  assert.equal(await page.getByRole("menu").count(), 0, "a drag is not a click on the card");
  await page.locator("main").getByRole("button", { name: "完了" }).click();
  await page.waitForFunction(() => (window as any).writes.length === 1);
  assert.equal((await page.evaluate(() => (window as any).layout)).web[0].key, "secretary");
});

test("incomplete three-step guide belongs inside the Today card (web.html #0)", async t => {
  const page = await home(t);
  await page.locator("[data-widget=today]").getByText("はじめの 3ステップ").waitFor();
  assert.equal(await page.locator("[data-widget=today]").getByRole("link", { name: /名刺を3枚追加.*0 \/ 3/ }).count(), 1);
  assert.equal(await page.locator("main > section").filter({ hasText: "はじめの 3ステップ" }).count(), 0);
});

test("the daily question is a 「1問」 row that opens To-do, counted in the head (web.html #1)", async t => {
  const page = await home(t);
  await page.evaluate(() => { (window as any).todoDecisions = [{ key: "q:1", source: "completion_question", sourceId: "q1", titlePreview: "石川 陽介さんとは、どこで？", createdAt: "2026-10-20T00:00:00Z", actions: ["open"] }]; window.dispatchEvent(new Event("focus")); });
  const row = page.locator("[data-widget=today]").getByRole("link", { name: /石川 陽介さんとは、どこで？.*ひとつ選ぶだけ.*1問/ });
  await row.waitFor();
  assert.equal(await row.getAttribute("href"), "/app/tasks?tab=todo");
  assert.equal(await page.locator("[data-widget=today] header").getByText("1", { exact: true }).count(), 1);
});

test("Home rail: iOrbit intro with nothing to suggest; 次の一手 cards with recent sessions otherwise (web.html #0 / #2)", async t => {
  const page = await home(t);
  await page.locator("[data-rail]").getByText("はじめまして。").waitFor();
  await page.evaluate(() => { (window as any).todoMoves = [{ key: "m:1", source: "task", sourceId: "t1", titlePreview: "高橋さんへお礼メール", reasonPreview: "昨日の面談 · 下書き済み", draftAvailable: true, taskId: "t1", createdAt: "2026-10-20T00:00:00Z" }]; window.dispatchEvent(new Event("focus")); });
  await page.locator("[data-rail]").getByText("次の一手").waitFor();
  assert.equal(await page.locator("[data-rail]").getByRole("link", { name: "下書きを開く" }).getAttribute("href"), "/app/tasks?tab=todo&task=t1");
  const recent = page.locator("[data-rail]").getByRole("link", { name: "資本政策の相談" });
  assert.equal(await recent.getAttribute("href"), "/app/agent?session=session%3Aone");
  assert.equal(await page.locator("[data-rail]").getByText("無効").count(), 0);
  await page.locator("[data-rail]").getByRole("button", { name: "あとで" }).click();
  await page.locator("[data-rail]").getByText("はじめまして。").waitFor();
});
