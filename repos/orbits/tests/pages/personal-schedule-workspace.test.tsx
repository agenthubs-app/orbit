import assert from "node:assert/strict";
import test from "node:test";
import { StrictMode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PersonalScheduleWorkspace } from "../../app/(app)/app/tasks/personal-schedule-workspace";
import { PersonalScheduleDateTimePicker } from "../../app/(app)/app/tasks/personal-schedule-date-time-picker";

async function pick(root: ReactTestRenderer, label: string, value: string) {
  await act(async () => root.root.findByProps({ "aria-label": label }).props.onClick());
  await act(async () => root.root.findByType(PersonalScheduleDateTimePicker).props.onConfirm(value));
}

for (const [name, allDay, zone, startsAt, endsAt, expected] of [
  ["Tokyo single day", true, "Asia/Tokyo", "2026-09-16T15:00:00Z", "2026-09-17T15:00:00Z", "2026-09-17 · 全天"],
  ["Tokyo two days", true, "Asia/Tokyo", "2026-09-16T15:00:00Z", "2026-09-18T15:00:00Z", "2026-09-17 · 全天 → 2026-09-18"],
  ["New York spring 23-hour day", true, "America/New_York", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z", "2026-03-08 · 全天"],
  ["New York autumn 25-hour day", true, "America/New_York", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z", "2026-11-01 · 全天"],
  ["timed cross-day seconds", false, "Asia/Tokyo", "2026-09-17T14:45:42Z", "2026-09-17T15:16:12Z", "2026-09-17 · 23:45 → 2026-09-18 00:16"],
  ["missing end", false, "Asia/Tokyo", "2026-09-17T00:00:42Z", undefined, "2026-09-17 · 09:00 → 结束时间未设置"],
] as const) {
  test(`web readonly detail projects saved dates without writes: ${name}`, async t => {
    const item = { id: "personal:dates", sourceId: "personal:dates", accountId: "owner", ownerUserId: "owner", kind: "personal", category: "personal", state: "upcoming", title: "Saved dates", allDay, timeZone: zone, startsAt, ...(endsAt ? { endsAt } : {}), createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };
    const before = structuredClone(item);
    const requests: { path: string; method: string }[] = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
      const path = String(input);
      requests.push({ path, method: init?.method ?? "GET" });
      return Response.json({ success: true, data: path.includes("scope=personal") ? { scheduleItems: [item] } : { scheduleItem: item } });
    });
    let root!: ReactTestRenderer;
    await act(async () => { root = create(<PersonalScheduleWorkspace actorId="owner" />); });
    t.after(() => act(() => root.unmount()));
    await act(async () => root.root.findAllByType("button").find(button => button.findAllByType("strong").some(title => title.children.includes("Saved dates")))!.props.onClick());
    const detail = root.root.findByProps({ "aria-label": "个人日程详情" });
    assert.equal(detail.findAllByType("p")[1]!.children.join(""), expected);
    assert.equal(detail.findAllByType("p")[2]!.children.join(""), zone);
    assert.equal(root.root.findAllByType("input").length, 0);
    assert.equal(requests[0]?.method, "GET");
    const collection = new URL(requests[0]!.path, "https://orbit.test");
    assert.equal(collection.pathname, "/api/schedule-items");
    assert.equal(collection.searchParams.get("scope"), "personal");
    assert.ok(Number.isFinite(Date.parse(collection.searchParams.get("from") ?? "")));
    assert.ok(Number.isFinite(Date.parse(collection.searchParams.get("to") ?? "")));
    assert.deepEqual(requests.slice(1), [{ path: "/api/schedule-items/personal%3Adates", method: "GET" }]);
    assert.deepEqual(item, before);
  });
}

test("personal schedule renders through its HTTP client and aborts requests on unmount", async (t) => {
  const signals: AbortSignal[] = [];
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    await Promise.resolve();
    init?.signal?.throwIfAborted();
    return Response.json({ success: true, data: { scheduleItems: [{
      id: "personal:one", sourceId: "personal:one", accountId: "owner", ownerUserId: "owner",
      kind: "personal", category: "personal", state: "upcoming", title: "个人安排",
      startsAt: "2026-09-17T00:00:00Z", createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z",
    }] } });
  });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<StrictMode><PersonalScheduleWorkspace actorId="owner" /></StrictMode>); });
  t.after(() => { act(() => root.unmount()); });
  assert.match(JSON.stringify(root.toJSON()), /个人安排/);
  assert.equal(root.root.findAllByProps({ role: "alert" }).length, 0);
  assert.ok(signals.some(signal => !signal.aborted));
  act(() => root.unmount());
  assert.ok(signals.every(signal => signal.aborted));
});

