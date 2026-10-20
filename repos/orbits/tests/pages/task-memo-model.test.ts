import assert from "node:assert/strict";
import test from "node:test";

import { activeMemoMentionQuery, insertMemoMention, memoContactIds, memoPage, memoRequest, memoTabForKind, rebaseMemoMentions } from "../../app/(app)/app/orbit-2026/memo/memo-model";

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

test("@ lookup and insertion use UTF-16 cursor offsets without damaging nearby tokens", () => {
  const body = "🙂 @秋山 next @会議 end";
  const existing = { entityType: "event" as const, eventId: "event:1", start: 12, end: 15, displayText: "@会議" };
  const active = activeMemoMentionQuery(body, 6, [existing]);
  assert.deepEqual(active, { start: 3, end: 6, query: "秋山" });
  assert.equal(activeMemoMentionQuery(body, 15, [existing]), null, "existing token cannot open a second candidate list");
  assert.deepEqual(insertMemoMention(body, [existing], active!, { id: "contact:1", label: "秋山さん", kind: "contact" }), {
    body: "🙂 @秋山さん  next @会議 end",
    mentions: [
      { entityType: "contact", contactId: "contact:1", start: 3, end: 8, displayText: "@秋山さん" },
      { ...existing, start: 15, end: 18 },
    ],
  });
});

test("a contact @token alone qualifies a meeting memo for explicit plan use", () => {
  const mention = { entityType: "contact" as const, contactId: "contact:1", start: 0, end: 3, displayText: "@秋山" };
  assert.deepEqual(memoContactIds([], [mention]), ["contact:1"]);
  assert.equal(memoRequest({ title: "Meeting", body: "@秋山", kind: "meeting", contactIds: [], eventIds: [], mentions: [mention], usedForPlan: true }).usedForPlan, true);
});

test("memo save preserves body spacing so mention offsets still name the same text", () => {
  const mention = { entityType: "contact" as const, contactId: "contact:1", start: 2, end: 5, displayText: "@秋山" };
  const saved = memoRequest({ title: "  Meeting  ", body: "  @秋山  ", kind: "free", contactIds: [], eventIds: [], mentions: [mention], usedForPlan: false });
  assert.equal(saved.title, "Meeting");
  assert.equal(saved.body.slice(saved.mentions[0]!.start, saved.mentions[0]!.end), saved.mentions[0]!.displayText);
});
