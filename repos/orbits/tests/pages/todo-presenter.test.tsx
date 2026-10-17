import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { TodoPresenter } from "../../app/(app)/app/orbit-2026/todo/TodoPresenter";
import { todoPageView } from "../../app/(app)/app/orbit-2026/todo/todo-view-model";
import { demoTodoPage } from "../../shared/mock/demo-world/todo";

const noop = () => undefined;
const props = { onRetry: noop, onDecision: noop, onDraft: noop, onMore: noop };
const text = (root: ReactTestRenderer) => JSON.stringify(root.toJSON());
const contents = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : contents(child)).join("");

test("To-do presenter renders its three independent blocks and browsing callbacks without fetching", async t => {
  const selected: string[] = [];
  let root: ReactTestRenderer;
  const page = { ...demoTodoPage, nextMoves: { ...demoTodoPage.nextMoves, items: demoTodoPage.nextMoves.items.map(item => ({ ...item, sample: undefined })) } };
  await act(async () => { root = create(<TodoPresenter {...props} state="ready" view={todoPageView(page)} onDraft={key => selected.push(key)} onMore={section => selected.push(section)} />); });
  t.after(() => act(() => root.unmount()));
  for (const title of ["あなたの判断待ち", "今日の一手", "フォロー"]) assert.ok(text(root!).includes(title));
  assert.ok(text(root!).includes("山本 彩さんに資料を再送"));
  assert.ok(text(root!).includes("期限超過"));
  const button = (label: string) => root.root.findAllByType("button").find(item => item.props["aria-label"] === label || contents(item).includes(label))!;
  await act(async () => button("下書きを開く").props.onClick());
  await act(async () => button("すべて").props.onClick());
  assert.deepEqual(selected, ["agent_signal:demo-signal-thanks", "decisions"]);
});

test("manual drafts do not depend on an AI draft route, while sample rows cannot open a private editor", async t => {
  const page = { ...demoTodoPage, nextMoves: { next: {}, items: [{ ...demoTodoPage.nextMoves.items[0], sample: undefined, draftAvailable: false }] } };
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TodoPresenter {...props} state="ready" view={todoPageView(page)} />); });
  t.after(() => act(() => root.unmount()));
  const open = () => root!.root.findAllByType("button").find(node => contents(node) === "下書きを開く")!;
  assert.equal(open().props.disabled, false);
  await act(async () => root.update(<TodoPresenter {...props} state="ready" view={todoPageView({ ...page, nextMoves: { next: {}, items: [{ ...page.nextMoves.items[0]!, sample: true, draftAvailable: true }] } })} />));
  assert.equal(open().props.disabled, true);
});

test("healthy blocks remain visible when one source fails, while missing-source zero is never displayed as empty success", async t => {
  const page = { ...demoTodoPage, counts: { ...demoTodoPage.counts, decisions: 0 }, decisions: { items: [], next: {} }, sources: { ...demoTodoPage.sources, completion_question: "not_implemented" as const, task_suggestion: "unavailable" as const } };
  let retries = 0;
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TodoPresenter {...props} state="ready" view={todoPageView(page)} onRetry={() => { retries++; }} />); });
  t.after(() => act(() => root.unmount()));
  assert.ok(text(root!).includes("今日の一手"));
  assert.ok(text(root!).includes("フォロー"));
  assert.ok(!text(root!).includes("判断待ちはありません"));
  assert.ok(text(root!).includes("件数は確認できた情報のみです。"));
  assert.ok(root!.root.findAllByProps({ role: "alert" }).length > 0);
  const retry = root!.root.findAllByType("button").find(item => contents(item).includes("再試行"))!;
  await act(async () => retry.props.onClick());
  assert.equal(retries, 1);
});

test("whole capability NOT_IMPLEMENTED hides the page; whole failure offers retry rather than zero counts", async t => {
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TodoPresenter {...props} state="not_implemented" view={null} />); });
  t.after(() => act(() => root.unmount()));
  assert.equal(root!.toJSON(), null);
  await act(async () => root.update(<TodoPresenter {...props} state="failed" view={null} />));
  assert.ok(root!.root.findAllByProps({ role: "alert" }).length > 0);
  assert.ok(text(root!).includes("To-do を読み込めませんでした"));
});
