/**
 * Provider-neutral business-card OCR types and deterministic review policy.
 *
 * The model extracts visible text into this schema. Code remains responsible
 * for normalization and deciding which fields require human review.
 */

export const BUSINESS_CARD_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type BusinessCardImageMimeType =
  (typeof BUSINESS_CARD_IMAGE_MIME_TYPES)[number];

// 通用联系方式：印在名片上的任何联系渠道都必须有去处，分类不了的用 other，
// 绝不静默丢弃（微信号此前直接没有槽位）。
export type BusinessCardContactPointType =
  | "phone"
  | "mobile"
  | "fax"
  | "wechat"
  | "line"
  | "whatsapp"
  | "website"
  | "other";

export interface BusinessCardLabeledValue {
  label: string | null;
  value: string;
}

export interface BusinessCardContactPoint extends BusinessCardLabeledValue {
  type: BusinessCardContactPointType;
}

export interface BusinessCardStructuredExtraction {
  fullName: string | null;
  nativeFullName: string | null;
  romanizedFullName: string | null;
  organization: string | null;
  departments: readonly string[];
  title: string | null;
  emails: readonly BusinessCardLabeledValue[];
  contactPoints: readonly BusinessCardContactPoint[];
  website: string | null;
  addresses: readonly BusinessCardLabeledValue[];
  certifications: readonly string[];
  detectedLanguages: readonly string[];
}

export type BusinessCardReviewIssueCode =
  | "IDENTITY_MISSING"
  | "INVALID_EMAIL"
  | "INVALID_PHONE"
  | "MULTIPLE_OFFICES"
  | "SHARED_CONTACT_VALUE"
  | "NATIVE_ROMANIZED_NAME_CONFLICT"
  | "ORG_SUFFIX_MISSING"
  | "VERIFICATION_MISMATCH";

export interface BusinessCardReviewIssue {
  code: BusinessCardReviewIssueCode;
  field: string;
  message: string;
}

export interface BusinessCardCloudOcrUsage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

// 第三遍「高风险字段逐字符重读」的原样读数。空数组组合视为校验不可用
// （模型未按格式返回），由 review 策略判空跳过，不产生误报。
export interface BusinessCardVerificationReads {
  emails: readonly string[];
  organizations: readonly string[];
  phones: readonly string[];
}

export interface BusinessCardCloudOcrResult {
  extraction: BusinessCardStructuredExtraction;
  usage: BusinessCardCloudOcrUsage;
  /** 第一阶段的逐行转写原文；复核策略用它做「原文有株式会社而结构化没有」类比对。 */
  transcript?: string;
}

export interface BusinessCardCloudOcrProvider {
  model: string;
  providerName: string;
  extract(input: {
    imageBase64: string;
    mimeType: BusinessCardImageMimeType;
  }): Promise<BusinessCardCloudOcrResult>;
  /**
   * 可选的第三遍定向复核：对同一张全图只重读邮箱/电话/公司行（逐字符）。
   * 失败或缺席都不阻塞主链路——没有校验读数时相关 issue 直接不产生。
   */
  verifyHighRiskFields?(input: {
    imageBase64: string;
    mimeType: BusinessCardImageMimeType;
  }): Promise<BusinessCardVerificationReads | null>;
}

