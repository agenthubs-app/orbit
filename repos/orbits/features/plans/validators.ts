/**
 * 计划输入的运行时校验。API 请求体和后续 Sprint 的生成器输出都先经过这里，
 * 不合格一律 `PlanServiceError("INVALID_INPUT")`（400），不写库。
 */
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";
import { validateIndustrySelection } from "../../shared/domain/industries";
import {
  PLAN_HORIZONS,
  PLAN_ITEM_CHANGE_OPS,
  PLAN_ITEM_KINDS,
  PLAN_LIMITS,
  type AddManualLogInput,
  type CreatePlanVersionInput,
  type NetworkNeedCriteria,
  type NewPlanItemInput,
  type PlanErrorReason,
  type PlanHorizon,
  type PlanItemChange,
  type PlanItemKind,
  type PlanItemStatus,
  type PlanPhase,
  type UpdatePlanItemInput,
} from "./contract";

const REASON_CODES: Record<PlanErrorReason, AppErrorCode> = {
  BASE_PLAN_MISMATCH: "CONFLICT",
  IDEMPOTENCY_KEY_REUSED: "CONFLICT",
  REFERENCE_NOT_FOUND: "NOT_FOUND",
  ILLEGAL_TRANSITION: "CONFLICT",
  INVALID_INPUT: "VALIDATION_ERROR",
  ITEM_NOT_FOUND: "NOT_FOUND",
  NO_ACTIVE_PLAN: "NOT_FOUND",
  PLAN_ARCHIVED: "CONFLICT",
  PLAN_NOT_FOUND: "NOT_FOUND",
  MATCH_ALREADY_DECIDED: "CONFLICT",
  PLAN_NOT_ENDED: "CONFLICT",
  REANALYSIS_QUOTA_EXHAUSTED: "CONFLICT",
};

export class PlanServiceError extends AppError {
  readonly reason: PlanErrorReason;

  constructor(reason: PlanErrorReason, message: string) {
    super(REASON_CODES[reason], message);
    this.name = "PlanServiceError";
    this.reason = reason;
  }
}

function invalid(message: string): never {
  throw new PlanServiceError("INVALID_INPUT", message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") invalid(`${field} must be a string.`);
  const text = value.trim();
  if (!text) invalid(`${field} is required.`);
  if (text.length > max) invalid(`${field} is too long.`);
  return text;
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalid(`${field} must be a string.`);
  const text = value.trim();
  if (text.length > max) invalid(`${field} is too long.`);
  return text || null;
}

export function parseId(value: unknown, field: string): string {
  return requiredText(value, field, PLAN_LIMITS.idLength);
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  return parseId(value, field);
}

function idList(value: unknown, field: string, max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) invalid(`${field} must be an array.`);
  if (value.length > max) invalid(`${field} has too many entries.`);
  const ids = value.map((entry) => parseId(entry, field));
  if (new Set(ids).size !== ids.length) invalid(`${field} contains duplicates.`);
  return ids;
}

function week(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > PLAN_LIMITS.maxWeek) {
    invalid(`${field} must be an integer week between 1 and ${PLAN_LIMITS.maxWeek}.`);
  }
  return value;
}

function jsonObject(value: unknown, field: string, maxBytes: number): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) invalid(`${field} must be an object.`);
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalid(`${field} must be JSON-serialisable.`);
  }
  if (Buffer.byteLength(serialized) > maxBytes) invalid(`${field} is too large.`);
  return JSON.parse(serialized) as Record<string, unknown>;
}

function isoDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(`${field} must be a YYYY-MM-DD date.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    invalid(`${field} is not a valid date.`);
  }
  return value;
}

function parsePhases(value: unknown): PlanPhase[] {
  if (!Array.isArray(value) || value.length === 0) invalid("phases must be a non-empty array.");
  if (value.length > PLAN_LIMITS.phasesPerPlan) invalid("Too many phases.");
  const phases = value.map((raw, index): PlanPhase => {
    if (!isPlainObject(raw)) invalid(`phases[${index}] must be an object.`);
    const key = requiredText(raw.key, `phases[${index}].key`, 64);
    if (!/^[A-Za-z0-9_-]+$/.test(key)) invalid(`phases[${index}].key has invalid characters.`);
    const startWeek = week(raw.startWeek, `phases[${index}].startWeek`);
    const endWeek = week(raw.endWeek, `phases[${index}].endWeek`);
    if (endWeek < startWeek) invalid(`phases[${index}] ends before it starts.`);
    if (raw.granularity !== "week" && raw.granularity !== "quarter") {
      invalid(`phases[${index}].granularity must be week or quarter.`);
    }
    return {
      endWeek,
      granularity: raw.granularity,
      key,
      startWeek,
      summary: optionalText(raw.summary, `phases[${index}].summary`, PLAN_LIMITS.detailLength),
      title: requiredText(raw.title, `phases[${index}].title`, 200),
    };
  });
  const keys = new Set<string>();
  phases.forEach((phase, index) => {
    if (keys.has(phase.key)) invalid(`Duplicate phase key ${phase.key}.`);
    keys.add(phase.key);
    const previous = phases[index - 1];
    if (previous && phase.startWeek <= previous.endWeek) invalid("Phases must be in order and must not overlap.");
  });
  return phases;
}

function parseCriteria(value: unknown): NetworkNeedCriteria {
  if (value !== undefined && value !== null && !isPlainObject(value)) invalid("criteria must be an object.");
  const raw = (value ?? {}) as Record<string, unknown>;
  const primaryIndustryId = raw.primaryIndustryId ?? null;
  const secondaryIndustryId = raw.secondaryIndustryId ?? null;
  if (secondaryIndustryId !== null && primaryIndustryId === null) invalid("criteria.secondaryIndustryId needs a primary industry.");
  if (!validateIndustrySelection({ primaryIndustryId, secondaryIndustryId }).valid) {
    invalid("criteria industries are not in the industry taxonomy.");
  }
  let titleKeywords: string[] = [];
  if (raw.titleKeywords !== undefined && raw.titleKeywords !== null) {
    if (!Array.isArray(raw.titleKeywords) || raw.titleKeywords.length > 20) invalid("criteria.titleKeywords must be an array of at most 20.");
    titleKeywords = raw.titleKeywords.map((keyword) => requiredText(keyword, "criteria.titleKeywords", 50));
  }
  // W0048b：要认识几位（1–5 的整数）；缺省不写（读取方按 1 计）。
  const targetCount = raw.targetCount ?? null;
  if (targetCount !== null && (typeof targetCount !== "number" || !Number.isInteger(targetCount) || targetCount < 1 || targetCount > 5)) {
    invalid("criteria.targetCount must be an integer from 1 to 5.");
  }
  return {
    description: optionalText(raw.description, "criteria.description", 1000),
    primaryIndustryId: primaryIndustryId as NetworkNeedCriteria["primaryIndustryId"],
    secondaryIndustryId: secondaryIndustryId as NetworkNeedCriteria["secondaryIndustryId"],
    titleKeywords,
    ...(targetCount !== null ? { targetCount: targetCount as number } : {}),
  };
}

export interface ParsedNewItem extends Omit<NewPlanItemInput, "criteria"> {
  kind: PlanItemKind;
  phaseKey: string | null;
  title: string;
  detail: string | null;
  suggestedWeek: number | null;
  status: PlanItemStatus;
  contactIds: string[];
  linkedEventId: string | null;
  answer: string | null;
  criteria: NetworkNeedCriteria | null;
  inheritsFromItemId: string | null;
  meta: Record<string, unknown>;
}

function parseItem(raw: unknown, index: number, phases: readonly PlanPhase[]): ParsedNewItem {
  const at = `items[${index}]`;
  if (!isPlainObject(raw)) invalid(`${at} must be an object.`);
  if (!PLAN_ITEM_KINDS.includes(raw.kind as PlanItemKind)) invalid(`${at}.kind is not supported.`);
  const kind = raw.kind as PlanItemKind;
  const phaseKey = optionalText(raw.phaseKey, `${at}.phaseKey`, 64);
  const phase = phaseKey === null ? null : phases.find((entry) => entry.key === phaseKey);
  if (phaseKey !== null && !phase) invalid(`${at}.phaseKey does not match a phase.`);
  const suggestedWeek = raw.suggestedWeek === undefined || raw.suggestedWeek === null
    ? null
    : week(raw.suggestedWeek, `${at}.suggestedWeek`);
  if (phase && suggestedWeek !== null && (suggestedWeek < phase.startWeek || suggestedWeek > phase.endWeek)) {
    invalid(`${at}.suggestedWeek is outside its phase.`);
  }

  let status: PlanItemStatus;
  if (kind === "action") {
    if (raw.status !== undefined && raw.status !== "not_started") invalid(`${at}.status must start as not_started.`);
    status = "not_started";
  } else if (kind === "event") {
    if (raw.status !== undefined && raw.status !== "recommended" && raw.status !== "registered") {
      invalid(`${at}.status must be recommended or registered.`);
    }
    status = (raw.status as PlanItemStatus | undefined) ?? "recommended";
  } else {
    if (raw.status !== undefined) invalid(`${at}.status is derived for ${kind} items.`);
    status = "open";
  }

  const contactIds = idList(raw.contactIds, `${at}.contactIds`, 200);
  if (contactIds.length > 0 && kind !== "network_need" && kind !== "action") {
    invalid(`${at}.contactIds is only allowed on network needs and actions.`);
  }
  const linkedEventId = optionalId(raw.linkedEventId, `${at}.linkedEventId`);
  if (kind === "event" && !linkedEventId) invalid(`${at}.linkedEventId is required for events.`);
  if (linkedEventId && kind !== "event" && kind !== "action") invalid(`${at}.linkedEventId is only allowed on events and actions.`);
  const answer = optionalText(raw.answer, `${at}.answer`, PLAN_LIMITS.answerLength);
  if (answer !== null && kind !== "info") invalid(`${at}.answer is only allowed on info items.`);
  if (raw.criteria !== undefined && raw.criteria !== null && kind !== "network_need") {
    invalid(`${at}.criteria is only allowed on network needs.`);
  }

  return {
    answer,
    contactIds,
    criteria: kind === "network_need" ? parseCriteria(raw.criteria) : null,
    detail: optionalText(raw.detail, `${at}.detail`, PLAN_LIMITS.detailLength),
    inheritsFromItemId: optionalId(raw.inheritsFromItemId, `${at}.inheritsFromItemId`),
    kind,
    linkedEventId,
    meta: jsonObject(raw.meta, `${at}.meta`, 16_384),
    phaseKey,
    status,
    suggestedWeek,
    title: requiredText(raw.title, `${at}.title`, PLAN_LIMITS.titleLength),
  };
}

export interface ParsedCreatePlanVersionInput {
  goalSnapshot: string;
  horizon: PlanHorizon;
  startsOn: string;
  analysis: Record<string, unknown>;
  phases: PlanPhase[];
  items: ParsedNewItem[];
  sourceSessionId: string | null;
  basePlanId: string | null | undefined;
  creationKey: string | null;
}

export function parseCreatePlanVersionInput(value: unknown): ParsedCreatePlanVersionInput {
  if (!isPlainObject(value)) invalid("Plan body must be an object.");
  const raw = value as Partial<Record<keyof CreatePlanVersionInput, unknown>>;
  if (!PLAN_HORIZONS.includes(raw.horizon as PlanHorizon)) invalid("horizon must be month, quarter or year.");
  const phases = parsePhases(raw.phases);
  if (!Array.isArray(raw.items)) invalid("items must be an array.");
  if (raw.items.length > PLAN_LIMITS.itemsPerPlan) invalid("Too many plan items.");
  return {
    analysis: jsonObject(raw.analysis, "analysis", 65_536),
    basePlanId: raw.basePlanId === undefined ? undefined : optionalId(raw.basePlanId, "basePlanId"),
    creationKey: optionalId(raw.creationKey, "creationKey"),
    goalSnapshot: requiredText(raw.goalSnapshot, "goalSnapshot", PLAN_LIMITS.goalLength),
    horizon: raw.horizon as PlanHorizon,
    items: raw.items.map((item, index) => parseItem(item, index, phases)),
    phases,
    sourceSessionId: optionalId(raw.sourceSessionId, "sourceSessionId"),
    startsOn: isoDate(raw.startsOn, "startsOn"),
  };
}

export function parseItemChange(value: unknown): PlanItemChange {
  if (!isPlainObject(value)) invalid("change must be an object.");
  switch (value.op as (typeof PLAN_ITEM_CHANGE_OPS)[number]) {
    case "set_status":
      return { op: "set_status", status: requiredText(value.status, "status", 32) as PlanItemStatus };
    case "link_contact":
    case "establish_contact":
    case "unlink_contact":
      return { op: value.op as "link_contact", contactId: parseId(value.contactId, "contactId") };
    case "set_answer":
      return { op: "set_answer", answer: optionalText(value.answer, "answer", PLAN_LIMITS.answerLength) };
    case "defer_action":
      return { op: "defer_action", toWeek: week(value.toWeek, "toWeek") };
    default:
      invalid("change.op is not supported.");
  }
}

export function parseUpdatePlanItemInput(value: unknown): UpdatePlanItemInput {
  if (!isPlainObject(value)) invalid("Update body must be an object.");
  return {
    change: parseItemChange(value.change),
    idempotencyKey: optionalId(value.idempotencyKey, "idempotencyKey"),
    itemId: parseId(value.itemId, "itemId"),
  };
}

export interface ParsedManualLogInput {
  body: string;
  itemId: string | null;
  targetItemId: string | null;
  linkedContactIds: string[];
  linkedEventId: string | null;
  idempotencyKey: string | null;
}

export function parseManualLogInput(value: unknown): ParsedManualLogInput {
  if (!isPlainObject(value)) invalid("Log body must be an object.");
  const raw = value as Partial<Record<keyof AddManualLogInput, unknown>>;
  return {
    body: requiredText(raw.body, "body", PLAN_LIMITS.bodyLength),
    idempotencyKey: optionalId(raw.idempotencyKey, "idempotencyKey"),
    itemId: optionalId(raw.itemId, "itemId"),
    linkedContactIds: idList(raw.linkedContactIds, "linkedContactIds", 50),
    linkedEventId: optionalId(raw.linkedEventId, "linkedEventId"),
    targetItemId: optionalId(raw.targetItemId, "targetItemId"),
  };
}
