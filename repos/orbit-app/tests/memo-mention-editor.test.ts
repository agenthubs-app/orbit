import assert from "node:assert/strict";
import test from "node:test";

import { activeMemoMentionQuery, insertMemoMention, updateMemoMentionRanges } from "../src/screens/memo/memo-mention-model";

test("@ alone searches, and inserting an event creates a UTF-16 ranged event token", () => {
  const body = "🙂 @";
  const active = activeMemoMentionQuery(body);
  assert.deepEqual(active, { start: 3, query: "" });
  assert.deepEqual(insertMemoMention(body, active!, { id: "event:1", label: "東京会", kind: "event" }), {
    body: "🙂 @東京会 ", mention: { entityType: "event", eventId: "event:1", start: 3, end: 7, displayText: "@東京会" },
  });
});

test("edits around tokens preserve both branches, while unknown tokens cannot be damaged", () => {
  const contact = { contactId: "contact:1", start: 0, end: 2, displayText: "@人" };
  const event = { entityType: "event" as const, eventId: "event:1", start: 3, end: 5, displayText: "@会" };
  assert.deepEqual(updateMemoMentionRanges("@人 @会", "🙂 @人 @会", [contact, event]), [
    { ...contact, start: 3, end: 5 }, { ...event, start: 6, end: 8 },
  ]);
  assert.deepEqual(updateMemoMentionRanges("@人 @会", "@人 @", [contact, event]), [contact]);
  const unknown = { entityType: "future", start: 3, end: 5, displayText: "@会" } as never;
  assert.equal(updateMemoMentionRanges("@人 @会", "@人 @", [unknown]), null);
});
