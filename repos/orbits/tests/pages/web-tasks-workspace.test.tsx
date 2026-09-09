import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { TasksWorkspace } from "../../app/(app)/app/tasks/tasks-workspace";
import { TaskDetailWorkspace } from "../../app/(app)/app/tasks/task-detail-workspace";

const fixture = (id = "task:one/two") => ({
  id, accountId: "account:test", ownerUserId: "account:test", title: "准备会面", notes: "带上资料",
  status: "open", category: "work", plannedDate: "2026-09-07", priority: "normal", source: "manual",
  createdAt: "2026-09-07T00:00:00.000Z", updatedAt: "2026-09-07T00:00:00.000Z",
});

function httpFixture() {
  let tasks = [fixture()];
  let failWrite = false;
  let failRefresh = false;
  const calls: Array<{ path: string; method: string; body: any }> = [];
  const fetcher = async (input: string, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, method, body });
    if (method !== "GET" && failWrite) return Response.json({ success: false, error: { code: "CONFLICT" } }, { status: 409 });
    if (method === "GET" && failRefresh) return Response.json({ success: false, error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503 });
    if (path.startsWith("/api/task-suggestions")) return Response.json({ success: true, data: { suggestions: [] } });
    if (path.startsWith("/api/reminders")) return Response.json({ success: true, data: { reminders: [] } });
    if (path.endsWith("/activities")) return Response.json({ success: true, data: { activities: [{ id: "history:1", type: "created", occurredAt: "2026-09-07T00:00:00Z" }] } });
    if (path === "/api/tasks" && method === "POST") {
      const task = { ...fixture("task:new"), title: body.title, notes: "" };
      tasks.push(task);
      return Response.json({ success: true, data: { task } });
    }
    if (path.startsWith("/api/tasks?")) {
      const status = new URL(path, "https://orbit.test").searchParams.get("status");
      return Response.json({ success: true, data: { tasks: tasks.filter((task) => task.status === status) } });
    }
    const id = decodeURIComponent(path.slice("/api/tasks/".length));
    let task = tasks.find((item) => item.id === id);
    if (!task) return Response.json({ success: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    if (method === "DELETE") {
      tasks = tasks.filter((item) => item.id !== id);
      return Response.json({ success: true, data: { task } });
    }
    if (method === "PATCH") {
      task = { ...task, ...(body.patch ?? {}), status: body.action === "complete" ? "completed" : body.action === "reopen" ? "open" : task.status };
      tasks = tasks.map((item) => item.id === id ? task! : item);
    }
    return Response.json({ success: true, data: { task } });
  };
  return { fetcher, calls, setFailWrite: (value: boolean) => { failWrite = value; }, setFailRefresh: (value: boolean) => { failRefresh = value; } };
}

function text(root: ReactTestRenderer) { return JSON.stringify(root.toJSON()); }
function byLabel(root: ReactTestRenderer, label: string) { return root.root.findByProps({ "aria-label": label }); }
async function mount(t: any, fixture: ReturnType<typeof httpFixture>, element: React.ReactElement) {
  t.mock.method(globalThis, "fetch", fixture.fetcher);
  let root: ReactTestRenderer;
  await act(async () => { root = create(element); });
  t.after(() => { act(() => root.unmount()); });
  return root!;
}

test("list uses real record detail links and completion moves records between filters", async (t) => {
  const fixture = httpFixture();
  const root = await mount(t, fixture, <TasksWorkspace />);
  assert.ok(root.root.findByProps({ href: "/app/tasks/task%3Aone%2Ftwo" }));
  await act(async () => { byLabel(root, "完成：准备会面").props.onChange(); });
  assert.doesNotMatch(text(root), /带上资料/);
  await act(async () => { byLabel(root, "查看已完成待办").props.onClick(); });
  assert.ok(byLabel(root, "恢复：准备会面"));
  await act(async () => { byLabel(root, "恢复：准备会面").props.onChange(); });
  assert.doesNotMatch(text(root), /恢复：准备会面/);
});

