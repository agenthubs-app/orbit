import { z } from "zod";
import type { OrbitApiClient } from "../api/client";
import { readPreparedBatchImage, type BatchImageNative, type PreparedBatchImage } from "../api/batch-images";
import type { BusinessCardBatchContract, IngestBatchContract, IngestBatchDetailContract, IngestCardFieldSourcesContract, IngestItemContract, IngestManifestEntryContract } from "../api/contract/business-card-batch";
import { businessCardBatchSchema, ingestBatchCollectionResponseSchema, ingestBatchCreateResponseSchema, ingestBatchDetailSchema, ingestConfirmationResponseSchema, ingestItemActionResponseSchema, ingestManifestEntrySchema, ingestUploadResponseSchema } from "../api/schema/business-card-batch";
import type { ApiResult } from "../api/types";

export const INGEST_COLLECTION_PATH = "/api/contact-drafts/business-card/batches/v2";
export const LEGACY_COLLECTION_PATH = "/api/contact-drafts/business-card/batches";
export type BatchSource = "current" | "legacy";
export interface CreationAttempt { readonly idempotencyKey: string; readonly manifest: readonly IngestManifestEntryContract[]; }

export function ingestBatchPath(batchId: string): string { return INGEST_COLLECTION_PATH + "/" + encodeURIComponent(batchId); }
export function ingestItemPath(batchId: string, itemId: string): string { return ingestBatchPath(batchId) + "/items/" + encodeURIComponent(itemId); }
export function itemContentPath(batchId: string, itemId: string): string { return ingestItemPath(batchId, itemId) + "/content"; }
export function itemReplacePath(batchId: string, itemId: string): string { return ingestItemPath(batchId, itemId) + "/replace"; }
export function batchRoutePath(source: BatchSource, batchId: string): string { return "/contacts/new/" + (source === "current" ? "batch2/" : "batch/") + encodeURIComponent(batchId); }
export function isHttpSuccess(result: ApiResult<unknown>): result is ApiResult<unknown> & { success: true } { return result.success && result.status >= 200 && result.status < 300; }

export type IngestCardImage = PreparedBatchImage & { readonly cardId?: string; readonly side?: "front" | "back" };

export function creationAttempt(files: readonly IngestCardImage[], previous: CreationAttempt | null, key: () => string): CreationAttempt {
  if (!files.length || files.length > 100) throw new Error("请选择 1 至 100 张名片。");
  const manifest = files.map((file, index) => {
    if (file.rawSize > 10485760) throw new Error("每张名片不得超过 10 MiB。");
    const cardId = file.cardId?.trim() || `legacy:${index + 1}`;
    const side = file.side ?? "front";
    return Object.freeze(ingestManifestEntrySchema.parse({ cardId, side, fileName: file.fileName, mimeType: file.mimeType, rawSize: file.rawSize, seq: index + 1, clientDigest: file.clientDigest }));
  });
  const groups = new Map<string, IngestManifestEntryContract[]>();
  manifest.forEach(entry => groups.set(entry.cardId, [...(groups.get(entry.cardId) ?? []), entry]));
  for (const entries of groups.values()) {
    if (entries.filter(entry => entry.side === "front").length !== 1) throw new Error("每张名片必须且只能有一个正面。");
    if (entries.filter(entry => entry.side === "back").length > 1) throw new Error("每张名片最多只能有一个反面。");
  }
  if (previous && JSON.stringify(previous.manifest) === JSON.stringify(manifest)) return previous;
  return Object.freeze({ idempotencyKey: key(), manifest: Object.freeze(manifest) });
}

export interface IngestCard {
  readonly cardId: string;
  readonly front: IngestItemContract;
  readonly back: IngestItemContract | null;
  readonly items: readonly IngestItemContract[];
}

