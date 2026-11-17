import assert from "node:assert/strict";
import test from "node:test";

import { changeReasonLine, verifyChangeReasons } from "../../features/agent-v1/answer/change-check";
import { unsourcedDates, withoutUnsourcedDates } from "../../features/agent-v1/answer/dates";
import { gapWords, withoutWrongDirection } from "../../features/agent-v1/answer/gap-copy";
import type { Material } from "../../features/agent-v1/answer/schema";
import { runAgentGraph } from "../../features/agent-v1/graph/build";
import { captureTrace, deepseekStub, graphKit, json, part, recordAccessOf } from "./graph-kit";
import { schedule, smallWorld, todo } from "./read-kit";

/**
 * agent-design AG07 run-02 (exception under option A), each defect of the judges on b0d77d7, test first.
 */
const material = (handle: string, ref: string, at: string, text: string, header = ""): Material => ({ at, handle, header, kind: "memo", partId: "p1", ref, sentences: [{ id: 1, text }], version: "1" });
const LM02 = material("s2", "LM02", "2026-11-09T09:30:00.000Z", "张伟来电：项目交接延后，最快 1 月 5 日到岗，之前说的 12 月 1 日作废。");
const LM01 = material("s3", "LM01", "2026-10-08T10:00:00.000Z", "他说手上的项目 11 月底收尾，最快 12 月 1 日可以到岗。");

test("4 AE-RD-008 (run-02 gate): a question about an attached record reads that record, not other kinds the first layer added", async () => {
  const base = smallWorld();
  for (const record of base.records) if (record.userId === "user:a") record.userId = "actor:a";
  base.records.push(todo("actor:a", "task:t42", "给小林发修订报价", { plannedDate: "2026-11-18" }), schedule("actor:a", "personal:s1", "和田中吃饭", "2026-11-19T10:00:00.000Z"));
  const message = "@给小林发修订报价 计划哪天做";
  const model = deepseekStub([
    (call) => json({ parts: [part({ dataSources: ["orbit_records"], objectClues: [{ entity: "todo", referenceId: /(r\d) todo 给小林发修订报价/u.exec(call.user)![1], text: "@给小林发修订报价" }], requiredCapabilities: ["todo.read", "schedule.read"], sourceQuote: message })], plainChat: false }),
    (call) => json({ segments: [{ cites: [{ sentenceIds: [1], sourceRef: /(s\d+) — to-do/u.exec(call.user)?.[1] ?? "s1" }], partId: "p1", text: "计划11月18日做。" }] }),
  ]);
  const trace = captureTrace();
  try {
    const kit = graphKit(model.fetchImplementation, { records: recordAccessOf(base), references: [{ id: "task:t42", name: "给小林发修订报价", type: "todo" }] });
    await runAgentGraph(kit.deps, kit.input(message, { references: [{ id: "task:t42", type: "todo" }] }));
    const done = trace.events.find((event) => event.type === "read.done") as { reads?: string[] } | undefined;
    assert.deepEqual(done?.reads, ["todo:task:t42"], "only the attached to-do is read");
  } finally {
    trace.restore();
  }
});

