/**
 * R16 #2（2026-10-12 用户拍板）：LinkedIn 的连接日期 → 「加入时间」。纯函数（`shared/compute/linkedin-connected-on.ts`）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  earliestAddedAt,
  linkedinConnectedAtFor,
  linkedinConnectedOnFromNotes,
  parseLinkedinConnectedOn,
} from "../../shared/compute/linkedin-connected-on";
import { tokyoDayOf } from "../../shared/compute/completion-question-rules";

test("common export formats → noon (JST) of that Tokyo day", () => {
  const cases: [string, string][] = [
    ["05 Jan 2024", "2024-01-05T03:00:00.000Z"],
    ["5 Jan 2024", "2024-01-05T03:00:00.000Z"],
    ["05-Jan-2024", "2024-01-05T03:00:00.000Z"],
    ["5-Jan-24", "2024-01-05T03:00:00.000Z"],
    ["05 January 2024", "2024-01-05T03:00:00.000Z"],
    ["Jan 5, 2024", "2024-01-05T03:00:00.000Z"],
    ["Sept 30 2023", "2023-09-30T03:00:00.000Z"],
    ["2024-01-05", "2024-01-05T03:00:00.000Z"],
    ["2024/1/5", "2024-01-05T03:00:00.000Z"],
    ["2024年1月5日", "2024-01-05T03:00:00.000Z"],
    ["１/５/２０２４", "2024-01-05T03:00:00.000Z"],
    ["1/5/2024", "2024-01-05T03:00:00.000Z"],
    ["25/12/2023", "2023-12-25T03:00:00.000Z"],
    ["  29 Feb 2024 ", "2024-02-29T03:00:00.000Z"],
  ];
  for (const [raw, expected] of cases) assert.equal(parseLinkedinConnectedOn(raw), expected, raw);
  assert.equal(tokyoDayOf(parseLinkedinConnectedOn("05 Jan 2024")!), "2024-01-05", "the Tokyo day is the written day");
});

test("unreadable or impossible dates count as missing", () => {
  for (const raw of ["", "   ", "yesterday", "05 Foo 2024", "30 Feb 2024", "29 Feb 2023", "2024-13-01", "13/13/2024", "2024", "05 Jan", null, undefined]) {
    assert.equal(parseLinkedinConnectedOn(raw as string | null | undefined), null, String(raw));
  }
});

test("a connection date later than the import day is ignored; the same day is kept", () => {
  const importedAt = "2026-10-12T01:00:00.000Z"; // 東京 10/12 10:00
  assert.equal(linkedinConnectedAtFor("05 Jan 2024", importedAt), "2024-01-05T03:00:00.000Z");
  assert.equal(linkedinConnectedAtFor("12 Oct 2026", importedAt), "2026-10-12T03:00:00.000Z", "same Tokyo day is kept");
  assert.equal(linkedinConnectedAtFor("13 Oct 2026", importedAt), null, "future → ignored");
  assert.equal(linkedinConnectedAtFor("not a date", importedAt), null);
  assert.equal(linkedinConnectedAtFor("05 Jan 2024", "garbage"), null);
});

test("legacy notes: the import's 「LinkedIn 连接日期: …」 line", () => {
  assert.equal(linkedinConnectedOnFromNotes("LinkedIn: https://www.linkedin.com/in/x\nLinkedIn 连接日期: 05 Jan 2024"), "05 Jan 2024");
  assert.equal(linkedinConnectedOnFromNotes("メモ\n  LinkedIn 连接日期: 1/5/2024  \nLinkedIn 连接日期: 02 Feb 2025"), "1/5/2024", "first line wins");
  assert.equal(linkedinConnectedOnFromNotes("LinkedIn: https://www.linkedin.com/in/x"), null);
  assert.equal(linkedinConnectedOnFromNotes(undefined), null);
});

test("added-at = the earlier of connected and created", () => {
  assert.equal(earliestAddedAt("2026-10-12T01:00:00.000Z", "2024-01-05T03:00:00.000Z"), "2024-01-05T03:00:00.000Z");
  assert.equal(earliestAddedAt("2026-10-12T01:00:00.000Z", "2026-10-12T03:00:00.000Z"), "2026-10-12T01:00:00.000Z", "noon later than a morning import → created");
  assert.equal(earliestAddedAt("2026-10-12T01:00:00.000Z", null), "2026-10-12T01:00:00.000Z");
  assert.equal(earliestAddedAt("2026-10-12T01:00:00.000Z", "bad"), "2026-10-12T01:00:00.000Z");
});