export function ingestCards(detail: IngestBatchDetailContract): readonly IngestCard[] {
  const grouped = new Map<string, IngestItemContract[]>();
  for (const item of [...detail.items].sort((a, b) => a.seq - b.seq)) {
    grouped.set(item.cardId, [...(grouped.get(item.cardId) ?? []), item]);
  }
  const cards: IngestCard[] = [];
  for (const [cardId, items] of grouped) {
    const front = items.find(item => item.side === "front");
    const backs = items.filter(item => item.side === "back");
    if (!front || items.filter(item => item.side === "front").length !== 1 || backs.length > 1) continue;
    cards.push({ cardId, front, back: backs[0] ?? null, items: Object.freeze([...items]) });
  }
  return Object.freeze(cards);
}

export function cardConfirmationSnapshot(
  items: readonly IngestItemContract[],
  confirmationIntentId: string,
  fieldSources: IngestCardFieldSourcesContract,
) {
  return {
    confirmationIntentId,
    expectedCardItems: [...items].sort((a, b) => a.seq - b.seq).map(item => ({
      itemId: item.id,
      version: item.version,
      imageDigest: item.imageDigest ?? item.clientDigest,
    })),
    fieldSources: { ...fieldSources },
  };
}

export function acceptedIngestDetail(result: ApiResult<unknown>, batchId: string, ownerId: string | null): IngestBatchDetailContract | null {
  if (!isHttpSuccess(result)) return null;
  const parsed = ingestBatchDetailSchema.safeParse(result.data);
  if (!parsed.success) return null;
  const d = parsed.data;
  if (d.batch.id !== batchId || (ownerId !== null && d.batch.actorId !== ownerId) || d.batch.expectedItems > 100 || d.items.length !== d.batch.expectedItems) return null;
  if (new Set(d.items.map(i => i.id)).size !== d.items.length || new Set(d.items.map(i => i.seq)).size !== d.items.length) return null;
  if (d.items.some(i => i.seq > d.items.length || i.rawSize > 10485760 || (i.status === "confirmed" && !i.confirmedContactId))) return null;
  if (ingestCards(d).reduce((count, card) => count + card.items.length, 0) !== d.items.length) return null;
  return d;
}

export function acceptedIngestCreate(result: ApiResult<unknown>, attempt: CreationAttempt): IngestBatchDetailContract | null {
  if (!isHttpSuccess(result)) return null;
  const parsed = ingestBatchCreateResponseSchema.safeParse(result.data);
  if (!parsed.success) return null;
  const d = acceptedIngestDetail(result, parsed.data.batch.id, null);
  if (!d || d.batch.idempotencyKey !== attempt.idempotencyKey || d.items.length !== attempt.manifest.length) return null;
  if (!parsed.data.reused && (d.batch.status !== "collecting" || d.items.some(i => i.status !== "awaiting_upload"))) return null;
  const legacySingleSide = attempt.manifest.every(entry => entry.side === "front") && new Set(attempt.manifest.map(entry => entry.cardId)).size === attempt.manifest.length;
  return d.items.every(i => {
    const entry = attempt.manifest[i.seq - 1];
    const cardMatches = entry && (i.cardId === entry.cardId && i.side === entry.side
      || legacySingleSide && i.cardId === `legacy:${i.seq}` && i.side === "front");
    return entry && cardMatches && i.sourceFileName === entry.fileName && i.rawMimeType === entry.mimeType && i.rawSize === entry.rawSize && i.clientDigest === entry.clientDigest;
  }) ? d : null;
}

const legacyCollectionSchema = z.object({ batches: z.array(businessCardBatchSchema) });
export function acceptedBatchCollection(result: ApiResult<unknown>, source: BatchSource): readonly (IngestBatchContract | BusinessCardBatchContract)[] | null {
  if (!isHttpSuccess(result)) return null;
  const parsed = (source === "current" ? ingestBatchCollectionResponseSchema : legacyCollectionSchema).safeParse(result.data);
  if (!parsed.success) return null;
  const batches = parsed.data.batches;
  return new Set(batches.map(b => b.id)).size === batches.length && new Set(batches.map(b => b.actorId)).size <= 1 ? batches : null;
}

