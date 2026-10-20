import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";

import { bundle, errorsOf, launch, open } from "../ui/support/orbit-2026-harness";
import { SHELL_STUBS } from "../ui/support/orbit-2026-shell-harness";

let browser: Browser;
let code: { js: string; css: string };
test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { MemoWorkspace } from "./app/(app)/app/orbit-2026/memo/MemoWorkspace";
    createRoot(document.getElementById("root")).render(<MemoWorkspace language="ja" initialSelectedId={window.memoInitialSelected} />);
  `, SHELL_STUBS);
  browser = await launch();
});

test("memo editor resolves @people and @events into persisted, navigable tokens", async t => {
  const page = await open(browser, code, { html: `<div id="root"></div><script>
    window.shellFixture={path:"/app/tasks",lang:"ja",calls:[]};
    window.memoWrites=[];
    window.memoRows=[{id:"memo:one",title:"会ったこと",body:"会議の後",version:1,noteKind:"meeting",manualContactIds:[],contactIds:[],eventIds:[],mentions:[],updatedAt:"2026-10-19T10:00:00Z"}];
    window.fetch=async (url,init={})=>{
      const path=String(url), method=init.method||"GET";
      if(path==="/api/contacts/search") return Response.json({data:{contacts:[{id:"contact:aki",displayName:"秋山さん"}]}});
      if(path==="/api/contacts/contact%3Aaki") return Response.json({data:{contact:{id:"contact:aki",displayName:"秋山さん"}}});
      if(path==="/api/events") return Response.json({data:{events:[{id:"event:cfo",title:"CFO Night"}]}});
      if(path.startsWith("/api/notes/")&&method==="PATCH"){
        const body=JSON.parse(init.body);window.memoWrites.push(body);
        Object.assign(window.memoRows[0],body,{version:2,contactIds:["contact:aki"],eventIds:["event:cfo"]});
        return Response.json({data:{note:window.memoRows[0]}});
      }
      return Response.json({data:{notes:window.memoRows,total:1}});
    };
  </script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  page.setDefaultTimeout(3000);
  await page.getByText("会議の後").waitFor();
  await page.getByRole("button", { name: "編集" }).click();
  const body = page.getByLabel("本文");
  await body.fill("会議の後 @秋");
  await page.getByRole("button", { name: "@秋山さん" }).click();
  assert.match(await body.inputValue(), /@秋山さん /u);
  await body.fill(`${await body.inputValue()}@CFO`);
  await page.getByRole("button", { name: "@CFO Night" }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForFunction(() => (window as any).memoWrites.length === 1);
  const saved = (await page.evaluate(() => (window as any).memoWrites[0])) as { mentions: { entityType: string; contactId?: string; eventId?: string; displayText: string; start: number; end: number }[]; body: string };
  assert.deepEqual(saved.mentions.map(item => [item.entityType, item.contactId ?? item.eventId]), [["contact", "contact:aki"], ["event", "event:cfo"]]);
  assert.ok(saved.mentions.every(item => saved.body.slice(item.start, item.end) === item.displayText));
  await page.getByRole("link", { name: "@秋山さん" }).waitFor();
  await page.getByRole("link", { name: "@CFO Night" }).waitFor();
});

