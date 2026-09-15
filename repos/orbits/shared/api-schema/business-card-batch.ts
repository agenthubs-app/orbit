import { z } from "zod";

import type * as Contract from "../contract/business-card-batch";

const identity = z.string().refine((value) => value.trim().length > 0);
const timestamp = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);

const labeledValueSchema = z.object({ label: z.string().nullable(), value: z.string() })
  .transform((value): Contract.BusinessCardLabeledValueContract => ({ ...value, label: value.label }));
const contactPointSchema = z.object({
  label: z.string().nullable(),
  value: z.string(),
  type: z.enum(["phone", "mobile", "fax", "wechat", "line", "whatsapp", "website", "other"]),
}).transform((value): Contract.BusinessCardContactPointContract => ({ ...value, label: value.label }));

// Explicit projections retain required nullable/readonly fields under Web's
// non-strict TS configuration without asserting unvalidated values as DTOs.
export const businessCardStructuredExtractionSchema: z.ZodType<Contract.BusinessCardStructuredExtractionContract> = z.object({
  fullName: z.string().nullable(),
  nativeFullName: z.string().nullable(),
  romanizedFullName: z.string().nullable(),
  organization: z.string().nullable(),
  departments: z.array(z.string()).readonly(),
  title: z.string().nullable(),
  emails: z.array(labeledValueSchema).readonly(),
  contactPoints: z.array(contactPointSchema).readonly(),
  website: z.string().nullable(),
  addresses: z.array(labeledValueSchema).readonly(),
  certifications: z.array(z.string()).readonly(),
  detectedLanguages: z.array(z.string()).readonly(),
}).transform((value) => ({
  fullName: value.fullName,
  nativeFullName: value.nativeFullName,
  romanizedFullName: value.romanizedFullName,
  organization: value.organization,
  departments: value.departments,
  title: value.title,
  emails: value.emails,
  contactPoints: value.contactPoints,
  website: value.website,
  addresses: value.addresses,
  certifications: value.certifications,
  detectedLanguages: value.detectedLanguages,
}));

export const businessCardReviewIssueSchema: z.ZodType<Contract.BusinessCardReviewIssueContract> = z.object({
  code: z.enum(["IDENTITY_MISSING", "INVALID_EMAIL", "INVALID_PHONE", "MULTIPLE_OFFICES",
    "SHARED_CONTACT_VALUE", "NATIVE_ROMANIZED_NAME_CONFLICT", "ORG_SUFFIX_MISSING", "VERIFICATION_MISMATCH"]),
  field: z.string(),
  message: z.string(),
});

export const businessCardCloudOcrUsageSchema: z.ZodType<Contract.BusinessCardCloudOcrUsageContract> = z.object({
  inputTokens: count,
  outputTokens: count,
  latencyMs: z.number().nonnegative(),
});

export const businessCardBatchSchema: z.ZodType<Contract.BusinessCardBatchContract> = z.object({
  id: identity,
  actorId: identity,
  status: z.enum(["processing", "ready_for_review", "completed", "cancelled"]),
  totalItems: count,
  processedItems: count,
  failedItems: count,
  confirmedItems: count,
  skippedItems: count,
  sourceFiles: z.array(z.object({ fileName: z.string(), kind: z.enum(["image", "pdf"]), itemCount: count })).readonly(),
  createdAt: timestamp,
  updatedAt: timestamp,
  expiresAt: timestamp,
  imagesDeletedAt: timestamp.optional(),
}).transform(({ imagesDeletedAt, ...value }) => ({
  ...value,
  sourceFiles: value.sourceFiles,
  ...(imagesDeletedAt === undefined ? {} : { imagesDeletedAt }),
}));

