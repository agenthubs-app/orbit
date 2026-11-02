/**
 * Sprint 0150：名片上印着、但不属于任何栏位的有意义文字（口号、业务范围、资格说明、
 * 背面的服务列表等）。模型给出候选，取舍规则全部写在这里：去掉与已识别字段重复的行、
 * 无意义碎片，限制行数与长度。
 */

import type { BusinessCardStructuredExtraction } from "./business-card-cloud-ocr";

export const BUSINESS_CARD_OTHER_TEXT_MAX_LINES = 10;
export const BUSINESS_CARD_OTHER_TEXT_MAX_LENGTH = 200;

// 名片上常见的栏目标签；一行去掉已识别字段后只剩这些标签时，视为重复。
const LABEL_TOKENS = [
  "tel", "fax", "phone", "mobile", "mob", "cell", "email", "mail", "web", "url", "https", "http", "www",
  "wechat", "whatsapp", "line", "电话", "電話", "手机", "手機", "携帯", "传真", "傳真",
  "邮箱", "郵箱", "网址", "網址", "地址", "住所", "所在地", "代表", "直通", "微信",
];

/** 两个识别提供方共用的提示语；模型只给候选，取舍以下面的代码规则为准。 */
export const BUSINESS_CARD_OTHER_TEXT_INSTRUCTION = [
  "Put every other meaningful printed line that fits none of the fields above (taglines, business scope or service lists, qualifications, slogans, notes) into otherText, one item per printed line, with the original wording.",
  "Do not repeat in otherText any text already placed in another field, and leave out labels alone, page numbers, decorative symbols, and bare numbers.",
].join(" ");

const LEADING_BULLETS = /^[\s\-*•·・●○■□◆◇▪▶►#>]+/u;

/** 全半角、大小写、空白与标点符号都不参与比较；电话号码因此只剩数字。 */
export function normalizeBusinessCardText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function fieldKey(value: string): string {
  return normalizeBusinessCardText(value).replace(/^https?/u, "").replace(/^www/u, "");
}

function letterCount(value: string): number {
  return value.match(/\p{L}/gu)?.length ?? 0;
}

function cleanLine(value: string): string {
  return value.replaceAll("**", "").replace(LEADING_BULLETS, "").replace(/\s+/gu, " ").trim();
}

function fieldValues(extraction: BusinessCardStructuredExtraction): string[] {
  return [
    extraction.fullName,
    extraction.nativeFullName,
    extraction.romanizedFullName,
    extraction.organization,
    extraction.title,
    extraction.website,
    ...extraction.departments,
    ...extraction.certifications,
    ...extraction.emails.map((item) => item.value),
    ...extraction.contactPoints.map((item) => item.value),
    ...extraction.addresses.map((item) => item.value),
  ].filter((value): value is string => typeof value === "string");
}

function printedLabels(extraction: BusinessCardStructuredExtraction): string[] {
  return [...extraction.emails, ...extraction.contactPoints, ...extraction.addresses]
    .map((item) => item.label)
    .filter((label): label is string => typeof label === "string");
}

function byLengthDescending(keys: readonly string[]): string[] {
  return [...new Set(keys)].filter((key) => key.length > 0).sort((a, b) => b.length - a.length);
}

/**
 * 只保留有意义、且没进任何栏位的行：
 * - 规范化后被某个已识别字段包含，或去掉已识别字段与栏目标签后剩不到 2 个文字 → 重复；
 * - 少于 2 个有效字符、或没有任何文字（纯数字／符号、页码）→ 碎片；
 * - 规范化后相同的行只留第一条；最多 10 行，每行最多 200 字。
 */
export function filterBusinessCardOtherText(
  candidates: readonly string[],
  extraction: BusinessCardStructuredExtraction,
): string[] {
  const fields = byLengthDescending(fieldValues(extraction).map(fieldKey)).filter((key) => key.length >= 2);
  const labels = byLengthDescending([...LABEL_TOKENS, ...printedLabels(extraction)].map(normalizeBusinessCardText));
  const kept: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (kept.length >= BUSINESS_CARD_OTHER_TEXT_MAX_LINES) break;
    const text = cleanLine(candidate).slice(0, BUSINESS_CARD_OTHER_TEXT_MAX_LENGTH).trim();
    const key = normalizeBusinessCardText(text);
    if ((key.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 2 || letterCount(key) === 0) continue;
    if (seen.has(key)) continue;
    if (fields.some((field) => field.includes(key))) continue;
    let rest = key;
    for (const field of fields) rest = rest.split(field).join("");
    for (const label of labels) rest = rest.split(label).join("");
    if (letterCount(rest) < 2) continue;
    seen.add(key);
    kept.push(text);
  }

  return kept;
}

/** 把一段转写全文拆成候选行（DeepSeek 兜底用）。 */
export function businessCardTranscriptLines(transcript: string): string[] {
  return transcript.split(/\r?\n/u).map(cleanLine).filter(Boolean);
}
