import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PersonalScheduleWorkspace } from "../../app/(app)/app/tasks/personal-schedule-workspace";
import { personalScheduleDraft, buildPersonalScheduleChange } from "../../app/(app)/app/tasks/personal-schedule-editor-model";
import { PersonalScheduleAssociationSheet } from "../../app/(app)/app/tasks/personal-schedule-association-sheet";
import { createPersonalScheduleClient } from "../../app/(app)/app/tasks/personal-schedule-client";

const base = { id: "personal:series", sourceId: "personal:series", accountId: "owner", ownerUserId: "owner", kind: "personal", category: "personal", state: "upcoming", title: "Rules", startsAt: "2026-09-17T00:15:42Z", endsAt: "2026-09-17T00:45:12Z", timeZone: "Asia/Tokyo", reminderMinutes: 15, recurrence: { frequency: "daily", until: "2026-09-19" }, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" } as const;

test("draft preserves inherited rules and seconds; explicit rule clears emit null", () => {
  const draft = personalScheduleDraft(base, "Asia/Tokyo");
  assert.equal((draft as any).reminderMinutes, 15);
  assert.deepEqual((draft as any).recurrence, { frequency: "daily", until: "2026-09-19" });
  assert.equal(buildPersonalScheduleChange(base, draft, "Asia/Tokyo").kind, "unchanged");
  const changed = buildPersonalScheduleChange(base, { ...draft, reminderMinutes: null, recurrence: null } as any, "Asia/Tokyo");
  assert.deepEqual(changed, { kind: "ready", fields: { reminderMinutes: null, recurrence: null } });
});

test("changing summary query during authorization cancels old selection without permanently disabling new results", async () => {
  let finish!: (response: Response) => void; const changes: string[] = [];
  const client = createPersonalScheduleClient("owner", async input => String(input).startsWith("/api/notes/") ? new Promise<Response>(resolve => { finish = resolve; }) : Response.json({ success: true, data: { actorId: "owner", kind: "note", options: [{ id: "note:one", title: "Owned summary" }], sourceVersion: "v1", partial: false } }));
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<PersonalScheduleAssociationSheet kind="note" client={client} ids={[]} disabled={false} onToggle={id => changes.push(id)} onClose={() => {}} />); await new Promise(resolve => setTimeout(resolve, 10)); });
  try {
    await act(async () => root.root.findByProps({ role: "checkbox" }).props.onClick());
    await act(async () => root.root.findByProps({ "aria-label": "搜索笔记" }).props.onChange({ target: { value: "new" } }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
    await act(async () => finish(Response.json({ success: true, data: { note: { id: "note:one", title: "Old authorized title", accountId: "owner", ownerUserId: "owner" } } })));
    assert.deepEqual(changes, [], "old authorization cannot select into new query");
    assert.equal(root.root.findByProps({ role: "checkbox" }).props.disabled, false, "new query remains selectable");
  } finally { act(() => root.unmount()); }
});

