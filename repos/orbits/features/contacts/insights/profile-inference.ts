/**
 * W0058（D58）：洞察生成同一调用顺带产出的「名片推测」——TA 能给你的（offering）／TA 需要的（seeking）／可以聊的话题（topics）。
 *
 * - 依据只能是名片资料：公司、职位、名片备注（含 OCR 拼进备注的部门）、行业；不依据 memo、时间线或目标文字；
 * - 每条必须带 `basis`，且 basis 指向的输入字段在本次输入里非空；每栏 ≤3 条，每条中文 ≤20 字、英文 ≤40 字符（超长整条丢弃）；
 * - 拒绝空洞套话（服务端黑名单，归一后整条等于或只由黑名单词组成即拒）、与公司名／职位原文相同的条目、带 id／别名的条目；
 * - 推不出来就是空数组（正确结果）。
 * 写入联系人时值取用户目标文字的语言（含 CJK 即 zh，否则 en），中英原文另存在来源记录 `bilingual`（W58-3）。
 */
import type { ContactInsightText } from "../../../shared/contract/contact-insight";
import { snapshotTextLeaksIds } from "../../network-analysis/snapshot-validator";
import type { EnrichedValue, ProfileListEnrichmentField } from "../enrichment/apply-enrichment";

export const PROFILE_INFERENCE_FIELDS: readonly ProfileListEnrichmentField[] = ["offering", "seeking", "topics"];
export const PROFILE_INFERENCE_BASES = ["title", "company", "card_notes", "industry"] as const;
export type ProfileInferenceBasis = (typeof PROFILE_INFERENCE_BASES)[number];
export const PROFILE_INFERENCE_LIMITS = { itemsPerField: 3, zhChars: 20, enChars: 40, cardNotesChars: 200 } as const;

export interface ProfileInferenceItem {
  text: ContactInsightText;
  basis: ProfileInferenceBasis;
}

export type ProfileInference = Record<ProfileListEnrichmentField, ProfileInferenceItem[]>;

/** 洞察行上存的推测（rev 2 G-3）：连同写入语言一起存，重放写回不再调用模型、结果确定。 */
export interface StoredProfileInference extends ProfileInference {
  language: "zh" | "en";
}

/** 推测所需的输入字段（来自 InsightInputContact）。 */
export interface ProfileInferenceSource {
  organization: string | null;
  role: string | null;
  industry: string | null;
  /** 已脱敏、截断后的名片备注。 */
  cardNotes: string | null;
}

export function emptyProfileInference(): ProfileInference {
  return { offering: [], seeking: [], topics: [] };
}

export function profileInferenceIsEmpty(value: ProfileInference | null | undefined): boolean {
  return !value || PROFILE_INFERENCE_FIELDS.every((field) => value[field].length === 0);
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+|\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:com|net|org|io|co|jp|cn|ai|dev|app|biz|info|me|tv|us|uk|sg|hk|tw|kr)(?:\.[a-z]{2})?(?:\/\S*)?/gi;
/** 至少 7 位数字（中间可有空格、横线、点、括号），前面可带 +：电话、传真、手机。 */
const PHONE = /\+?\d[\d\s().-]{5,}\d/g;

/** 名片备注进提示词前：去掉邮箱、URL、电话模式，压空白，截到 200 字（rev 2 易错边界 10）。 */
export function sanitizeCardNotes(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(EMAIL, " ")
    .replace(URL_PATTERN, " ")
    .replace(PHONE, (match) => (match.replace(/\D/g, "").length >= 7 ? " " : match))
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const chars = Array.from(cleaned);
  return chars.length > PROFILE_INFERENCE_LIMITS.cardNotesChars ? chars.slice(0, PROFILE_INFERENCE_LIMITS.cardNotesChars).join("") : cleaned;
}

/** 套话黑名单（W58-4）：归一后整条等于或只由这些词组成即拒。 */
export const PROFILE_BOILERPLATE_TERMS: readonly string[] = [
  "人脉资源", "行业经验", "合作机会", "资源对接", "商业机会", "人脉", "资源", "合作", "机会", "经验", "商机", "交流", "对接", "行业资源",
  "networking", "resources", "business opportunities", "industry experience", "collaboration", "opportunities", "opportunity",
  "connections", "network", "partnerships", "partnership", "cooperation", "experience", "business", "synergies", "synergy",
];

const SEPARATORS = /[\s\p{P}\p{S}]+/gu;
const CONNECTORS = /(以及|和|与|及|and|&)/g;

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(SEPARATORS, "");
}

const NORMALIZED_TERMS = [...new Set(PROFILE_BOILERPLATE_TERMS.map(normalize))].sort((a, b) => b.length - a.length);

