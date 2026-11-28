/**
 * Profile matching fields (2026-11-28): identity, line of business, who they sell to, their customers' industries,
 * and (investors) the stages they invest in. Saved once on the profile and used by every event's matching.
 *
 * Each field carries a source: "inferred" (from a business card or AI reading the profile, waiting for the person
 * to confirm) or "confirmed" (the person saved it). A value the system cannot tell stays empty — never guessed.
 */
import type {
  ProfileIdentityCode,
  ProfileInvestStageCode,
  ProfileMatchFieldCode,
  ProfileMatchFieldsContract,
  ProfileSellsToCode,
} from "../../shared/contract/profile";
import { businessCategory } from "../../shared/domain/business-categories";
import { INDUSTRY_CATALOG, SECONDARY_INDUSTRY_CATALOG } from "../../shared/domain/industries";
import type { ProfileMatchFieldsUpdate } from "./contract";

export const PROFILE_IDENTITY_CODES: readonly ProfileIdentityCode[] = ["founder", "investor", "finance_advisor", "corporate", "channel", "professional", "student", "other"];
export const PROFILE_SELLS_TO_CODES: readonly ProfileSellsToCode[] = ["business", "consumer", "both"];
export const PROFILE_INVEST_STAGE_CODES: readonly ProfileInvestStageCode[] = ["seed", "angel", "series_a", "series_b_plus", "growth"];
export const PROFILE_MATCH_FIELD_CODES: readonly ProfileMatchFieldCode[] = ["identity", "businessCategoryIds", "sellsTo", "customerIndustryIds", "investStages"];
export const MAX_BUSINESS_CATEGORIES = 2;
export const MAX_CUSTOMER_INDUSTRIES = 3;

export const PROFILE_IDENTITY_LABELS: Record<ProfileIdentityCode, { zh: string; ja: string; en: string }> = {
  channel: { en: "Sales, channel or trade", ja: "販売・代理店・貿易", zh: "销售、渠道或贸易" },
  corporate: { en: "Business role at a company", ja: "事業会社の担当者", zh: "企业里负责业务的人" },
  finance_advisor: { en: "Fundraising or M&A adviser", ja: "資金調達・M&Aアドバイザー", zh: "融资或并购顾问" },
  founder: { en: "Founder or business owner", ja: "起業家・経営者", zh: "创业者或经营者" },
  investor: { en: "Investor (own capital)", ja: "投資家（自ら出資）", zh: "投资人（自己出资）" },
  other: { en: "Other", ja: "その他", zh: "其他" },
  professional: { en: "Professional (law, accounting, consulting)", ja: "専門家（士業・コンサル）", zh: "专业服务（律师、会计、咨询）" },
  student: { en: "Student or job seeker", ja: "学生・求職中", zh: "学生或求职" },
};
export const PROFILE_SELLS_TO_LABELS: Record<ProfileSellsToCode, { zh: string; ja: string; en: string }> = {
  both: { en: "Both", ja: "両方", zh: "都有" },
  business: { en: "Businesses", ja: "企業", zh: "企业" },
  consumer: { en: "Individuals", ja: "個人", zh: "个人" },
};
export const PROFILE_INVEST_STAGE_LABELS: Record<ProfileInvestStageCode, { zh: string; ja: string; en: string }> = {
  angel: { en: "Angel", ja: "エンジェル", zh: "天使轮" },
  growth: { en: "Growth / PE", ja: "グロース・PE", zh: "成长期/PE" },
  seed: { en: "Seed", ja: "シード", zh: "种子轮" },
  series_a: { en: "Series A", ja: "シリーズA", zh: "A 轮" },
  series_b_plus: { en: "Series B+", ja: "シリーズB以降", zh: "B 轮及以后" },
};

const INDUSTRY_IDS = new Set<string>([...INDUSTRY_CATALOG.map((industry) => industry.id), ...SECONDARY_INDUSTRY_CATALOG.map((industry) => industry.id)]);

function uniqueList(values: unknown, valid: (value: string) => boolean, max: number): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed && valid(trimmed) && !out.includes(trimmed)) out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

