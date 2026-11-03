/**
 * R33：计划 v3 初版的校验 `checkDraftV3`（plan-v3/DESIGN.md §2.2）。模型输出先过 zod，再过 v2 的结构规则
 * （`checkDraftStructure`：Step、人物类型、配点合计 100、模板 ±5），再按四条硬规则处置；能确定性修的记进 `repairs`，
 * 修不了的 `ok: false`（R35 同一操作内修复重试 1 次，仍不合格 → 「没能起草」）。
 *
 * 1. 理由段每句 ≤1 处加粗、≤14 字、且是原句子串（不是 → 去标记）；每句的引用必须指向输入里的来源 id / 回答 id
 *    （指向不存在的 → 删句）；没有任何依据的句子 → 删句（「没有来源的判断只能写进 risks」）。全删空 → ok: false。
 * 2. 顺序理由 / 对比条 / 关键数字的 `sourceIds` 去掉不存在的；一个都不剩的行移到 `risks`（kind unverified）。
 * 3. 分量顺序与对比条判定一致（not_recommended ≤ possible ≤ preferred）且合计 + イベント = 100；不一致自动修正一次
 *    （同一批配点按判定重排，5 分一档不变），仍不合规 → ok: false。
 * 4. verdict / confidence.level 枚举；steps 2–4 个且 doneCriteria 非空；personTypes 3–6 类且每类都在某个 Step 里
 *    （由此得到 stepKey = `step-<n>`，与 `flow-service` 给 Step 的 key 同一规则）。
 */
import { z } from "zod";

import { PLAN_EVENT_SLOT } from "../../../../shared/compute/plan-templates";
import type { PlanComparisonVerdict, PlanMarkedText, PlanRef, PlanRisk, PlanSource } from "../../../../shared/contract/plan-v2";
import { checkDraftStructure, type ContentCheckInput } from "../validate-content";
import { normalizeDraftOutput, type DraftNormalizeOptions } from "./normalize";
import { draftSchema, parse, text, type Checked } from "./schemas";
import type { DraftOutput, DraftOutputV3, DraftSummarySentence, DraftV3 } from "./types";

export const PLAN_V3_LIMITS = {
  outcomeChars: 20,
  /** 路线副标题（字段表「副标题 ≤10 字」）；纯拉丁字母的按 24 个字符。超了不拒绝，只是不显示（置 null）。 */
  stepWhyChars: 10,
  stepWhyLatinChars: 24,
  summaryChars: 150,
  summarySentences: 4,
  markChars: 14,
  confidenceReasonChars: 60,
  orderReasons: 3,
  keyNumbers: 3,
  risks: 3,
  stepsMin: 2,
  stepsMax: 4,
  personTypesMin: 3,
  personTypesMax: 6,
} as const;

export interface ContentCheckInputV3 extends ContentCheckInput {
  /** 输入的来源清单（业界现状库 + 网页）；正文只能引用这里的 `id`。 */
  sources: readonly PlanSource[];
  /** 本次回答的题 id；`refs` 的 `questionKey` 只能是这些。 */
  answerKeys: ReadonlySet<string>;
}

const chars = (value: string) => Array.from(value).length;
const VERDICT_RANK: Record<PlanComparisonVerdict, number> = { not_recommended: 0, possible: 1, preferred: 2 };

const planRef = z.union([
  z.object({ kind: z.literal("answer"), questionKey: z.string() }),
  z.object({ kind: z.literal("source"), sourceId: z.string() }),
]);
const sourceIds = z.array(z.string()).max(12).catch([]);
const basePersonType = draftSchema.shape.personTypes.element;
const draftV3Schema = draftSchema.extend({
  // R38-01：真实 v9 输出里人物类型的 `why` 偶尔为 null（多半是被误写成人物类型的 event 那一项）；v3 界面不显示它，按空串收下。
  personTypes: z.array(basePersonType.extend({ why: text(400).nullable().catch(null).transform((value) => value ?? "") })).max(10),
  // v3 的引用是来源 id；模型不产出 citations（由用到的 landscape 来源导出）。
  citations: z.array(z.object({ id: z.string(), version: z.number().int() })).max(12).catch([]),
  outcome: text(PLAN_V3_LIMITS.outcomeChars * 2).pipe(z.string().min(1)),
  summary: z.array(z.object({ text: text(400).pipe(z.string().min(1)), bold: text(80).nullable().catch(null), refs: z.array(planRef).max(6).catch([]) })).max(8),
  verdict: z.enum(["feasible", "conditional", "not_recommended"]),
  confidence: z.object({ level: z.enum(["high", "mid", "low"]), reason: text(PLAN_V3_LIMITS.confidenceReasonChars * 2) }),
  orderReasons: z.array(z.object({ text: text(200).pipe(z.string().min(1)), sourceIds })).max(6).catch([]),
  comparison: z.object({
    title: text(60),
    funnel: text(120),
    rows: z.array(z.object({ label: text(40), score: z.number().min(0).max(100), verdict: z.enum(["preferred", "possible", "not_recommended"]), sourceIds, typeKey: z.string().nullable().catch(null) })).max(10),
  }).nullable().catch(null),
  keyNumbers: z.array(z.object({ value: text(40), label: text(80), sourceIds })).max(6).catch([]),
  risks: z.array(z.object({ kind: z.enum(["risk", "unverified"]), text: text(120) })).max(6).catch([]),
});