const legacyItemObject = z.object({
  id: identity,
  batchId: identity,
  actorId: identity,
  seq: positiveInteger,
  sourceFileName: z.string(),
  sourcePage: positiveInteger.nullable(),
  status: z.enum(["pending", "processing", "extracted", "failed", "confirmed", "skipped"]),
  imagePath: z.string().nullable(),
  imageDigest: digest,
  uploadMimeType: z.string(),
  extraction: businessCardStructuredExtractionSchema.nullable(),
  reviewIssues: z.array(businessCardReviewIssueSchema).readonly(),
  usage: businessCardCloudOcrUsageSchema.nullable(),
  errorCode: z.enum(["OCR_PROVIDER_FAILED", "OCR_PROVIDER_TIMEOUT", "OCR_INVALID_OUTPUT"]).nullable(),
  attempts: count,
  leaseOwner: identity.nullable(),
  leasedAt: timestamp.nullable(),
  confirmedContactId: identity.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

function legacyItemContract(value: z.output<typeof legacyItemObject>): Contract.BusinessCardBatchItemContract {
  return {
    ...value,
    sourcePage: value.sourcePage,
    imagePath: value.imagePath,
    extraction: value.extraction,
    reviewIssues: value.reviewIssues,
    usage: value.usage,
    errorCode: value.errorCode,
    leaseOwner: value.leaseOwner,
    leasedAt: value.leasedAt,
    confirmedContactId: value.confirmedContactId,
  };
}

export const businessCardBatchItemSchema: z.ZodType<Contract.BusinessCardBatchItemContract> = legacyItemObject.transform(legacyItemContract);

export const businessCardBatchDetailSchema: z.ZodType<Contract.BusinessCardBatchDetailContract> = z.object({
  batch: businessCardBatchSchema,
  items: z.array(legacyItemObject.extend({ extraction: businessCardStructuredExtractionSchema.nullable().optional() })).readonly(),
}).superRefine((value, context) => {
  value.items.forEach((item, index) => {
    if (item.batchId !== value.batch.id) {
      context.addIssue({ code: "custom", path: ["items", index, "batchId"], message: "Item must belong to the response batch." });
    }
    if (item.actorId !== value.batch.actorId) {
      context.addIssue({ code: "custom", path: ["items", index, "actorId"], message: "Item must belong to the batch actor." });
    }
    if (item.extraction === undefined && value.batch.status !== "processing") {
      context.addIssue({ code: "custom", path: ["items", index, "extraction"], message: "Only a processing batch may omit extraction." });
    }
  });
}).transform((value) => ({
  batch: value.batch,
  items: value.items.map((item) => {
    const projected = legacyItemContract({ ...item, extraction: item.extraction ?? null });
    if (item.extraction !== undefined) return projected;
    const { extraction: _extraction, ...rest } = projected;
    return rest;
  }),
}));

export const businessCardBatchReviewInputSchema: z.ZodType<Contract.BusinessCardBatchReviewInputContract> = z.object({
  displayName: z.string(),
  organization: z.string(),
  role: z.string(),
  email: z.string(),
  phone: z.string(),
  relationshipContext: z.string(),
  notes: z.string(),
  allowDuplicate: z.boolean().optional(),
}).transform((value): Contract.BusinessCardBatchReviewInputContract => {
  const { allowDuplicate, ...fields } = value;
  return allowDuplicate === undefined ? fields : { ...fields, allowDuplicate };
});

const duplicateReviewSchema = z.strictObject({ state: z.literal("duplicate_review"), duplicateContactId: identity });
export const businessCardBatchConfirmationResponseSchema: z.ZodType<Contract.BusinessCardBatchConfirmationResponseContract> = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("created"), contactId: identity }),
  duplicateReviewSchema,
]);
export const businessCardBatchRetryResponseSchema: z.ZodType<Contract.BusinessCardBatchRetryResponseContract> = z.strictObject({ state: z.literal("pending") });
export const businessCardBatchSkipResponseSchema: z.ZodType<Contract.BusinessCardBatchSkipResponseContract> = z.strictObject({ state: z.literal("skipped") });
export const businessCardBatchFinishResponseSchema: z.ZodType<Contract.BusinessCardBatchFinishResponseContract> = z.strictObject({ state: z.literal("completed") });

export const ingestManifestEntrySchema: z.ZodType<Contract.IngestManifestEntryContract> = z.object({
  cardId: identity,
  side: z.enum(["front", "back"]),
  fileName: identity,
  mimeType: identity,
  rawSize: positiveInteger,
  seq: positiveInteger,
  clientDigest: digest,
});

export const ingestBatchSchema: z.ZodType<Contract.IngestBatchContract> = z.object({
  id: identity,
  actorId: identity,
  status: z.enum(["collecting", "processing", "ready_for_review", "completed", "cancelled", "expired"]),
  expectedItems: positiveInteger,
  version: positiveInteger,
  reviewGeneration: count,
  idempotencyKey: identity,
  manifestFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  statusReason: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  finalizedAt: timestamp.nullable(),
  expiresAt: timestamp,
}).transform((value) => ({ ...value, statusReason: value.statusReason, finalizedAt: value.finalizedAt }));

