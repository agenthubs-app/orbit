import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SessionContext } from "next-auth/react";
import { useTodoPage } from "../../app/(app)/app/orbit-2026/todo/useTodoPage";
import type { TodoPageContract } from "../../shared/contract/todo-page";
import { resetLastAnswersForTests } from "../../app/(app)/app/orbit-last-answer";

// The read cache is module state: each test starts without the previous test's remembered page.
test.beforeEach(() => { resetLastAnswersForTests(); });

const first: TodoPageContract = {
  date: "2026-10-18", timeZone: "Asia/Tokyo", asOf: "2026-10-18T00:00:00Z",
  counts: { decisions: 2, nextMoves: 1, followups: 1, overdue: 1 }, countsCapped: { decisions: false, nextMoves: false },
  decisions: { items: [{ key: "entity_draft:d1", source: "entity_draft", sourceId: "d1", titlePreview: "First", createdAt: "2026-10-18T00:00:00Z", actions: ["open"], conversationId: "c1" }], next: { entity_draft: "signed+/cursor=" } },
  nextMoves: { items: [{ key: "agent_signal:s1", source: "agent_signal", sourceId: "s1", titlePreview: "Next", createdAt: "2026-10-18T00:00:00Z", draftAvailable: true }], next: { agent_signal: "signal-next" } },
  followups: { items: [{ key: "task:t1", source: "task", sourceId: "t1", titlePreview: "Follow", createdAt: "2026-10-18T00:00:00Z", kind: "task", taskId: "t1", status: "open", overdue: true }], next: {} },
  sources: { entity_draft: "ok", agent_signal: "ok", task: "ok", completion_question: "not_implemented" },
};
const response = (data: TodoPageContract) => Response.json({ success: true, data });
let current: ReturnType<typeof useTodoPage>;
function Reader({ date = "2026-10-18", enabled = true }: { date?: string; enabled?: boolean }) {
  current = useTodoPage("Asia/Tokyo", date, enabled);
  return null;
}

test("To-do hook validates its bounded read and hides NOT_IMPLEMENTED instead of inventing an empty page", async t => {
  const calls: string[] = [];
  let unsupported = false;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls.push(url);
    assert.equal(options.cache, "no-store");
    return unsupported ? Response.json({ success: false, error: { code: "NOT_IMPLEMENTED" } }, { status: 503 }) : response(first);
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Reader enabled={false} />); });
  t.after(() => act(() => root.unmount()));
  assert.equal(calls.length, 0);
  await act(async () => root.update(<Reader />));
  assert.equal(calls[0], "/api/todo/page?date=2026-10-18&timeZone=Asia%2FTokyo");
  assert.equal(current.state, "ready");
  assert.equal(current.page?.counts.overdue, 1);
  unsupported = true;
  await act(async () => { await current.refresh(); });
  assert.equal(current.state, "not_implemented");
  assert.equal(current.page, null);
});

test("per-source paging encodes the signed cursor, deduplicates stable keys and preserves the other two blocks", async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(url);
    if (calls.length === 1) return response(first);
    return response({ ...first, decisions: { items: [first.decisions.items[0], { ...first.decisions.items[0], key: "entity_draft:d2", sourceId: "d2", titlePreview: "Second" }], next: {} }, nextMoves: { items: [], next: {} }, followups: { items: [], next: {} } });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Reader />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => { await current.loadMore("decisions", "entity_draft"); });
  const query = new URL(calls[1], "https://orbit.test").searchParams;
  assert.equal(query.get("section"), "decisions");
  assert.equal(query.get("source"), "entity_draft");
  assert.equal(query.get("cursor"), "signed+/cursor=");
  assert.equal(query.get("limit"), "50");
  assert.deepEqual(current.page?.decisions.items.map(item => item.sourceId), ["d1", "d2"]);
  assert.deepEqual(current.page?.decisions.next, {});
  assert.equal(current.page?.nextMoves.items[0]?.sourceId, "s1");
  assert.deepEqual(current.page?.nextMoves.next, { agent_signal: "signal-next" });
  assert.equal(current.page?.followups.items[0]?.taskId, "t1");
  await act(async () => { await current.loadMore("decisions", "entity_draft"); });
  assert.equal(calls.length, 2, "exhausted source cannot refetch the first page");
});

