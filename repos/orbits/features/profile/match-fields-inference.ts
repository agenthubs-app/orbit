/**
 * Infers a profile's matching fields from what the person already wrote (2026-11-28): headline, title, company,
 * self-introduction, industry, offers / looking-for, a business card. The model picks only from the catalogs and
 * must name the words it relied on; a field it cannot support stays null (the person is asked).
 * Reads its input only; never writes. Used by the backfill script and (next) by onboarding after a card scan.
 */
import type { ProfileMatchFieldCode, ProfileMatchFieldsContract } from "../../shared/contract/profile";
import { BUSINESS_CATEGORIES } from "../../shared/domain/business-categories";
import { INDUSTRY_CATALOG, SECONDARY_INDUSTRY_CATALOG } from "../../shared/domain/industries";
import { runOrbitAgentModelText, type GeminiOrbitAgentProviderConfig } from "../orbit-ai/gemini-provider";
import { PROFILE_IDENTITY_CODES, PROFILE_INVEST_STAGE_CODES, PROFILE_SELLS_TO_CODES, readMatchFields } from "./match-fields";

export interface MatchFieldsInferenceInput {
  headline?: string | null;
  role?: string | null;
  organization?: string | null;
  bio?: string | null;
  industry?: string | null;
  primaryIndustryId?: string | null;
  secondaryIndustryId?: string | null;
  seniorityLevel?: string | null;
  offering?: readonly string[] | null;
  seeking?: readonly string[] | null;
}

export type InferredMatchFields = { [K in ProfileMatchFieldCode]?: ProfileMatchFieldsContract[K] | null } & {
  evidence?: Partial<Record<ProfileMatchFieldCode, string>>;
};

export interface MatchFieldsInferenceResult {
  status: "inferred" | "insufficient" | "unavailable";
  fields: InferredMatchFields;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export const MATCH_FIELDS_MODEL_DEFAULTS = {
  deepseekThinking: false,
  jsonOutput: true,
  maxTokens: 800,
  requestTimeoutMs: 30_000,
  temperature: 0,
} as const satisfies GeminiOrbitAgentProviderConfig;

const clean = (value: unknown, max = 600) => (typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, max) : "");

const CATALOG_BLOCK = (() => {
  const categories = BUSINESS_CATEGORIES.map((category) => `${category.id}: ${category.labels.zh} / ${category.labels.ja}`).join("\n");
  const industries = [
    ...INDUSTRY_CATALOG.filter((industry) => industry.id !== "other").map((industry) => `${industry.id}: ${industry.labels.zh}（整个大类）`),
    ...SECONDARY_INDUSTRY_CATALOG.filter((industry) => !industry.id.endsWith(".other")).map((industry) => `${industry.id}: ${industry.labels.zh}`),
  ].join("\n");
  return { categories, industries };
})();

export function matchFieldsSystemInstruction(): string {
  return `你根据一个人自己写的资料，判断活动配对用的几项字段。只能从给定目录里选；资料里没有依据的项返回 null（或空数组），绝不猜。
字段：
- identity：${PROFILE_IDENTITY_CODES.join(" | ")}
  founder=创业者/经营者/公司老板或创始团队；investor=自己出资投资（天使/VC/投资基金）；finance_advisor=融资顾问/FA/并购中介/介绍投资人的人；
  corporate=在企业里负责业务的员工；channel=销售、代理、批发、贸易、电商运营方；professional=律师、会计、税务、咨询顾问；student=在读学生或求职中；other=都不是。
  能提供里有「エンジェル投資」「天使投资」「出資」，或自我介绍写了自己投资企业、找项目投资的，是 investor（即使也做并购或介绍投资人）。
  只是「能聊融资」「想认识投资人」不算 investor。
- businessCategoryIds：他本人主要做的业务，最多 2 个，主业在前；一句话介绍（headline）最能代表主业，优先按它判断，只能用下面「业务细类」里的 id。只是关注、感兴趣、想认识的领域，或过去的经验，不算。
- sellsTo：business（卖给企业）| consumer（卖给个人）| both。学生、投资人返回 null。
- customerIndustryIds：他的客户在哪些行业，最多 3 个，只能用下面「行业」里的 id；客户是各行各业企业就返回 []；sellsTo 为 consumer 时返回 []。
- investStages：只有 identity=investor 时填，从 ${PROFILE_INVEST_STAGE_CODES.join(" | ")} 里选；资料没写阶段就返回 []。
- evidence：每个非空字段写一句依据，引用他资料里的原话（不超过 30 字）。
只输出一个 JSON 对象：{"identity":…,"businessCategoryIds":[…],"sellsTo":…,"customerIndustryIds":[…],"investStages":[…],"evidence":{"identity":"…",…}}

业务细类（id: 名称）：
${CATALOG_BLOCK.categories}

行业（id: 名称）：
${CATALOG_BLOCK.industries}`;
}

