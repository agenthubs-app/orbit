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
    createRoot(document.getElementById("root")).render(<MemoWorkspace language="ja" />);
  `, SHELL_STUBS);
  browser = await launch();
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