test("personal schedule failed refresh never presents retained empty data as a successful empty list", async (t) => {
  let failing = false;
  t.mock.method(globalThis, "fetch", async () => {
    if (failing) throw new Error("network unavailable");
    return Response.json({ success: true, data: { scheduleItems: [] } });
  });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<PersonalScheduleWorkspace actorId="owner" />); });
  t.after(() => { act(() => root.unmount()); });
  assert.match(JSON.stringify(root.toJSON()), /暂无个人日程/);
  const refresh = root.root.findAllByType("button").find(button => button.children.includes("刷新个人日程"))!;
  failing = true;
  await act(async () => { refresh.props.onClick(); });
  assert.equal(root.root.findAllByProps({ role: "alert" }).length, 1);
  assert.doesNotMatch(JSON.stringify(root.toJSON()), /暂无个人日程/);
  failing = false;
  await act(async () => { refresh.props.onClick(); });
  assert.equal(root.root.findAllByProps({ role: "alert" }).length, 0);
  assert.match(JSON.stringify(root.toJSON()), /暂无个人日程/);
});

test("web personal list opens independent readonly detail before entering the editor", async t => {
  const item = { id: "personal:one", sourceId: "personal:one", accountId: "owner", ownerUserId: "owner", kind: "personal", category: "personal", state: "upcoming", title: "Readonly personal", startsAt: "2026-09-17T00:00:00Z", endsAt: "2026-09-17T00:30:00Z", timeZone: "Asia/Tokyo", createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z" };
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async input => { paths.push(String(input)); return Response.json({ success: true, data: String(input).includes("scope=personal") ? { scheduleItems: [item] } : { scheduleItem: item } }); });
  let root!: ReactTestRenderer; await act(async () => { root = create(<PersonalScheduleWorkspace actorId="owner" />); }); t.after(() => act(() => root.unmount()));
  const row = root.root.findAllByType("button").find(button => button.findAllByType("strong").some(title => title.children.includes("Readonly personal")))!;
  await act(async () => row.props.onClick());
  assert.equal(root.root.findAllByType("input").length, 0); assert.ok(paths.includes("/api/schedule-items/personal%3Aone"));
  const edit = root.root.findAllByType("button").find(button => button.children.includes("编辑"))!;
  await act(async () => edit.props.onClick()); assert.ok(root.root.findAllByType("input").length > 0);
});

test("web new personal merged time controls apply a cross-day duration and clear online location", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: true, data: { scheduleItems: [] } }));
  let root!: ReactTestRenderer; await act(async () => { root = create(<PersonalScheduleWorkspace actorId="owner" />); }); t.after(() => act(() => root.unmount()));
  const button = (label: string) => root.root.findAllByType("button").find(item => item.children.includes(label))!;
  await act(async () => button("新建个人日程").props.onClick());
  await pick(root, "开始日期", "2026-09-17"); await pick(root, "开始时间", "23:45");
  assert.ok(button("30分钟"), "duration choice is available");
  await act(async () => button("30分钟").props.onClick());
  assert.match(root.root.findByProps({ "aria-label": "结束日期" }).children.join(""), /2026-09-18/); assert.match(root.root.findByProps({ "aria-label": "结束时间" }).children.join(""), /00:15/);
  await act(async () => button("线上").props.onClick()); assert.ok(root.root.findByProps({ "aria-label": "会议链接（选填）" }));
});