export function ingestExpired(detail: IngestBatchDetailContract, now = Date.now()): boolean {
  return detail.batch.status === "expired" || Date.parse(detail.batch.expiresAt) <= now;
}
export function ingestTerminal(detail: IngestBatchDetailContract): boolean { return ingestExpired(detail) || ["cancelled", "completed"].includes(detail.batch.status); }
export function fileMatchesItem(file: PreparedBatchImage, item: IngestItemContract): boolean { return file.clientDigest === item.clientDigest && file.rawSize === item.rawSize && file.mimeType === item.rawMimeType; }
export function matchPendingFiles(detail: IngestBatchDetailContract, files: readonly PreparedBatchImage[]): { matched: Map<string, PreparedBatchImage>; unmatched: PreparedBatchImage[] } {
  const matched = new Map<string, PreparedBatchImage>();
  const unmatched: PreparedBatchImage[] = [];
  for (const file of files) {
    const items = !ingestTerminal(detail) && detail.batch.status === "collecting" ? detail.items.filter(i => i.status === "awaiting_upload" && fileMatchesItem(file, i)) : [];
    if (!items.length) unmatched.push(file);
    else items.forEach(i => matched.set(i.id, Object.freeze({ ...file })));
  }
  return { matched, unmatched };
}
export function canFinalizeIngest(detail: IngestBatchDetailContract): boolean {
  return !ingestTerminal(detail) && detail.batch.status === "collecting" && detail.items.every(i => i.status === "uploaded" || i.status === "excluded") && detail.items.some(i => i.status === "uploaded");
}

export type IngestReviewAction = "confirm" | "manual-entry" | "retry" | "skip" | "replace";
export function canReviewIngest(detail: IngestBatchDetailContract, item: IngestItemContract, action: IngestReviewAction): boolean {
  if (ingestTerminal(detail) || item.batchId !== detail.batch.id) return false;
  if (action === "replace" && detail.batch.status === "collecting") return item.status === "uploaded";
  if (!["processing", "ready_for_review"].includes(detail.batch.status)) return false;
  if (action === "confirm") return item.status === "extracted";
  if (action === "skip") return item.status === "extracted" || item.status === "terminal_failed";
  return item.status === "terminal_failed";
}

export function acceptedIngestReview(result: ApiResult<unknown>, detail: IngestBatchDetailContract, old: IngestItemContract, action: IngestReviewAction, replacement?: PreparedBatchImage): { state: "duplicate_review"; duplicateContactId: string } | { state: "accepted"; item: IngestItemContract; items: readonly IngestItemContract[] } | null {
  if (!isHttpSuccess(result)) return null;
  const oldCard = detail.items.map(candidate => candidate.id === old.id ? old : candidate).filter(candidate => candidate.cardId === old.cardId);
  const allowed = action === "confirm"
    ? oldCard.length > 0 && oldCard.every(item => item.status === "extracted")
    : action === "manual-entry"
      ? oldCard.length > 0 && oldCard.every(item => item.status === "extracted" || item.status === "terminal_failed") && oldCard.some(item => item.status === "terminal_failed")
      : action === "skip"
        ? oldCard.length > 0 && oldCard.every(item => item.status === "extracted" || item.status === "terminal_failed")
        : canReviewIngest(detail, old, action);
  if (!allowed) return null;
  const parsed = action === "confirm" || action === "manual-entry" ? ingestConfirmationResponseSchema.safeParse(result.data) : ingestItemActionResponseSchema.safeParse(result.data);
  if (!parsed.success) return null;
  if ("state" in parsed.data && parsed.data.state === "duplicate_review") return parsed.data;
  const item = parsed.data.item;
  const items = "items" in parsed.data ? parsed.data.items : [item];
  const expected = action === "replace" ? detail.batch.status === "collecting" ? "uploaded" : "queued" : action === "retry" ? "queued" : action === "skip" ? "skipped" : "confirmed";
  if (item.id !== old.id || item.batchId !== detail.batch.id || item.cardId !== old.cardId || item.side !== old.side || item.seq !== old.seq || item.version <= old.version || item.status !== expected) return null;
  if (item.clientDigest !== old.clientDigest || item.rawSize !== old.rawSize || item.rawMimeType !== old.rawMimeType) return null;
  if (action === "confirm" || action === "manual-entry") {
    if (items.length !== oldCard.length) return null;
    for (const accepted of items) {
      const before = oldCard.find(candidate => candidate.id === accepted.id);
      if (!before || accepted.cardId !== before.cardId || accepted.side !== before.side || accepted.seq !== before.seq || accepted.version <= before.version
        || accepted.status !== "confirmed" || accepted.clientDigest !== before.clientDigest || accepted.rawSize !== before.rawSize || accepted.rawMimeType !== before.rawMimeType) return null;
    }
  }
  // Replacement changes the derivative identity, never the original upload manifest.
  if (action === "replace" && (!replacement || item.imageDigest !== replacement.clientDigest || !item.derivativeObjectKey || !item.derivativeSize || item.extraction !== null)) return null;
  return { state: "accepted", item, items };
}