function optionalText(value: string | null): string | null {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function textList(values: readonly string[]): readonly string[] {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function labeledValues(
  values: readonly BusinessCardLabeledValue[],
  normalizeValue: (value: string) => string = (value) => value,
): readonly BusinessCardLabeledValue[] {
  return values
    .map((item) => ({
      label: optionalText(item.label),
      value: normalizeValue(item.value.trim()),
    }))
    .filter((item) => item.value.length > 0);
}

function contactPoints(
  values: readonly BusinessCardContactPoint[],
): readonly BusinessCardContactPoint[] {
  return values
    .map((item) => ({
      label: optionalText(item.label),
      type: item.type,
      value: item.value.trim(),
    }))
    .filter((item) => item.value.length > 0);
}

export function normalizeBusinessCardExtraction(
  extraction: BusinessCardStructuredExtraction,
): BusinessCardStructuredExtraction {
  return {
    fullName: optionalText(extraction.fullName),
    nativeFullName: optionalText(extraction.nativeFullName),
    romanizedFullName: optionalText(extraction.romanizedFullName),
    organization: optionalText(extraction.organization),
    departments: textList(extraction.departments),
    title: optionalText(extraction.title),
    emails: labeledValues(extraction.emails, (value) => value.toLowerCase()),
    contactPoints: contactPoints(extraction.contactPoints),
    website: optionalText(extraction.website),
    addresses: labeledValues(extraction.addresses),
    certifications: textList(extraction.certifications),
    detectedLanguages: textList(extraction.detectedLanguages),
  };
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");

  return digits.length >= 7 && digits.length <= 18;
}

// 名片上印的「Tel / Fax / mobile phone / 《office》/ 電話 / 携帯」是渠道名，
// 不是办公地点。去掉这些通用词后还剩下内容（「本社」「関西事業所」「Shanghai」）
// 才算地点标签——此前把渠道名也当地点，只要同时印了电话和传真就误报
// MULTIPLE_OFFICES（实测：单一地址的日本名片被要求确认主要办公地点）。
const GENERIC_CONTACT_LABEL_RE =
  /tel(?:ephone)?|phone|fax|facsimile|mobile|cell(?:ular)?|office|direct|main|line|dial|number|address|addr|email|e-?mail|电话|電話|手机|手機|携帯|传真|傳真|ファッ?クス|住所|地址|办公室?|辦公室?|事務所|直通|直线|直線|代表|总机|總機|番号|号码|號碼|[^\p{L}\p{N}]+/giu;

function locationLabel(label: string | null): string | null {
  if (!label) return null;
  const remainder = label.replace(GENERIC_CONTACT_LABEL_RE, "").toLowerCase();
  // 去掉通用词后只剩一两个字母（"T"、"M"、"No"）的是缩写，同样不是地点。
  return remainder.length > 2 || /[^\x00-\x7f]/.test(remainder) ? remainder : null;
}

function normalizedAddress(value: string): string {
  return value.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

// 多个办公地点 = 印了多个不同的地址，或号码/地址上出现了多个不同的地点标签。
// 微信/LINE/网站不参与：它们的 label 是渠道名。
function hasMultipleOffices(extraction: BusinessCardStructuredExtraction): boolean {
  if (new Set(extraction.addresses.map((item) => normalizedAddress(item.value))).size > 1) {
    return true;
  }
  const labels = [
    ...extraction.addresses.map((item) => item.label),
    ...extraction.contactPoints
      .filter((item) => item.type === "phone" || item.type === "mobile" || item.type === "fax")
      .map((item) => item.label),
  ]
    .map(locationLabel)
    .filter((label): label is string => Boolean(label));
  return new Set(labels).size > 1;
}

function hasSharedContactValue(
  extraction: BusinessCardStructuredExtraction,
): boolean {
  const labelsByValue = new Map<string, Set<string>>();

  for (const point of extraction.contactPoints) {
    if (!point.label) {
      continue;
    }

    const normalizedValue = point.value.replace(/\s/g, "").toLowerCase();
    const labels = labelsByValue.get(normalizedValue) ?? new Set<string>();
    labels.add(point.label);
    labelsByValue.set(normalizedValue, labels);
  }

  return [...labelsByValue.values()].some((labels) => labels.size > 1);
}

const CJK_NAME_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u;
// 一个罗马字/拼音音节：可选声母（含促音双写、拗音）+ 元音 + 可选 n/ng/r 韵尾。
const ROMANIZED_TOKEN_RE =
  /^(?:(?:(?:ch|sh|zh|ts|[kgnhbpmr]y|([bcdfghjklmpqrstvwxyz])\1?|n)?[aeiouvüāēīōūâêîôû]+(?:ng|n|r)?)|n)+$/iu;

// 汉字/假名姓名配罗马字读音（富沢 弘治 / Tomizawa Hiroharu）是名片的常态，
// 两种文字当然「不相等」——此前据此一律要求复核，每张日文名片都被拦下。
// 只在读音明显不像罗马字/拼音（「UNRELATED PERSON」这类另一个人的名字）、
// 或两个都是拉丁字母却拼法不同时才标出。
function hasNativeRomanizedPairRequiringReview(
  extraction: BusinessCardStructuredExtraction,
): boolean {
  const nativeName = extraction.nativeFullName?.trim();
  const romanizedName = extraction.romanizedFullName?.trim();
  if (!nativeName || !romanizedName) return false;
  if (CJK_NAME_RE.test(nativeName)) {
    const tokens = romanizedName.split(/[\s\-·・.,]+/u).filter(Boolean);
    return !tokens.every((token) => ROMANIZED_TOKEN_RE.test(token));
  }
  return nativeName.replace(/\s/g, "").toLowerCase() !== romanizedName.replace(/\s/g, "").toLowerCase();
}

// 法律实体后缀词典（有限集）：转写原文含后缀而结构化公司名缺失时强制复核。
// 命中靠包含关系，不做模糊匹配——宁可漏报也不误报。
const ORG_LEGAL_SUFFIXES = [
  "株式会社",
  "(株)",
  "㈱",
  "合同会社",
  "有限会社",
  "合資会社",
  "一般社団法人",
  "有限公司",
  "股份有限公司",
  "Inc.",
  "Inc",
  "Ltd.",
  "Ltd",
  "LLC",
  "Corp.",
  "Corp",
  "Co.,",
  "GmbH",
  "K.K.",
] as const;

function containsLegalSuffix(text: string): boolean {
  const lower = text.toLowerCase();
  return ORG_LEGAL_SUFFIXES.some((suffix) => lower.includes(suffix.toLowerCase()));
}

function normalizedEmailForm(value: string): string {
  return value.replace(/\s/g, "").toLowerCase();
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

// 两串号码是否「差一两位」：长度相差 ≤1，逐位对齐后不同的位 ≤2。
function nearlySameDigits(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  const width = Math.max(left.length, right.length);
  let differences = Math.abs(left.length - right.length);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) differences += 1;
  }
  return differences > 0 && differences <= 2 && width >= 7;
}

export interface BusinessCardReviewContext {
  transcript?: string | null;
  verification?: BusinessCardVerificationReads | null;
}

export function reviewIssuesForBusinessCard(
  input: BusinessCardStructuredExtraction,
  context: BusinessCardReviewContext = {},
): readonly BusinessCardReviewIssue[] {
  const extraction = normalizeBusinessCardExtraction(input);
  const issues: BusinessCardReviewIssue[] = [];

  if (!extraction.fullName && !extraction.nativeFullName) {
    issues.push({
      code: "IDENTITY_MISSING",
      field: "fullName",
      message: "A visible name is required before this card can become a contact.",
    });
  }

  for (const email of extraction.emails) {
    if (!validEmail(email.value)) {
      issues.push({
        code: "INVALID_EMAIL",
        field: "emails",
        message: `Review the email labeled ${email.label ?? "email"}.`,
      });
      break;
    }
  }

  for (const point of extraction.contactPoints) {
    if (
      (point.type === "phone" || point.type === "mobile") &&
      !validPhone(point.value)
    ) {
      issues.push({
        code: "INVALID_PHONE",
        field: "contactPoints",
        message: `Review the ${point.type} value labeled ${point.label ?? point.type}.`,
      });
      break;
    }
  }

  if (hasMultipleOffices(extraction)) {
    issues.push({
      code: "MULTIPLE_OFFICES",
      field: "addresses",
      message: "Confirm which office should be the contact's primary location.",
    });
  }

  if (hasSharedContactValue(extraction)) {
    issues.push({
      code: "SHARED_CONTACT_VALUE",
      field: "contactPoints",
      message: "The same contact value appears under more than one office label.",
    });
  }

  if (hasNativeRomanizedPairRequiringReview(extraction)) {
    issues.push({
      code: "NATIVE_ROMANIZED_NAME_CONFLICT",
      field: "romanizedFullName",
      message: "Confirm the relationship between the native and romanized names.",
    });
  }

  // 转写原文含法律实体后缀（株式会社/Inc. 等）而结构化公司名一个都不含时，
  // 说明结构化阶段丢了后缀——强制复核，不静默通过。
  const transcript = context.transcript?.trim();
  if (
    transcript &&
    extraction.organization &&
    containsLegalSuffix(transcript) &&
    !containsLegalSuffix(extraction.organization)
  ) {
    issues.push({
      code: "ORG_SUFFIX_MISSING",
      field: "organization",
      message:
        "The card shows a legal-entity suffix that is missing from the extracted organization name.",
    });
  }

  // 第三遍定向重读与结构化结果不一致 → 标红，禁止静默确认。格式合法不等于
  // 字符正确（m-watanabe 和 r-watanabe 都能通过正则），一致性才是信号。
  // 读数完全为空视为校验不可用（模型未按格式返回），跳过而不误报。
  const verification = context.verification;
  const verificationUsable =
    verification &&
    verification.emails.length + verification.phones.length + verification.organizations.length > 0;
  if (verificationUsable) {
    const verifiedEmails = verification.emails.map(normalizedEmailForm);
    for (const email of extraction.emails) {
      if (verification.emails.length > 0 && !verifiedEmails.includes(normalizedEmailForm(email.value))) {
        issues.push({
          code: "VERIFICATION_MISMATCH",
          field: "emails",
          message: `A second character-level read of the card disagrees with the email ${email.value}.`,
        });
        break;
      }
    }

    const verifiedPhones = verification.phones.map(phoneDigits).filter((digits) => digits.length > 0);
    for (const point of extraction.contactPoints) {
      if (point.type !== "phone" && point.type !== "mobile" && point.type !== "fax") {
        continue;
      }
      const digits = phoneDigits(point.value);
      // 传真不进联系人的电话字段，复核读数又常常整条漏掉传真——漏读不算分歧。
      // 传真只在复核读出「差一两位的另一个号码」时才标出。
      const disagrees = point.type === "fax"
        ? verifiedPhones.some((verified) => nearlySameDigits(verified, digits))
        : !verifiedPhones.includes(digits);
      if (digits && verifiedPhones.length > 0 && !verifiedPhones.includes(digits) && disagrees) {
        issues.push({
          code: "VERIFICATION_MISMATCH",
          field: "contactPoints",
          message: `A second character-level read of the card disagrees with the ${point.type} number ${point.value}.`,
        });
        break;
      }
    }
  }

  return issues;
}

