// R12 人脈を追加: every server call the App add screens make (DESIGN §2.2, §2.3, §2.9, §4.1).
// Existing endpoints only — the v2 card batch pipeline, the event attribution
// candidates, the contact draft queue and the R12 manual contact routes. Answers are
// read through the synced schemas (unknown enum values read leniently); a failure
// becomes one small union the screens map to UI. No AI runs here.
import { useMemo } from "react";
import type { ZodType } from "zod";

import type { OrbitApiClient } from "../../api/client";
import type { BatchImageNative, PreparedBatchImage } from "../../api/batch-images";
import { isNotImplemented } from "../../api/compute/not-implemented";
import type {
  IngestBatchContract,
  IngestBatchDetailContract,
  IngestContactCandidateContract,
  IngestItemContract,
} from "../../api/contract/business-card-batch";
import type {
  ManualContactCreateInput,
  ManualContactCreateResult,
  ManualContactDuplicateCheckInput,
  ManualContactDuplicateCheckResult,
  ManualContactOrganizationSuggestionsResult,
  ManualContactUndoResult,
} from "../../api/contract/manual-contact";
import { contactDraftConfirmPath, ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { ingestConfirmationResponseSchema, ingestFinalizeResponseSchema, ingestItemActionResponseSchema } from "../../api/schema/business-card-batch";
import { readIngestContactCandidate, readIngestDuplicateMatches } from "../../api/schema/business-card-candidate";
import {
  manualContactCreateResultSchema,
  manualContactDuplicateCheckResultSchema,
  manualContactOrganizationSuggestionsResultSchema,
  manualContactUndoResultSchema,
} from "../../api/schema/manual-contact";
import type { ApiResult } from "../../api/types";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { confirmedDraftContactId, pendingDraftRows, readAttribution, record, type BatchAttribution, type ContactDraftRow } from "./add-read";

export { EMPTY_ATTRIBUTION, type AttributionEvent, type BatchAttribution, type ContactDraftRow } from "./add-read";
import {
  acceptedIngestCreate,
  acceptedIngestDetail,
  INGEST_COLLECTION_PATH,
  ingestBatchPath,
  ingestItemPath,
  isHttpSuccess,
  itemReplacePath,
  uploadPendingPass,
  type CreationAttempt,
  type UploadPassResult,
} from "../../view-models/business-card-ingest";

export type AddFailure =
  | { kind: "network" }
  | { kind: "notImplemented" }
  /** 示例データ (the demo account) is read only: writes answer 403 SAMPLE_READ_ONLY. */
  | { kind: "sample" }
  | { kind: "other"; status: number; reason: string | null };

export type AddResult<T> = { ok: true; data: T } | { ok: false; failure: AddFailure };

export function addFailureOf(result: Extract<ApiResult<unknown>, { success: false }> | ApiResult<unknown>): AddFailure {
  if (result.status === 0 && !result.success && result.error.code === "ORBIT_APP_NETWORK_ERROR") return { kind: "network" };
  if (!result.success && isNotImplemented(result)) return { kind: "notImplemented" };
  const reason = result.success ? null : result.error.context?.reason ?? null;
  if (result.status === 403 && reason === "SAMPLE_READ_ONLY") return { kind: "sample" };
  return { kind: "other", reason, status: result.status };
}

const fail = <T,>(failure: AddFailure): AddResult<T> => ({ failure, ok: false });
const unreadable = <T,>(status: number): AddResult<T> => fail({ kind: "other", reason: "UNREADABLE", status });

/** The fields the duplicate lookup compares (same as the server's CardContactFields). */
export interface CardMatchFields { displayName: string; organization: string; role: string; email: string; phone: string; address: string }

export type CardConfirmOutcome =
  | { kind: "created"; contactId: string; items: readonly IngestItemContract[]; metEventId: string | null }
  | { kind: "merged"; contactId: string; items: readonly IngestItemContract[]; metEventId: string | null }
  | { kind: "duplicate"; candidate: IngestContactCandidateContract | null; duplicateContactId: string };

export interface AddApi {
  listDrafts(): Promise<AddResult<ContactDraftRow[]>>;
  confirmDraft(draftId: string): Promise<AddResult<{ contactId: string | null }>>;
  importAttendees(eventId: string): Promise<AddResult<{ count: number }>>;
  listEvents(): Promise<{ id?: unknown; title?: unknown; startsAt?: unknown }[]>;
  saveManual(input: ManualContactCreateInput): Promise<AddResult<ManualContactCreateResult>>;
  checkManualDuplicates(input: ManualContactDuplicateCheckInput, signal?: AbortSignal): Promise<AddResult<ManualContactDuplicateCheckResult>>;
  suggestOrganizations(query: string, signal?: AbortSignal): Promise<AddResult<ManualContactOrganizationSuggestionsResult>>;
  undoManual(contactId: string): Promise<AddResult<ManualContactUndoResult>>;
  createBatch(attempt: CreationAttempt): Promise<AddResult<IngestBatchDetailContract>>;
  getBatch(batchId: string, ownerId: string | null): Promise<AddResult<IngestBatchDetailContract>>;
  uploadPending(detail: IngestBatchDetailContract, files: ReadonlyMap<string, PreparedBatchImage>, signal: AbortSignal, native?: BatchImageNative): Promise<UploadPassResult>;
  finalize(batchId: string): Promise<AddResult<IngestBatchContract>>;
  duplicates(batchId: string, cards: readonly { cardId: string; fields: CardMatchFields }[]): Promise<AddResult<Record<string, IngestContactCandidateContract | null>>>;
  attribution(batchId: string): Promise<AddResult<BatchAttribution>>;
  confirmCard(batchId: string, itemId: string, manual: boolean, body: Record<string, unknown>): Promise<AddResult<CardConfirmOutcome>>;
  skipCard(batchId: string, itemId: string): Promise<AddResult<IngestItemContract>>;
  retryItem(batchId: string, itemId: string): Promise<AddResult<IngestItemContract>>;
  replaceItem(batchId: string, item: IngestItemContract, bytes: Uint8Array<ArrayBuffer>, mimeType: string): Promise<AddResult<IngestItemContract>>;
}

export function createAddApi(client: OrbitApiClient): AddApi {
  async function read<T>(promise: Promise<ApiResult<unknown>>, schema: ZodType<T>): Promise<AddResult<T>> {
    const result = await promise;
    if (!isHttpSuccess(result)) return fail(addFailureOf(result));
    const parsed = schema.safeParse(result.data);
    return parsed.success ? { data: parsed.data, ok: true } : unreadable(result.status);
  }
  const manual = "/api/contacts/manual";
  return {
      async listDrafts() {
      const result = await client.get<unknown>(ORBIT_API_ENDPOINTS.contactDrafts);
      return isHttpSuccess(result) ? { data: pendingDraftRows(result.data), ok: true } : fail(addFailureOf(result));
    },
    async confirmDraft(draftId) {
      const result = await client.post<unknown>(contactDraftConfirmPath(draftId), { body: {} });
      return isHttpSuccess(result) ? { data: { contactId: confirmedDraftContactId(result.data) }, ok: true } : fail(addFailureOf(result));
    },
    async importAttendees(eventId) {
      const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.contactDraftEventAttendeesImport, { body: { eventId } });
      if (!isHttpSuccess(result)) return fail(addFailureOf(result));
      const drafts = record(result.data).contactDrafts;
      return { data: { count: Array.isArray(drafts) ? drafts.length : 0 }, ok: true };
    },
    // R26-06: the person's own events (GET /api/events/mine, past + upcoming); the chips still keep only started ones (R12 review M3).
    // External assessments (`assessment:<id>`) and cancelled ones are left out — the server only accepts an Orbit event as 会った場所.
    async listEvents() {
      const read = async (range: "past" | "upcoming") => {
        const result = await client.get<unknown>(`${ORBIT_API_ENDPOINTS.eventsMine}?range=${range}&limit=20`);
        const items = isHttpSuccess(result) ? record(result.data).items : null;
        return Array.isArray(items) ? (items as { eventId?: unknown; title?: unknown; startsAt?: unknown; status?: unknown }[]) : [];
      };
      const [past, upcoming] = await Promise.all([read("past"), read("upcoming")]);
      return [...past, ...upcoming]
        .filter((item) => typeof item.eventId === "string" && !item.eventId.startsWith("assessment:") && item.status !== "cancelled" && item.status !== "rejected")
        .map((item) => ({ id: item.eventId, startsAt: item.startsAt, title: item.title }));
    },
    saveManual: (input) => read(client.post<unknown>(manual, { body: input }), manualContactCreateResultSchema),
    checkManualDuplicates: (input, signal) => read(client.post<unknown>(`${manual}/duplicates`, { body: input, ...(signal ? { signal } : {}) }), manualContactDuplicateCheckResultSchema),
    suggestOrganizations: (query, signal) => read(client.get<unknown>(`${manual}/organizations?${new URLSearchParams({ q: query }).toString()}`, signal ? { signal } : {}), manualContactOrganizationSuggestionsResultSchema),
    undoManual: (contactId) => read(client.post<unknown>(`${manual}/${encodeURIComponent(contactId)}/undo`, { body: {} }), manualContactUndoResultSchema),
    async createBatch(attempt) {
      const result = await client.post<unknown>(INGEST_COLLECTION_PATH, { body: attempt });
      if (!isHttpSuccess(result)) return fail(addFailureOf(result));
      const detail = acceptedIngestCreate(result, attempt);
      return detail ? { data: detail, ok: true } : unreadable(result.status);
    },
    async getBatch(batchId, ownerId) {
      const result = await client.get<unknown>(ingestBatchPath(batchId));
      if (!isHttpSuccess(result)) return fail(addFailureOf(result));
      const detail = acceptedIngestDetail(result, batchId, ownerId);
      return detail ? { data: detail, ok: true } : unreadable(result.status);
    },
    uploadPending: (detail, files, signal, native) => uploadPendingPass({
      client, detail, files, signal,
      isCurrent: () => !signal.aborted,
      ...(native ? { native } : {}),
    }),
    async finalize(batchId) {
      const result = await read(client.post<unknown>(`${ingestBatchPath(batchId)}/finalize`, { body: {} }), ingestFinalizeResponseSchema);
      return result.ok ? { data: result.data.batch, ok: true } : result;
    },
    async duplicates(batchId, cards) {
      const result = await client.post<unknown>(`${ingestBatchPath(batchId)}/duplicates`, { body: { cards } });
      return isHttpSuccess(result) ? { data: readIngestDuplicateMatches(result.data), ok: true } : fail(addFailureOf(result));
    },
    async attribution(batchId) {
      const result = await client.get<unknown>(`/api/agent/event-attribution/candidates?${new URLSearchParams({ batchId }).toString()}`);
      return isHttpSuccess(result) ? { data: readAttribution(result.data), ok: true } : fail(addFailureOf(result));
    },
    async confirmCard(batchId, itemId, isManual, body) {
      const path = isManual ? `${ingestItemPath(batchId, itemId)}/manual-entry` : `${ingestItemPath(batchId, itemId)}/confirm`;
      const result = await client.post<unknown>(path, { body });
      if (!isHttpSuccess(result)) return fail(addFailureOf(result));
      // 2026-10-11 (0ef1c273): read with the current schema — created.merged / metEventId and
      // duplicate_review.candidate are part of it, so a merge or a duplicate is never misread as a failure.
      const parsed = ingestConfirmationResponseSchema.safeParse(result.data);
      if (!parsed.success) return unreadable(result.status);
      const value = parsed.data;
      if (value.state === "duplicate_review") {
        return { data: { candidate: value.candidate ? readIngestContactCandidate(value.candidate) : null, duplicateContactId: value.duplicateContactId, kind: "duplicate" }, ok: true };
      }
      return { data: { contactId: value.contactId, items: value.items, kind: value.merged ? "merged" : "created", metEventId: value.metEventId ?? null }, ok: true };
    },
    async skipCard(batchId, itemId) {
      const result = await read(client.post<unknown>(`${ingestItemPath(batchId, itemId)}/skip`, { body: {} }), ingestItemActionResponseSchema);
      return result.ok ? { data: result.data.item, ok: true } : result;
    },
    async retryItem(batchId, itemId) {
      const result = await read(client.post<unknown>(`${ingestItemPath(batchId, itemId)}/retry`, { body: {} }), ingestItemActionResponseSchema);
      return result.ok ? { data: result.data.item, ok: true } : result;
    },
    async replaceItem(batchId, target, bytes, mimeType) {
      const result = await read(client.post<unknown>(itemReplacePath(batchId, target.id), { headers: { "Content-Type": mimeType, "If-Match": String(target.version) }, rawBody: bytes }), ingestItemActionResponseSchema);
      return result.ok ? { data: result.data.item, ok: true } : result;
    },
  };
}

export function useAddApi(): AddApi {
  const client = useOrbitApiClient();
  return useMemo(() => createAddApi(client), [client]);
}
