import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { TaskListWorkspace } from "../../app/(app)/app/orbit-2026/todo/TaskListWorkspace";

const at = "2026-10-17T00:00:00.000Z";
const task = (id: string, status: "open" | "completed" = "open", category = "work") => ({
  id, title: id, notes: "", accountId: "a", ownerUserId: "a", status, category, priority: "normal",
  source: "manual", plannedDate: "2026-10-17", createdAt: at, updatedAt: at,
});
const card = (item: ReturnType<typeof task>) => ({
  id: item.id, titlePreview: item.title, locationPreview: null, status: item.status, category: item.category,
  priority: item.priority, plannedDate: item.plannedDate, dueAt: null, updatedAt: item.updatedAt,
  completedAt: item.status === "completed" ? at : null, relatedContact: null, relationship: item.category === "relationship",
});
function fixture() {
  let tasks = [task("今日の資料"), task("山本さんへ返信", "open", "relationship"), task("済んだ用事", "completed")];
  const calls: Array<{ path: string; method: string }> = [];
  const fetcher = async (input: string, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? "GET";
    calls.push({ path, method });
    if (path.startsWith("/api/tasks/page?")) {
      const query = new URL(path, "https://orbit.test").searchParams;
      const status = query.get("status"), scope = query.get("scope"), search = query.get("query") ?? "";
      const matching = tasks.filter(item => item.status === status && item.title.includes(search) && (scope === "all" || (scope === "relationship") === (item.category === "relationship")));
      return Response.json({ success: true, data: { actorId: "a", status, scope, query: search, items: matching.map(card),
        counts: { open: matching.length, completed: status === "completed" ? matching.length : 0 }, total: matching.length,
        hasMore: false, nextCursor: null, asOf: at } });
    }
    const id = decodeURIComponent(path.slice("/api/tasks/".length));
    const item = tasks.find(current => current.id === id);
    if (!item) return Response.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    if (method === "DELETE") {
      tasks = tasks.filter(current => current.id !== id);
      return Response.json({ success: true, data: { task: item } });
    }
    if (method === "PATCH") {
      const action = JSON.parse(String(init?.body)).action;
      const updated = { ...item, status: action === "complete" ? "completed" as const : "open" as const, updatedAt: "2026-10-17T00:01:00.000Z" };
      tasks = tasks.map(current => current.id === id ? updated : current);
      return Response.json({ success: true, data: { task: updated } });
    }
    return Response.json({ success: true, data: { task: item } });
  };
  return { fetcher, calls };
}

const nodeText = (node: { children: unknown[] }): string => node.children.map(child => typeof child === "string" ? child : child && typeof child === "object" && "children" in child ? nodeText(child as { children: unknown[] }) : "").join("");
const buttons = (root: ReactTestRenderer, label: string) => root.root.findAllByType("button").filter(button => button.props["aria-label"] === label || nodeText(button) === label);
const content = (root: ReactTestRenderer) => JSON.stringify(root.toJSON());
const setupDocument = () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  return () => { if (descriptor) Object.defineProperty(globalThis, "document", descriptor); else Reflect.deleteProperty(globalThis, "document"); };
};

test("task list uses exact server scopes and keeps completed tasks behind an explicit disclosure", async t => {
  const { fetcher, calls } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => act(() => root.unmount()));
  assert.match(content(root!), /今日の資料/);
  assert.doesNotMatch(content(root!), /済んだ用事/);
  await act(async () => buttons(root!, "つながり")[0]!.props.onClick());
  assert.match(content(root!), /山本さんへ返信/);
  assert.doesNotMatch(content(root!), /今日の資料/);
  assert.ok(calls.some(call => call.path.includes("scope=relationship")));
  await act(async () => buttons(root!, "個人")[0]!.props.onClick());
  assert.ok(calls.some(call => call.path.includes("scope=personal")));
  await act(async () => buttons(root!, "完了したタスクを表示")[0]!.props.onClick());
  assert.match(content(root!), /済んだ用事/);
});

test("legacy completed intent starts on completed tasks, not the open list", async t => {
  const { fetcher } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" initialCompleted />); });
  t.after(() => act(() => root.unmount()));
  assert.match(content(root!), /済んだ用事/);
  assert.doesNotMatch(content(root!), /今日の資料/);
  await act(async () => buttons(root!, "未完了も表示")[0]!.props.onClick());
  assert.match(content(root!), /今日の資料/);
});

test("arrow keys select adjacent task rows without a write", async t => {
  const { fetcher, calls } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => buttons(root!, "今日の資料の詳細")[0]!.props.onClick());
  await act(async () => buttons(root!, "今日の資料の詳細")[0]!.props.onKeyDown?.({ key: "ArrowDown", preventDefault() {} }));
  assert.equal(buttons(root!, "山本さんへ返信の詳細")[0]!.props["aria-current"], "true");
  await act(async () => buttons(root!, "山本さんへ返信の詳細")[0]!.props.onKeyDown?.({ key: "ArrowUp", preventDefault() {} }));
  assert.equal(buttons(root!, "今日の資料の詳細")[0]!.props["aria-current"], "true");
  assert.equal(calls.filter(call => call.method !== "GET").length, 0);
});

test("task deletion requires confirmation and removes the row only after the server confirms", async t => {
  const restore = setupDocument();
  const { fetcher, calls } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => buttons(root!, "今日の資料の詳細")[0]!.props.onClick());
  await act(async () => buttons(root!, "タスクを削除")[0]!.props.onClick());
  assert.equal(calls.filter(call => call.method === "DELETE").length, 0);
  await act(async () => buttons(root!, "キャンセル")[0]!.props.onClick());
  assert.equal(calls.filter(call => call.method === "DELETE").length, 0);
  await act(async () => buttons(root!, "タスクを削除")[0]!.props.onClick());
  await act(async () => buttons(root!, "削除する")[0]!.props.onClick());
  assert.equal(calls.filter(call => call.method === "DELETE").length, 1);
  assert.doesNotMatch(content(root!), /今日の資料/);
});