export class ProfileMatchFieldsError extends Error {
  constructor(readonly field: ProfileMatchFieldCode) {
    super(`Invalid profile match field: ${field}`);
    this.name = "ProfileMatchFieldsError";
  }
}

/** Strict check of a save: unknown codes or ids are refused (the client only offers catalog values). */
export function validateMatchFieldsUpdate(update: ProfileMatchFieldsUpdate): void {
  if (update.identity != null && !PROFILE_IDENTITY_CODES.includes(update.identity)) throw new ProfileMatchFieldsError("identity");
  if (update.sellsTo != null && !PROFILE_SELLS_TO_CODES.includes(update.sellsTo)) throw new ProfileMatchFieldsError("sellsTo");
  if (update.businessCategoryIds != null) {
    if (!Array.isArray(update.businessCategoryIds) || update.businessCategoryIds.length > MAX_BUSINESS_CATEGORIES || update.businessCategoryIds.some((id) => !businessCategory(id))) {
      throw new ProfileMatchFieldsError("businessCategoryIds");
    }
  }
  if (update.customerIndustryIds != null) {
    if (!Array.isArray(update.customerIndustryIds) || update.customerIndustryIds.length > MAX_CUSTOMER_INDUSTRIES || update.customerIndustryIds.some((id) => !INDUSTRY_IDS.has(id))) {
      throw new ProfileMatchFieldsError("customerIndustryIds");
    }
  }
  if (update.investStages != null) {
    if (!Array.isArray(update.investStages) || update.investStages.some((stage) => !PROFILE_INVEST_STAGE_CODES.includes(stage))) throw new ProfileMatchFieldsError("investStages");
  }
}

/** Tolerant read of a stored value: drops anything not in the catalogs. */
export function readMatchFields(value: unknown): ProfileMatchFieldsContract | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const out: ProfileMatchFieldsContract = {};
  if (typeof raw.identity === "string" && PROFILE_IDENTITY_CODES.includes(raw.identity as ProfileIdentityCode)) out.identity = raw.identity as ProfileIdentityCode;
  if (typeof raw.sellsTo === "string" && PROFILE_SELLS_TO_CODES.includes(raw.sellsTo as ProfileSellsToCode)) out.sellsTo = raw.sellsTo as ProfileSellsToCode;
  const categories = uniqueList(raw.businessCategoryIds, (id) => Boolean(businessCategory(id)), MAX_BUSINESS_CATEGORIES);
  if (categories) out.businessCategoryIds = categories;
  const customers = uniqueList(raw.customerIndustryIds, (id) => INDUSTRY_IDS.has(id), MAX_CUSTOMER_INDUSTRIES);
  if (customers) out.customerIndustryIds = customers;
  const stages = uniqueList(raw.investStages, (stage) => PROFILE_INVEST_STAGE_CODES.includes(stage as ProfileInvestStageCode), PROFILE_INVEST_STAGE_CODES.length);
  if (stages) out.investStages = stages as ProfileInvestStageCode[];
  if (raw.sources && typeof raw.sources === "object") {
    const sources: Partial<Record<ProfileMatchFieldCode, "inferred" | "confirmed">> = {};
    for (const field of PROFILE_MATCH_FIELD_CODES) {
      const source = (raw.sources as Record<string, unknown>)[field];
      if (source === "inferred" || source === "confirmed") sources[field] = source;
    }
    if (Object.keys(sources).length) out.sources = sources;
  }
  if (raw.evidence && typeof raw.evidence === "object") {
    const evidence: Partial<Record<ProfileMatchFieldCode, string>> = {};
    for (const field of PROFILE_MATCH_FIELD_CODES) {
      const text = (raw.evidence as Record<string, unknown>)[field];
      if (typeof text === "string" && text.trim()) evidence[field] = text.trim().slice(0, 120);
    }
    if (Object.keys(evidence).length) out.evidence = evidence;
  }
  if (typeof raw.inferredAt === "string") out.inferredAt = raw.inferredAt;
  return Object.keys(out).length ? out : undefined;
}

/**
 * The person's save: each field present becomes "confirmed" (null clears it, and its source); omitted fields keep
 * their stored value and source. `null` for the whole update clears everything.
 */