test("actual stable occurrence editor blocks unspecific writes and preserves dirty draft when switching series", async t => {
  const instance = { ...base, id: "personal:series:occurrence:2026-09-18", seriesId: base.id, occurrenceDate: "2026-09-18", startsAt: "2026-09-18T00:15:42Z", endsAt: "2026-09-18T00:45:12Z" };
  const calls: { path: string; method: string; body?: any }[] = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const path = String(input); calls.push({ path, method: init?.method ?? "GET", ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    return Response.json({ success: true, data: path.includes("scope=personal") ? { scheduleItems: [instance] } : { scheduleItem: path.endsWith("personal%3Aseries") ? base : instance } });
  });
  let root!: ReactTestRenderer; await act(async () => { root = create(<PersonalScheduleWorkspace actorId="owner" />); }); t.after(() => act(() => root.unmount()));
  const button = (label: string) => root.root.findAllByType("button").find(button => button.children.includes(label))!;
  await act(async () => root.root.findAllByType("button").find(button => button.findAllByType("strong").length > 0)!.props.onClick());
  await act(async () => button("编辑").props.onClick());
  assert.equal(button("保存个人日程").props.disabled, true);
  await act(async () => root.root.findByProps({ "aria-label": "日程标题" }).props.onChange({ target: { value: "Keep dirty title" } }));
  await act(async () => button("整个系列").props.onClick());
  assert.equal(root.root.findByProps({ "aria-label": "日程标题" }).props.value, "Keep dirty title");
  assert.match(JSON.stringify(root.toJSON()), /草稿已保留/);
  assert.ok(calls.every(call => call.method === "GET"));
  await act(async () => button("放弃草稿并载入最新内容").props.onClick());
  await act(async () => button("整个系列").props.onClick());
  assert.ok(calls.some(call => call.path === "/api/schedule-items/personal%3Aseries"));
  assert.equal(root.root.findByProps({ "aria-label": "开始日期" }).props.value, "2026-09-17");
  assert.equal(root.root.findByProps({ "aria-label": "提醒" }).props.disabled, false);
});

test("new editor exposes all seven reminders and four recurrence choices without a default fake time", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: true, data: { scheduleItems: [] } }));
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<PersonalScheduleWorkspace actorId="owner" />); });
  t.after(() => act(() => root.unmount()));
  await act(async () => root.root.findAllByType("button").find(button => button.children.includes("新建个人日程"))!.props.onClick());
  const reminder = root.root.findAllByProps({ "aria-label": "提醒" });
  assert.equal(reminder.length, 1, "actual editor must provide a reminder control");
  assert.equal(reminder[0]!.findAllByType("option").length, 7);
  assert.equal(root.root.findByProps({ "aria-label": "重复" }).findAllByType("option").length, 4);
  assert.equal(root.root.findByProps({ "aria-label": "开始日期" }).props.value, "");
  assert.doesNotMatch(JSON.stringify(root.toJSON()), /暂不支持/);
});

test("opening association sheet requests empty-query summaries, closes without mutation", async t => {
  const calls: { path: string; method: string }[] = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const path = String(input); calls.push({ path, method: init?.method ?? "GET" });
    return Response.json({ success: true, data: path.includes("association-options") ? { actorId: "owner", kind: "note", options: [{ id: "note:one", title: "Owned summary" }], sourceVersion: "v1", partial: false } : { scheduleItems: [] } });
  });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<PersonalScheduleWorkspace actorId="owner" />); });
  t.after(() => act(() => root.unmount()));
  const click = async (label: string) => act(async () => root.root.findAllByType("button").find(button => button.children.includes(label))!.props.onClick());
  await click("新建个人日程"); await click("关联笔记");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  assert.ok(calls.some(call => call.path === "/api/schedule-items/association-options/notes?q=&limit=20"));
  assert.equal(root.root.findAllByProps({ role: "dialog" }).length, 1);
  assert.match(JSON.stringify(root.toJSON()), /Owned summary/);
  await click("关闭关联窗");
  assert.equal(root.root.findAllByProps({ role: "dialog" }).length, 0);
  assert.ok(calls.every(call => call.method === "GET"));
});