test("web personal note selector saves exact IDs and readonly detail rechecks ownership", async t => {
  const note = { id: "note:owned", accountId: "owner", ownerUserId: "owner", title: "Owned note", body: "Never display this body", contactIds: [], version: 1, createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" };
  let saved: any; const writes: any[] = []; let revoked = false;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const path = String(input);
    if (path.startsWith("/api/schedule-items/association-options/notes?")) return Response.json({ success: true, data: { actorId: "owner", kind: "note", options: [{ id: note.id, title: note.title }], sourceVersion: "v1", partial: false } });
    if (path.startsWith("/api/notes")) return Response.json({ success: true, data: path.startsWith("/api/notes?") ? { notes: [note], total: 1 } : { note: { ...note, ownerUserId: revoked ? "other" : "owner" } } });
    if (init?.method === "POST") {
      const fields = JSON.parse(String(init.body)); writes.push(fields);
      saved = { ...fields, id: "personal:new", sourceId: "personal:new", accountId: "owner", ownerUserId: "owner", kind: "personal", category: "personal", state: "upcoming", createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" }; delete saved.idempotencyKey;
      return Response.json({ success: true, data: { scheduleItem: saved } });
    }
    return Response.json({ success: true, data: path.includes("scope=personal") ? { scheduleItems: saved ? [saved] : [] } : { scheduleItem: saved } });
  });
  let root!: ReactTestRenderer; await act(async () => { root = create(<PersonalScheduleWorkspace actorId="owner" />); }); t.after(() => act(() => root.unmount()));
  const button = (label: string) => root.root.findAllByType("button").find(item => item.children.includes(label))!;
  await act(async () => button("新建个人日程").props.onClick());
  await act(async () => root.root.findByProps({ "aria-label": "日程标题" }).props.onChange({ target: { value: "Associated web" } }));
  await pick(root, "开始日期", "2026-09-17"); await pick(root, "开始时间", "09:00");
  await act(async () => button("关联笔记").props.onClick());
  await act(async () => { root.root.findByProps({ "aria-label": "搜索笔记" }).props.onChange({ target: { value: "Owned" } }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  await act(async () => root.root.findByProps({ role: "checkbox", "aria-label": "Owned note" }).props.onClick());
  await act(async () => button("关闭关联窗").props.onClick());
  assert.match(JSON.stringify(root.toJSON()), /Owned note/, "selected chip retains its verified title outside the sheet");
  revoked = true;
  await act(async () => root.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(writes[0].noteIds, ["note:owned"]);
  assert.match(JSON.stringify(root.toJSON()), /个人日程已保存/);
  const viewNote = root.root.findAllByType("button").find(button => button.children.includes("查看关联笔记"))!;
  await act(async () => viewNote.props.onClick());
  assert.match(JSON.stringify(root.toJSON()), /关联对象不可用，请移除或重试/); assert.doesNotMatch(JSON.stringify(root.toJSON()), /Never display this body/);
});

test("web readonly note panel fetches the exact linked ID only on click and clears revoked contents", async t => {
  const item = { id: "personal:one", sourceId: "personal:one", accountId: "owner", ownerUserId: "owner", kind: "personal", category: "personal", state: "upcoming", title: "Owned personal", noteIds: ["note:owned"], startsAt: "2026-09-17T00:00:00Z", createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" };
  let revoked = false; const reads: string[] = [];
  t.mock.method(globalThis, "fetch", async input => {
    if (String(input).startsWith("/api/notes/")) reads.push(String(input));
    return Response.json({ success: true, data: String(input).startsWith("/api/notes/") ? { note: { id: "note:owned", title: "Owned note", body: "Current private body", version: 1, createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z", ownerUserId: revoked ? "other" : "owner", accountId: "owner" } } : String(input).includes("scope=personal") ? { scheduleItems: [item] } : { scheduleItem: item } });
  });
  let root!: ReactTestRenderer; await act(async () => { root = create(<PersonalScheduleWorkspace actorId="owner" />); }); t.after(() => act(() => root.unmount()));
  await act(async () => root.root.findAllByType("button").find(button => button.findAllByType("strong").some(title => title.children.includes("Owned personal")))!.props.onClick());
  assert.equal(root.root.findAllByType("a").filter(link => String(link.props.href).startsWith("/app/notes/")).length, 0);
  assert.deepEqual(reads, []);
  const button = (label: string) => root.root.findAllByType("button").find(button => button.children.includes(label))!;
  await act(async () => button("查看关联笔记").props.onClick());
  assert.deepEqual(reads, ["/api/notes/note%3Aowned"]); assert.match(JSON.stringify(root.toJSON()), /Current private body/);
  await act(async () => button("关闭笔记").props.onClick()); assert.doesNotMatch(JSON.stringify(root.toJSON()), /Current private body/);
  revoked = true; await act(async () => button("查看关联笔记").props.onClick());
  assert.match(JSON.stringify(root.toJSON()), /关联对象不可用，请移除或重试/); assert.doesNotMatch(JSON.stringify(root.toJSON()), /Current private body/);
});

test("web pending linked-note response cannot publish after panel close or account scope change", async t => {
  let actor = "owner"; const held: ((response: Response) => void)[] = [];
  const item = () => ({ id: "personal:one", sourceId: "personal:one", accountId: actor, ownerUserId: actor, kind: "personal", category: "personal", state: "upcoming", title: "Scoped personal", noteIds: ["note:owned"], startsAt: "2026-09-17T00:00:00Z", createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" });
  t.mock.method(globalThis, "fetch", async input => String(input).startsWith("/api/notes/") ? new Promise<Response>(resolve => held.push(resolve)) : Response.json({ success: true, data: String(input).includes("scope=personal") ? { scheduleItems: [item()] } : { scheduleItem: item() } }));
  let root!: ReactTestRenderer; await act(async () => { root = create(<PersonalScheduleWorkspace key={actor} actorId={actor} />); }); t.after(() => act(() => root.unmount()));
  const button = (label: string) => root.root.findAllByType("button").find(button => button.children.includes(label))!;
  await act(async () => root.root.findAllByType("button").find(button => button.findAllByType("strong").some(title => title.children.includes("Scoped personal")))!.props.onClick());
  await act(async () => button("查看关联笔记").props.onClick()); await act(async () => button("关闭笔记").props.onClick());
  const old = () => Response.json({ success: true, data: { note: { id: "note:owned", title: "Old note", body: "Old private contents", ownerUserId: "owner", accountId: "owner", version: 1, createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" } } });
  await act(async () => held[0]!(old())); assert.doesNotMatch(JSON.stringify(root.toJSON()), /Old private contents/);
  await act(async () => button("查看关联笔记").props.onClick()); actor = "other";
  await act(async () => root.update(<PersonalScheduleWorkspace key={actor} actorId={actor} />)); await act(async () => held[1]!(old()));
  assert.doesNotMatch(JSON.stringify(root.toJSON()), /Old private contents/); assert.equal(root.root.findAllByProps({ "aria-label": "关联笔记详情" }).length, 0);
});
