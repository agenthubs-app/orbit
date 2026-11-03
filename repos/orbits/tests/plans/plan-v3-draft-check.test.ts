/**
 * R33 SC-R33-02：`checkDraftV3` 对四种坏输出各自处置（无来源句 → 删句；加粗非原句子串 / >14 字 → 去标记；分量与对比条判定
 * 相反 → 自动修正一次并合计 100；引用不存在的 sourceId / questionKey → 删句），修正后仍不合规 → ok: false；
 * 一份好输入取自 mock（三种目标各一份，0 次修理）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_EVENT_SLOT, PLAN_GOAL_TEMPLATES, planShortNameCandidates } from "../../shared/compute/plan-templates";
import type { PlanGoalKind, PlanSource } from "../../shared/contract/plan-v2";
import { createMockPlanFlowAi, mockDraftV3 } from "../../features/plans/v2/ai/mock";
import { checkDraftV3, rerankAllocationsByVerdict, summaryToMarkedText, type ContentCheckInputV3 } from "../../features/plans/v2/ai/schemas-v3";
import type { DraftOutputV3, FirstDraftInputV3, PlanAiContext } from "../../features/plans/v2/ai/types";

const CONTEXT: PlanAiContext = { actorId: "actor:alice", language: "ja", ledgerKey: "draft:intake-1:1", now: new Date("2026-11-01T01:00:00Z") };
const SOURCES: PlanSource[] = [
  { id: "S1", kind: "landscape", landscapeId: "L-101", version: 1 },
  { id: "S2", kind: "web", url: "https://example.jp/cvc", title: "CVC 動向", fetchedAt: "2026-11-01T00:00:00.000Z", snippet: "…", query: "CVC 投資 動向" },
];

function inputFor(kind: PlanGoalKind = "fundraising", overrides: Partial<FirstDraftInputV3> = {}): FirstDraftInputV3 {
  const template = PLAN_GOAL_TEMPLATES[kind];
  const slots = template.slots.filter((slot) => slot.slot !== PLAN_EVENT_SLOT).map((slot) => ({
    allocation: slot.allocation, emoji: slot.emoji, shortNames: planShortNameCandidates(slot.slot, []).map((id) => ({ id, label: id })), slot: slot.slot, targetCount: slot.targetCount,
  }));
  const event = template.slots.find((slot) => slot.slot === PLAN_EVENT_SLOT)!;
  return {
    answerKeys: ["F3"],
    background: "goal: x",
    contacts: [{ alias: "C1", industry: null, name: "A", notes: null, organization: null, role: null, tags: [] }],
    eventSlot: { allocation: event.allocation, targetCount: event.targetCount },
    gaps: [],
    goalKind: kind,
    goalText: "シリーズA を年内に",
    landscape: [{ id: "L-101", summary: "s", title: "t", version: 1 }],
    premise: [],
    purpose: null,
    slots,
    sources: SOURCES,
    ...overrides,
  };
}

const checkInput = (input: FirstDraftInputV3, enforceTemplate = true): ContentCheckInputV3 => ({
  aliases: new Set(input.contacts.map((contact) => contact.alias)), answerKeys: new Set(input.answerKeys), enforceTemplate, goalKind: input.goalKind, landscape: input.landscape, slots: input.slots, sources: input.sources,
});

function good(kind: PlanGoalKind = "fundraising"): { draft: DraftOutputV3; input: FirstDraftInputV3 } {
  const input = inputFor(kind);
  return { draft: mockDraftV3(input, "ja"), input };
}

test("mock v3 drafts for the three goals pass checkDraftV3 without repairs and come back as schemaVersion 3", async () => {
  for (const kind of ["fundraising", "launch", "sales"] as const) {
    const input = inputFor(kind);
    const checked = checkDraftV3(structuredClone(mockDraftV3(input, "ja")), checkInput(input));
    assert.equal(checked.ok, true, `${kind}: ${JSON.stringify((checked as { issues?: string[] }).issues)}`);
    if (checked.ok !== true) return;
    assert.equal(checked.repairs, undefined, `${kind}: no repairs`);
    const value = checked.value;
    // R35：接口返回的就是校验后的 DraftV3（mock 也过同一校验）。
    const outcome = await createMockPlanFlowAi().firstDraftV3(input, CONTEXT);
    assert.equal(outcome.ok, true, kind);
    assert.deepEqual((outcome as { value: unknown }).value, value, `${kind}: the mock returns the checked draft`);
    assert.equal(value.schemaVersion, 3);
    assert.ok(value.summary.text.length > 0 && value.summary.refs.length === 3, "three sentences, each with a ref");
    assert.ok(value.summary.marks.every((mark) => mark.end - mark.start > 0 && mark.end <= value.summary.text.length));
    assert.ok(value.personTypes.every((type) => /^step-[1-3]$/u.test(type.stepKey)), "every type belongs to a step");
    assert.equal(value.personTypes.reduce((sum, type) => sum + type.allocation, 0) + value.event.allocation, 100);
    assert.deepEqual(value.sources, SOURCES);
    assert.deepEqual(value.citations, [{ id: "L-101", version: 1 }], "citations derive from the landscape sources actually used");
    assert.ok(["feasible", "conditional", "not_recommended"].includes(value.verdict));
  }
  // 其他目标类型也能起草（按模板生成）。
  for (const kind of ["hiring", "partnership", "career"] as const) {
    const input = inputFor(kind);
    assert.equal(checkDraftV3(mockDraftV3(input, "zh"), checkInput(input)).ok, true, kind);
  }
});

test("a sentence without any source is deleted and recorded in repairs", () => {
  const { draft, input } = good();
  draft.summary[1] = { ...draft.summary[1]!, refs: [] };
  const checked = checkDraftV3(draft, checkInput(input));
  assert.equal(checked.ok, true);
  if (checked.ok !== true) return;
  assert.deepEqual(checked.repairs, ["summary_sentence_dropped:1:no_source"]);
  assert.equal(checked.value.summary.refs.length, 2);
  assert.ok(!checked.value.summary.text.includes(draft.summary[1]!.text));
  // 全部句子都没有来源 → 没能起草。
  const bare = { ...draft, summary: draft.summary.map((sentence) => ({ ...sentence, refs: [] })) };
  const refused = checkDraftV3(bare, checkInput(input));
  assert.equal(refused.ok, false);
  assert.ok((refused as { issues: string[] }).issues.some((issue) => issue.startsWith("summary:")));
});

test("a bold span that is not a substring of its sentence, or longer than 14 characters, loses the mark", () => {
  const { draft, input } = good();
  draft.summary[0] = { ...draft.summary[0]!, bold: "この文には無い語" };
  draft.summary[2] = { ...draft.summary[2]!, bold: draft.summary[2]!.text.slice(0, 20) };
  const checked = checkDraftV3(draft, checkInput(input));
  assert.equal(checked.ok, true);
  if (checked.ok !== true) return;
  assert.deepEqual(checked.repairs, ["summary_mark_dropped:0", "summary_mark_dropped:2"]);
  assert.deepEqual(checked.value.summary.marks, [], "no valid mark remains (sentence 2 had none)");
  // 直接看拼句：合法的加粗落在原句的位置上。
  const marked = summaryToMarkedText([{ bold: "VC", refs: [{ kind: "source", sourceId: "S1" }], text: "シード後は VC が中心。" }, { bold: null, refs: [{ kind: "answer", questionKey: "F3" }], text: "CVC は並行。" }], checkInput(input), []);
  assert.equal(marked.text, "シード後は VC が中心。CVC は並行。");
  assert.deepEqual(marked.marks, [{ end: 8, start: 6 }]);
  assert.deepEqual(marked.refs.map((ref) => [ref.start, ref.end, ref.ref.kind]), [[0, 13, "source"], [13, 21, "answer"]]);
});

test("allocations that contradict the comparison verdicts are re-ranked once, keep the 5-point steps and still total 100", () => {
  const { draft, input } = good();
  // 把 preferred 的 VC（30）和 possible 的 CVC（15）换过来：not_recommended ≤ possible ≤ preferred 被打破。
  const vc = draft.personTypes.find((type) => type.slot === "vc_partner")!;
  const cvc = draft.personTypes.find((type) => type.slot === "cvc")!;
  [vc.allocation, cvc.allocation] = [cvc.allocation, vc.allocation];
  const reranked = rerankAllocationsByVerdict(structuredClone(draft));
  assert.equal(reranked.changed, true);
  assert.equal(reranked.draft.personTypes.find((type) => type.slot === "vc_partner")!.allocation, 30);
  const checked = checkDraftV3(draft, checkInput(input));
  assert.equal(checked.ok, true, JSON.stringify((checked as { issues?: string[] }).issues));
  if (checked.ok !== true) return;
  assert.deepEqual(checked.repairs, ["allocation_reranked_by_verdict"]);
  const byKey = new Map(checked.value.personTypes.map((type) => [type.slot, type.allocation]));
  assert.equal(byKey.get("vc_partner"), 30);
  assert.equal(byKey.get("cvc"), 15);
  assert.ok([...byKey.values()].every((allocation) => allocation % 5 === 0));
  assert.equal([...byKey.values()].reduce((sum, allocation) => sum + allocation, 0) + checked.value.event.allocation, 100);
  // 合计不是 100 时一次修正修不好 → 没能起草（不受模板约束时合计由校验器拒绝）。
  const broken = structuredClone(draft);
  broken.personTypes[0]!.allocation += 10;
  const refused = checkDraftV3(broken, checkInput(input, false));
  assert.equal(refused.ok, false);
  assert.ok((refused as { issues: string[] }).issues.some((issue) => issue.startsWith("allocation:")));
});

test("a reference to an unknown sourceId or questionKey deletes the sentence; unsourced rows move to risks as unverified", () => {
  const { draft, input } = good();
  draft.summary[0] = { ...draft.summary[0]!, refs: [{ kind: "source", sourceId: "S9" }] };
  draft.summary[2] = { ...draft.summary[2]!, refs: [{ kind: "answer", questionKey: "Q99" }] };
  draft.keyNumbers[0] = { ...draft.keyNumbers[0]!, sourceIds: ["S9"] };
  draft.orderReasons[1] = { ...draft.orderReasons[1]!, sourceIds: [] };
  draft.comparison!.rows[1] = { ...draft.comparison!.rows[1]!, sourceIds: ["nope"] };
  const checked = checkDraftV3(draft, checkInput(input));
  assert.equal(checked.ok, true, JSON.stringify((checked as { issues?: string[] }).issues));
  if (checked.ok !== true) return;
  assert.deepEqual(checked.repairs, [
    "summary_sentence_dropped:0:unknown_ref",
    "summary_sentence_dropped:2:unknown_ref",
    "order_reason_unverified:1",
    "key_number_unverified:0",
    "comparison_row_unverified:1",
  ]);
  assert.equal(checked.value.summary.text, draft.summary[1]!.text);
  assert.equal(checked.value.keyNumbers.length, 0);
  assert.equal(checked.value.orderReasons.length, 1);
  assert.equal(checked.value.comparison!.rows.length, draft.comparison!.rows.length - 1);
  const unverified = checked.value.risks.filter((risk) => risk.kind === "unverified").map((risk) => risk.text);
  assert.deepEqual(unverified.slice(-3), [draft.orderReasons[1]!.text, `${draft.keyNumbers[0]!.value} ${draft.keyNumbers[0]!.label}`, draft.comparison!.rows[1]!.label]);
});

test("rule 4: bad enums, too few steps or an empty doneCriteria are refused (a type outside every step is repaired since R38-01)", () => {
  const base = good();
  const bad = (mutate: (draft: DraftOutputV3) => void, pattern: RegExp) => {
    const draft = structuredClone(base.draft);
    mutate(draft);
    const checked = checkDraftV3(draft, checkInput(base.input));
    assert.equal(checked.ok, false, pattern.source);
    assert.ok((checked as { issues: string[] }).issues.some((issue) => pattern.test(issue)), `${pattern.source}: ${JSON.stringify((checked as { issues: string[] }).issues)}`);
  };
  bad((draft) => { (draft as { verdict: string }).verdict = "maybe"; }, /verdict/u);
  bad((draft) => { (draft.confidence as { level: string }).level = "sure"; }, /confidence/u);
  bad((draft) => { draft.steps = draft.steps.slice(0, 1); }, /^steps: 2–4$/u);
  bad((draft) => { draft.steps[0]!.doneCriteria = " "; }, /doneCriteria is empty/u);
  const orphan = structuredClone(base.draft);
  const dropped = orphan.steps[0]!.personTypeKeys[0]!;
  for (const step of orphan.steps) step.personTypeKeys = step.personTypeKeys.filter((key) => key !== dropped);
  const repaired = checkDraftV3(orphan, checkInput(base.input));
  assert.equal(repaired.ok, true, JSON.stringify((repaired as { issues?: string[] }).issues));
  if (repaired.ok === true) {
    assert.ok(repaired.repairs?.includes(`orphan_type_attached:${dropped}`));
    assert.ok(repaired.value.steps.at(-1)!.personTypeKeys.includes(dropped));
  }
  bad((draft) => { draft.outcome = "二十一文字より長い目標の結果をここに書いてみる文"; }, /^outcome:/u);
});
