import type { BusinessCardBatchDetailContract, BusinessCardStructuredExtractionContract, IngestCardFieldSourcesContract, IngestItemContract } from "../api/contract/business-card-batch";
import type { ApiResult } from "../api/types";
import { businessCardBatchConfirmationResponseSchema, businessCardBatchDetailSchema } from "../api/schema/business-card-batch";

export type BusinessCardReviewFields = { displayName: string; organization: string; role: string; email: string; phone: string; relationshipContext: string; notes: string };
export interface BusinessCardReviewDraft { fields: BusinessCardReviewFields; dirty: boolean; }
export interface BusinessCardFieldChoice { value: string; itemId: string; side: "front" | "back"; }
export interface BusinessCardReviewCardDraft extends BusinessCardReviewDraft {
  sources: IngestCardFieldSourcesContract;
  conflicts: Partial<Record<keyof IngestCardFieldSourcesContract, readonly BusinessCardFieldChoice[]>>;
  unresolvedConflicts: readonly (keyof IngestCardFieldSourcesContract)[];
  manualFields: readonly (keyof BusinessCardReviewFields)[];
  itemVersions: Readonly<Record<string, string>>;
}

export function reconcileBusinessCardReviewDraft(extraction: BusinessCardStructuredExtractionContract | null | undefined, previous: BusinessCardReviewDraft | undefined, reload = false): BusinessCardReviewDraft | null {
  // Processing may omit extraction for every item, even an extracted one.
  if (previous && (extraction === undefined || (previous.dirty && !reload))) return previous;
  return extraction ? { fields: businessCardReviewFields(extraction), dirty: false } : null;
}

export function businessCardReviewFields(extraction: BusinessCardStructuredExtractionContract | null | undefined): BusinessCardReviewFields {
  const fields: BusinessCardReviewFields = { displayName: "", organization: "", role: "", email: "", phone: "", relationshipContext: "", notes: "" };
  if (!extraction) return fields;
  const native = extraction.nativeFullName?.trim() ?? "";
  fields.displayName = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(native)
    ? native : extraction.fullName?.trim() || native || extraction.romanizedFullName?.trim() || "";
  fields.organization = extraction.organization ?? "";
  fields.role = extraction.title ?? "";
  fields.email = extraction.emails.find(value => value.value.trim())?.value ?? "";
  const phoneIndex = extraction.contactPoints.findIndex(point => (point.type === "phone" || point.type === "mobile") && point.value.trim());
  fields.phone = extraction.contactPoints[phoneIndex]?.value ?? "";
  const notes: string[] = [];
  const seen = new Set<string>();
  const add = (label: string, value: string | null, key = JSON.stringify(["note", label, value])) => {
    if (value?.trim() && !seen.has(key)) { seen.add(key); notes.push(`${label}: ${value}`); }
  };
  for (const name of new Set([extraction.fullName, extraction.nativeFullName, extraction.romanizedFullName])) {
    if (name?.trim() !== fields.displayName) add("姓名", name);
  }
  extraction.departments.forEach(value => add("部门", value));
  extraction.emails.forEach(value => { if (value.value !== fields.email || value.label) add(value.label || "邮箱", value.value); });
  extraction.contactPoints.forEach((point, index) => {
    if (index !== phoneIndex || point.label) add(point.label ? `${point.type} (${point.label})` : point.type, point.value, JSON.stringify(["contact", point.type, point.label, point.value]));
  });
  add("网站", extraction.website);
  extraction.addresses.forEach(value => add(value.label || "地址", value.value));
  extraction.certifications.forEach(value => add("资格", value));
  fields.notes = notes.join("\n");
  return fields;
}

