import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { TodoWorkspace } from "../../app/(app)/app/orbit-2026/todo/TodoWorkspace";
import { demoTodoPage } from "../../shared/mock/demo-world/todo";
import { SessionContext } from "next-auth/react";
import { TodoDraftDrawer } from "../../app/(app)/app/orbit-2026/todo/TodoDraftDrawer";
import { ShellPage, ShellSlotsProvider, useShellSlots } from "../../app/(app)/app/orbit-2026/shell/slots";
import { MemoryRelationshipLifecycleRepository } from "../../features/connections/lifecycle/memory-repository";
import { createRelationshipLifecycleHandlers } from "../../app/api/connections/[id]/lifecycle/handler";
import { createRelationshipLifecycleService } from "../../features/connections/lifecycle/service";
import { resetLastAnswersForTests } from "../../app/(app)/app/orbit-last-answer";

// The read cache is module state: each test starts without the previous test's remembered page.
test.beforeEach(() => { resetLastAnswersForTests(); });

function RailProbe() { return <aside data-rail-probe="">{useShellSlots().rightRail}</aside>; }

const contents = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : contents(child)).join("");
const button = (root: ReactTestRenderer, label: string) => root.root.findAllByType("button").find(node => node.props["aria-label"] === label || contents(node) === label)!;
const addTrigger = (root: ReactTestRenderer) => root.root.findAllByType("button").find(node => node.props["data-task-add"] === "")!;
const setupDocument = () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  return () => { if (descriptor) Object.defineProperty(globalThis, "document", descriptor); else Reflect.deleteProperty(globalThis, "document"); };
};

test("Task next-move rail reuses the page read and guarded draft, then restores the generic rail", async t => {
  const restore = setupDocument(); let reads = 0;
  t.mock.method(globalThis, "fetch", async (input?: unknown) => { if (String(input).startsWith("/api/ai/conversations/")) return Response.json({ success: true, data: { items: [] } });
    reads++;
    return Response.json({ success: true, data: { ...demoTodoPage, date: "2026-10-18", nextMoves: { ...demoTodoPage.nextMoves, items: demoTodoPage.nextMoves.items.map(item => ({ ...item, sample: undefined, draftAvailable: false })) } } });
  });
  const render = (mounted: boolean) => <ShellSlotsProvider><ShellPage rightRail={<p>Generic rail</p>} />{mounted ? <TodoWorkspace language="ja" timeZone="Asia/Tokyo" date="2026-10-18" /> : null}<RailProbe /></ShellSlotsProvider>;
  let root: ReactTestRenderer;
  await act(async () => { root = create(render(true)); });
  t.after(() => { act(() => root.unmount()); restore(); });
  const rail = () => root!.root.findByProps({ "data-rail-probe": "" });
  assert.ok(contents(rail()).includes("Task から"));
  assert.ok(contents(rail()).includes(demoTodoPage.nextMoves.items[0].titlePreview));
  assert.equal(reads, 1, "the rail must not issue a second aggregate request");
  const draft = rail().findAllByType("button").find(node => contents(node) === "下書きを開く")!;
  await act(async () => draft.props.onClick());
  assert.equal(root!.root.findAllByType("textarea").length, 1);
  await act(async () => root.update(render(false)));
  assert.equal(contents(rail()), "Generic rail");
});

test("To-do global add entry stays hidden and uses the designed button while opening the add form", async t => {
  const restore = setupDocument();
  t.mock.method(globalThis, "fetch", async (input?: unknown) => String(input).startsWith("/api/ai/conversations/") ? Response.json({ success: true, data: { items: [] } }) : Response.json({ success: true, data: { ...demoTodoPage, date: "2026-10-18" } }));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TodoWorkspace language="ja" timeZone="Asia/Tokyo" date="2026-10-18" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  const trigger = addTrigger(root!);
  assert.match(trigger.props.className ?? "", /\bbtn\b/u);
  assert.equal(trigger.props.hidden, true);
  assert.equal(trigger.props.style?.display, "none");
  await act(async () => trigger.props.onClick());
  assert.equal(root!.root.findAllByType("form").length, 1);
});

test("Task rail drops account data while the next account loads and hides whole-page NOT_IMPLEMENTED", async t => {
  let settle!: (response: Response) => void; let first = true;
  t.mock.method(globalThis, "fetch", async (input?: unknown) => String(input).startsWith("/api/ai/conversations/") ? Response.json({ success: true, data: { items: [] } }) : first ? Response.json({ success: true, data: { ...demoTodoPage, date: "2026-10-18" } }) : new Promise<Response>(resolve => { settle = resolve; }));
  const render = (account: string) => <SessionContext.Provider value={{ status: "authenticated", data: { user: { id: account }, expires: "2099-01-01" }, update: async () => null }}><ShellSlotsProvider><ShellPage rightRail={<p>Generic rail</p>} /><TodoWorkspace language="ja" timeZone="Asia/Tokyo" date="2026-10-18" /><RailProbe /></ShellSlotsProvider></SessionContext.Provider>;
  let root: ReactTestRenderer;
  await act(async () => { root = create(render("a")); });
  t.after(() => act(() => root.unmount()));
  const rail = () => root!.root.findByProps({ "data-rail-probe": "" });
  assert.ok(contents(rail()).includes(demoTodoPage.nextMoves.items[0].titlePreview));
  assert.ok(rail().findAllByType("button").filter(node => contents(node) === "下書きを開く").every(node => node.props.disabled));
  first = false;
  await act(async () => root.update(render("b")));
  assert.ok(!contents(rail()).includes(demoTodoPage.nextMoves.items[0].titlePreview));
  await act(async () => settle(Response.json({ success: false, error: { code: "NOT_IMPLEMENTED" } }, { status: 503 })));
  assert.equal(contents(rail()), "");
});

