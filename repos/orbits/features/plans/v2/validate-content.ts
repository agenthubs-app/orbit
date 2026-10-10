/**
 * R23 方案内容的业务校验（DESIGN §5.2 C6 / C7 的「校验」列）。AI 输出先过 zod，再过这里；不合格 → 修复重试 1 次 → 降级。
 * 手动编辑与确定也用同一套「配点合计 100、5 分一档、人数范围」规则（`validateAllocations`）。
 */
import { validateAllocations, type PlanAllocationSlot } from "../../../shared/compute/plan-allocation";
import { checkTemplateAdjustment, PLAN_EVENT_SLOT, PLAN_GOAL_TEMPLATES } from "../../../shared/compute/plan-templates";
import type { PlanGoalKind } from "../../../shared/contract/plan-v2";
import type { DraftLandscapeItem, DraftOutput, DraftSlotInfo } from "./ai/types";

export const PLAN_DRAFT_STEP_LIMIT = 7;
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫";
const DIGIT = /[0-9０-９]/;
const HEADCOUNT = /([0-9０-９]+|[一二三四五六七八九十両]+)\s*(人|名|people|persons?|位)/i;

export interface ContentCheckInput {
  goalKind: PlanGoalKind;
  slots: readonly DraftSlotInfo[];
  landscape: readonly DraftLandscapeItem[];
  aliases: ReadonlySet<string>;
  /** C6 = 相对模板 ±5、最多 2 处；C7 / 手动编辑不受这条限制。 */
  enforceTemplate: boolean;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[。．！？.!?])\s*/u).map((sentence) => sentence.trim()).filter(Boolean);
}

/** 每条引用都要在見立て或結論里用 ①② 标出来（复核 m3）。 */
export function unusedCitationIssues(texts: readonly string[], citationCount: number): string[] {
  const used = new Set([...texts.join("")].filter((char) => CIRCLED.includes(char)).map((char) => CIRCLED.indexOf(char)));
  return Array.from({ length: citationCount }, (_, index) => index).filter((index) => !used.has(index)).map((index) => `citation ${CIRCLED[index]} is not used in the text`);
}

/** 文中 ①② 的编号必须对应引用；没有编号的句子不能带数字（「没有引用的结论不得带数字」）。 */
export function citationMarkerIssues(text: string, citationCount: number, field: string): string[] {
  const issues: string[] = [];
  for (const sentence of sentences(text)) {
    const markers = [...sentence].filter((char) => CIRCLED.includes(char));
    for (const marker of markers) {
      if (CIRCLED.indexOf(marker) + 1 > citationCount) issues.push(`${field}: marker ${marker} has no citation`);
    }
    const withoutMarkers = [...sentence].filter((char) => !CIRCLED.includes(char)).join("");
    if (markers.length === 0 && DIGIT.test(withoutMarkers)) issues.push(`${field}: a number without a citation`);
  }
  return issues;
}

/** 草稿阶段还没有得分：已得 0、已计入 0。`templateIndex` 按该类模板的枠顺序。 */
export function allocationSlotsOf(goalKind: PlanGoalKind, content: { personTypes: ReadonlyArray<{ slot: string; allocation: number; targetCount: number }>; event: { allocation: number; targetCount: number } }): PlanAllocationSlot[] {
  const order = PLAN_GOAL_TEMPLATES[goalKind].slots.map((slot) => slot.slot);
  const index = (slot: string) => {
    const at = order.indexOf(slot);
    return at < 0 ? order.length : at;
  };
  return [
    ...content.personTypes.map((type) => ({ allocation: type.allocation, earnedBase: 0, key: type.slot, metCount: 0, skipped: false, targetCount: type.targetCount, templateIndex: index(type.slot) })),
    { allocation: content.event.allocation, earnedBase: 0, isEvent: true, key: PLAN_EVENT_SLOT, metCount: 0, skipped: false, targetCount: content.event.targetCount, templateIndex: index(PLAN_EVENT_SLOT) },
  ];
}

