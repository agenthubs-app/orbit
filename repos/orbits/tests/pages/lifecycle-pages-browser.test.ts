import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

test("real browser navigates bounded followup groups without hydration reads or retaining private rows on failure", async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react"; import {createRoot} from "react-dom/client";
    import {RelationshipLifecycleTasksSection} from "./app/(app)/app/tasks/relationship-lifecycle-tasks-section";
    const next=new URLSearchParams(location.search).has("current");
    const failed=new URLSearchParams(location.search).has("failed");
    window.calls=[];window.fetch=async (...args)=>{window.calls.push(args);throw Error("unexpected fetch")};
    const row=i=>({id:"t"+i,title:"Task "+i,status:"open",contactId:"c",connectionId:"cn",contactName:"Contact",organization:"Org",relationshipStage:"active",operationHref:"/app/contacts/c",updatedAt:"2026-09-25T00:00:00Z"});
    const model={state:failed?"unavailable":"success",sourceLabel:"pages",currentTasks:failed?[]:Array.from({length:30},(_,i)=>row(i+(next?30:0))),historyTasks:[],orphanTasks:[],currentCount:failed?0:10000,historyCount:0,orphanCount:0,pagination:{current:{nextHref:next?null:"/app/tasks?current=signed-cursor",firstHref:next?"/app/tasks":null},history:{nextHref:null,firstHref:null},orphan:{nextHref:null,firstHref:null}}};
    createRoot(document.getElementById("root")).render(<RelationshipLifecycleTasksSection model={model}/>);
  ` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://orbit.test/**", route => route.fulfill({ contentType: "text/html", body: `<div id="root"></div><script>${bundle.outputFiles[0]!.text}</script>` }));
    await page.goto("https://orbit.test/app/tasks");
    await page.getByText("当前跟进（10000）", { exact: true }).waitFor();
    assert.equal(await page.locator(".relationship-lifecycle-task-row").count(), 30);
    assert.equal(await page.evaluate(() => (window as any).calls.length), 0);
    await page.getByRole("link", { name: "下一页", exact: true }).click();
    await page.getByText("Task 30", { exact: true }).waitFor();
    assert.equal(await page.getByText("Task 0", { exact: true }).count(), 0);
    assert.equal(await page.locator(".relationship-lifecycle-task-row").count(), 30);
    await page.getByRole("link", { name: "返回第一页", exact: true }).click();
    await page.getByText("Task 0", { exact: true }).waitFor();
    await page.goto("https://orbit.test/app/tasks?failed=1");
    await page.getByText("人脉跟进暂不可用。", { exact: false }).waitFor();
    assert.equal(await page.locator(".relationship-lifecycle-task-row").count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
