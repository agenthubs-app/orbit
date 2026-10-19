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
function fixture(options: { initialNotes?: string } = {}) {
  let tasks = [{ ...task("今日の資料"), notes: options.initialNotes ?? "" }, task("山本さんへ返信", "open", "relationship"), task("済んだ用事", "completed")];
  let failPageReads = false;
  let failDetailReads = false;
  let conflictOnce = false;
  const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
  const fetcher = async (input: string, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ path, method, body });
    if (path.startsWith("/api/reminders?")) return Response.json({ success: true, data: { reminders: [] } });
    if (path.endsWith("/activities")) return Response.json({ success: true, data: { activities: [] } });
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
      if (conflictOnce) {
        conflictOnce = false;
        tasks = tasks.map(current => current.id === id ? { ...current, title: "server title", updatedAt: "2026-10-17T00:01:00.000Z" } : current);
        return Response.json({ success: false, error: { code: "CONFLICT" } }, { status: 409 });
      }
      const action = body?.action;
      const patch = body?.patch as { title?: string; notes?: string } | undefined;
      const updated = { ...item, ...(action === "update" ? patch : {}), status: action === "complete" ? "completed" as const : "open" as const, updatedAt: "2026-10-17T00:01:00.000Z" };
      tasks = tasks.map(current => current.id === id ? updated : current);
      return Response.json({ success: true, data: { task: updated } });
    }
    return Response.json({ success: true, data: { task: item } });
  };
  return { fetcher, calls, conflictNext: () => { conflictOnce = true; }, failPageReads: () => { failPageReads = true; }, failDetailReads: () => { failDetailReads = true; } };
}

const nodeText = (node: { children: unknown[] }): string => node.children.map(child => typeof child === "string" ? child : child && typeof child === "object" && "children" in child ? nodeText(child as { children: unknown[] }) : "").join("");
const buttons = (root: ReactTestRenderer, label: string) => root.root.findAllByType("button").filter(button => button.props["aria-label"] === label || nodeText(button) === label);
const content = (root: ReactTestRenderer) => JSON.stringify(root.toJSON());
const setupDocument = () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  return () => { if (descriptor) Object.defineProperty(globalThis, "document", descriptor); else Reflect.deleteProperty(globalThis, "document"); };
};
const restoreDocument = setupDocument();
test.after(restoreDocument);
const setupLocation = (path = "/app/tasks?tab=todo&view=all&foo=keep") => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  let href = new URL(path, "https://orbit.test").href;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { get href() { return href; } },
    history: { replaceState(_state: unknown, _unused: string, next: string) { href = new URL(next, href).href; } },
  } });
  return { current: () => new URL(href), restore: () => { if (descriptor) Object.defineProperty(globalThis, "window", descriptor); else Reflect.deleteProperty(globalThis, "window"); } };
};

test("opening and closing a task uses the detail drawer and changes only the task URL parameter", async t => {
  const location = setupLocation();
  const { fetcher } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => { act(() => root.unmount()); location.restore(); });
  assert.equal(root!.root.findAllByProps({ role: "dialog" }).length, 0);
  await act(async () => buttons(root!, "今日の資料の詳細")[0]!.props.onClick());
  assert.equal(root!.root.findAllByProps({ role: "dialog" }).length, 1);
  assert.deepEqual(Object.fromEntries(location.current().searchParams), { tab: "todo", view: "all", foo: "keep", task: "今日の資料" });
  await act(async () => buttons(root!, "閉じる")[0]!.props.onClick());
  assert.equal(root!.root.findAllByProps({ role: "dialog" }).length, 0);
  assert.deepEqual(Object.fromEntries(location.current().searchParams), { tab: "todo", view: "all", foo: "keep" });
});

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
  assert.equal(root!.root.findAllByProps({ role: "dialog" }).length, 1);
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

test("task drawer edit saves title and notes once against the displayed version", async t => {
  const { fetcher, calls } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => buttons(root!, "今日の資料の詳細")[0]!.props.onClick());
  await act(async () => buttons(root!, "編集する")[0]!.props.onClick());
  const title = root!.root.findAllByType("input").find(node => node.props.value === "今日の資料")!;
  await act(async () => title.props.onChange({ target: { value: "更新した資料" } }));
  await act(async () => root!.root.findByType("textarea").props.onChange({ target: { value: "確認する" } }));
  await act(async () => root!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  const writes = calls.filter(call => call.method === "PATCH" && call.body?.action === "update");
  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.body?.expectedUpdatedAt, at);
  assert.deepEqual(writes[0]!.body?.patch, { title: "更新した資料", notes: "確認する" });
  assert.equal(root!.root.findAllByType("textarea").length, 0);
  assert.match(content(root!), /更新した資料/);
});

