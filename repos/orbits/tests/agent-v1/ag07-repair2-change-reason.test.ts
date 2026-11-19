import assert from "node:assert/strict";
import test from "node:test";

import { changeCheckOf, changeReasonLine, verifyChangeReasons } from "../../features/agent-v1/answer/change-check";
import { parseAnswerOutput, type Material } from "../../features/agent-v1/answer/schema";

/**
 * agent-design AG07 repair 2, item 7 (AE-SCL-006 R2): when the answer reports that a newer record replaces what an
 * older one said, the reason the newer record gives is stated. The model names the change as a structured entry
 * ("changes": source, older, reason copied from the source); code checks it against this turn's materials and
 * writes the sentence — the model's own words never carry the reason.
 */
const material = (handle: string, ref: string, at: string, text: string): Material => ({ at, handle, header: "", kind: "memo", partId: "p1", ref, sentences: [{ id: 1, text }], version: "1" });
const LM02 = material("s2", "LM02", "2026-11-09T09:30:00.000Z", "张伟来电：项目交接延后，最快 1 月 5 日到岗，之前说的 12 月 1 日作废。");
const LM01 = material("s3", "LM01", "2026-10-08T10:00:00.000Z", "他说手上的项目 11 月底收尾，最快 12 月 1 日可以到岗。");
const profile: Material = { at: "2026-11-09T00:00:00.000Z", handle: "s1", header: "", kind: "contact", partId: "p1", profile: { organization: "曜石半导体", role: null, updatedAt: "2026-11-09T00:00:00.000Z" }, ref: "C20", sentences: [], version: "1" };

test("item 7: the check is asked when two dated records were read and one of them speaks of a change", () => {
  assert.equal(changeCheckOf([profile, LM02, LM01]), true);
  assert.equal(changeCheckOf([profile, LM01]), false, "one record: nothing replaces anything");
  assert.equal(changeCheckOf([material("s2", "M1", "2026-11-09T00:00:00.000Z", "聊了报价初稿。"), material("s3", "M2", "2026-11-01T00:00:00.000Z", "第一次见面。")]), false, "no record speaks of a change");
});

test("item 7: the answer's \"changes\" entries are parsed and verified against the materials", () => {
  const parsed = parseAnswerOutput(JSON.stringify({ segments: [{ changes: [{ older: "s3", reason: "项目交接延后", source: "s2" }], cites: [{ sentenceIds: [1], sourceRef: "s2" }], partId: "p1", text: "最快 1 月 5 日到岗，之前说的 12 月 1 日已作废。" }] }));
  assert.equal(parsed.ok, true);
  const segment = parsed.ok ? parsed.value.segments[0] : null;
  const checked = verifyChangeReasons(segment?.changes, [profile, LM02, LM01]);
  assert.deepEqual(checked.problems, []);
  assert.equal(checked.changes.length, 1);
  assert.equal(checked.changes[0].reason, "项目交接延后");
});

test("item 7: a reason that is not the newer record's own words, or an 'older' that is not older, is refused", () => {
  assert.equal(verifyChangeReasons([{ older: "s3", reason: "他换了工作", source: "s2" }], [LM02, LM01]).changes.length, 0);
  assert.equal(verifyChangeReasons([{ older: "s2", reason: "项目交接延后", source: "s3" }], [LM02, LM01]).changes.length, 0);
  assert.ok(verifyChangeReasons([{ older: "s3", reason: "项目交接延后", source: "s9" }], [LM02, LM01]).problems.length > 0);
  assert.deepEqual(verifyChangeReasons([], [LM02, LM01]), { changes: [], problems: [] }, "[] says nothing was replaced");
  // AG06 rerun on 7ab2350: the model gave the words that cancel ("之前说的 12 月 1 日作废") as the reason.
  const cancelWords = verifyChangeReasons([{ older: "s3", reason: "之前说的 12 月 1 日作废", source: "s2" }], [LM02, LM01]);
  assert.equal(cancelWords.changes.length, 0, "the words that cancel the old value are not a reason");
  assert.ok(cancelWords.problems.some((problem) => /why/u.test(problem)));
});

test("item 7: code states the reason in the answer's language, unless the answer already says it", () => {
  const changes = verifyChangeReasons([{ older: "s3", reason: "项目交接延后", source: "s2" }], [LM02, LM01]).changes;
  const zh = changeReasonLine("zh", changes, "张伟上次说最快 1 月 5 日到岗，之前说的 12 月 1 日已作废。", "Asia/Tokyo");
  assert.ok(zh && zh.includes("项目交接延后") && zh.includes("11月9日"), zh ?? "");
  assert.doesNotMatch(zh!, /[一-鿿] \d|\d [一-鿿]/u, "R03: no space between Chinese and numbers");
  assert.equal(changeReasonLine("zh", changes, "因为项目交接延后，最快 1 月 5 日到岗。", "Asia/Tokyo"), null);
  assert.match(changeReasonLine("ja", changes, "…", "Asia/Tokyo") ?? "", /項目|理由/u);
  assert.match(changeReasonLine("en", changes, "…", "Asia/Tokyo") ?? "", /Nov 9/u);
  assert.equal(changeReasonLine("zh", [], "…", "Asia/Tokyo"), null);
  assert.equal(changeReasonLine("zh", verifyChangeReasons([{ older: "s3", reason: "", source: "s2" }], [LM02, LM01]).changes, "…", "Asia/Tokyo"), null, "a record that gives no reason: nothing is added");
});
