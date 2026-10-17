import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { FollowupCompletionModal } from "../../app/(app)/app/orbit-2026/todo/FollowupCompletionModal";
import { Orbit2026Scope } from "../../app/(app)/app/orbit-2026/ui";
import { MemoryRelationshipLifecycleRepository } from "../../features/connections/lifecycle/memory-repository";
import { createRelationshipLifecycleHandlers } from "../../app/api/connections/[id]/lifecycle/handler";
import { createRelationshipLifecycleService } from "../../features/connections/lifecycle/service";
import { SessionContext } from "next-auth/react";

const at = "2026-10-18T00:00:00.000Z";
const connection = { actorId: "a", connectionId: "c", contactId: "contact", stage: "needs_follow_up" as const, activeGoal: null, version: 1, createdAt: at, updatedAt: at };
const task = { actorId: "a", connectionId: "c", contactId: "contact", taskId: "first", title: "First task stays open", status: "open" as const, purpose: "follow_up" as const, dueAt: at, version: 1, createdAt: at, updatedAt: at };
const second = { ...task, taskId: "second", title: "Selected second follow-up" };
const contents = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : contents(child)).join("");
const button = (root: ReactTestRenderer, label: string) => { const found = root.root.findAllByType("button").find(node => contents(node) === label || node.props["aria-label"] === label); assert.ok(found, `Missing button ${label}`); return found; };
const documentStub = () => { const before = Object.getOwnPropertyDescriptor(globalThis, "document"); Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } }); return () => before ? Object.defineProperty(globalThis, "document", before) : Reflect.deleteProperty(globalThis, "document"); };

function fixture() {
  const repository = new MemoryRelationshipLifecycleRepository({ connections: [connection], contacts: [{ actorId: "a", contactId: "contact" }], tasks: [task, second] });
  const handlers = createRelationshipLifecycleHandlers({ resolveActor: async () => ({ id: "a" }), repository, service: createRelationshipLifecycleService(repository, () => at) });
  const writes: { path: string; body: any; key: string | null }[] = [];
  const controls = { failNote: false, failComplete: false, wrongMapping: false };
  const fetcher: typeof fetch = async (url, init) => {
    if (init?.method === "POST") writes.push({ path: String(url), body: JSON.parse(String(init.body)), key: new Headers(init.headers).get("idempotency-key") });
    if (String(url) === "/api/encounters") return controls.failNote ? Response.json({ success: false }, { status: 503 }) : Response.json({ success: true, data: { ...JSON.parse(String(init?.body)), encounterId: "encounter:one" } });
    if (String(url).endsWith("/resolve")) return Response.json({ success: true, data: { taskId: controls.wrongMapping ? "first" : "second", connectionId: "c", contactId: "contact" } });
    if (init?.method === "POST" && controls.failComplete) return Response.json({ success: false }, { status: 409 });
    const request = new Request(`https://orbit.local${url}`, init), context = { params: Promise.resolve({ id: "c" }) };
    return init?.method === "POST" ? handlers.POST(request, context) : handlers.GET(request, context);
  };
  return { repository, writes, controls, fetcher };
}

test("mounted follow-up modal selects the addressed second task and leaves the first task unchanged", async t => {
  const restore = documentStub(), { repository, fetcher, writes } = fixture(), completed: string[] = [];
  t.mock.method(globalThis, "fetch", fetcher); let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><FollowupCompletionModal open taskId="second" actorId="a" timeZone="UTC" onClose={() => {}} onCompleted={id => completed.push(id)} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  assert.ok(JSON.stringify(root!.toJSON()).includes(second.title));
  await act(async () => button(root!, "推進中へ").props.onClick());
  await act(async () => root!.root.findAllByType("input").find(node => node.props["aria-label"] === "関係の目標")!.props.onChange({ target: { value: "Discuss plans" } }));
  await act(async () => button(root!, "完了して次へ").props.onClick());
  assert.deepEqual(completed, ["second"]); assert.equal(writes.length, 1); assert.equal(writes[0].body.taskId, "second");
  const snapshot = await repository.read("a", "c");
  assert.equal(snapshot?.tasks.find(row => row.taskId === "second")?.status, "completed");
  assert.equal(snapshot?.tasks.find(row => row.taskId === "first")?.status, "open");
});

