import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { SessionContext } from "next-auth/react";
import { MeetingProposalModal } from "../../app/(app)/app/orbit-2026/calendar/MeetingProposalModal";
import { Orbit2026Scope } from "../../app/(app)/app/orbit-2026/ui";

const now = Date.parse("2030-04-01T00:00:00Z");
const text = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : text(child)).join("");
const button = (root: ReactTestRenderer, label: string) => { const found = root.root.findAllByType("button").find(node => text(node) === label || node.props["aria-label"] === label); assert.ok(found, `Missing button: ${label}`); return found; };
const candidates = [2, 3, 4].map(day => ({ startsAt: `2030-04-0${day}T09:00:00.000Z`, endsAt: `2030-04-0${day}T10:00:00.000Z` }));
function meeting() { return { appointmentId: "meeting:1", contactId: "contact-b", status: "confirmed", visibility: "participants", title: "人脉会面", version: 3, updatedAt: "2030-04-01T00:00:00Z", details: "", detailsUpdatedAt: null, detailsUpdatedBy: null, eventId: "event", pendingProposalRevision: null, confirmed: { candidateId: "old:1", proposalRevision: 1, durationMinutes: 60, medium: { kind: "in_person", location: "Room 1" }, startsAtUtc: "2030-04-08T09:00:00Z", timezone: "UTC" }, proposals: [{ revision: 1, createdAt: "2030-04-01T00:00:00Z", durationMinutes: 60, medium: { kind: "in_person", location: "Room 1" }, timezone: "UTC", note: "", proposedBy: "you", candidateTimes: candidates.map((value, index) => ({ candidateId: `old:${index + 1}`, startsAtUtc: value.startsAt })) }] }; }
function documentStub() { const previous = Object.getOwnPropertyDescriptor(globalThis, "document"); Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } }); return () => previous ? Object.defineProperty(globalThis, "document", previous) : Reflect.deleteProperty(globalThis, "document"); }

test("contact-only proposal checks server authority and never creates an appointment when unavailable", async t => {
  const restore = documentStub(); let requests = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => { requests++; assert.equal(init?.method, "GET"); assert.ok(url.includes("initial-proposal?contactId=c")); return Response.json({ success: true, data: { contactId: "c", available: false } }); });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><MeetingProposalModal open contactId="c" onClose={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  assert.ok(JSON.stringify(root!.toJSON()).includes("この連絡先からの新しい日程提案は、まだ使えません。"));
  assert.equal(requests, 1);
});

test("verified accepted contact can submit a first proposal only after candidates, format and review", async t => {
  t.mock.timers.enable({ apis: ["Date"], now }); const restore = documentStub(); const posts: any[] = [], sent: string[] = []; let raw: any = null;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (url.includes("initial-proposal") && init?.method !== "POST") return Response.json({ success: true, data: { contactId: "contact-b", available: true } });
    if (url.includes("external-events")) return Response.json({ success: true, data: { provider: "google_calendar", connection: "not_connected", events: [], asOf: "2030-04-01T00:00:00Z" } });
    if (url.includes("scope=calendar")) return Response.json({ success: true, data: { scheduleItems: [] } });
    if (init?.method === "POST") {
      assert.equal(url, "/api/appointments/initial-proposal"); const body = JSON.parse(String(init.body)); posts.push(body);
      raw = { ...meeting(), appointmentId: "initial:1", confirmed: null, status: "awaiting_response", version: 2, pendingProposalRevision: 1, proposals: [{ ...body.proposal, revision: 1, createdAt: "2030-04-01T00:00:00Z", proposedBy: "you", candidateTimes: body.proposal.candidateTimes.map((value: any, index: number) => ({ ...value, candidateId: `initial:${index}` })) }] };
      return Response.json({ success: true, data: { ...raw, replayed: false } });
    }
    assert.equal(url, "/api/appointments/initial%3A1"); return Response.json({ success: true, data: raw });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><MeetingProposalModal open contactId="contact-b" initialCandidates={candidates} onSent={id => sent.push(id)} onClose={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, "次へ").props.onClick());
  await act(async () => root!.root.findAllByType("input").find(node => node.props["aria-label"] === "場所")!.props.onChange({ target: { value: "Room 2" } }));
  await act(async () => button(root!, "次へ").props.onClick());
  assert.deepEqual(posts, []);
  assert.ok(!JSON.stringify(root!.toJSON()).includes("元の予定は変わりません"));
  await act(async () => button(root!, "提案を保存").props.onClick());
  assert.equal(posts.length, 1); assert.equal(posts[0].contactId, "contact-b");
  assert.deepEqual(sent, ["initial:1"]);
});