/** 规则 3 的修正：按判定重排同一批配点（只动对比条里对得上类型的那些；配点的多重集不变，合计与 5 分一档也不变）。 */
export function rerankAllocationsByVerdict(draft: DraftOutputV3): { draft: DraftOutputV3; changed: boolean } {
  if (!draft.comparison) return { changed: false, draft };
  const rank = new Map<string, number>();
  for (const row of draft.comparison.rows) if (row.typeKey) rank.set(row.typeKey, Math.max(rank.get(row.typeKey) ?? -1, VERDICT_RANK[row.verdict]));
  const ranked = draft.personTypes.filter((type) => rank.has(type.slot));
  const consistent = ranked.every((a) => ranked.every((b) => rank.get(a.slot)! >= rank.get(b.slot)! || a.allocation <= b.allocation));
  if (consistent) return { changed: false, draft };
  const order = [...ranked].sort((a, b) => rank.get(b.slot)! - rank.get(a.slot)! || b.allocation - a.allocation || draft.personTypes.indexOf(a) - draft.personTypes.indexOf(b));
  const allocations = ranked.map((type) => type.allocation).sort((a, b) => b - a);
  const assigned = new Map(order.map((type, index) => [type.slot, allocations[index]!]));
  return { changed: true, draft: { ...draft, personTypes: draft.personTypes.map((type) => (assigned.has(type.slot) ? { ...type, allocation: assigned.get(type.slot)! } : type)) } };
}

/**
 * R38-01（真实 v9 输出被拒的三类，都是规则唯一确定的结构毛病，修完照常过同一套校验）：
 * - 把活动写成了人物类型（`slot: "event"`）：活动的分量和人数在 `event` 里，这一项是重复 → 删掉；
 * - 人数不在 1–5（例如 0 = 模型想去掉这一类）：夹到 1–5；分量 0 由规整器按「配点不合模板 → 整份回到模板配点」处理。
 */
function repairTypeShape(draft: DraftOutputV3, repairs: string[]): DraftOutputV3 {
  let personTypes = draft.personTypes;
  if (personTypes.some((type) => type.slot === PLAN_EVENT_SLOT)) {
    repairs.push("event_person_type_dropped");
    personTypes = personTypes.filter((type) => type.slot !== PLAN_EVENT_SLOT);
  }
  personTypes = personTypes.map((type) => {
    if (type.targetCount >= 1 && type.targetCount <= 5) return type;
    repairs.push(`target_clamped:${type.slot}`);
    return { ...type, targetCount: Math.min(5, Math.max(1, Math.round(type.targetCount) || 1)) };
  });
  return personTypes === draft.personTypes ? draft : { ...draft, personTypes };
}

/**
 * R38-01：
 * - 没挂到任何阶段的人物类型 → 挂到最后一个阶段（规则 3「每类至少属于一个阶段」；最后阶段 = 不急的那一档，主页上显示「可以提前」）；
 * - 阶段副标题 `why` 超过字段表上限 → 置 null（界面缺省不画），不为一个副标题拒掉整份方案。
 */