test("Task rail retries failed reads and bounds real source cards to three", async t => {
  let failed = true;
  t.mock.method(globalThis, "fetch", async (input?: unknown) => String(input).startsWith("/api/ai/conversations/") ? Response.json({ success: true, data: { items: [] } }) : failed ? Response.json({ success: false }, { status: 503 }) : Response.json({ success: true, data: { ...demoTodoPage, date: "2026-10-18", counts: { ...demoTodoPage.counts, nextMoves: 5 }, nextMoves: { items: Array.from({ length: 5 }, (_, index) => ({ ...demoTodoPage.nextMoves.items[0], key: `agent_signal:rail-${index}`, sourceId: `rail-${index}`, titlePreview: `Rail move ${index}`, sample: undefined })), next: {} } } }));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<ShellSlotsProvider><TodoWorkspace language="ja" timeZone="Asia/Tokyo" date="2026-10-18" /><RailProbe /></ShellSlotsProvider>); });
  t.after(() => act(() => root.unmount()));
  const rail = () => root!.root.findByProps({ "data-rail-probe": "" });
  assert.ok(contents(rail()).includes("To-do を読み込めませんでした"));
  failed = false;
  // The rail also ends with the ask bar (web.html #14 .assist-in), and each card has 下書きを開く + あとで.
  await act(async () => rail().findAllByType("button").find(node => !contents(node).includes("iOrbit"))!.props.onClick());
  assert.equal(rail().findAllByType("button").filter(node => contents(node) === "下書きを開く").length, 3);
  assert.ok(contents(rail()).includes("Rail move 2"));
  assert.ok(!contents(rail()).includes("Rail move 3"));
});

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
  await act(async () => addTrigger(root).props.onClick());
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
  // The header link reads 「すべて (N)」 (web.html #14 .card-h .more).
  await act(async () => root!.root.findAllByType("button").find(node => contents(node).startsWith("すべて"))!.props.onClick());
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
  await act(async () => addTrigger(root).props.onClick());
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
    return Response.json({ success: true, data: { ...demoTodoPage, date: new URL(url, "https://orbit.test").searchParams.get("date"), nextMoves: { ...demoTodoPage.nextMoves, items: demoTodoPage.nextMoves.items.map(item => ({ ...item, sample: undefined, draftAvailable: false })) } } });
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

test("midnight retains typed text but revokes old callbacks and handoff until the same real item is freshly bound", async t => {
  const restore = setupDocument(); let settle!: (response: Response) => void;
  const page = (date: string) => ({ ...demoTodoPage, date, nextMoves: { ...demoTodoPage.nextMoves, items: demoTodoPage.nextMoves.items.map(item => ({ ...item, sample: undefined, draftAvailable: false })) } });
  t.mock.method(globalThis, "fetch", async (url: string) => new URL(url, "https://orbit.test").searchParams.get("date") === "2026-10-19" ? new Promise<Response>(resolve => { settle = resolve; }) : Response.json({ success: true, data: page("2026-10-18") }));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TodoWorkspace actorId="a" language="ja" timeZone="Asia/Tokyo" date="2026-10-18" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, "下書きを開く").props.onClick());
  await act(async () => root!.root.findByType("textarea").props.onChange({ target: { value: "Keep this text" } }));
  const old = root!.root.findByType(TodoDraftDrawer).props;
  await act(async () => root.update(<TodoWorkspace actorId="a" language="ja" timeZone="Asia/Tokyo" date="2026-10-19" />));
  assert.equal(root!.root.findByType("textarea").props.value, "Keep this text");
  assert.equal(button(root!, "コピー").props.disabled, true);
  await act(async () => old.onChange({ to: "", subject: "old", body: "OLD CALLBACK" }));
  assert.equal(root!.root.findByType("textarea").props.value, "Keep this text");
  await act(async () => settle(Response.json({ success: true, data: page("2026-10-19") })));
  assert.equal(button(root!, "コピー").props.disabled, false);
  await act(async () => old.onClose());
  assert.equal(root!.root.findByType("textarea").props.value, "Keep this text");
});

