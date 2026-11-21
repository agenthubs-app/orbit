/**
 * AG21c R58: a relative day inside a note ("spec by Friday") was read against today by the answer model, differently per
 * language (the Japanese answer said it was still coming, the English one that it had passed). Code resolves the note's own
 * relative day words against the day the note was written, by one rule for all languages, and gives that day to the
 * answer step with whether it has passed. Invented notes (zh, ja, en).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { materialOf } from "../../features/agent-v1/answer/materials";
import type { RecordView } from "../../features/agent-v1/domains/types";

const ZONE = "Asia/Tokyo";
const MONDAY = "2026-11-16T01:00:00.000Z";
const note = (body: string, createdAt: string): RecordView => ({ fields: { body, contactIds: [], createdAt, title: "t" }, id: "n1", kind: "memo", ref: "memo:n1", updatedAt: createdAt, version: "1" });
const dateLines = (body: string, createdAt: string, now = MONDAY) => materialOf(note(body, createdAt), "p1", "s1", { names: new Map(), now, timeZone: ZONE }).sentences.filter((sentence) => sentence.text.startsWith("Code's date note"));

// Written on Friday 2026-11-13 (Tokyo).
const FRIDAY_NOTE = "2026-11-13T02:00:00.000Z";

test("the same Friday in every language, counted from the note's own day", () => {
  for (const body of ["Talked with Brannock. He will send the spec by Friday.", "和祁通了电话。他说周五前把规格发过来。", "祁さんと電話。金曜までに仕様を送ってくれるとのこと。"]) {
    const lines = dateLines(body, FRIDAY_NOTE);
    assert.equal(lines.length, 1, body);
    assert.match(lines[0].text, /means 2026-11-20 \(Fri\)/u, lines[0].text);
    assert.match(lines[0].text, /still ahead/u);
    assert.match(lines[0].text, /written \(2026-11-13 \(Fri\)\)/u);
  }
});

test("a day that has passed is said so; a calendar date is left to the record; the body's numbers hold", () => {
  const lines = dateLines("约了明天下午见面。", "2026-11-10T02:00:00.000Z");
  assert.match(lines[0].text, /means 2026-11-11 \(Wed\)/u);
  assert.match(lines[0].text, /has passed/u);
  assert.equal(dateLines("11月20日交稿。", FRIDAY_NOTE).length, 0);
  const material = materialOf(note("First line. Second line by next Monday.", FRIDAY_NOTE), "p1", "s1", { names: new Map(), now: MONDAY, timeZone: ZONE });
  assert.deepEqual(material.sentences.slice(0, 2).map((sentence) => sentence.id), [1, 2]);
  assert.match(material.sentences[2].text, /in sentence 2, "next Monday" means 2026-11-16 \(Mon\)/u);
  assert.match(material.sentences[2].text, /that is today/u);
});
