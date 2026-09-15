import assert from "node:assert/strict";
import test from "node:test";

import { activeMentionQuery, insertMention, updateMentionRanges } from "../src/screens/notes/NoteMentionEditor";

test("mention insertion uses UTF-16 offsets and a stable contact id", () => {
  const body = "联系 😀 @佐";
  const active = activeMentionQuery(body);
  assert.deepEqual(active, { start: 6, query: "佐" });
  const inserted = insertMention(body, active!, {
    id: "contact:sato", name: "佐藤", organization: "Studio", role: "设计师",
    nextAction: "", relationship: "", status: "active", valueLabels: [], valueScore: null,
  });
  assert.equal(inserted.body, "联系 😀 @佐藤 ");
  assert.deepEqual(inserted.mention, { contactId: "contact:sato", start: 6, end: 9, displayText: "@佐藤" });
  assert.equal(inserted.body.slice(inserted.mention.start, inserted.mention.end), inserted.mention.displayText);
});

test("ordinary edits shift unaffected UTF-16 mention ranges and drop edited mentions", () => {
  const body = "和 @佐藤 确认";
  const mention = { contactId: "contact:sato", start: 2, end: 5, displayText: "@佐藤" };
  assert.deepEqual(updateMentionRanges(body, `今天${body}`, [mention]), [{ ...mention, start: 4, end: 7 }]);
  assert.deepEqual(updateMentionRanges(body, "和 @林藤 确认", [mention]), []);
  assert.deepEqual(updateMentionRanges(body, `${body}时间`, [mention]), [mention]);
});
