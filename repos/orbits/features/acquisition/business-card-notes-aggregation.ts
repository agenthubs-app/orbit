import type { BusinessCardStructuredExtraction } from "./business-card-cloud-ocr";

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

  return lines.join("\n");
}