function attachStepFields(draft: DraftOutput, repairs: string[]): DraftOutput {
  if (draft.steps.length === 0) return draft;
  const listed = new Set(draft.steps.flatMap((step) => step.personTypeKeys));
  const orphans = draft.personTypes.map((type) => type.slot).filter((slot) => !listed.has(slot));
  for (const slot of orphans) repairs.push(`orphan_type_attached:${slot}`);
  const last = draft.steps.length - 1;
  const steps = draft.steps.map((step, index) => {
    const why = step.why?.trim() || null;
    const limit = why && /^[\x20-\x7e]+$/u.test(why) ? PLAN_V3_LIMITS.stepWhyLatinChars : PLAN_V3_LIMITS.stepWhyChars;
    const keptWhy = why && chars(why) <= limit ? why : null;
    if (why && !keptWhy) repairs.push(`step_why_dropped:${index + 1}`);
    const personTypeKeys = index === last && orphans.length > 0 ? [...step.personTypeKeys, ...orphans] : step.personTypeKeys;
    return { ...step, personTypeKeys, why: keptWhy };
  });
  return { ...draft, steps };
}

/** 规则 1：按句处置，并把句子拼成 `PlanMarkedText`（下标由这里算）。 */
export function summaryToMarkedText(sentences: readonly DraftSummarySentence[], input: Pick<ContentCheckInputV3, "sources" | "answerKeys">, repairs: string[]): PlanMarkedText {
  const sourceIdSet = new Set(input.sources.map((source) => source.id));
  const known = (ref: PlanRef) => (ref.kind === "source" ? sourceIdSet.has(ref.sourceId) : input.answerKeys.has(ref.questionKey));
  let textOut = "";
  const marks: Array<{ start: number; end: number }> = [];
  const refs: Array<{ start: number; end: number; ref: PlanRef }> = [];
  sentences.forEach((sentence, index) => {
    const body = sentence.text.trim();
    if (!body) return;
    if (sentence.refs.length === 0) {
      repairs.push(`summary_sentence_dropped:${index}:no_source`);
      return;
    }
    if (sentence.refs.some((ref) => !known(ref))) {
      repairs.push(`summary_sentence_dropped:${index}:unknown_ref`);
      return;
    }
    const separator = textOut && /[A-Za-z0-9.!?]$/u.test(textOut) ? " " : "";
    const start = textOut.length + separator.length;
    textOut += separator + body;
    const end = textOut.length;
    const bold = sentence.bold?.trim() ?? "";
    if (bold) {
      const at = body.indexOf(bold);
      if (at < 0 || chars(bold) > PLAN_V3_LIMITS.markChars) repairs.push(`summary_mark_dropped:${index}`);
      else marks.push({ end: start + at + bold.length, start: start + at });
    }
    for (const ref of sentence.refs) refs.push({ end, ref, start });
  });
  return { marks, refs, text: textOut };
}