const ingestCardFieldSourcesSchema: z.ZodType<Contract.IngestCardFieldSourcesContract> = z.object({
  displayName: identity.nullable(),
  organization: identity.nullable(),
  role: identity.nullable(),
  email: identity.nullable(),
  phone: identity.nullable(),
}).transform((value): Contract.IngestCardFieldSourcesContract => ({
  displayName: value.displayName,
  organization: value.organization,
  role: value.role,
  email: value.email,
  phone: value.phone,
}));

function normalizeLegacyIngestItem(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const item = value as Record<string, unknown>;
  if (item.cardId !== undefined || item.side !== undefined || !Number.isInteger(item.seq)) return value;
  return { ...item, cardId: `legacy:${item.seq}`, side: "front" };
}

export const ingestItemSchema: z.ZodType<Contract.IngestItemContract> = z.preprocess(normalizeLegacyIngestItem, z.object({
  id: identity,
  batchId: identity,
  cardId: identity,
  side: z.enum(["front", "back"]),
  seq: positiveInteger,
  status: z.enum(["awaiting_upload", "uploaded", "excluded", "queued", "processing", "extracted", "terminal_failed", "confirmed", "skipped"]),
  version: positiveInteger,
  sourceFileName: z.string(),
  rawSize: positiveInteger,
  rawMimeType: z.string(),
  clientDigest: digest,
  imageDigest: digest.nullable(),
  derivativeObjectKey: z.string().nullable(),
  derivativeSize: positiveInteger.nullable(),
  extraction: businessCardStructuredExtractionSchema.nullable(),
  extractionSchemaVersion: positiveInteger.nullable(),
  reviewIssues: z.array(businessCardReviewIssueSchema).readonly(),
  usage: businessCardCloudOcrUsageSchema.nullable(),
  confirmedContactId: identity.nullable(),
  confirmedFieldSources: ingestCardFieldSourcesSchema.nullable().optional(),
  attemptCount: count,
  nextRetryAt: timestamp.nullable(),
  leaseExpiresAt: timestamp.nullable(),
  errorStage: z.enum(["normalize", "ocr", "lease"]).nullable(),
  errorCode: z.enum(["IMAGE_INVALID", "OCR_PROVIDER_FAILED", "OCR_PROVIDER_TIMEOUT", "OCR_INVALID_OUTPUT", "LEASE_EXHAUSTED"]).nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})).transform((value) => ({
  ...value,
  imageDigest: value.imageDigest,
  derivativeObjectKey: value.derivativeObjectKey,
  derivativeSize: value.derivativeSize,
  extraction: value.extraction,
  extractionSchemaVersion: value.extractionSchemaVersion,
  reviewIssues: value.reviewIssues,
  usage: value.usage,
  confirmedContactId: value.confirmedContactId,
  nextRetryAt: value.nextRetryAt,
  leaseExpiresAt: value.leaseExpiresAt,
  errorStage: value.errorStage,
  errorCode: value.errorCode,
}));

export const ingestBatchSummarySchema: z.ZodType<Contract.IngestBatchSummaryContract> = z.object({
  batch: ingestBatchSchema,
  counts: z.object({
    awaitingUpload: count,
    uploaded: count,
    excluded: count,
    queuedReady: count,
    queuedWaitingRetry: count,
    processing: count,
    extracted: count,
    terminalFailed: count,
    confirmed: count,
    skipped: count,
  }),
}).transform((value) => ({ ...value, batch: value.batch }));

const ingestDetailObject = z.object({ batch: ingestBatchSchema, items: z.array(ingestItemSchema).readonly() });

function checkIngestItemParents(value: z.output<typeof ingestDetailObject>, context: z.RefinementCtx): void {
  value.items.forEach((item, index) => {
    if (item.batchId !== value.batch.id) {
      context.addIssue({ code: "custom", path: ["items", index, "batchId"], message: "Item must belong to the response batch." });
    }
  });
}

export const ingestBatchDetailSchema: z.ZodType<Contract.IngestBatchDetailContract> = ingestDetailObject
  .superRefine(checkIngestItemParents)
  .transform((value) => ({ batch: value.batch, items: value.items }));
export const ingestBatchCreateResponseSchema: z.ZodType<Contract.IngestBatchCreateResponseContract> = ingestDetailObject
  .extend({ reused: z.boolean() })
  .superRefine(checkIngestItemParents)
  .transform((value) => ({ ...value, batch: value.batch, items: value.items }));
export const ingestBatchCollectionResponseSchema: z.ZodType<Contract.IngestBatchCollectionResponseContract> = z.object({ batches: z.array(ingestBatchSchema).readonly() })
  .transform((value) => ({ batches: value.batches }));