export interface UploadPassOptions {
  client: OrbitApiClient;
  detail: IngestBatchDetailContract;
  files: ReadonlyMap<string, PreparedBatchImage>;
  signal: AbortSignal;
  isCurrent: (item: IngestItemContract) => boolean;
  onUnavailable?: (status: 404 | 410) => void;
  native?: BatchImageNative;
}
export interface UploadPassResult { uploaded: IngestItemContract[]; failed: { itemId: string; message: string }[]; recovery: boolean; gone: boolean; }
export async function uploadPendingPass(options: UploadPassOptions): Promise<UploadPassResult> {
  const { client, detail, signal, native } = options;
  const result: UploadPassResult = { uploaded: [], failed: [], recovery: false, gone: false };
  const entries = detail.items.filter(i => i.status === "awaiting_upload").map(item => ({ item, file: options.files.get(item.id) })).filter(entry => entry.file && fileMatchesItem(entry.file, entry.item));
  let cursor = 0;
  const owned = (item: IngestItemContract) => !signal.aborted && !ingestTerminal(detail) && detail.batch.status === "collecting" && options.isCurrent(item);
  const valid = (item: IngestItemContract) => !result.recovery && owned(item);
  async function worker() {
    // Each worker advances a fixed snapshot; failures are never requeued.
    while (cursor < entries.length) {
      const { item, file } = entries[cursor++]!;
      if (!valid(item)) return;
      try {
        const bytes = await readPreparedBatchImage(file!, { ...(native ? { native } : {}), signal });
        if (!valid(item)) return;
        const response = await client.put<unknown>(itemContentPath(detail.batch.id, item.id), { rawBody: bytes, headers: { "Content-Type": file!.mimeType }, signal });
        if (!owned(item)) return;
        const parsed = isHttpSuccess(response) ? ingestUploadResponseSchema.safeParse(response.data) : null;
        const next = parsed?.success ? parsed.data.item : null;
        if (!next || next.id !== item.id || next.batchId !== detail.batch.id || next.seq !== item.seq || next.version <= item.version || next.status !== "uploaded" || !fileMatchesItem(file!, next)) {
          result.failed.push({ itemId: item.id, message: response.success ? "上传结果无法确认，请刷新后重试。" : response.error.message });
          result.gone ||= response.status === 410;
          result.recovery ||= response.status === 404 || response.status === 409 || response.status === 410;
          if (response.status === 404 || response.status === 410) options.onUnavailable?.(response.status);
        } else result.uploaded.push(next);
      } catch (error) {
        if (valid(item)) result.failed.push({ itemId: item.id, message: error instanceof Error ? error.message : "上传失败，请重试。" });
      }
    }
  }
  await Promise.all([worker(), worker()]);
  return result;
}