/** C6（v3）：v2 的结构规则 + 四条硬规则；通过后给出 `DraftV3`（理由段已算下标、类型带 stepKey、citations 从来源导出）。 */
export function checkDraftV3(raw: unknown, input: ContentCheckInputV3, normalize?: Omit<DraftNormalizeOptions, "goalKind" | "enforceTemplate">): Checked<DraftV3> {
  const parsed = parse(draftV3Schema as z.ZodType<DraftOutputV3>, raw);
  if (parsed.ok === false) return { issues: parsed.issues, ok: false };
  const repairs: string[] = [];
  const issues: string[] = [];
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));

  // 规则 3（先于结构校验：重排后的配点仍要过合计 100 / 模板 ±5）。
  let draft = repairTypeShape(parsed.value, repairs);
  const reranked = rerankAllocationsByVerdict(draft);
  if (reranked.changed) {
    repairs.push("allocation_reranked_by_verdict");
    draft = reranked.draft;
  }
  const base: DraftOutput = attachStepFields(normalizeDraftOutput({ ...draft, citations: [] }, { ...normalize, aliases: input.aliases, enforceTemplate: input.enforceTemplate, goalKind: input.goalKind, repairs }), repairs);
  issues.push(...checkDraftStructure(base, input));
  if (reranked.changed && rerankAllocationsByVerdict({ ...draft, personTypes: base.personTypes }).changed) issues.push("allocation: order still contradicts the comparison verdicts after one fix");

  // 规则 4。
  if (base.steps.length < PLAN_V3_LIMITS.stepsMin || base.steps.length > PLAN_V3_LIMITS.stepsMax) issues.push(`steps: ${PLAN_V3_LIMITS.stepsMin}–${PLAN_V3_LIMITS.stepsMax}`);
  base.steps.forEach((step, index) => { if (!step.doneCriteria.trim()) issues.push(`step ${index + 1}: doneCriteria is empty`); });
  if (base.personTypes.length < PLAN_V3_LIMITS.personTypesMin || base.personTypes.length > PLAN_V3_LIMITS.personTypesMax) issues.push(`personTypes: ${PLAN_V3_LIMITS.personTypesMin}–${PLAN_V3_LIMITS.personTypesMax}`);
  const stepKeyOf = new Map<string, string>();
  base.steps.forEach((step, index) => { for (const key of step.personTypeKeys) if (key !== PLAN_EVENT_SLOT && !stepKeyOf.has(key)) stepKeyOf.set(key, `step-${index + 1}`); });
  for (const type of base.personTypes) if (!stepKeyOf.has(type.slot)) issues.push(`personType ${type.slot}: not in any step`);
  if (chars(draft.outcome) > PLAN_V3_LIMITS.outcomeChars) issues.push(`outcome: at most ${PLAN_V3_LIMITS.outcomeChars} characters`);
  if (chars(draft.confidence.reason) > PLAN_V3_LIMITS.confidenceReasonChars) issues.push(`confidence.reason: at most ${PLAN_V3_LIMITS.confidenceReasonChars} characters`);

  // 规则 1。
  const summary = summaryToMarkedText(draft.summary, input, repairs);
  if (!summary.text) issues.push("summary: no sentence with a source is left");
  if (chars(summary.text) > PLAN_V3_LIMITS.summaryChars) issues.push(`summary: at most ${PLAN_V3_LIMITS.summaryChars} characters`);
  if (summary.refs.length > 0 && new Set(summary.refs.map((ref) => ref.start)).size > PLAN_V3_LIMITS.summarySentences) issues.push(`summary: at most ${PLAN_V3_LIMITS.summarySentences} sentences`);

  // 规则 2。
  const risks: PlanRisk[] = draft.risks.slice(0, PLAN_V3_LIMITS.risks);
  if (draft.risks.length > PLAN_V3_LIMITS.risks) repairs.push("risks_trimmed");
  const unverified = (code: string, textValue: string) => {
    repairs.push(code);
    risks.push({ kind: "unverified", text: textValue });
  };
  const keep = (ids: readonly string[]) => ids.filter((id) => sourceById.has(id));
  const orderReasons = draft.orderReasons.slice(0, PLAN_V3_LIMITS.orderReasons).flatMap((line, index) => {
    const ids = keep(line.sourceIds);
    if (ids.length === 0) { unverified(`order_reason_unverified:${index}`, line.text); return []; }
    return [{ sourceIds: ids, text: line.text }];
  });
  const keyNumbers = draft.keyNumbers.slice(0, PLAN_V3_LIMITS.keyNumbers).flatMap((number, index) => {
    const ids = keep(number.sourceIds);
    if (ids.length === 0) { unverified(`key_number_unverified:${index}`, `${number.value} ${number.label}`.trim()); return []; }
    return [{ ...number, sourceIds: ids }];
  });
  const comparison = draft.comparison
    ? { ...draft.comparison, rows: draft.comparison.rows.flatMap((row, index) => {
        const ids = keep(row.sourceIds);
        if (ids.length === 0) { unverified(`comparison_row_unverified:${index}`, row.label); return []; }
        return [{ ...row, sourceIds: ids }];
      }) }
    : null;

  if (issues.length > 0) return { issues, ok: false };

  // citations：用到的 landscape 来源（v2 读取方的依据区照旧能显示）。
  const used = new Set<string>([
    ...summary.refs.flatMap((ref) => (ref.ref.kind === "source" ? [ref.ref.sourceId] : [])),
    ...orderReasons.flatMap((line) => line.sourceIds),
    ...keyNumbers.flatMap((number) => number.sourceIds),
    ...(comparison?.rows.flatMap((row) => row.sourceIds) ?? []),
  ]);
  const citations = [...used].flatMap((id) => {
    const source = sourceById.get(id);
    return source?.kind === "landscape" ? [{ id: source.landscapeId, version: source.version }] : [];
  }).filter((citation, index, list) => list.findIndex((other) => other.id === citation.id && other.version === citation.version) === index);

  const value: DraftV3 = {
    ...base,
    citations,
    comparison,
    confidence: draft.confidence,
    keyNumbers,
    orderReasons,
    outcome: draft.outcome,
    personTypes: base.personTypes.map((type) => ({ ...type, stepKey: stepKeyOf.get(type.slot)! })),
    risks,
    schemaVersion: 3,
    sources: [...input.sources],
    summary,
    verdict: draft.verdict,
  };
  return repairs.length > 0 ? { ok: true, repairs, value } : { ok: true, value };
}