export const ingestItemActionResponseSchema: z.ZodType<Contract.IngestItemActionResponseContract> = z.object({ item: ingestItemSchema })
  .transform((value) => ({ item: value.item }));
export const ingestUploadResponseSchema: z.ZodType<Contract.IngestUploadResponseContract> = z.object({ item: ingestItemSchema, alreadyUploaded: z.boolean() })
  .transform((value) => ({ ...value, item: value.item }));
export const ingestBatchActionResponseSchema: z.ZodType<Contract.IngestBatchActionResponseContract> = z.object({ batch: ingestBatchSchema })
  .transform((value) => ({ batch: value.batch }));
export const ingestFinalizeResponseSchema: z.ZodType<Contract.IngestFinalizeResponseContract> = z.object({ batch: ingestBatchSchema, alreadyFinalized: z.boolean() })
  .transform((value) => ({ ...value, batch: value.batch }));

const ingestCardConfirmationItemSchema: z.ZodType<Contract.IngestCardConfirmationItemContract> = z.object({
  itemId: identity,
  version: positiveInteger,
  imageDigest: digest,
});

export const ingestCardConfirmationInputSchema: z.ZodType<Contract.IngestCardConfirmationInputContract> = z.object({
  confirmationIntentId: identity,
  expectedCardItems: z.array(ingestCardConfirmationItemSchema).min(1).max(2).readonly(),
  fieldSources: ingestCardFieldSourcesSchema,
  displayName: z.string(),
  organization: z.string(),
  role: z.string(),
  email: z.string(),
  phone: z.string(),
  relationshipContext: z.string(),
  notes: z.string(),
  allowDuplicate: z.boolean().optional(),
}).superRefine((value, context) => {
  const itemIds = value.expectedCardItems.map((item) => item.itemId);
  if (new Set(itemIds).size !== itemIds.length) {
    context.addIssue({ code: "custom", path: ["expectedCardItems"], message: "Card item snapshots must be unique." });
  }
  for (const [field, source] of Object.entries(value.fieldSources)) {
    if (source !== null && !itemIds.includes(source)) {
      context.addIssue({ code: "custom", path: ["fieldSources", field], message: "Field source must identify an item in this card snapshot." });
    }
  }
}).transform((value): Contract.IngestCardConfirmationInputContract => {
  const confirmation = {
    confirmationIntentId: value.confirmationIntentId,
    expectedCardItems: value.expectedCardItems!,
    fieldSources: value.fieldSources,
    displayName: value.displayName,
    organization: value.organization,
    role: value.role,
    email: value.email,
    phone: value.phone,
    relationshipContext: value.relationshipContext,
    notes: value.notes,
  };
  const { allowDuplicate } = value;
  return allowDuplicate === undefined ? confirmation : { ...confirmation, allowDuplicate };
});

function normalizeLegacyIngestConfirmation(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const response = value as Record<string, unknown>;
  if (response.state !== "created" || !response.item || response.items !== undefined || response.replayed !== undefined) return value;
  return { ...response, items: [response.item], replayed: false };
}

export const ingestConfirmationResponseSchema: z.ZodType<Contract.IngestConfirmationResponseContract> = z.preprocess(normalizeLegacyIngestConfirmation, z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("created"), contactId: identity, item: ingestItemSchema, items: z.array(ingestItemSchema).min(1).max(2).readonly(), replayed: z.boolean() }),
  duplicateReviewSchema,
])).superRefine((value, context) => {
  if (value.state === "created") {
    const ids = value.items.map((item) => item.id);
    const selected = value.items.find((item) => item.id === value.item.id);
    if (!selected || new Set(ids).size !== ids.length
      || value.item.status !== "confirmed" || value.item.confirmedContactId !== value.contactId
      || selected.version !== value.item.version || selected.cardId !== value.item.cardId || selected.side !== value.item.side) {
      context.addIssue({ code: "custom", path: ["items"], message: "Confirmation items must uniquely include the selected item." });
    }
    if (value.items.some((item) => item.cardId !== value.item.cardId || item.status !== "confirmed" || item.confirmedContactId !== value.contactId)) {
      context.addIssue({ code: "custom", path: ["items"], message: "Every card side must resolve to the returned contact." });
    }
  }
}).transform((value): Contract.IngestConfirmationResponseContract => value.state === "created"
  ? { ...value, item: value.item, items: value.items }
  : value);