test("failed source pagination remains retryable without losing loaded rows or falsely consuming its cursor", async t => {
  let fail = true;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (!url.includes("cursor=")) return response(first);
    if (fail) return response({ ...first, counts: { ...first.counts, decisions: 0 }, decisions: { items: [], next: {} }, sources: { ...first.sources, entity_draft: "unavailable" } });
    return response({ ...first, decisions: { items: [{ ...first.decisions.items[0], key: "entity_draft:d2", sourceId: "d2" }], next: {} } });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Reader />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => { await current.loadMore("decisions", "entity_draft"); });
  assert.equal(current.page?.decisions.items.length, 1);
  assert.equal(current.page?.counts.decisions, 2);
  assert.equal(current.paging.entity_draft, "failed");
  fail = false;
  await act(async () => { await current.loadMore("decisions", "entity_draft"); });
  assert.equal(current.page?.decisions.items.length, 2);
  assert.equal(current.paging.entity_draft, undefined);
});

test("a slow prior-day response or prior refresh cannot replace the current page", async t => {
  const pending: ((value: Response) => void)[] = [];
  t.mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => pending.push(resolve)));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Reader />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => root.update(<Reader date="2026-10-19" />));
  assert.equal(current.page, null);
  const next = { ...first, date: "2026-10-19" };
  await act(async () => pending[1](response(next)));
  await act(async () => pending[0](response(first)));
  assert.equal(current.page?.date, "2026-10-19");
  let refresh: Promise<void>;
  await act(async () => { refresh = current.refresh(); });
  await act(async () => root.update(<Reader enabled={false} />));
  await act(async () => { pending[2](response(next)); await refresh; });
  assert.equal(current.page, null);
  assert.equal(current.state, "idle");
});

test("malformed and denied reads clear relationship data and expose retry, never a successful zero", async t => {
  let mode = "ok";
  t.mock.method(globalThis, "fetch", async () => mode === "ok" ? response(first) : mode === "malformed" ? Response.json({ success: true, data: {} }) : Response.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 }));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Reader />); });
  t.after(() => act(() => root.unmount()));
  mode = "malformed";
  await act(async () => { await current.refresh(); });
  assert.equal(current.state, "failed");
  assert.equal(current.page, null);
  mode = "ok";
  await act(async () => { await current.refresh(); });
  mode = "denied";
  await act(async () => { await current.loadMore("decisions", "entity_draft"); });
  assert.equal(current.state, "failed");
  assert.equal(current.page, null);
});

test("changing accounts drops the prior account's rows and ignores its slow response", async t => {
  const pending: ((value: Response) => void)[] = [];
  t.mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => pending.push(resolve)));
  const render = (id: string) => <SessionContext.Provider value={{ status: "authenticated", data: { user: { id }, expires: "2099-01-01" }, update: async () => null }}><Reader /></SessionContext.Provider>;
  let root: ReactTestRenderer;
  await act(async () => { root = create(render("account-one")); });
  t.after(() => act(() => root.unmount()));
  await act(async () => root.update(render("account-two")));
  assert.equal(current.page, null);
  await act(async () => pending[1](response({ ...first, decisions: { items: [], next: {} } })));
  await act(async () => pending[0](response(first)));
  assert.equal(current.page?.decisions.items.length, 0);
});

test("a source loads only once concurrently and refresh invalidates in-flight pagination", async t => {
  let calls = 0;
  let finish: (value: Response) => void;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return calls === 2 ? new Promise<Response>(resolve => { finish = resolve; }) : response(first);
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Reader />); });
  t.after(() => act(() => root.unmount()));
  let paging: Promise<void>;
  await act(async () => {
    paging = current.loadMore("decisions", "entity_draft");
    await current.loadMore("decisions", "entity_draft");
  });
  assert.equal(calls, 2);
  assert.equal(current.paging.entity_draft, "loading");
  await act(async () => { await current.refresh(); });
  await act(async () => { finish!(response({ ...first, decisions: { items: [], next: {} } })); await paging; });
  assert.equal(current.page?.decisions.items[0]?.sourceId, "d1");
  assert.deepEqual(current.paging, {});
});