test("an old account's first-proposal acknowledgement cannot notify or close the new account", async t => {
  t.mock.timers.enable({ apis: ["Date"], now }); const restore = documentStub(); let account = "a", settle!: (response: Response) => void, oldSignal: AbortSignal | undefined;
  const sent: string[] = []; let closes = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { oldSignal = init.signal as AbortSignal; return new Promise<Response>(resolve => { settle = resolve; }); }
    if (url.includes("initial-proposal?")) return Response.json({ success: true, data: { contactId: "contact-b", available: account === "a" } });
    return url.includes("external-events") ? Response.json({ success: true, data: { provider: "google_calendar", connection: "not_connected", events: [], asOf: "2030-04-01T00:00:00Z" } }) : Response.json({ success: true, data: { scheduleItems: [] } });
  });
  const render = (value: string) => { account = value; return <SessionContext.Provider value={{ status: "authenticated", data: { user: { id: value }, expires: "2099-01-01" }, update: async () => null }}><Orbit2026Scope language="ja"><MeetingProposalModal open contactId="contact-b" initialCandidates={candidates} onSent={id => sent.push(id)} onClose={() => { closes++; }} /></Orbit2026Scope></SessionContext.Provider>; };
  let root: ReactTestRenderer;
  await act(async () => { root = create(render("a")); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, "次へ").props.onClick());
  await act(async () => root!.root.findAllByType("input").find(node => node.props["aria-label"] === "場所")!.props.onChange({ target: { value: "Private place" } }));
  await act(async () => button(root!, "次へ").props.onClick());
  await act(async () => button(root!, "提案を保存").props.onClick());
  await act(async () => root.update(render("b")));
  assert.equal(oldSignal?.aborted, true);
  await act(async () => settle(Response.json({ success: true, data: { ...meeting(), replayed: false } })));
  assert.deepEqual(sent, []); assert.equal(closes, 0);
  assert.ok(!JSON.stringify(root!.toJSON()).includes("Private place"));
});

test("three selected candidates pass through format and review before a verified native reschedule acknowledgement", async t => {
  t.mock.timers.enable({ apis: ["Date"], now }); const restore = documentStub(); let raw = meeting(); const posts: any[] = []; const sent: string[] = []; let closes = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (url.includes("external-events")) return Response.json({ success: true, data: { provider: "google_calendar", connection: "not_connected", events: [], asOf: "2030-04-01T00:00:00Z" } });
    if (url.includes("scope=calendar")) return Response.json({ success: true, data: { scheduleItems: [] } });
    if (init?.method === "POST") { const body = JSON.parse(String(init.body)); posts.push(body); raw = { ...raw, status: "reschedule_pending", version: 4, pendingProposalRevision: 2, proposals: [...raw.proposals, { ...body.proposal, revision: 2, createdAt: "2030-04-01T00:00:00Z", proposedBy: "you", candidateTimes: body.proposal.candidateTimes.map((value: any, index: number) => ({ ...value, candidateId: `new:${index}` })) }] }; return Response.json({ success: true, data: { ...raw, replayed: false } }); }
    return Response.json({ success: true, data: raw });
  });
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><MeetingProposalModal open appointmentId="meeting:1" contactId="contact-b" initialCandidates={candidates} onSent={id => sent.push(id)} onClose={() => { closes++; }} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  assert.equal(root!.root.findAll(node => node.type === "ol" && node.props["aria-label"] === "候補日時")[0]?.findAllByType("li").length, 3);
  assert.deepEqual(posts, []);
  await act(async () => button(root!, "次へ").props.onClick());
  const place = root!.root.findAllByType("input").find(node => node.props["aria-label"] === "場所")!;
  await act(async () => place.props.onChange({ target: { value: "Room 2" } }));
  await act(async () => button(root!, "次へ").props.onClick());
  assert.deepEqual(posts, []);
  assert.ok(JSON.stringify(root!.toJSON()).includes("合意するまで、元の予定は変わりません。"));
  await act(async () => button(root!, "再提案を保存").props.onClick());
  assert.equal(posts.length, 1); assert.equal(posts[0].command, "propose"); assert.equal(posts[0].expectedVersion, 3);
  assert.deepEqual(posts[0].proposal.candidateTimes, candidates.map(value => ({ startsAtUtc: value.startsAt })));
  assert.deepEqual(sent, ["meeting:1"]); assert.equal(closes, 1);
  assert.ok(!JSON.stringify(root!.toJSON()).includes("人脉会面"));
});

