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

export type BusinessCardContactPointType = "phone" | "mobile" | "fax";

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
  | "NATIVE_ROMANIZED_NAME_CONFLICT";

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

export interface BusinessCardCloudOcrResult {
  extraction: BusinessCardStructuredExtraction;
  usage: BusinessCardCloudOcrUsage;
}

export interface BusinessCardCloudOcrProvider {
  model: string;
  providerName: string;
  extract(input: {
    imageBase64: string;
    mimeType: BusinessCardImageMimeType;
  }): Promise<BusinessCardCloudOcrResult>;
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

function officeLabels(
  extraction: BusinessCardStructuredExtraction,
): readonly string[] {
  return [
    ...extraction.addresses.map((item) => item.label),
    ...extraction.contactPoints.map((item) => item.label),
  ].filter((label): label is string => Boolean(label));
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

function hasNativeRomanizedPairRequiringReview(
  extraction: BusinessCardStructuredExtraction,
): boolean {
  const nativeName = extraction.nativeFullName?.replace(/\s/g, "").toLowerCase();
  const romanizedName = extraction.romanizedFullName
    ?.replace(/\s/g, "")
    .toLowerCase();

  return Boolean(
    nativeName &&
      romanizedName &&
      nativeName !== romanizedName,
  );
}

export function reviewIssuesForBusinessCard(
  input: BusinessCardStructuredExtraction,
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

  if (new Set(officeLabels(extraction)).size > 1) {
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

  return issues;
}