export function isProfileBoilerplate(value: string): boolean {
  let rest = normalize(value);
  if (!rest) return true;
  for (const term of NORMALIZED_TERMS) rest = rest.split(term).join("");
  return rest.replace(CONNECTORS, "").length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export interface ProfileParseIds {
  contactIds: ReadonlySet<string>;
  recordIds: ReadonlySet<string>;
  needIds: ReadonlySet<string>;
}

/**
 * 校验一位联系人的推测（模型输出的 `profile` 对象）。返回保留的条目与丢弃数（日志用，不含内容）。
 * 结构不对（不是对象）时按空推测处理，不影响洞察本身。
 */
export function parseProfileInference(raw: unknown, source: ProfileInferenceSource, ids: ProfileParseIds): { profile: ProfileInference; dropped: number } {
  const profile = emptyProfileInference();
  let dropped = 0;
  if (!isRecord(raw)) return { dropped, profile };
  const available: Record<ProfileInferenceBasis, string | null> = {
    card_notes: cleanText(source.cardNotes) || null,
    company: cleanText(source.organization) || null,
    industry: cleanText(source.industry) || null,
    title: cleanText(source.role) || null,
  };
  const verbatim = new Set([available.company, available.title].filter((value): value is string => Boolean(value)).map(normalize));
  for (const field of PROFILE_INFERENCE_FIELDS) {
    const list = Array.isArray(raw[field]) ? (raw[field] as unknown[]) : [];
    const seen = new Set<string>();
    for (const entry of list) {
      if (!isRecord(entry)) {
        dropped += 1;
        continue;
      }
      const basis = typeof entry.basis === "string" ? (entry.basis.trim() as ProfileInferenceBasis) : null;
      const text = isRecord(entry.text) ? entry.text : null;
      const zh = cleanText(text?.zh);
      const en = cleanText(text?.en);
      const valid =
        basis !== null && PROFILE_INFERENCE_BASES.includes(basis) && available[basis] !== null &&
        zh.length > 0 && en.length > 0 &&
        Array.from(zh).length <= PROFILE_INFERENCE_LIMITS.zhChars && Array.from(en).length <= PROFILE_INFERENCE_LIMITS.enChars &&
        !isProfileBoilerplate(zh) && !isProfileBoilerplate(en) &&
        !verbatim.has(normalize(zh)) && !verbatim.has(normalize(en)) &&
        !snapshotTextLeaksIds(zh, ids) && !snapshotTextLeaksIds(en, ids);
      const key = normalize(zh);
      if (!valid || seen.has(key) || profile[field].length >= PROFILE_INFERENCE_LIMITS.itemsPerField) {
        dropped += 1;
        continue;
      }
      seen.add(key);
      profile[field].push({ basis: basis!, text: { en, zh } });
    }
  }
  return { dropped, profile };
}

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;

/** W58-3：写入语言取用户目标文字的语言（含 CJK 即 zh，否则 en），与 memo 提取「用用户书写的语言」同一惯例。 */
export function profileLanguageForGoal(goal: string | null | undefined): "zh" | "en" {
  return CJK.test(goal ?? "") ? "zh" : "en";
}

/** 存储形状 → 写回联系人的补全值（来源 ai／card_inference，值按存的语言，双语原文一一对应）。 */
export function profileInferenceValues(stored: StoredProfileInference): EnrichedValue[] {
  const values: EnrichedValue[] = [];
  for (const field of PROFILE_INFERENCE_FIELDS) {
    const seen = new Set<string>();
    const zh: string[] = [];
    const en: string[] = [];
    const value: string[] = [];
    for (const item of stored[field] ?? []) {
      const chosen = item.text[stored.language].trim();
      if (!chosen || seen.has(chosen)) continue;
      seen.add(chosen);
      value.push(chosen);
      zh.push(item.text.zh);
      en.push(item.text.en);
    }
    if (value.length) values.push({ bilingual: { en, zh }, field, origin: "ai", value, via: "card_inference" });
  }
  return values;
}

/** 读回洞察行上的推测（结构不合法 → null）。 */
export function readStoredProfileInference(value: unknown): StoredProfileInference | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed) || (parsed.language !== "zh" && parsed.language !== "en")) return null;
  const result: StoredProfileInference = { language: parsed.language, offering: [], seeking: [], topics: [] };
  for (const field of PROFILE_INFERENCE_FIELDS) {
    const list = Array.isArray(parsed[field]) ? (parsed[field] as unknown[]) : [];
    for (const entry of list) {
      if (!isRecord(entry) || !isRecord(entry.text)) continue;
      const zh = cleanText(entry.text.zh);
      const en = cleanText(entry.text.en);
      const basis = entry.basis as ProfileInferenceBasis;
      if (zh && en && PROFILE_INFERENCE_BASES.includes(basis)) result[field].push({ basis, text: { en, zh } });
    }
  }
  return result;
}