test("1 AE-SCL-006: code's line states the earlier value from the superseding note and the reason, in zh/ja/en", () => {
  const checked = verifyChangeReasons([{ before: "12 月 1 日", older: "s3", reason: "项目交接延后", source: "s2" }], [LM02, LM01]);
  assert.deepEqual(checked.problems, []);
  const zh = changeReasonLine("zh", checked.changes, "张伟最快1月5日能到岗。", "Asia/Tokyo")!;
  assert.match(zh, /之前说的是12月1日/u, zh);
  assert.match(zh, /项目交接延后/u);
  assert.doesNotMatch(zh, /[一-鿿] \d|\d [一-鿿]/u, "R03");
  assert.match(changeReasonLine("ja", checked.changes, "…", "Asia/Tokyo")!, /以前は「?12月1日」?/u);
  assert.match(changeReasonLine("en", checked.changes, "…", "Asia/Tokyo")!, /earlier: 12 月 1 日|Dec 1|12月1日/u);
  // The earlier value must be the superseding note's own words.
  assert.equal(verifyChangeReasons([{ before: "12 月 15 日", older: "s3", reason: "项目交接延后", source: "s2" }], [LM02, LM01]).changes.length, 0);
  // run-02 gate (663fa96): the model gave "之前说的 12 月 1 日"; code keeps only the value, never "之前说的是之前说的…".
  const wordy = verifyChangeReasons([{ before: "之前说的 12 月 1 日", older: "s3", reason: "项目交接延后", source: "s2" }], [LM02, LM01]);
  const wordyLine = changeReasonLine("zh", wordy.changes, "张伟最快1月5日能到岗。", "Asia/Tokyo")!;
  assert.match(wordyLine, /（之前说的是12月1日；/u, wordyLine);
  assert.doesNotMatch(wordyLine, /之前说的是之前/u);
  assert.equal(verifyChangeReasons([{ before: "previously Dec 1", older: "s3", reason: "", source: "s2" }], [material("s2", "X2", "2026-11-09T09:30:00.000Z", "Emily called: previously Dec 1, now Jan 5 because the handover slipped."), LM01]).changes[0]?.before, "Dec 1");
  // Said in the answer already (value and reason): nothing added.
  assert.equal(changeReasonLine("zh", checked.changes, "之前说的12月1日作废了，因为项目交接延后。", "Asia/Tokyo"), null);
});

test("2 AE-SCL-007: a partial read's notice follows the read's direction; a model sentence saying the opposite is not delivered", () => {
  const zh = gapWords("zh");
  assert.match(zh.coverage(10, 120, "oldest"), /最早的10条.*更晚的/u);
  assert.match(zh.coverage(10, 120, "newest"), /最新的10条.*更早的/u);
  assert.match(gapWords("en").coverage(10, 120, "oldest"), /oldest 10.*newer/u);
  assert.match(gapWords("ja").coverage(10, 120, "newest"), /新しい10件.*古い/u);
  const said = "When you first met him he was at Kestrel Microsystems.(Note: 120 memos match; only the 10 oldest were available here, so there may be earlier ones.)";
  assert.equal(withoutWrongDirection(said, "oldest"), "When you first met him he was at Kestrel Microsystems.");
  assert.equal(withoutWrongDirection("最近一次是11月12日。可能还有更早的记录。", "newest"), "最近一次是11月12日。可能还有更早的记录。", "newest first: earlier ones may indeed be missing");
  assert.equal(withoutWrongDirection("最早一次是6月18日。可能还有更早的记录。", "oldest"), "最早一次是6月18日。");
});

test("3 AE-CTX-003: a date with no source in this turn is not delivered; a weekday a note says is not turned into the note's own date", () => {
  const sources = ["Call with Emily. She will send the dashboard spec by Friday.", "Today: 2026-11-15"];
  assert.deepEqual(unsourcedDates("Since Emily said she'd send the dashboard spec on Fri Nov 13, a light nudge Mon/Tue is fine.", sources), ["11-13"]);
  assert.deepEqual(unsourcedDates("She said by Friday.", sources), []);
  assert.deepEqual(unsourcedDates("你们11月12日聊过。", ["memo written 2026-11-12 (Thu)"]), [], "a record's own date is a source");
  assert.deepEqual(unsourcedDates("她11月13日会发。", ["She will send the spec by Friday.", "memo written 2026-11-13 (Fri)"], { weekdayNotes: ["memo written 2026-11-13 (Fri)"] }), ["11-13"], "the note says only 'Friday': its own date is not where that Friday comes from");
  assert.equal(withoutUnsourcedDates("Generally wait. Since Emily said she'd send it on Fri Nov 13, nudge Mon. Then stop.", ["11-13"]), "Generally wait. Then stop.");
});