test("failed creation retains the draft and successful retry clears it without duplicate writes", async (t) => {
  const fixture = httpFixture();
  const root = await mount(t, fixture, <TasksWorkspace />);
  act(() => byLabel(root, "添加待办").props.onChange({ target: { value: "写会面总结" } }));
  fixture.setFailWrite(true);
  await act(async () => { await byLabel(root, "新增待办表单").props.onSubmit({ preventDefault() {} }); });
  assert.equal(byLabel(root, "添加待办").props.value, "写会面总结");
  assert.ok(root.root.findAllByProps({ role: "alert" }).length > 0);
  fixture.setFailWrite(false);
  await act(async () => {
    const form = byLabel(root, "新增待办表单");
    await Promise.all([form.props.onSubmit({ preventDefault() {} }), form.props.onSubmit({ preventDefault() {} })]);
  });
  assert.equal(byLabel(root, "添加待办").props.value, "");
  assert.equal(fixture.calls.filter((call) => call.method === "POST").length, 2);
  assert.ok(root.root.findByProps({ href: "/app/tasks/task%3Anew" }));
});

test("detail save conflict retains the edited fields and does not claim success", async (t) => {
  const fixture = httpFixture();
  const root = await mount(t, fixture, <TaskDetailWorkspace taskId="task:one/two" />);
  act(() => byLabel(root, "待办标题").props.onChange({ target: { value: "改过的标题" } }));
  fixture.setFailWrite(true);
  await act(async () => { await byLabel(root, "编辑待办表单").props.onSubmit({ preventDefault() {} }); });
  assert.equal(byLabel(root, "待办标题").props.value, "改过的标题");
  assert.match(text(root), /待办已在其他页面更新/);
  assert.doesNotMatch(text(root), /已保存修改/);
  fixture.setFailWrite(false);
  await act(async () => { await byLabel(root, "编辑待办表单").props.onSubmit({ preventDefault() {} }); });
  assert.match(text(root), /已保存修改/);
  assert.equal(fixture.calls.find((call) => call.body?.action === "update")?.body.expectedUpdatedAt, "2026-09-07T00:00:00.000Z");
});

test("detail delete requires confirmation and cancellation never sends DELETE", async (t) => {
  const fixture = httpFixture();
  const root = await mount(t, fixture, <TaskDetailWorkspace taskId="task:one/two" />);
  act(() => byLabel(root, "删除待办").props.onClick());
  assert.equal(fixture.calls.filter((call) => call.method === "DELETE").length, 0);
  act(() => byLabel(root, "保留待办").props.onClick());
  assert.equal(fixture.calls.filter((call) => call.method === "DELETE").length, 0);
  act(() => byLabel(root, "删除待办").props.onClick());
  await act(async () => { await byLabel(root, "确认删除待办").props.onClick(); });
  assert.match(text(root), /待办已删除/);
  assert.ok(root.root.findByProps({ href: "/app/tasks" }));
});

test("refresh failure after a successful mutation keeps the success and exposes stale data", async (t) => {
  const fixture = httpFixture();
  const root = await mount(t, fixture, <TaskDetailWorkspace taskId="task:one/two" />);
  fixture.setFailRefresh(true);
  await act(async () => { await byLabel(root, "标记完成").props.onClick(); });
  assert.match(text(root), /已完成待办/);
  assert.match(text(root), /刷新未完成/);
});

test("a missing task shows a recovery link instead of an empty editor", async (t) => {
  const fixture = httpFixture();
  const root = await mount(t, fixture, <TaskDetailWorkspace taskId="missing" />);
  assert.match(text(root), /已删除或无权查看/);
  assert.equal(root.root.findAllByProps({ "aria-label": "待办标题" }).length, 0);
  assert.ok(root.root.findByProps({ href: "/app/tasks" }));
});
