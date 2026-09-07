/**
 * Provider-neutral validation for cloud business-card OCR output.
 *
 * Every OCR provider (Gemini, DeepSeek, ...) must funnel its structured
 * output through `parseBusinessCardStructuredExtraction` so invalid payloads
 * fail loudly with the shared provider error instead of leaking downstream.
 */

import type {
  BusinessCardContactPoint,
  BusinessCardContactPointType,
  BusinessCardLabeledValue,
  BusinessCardStructuredExtraction,
} from "./business-card-cloud-ocr";

const nullableStringSchema = {
  type: ["string", "null"],
} as const;

const labeledValueSchema = {
  additionalProperties: false,
  properties: {
    label: nullableStringSchema,
    value: { type: "string" },
  },
  required: ["label", "value"],
  type: "object",
} as const;

export const BUSINESS_CARD_EXTRACTION_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    addresses: {
      items: labeledValueSchema,
      type: "array",
    },
    certifications: {
      items: { type: "string" },
      type: "array",
    },
    contactPoints: {
      items: {
        additionalProperties: false,
        properties: {
          label: nullableStringSchema,
          type: {
            enum: ["phone", "mobile", "fax", "wechat", "line", "whatsapp", "website", "other"],
            type: "string",
          },
          value: { type: "string" },
        },
        required: ["label", "type", "value"],
        type: "object",
      },
      type: "array",
    },
    departments: {
      items: { type: "string" },
      type: "array",
    },
    detectedLanguages: {
      items: { type: "string" },
      type: "array",
    },
    emails: {
      items: labeledValueSchema,
      type: "array",
    },
    fullName: nullableStringSchema,
    nativeFullName: nullableStringSchema,
    organization: nullableStringSchema,
    romanizedFullName: nullableStringSchema,
    title: nullableStringSchema,
    website: nullableStringSchema,
  },
  required: [
    "fullName",
    "nativeFullName",
    "romanizedFullName",
    "organization",
    "departments",
    "title",
    "emails",
    "contactPoints",
    "website",
    "addresses",
    "certifications",
    "detectedLanguages",
  ],
  type: "object",
} as const;

export type BusinessCardCloudOcrProviderErrorCode =
  | "INVALID_STRUCTURED_OUTPUT"
  | "PROVIDER_REQUEST_FAILED"
  | "PROVIDER_TIMEOUT";

export class BusinessCardCloudOcrProviderError extends Error {
  readonly code: BusinessCardCloudOcrProviderErrorCode;

  constructor(
    code: BusinessCardCloudOcrProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BusinessCardCloudOcrProviderError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return null;
  }

  return value;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === "string" ? value : undefined;
}

function labeledValues(value: unknown): readonly BusinessCardLabeledValue[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: BusinessCardLabeledValue[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }

    const label = nullableString(item.label);

    if (label === undefined || typeof item.value !== "string") {
      return null;
    }

    parsed.push({
      label,
      value: item.value,
    });
  }

  return parsed;
}

const CONTACT_POINT_TYPES: readonly BusinessCardContactPointType[] = [
  "phone",
  "mobile",
  "fax",
  "wechat",
  "line",
  "whatsapp",
  "website",
  "other",
];

function isContactPointType(value: unknown): value is BusinessCardContactPointType {
  return CONTACT_POINT_TYPES.some((type) => type === value);
}

function contactPoints(value: unknown): readonly BusinessCardContactPoint[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: BusinessCardContactPoint[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }

    const label = nullableString(item.label);

    if (
      label === undefined ||
      !isContactPointType(item.type) ||
      typeof item.value !== "string"
    ) {
      return null;
    }

    parsed.push({
      label,
      type: item.type,
      value: item.value,
    });
  }

  return parsed;
}

export function parseBusinessCardStructuredExtraction(
  value: unknown,
): BusinessCardStructuredExtraction {
  if (!isRecord(value)) {
    throw new BusinessCardCloudOcrProviderError(
      "INVALID_STRUCTURED_OUTPUT",
      "The OCR provider returned an invalid structured business-card result.",
    );
  }

  const fullName = nullableString(value.fullName);
  const nativeFullName = nullableString(value.nativeFullName);
  const romanizedFullName = nullableString(value.romanizedFullName);
  const organization = nullableString(value.organization);
  const title = nullableString(value.title);
  const website = nullableString(value.website);
  const departments = stringArray(value.departments);
  const emails = labeledValues(value.emails);
  const points = contactPoints(value.contactPoints);
  const addresses = labeledValues(value.addresses);
  const certifications = stringArray(value.certifications);
  const detectedLanguages = stringArray(value.detectedLanguages);

  if (
    fullName === undefined ||
    nativeFullName === undefined ||
    romanizedFullName === undefined ||
    organization === undefined ||
    title === undefined ||
    website === undefined ||
    !departments ||
    !emails ||
    !points ||
    !addresses ||
    !certifications ||
    !detectedLanguages
  ) {
    throw new BusinessCardCloudOcrProviderError(
      "INVALID_STRUCTURED_OUTPUT",
      "The OCR provider returned an invalid structured business-card result.",
    );
  }

  return {
    fullName,
    nativeFullName,
    romanizedFullName,
    organization,
    departments,
    title,
    emails,
    contactPoints: points,
    website,
    addresses,
    certifications,
    detectedLanguages,
  };
}