test("a memo selected by URL opens when it is beyond the first page", async t => {
  const page = await open(browser, code, { html: `<div id="root"></div><script>
    window.shellFixture={path:"/app/tasks",lang:"ja",calls:[]};
    window.memoInitialSelected="memo:older";
    window.memoReads=[];
    const first={id:"memo:first",title:"最近",body:"First",version:1,noteKind:"free",manualContactIds:[],contactIds:[],eventIds:[],mentions:[],updatedAt:"2026-10-19T10:00:00Z"};
    const older={...first,id:"memo:older",title:"以前",body:"Older @退会",contactIds:["contact:deleted"],mentions:[{entityType:"contact",contactId:"contact:deleted",start:6,end:9,displayText:"@退会"}]};
    window.fetch=async (url)=>{
      window.memoReads.push(String(url));
      if(String(url)==="/api/notes/memo%3Aolder")return Response.json({data:{note:older}});
      if(String(url)==="/api/contacts/contact%3Adeleted")return Response.json({}, {status:404});
      return Response.json({data:{notes:[first],total:2,nextCursor:"page:2"}});
    };
  </script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  page.setDefaultTimeout(3000);
  await page.getByText("Older").waitFor({ timeout: 3000 });
  assert.ok((await page.evaluate(() => (window as any).memoReads)).includes("/api/notes/memo%3Aolder"));
  await page.getByText("@退会").waitFor();
  assert.equal(await page.getByRole("link", { name: "@退会" }).count(), 0, "a deleted contact token stays readable without a dead link");
});
test.after(async () => { await browser?.close(); });

test("memo search, kind filter, selection and versioned edit read back through the API", async t => {
  const page = await open(browser, code, { html: `<div id="root"></div><script>
    window.shellFixture={path:"/app/tasks",lang:"ja",calls:[]};
    window.memoWrites=[];
    window.memoRows=[
      {id:"memo:1",title:"面談の要点",body:"Discussed plans",version:1,noteKind:"meeting",manualContactIds:["contact:1"],contactIds:["contact:1"],eventIds:[],mentions:[],updatedAt:"2026-10-19T10:00:00Z"},
      {id:"memo:2",title:"アイデア",body:"A free note",version:1,noteKind:"free",manualContactIds:[],contactIds:[],eventIds:[],mentions:[],updatedAt:"2026-10-18T10:00:00Z"}
    ];
    window.fetch=async (url,init={})=>{
      const method=init.method||"GET";
      if(method==="PATCH") {
        const body=JSON.parse(init.body);window.memoWrites.push(body);
        const row=window.memoRows.find(item=>decodeURIComponent(url).endsWith(item.id));
        if(body.expectedVersion!==row.version)return Response.json({}, {status:409});
        Object.assign(row,body,{version:row.version+1});
        return Response.json({success:true,data:{note:row}});
      }
      const query=new URL(url,"https://example.test").searchParams;
      const rows=window.memoRows.filter(row=>(query.get("noteKind")==="all"||row.noteKind===query.get("noteKind"))&&(!query.get("q")||row.title.includes(query.get("q"))));
      return Response.json({success:true,data:{notes:rows,total:rows.length}});
    };
  </script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.getByText("Discussed plans").waitFor();
  await page.getByRole("button", { name: "アイデア" }).click();
  await page.getByText("A free note").waitFor();
  assert.match(page.url(), /memo=memo%3A2/u);
  await page.getByRole("radio", { name: "面談", exact: true }).click();
  await page.getByText("Discussed plans").waitFor();
  await page.getByRole("button", { name: "編集" }).click();
  await page.getByLabel("本文").fill("Discussed next month");
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForFunction(() => (window as any).memoWrites.length === 1);
  await page.locator("section").filter({ hasText: "Discussed next month" }).first().waitFor();
  assert.equal((await page.evaluate(() => (window as any).memoWrites))[0].expectedVersion, 1);
});

test("a new meeting memo links one person and an event before opting into plan use", async t => {
  const page = await open(browser, code, { html: `<div id="root"></div><script>
    window.shellFixture={path:"/app/tasks",lang:"ja",calls:[]};
    window.memoWrites=[];
    window.memoRows=[];
    window.fetch=async (url,init={})=>{
      const path=String(url), method=init.method||"GET";
      if(path==="/api/contacts/search")return Response.json({data:{contacts:[{id:"contact:aki",displayName:"秋山さん"}]}});
      if(path==="/api/events")return Response.json({data:{events:[{id:"event:cfo",title:"CFO Night"}]}});
      if(path==="/api/notes"&&method==="POST"){
        const body=JSON.parse(init.body);window.memoWrites.push(body);
        const note={...body,id:"memo:new",contactIds:body.manualContactIds,eventIds:body.eventIds,version:1,updatedAt:"2026-10-20T10:00:00Z"};
        window.memoRows=[note];return Response.json({data:{note}});
      }
      return Response.json({data:{notes:window.memoRows,total:window.memoRows.length}});
    };
  </script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  page.setDefaultTimeout(3000);
  await page.getByRole("button", { name: "メモを追加" }).click();
  await page.getByLabel("タイトル").fill("面談メモ");
  await page.getByLabel("本文").fill("来週の予定");
  await page.getByRole("dialog").getByRole("radio", { name: "面談", exact: true }).click();
  await page.getByRole("button", { name: "+ 秋山さん" }).click();
  await page.getByRole("button", { name: "+ CFO Night" }).click();
  await page.getByLabel("プランの話せたに使う").check();
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForFunction(() => (window as any).memoWrites.length === 1);
  const saved = (await page.evaluate(() => (window as any).memoWrites[0])) as { title: string; body: string; noteKind: string; manualContactIds: string[]; eventIds: string[]; mentions: unknown[]; usedForPlan: boolean };
  assert.deepEqual([saved.title, saved.body, saved.noteKind, saved.manualContactIds, saved.eventIds, saved.mentions, saved.usedForPlan],
    ["面談メモ", "来週の予定", "meeting", ["contact:aki"], ["event:cfo"], [], true]);
});

test("a saved memo remains selected when the current filtered page omits it", async t => {
  const page = await open(browser, code, { html: `<div id="root"></div><script>
    window.shellFixture={path:"/app/tasks",lang:"ja",calls:[]};
    const note={id:"memo:new",title:"保存した自由メモ",body:"Saved body",version:1,noteKind:"free",manualContactIds:[],contactIds:[],eventIds:[],mentions:[],updatedAt:"2026-10-20T10:00:00Z"};
    window.fetch=async (url,init={})=>{
      if(String(url)==="/api/notes"&&init.method==="POST")return Response.json({data:{note}});
      if(String(url)==="/api/notes/memo%3Anew")return Response.json({data:{note}});
      return Response.json({data:{notes:[],total:0}});
    };
  </script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  page.setDefaultTimeout(3000);
  await page.getByRole("radio", { name: "面談", exact: true }).click();
  await page.getByRole("button", { name: "メモを追加" }).click();
  await page.getByLabel("タイトル").fill("保存した自由メモ");
  await page.getByLabel("本文").fill("Saved body");
  await page.getByRole("button", { name: "保存" }).click();
  await page.getByText("Saved body").waitFor();
  assert.match(page.url(), /memo=memo%3Anew/u);
});
