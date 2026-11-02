import type { BusinessCardStructuredExtraction } from "./business-card-cloud-ocr";
import { normalizeBusinessCardText } from "./business-card-other-text";

export const BUSINESS_CARD_OTHER_TEXT_HEADING = "名片上的其他信息";

const CONTACT_POINT_TYPE_LABEL: Record<string, string> = {
  fax: "传真",
  mobile: "手机",
  phone: "电话",
};

function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

function labeled(base: string, label: string | null): string {
  return label ? `${base}(${label})` : base;
}

/**
 * Everything the fixed review slots do not carry lands here, each value with
 * its printed label, so confirming a card never silently drops information.
 * `detectedLanguages` is metadata and intentionally excluded.
 */
export function aggregateBusinessCardNotes(
  extraction: BusinessCardStructuredExtraction,
  chosen: { email: string | null; phone: string | null },
): string {
  const lines: string[] = [];

  if (
    extraction.romanizedFullName &&
    extraction.romanizedFullName !== extraction.fullName &&
    extraction.romanizedFullName !== extraction.nativeFullName
  ) {
    lines.push(line("罗马字姓名", extraction.romanizedFullName));
  }
  if (
    extraction.nativeFullName &&
    extraction.fullName &&
    extraction.nativeFullName !== extraction.fullName
  ) {
    lines.push(line("原文姓名", extraction.nativeFullName));
  }
  for (const department of extraction.departments) {
    lines.push(line("部门", department));
  }
  for (const email of extraction.emails) {
    if (email.value !== chosen.email) {
      lines.push(line(labeled("邮箱", email.label), email.value));
    }
  }
  for (const point of extraction.contactPoints) {
    if (point.value !== chosen.phone) {
      lines.push(
        line(
          labeled(CONTACT_POINT_TYPE_LABEL[point.type] ?? point.type, point.label),
          point.value,
        ),
      );
    }
  }
  if (extraction.website) {
    lines.push(line("网站", extraction.website));
  }
  for (const address of extraction.addresses) {
    lines.push(line(labeled("地址", address.label), address.value));
  }
  for (const certification of extraction.certifications) {
    lines.push(line("资质", certification));
  }

  const notes = lines.join("\n");
  return [notes, businessCardOtherTextSection([extraction.otherText], notes)].filter(Boolean).join("\n");
}

/**
 * Sprint 0150：「名片上的其他信息」一段。各面（正面在前）合并、规范化后去重，
 * 已经出现在备注里的行不再重复；没有可写的行时返回空串（旧数据没有 otherText）。
 */
export function businessCardOtherTextSection(
  sides: readonly (readonly string[] | undefined)[],
  existingNotes: string,
): string {
  const existing = normalizeBusinessCardText(existingNotes);
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const otherText of sides) {
    for (const value of otherText ?? []) {
      const text = value.trim();
      const key = normalizeBusinessCardText(text);
      if (!key || seen.has(key) || existing.includes(key)) continue;
      seen.add(key);
      lines.push(text);
    }
  }
  return lines.length > 0 ? [BUSINESS_CARD_OTHER_TEXT_HEADING, ...lines].join("\n") : "";
}
