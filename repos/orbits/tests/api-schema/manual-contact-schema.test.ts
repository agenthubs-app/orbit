import assert from "node:assert/strict";
import test from "node:test";

import {
  manualContactCreateInputSchema,
  manualContactCreateResultSchema,
  manualContactDuplicateCheckInputSchema,
  manualContactDuplicateCheckResultSchema,
  manualContactOrganizationSuggestionsResultSchema,
  manualContactUndoResultSchema,
} from "../../shared/api-schema/manual-contact";

// R12 契约（DESIGN §4.1）：请求体严格，响应宽进。
const candidate = { contactId: "contact:a", displayName: "山田 太郎", organization: "", role: "", email: "", phone: "", address: "", matchedOn: ["name"], identical: false };

test("create input: name required, strict body, merge rules", () => {
  assert.equal(manualContactCreateInputSchema.safeParse({ displayName: "山田 太郎", idempotencyKey: "k1" }).success, true);
  for (const invalid of [
    { displayName: "", idempotencyKey: "k" },
    { displayName: "   ", idempotencyKey: "k" },
    { displayName: "A" },
    { displayName: "A", idempotencyKey: "k", extra: 1 },
    { displayName: "A", idempotencyKey: "k", fieldChoices: { email: "incoming" } },
    { displayName: "A", idempotencyKey: "k", mergeIntoContactId: "contact:a", allowDuplicate: true },
    { displayName: "A", idempotencyKey: "k", mergeIntoContactId: "contact:a", fieldChoices: { address: "incoming" } },
    { displayName: "A", idempotencyKey: "k", metContext: { kind: "event" } },
    { displayName: "A", idempotencyKey: "k", metContext: { kind: "party", label: "x" } },
  ]) assert.equal(manualContactCreateInputSchema.safeParse(invalid).success, false, JSON.stringify(invalid));
  const merge = { displayName: "A", idempotencyKey: "k", mergeIntoContactId: "contact:a", fieldChoices: { email: "incoming", organization: "existing" }, metContext: { kind: "event", eventId: "event:1" }, note: "展示会で" };
  assert.deepEqual(manualContactCreateInputSchema.parse(merge), merge);
});

test("create result: unknown outcome reads as duplicate_review; unreadable candidates are skipped", () => {
  assert.deepEqual(manualContactCreateResultSchema.parse({ outcome: "created", contactId: "contact:n", undoUntil: "2026-10-11T00:10:00.000Z" }), { outcome: "created", contactId: "contact:n", undoUntil: "2026-10-11T00:10:00.000Z" });
  assert.equal(manualContactCreateResultSchema.parse({ outcome: "queued_somewhere", contactId: "contact:n" }).outcome, "duplicate_review");
  const review = manualContactCreateResultSchema.parse({ outcome: "duplicate_review", candidates: [candidate, { broken: true }, { ...candidate, matchedOn: ["later"] }], future: 1 });
  assert.equal(review.candidates?.length, 2);
  assert.deepEqual(review.candidates?.[1]?.matchedOn, ["name_organization"]);
  assert.equal("future" in review, false, "unknown keys are dropped, not refused");
});

test("duplicate check: strict input, tolerant result", () => {
  assert.equal(manualContactDuplicateCheckInputSchema.safeParse({ displayName: "山田" }).success, true);
  assert.equal(manualContactDuplicateCheckInputSchema.safeParse({ displayName: "山田", role: "CEO" }).success, false);
  assert.equal(manualContactDuplicateCheckInputSchema.safeParse({ displayName: "" }).success, false);
  assert.equal(manualContactDuplicateCheckResultSchema.parse({ candidates: [candidate, 3] }).candidates.length, 1);
});

test("organization suggestions and undo", () => {
  assert.deepEqual(manualContactOrganizationSuggestionsResultSchema.parse({ organizations: [{ name: "株式会社オービット", contactCount: 3 }, { name: "", contactCount: 1 }] }), { organizations: [{ name: "株式会社オービット", contactCount: 3 }] });
  assert.deepEqual(manualContactUndoResultSchema.parse({ outcome: "undone" }), { outcome: "undone" });
  assert.deepEqual(manualContactUndoResultSchema.parse({ outcome: "something_new" }), { outcome: "undone" });
});

test("create input (R12 review M3): every text has a length cap — ids at 200 like idempotencyKey", () => {
  const long = (n: number) => "x".repeat(n);
  const base = { displayName: "A", idempotencyKey: "k" };
  assert.equal(manualContactCreateInputSchema.safeParse({ ...base, metContext: { kind: "event", eventId: long(200) } }).success, true);
  assert.equal(manualContactCreateInputSchema.safeParse({ ...base, metContext: { kind: "event", eventId: long(201) } }).success, false);
  assert.equal(manualContactCreateInputSchema.safeParse({ ...base, mergeIntoContactId: long(200) }).success, true);
  assert.equal(manualContactCreateInputSchema.safeParse({ ...base, mergeIntoContactId: long(201) }).success, false);
  assert.equal(manualContactCreateInputSchema.safeParse({ ...base, mergeIntoContactId: long(200_000) }).success, false);
  for (const [field, max] of [["displayName", 120], ["organization", 200], ["role", 120], ["email", 254], ["phone", 40], ["note", 2000]] as const) {
    assert.equal(manualContactCreateInputSchema.safeParse({ ...base, [field]: long(max + 1) }).success, false, field);
  }
  assert.equal(manualContactCreateInputSchema.safeParse({ ...base, metContext: { kind: "other", label: long(121) } }).success, false);
});