test("cancelling task edit discards its draft without a write", async t => {
  const { fetcher, calls } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => buttons(root!, "今日の資料の詳細")[0]!.props.onClick());
  await act(async () => buttons(root!, "編集する")[0]!.props.onClick());
  await act(async () => root!.root.findByType("textarea").props.onChange({ target: { value: "下書き" } }));
  await act(async () => buttons(root!, "キャンセル")[0]!.props.onClick());
  assert.equal(calls.filter(call => call.method !== "GET").length, 0);
  assert.equal(root!.root.findAllByType("textarea").length, 0);
  assert.doesNotMatch(content(root!), /下書き/);
});

test("a conflicting task save preserves the draft but requires reopening edit for a new version", async t => {
  const { fetcher, calls, conflictNext } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => buttons(root!, "今日の資料の詳細")[0]!.props.onClick());
  await act(async () => buttons(root!, "編集する")[0]!.props.onClick());
  const title = root!.root.findAllByType("input").find(node => node.props.value === "今日の資料")!;
  await act(async () => title.props.onChange({ target: { value: "私の下書き" } }));
  conflictNext();
  await act(async () => root!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(root!.root.findAllByType("input").some(node => node.props.value === "私の下書き"), true);
  assert.match(content(root!), /ほかの画面で変更されました/);
  assert.equal(buttons(root!, "保存")[0]!.props.disabled, true);
  assert.equal(calls.filter(call => call.method === "PATCH" && call.body?.action === "update").length, 1);
  assert.ok(calls.filter(call => call.path.endsWith(`/api/tasks/${encodeURIComponent("今日の資料")}`) && call.method === "GET").length >= 2);
  await act(async () => buttons(root!, "キャンセル")[0]!.props.onClick());
  assert.match(content(root!), /server title/);
});

test("clearing existing notes is explained and cannot submit an update", async t => {
  const { fetcher, calls } = fixture({ initialNotes: "元のメモ" });
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => buttons(root!, "今日の資料の詳細")[0]!.props.onClick());
  await act(async () => buttons(root!, "編集する")[0]!.props.onClick());
  await act(async () => root!.root.findByType("textarea").props.onChange({ target: { value: "" } }));
  assert.equal(buttons(root!, "保存")[0]!.props.disabled, true);
  assert.match(content(root!), /メモを空にはできません/);
  await act(async () => root!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(calls.filter(call => call.method === "PATCH" && call.body?.action === "update").length, 0);
});

test("a failed post-conflict detail reload keeps the draft visible with retry", async t => {
  const { fetcher, calls, conflictNext, failDetailReads } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => buttons(root!, "今日の資料の詳細")[0]!.props.onClick());
  await act(async () => buttons(root!, "編集する")[0]!.props.onClick());
  const title = root!.root.findAllByType("input").find(node => node.props.value === "今日の資料")!;
  await act(async () => title.props.onChange({ target: { value: "私の下書き" } }));
  conflictNext();
  failDetailReads();
  await act(async () => root!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(root!.root.findAllByType("input").some(node => node.props.value === "私の下書き"), true);
  assert.match(content(root!), /ほかの画面で変更されました/);
  assert.match(content(root!), /タスクを読み込めませんでした/);
  assert.equal(buttons(root!, "保存")[0]!.props.disabled, true);
  assert.equal(calls.filter(call => call.method === "PATCH" && call.body?.action === "update").length, 1);
});

test("switching selected task discards the old edit draft", async t => {
  const { fetcher } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace language="ja" date="2026-10-17" timeZone="Asia/Tokyo" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => buttons(root!, "今日の資料の詳細")[0]!.props.onClick());
  await act(async () => buttons(root!, "編集する")[0]!.props.onClick());
  await act(async () => root!.root.findByType("textarea").props.onChange({ target: { value: "秘密の下書き" } }));
  await act(async () => buttons(root!, "山本さんへ返信の詳細")[0]!.props.onClick());
  assert.equal(root!.root.findAllByType("textarea").length, 0);
  assert.doesNotMatch(content(root!), /秘密の下書き/);
});

test("changing actors remounts the drawer without retaining an edit draft", async t => {
  const { fetcher } = fixture();
  t.mock.method(globalThis, "fetch", fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TaskListWorkspace actorId="actor-a" language="ja" date="2026-10-17" timeZone="Asia/Tokyo" initialSelectedId="今日の資料" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => buttons(root!, "編集する")[0]!.props.onClick());
  await act(async () => root!.root.findByType("textarea").props.onChange({ target: { value: "前のアカウントの下書き" } }));
  await act(async () => { root!.update(<TaskListWorkspace actorId="actor-b" language="ja" date="2026-10-17" timeZone="Asia/Tokyo" initialSelectedId="今日の資料" />); });
  assert.equal(root!.root.findAllByType("textarea").length, 0);
  assert.doesNotMatch(content(root!), /前のアカウントの下書き/);
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