/** 返回问题清单；空数组 = 合格。 */
export function checkDraftContent(content: DraftOutput, input: ContentCheckInput): string[] {
  const issues: string[] = [];
  const template = PLAN_GOAL_TEMPLATES[input.goalKind];
  const slotInfo = new Map(input.slots.map((slot) => [slot.slot, slot]));
  if (content.steps.length === 0 || content.steps.length > PLAN_DRAFT_STEP_LIMIT) issues.push("steps: 1–7");
  if (content.personTypes.length === 0) issues.push("personTypes: at least one");
  const seen = new Set<string>();
  for (const type of content.personTypes) {
    const info = slotInfo.get(type.slot);
    if (!info || !template.slots.some((slot) => slot.slot === type.slot)) {
      issues.push(`personType ${type.slot}: not a template slot`);
      continue;
    }
    if (seen.has(type.slot)) issues.push(`personType ${type.slot}: duplicated`);
    seen.add(type.slot);
    if (!info.shortNames.some((name) => name.id === type.shortLabelId)) issues.push(`personType ${type.slot}: short name ${type.shortLabelId} is not in the dictionary`);
    if (type.targetCount < 1 || type.targetCount > 5) issues.push(`personType ${type.slot}: target 1–5`);
    // 0 点的类型不能留在方案里，要去掉就走「移除类型」（复核 m1）。
    if (type.allocation < 5) issues.push(`personType ${type.slot}: at least 5 points`);
    if (type.questions.length !== 3) issues.push(`personType ${type.slot}: three questions`);
    for (const route of type.introRoutes) {
      if (!input.aliases.has(route.viaAlias)) issues.push(`personType ${type.slot}: intro route via unknown alias`);
      if (HEADCOUNT.test(route.why)) issues.push(`personType ${type.slot}: intro route mentions a headcount`);
    }
  }
  const keys = new Set(content.personTypes.map((type) => type.slot));
  for (const [index, step] of content.steps.entries()) {
    for (const key of step.personTypeKeys) {
      if (key !== PLAN_EVENT_SLOT && !keys.has(key)) issues.push(`step ${index + 1}: unknown type ${key}`);
    }
  }
  const allocation = validateAllocations(allocationSlotsOf(input.goalKind, content));
  if (allocation.ok === false) issues.push(`allocation: ${allocation.error}${allocation.key ? `:${allocation.key}` : ""}`);
  if (input.enforceTemplate) {
    const allocations: Record<string, number> = Object.fromEntries(template.slots.map((slot) => [slot.slot, 0]));
    for (const type of content.personTypes) allocations[type.slot] = type.allocation;
    allocations[PLAN_EVENT_SLOT] = content.event.allocation;
    const adjustment = checkTemplateAdjustment(input.goalKind, allocations);
    if (adjustment.ok === false) issues.push(`template: ${adjustment.reason}`);
  }
  const published = new Map(input.landscape.map((entry) => [entry.id, entry.version]));
  for (const citation of content.citations) {
    if (published.get(citation.id) !== citation.version) issues.push(`citation ${citation.id}: not a published entry`);
  }
  issues.push(...citationMarkerIssues(content.diagnosis, content.citations.length, "diagnosis"));
  issues.push(...citationMarkerIssues(content.conclusion, content.citations.length, "conclusion"));
  issues.push(...unusedCitationIssues([content.diagnosis, content.conclusion], content.citations.length));
  return issues;
}

/**
 * C7 只能改的部分（复核 M3，DESIGN §5.2「只改允许的路径」）：見立て、結論、flow、Step（名称、目安、理由、关联类型、增删）、
 * 人物类型的配点 / 人数 / 役割×状況 / why、イベント、配点理由。引用、聞くこと、判定、見分け方、人物像、開口一番、紹介ルート、
 * 短名、行业、枠的组成都不能改。
 */
export function disallowedChangeIssues(current: DraftOutput, revised: DraftOutput): string[] {
  const issues: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const citationKey = (items: DraftOutput["citations"]) => items.map((item) => `${item.id}@${item.version}`).sort();
  if (!same(citationKey(current.citations), citationKey(revised.citations))) issues.push("citations: a revision may not change the cited entries");
  const before = new Map(current.personTypes.map((type) => [type.slot, type]));
  const after = new Map(revised.personTypes.map((type) => [type.slot, type]));
  if (!same([...before.keys()].sort(), [...after.keys()].sort())) issues.push("personTypes: a revision may not add or remove types");
  for (const [slot, type] of after) {
    const previous = before.get(slot);
    if (!previous) continue;
    for (const field of ["shortLabelId", "questions", "countRule", "recognizeHints", "persona", "opener", "introRoutes", "primaryIndustryId"] as const) {
      if (!same(previous[field], type[field])) issues.push(`personType ${slot}: ${field} may not change in a revision`);
    }
  }
  return issues;
}