test("real editor saves rules then reopens and clears them through ACK and independent GET", async t => {
  let stored: any; const writes: any[] = []; let reads = 0;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const path = String(input);
    if (init?.method === "POST" || init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)); writes.push(body);
      stored = { ...(stored ?? { id: "personal:new", sourceId: "personal:new", accountId: "owner", ownerUserId: "owner", kind: "personal", category: "personal", state: "upcoming", createdAt: "2026-09-01T00:00:00Z" }), ...(body.patch ?? body), updatedAt: writes.length === 1 ? "2026-09-17T01:00:00Z" : "2026-09-17T02:00:00Z" };
      delete stored.idempotencyKey;
      for (const key of Object.keys(stored)) if (stored[key] === null) delete stored[key];
      return Response.json({ success: true, data: { scheduleItem: stored } });
    }
    if (!path.includes("scope=personal")) reads++;
    return Response.json({ success: true, data: path.includes("scope=personal") ? { scheduleItems: stored ? [stored] : [] } : { scheduleItem: structuredClone(stored) } });
  });
  let root!: ReactTestRenderer; await act(async () => { root = create(<PersonalScheduleWorkspace actorId="owner" />); }); t.after(() => act(() => root.unmount()));
  const button = (label: string) => root.root.findAllByType("button").find(button => button.children.includes(label))!;
  const change = async (label: string, value: string) => act(async () => root.root.findByProps({ "aria-label": label }).props.onChange({ target: { value } }));
  await act(async () => button("新建个人日程").props.onClick());
  await change("日程标题", "Rule save"); await change("开始日期", "2026-09-17"); await change("开始时间", "09:15");
  await change("提醒", "15"); await change("重复", "daily"); await change("重复结束日期（选填）", "2026-09-19");
  await act(async () => root.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(writes[0].reminderMinutes, 15); assert.deepEqual(writes[0].recurrence, { frequency: "daily", until: "2026-09-19" });
  assert.match(JSON.stringify(root.toJSON()), /提前15分钟 · 每天 · 至2026-09-19/); assert.ok(reads >= 1);
  await act(async () => button("编辑").props.onClick()); await act(async () => button("整个系列").props.onClick());
  assert.equal(root.root.findByProps({ "aria-label": "提醒" }).props.value, 15);
  assert.equal(root.root.findByProps({ "aria-label": "重复结束日期（选填）" }).props.value, "2026-09-19");
  await change("提醒", ""); await change("重复", "");
  await act(async () => root.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(writes[1].scope, "series"); assert.deepEqual(writes[1].patch, { reminderMinutes: null, recurrence: null });
  assert.match(JSON.stringify(root.toJSON()), /不提醒 · 不重复/);
});

test("summary sheet rejects wrong actor, retries failed load, pages summaries and checks detail before selecting", async () => {
  let other = true; const requests: string[] = []; const selected: string[] = [];
  const client = createPersonalScheduleClient("owner", async input => {
    const path = String(input); requests.push(path);
    if (path.startsWith("/api/contacts/")) return Response.json({ success: true, data: { contact: { id: "contact:two", displayName: "Verified title" } } });
    const second = path.includes("cursor=next");
    return Response.json({ success: true, data: { actorId: other ? "other" : "owner", kind: "contact", options: [{ id: second ? "contact:two" : "contact:one", title: second ? "Second summary" : "First summary" }], sourceVersion: "v1", partial: !second, ...(!second ? { nextCursor: "next" } : {}) } });
  });
  let root!: ReactTestRenderer; await act(async () => { root = create(<PersonalScheduleAssociationSheet kind="contact" client={client} ids={[]} disabled={false} onToggle={id => selected.push(id)} onClose={() => {}} />); await new Promise(resolve => setTimeout(resolve, 10)); });
  try {
    assert.doesNotMatch(JSON.stringify(root.toJSON()), /First summary/); assert.equal(root.root.findAllByProps({ role: "alert" }).length, 1);
    other = false; await act(async () => root.root.findAllByType("button").find(button => button.children.includes("重试"))!.props.onClick());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    await act(async () => root.root.findAllByType("button").find(button => button.children.includes("加载更多"))!.props.onClick());
    assert.equal(root.root.findAllByProps({ role: "checkbox" }).length, 2);
    await act(async () => root.root.findByProps({ role: "checkbox", "aria-label": "Second summary" }).props.onClick());
    assert.deepEqual(selected, ["contact:two"]); assert.ok(requests.includes("/api/contacts/contact%3Atwo"));
    assert.ok(requests.includes("/api/schedule-items/association-options/contacts?q=&limit=20&cursor=next"));
  } finally { act(() => root.unmount()); }
});