export function reconcileBusinessCardReviewCard(
  items: readonly IngestItemContract[],
  previous?: BusinessCardReviewCardDraft,
  reload = false,
): BusinessCardReviewCardDraft {
  const ordered = [...items].sort((a, b) => a.side === b.side ? a.seq - b.seq : a.side === "front" ? -1 : 1);
  const itemVersions = Object.fromEntries(ordered.map(item => [item.id, JSON.stringify([item.version, item.imageDigest, item.extractionSchemaVersion])])) as Readonly<Record<string, string>>;
  if (previous?.dirty && !reload && JSON.stringify(previous.itemVersions) === JSON.stringify(itemVersions)) return previous;
  const byItem = ordered.map(item => ({ item, fields: businessCardReviewFields(item.extraction) }));
  const fields: BusinessCardReviewFields = { displayName: "", organization: "", role: "", email: "", phone: "", relationshipContext: "", notes: "" };
  const sources: IngestCardFieldSourcesContract = { displayName: null, organization: null, role: null, email: null, phone: null };
  const conflicts: BusinessCardReviewCardDraft["conflicts"] = {};
  const unresolvedConflicts: (keyof IngestCardFieldSourcesContract)[] = [];
  for (const field of ["displayName", "organization", "role", "email", "phone"] as const) {
    const choices: BusinessCardFieldChoice[] = [];
    const seen = new Set<string>();
    for (const { item, fields: candidate } of byItem) {
      const value = candidate[field].trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      choices.push({ value, itemId: item.id, side: item.side });
    }
    if (choices[0]) {
      fields[field] = choices[0].value;
      sources[field] = choices.length === 1 ? choices[0].itemId : null;
    }
    if (choices.length > 1) {
      conflicts[field] = Object.freeze(choices);
      unresolvedConflicts.push(field);
    }
  }
  fields.notes = [...new Set(byItem.flatMap(({ fields: value }) => value.notes.split("\n").filter(Boolean)))].join("\n");
  const manualFields = previous?.dirty && !reload ? [...previous.manualFields] : [];
  for (const field of manualFields) {
    fields[field] = previous!.fields[field];
    if (field in sources) sources[field as keyof IngestCardFieldSourcesContract] = null;
  }
  const unresolved = unresolvedConflicts.filter(field => !manualFields.includes(field));
  return { fields, sources, conflicts, unresolvedConflicts: Object.freeze(unresolved), manualFields: Object.freeze(manualFields), itemVersions, dirty: manualFields.length > 0 };
}

export function legacyBatchPath(batchId: string, itemId?: string, action?: "confirm" | "retry" | "skip" | "image" | "finish"): string {
  const base = `/api/contact-drafts/business-card/batches/${encodeURIComponent(batchId)}`;
  return itemId !== undefined ? `${base}/items/${encodeURIComponent(itemId)}${action ? `/${action}` : ""}` : `${base}${action ? `/${action}` : ""}`;
}

export function legacyBatchPresentation(detail: BusinessCardBatchDetailContract, selectedId: string | null): { selectedId: string | null; polling: boolean; canFinish: boolean } {
  const unresolved = detail.items.filter(item => item.status !== "confirmed" && item.status !== "skipped");
  return {
    selectedId: unresolved.find(item => item.id === selectedId)?.id ?? unresolved.find(item => item.status === "extracted")?.id ?? unresolved[0]?.id ?? null,
    polling: detail.batch.status === "processing",
    canFinish: detail.batch.status === "ready_for_review" && detail.items.every(item => ["confirmed", "skipped", "failed"].includes(item.status)),
  };
}

export function acceptedLegacyBatch(result: ApiResult<unknown>, batchId: string, expectedOwnerId: string | null): BusinessCardBatchDetailContract | null {
  if (!result.success || result.status < 200 || result.status >= 300) return null;
  const parsed = businessCardBatchDetailSchema.safeParse(result.data);
  if (!parsed.success) return null;
  const detail = parsed.data;
  if (detail.batch.id !== batchId || (expectedOwnerId !== null && detail.batch.actorId !== expectedOwnerId) || detail.items.length !== detail.batch.totalItems || new Set(detail.items.map(item => item.id)).size !== detail.items.length) return null;
  if (new Set(detail.items.map(item => item.seq)).size !== detail.items.length || detail.items.some(item => item.status === "confirmed" && !item.confirmedContactId)) return null;
  return detail;
}

export function acceptedLegacyConfirmation(result: ApiResult<unknown>) {
  if (!result.success || result.status < 200 || result.status >= 300) return null;
  const parsed = businessCardBatchConfirmationResponseSchema.safeParse(result.data);
  return parsed.success ? parsed.data : null;
}
