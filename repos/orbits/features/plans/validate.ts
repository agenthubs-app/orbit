/**
 * 生成结果的保存前校验（W0008，RW-08 / Q17A）。mock 与之后的真实 AI 生成都必须过这一关：
 *
 * 1. 结构：复用 W0007 的 `parseCreatePlanVersionInput`（阶段顺序、周次在阶段内、四类条目、
 *    人脉需求的行业一二级都在分类内……），再检查阶段数符合期限（一个月 2–3 段、
 *    3 个月 3 段、一年 4 段）和 `analysis` 的回答卡片字段齐全；
 * 2. 引用只来自生成器输入：计划里（条目与 `analysis`）出现的每个联系人／活动 id，
 *    必须是这次输入里的本人联系人／真实活动——编造的 id 在这里就被拒绝；
 * 3. 引用真实存在且属于本人：再用 W0007 的 `PlanReferenceValidator`（按 actor 构造）逐一核对。
 *
 * 任一不满足：`PlanServiceError`（结构 → INVALID_INPUT 400；引用 → REFERENCE_NOT_FOUND 404），不写库。
 */
import { PLAN_LIMITS, type PlanHorizon, type PlanReferenceValidator } from "./contract";
import type { PlanDraft, PlanGeneratorInput } from "./generator";
import { AI_PLAN_GENERATOR_ID } from "./phase-refinement";
import { PlanServiceError, parseCreatePlanVersionInput } from "./validators";

const PHASE_COUNT_BY_HORIZON: Record<PlanHorizon, readonly number[]> = {
  month: [2, 3],
  quarter: [3],
  year: [4],
};

/** 草稿里出现的全部联系人 id 与活动 id（去重，保持首次出现的顺序）。 */
export function collectPlanReferences(draft: PlanDraft): { contactIds: string[]; eventIds: string[] } {
  const contacts = new Set<string>();
  const events = new Set<string>();
  for (const item of draft.items) {
    for (const id of item.contactIds ?? []) contacts.add(id);
    if (item.linkedEventId) events.add(item.linkedEventId);
  }
  for (const ally of draft.analysis.allies) contacts.add(ally.contactId);
  for (const action of draft.analysis.thisWeek) {
    for (const id of action.contactIds) contacts.add(id);
    for (const id of action.eventIds) events.add(id);
  }
  return { contactIds: [...contacts], eventIds: [...events] };
}

function invalid(message: string): never {
  throw new PlanServiceError("INVALID_INPUT", message);
}

function assertAnalysis(draft: PlanDraft): void {
  const analysis = draft.analysis as Partial<PlanDraft["analysis"]> | undefined;
  if (!analysis || analysis.kind !== "plan_bootstrap" || analysis.version !== 1) invalid("analysis must be a plan_bootstrap v1 card.");
  if (!Array.isArray(analysis.answer) || analysis.answer.length === 0) invalid("analysis.answer is required.");
  if (!Array.isArray(analysis.figures) || analysis.figures.length !== 3) invalid("analysis.figures must hold exactly 3 figures.");
  if (!Array.isArray(analysis.thisWeek) || analysis.thisWeek.length === 0 || analysis.thisWeek.length > 3) {
    invalid("analysis.thisWeek must hold 1–3 actions.");
  }
  if (!Array.isArray(analysis.allies) || !Array.isArray(analysis.gaps)) invalid("analysis.allies and gaps are required.");
  if (typeof analysis.risk !== "string" || !analysis.risk.trim()) invalid("analysis.risk is required.");
  if (!analysis.pitch || typeof analysis.pitch.text !== "string" || !analysis.pitch.text.trim()) invalid("analysis.pitch is required.");
  const phaseKeys = draft.phases.map((phase) => phase.key);
  if (!Array.isArray(analysis.phases) || analysis.phases.map((phase) => phase.key).join("|") !== phaseKeys.join("|")) {
    invalid("analysis.phases must match the plan phases in order.");
  }
}

export async function validateGeneratedPlan(input: {
  draft: PlanDraft;
  generatorInput: Pick<PlanGeneratorInput, "contacts" | "events">;
  references: PlanReferenceValidator;
}): Promise<void> {
  const { draft, generatorInput, references } = input;
  const parsed = parseCreatePlanVersionInput(draft);
  // W0048b review P2-4：AI 草稿的阶段数由模型给（1–12，D46② 只细化前 2 段、其余骨架保存）；
  // 顺序、周次、条目与引用照常校验。mock 模板维持按期限的阶段数。
  if (draft.analysis?.generator === AI_PLAN_GENERATOR_ID) {
    if (parsed.phases.length < 1 || parsed.phases.length > PLAN_LIMITS.phasesPerPlan) {
      invalid(`An AI plan cannot have ${parsed.phases.length} phases.`);
    }
  } else if (!PHASE_COUNT_BY_HORIZON[parsed.horizon].includes(parsed.phases.length)) {
    invalid(`A ${parsed.horizon} plan cannot have ${parsed.phases.length} phases.`);
  }
  assertAnalysis(draft);

  const { contactIds, eventIds } = collectPlanReferences(draft);
  const knownContacts = new Set(generatorInput.contacts.map((contact) => contact.id));
  const knownEvents = new Set(generatorInput.events.map((event) => event.id));
  // 不回显 id：别人的联系人与不存在的联系人对外表现一致（与 W0007 服务同口径）。
  if (contactIds.some((id) => !knownContacts.has(id))) {
    throw new PlanServiceError("REFERENCE_NOT_FOUND", "The plan referenced a contact that was not in its input.");
  }
  if (eventIds.some((id) => !knownEvents.has(id))) {
    throw new PlanServiceError("REFERENCE_NOT_FOUND", "The plan referenced an event that was not in its input.");
  }

  const [missingContacts, missingEvents] = await Promise.all([
    contactIds.length ? references.findMissingContactIds(contactIds) : [],
    eventIds.length ? references.findMissingEventIds(eventIds) : [],
  ]);
  if (missingContacts.length > 0) throw new PlanServiceError("REFERENCE_NOT_FOUND", "A referenced contact was not found.");
  if (missingEvents.length > 0) throw new PlanServiceError("REFERENCE_NOT_FOUND", "A referenced event was not found.");
}