export function matchFieldsUserText(input: MatchFieldsInferenceInput): string {
  return JSON.stringify({
    bio: clean(input.bio, 800),
    company: clean(input.organization, 120),
    headline: clean(input.headline, 200),
    industry: clean(input.industry, 60) || input.secondaryIndustryId || input.primaryIndustryId || "",
    lookingFor: (input.seeking ?? []).map((value) => clean(value, 40)).slice(0, 8),
    offers: (input.offering ?? []).map((value) => clean(value, 40)).slice(0, 8),
    seniority: clean(input.seniorityLevel, 30),
    title: clean(input.role, 80),
  });
}

/** Too little to read anything from: no title, no headline, no self-introduction. */
export function insufficientInput(input: MatchFieldsInferenceInput): boolean {
  return !clean(input.role) && !clean(input.headline) && clean(input.bio).length < 8;
}

/** Parses and validates model output against the catalogs; anything outside them is dropped. */
export function parseMatchFieldsInference(text: string, input?: MatchFieldsInferenceInput): InferredMatchFields | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/gu, ""));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return normalizeInference(raw as Record<string, unknown>, input);
}

const ANGEL = /エンジェル投資|天使投资|天使投資|angel invest|出資・投資|个人出资/iu;

/** Catalog checks plus the one rule the program owns: someone who offers angel investment is an investor. */
export function normalizeInference(rawValue: Record<string, unknown>, input?: MatchFieldsInferenceInput): InferredMatchFields {
  const raw: unknown = input && (input.offering ?? []).some((offer) => ANGEL.test(offer)) && rawValue.identity !== "investor"
    ? { ...rawValue, evidence: { ...(rawValue.evidence as object ?? {}), identity: "能提供：天使投资" }, identity: "investor", sellsTo: null }
    : rawValue;
  const value = raw as Record<string, unknown>;
  const valid = readMatchFields({ ...value, sources: undefined, inferredAt: undefined }) ?? {};
  const out: InferredMatchFields = {
    businessCategoryIds: valid.businessCategoryIds ?? [],
    customerIndustryIds: valid.customerIndustryIds ?? [],
    identity: valid.identity ?? null,
    investStages: valid.identity === "investor" ? valid.investStages ?? [] : [],
    sellsTo: valid.identity === "student" || valid.identity === "investor" ? null : valid.sellsTo ?? null,
  };
  if (out.sellsTo === "consumer") out.customerIndustryIds = [];
  // An investor's line of business is investing: angel investing first unless the model named a fund type.
  if (out.identity === "investor" && !(out.businessCategoryIds ?? []).some((id) => ["angel_investing", "vc_fund", "cvc", "pe_buyout"].includes(id))) {
    out.businessCategoryIds = ["angel_investing", ...(out.businessCategoryIds ?? [])].slice(0, 2);
  }
  if (!PROFILE_SELLS_TO_CODES.includes(out.sellsTo as never)) out.sellsTo = null;
  if (valid.evidence) out.evidence = valid.evidence;
  return out;
}

export function createMatchFieldsInferenceService(options: {
  modelConfig?: GeminiOrbitAgentProviderConfig;
  runModel?: typeof runOrbitAgentModelText;
} = {}) {
  const config: GeminiOrbitAgentProviderConfig = { ...MATCH_FIELDS_MODEL_DEFAULTS, ...options.modelConfig };
  const runModel = options.runModel ?? runOrbitAgentModelText;
  return {
    async infer(input: MatchFieldsInferenceInput): Promise<MatchFieldsInferenceResult> {
      if (insufficientInput(input)) return { fields: {}, status: "insufficient" };
      try {
        const result = await runModel({ config, systemInstruction: matchFieldsSystemInstruction(), userText: matchFieldsUserText(input) });
        if (result.success === false) return { fields: {}, status: "unavailable" };
        const parsed = parseMatchFieldsInference(result.text, input);
        if (!parsed) return { fields: {}, status: "unavailable" };
        const usage = result.responseMetadata?.usage;
        return {
          fields: parsed,
          status: "inferred",
          ...(usage ? { usage: { inputTokens: usage.promptTokens ?? undefined, outputTokens: usage.completionTokens ?? undefined } } : {}),
        };
      } catch {
        return { fields: {}, status: "unavailable" };
      }
    },
  };
}