test("incomplete availability does not auto-select free candidates and manual selection is limited to five", async t => {
  t.mock.timers.enable({ apis: ["Date"], now }); const restore = documentStub();
  t.mock.method(globalThis, "fetch", async (url: string) => url.includes("external-events") ? Response.json({ success: false }, { status: 503 }) : url.includes("scope=calendar") ? Response.json({ success: true, data: { scheduleItems: [] } }) : Response.json({ success: true, data: meeting() }));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><MeetingProposalModal open appointmentId="meeting:1" contactId="contact-b" onClose={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  const selected = () => root!.root.findAll(node => node.type === "ol" && node.props["aria-label"] === "候補日時")[0]?.findAllByType("li").length;
  assert.equal(selected(), 0); assert.equal(button(root!, "次へ").props.disabled, true);
  assert.ok(JSON.stringify(root!.toJSON()).includes("空き時間を確認できません。候補は手動で選んでください。"));
  assert.ok(root!.root.findAllByType("button").filter(node => node.props["data-proposal-slot"] && node.props["aria-label"].includes("17:30")).every(node => node.props.disabled));
  for (let index = 0; index < 5; index++) {
    const option = root!.root.findAllByType("button").find(node => node.props["data-proposal-slot"] && !node.props.disabled && node.props["aria-pressed"] === false)!;
    assert.ok(option); await act(async () => option.props.onClick());
  }
  assert.equal(selected(), 5);
  const extra = root!.root.findAllByType("button").filter(node => node.props["data-proposal-slot"] && node.props["aria-pressed"] === false);
  assert.ok(extra.every(node => node.props.disabled));
});

test("a conflict keeps candidate edits and offers an explicit reload rather than reporting success", async t => {
  t.mock.timers.enable({ apis: ["Date"], now }); const restore = documentStub(); const sent: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => init?.method === "POST" ? Response.json({ success: false }, { status: 409 }) : url.includes("external-events") ? Response.json({ success: true, data: { provider: "google_calendar", connection: "not_connected", events: [], asOf: "2030-04-01T00:00:00Z" } }) : url.includes("scope=calendar") ? Response.json({ success: true, data: { scheduleItems: [] } }) : Response.json({ success: true, data: meeting() }));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><MeetingProposalModal open appointmentId="meeting:1" contactId="contact-b" initialCandidates={candidates} onSent={id => sent.push(id)} onClose={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, "次へ").props.onClick());
  await act(async () => button(root!, "次へ").props.onClick());
  await act(async () => button(root!, "再提案を保存").props.onClick());
  assert.deepEqual(sent, []);
  assert.ok(JSON.stringify(root!.toJSON()).includes("入力を残したまま"));
  assert.ok(button(root!, "再読み込み"));
  assert.equal(root!.root.findAll(node => node.type === "ol" && node.props["aria-label"] === "候補日時")[0]?.findAllByType("li").length, 3);
});

test("an old account's late proposal response cannot close or notify the new account's modal", async t => {
  t.mock.timers.enable({ apis: ["Date"], now }); const restore = documentStub(); let settle!: (response: Response) => void; let oldSignal: AbortSignal | undefined; const sent: string[] = []; let closes = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { oldSignal = init.signal as AbortSignal; return new Promise<Response>(resolve => { settle = resolve; }); }
    return url.includes("external-events") ? Response.json({ success: true, data: { provider: "google_calendar", connection: "not_connected", events: [], asOf: "2030-04-01T00:00:00Z" } }) : url.includes("scope=calendar") ? Response.json({ success: true, data: { scheduleItems: [] } }) : Response.json({ success: true, data: meeting() });
  });
  const render = (account: string) => <SessionContext.Provider value={{ status: "authenticated", data: { user: { id: account }, expires: "2099-01-01" }, update: async () => null }}><Orbit2026Scope language="ja"><MeetingProposalModal open appointmentId="meeting:1" contactId="contact-b" initialCandidates={candidates} onSent={id => sent.push(id)} onClose={() => { closes++; }} /></Orbit2026Scope></SessionContext.Provider>;
  let root: ReactTestRenderer;
  await act(async () => { root = create(render("a")); });
  t.after(() => { act(() => root.unmount()); restore(); });
  await act(async () => button(root!, "次へ").props.onClick());
  await act(async () => button(root!, "次へ").props.onClick());
  await act(async () => button(root!, "再提案を保存").props.onClick());
  assert.ok(settle);
  await act(async () => root.update(render("b")));
  assert.equal(oldSignal?.aborted, true);
  await act(async () => settle(Response.json({ success: true, data: { ...meeting(), status: "reschedule_pending", version: 4, replayed: false } })));
  assert.deepEqual(sent, []); assert.equal(closes, 0);
  assert.equal(root!.root.findAll(node => node.type === "ol" && node.props["aria-label"] === "候補日時")[0]?.findAllByType("li").length, 3);
});

test("invalid caller-provided candidates remain non-submittable without crashing the slot grid", async t => {
  t.mock.timers.enable({ apis: ["Date"], now }); const restore = documentStub();
  t.mock.method(globalThis, "fetch", async (url: string) => url.includes("external-events") ? Response.json({ success: true, data: { provider: "google_calendar", connection: "not_connected", events: [], asOf: "2030-04-01T00:00:00Z" } }) : url.includes("scope=calendar") ? Response.json({ success: true, data: { scheduleItems: [] } }) : Response.json({ success: true, data: meeting() }));
  let root: ReactTestRenderer;
  await act(async () => { root = create(<Orbit2026Scope language="ja"><MeetingProposalModal open appointmentId="meeting:1" contactId="contact-b" initialCandidates={[{ startsAt: "bad", endsAt: "bad" }]} onClose={() => {}} /></Orbit2026Scope>); });
  t.after(() => { act(() => root.unmount()); restore(); });
  assert.equal(button(root!, "次へ").props.disabled, true);
});
