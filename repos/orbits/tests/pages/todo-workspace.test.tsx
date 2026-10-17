import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { TodoWorkspace } from "../../app/(app)/app/orbit-2026/todo/TodoWorkspace";
import { demoTodoPage } from "../../shared/mock/demo-world/todo";
import { SessionContext } from "next-auth/react";

const contents = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : contents(child)).join("");
const button = (root: ReactTestRenderer, label: string) => root.root.findAllByType("button").find(node => node.props["aria-label"] === label || contents(node) === label)!;
const setupDocument = () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  return () => { if (descriptor) Object.defineProperty(globalThis, "document", descriptor); else Reflect.deleteProperty(globalThis, "document"); };
};

test("product To-do decisions call the native source, then refresh authoritative rows and counts", async t => {
  let accepted = false;
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      writes.push(url);
      accepted = true;
      return Response.json({ success: true, data: { suggestion: { id: "demo-suggestion-materials", status: "accepted", acceptedTaskId: "new-task" }, task: { id: "new-task" } } });
    }
    return Response.json({ success: true, data: { ...demoTodoPage, date: "2026-10-18", counts: { ...demoTodoPage.counts, decisions: accepted ? 3 : 4 }, decisions: { ...demoTodoPage.decisions, items: demoTodoPage.decisions.items.filter(item => !accepted || item.source !== "task_suggestion").map(item => ({ ...item, sample: undefined })) } } });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TodoWorkspace language="ja" timeZone="Asia/Tokyo" date="2026-10-18" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => button(root, "完了 山本 彩さんに資料を再送").props.onClick());
  assert.deepEqual(writes, ["/api/task-suggestions/demo-suggestion-materials/accept"]);
  assert.ok(!JSON.stringify(root!.toJSON()).includes("山本 彩さんに資料を再送"));
  assert.ok(JSON.stringify(root!.toJSON()).includes("判断を記録しました"));
});

test("Task add opens a real form; failed writes keep its draft and valid retries retain the selected date", async t => {
  const restoreDocument = setupDocument();
  let fail = true;
  const writes: Record<string, string>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    if (init?.method !== "POST") return Response.json({ success: true, data: { ...demoTodoPage, date: "2026-12-31" } });
    const body = JSON.parse(String(init.body));
    writes.push(body);
    if (fail) return Response.json({ success: false, error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503 });
    return Response.json({ success: true, data: { task: { id: "new", title: body.title, plannedDate: body.plannedDate, status: "open", category: "other", priority: "normal", updatedAt: "2026-10-18T00:00:00Z" } } });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TodoWorkspace language="ja" timeZone="Asia/Tokyo" date="2026-12-31" />); });
  t.after(() => { act(() => root.unmount()); restoreDocument(); });
  await act(async () => root.root.findByProps({ "data-task-add": "" }).props.onClick());
  const field = () => root.root.findByType("input");
  await act(async () => field().props.onChange({ target: { value: "Call back" } }));
  await act(async () => root.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(field().props.value, "Call back");
  assert.ok(root!.root.findAllByProps({ role: "alert" }).length > 0);
  fail = false;
  await act(async () => root.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(root!.root.findAllByType("input").length, 0);
  assert.equal(writes[1].plannedDate, "2026-12-31");
  assert.equal(writes[0].idempotencyKey, writes[1].idempotencyKey);
});

test("View all includes every cached source and loads its next page independently", async t => {
  const restoreDocument = setupDocument();
  let paged = false;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("cursor=")) {
      const query = new URL(url, "https://orbit.test").searchParams;
      assert.equal(query.get("section"), "decisions");
      assert.equal(query.get("source"), "contact_draft");
      paged = true;
      return Response.json({ success: true, data: { ...demoTodoPage, date: "2026-10-18", decisions: { items: [{ ...demoTodoPage.decisions.items[3], key: "contact_draft:extra", sourceId: "extra", titlePreview: "Extra contact draft" }], next: {} } } });
    }
    return Response.json({ success: true, data: { ...demoTodoPage, date: "2026-10-18", decisions: { ...demoTodoPage.decisions, next: { contact_draft: "signed" } } } });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TodoWorkspace language="ja" timeZone="Asia/Tokyo" date="2026-10-18" />); });
  t.after(() => { act(() => root.unmount()); restoreDocument(); });
  await act(async () => button(root, "すべて").props.onClick());
  assert.ok(root!.root.findAllByProps({ href: "/app/contacts/new/drafts" }).length > 0);
  await act(async () => button(root, "連絡先の下書き").props.onClick());
  assert.equal(paged, true);
  assert.ok(JSON.stringify(root!.toJSON()).includes("Extra contact draft"));
});

