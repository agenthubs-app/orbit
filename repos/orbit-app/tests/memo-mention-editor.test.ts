import assert from "node:assert/strict";
import test from "node:test";

import { activeMemoMentionQuery, bodyAfterTitle, insertMemoMention, updateMemoMentionRanges } from "../src/screens/memo/memo-mention-model";

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

test("a title taken from the first line is not repeated in the body; mention ranges shift with it", () => {
  const mention = { entityType: "contact" as const, contactId: "c1", start: 22, end: 27, displayText: "@Sato" };
  assert.deepEqual(bodyAfterTitle("Lunch notes", "Lunch notes\nFollow up @Sato", [{ ...mention, start: 22, end: 27 }]),
    { body: "Follow up @Sato", mentions: [{ ...mention, start: 10, end: 15 }] });
  assert.deepEqual(bodyAfterTitle("Lunch notes", "Lunch notes", []), { body: "", mentions: [] });
  // A typed title, a truncated title or a mention on the first line keeps the whole body.
  assert.equal(bodyAfterTitle("Plan", "Lunch notes\nmore", []).body, "Lunch notes\nmore");
  assert.equal(bodyAfterTitle("Lunch…", "Lunch notes", []).body, "Lunch notes");
  const onFirst = [{ ...mention, start: 0, end: 5 }];
  assert.equal(bodyAfterTitle("@Sato", "@Sato\nx", onFirst).body, "@Sato\nx");
});
