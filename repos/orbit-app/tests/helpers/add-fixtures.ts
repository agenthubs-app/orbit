// R12 人脈を追加: v2 card batch fixtures for the App add tests (model and render). Shapes follow
// src/api/schema/business-card-batch.ts so they parse exactly like server answers.
import type { BusinessCardStructuredExtractionContract, IngestBatchContract, IngestBatchDetailContract, IngestContactCandidateContract, IngestItemContract } from "../../src/api/contract/business-card-batch";

export const T0 = "2026-10-11T01:00:00.000Z";
export const FUTURE = "2099-10-18T01:00:00.000Z";
/** 64 hex chars from a seed (FNV-1a per 8-char block): distinct seeds give distinct digests. */
export const hex = (seed: string) => Array.from({ length: 8 }, (_, block) => {
  let hash = 0x811c9dc5 ^ block;
  for (const char of `${block}:${seed}`) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}).join("");
export const digestOf = (seed: string) => `sha256:${hex(seed)}`;

export function extraction(fields: Partial<{ name: string; organization: string; title: string; email: string; phone: string; industry: string; seniority: string; country: string; city: string }>): BusinessCardStructuredExtractionContract {
  return {
    addresses: [],
    certifications: [],
    contactPoints: fields.phone ? [{ label: null, type: "phone", value: fields.phone }] : [],
    departments: [],
    detectedLanguages: ["ja"],
    emails: fields.email ? [{ label: null, value: fields.email }] : [],
    fullName: fields.name ?? null,
    nativeFullName: fields.name ?? null,
    organization: fields.organization ?? null,
    romanizedFullName: null,
    title: fields.title ?? null,
    website: null,
    ...(fields.industry ? { primaryIndustryId: fields.industry as never } : {}),
    ...(fields.seniority ? { seniorityLevel: fields.seniority as never } : {}),
    ...(fields.country ? { regionCountryCode: fields.country, regionCity: fields.city ?? null } : {}),
  } as BusinessCardStructuredExtractionContract;
}

export function batch(id: string, status: IngestBatchContract["status"], expectedItems: number, extra: Partial<IngestBatchContract> = {}): IngestBatchContract {
  return {
    actorId: "actor-r12",
    createdAt: T0,
    expectedItems,
    expiresAt: FUTURE,
    finalizedAt: status === "collecting" ? null : T0,
    id,
    idempotencyKey: `key-${id}`,
    manifestFingerprint: hex(id),
    reviewGeneration: 0,
    status,
    statusReason: null,
    updatedAt: T0,
    version: 2,
    ...extra,
  };
}

export function item(batchId: string, cardId: string, side: "front" | "back", seq: number, extra: Partial<IngestItemContract> = {}): IngestItemContract {
  return {
    attemptCount: 1,
    batchId,
    cardId,
    clientDigest: digestOf(`${batchId}:${seq}`),
    confirmedContactId: null,
    createdAt: T0,
    derivativeObjectKey: `derivative/${batchId}/${seq}`,
    derivativeSize: 1000,
    errorCode: null,
    errorStage: null,
    extraction: null,
    extractionSchemaVersion: 3,
    id: `${batchId}:item:${seq}`,
    imageDigest: digestOf(`${batchId}:${seq}`),
    leaseExpiresAt: null,
    nextRetryAt: null,
    rawMimeType: "image/png",
    rawSize: 1200,
    reviewIssues: [],
    seq,
    side,
    sourceFileName: `card-${seq}.png`,
    status: "extracted",
    updatedAt: T0,
    usage: null,
    version: 3,
    ...extra,
  };
}

export function detail(b: IngestBatchContract, items: IngestItemContract[]): IngestBatchDetailContract {
  return { batch: b, items };
}

export function candidate(contactId: string, fields: Partial<IngestContactCandidateContract>): IngestContactCandidateContract {
  return { address: "", contactId, displayName: "", email: "", identical: false, matchedOn: ["name_organization"], organization: "", phone: "", role: "", ...fields };
}