test("local midnight preserves an unsaved task draft, but changing accounts clears it", async t => {
  const restoreDocument = setupDocument();
  t.mock.method(globalThis, "fetch", async (url: string) => Response.json({ success: true, data: { ...demoTodoPage, date: new URL(url, "https://orbit.test").searchParams.get("date") } }));
  const render = (account: string, date: string) => <SessionContext.Provider value={{ status: "authenticated", data: { user: { id: account }, expires: "2099-01-01" }, update: async () => null }}><TodoWorkspace language="ja" timeZone="Asia/Tokyo" date={date} /></SessionContext.Provider>;
  let root: ReactTestRenderer;
  await act(async () => { root = create(render("a", "2026-10-18")); });
  t.after(() => { act(() => root.unmount()); restoreDocument(); });
  await act(async () => root.root.findByProps({ "data-task-add": "" }).props.onClick());
  await act(async () => root.root.findByType("input").props.onChange({ target: { value: "Unsaved task" } }));
  await act(async () => root.update(render("a", "2026-10-19")));
  assert.equal(root!.root.findByType("input").props.value, "Unsaved task");
  await act(async () => root.update(render("b", "2026-10-19")));
  assert.equal(root!.root.findAllByType("input").length, 0);
});

test("a denied mutation clears loaded account data instead of leaving a stale actionable page", async t => {
  let denied = false;
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") denied = true;
    return denied ? Response.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 }) : Response.json({ success: true, data: { ...demoTodoPage, date: "2026-10-18", decisions: { ...demoTodoPage.decisions, items: demoTodoPage.decisions.items.map(item => ({ ...item, sample: undefined })) } } });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TodoWorkspace language="ja" timeZone="Asia/Tokyo" date="2026-10-18" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => button(root, "完了 山本 彩さんに資料を再送").props.onClick());
  assert.ok(!JSON.stringify(root!.toJSON()).includes("山本 彩さんに資料を再送"));
  assert.ok(JSON.stringify(root!.toJSON()).includes("To-do を読み込めませんでした"));
});

test("manual draft opens from next move, survives close/reopen and midnight, and is cleared on account switch", async t => {
  const restoreDocument = setupDocument();
  const writes: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") writes.push(url);
    return Response.json({ success: true, data: { ...demoTodoPage, date: new URL(url, "https://orbit.test").searchParams.get("date") } });
  });
  const render = (account: string, date: string) => <SessionContext.Provider value={{ status: "authenticated", data: { user: { id: account }, expires: "2099-01-01" }, update: async () => null }}><TodoWorkspace language="ja" timeZone="Asia/Tokyo" date={date} /></SessionContext.Provider>;
  let root: ReactTestRenderer;
  await act(async () => { root = create(render("a", "2026-10-18")); });
  t.after(() => { act(() => root.unmount()); restoreDocument(); });
  const open = () => button(root, "下書きを開く");
  assert.equal(open().props.disabled, false);
  await act(async () => open().props.onClick());
  await act(async () => root!.root.findByType("textarea").props.onChange({ target: { value: "手動で書いた本文" } }));
  await act(async () => root!.root.findAllByType("button").find(node => node.props["aria-label"] === "閉じる")!.props.onClick());
  await act(async () => open().props.onClick());
  assert.equal(root!.root.findByType("textarea").props.value, "手動で書いた本文");
  await act(async () => root.update(render("a", "2026-10-19")));
  assert.equal(root!.root.findByType("textarea").props.value, "手動で書いた本文");
  await act(async () => root.update(render("b", "2026-10-19")));
  assert.equal(root!.root.findAllByType("textarea").length, 0);
  await act(async () => open().props.onClick());
  assert.equal(root!.root.findByType("textarea").props.value, "");
  assert.deepEqual(writes, []);
});
