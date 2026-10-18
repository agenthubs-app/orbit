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
  let failPageReads = false;
  let failDetailReads = false;
  const calls: Array<{ path: string; method: string }> = [];
  const fetcher = async (input: string, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? "GET";
    calls.push({ path, method });
    if (path.startsWith("/api/tasks/page?")) {
      if (failPageReads) return Response.json({ success: false, error: { code: "UNAVAILABLE", message: "Read unavailable" } }, { status: 503 });
      const query = new URL(path, "https://orbit.test").searchParams;
      const status = query.get("status"), scope = query.get("scope"), search = query.get("query") ?? "";
      const matching = tasks.filter(item => item.status === status && item.title.includes(search) && (scope === "all" || (scope === "relationship") === (item.category === "relationship")));
      return Response.json({ success: true, data: { actorId: "a", status, scope, query: search, items: matching.map(card),
        counts: { open: matching.length, completed: status === "completed" ? matching.length : 0 }, total: matching.length,
        hasMore: false, nextCursor: null, asOf: at } });
    }
    const id = decodeURIComponent(path.slice("/api/tasks/".length));
    if (method === "GET" && failDetailReads) return Response.json({ success: false, error: { code: "UNAVAILABLE", message: "Detail unavailable" } }, { status: 503 });
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
  return { fetcher, calls, failPageReads: () => { failPageReads = true; }, failDetailReads: () => { failDetailReads = true; } };
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

test("a local-day change starts a fresh open page without discarding its scope", async t => {
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const path = String(input);
    paths.push(path);
    const params = new URL(path, "https://orbit.test").searchParams;
    const status = params.get("status") as "open" | "completed";
    const item = task("今日の資料", status);
    return Response.json({ success: true, data: {
      actorId: "a", status, scope: params.get("scope"), query: params.get("query") ?? "",
      items: [card(item)], counts: { open: 1, completed: 1 }, total: 1,
      hasMore: status === "open" && !params.has("cursor"),
      nextCursor: status === "open" && !params.has("cursor") ? "signed-next" : null, asOf: at,
    } });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => buttons(root!, "つながり")[0]!.props.onClick());
  await act(async () => buttons(root!, "次のページ")[0]!.props.onClick());
  assert.ok(paths.some(path => path.includes("status=open") && path.includes("cursor=signed-next")));
  await act(async () => { root!.update(<TaskListWorkspace language="ja" date="2026-10-18" timeZone="Asia/Tokyo" />); });
  const latest = paths.filter(path => path.includes("status=open")).at(-1)!;
  assert.match(latest, /scope=relationship/u);
  assert.match(latest, /today=2026-10-18/u);
  assert.doesNotMatch(latest, /cursor=/u);
  await act(async () => buttons(root!, "次のページ")[0]!.props.onClick());
  await act(async () => { root!.update(<TaskListWorkspace language="ja" date="2026-10-18" timeZone="UTC" />); });
  const afterZoneChange = paths.filter(path => path.includes("status=open")).at(-1)!;
  assert.match(afterZoneChange, /timeZone=UTC/u);
  assert.doesNotMatch(afterZoneChange, /cursor=/u);
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

test("legacy task detail identity reads the selected task even when its row is outside the open page", async t => {
  const { fetcher, calls } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" initialSelectedId="済んだ用事" />); });
  t.after(() => act(() => root.unmount()));
  assert.match(content(root!), /済んだ用事/);
  assert.ok(calls.some(call => call.path.endsWith(`/api/tasks/${encodeURIComponent("済んだ用事")}`)));
  assert.equal(calls.filter(call => call.method !== "GET").length, 0);
});

test("a second legacy task link replaces the selected detail without retaining the first identity", async t => {
  const { fetcher } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" initialSelectedId="今日の資料" />); });
  t.after(() => act(() => root.unmount()));
  assert.equal(nodeText(root!.root.findByType("h3")), "今日の資料");
  await act(async () => { root!.update(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" initialSelectedId="済んだ用事" />); });
  assert.equal(nodeText(root!.root.findByType("h3")), "済んだ用事");
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

test("failed refresh after completion does not offer actions for an unverified stale task", async t => {
  const { fetcher, calls, failPageReads } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => act(() => root.unmount()));
  failPageReads();
  await act(async () => buttons(root!, "今日の資料を完了")[0]!.props.onClick());
  assert.match(content(root!), /タスクを読み込めませんでした/u);
  assert.equal(buttons(root!, "今日の資料を完了").length, 0);
  assert.equal(buttons(root!, "今日の資料の詳細").length, 0);
  assert.equal(calls.filter(call => call.method === "PATCH").length, 1);
});

test("failed completed-page refresh after reopening hides stale completed controls", async t => {
  const { fetcher, calls, failPageReads } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" initialCompleted />); });
  t.after(() => act(() => root.unmount()));
  failPageReads();
  await act(async () => buttons(root!, "済んだ用事を戻す")[0]!.props.onClick());
  assert.match(content(root!), /タスクを読み込めませんでした/u);
  assert.equal(buttons(root!, "済んだ用事を戻す").length, 0);
  assert.equal(buttons(root!, "済んだ用事の詳細").length, 0);
  assert.equal(calls.filter(call => call.method === "PATCH").length, 1);
});

test("failed detail refresh does not keep stale detail actions beside the retry card", async t => {
  const { fetcher, calls, failDetailReads } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => buttons(root!, "今日の資料の詳細")[0]!.props.onClick());
  assert.equal(buttons(root!, "タスクを削除").length, 1);
  failDetailReads();
  await act(async () => buttons(root!, "今日の資料を完了")[0]!.props.onClick());
  assert.match(content(root!), /タスクを読み込めませんでした/u);
  assert.equal(buttons(root!, "タスクを削除").length, 0);
  assert.equal(root!.root.findAllByType("h3").some(node => nodeText(node) === "今日の資料"), false);
  assert.equal(calls.filter(call => call.method === "PATCH").length, 1);
});

test("task-list global add entry stays hidden and uses the designed button while opening the add form", async t => {
  const restore = setupDocument();
  const { fetcher } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  const trigger = root!.root.findAllByType("button").find(node => node.props["data-task-add"] === "")!;
  assert.match(trigger.props.className ?? "", /\bbtn\b/u);
  assert.equal(trigger.props.hidden, true);
  assert.equal(trigger.props.style?.display, "none");
  await act(async () => trigger.props.onClick());
  assert.equal(root!.root.findAllByType("form").length, 1);
});
