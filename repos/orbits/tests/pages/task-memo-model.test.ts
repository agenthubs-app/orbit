import assert from "node:assert/strict";
import test from "node:test";

import { memoPage, memoRequest, memoTabForKind, rebaseMemoMentions } from "../../app/(app)/app/orbit-2026/memo/memo-model";

const first = { id: "n1", title: "面談", body: "Discussed next steps", version: 2, noteKind: "meeting", contactIds: ["c1"], eventIds: [], manualContactIds: ["c1"], mentions: [], updatedAt: "2026-10-19T12:00:00Z" };

test("memo page keeps valid rows and the server total when one row is unfamiliar", () => {
  assert.deepEqual(memoPage({ notes: [first, { ...first, id: "n2", noteKind: "future" }, { ...first, id: "n3", body: null }], total: 9, nextCursor: "next" }), {
    notes: [first, { ...first, id: "n2", noteKind: "future" }], total: 9, nextCursor: "next",
  });
  assert.equal(memoTabForKind("voice"), "free");
  assert.equal(memoTabForKind("meeting"), "meeting");
});

test("memo write carries explicit kind and plan use, and refuses an ambiguous plan contact", () => {
  assert.deepEqual(memoRequest({ title: "Meeting", body: "Body", kind: "meeting", contactIds: ["c1"], eventIds: [], usedForPlan: true }), {
    title: "Meeting", body: "Body", noteKind: "meeting", usedForPlan: true,
    manualContactIds: ["c1"], eventIds: [], mentions: [],
  });
  assert.throws(() => memoRequest({ title: "Meeting", body: "Body", kind: "meeting", contactIds: ["c1", "c2"], eventIds: [], usedForPlan: true }), /one contact/u);
  assert.equal(memoRequest({ title: "Voice", body: "edited", kind: "voice", contactIds: [], eventIds: [], usedForPlan: false }).noteKind, "voice");
});

test("editing around UTF-16 mentions shifts event tokens and blocks damage to unknown tokens", () => {
  const event = { entityType: "event" as const, eventId: "e1", start: 3, end: 5, displayText: "@会" };
  assert.deepEqual(rebaseMemoMentions("🙂 @会 next", "x🙂 @会 next", [event]), [{ ...event, start: 4, end: 6 }]);
  const unknown = { entityType: "future", start: 3, end: 5, displayText: "@会" } as never;
  assert.equal(rebaseMemoMentions("🙂 @会 next", "🙂 @ next", [unknown]), null);
});
