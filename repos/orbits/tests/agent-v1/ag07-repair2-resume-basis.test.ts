import assert from "node:assert/strict";
import test from "node:test";

import { keepEarlierBasis } from "../../features/agent-v1/entry/resume-basis";
import { resumedAnswer } from "../../features/agent-v1/entry/store";
import type { AgentResultDocument } from "../../shared/contract/agent-v1";

/**
 * agent-design AG07 repair 2, item 6 (AE-XL-003 R1, AE-XL-002): a paused request that resumes rewrites its answer;
 * the basis line and the sourceRefs of the read the answer still rests on stay. The user never ends with no link
 * to the note the answer quotes.
 */
const basis = { links: [{ contactId: "contact:c17", id: "M31", label: "11月12日的笔记", type: "memo" as const }], text: "按你11月12日记的笔记回答" };
const paused = {
  answer: { basis, sourceRefs: ["M31"], text: "上次聊了报价初稿。\n\n「把报价待办改到周五」要改哪一条？" },
  partResults: [{ partId: "p1", route: "read", status: "answered" }, { partId: "p2", route: "propose_write", status: "awaiting_clarification" }],
} as unknown as AgentResultDocument;

test("item 6: the resumed answer keeps the basis line and sourceRefs of the read it still carries", () => {
  const resumed = { basis: null, partResults: [{ partId: "p1", route: "read", status: "answered" }, { partId: "p2", route: "propose_write", status: "awaiting_confirmation" }], sourceRefs: [] as string[] };
  const kept = keepEarlierBasis(paused, resumed as never);
  assert.deepEqual(kept.basis, basis);
  assert.deepEqual(kept.sourceRefs, ["M31"]);
});

test("item 6: a resume that wrote its own basis keeps its own", () => {
  const own = { links: [{ id: "M40", label: "11月14日的笔记", type: "memo" as const }], text: "按你11月14日记的笔记回答" };
  const kept = keepEarlierBasis(paused, { basis: own, partResults: paused.partResults, sourceRefs: ["M40"] } as never);
  assert.deepEqual(kept.basis, own);
  assert.deepEqual(kept.sourceRefs, ["M40"]);
});

test("item 6: nothing is carried over when the read is no longer answered in the resumed result", () => {
  const kept = keepEarlierBasis(paused, { basis: null, partResults: [{ partId: "p1", route: "read", status: "unfinished" }], sourceRefs: [] } as never);
  assert.equal(kept.basis, null);
  assert.deepEqual(kept.sourceRefs, []);
});

test("item 6: the stored document of a resumed request keeps the basis line (and the new card line) when its answers are joined", () => {
  const joined = resumedAnswer(paused.answer!, { cardLine: "确认卡（修改1项）：\n① …", sourceRefs: [], text: "确认卡（修改1项）：\n① …" });
  assert.deepEqual(joined?.basis, basis, "the basis of the read the answer rests on stays");
  assert.deepEqual(joined?.sourceRefs, ["M31"]);
  assert.equal(joined?.cardLine, "确认卡（修改1项）：\n① …");
  assert.match(joined?.text ?? "", /^上次聊了报价初稿。[\s\S]*确认卡（修改1项）/u);
  const own = { links: [{ id: "M40", label: "11月14日的笔记", type: "memo" as const }], text: "按你11月14日记的笔记回答" };
  assert.deepEqual(resumedAnswer(paused.answer!, { basis: own, sourceRefs: ["M40"], text: "又读了一条。" })?.basis, own, "a resume with its own basis keeps its own");
  assert.equal(resumedAnswer(paused.answer!, null), paused.answer, "nothing new: the earlier answer stays");
});

test("item 6: no earlier document, nothing to keep", () => {
  const kept = keepEarlierBasis(null, { basis: null, partResults: [], sourceRefs: ["X1"] } as never);
  assert.equal(kept.basis, null);
  assert.deepEqual(kept.sourceRefs, ["X1"]);
});
