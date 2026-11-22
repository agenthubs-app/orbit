import assert from "node:assert/strict";
import test from "node:test";

import type { McpDomain } from "../../../features/agent-v1/mcp/scopes";
import { projectRecord, RELATION_FIELDS } from "../../../features/agent-v1/mcp/tools/projection";
import { mcpKit } from "./kit";

/**
 * agent-design AG17 (coordinator, after the first judge of the final gate): a result carries a relation to another kind
 * of record only when the connection may read that kind. Otherwise the field is absent — not empty, not a count — so a
 * narrow grant does not learn that linked contacts, events or notes exist in areas the user did not allow.
 */

const ALL: McpDomain[] = ["contacts", "events", "attendance", "todos", "memos", "schedule"];
const record = (fields: Record<string, unknown>) => ({ fields, id: "x:1", kind: "todo" as const, ref: "todo:x:1", updatedAt: "2026-11-15T01:00:00.000Z", version: "1" });

// Every relation field of every kind, with the kind it points at.
const PAIRS: { domain: McpDomain; field: string; source: Record<string, unknown>; target: McpDomain }[] = [
  { domain: "todos", field: "contact_ids", source: { contactIds: ["contact:c17"], title: "t" }, target: "contacts" },
  { domain: "todos", field: "event_refs", source: { eventRefs: [{ id: "private_event:p1", kind: "private" }], title: "t" }, target: "events" },
  { domain: "memos", field: "contact_ids", source: { body: "b", contactIds: ["contact:c17"] }, target: "contacts" },
  { domain: "memos", field: "event_refs", source: { body: "b", eventRefs: [{ id: "evt_1", kind: "platform" }] }, target: "events" },
  { domain: "schedule", field: "contact_ids", source: { contactIds: ["contact:c17"], title: "s" }, target: "contacts" },
  { domain: "schedule", field: "event_refs", source: { eventRefs: [{ id: "evt_1", kind: "platform" }], title: "s" }, target: "events" },
  { domain: "schedule", field: "memo_ids", source: { noteIds: ["note:m31"], title: "s" }, target: "memos" },
];

test("every relation field is listed with the kind it points at (a new one cannot slip through unlisted)", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(RELATION_FIELDS).map(([domain, fields]) => [domain, { ...fields }])), {
    attendance: {},
    contacts: {},
    events: {},
    memos: { contact_ids: "contacts", event_refs: "events" },
    schedule: { contact_ids: "contacts", event_refs: "events", memo_ids: "memos" },
    todos: { contact_ids: "contacts", event_refs: "events" },
  });
});

for (const pair of PAIRS) {
  test(`${pair.domain}.${pair.field}: present only when ${pair.target} may be read; otherwise absent, not empty`, () => {
    const without = projectRecord(pair.domain, record(pair.source), new Set(ALL.filter((domain) => domain !== pair.target)));
    assert.ok(!(pair.field in without), `${pair.field} must be absent without ${pair.target}`);
    assert.doesNotMatch(JSON.stringify(without), /contact:c17|private_event|evt_1|note:m31/u);
    const withIt = projectRecord(pair.domain, record(pair.source), new Set([pair.domain, pair.target]));
    assert.ok(pair.field in withIt, `${pair.field} is there with ${pair.target}`);
  });
}

test("an event relation, when events may be read, is exactly the id get_record takes: no 'platform:' / 'private:' marker of its own", () => {
  const out = projectRecord("memos", record({ body: "b", eventRefs: ["platform:evt_a3d3", "private:private_event:c9aa"] }), new Set<McpDomain>(["memos", "events"]));
  assert.deepEqual(out.event_refs, ["evt_a3d3", "private_event:c9aa"]);
  const objects = projectRecord("todos", record({ eventRefs: [{ id: "evt_a3d3", kind: "platform" }, { id: "private_event:c9aa", kind: "private" }], title: "t" }), new Set<McpDomain>(["todos", "events"]));
  assert.deepEqual(objects.event_refs, ["evt_a3d3", "private_event:c9aa"]);
});

test("a memo's recorded interaction names its people only when contacts may be read", () => {
  const source = { body: "b", interaction: { actualContactIds: ["contact:c17"], channel: "call", occurredOn: "2026-11-10" } };
  const narrow = projectRecord("memos", record(source), new Set<McpDomain>(["memos"]));
  assert.deepEqual(narrow.interaction, { channel: "call", occurred_on: "2026-11-10" });
  const wide = projectRecord("memos", record(source), new Set<McpDomain>(["memos", "contacts"]));
  assert.deepEqual(wide.interaction, { channel: "call", contact_ids: ["contact:c17"], occurred_on: "2026-11-10" });
});

test("end to end: a to-dos-and-notes connection sees no contact ids; adding contacts brings them back", async () => {
  const kit = mcpKit();
  const narrow = await kit.connect({ scopes: ["todos:read", "memos:read"] });
  for (const call of [kit.call(narrow.accessToken, "search_records", { domain: "todos" }), kit.call(narrow.accessToken, "search_records", { domain: "memos" }), kit.call(narrow.accessToken, "get_record", { id: "note:m32", type: "memo" })]) {
    const answer = await call;
    assert.equal(answer.status, 200);
    assert.ok(!answer.text.includes("contact:c17") && !answer.text.includes("contact_ids"), answer.text.slice(0, 300));
  }
  const wide = await kit.connect({ scopes: ["todos:read", "memos:read", "contacts:read"] });
  const memo = await kit.call(wide.accessToken, "get_record", { id: "note:m32", type: "memo" });
  assert.deepEqual(memo.data!.record.contact_ids, ["contact:c17"]);
});
