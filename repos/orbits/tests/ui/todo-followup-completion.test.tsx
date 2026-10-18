import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";
import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";

let browser: Browser;
let code: { js: string; css: string };
test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { SessionContext } from "next-auth/react";
    import { TodoWorkspace } from "./app/(app)/app/orbit-2026/todo/TodoWorkspace";
    import { demoTodoPage } from "./shared/mock/demo-world/todo";
    import { applyRelationshipTaskCompletion } from "./features/connections/lifecycle/transition";
    const at = "2026-10-18T00:00:00.000Z";
    const first = { actorId: "a", connectionId: "c", contactId: "contact", taskId: "first", title: "First remains open", status: "open", purpose: "follow_up", dueAt: at, version: 1, createdAt: at, updatedAt: at };
    window.followup = { calls: [], failNote: false, failComplete: false, wrongMapping: false, holdResolver: false, resolverWaiting: false, account: "a", plainOpen: true,
      snapshot: { connection: { actorId: "a", connectionId: "c", contactId: "contact", stage: "needs_follow_up", activeGoal: null, version: 1, createdAt: at, updatedAt: at }, tasks: [first, { ...first, taskId: "second", title: "Selected second follow-up" }] } };
    const state = window.followup;
    window.fetch = async (url, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : null;
      state.calls.push({ url, method: init.method || "GET", body, key: new Headers(init.headers).get("idempotency-key") });
      if (state.account !== "a") return Response.json({ success: false }, { status: 401 });
      if (url.startsWith("/api/todo/page")) {
        const rows = state.snapshot.tasks.filter(task => task.status === "open");
        const plain = state.plainOpen ? [{ key: "task:plain", kind: "task", source: "task", sourceId: "plain", createdAt: at, status: "open", taskId: "plain", titlePreview: "Plain task", dueAt: at, overdue: true }] : [];
        return Response.json({ success: true, data: { ...demoTodoPage, date: "2026-10-18", timeZone: "UTC", counts: { ...demoTodoPage.counts, followups: rows.length + plain.length, overdue: rows.length + plain.length },
          followups: { next: {}, items: [...plain, ...rows.map(task => ({ key: "relationship_task:"+task.taskId, kind: "lifecycle", source: "relationship_task", sourceId: task.taskId, createdAt: at, status: "open", taskId: task.taskId, contactId: "contact", titlePreview: task.title, dueAt: at, overdue: true }))] } } });
      }
      if (url === "/api/tasks/plain" && init.method === "PATCH") {
        if (body.action !== "complete") throw Error("Unexpected task action");
        state.plainOpen = false;
        return Response.json({ success: true, data: { task: { id: "plain", title: "Plain task", status: "completed", category: "relationship", priority: "normal", updatedAt: at } } });
      }
      if (url.endsWith("/resolve")) {
        if (state.holdResolver) { state.resolverWaiting = true; await new Promise(resolve => { state.releaseResolver = resolve; }); }
        return Response.json({ success: true, data: { taskId: state.wrongMapping ? "first" : "second", connectionId: "c", contactId: "contact" } });
      }
      if (url === "/api/encounters") return state.failNote ? Response.json({ success: false }, { status: 503 }) : Response.json({ success: true, data: { ...body, encounterId: "encounter:browser" } });
      if (url === "/api/connections/c/lifecycle") {
        if (init.method === "POST") {
          if (state.failComplete) return Response.json({ success: false }, { status: 409 });
          const plan = applyRelationshipTaskCompletion({ command: { ...body, actorId: "a", connectionId: "c" }, current: state.snapshot.connection, tasks: state.snapshot.tasks, now: at });
          const changed = new Map([...plan.upsertTasks, ...plan.dismissTasks].map(task => [task.taskId, task]));
          state.snapshot = { connection: plan.connection, tasks: [...state.snapshot.tasks.map(task => changed.get(task.taskId) || task), ...plan.upsertTasks.filter(task => !state.snapshot.tasks.some(old => old.taskId === task.taskId))] };
          return Response.json({ success: true, data: { snapshot: state.snapshot, replayed: false } });
        }
        return Response.json({ success: true, data: { snapshot: state.snapshot } });
      }
      throw Error("Unexpected functional fixture request: "+url);
    };
    function Root() {
      const [account, setAccount] = React.useState("a");
      state.changeAccount = value => { state.account = value; setAccount(value); };
      return <SessionContext.Provider value={{ status: "authenticated", data: { user: { id: account }, expires: "2099-01-01" }, update: async () => null }}><TodoWorkspace actorId={account} language="ja" timeZone="UTC" date="2026-10-18" /></SessionContext.Provider>;
    }
    createRoot(document.getElementById("root")).render(<Root />);
  `, { "^next-auth/react$": 'import { createContext } from "react"; export const SessionContext = createContext(undefined);' });
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function selectActive(page: Page) {
  await page.getByRole("tab", { name: "推進中へ", exact: true }).click();
  await page.getByRole("textbox", { name: "関係の目標", exact: true }).fill("Discuss plans");
}

test("functional browser fixture provides secure-context UUID generation", async t => {
  const opaque = await open(browser, { js: "void 0;", css: "" });
  const before = await opaque.evaluate(() => ({ origin: location.origin, secure: isSecureContext, uuid: typeof crypto.randomUUID }));
  await opaque.close();
  const page = await open(browser, code, { origin: "https://orbit.fixture.test/" });
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  const context = await page.evaluate(() => ({ origin: location.origin, secure: isSecureContext, uuid: typeof crypto.randomUUID }));
  console.info("browser fixture context diagnostic", JSON.stringify({ before, after: context }));
  assert.deepEqual({ secure: before.secure, uuid: before.uuid }, { secure: false, uuid: "undefined" });
  assert.deepEqual({ secure: context.secure, uuid: context.uuid }, { secure: true, uuid: "function" }, JSON.stringify(context));
});

test("actual Todo row completes the addressed second follow-up, then refreshes without changing the first", async t => {
  const page = await open(browser, code, { origin: "https://orbit.fixture.test/" });
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  await page.getByRole("checkbox", { name: "Selected second follow-upを完了" }).click();
  await selectActive(page);
  await page.getByRole("button", { name: "完了して次へ", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("button", { name: /First remains open/ }).waitFor();
  const state = await page.evaluate(() => ({ calls: (window as any).followup.calls, snapshot: (window as any).followup.snapshot }));
  assert.equal(state.snapshot.tasks.find((row: any) => row.taskId === "first").status, "open");
  assert.equal(state.snapshot.tasks.find((row: any) => row.taskId === "second").status, "completed");
  assert.deepEqual(state.calls.filter((row: any) => row.method === "POST").map((row: any) => row.body.taskId), ["second"]);
  assert.equal(state.calls.filter((row: any) => row.url.startsWith("/api/todo/page")).length, 2);
});

test("plain follow-up checkbox completes its task and refreshes without opening the lifecycle dialog", async t => {
  const page = await open(browser, code, { origin: "https://orbit.fixture.test/" });
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  await page.getByRole("checkbox", { name: "Plain taskを完了" }).click();
  await page.getByRole("checkbox", { name: "Plain taskを完了" }).waitFor({ state: "detached" });
  assert.equal(await page.getByRole("dialog").count(), 0);
  const state = await page.evaluate(() => ({ calls: (window as any).followup.calls, plainOpen: (window as any).followup.plainOpen }));
  assert.equal(state.plainOpen, false);
  assert.deepEqual(state.calls.filter((row: any) => row.method === "PATCH").map((row: any) => [row.url, row.body.action]), [["/api/tasks/plain", "complete"]]);
  assert.equal(state.calls.filter((row: any) => row.url.startsWith("/api/todo/page")).length, 2);
});

test("browser note failure retains input and retry key; saved note remains after separate completion conflict", async t => {
  const page = await open(browser, code, { origin: "https://orbit.fixture.test/" });
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  await page.evaluate(() => { (window as any).followup.failNote = true; (window as any).followup.failComplete = true; });
  await page.getByRole("button", { name: /Selected second follow-up/ }).click();
  await page.getByRole("button", { name: "メール", exact: true }).click();
  const note = page.getByRole("textbox", { name: "ひとこと（任意）", exact: true });
  await note.fill("Keep this private note");
  assert.equal(await page.getByRole("button", { name: "完了して次へ", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "メモを保存", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await note.inputValue(), "Keep this private note");
  await page.evaluate(() => { (window as any).followup.failNote = false; });
  await page.getByRole("button", { name: "メモを保存", exact: true }).click();
  await page.getByText("メモは別に保存済みです", { exact: true }).waitFor();
  await selectActive(page);
  await page.getByRole("button", { name: "完了して次へ", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await note.inputValue(), "Keep this private note");
  const notes = await page.evaluate(() => (window as any).followup.calls.filter((row: any) => row.url === "/api/encounters"));
  assert.equal(notes.length, 2); assert.equal(notes[0].key, notes[1].key);
  await page.evaluate(() => { (window as any).followup.failComplete = false; });
  await page.getByRole("button", { name: "完了して次へ", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => (window as any).followup.calls.filter((row: any) => row.url === "/api/encounters").length), 2);
});

test("browser rejects mismatched resolver before reading another lifecycle", async t => {
  const page = await open(browser, code, { origin: "https://orbit.fixture.test/" });
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  await page.evaluate(() => { (window as any).followup.wrongMapping = true; });
  await page.getByRole("button", { name: /Selected second follow-up/ }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("button", { name: "完了して次へ", exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => (window as any).followup.calls.filter((row: any) => row.url.includes("/lifecycle")).length), 0);
});

test("browser account change revokes a delayed resolver and old private modal", async t => {
  const page = await open(browser, code, { origin: "https://orbit.fixture.test/" });
  t.after(async () => { assert.deepEqual(errorsOf(page), []); await page.close(); });
  await page.evaluate(() => { (window as any).followup.holdResolver = true; });
  await page.getByRole("button", { name: /Selected second follow-up/ }).click();
  await page.waitForFunction(() => (window as any).followup.resolverWaiting);
  await page.evaluate(() => { (window as any).followup.changeAccount("b"); });
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.evaluate(() => { (window as any).followup.releaseResolver(); });
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByText("Selected second follow-up", { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => (window as any).followup.calls.filter((row: any) => row.url.includes("/lifecycle")).length), 0);
});