test("denial or whole-page NOT_IMPLEMENTED erases a private draft instead of reviving it on a later day", async t => {
  for (const response of [() => Response.json({ success: false }, { status: 401 }), () => Response.json({ success: false }, { status: 403 }), () => Response.json({ success: false, error: { code: "NOT_IMPLEMENTED" } }, { status: 503 })]) await t.test("closed source", async sub => {
    const restore = setupDocument(); let closed = false;
    sub.mock.method(globalThis, "fetch", async (url: string) => closed ? response() : Response.json({ success: true, data: { ...demoTodoPage, date: new URL(url, "https://orbit.test").searchParams.get("date"), nextMoves: { ...demoTodoPage.nextMoves, items: demoTodoPage.nextMoves.items.map(item => ({ ...item, sample: undefined, draftAvailable: false })) } } }));
    let root: ReactTestRenderer;
    await act(async () => { root = create(<TodoWorkspace actorId="a" language="ja" timeZone="Asia/Tokyo" date="2026-10-18" />); });
    sub.after(() => { act(() => root.unmount()); restore(); });
    await act(async () => button(root!, "下書きを開く").props.onClick());
    await act(async () => root!.root.findByType("textarea").props.onChange({ target: { value: "Erase on denial" } }));
    closed = true;
    await act(async () => root.update(<TodoWorkspace actorId="a" language="ja" timeZone="Asia/Tokyo" date="2026-10-19" />));
    assert.equal(root!.root.findAllByType("textarea").length, 0);
    closed = false;
    await act(async () => root.update(<TodoWorkspace actorId="a" language="ja" timeZone="Asia/Tokyo" date="2026-10-20" />));
    await act(async () => button(root!, "下書きを開く").props.onClick());
    assert.equal(root!.root.findByType("textarea").props.value, "");
  });
});

test("real Todo lifecycle row resolves its exact task, completes only that task, and refreshes aggregate counts", async t => {
  const restore = setupDocument(), at = "2026-10-18T00:00:00.000Z";
  const connection = { actorId: "a", connectionId: "c", contactId: "contact", stage: "needs_follow_up" as const, activeGoal: null, version: 1, createdAt: at, updatedAt: at };
  const first = { actorId: "a", connectionId: "c", contactId: "contact", taskId: "first", title: "First remains open", status: "open" as const, purpose: "follow_up" as const, dueAt: at, version: 1, createdAt: at, updatedAt: at };
  const second = { ...first, taskId: "second", title: "Selected second follow-up" };
  const repository = new MemoryRelationshipLifecycleRepository({ connections: [connection], contacts: [{ actorId: "a", contactId: "contact" }], tasks: [first, second] });
  const handlers = createRelationshipLifecycleHandlers({ resolveActor: async () => ({ id: "a" }), repository, service: createRelationshipLifecycleService(repository, () => at) });
  let pageReads = 0; const resolved: string[] = [], writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/todo/page")) {
      pageReads++;
      const snapshot = await repository.read("a", "c"), open = snapshot!.tasks.filter(row => row.status === "open");
      return Response.json({ success: true, data: { ...demoTodoPage, date: "2026-10-18", timeZone: "UTC", counts: { ...demoTodoPage.counts, followups: open.length, overdue: open.length }, followups: { next: {}, items: open.map(row => ({ key: `relationship_task:${row.taskId}`, kind: "lifecycle", taskId: row.taskId, source: "relationship_task", sourceId: row.taskId, createdAt: at, status: "open", contactId: "contact", titlePreview: row.title, dueAt: at, overdue: true })) } } });
    }
    if (url.endsWith("/resolve")) { resolved.push(url); return Response.json({ success: true, data: { taskId: "second", connectionId: "c", contactId: "contact" } }); }
    if (init?.method === "POST") writes.push(JSON.parse(String(init.body)).taskId);
    const request = new Request(`https://orbit.local${url}`, init), context = { params: Promise.resolve({ id: "c" }) };
    return init?.method === "POST" ? handlers.POST(request, context) : handlers.GET(request, context);
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<TodoWorkspace actorId="a" language="ja" timeZone="UTC" date="2026-10-18" />); });
  t.after(() => { act(() => root.unmount()); restore(); });
  const row = root!.root.findAllByType("button").find(node => contents(node).includes(second.title));
  assert.ok(row, "Todo host must mount the task-addressed modal from the actual row");
  await act(async () => row.props.onClick());
  assert.equal(resolved[0], "/api/relationship-tasks/second/resolve");
  await act(async () => button(root!, "推進中へ").props.onClick());
  await act(async () => root!.root.findAllByType("input").find(node => node.props["aria-label"] === "関係の目標")!.props.onChange({ target: { value: "Discuss plans" } }));
  await act(async () => button(root!, "完了して次へ").props.onClick());
  assert.deepEqual(writes, ["second"]); assert.equal(pageReads, 2);
  const snapshot = await repository.read("a", "c");
  assert.equal(snapshot?.tasks.find(row => row.taskId === "first")?.status, "open");
  assert.equal(snapshot?.tasks.find(row => row.taskId === "second")?.status, "completed");
  assert.ok(!JSON.stringify(root!.toJSON()).includes(second.title));
  assert.ok(JSON.stringify(root!.toJSON()).includes(first.title));
});
