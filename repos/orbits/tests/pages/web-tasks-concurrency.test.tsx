import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { TaskDetailWorkspace } from "../../app/(app)/app/tasks/task-detail-workspace";
import { useTasksResource } from "../../app/(app)/app/tasks/tasks-hooks";

const original = { id: "task:1", title: "原始标题", notes: "原始备注", status: "open", category: "work", priority: "normal", updatedAt: "2026-09-07T00:00:00Z" };
const external = { ...original, title: "App 修改的标题", notes: "App 修改的备注", updatedAt: "2026-09-07T01:00:00Z" };

for (const dirty of [false, true]) test(`refresh ${dirty ? "preserves the draft baseline" : "loads external edits into a clean editor"}`, async (t) => {
  let record = original;
  let write: any;
  t.mock.method(globalThis, "fetch", async (path: string, init?: RequestInit) => {
    if (init?.method === "PATCH") write = JSON.parse(String(init.body));
    const data = path.endsWith("/activities") ? { activities: [] } : path.startsWith("/api/reminders") ? { reminders: [] } : { task: record };
    return Response.json({ success: true, data });
  });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<TaskDetailWorkspace taskId="task:1" />); });
  t.after(() => { act(() => root.unmount()); });
  const field = (label: string) => root.root.findByProps({ "aria-label": label });
  if (dirty) act(() => field("待办标题").props.onChange({ target: { value: "网页草稿" } }));
  record = external;
  await act(async () => { root.root.findAllByType("button").find((button) => button.props.children === "刷新")!.props.onClick(); });
  assert.equal(field("待办标题").props.value, dirty ? "网页草稿" : external.title);
  assert.equal(field("备注").props.value, dirty ? original.notes : external.notes);
  if (dirty) {
    await act(async () => { await field("编辑待办表单").props.onSubmit({ preventDefault() {} }); });
    assert.equal(write.expectedUpdatedAt, original.updatedAt, "refresh must never rebase a dirty draft silently");
  } else {
    act(() => field("待办标题").props.onChange({ target: { value: "后续网页修改" } }));
    await act(async () => { await field("编辑待办表单").props.onSubmit({ preventDefault() {} }); });
    assert.equal(write.patch.notes, external.notes);
    assert.equal(write.expectedUpdatedAt, external.updatedAt);
  }
});

test("a delayed GET cannot overwrite a successful replacement", async (t) => {
  let resource!: ReturnType<typeof useTasksResource<string>>;
  let resolve!: (value: string) => void;
  const reads: Array<() => Promise<string>> = [async () => "initial", () => new Promise((done) => { resolve = done; })];
  function Probe() { resource = useTasksResource(() => reads.shift()!(), "task:1"); return null; }
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<Probe />); });
  t.after(() => { act(() => root.unmount()); });
  await act(async () => resource.refresh());
  act(() => resource.replace("saved"));
  await act(async () => resolve("pre-save snapshot"));
  assert.equal(resource.data, "saved");
  assert.equal(resource.loading, false);
});