export function mergeMatchFieldsUpdate(
  current: ProfileMatchFieldsContract | undefined,
  update: ProfileMatchFieldsUpdate | null | undefined,
): ProfileMatchFieldsContract | undefined {
  if (update === undefined) return current;
  if (update === null) return undefined;
  validateMatchFieldsUpdate(update);
  const next: Record<string, unknown> = { ...(current ?? {}) };
  const sources: Partial<Record<ProfileMatchFieldCode, "inferred" | "confirmed">> = { ...(current?.sources ?? {}) };
  const evidence: Partial<Record<ProfileMatchFieldCode, string>> = { ...(current?.evidence ?? {}) };
  for (const field of PROFILE_MATCH_FIELD_CODES) {
    if (!(field in update)) continue;
    const value = update[field];
    delete evidence[field];
    if (value === null || value === undefined) {
      delete next[field];
      delete sources[field];
      continue;
    }
    // An empty list saved by the person is an answer ("none"), so it is confirmed.
    next[field] = Array.isArray(value) ? [...value] : value;
    sources[field] = "confirmed";
  }
  delete next.sources;
  delete next.evidence;
  const result = readMatchFields({ ...next, ...(Object.keys(sources).length ? { sources } : {}), ...(Object.keys(evidence).length ? { evidence } : {}) });
  return result;
}

/**
 * An inference merged into a profile: only fields the person has not confirmed are written; empty inferences leave
 * the field empty (so the person is asked).
 */
export function mergeInferredMatchFields(
  current: ProfileMatchFieldsContract | undefined,
  inferred: { [K in ProfileMatchFieldCode]?: ProfileMatchFieldsContract[K] | null } & { evidence?: Partial<Record<ProfileMatchFieldCode, string>> },
  inferredAt: string,
): ProfileMatchFieldsContract | undefined {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  const sources: Partial<Record<ProfileMatchFieldCode, "inferred" | "confirmed">> = { ...(current?.sources ?? {}) };
  const evidence: Partial<Record<ProfileMatchFieldCode, string>> = { ...(current?.evidence ?? {}) };
  for (const field of PROFILE_MATCH_FIELD_CODES) {
    if (sources[field] === "confirmed") continue;
    const value = inferred[field];
    const empty = value === null || value === undefined || (Array.isArray(value) && value.length === 0);
    if (empty) {
      delete next[field];
      delete sources[field];
      delete evidence[field];
      continue;
    }
    next[field] = value;
    sources[field] = "inferred";
    const why = inferred.evidence?.[field];
    if (why) evidence[field] = why; else delete evidence[field];
  }
  delete next.sources;
  delete next.evidence;
  return readMatchFields({ ...next, inferredAt, ...(Object.keys(sources).length ? { sources } : {}), ...(Object.keys(evidence).length ? { evidence } : {}) });
}

/**
 * Fields the person still has to look at: empty, or inferred and not yet confirmed. Investors confirm the industries
 * they invest in (stored in customerIndustryIds) and their stages instead of what they sell; students only confirm
 * their identity; customers only apply when they sell to businesses.
 */
export function matchFieldsNeedingConfirmation(fields: ProfileMatchFieldsContract | undefined): ProfileMatchFieldCode[] {
  const out: ProfileMatchFieldCode[] = [];
  const confirmed = (field: ProfileMatchFieldCode) => fields?.sources?.[field] === "confirmed";
  if (!fields?.identity || !confirmed("identity")) out.push("identity");
  if (fields?.identity === "student") return out;
  if (fields?.identity === "investor") {
    if (!confirmed("customerIndustryIds")) out.push("customerIndustryIds");
    if (!confirmed("investStages")) out.push("investStages");
    return out;
  }
  if (!fields?.businessCategoryIds?.length || !confirmed("businessCategoryIds")) out.push("businessCategoryIds");
  if (!fields?.sellsTo || !confirmed("sellsTo")) out.push("sellsTo");
  if (fields?.sellsTo !== "consumer" && !confirmed("customerIndustryIds")) out.push("customerIndustryIds");
  return out;
}