test("note failure keeps input and retry identity; independently saved note survives completion conflict", async t => {
  const restore = documentStub(), { repository, fetcher, writes, controls } = fixture(), completed: string[] = [];
  controls.failNote = true; controls.failComplete = true;
  t.mock.method(globalThis, "fetch", fetcher); let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><FollowupCompletionModal open taskId="second" actorId="a" timeZone="UTC" onClose={() => {}} onCompleted={id => completed.push(id)} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, "メール").props.onClick());
  const note = () => root!.root.findByType("textarea");
  await act(async () => note().props.onChange({ target: { value: "Keep this private note" } }));
  assert.equal(button(root!, "完了して次へ").props.disabled, true);
  await act(async () => button(root!, "メモを保存").props.onClick());
  assert.equal(note().props.value, "Keep this private note"); assert.deepEqual(completed, []);
  controls.failNote = false;
  await act(async () => button(root!, "メモを保存").props.onClick());
  assert.equal(writes[0].key, writes[1].key); assert.equal(note().props.disabled, true);
  assert.ok(JSON.stringify(root!.toJSON()).includes("メモは別に保存済みです"));
  await act(async () => button(root!, "推進中へ").props.onClick());
  await act(async () => root!.root.findAllByType("input").find(node => node.props["aria-label"] === "関係の目標")!.props.onChange({ target: { value: "Plans" } }));
  await act(async () => button(root!, "完了して次へ").props.onClick());
  assert.deepEqual(completed, []); assert.equal(note().props.value, "Keep this private note");
  assert.equal((await repository.read("a", "c"))?.tasks.find(row => row.taskId === "second")?.status, "open");
  controls.failComplete = false;
  await act(async () => button(root!, "完了して次へ").props.onClick());
  assert.deepEqual(completed, ["second"]);
  assert.equal(writes.filter(row => row.path === "/api/encounters").length, 2);
});

test("mismatched resolver never exposes another task or completion controls", async t => {
  const restore = documentStub(), { fetcher, writes, controls } = fixture(); controls.wrongMapping = true;
  t.mock.method(globalThis, "fetch", fetcher); let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><FollowupCompletionModal open taskId="second" actorId="a" timeZone="UTC" onClose={() => {}} onCompleted={() => { throw Error("MUST_NOT_COMPLETE"); }} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  assert.ok(!JSON.stringify(root!.toJSON()).includes(task.title));
  assert.ok(root!.root.findAllByType("button").every(node => contents(node) !== "完了して次へ"));
  assert.equal(writes.length, 0);
});

for (const kind of ["next_task", "nurture", "archived"] as const) test(`mounted modal preserves native ${kind} outcome`, async t => {
  const restore = documentStub(), { fetcher, repository } = fixture(); t.mock.method(globalThis, "fetch", fetcher); let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><FollowupCompletionModal open taskId="second" actorId="a" timeZone="UTC" onClose={() => {}} onCompleted={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, kind === "next_task" ? "続ける" : kind === "nurture" ? "定期フォロー" : "アーカイブ").props.onClick());
  if (kind === "archived") {
    assert.equal(button(root!, "完了して次へ").props.disabled, true);
    await act(async () => root!.root.findByProps({ role: "checkbox" }).props.onClick());
  }
  assert.equal(button(root!, "完了して次へ").props.disabled, false);
  await act(async () => button(root!, "完了して次へ").props.onClick());
  const snapshot = await repository.read("a", "c");
  assert.equal(snapshot?.tasks.find(row => row.taskId === "second")?.status, "completed");
  assert.equal(snapshot?.connection.stage, kind === "next_task" ? "needs_follow_up" : kind);
  if (kind === "archived") assert.equal(snapshot?.tasks.find(row => row.taskId === "first")?.status, "dismissed");
  else {
    assert.equal(snapshot?.tasks.find(row => row.taskId === "first")?.status, "open");
    assert.equal(snapshot?.tasks.find(row => row.taskId !== "first" && row.taskId !== "second")?.purpose, kind === "nurture" ? "maintenance" : "follow_up");
  }
});

test("decide later closes without completing or writing an encounter", async t => {
  const restore = documentStub(), { fetcher, writes } = fixture(); let closes = 0; t.mock.method(globalThis, "fetch", fetcher); let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><FollowupCompletionModal open taskId="second" actorId="a" timeZone="UTC" onClose={() => { closes++; }} onCompleted={() => { throw Error("MUST_NOT_COMPLETE"); }} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, "あとで決める").props.onClick());
  assert.equal(closes, 1); assert.equal(writes.length, 0);
});

test("late resolver from an old account cannot load its private lifecycle into the new modal", async t => {
  const restore = documentStub(); let settle!: (response: Response) => void, oldSignal: AbortSignal | undefined, calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    calls++; if (calls === 1) { oldSignal = init?.signal as AbortSignal; return new Promise<Response>(resolve => { settle = resolve; }); }
    return Response.json({ success: false }, { status: 401 });
  });
  const render = (account: string) => <SessionContext.Provider value={{ status: "authenticated", data: { user: { id: account }, expires: "2099-01-01" }, update: async () => null }}><Orbit2026Scope language="ja"><FollowupCompletionModal open taskId="second" actorId={account} timeZone="UTC" onClose={() => {}} onCompleted={() => { throw Error("MUST_NOT_COMPLETE"); }} /></Orbit2026Scope></SessionContext.Provider>;
  let root: ReactTestRenderer; await act(async () => { root = create(render("a")); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => root.update(render("b")));
  assert.equal(oldSignal?.aborted, true);
  await act(async () => settle(Response.json({ success: true, data: { taskId: "second", connectionId: "c", contactId: "contact" } })));
  assert.equal(calls, 2); assert.ok(!JSON.stringify(root!.toJSON()).includes(second.title));
});
