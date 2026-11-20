/**
 * AG21a R35 (independent suite, final run): 「我上个月去过哪些活动？」 — the first layer asks for attendance.read, the read step had
 * no case for it, read the kinds as {event} only and said the event directory cannot be searched by conditions. The user's
 * own «我去过» records are read now (the list the write path uses), in the period said, and shown as "I went" cards.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ownEventsOf } from "../../features/agent-v1/domains/event/read";
import { createDomainRegistry } from "../../features/agent-v1/domains/registry";
import { readKindsOf } from "../../features/agent-v1/graph/nodes/resolve";
import type { AttendanceNoteContract } from "../../shared/contract/agent-v1";
import { ACTOR, fnWorld, json, runFn } from "./functions-kit";
import { graphKit, recordAccessOf, type ModelCall } from "./graph-kit";
import { platformEvent } from "./read-kit";

const NOTE = (id: string, eventId: string, kind: "platform" | "private", attendedOn: string, selfNote?: string, accountId = ACTOR): AttendanceNoteContract => ({ accountId, attendedOn, createdAt: `${attendedOn}T12:00:00.000Z`, eventRef: { id: eventId, kind }, id, ...(selfNote ? { selfNote } : {}), updatedAt: `${attendedOn}T12:00:00.000Z`, version: 1 });

function world() {
  const base = fnWorld();
  base.events.push(
    platformEvent("event:e090", "秋季设计周", "2026-10-18T01:00:00.000Z", "青山"),
    platformEvent("event:e091", "九月读书会", "2026-09-12T09:00:00.000Z", "神保町"),
    platformEvent("event:e092", "十月市集（只报了名）", "2026-10-20T02:00:00.000Z", "代代木"),
  );
  const privateEvents = new Map([["private_event:tea", { accountId: ACTOR, id: "private_event:tea", startsAt: "2026-10-25T06:00:00.000Z", title: "校友茶会", updatedAt: "2026-10-01T00:00:00.000Z", venue: "本乡", version: 1 }]]);
  const notes = [
    NOTE("attendance:a1", "event:e090", "platform", "2026-10-18", "认识了两位做包装的设计师"),
    NOTE("attendance:a2", "private_event:tea", "private", "2026-10-25"),
    NOTE("attendance:a3", "event:e091", "platform", "2026-09-12"),
    NOTE("attendance:b1", "event:e090", "platform", "2026-10-18", "别人的", "user:b"),
  ];
  const access = recordAccessOf(base);
  const byIds = async (ids: readonly string[]) => base.events.filter((event) => ids.includes(event.eventId));
  const own = ownEventsOf({
    attendance: { async get(actorId, id) { const note = notes.find((item) => item.id === id); return note && note.accountId === actorId ? note : null; } },
    byIds,
    privateEvents: { async get(actorId, id) { const event = privateEvents.get(id); return event && event.accountId === actorId ? event : null; } },
  });
  const reader = createDomainRegistry({ cursorKey: new Uint8Array(Buffer.from("agent-v1-graph-kit-cursor-key-0123456789")), denied: () => access.denied, events: { byIds, own }, now: () => "2026-11-15T01:00:00.000Z", source: access.source });
  return { ...access, attendance: { list: async (actorId: string) => notes.filter((note) => note.accountId === actorId) }, reader };
}

const citeAll = (text: string) => (call: ModelCall) => json({ segments: [{ cites: [...call.user.matchAll(/(s\d+) — /gu)].map((match) => ({ sentenceIds: [1], sourceRef: match[1] })), partId: "p1", text }] });

test("attendance.read is a kind of its own, not the event directory", () => {
  assert.deepEqual([...readKindsOf(["attendance.read"])], ["attendance"]);
  assert.deepEqual([...readKindsOf(["event.read"])], ["event"]);
});

for (const [label, capabilities] of [["tagged attendance.read", ["attendance.read"]], ["tagged only as an event read", ["event.read"]]] as const) {
  test(`「我上个月去过哪些活动？」 (${label}): the «我去过» records of October, the latest first; no directory refusal`, async () => {
    const message = "我上个月去过哪些活动？";
    let materials = "";
    const records = world();
    const session = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: "2026-11-15T01:00:00.000Z", records });
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", readFilter: { from: "2026-10-01", to: "2026-10-31" }, requiredCapabilities: [...capabilities], sourceQuote: message }], { answer: (call) => { materials = call.user; return citeAll("上个月你去了秋季设计周和校友茶会。")(call); }, session });
    assert.doesNotMatch(run.result.text, /不能这样找|还不能|can't do yet|按条件/u, run.result.text);
    assert.match(materials, /校友茶会/u);
    assert.match(materials, /秋季设计周/u);
    assert.match(materials, /认识了两位做包装的设计师/u);
    assert.doesNotMatch(materials, /九月读书会|别人的|只报了名/u, "outside the period, another account's, and an event only registered for are not read");
    assert.ok(materials.indexOf("校友茶会") < materials.indexOf("秋季设计周"), "the latest first");
    const shown = JSON.stringify(run.result);
    assert.match(shown, /"kind":"attendance"/u, "shown as «我去过» cards");
    assert.ok(run.events.some((event) => event.type === "resolve.attendance_read" && event.found === 2));
  });
}

test("an event clue of only question and kind words keeps every record; a clue that names an event keeps that one", async () => {
  for (const [message, clue, english, expected] of [
    ["我上个月去过哪些活动？", "哪些活动", false, ["校友茶会", "秋季设计周"]],
    ["上个月去过的活动有哪些？", "上个月去过的活动", false, ["校友茶会", "秋季设计周"]],
    ["校友茶会我是哪天去的？", "校友茶会", false, ["校友茶会"]],
    ["Which events did I go to last month?", "events", true, ["校友茶会", "秋季设计周"]],
  ] as const) {
    let materials = "";
    const session = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: "2026-11-15T01:00:00.000Z", records: world() });
    const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "list", objectClues: [{ entity: "event", text: clue }], ...(clue === "校友茶会" ? {} : { readFilter: { from: "2026-10-01", to: "2026-10-31" } }), requiredCapabilities: ["attendance.read"], sourceQuote: message }], { answer: (call) => { materials = call.user; return citeAll(english ? "You went to these." : "去过这些。")(call); }, language: english ? "en" : "zh", session });
    for (const title of expected) assert.match(materials, new RegExp(title, "u"), `${message}: ${title}`);
    if (expected.length === 1) assert.doesNotMatch(materials, /秋季设计周/u, message);
    assert.doesNotMatch(run.result.text, /can't do yet|还不能/u, message);
  }
});

test("an event the part points at by id is read by id as before (the default reading 「这场的时间地点」 stays that event)", async () => {
  const message = "@秋季设计周 是几点开始的？";
  const records = world();
  const session = graphKit((async () => { throw new Error("replaced"); }) as typeof fetch, { now: "2026-11-15T01:00:00.000Z", records });
  let materials = "";
  const run = await runFn(message, [{ dataSources: ["orbit_records"], deliverable: "answer", objectClues: [{ entity: "event", referenceId: "r1", text: "@秋季设计周" }], requiredCapabilities: ["event.read", "attendance.read"], sourceQuote: message }], { answer: (call) => { materials = call.user; return citeAll("10 月 18 日上午十点开始。")(call); }, references: [{ id: "event:e090", name: "秋季设计周", type: "event" }], session });
  assert.ok(!run.events.some((event) => event.type === "resolve.attendance_read"));
  assert.match(materials, /秋季设计周/u);
  assert.doesNotMatch(materials, /校友茶会/u);
});
