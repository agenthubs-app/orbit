import type { PreparedBatchImage } from "../../api/batch-images";
import type { IngestBatchDetailContract } from "../../api/contract/business-card-batch";
import { ingestTerminal, matchPendingFiles } from "../../view-models/business-card-ingest";

export interface PendingIdentity { readonly server: string; readonly subject: string; readonly ready: boolean; }
export interface PendingFileScope { identity: PendingIdentity; batchId: string; }
interface PendingEntry { owner: string; files: Map<string, PreparedBatchImage>; expiresAt: number; timer?: ReturnType<typeof setTimeout>; }
let identity: PendingIdentity | null = null;
const batches = new Map<string, PendingEntry>();
const users = new Map<PendingIdentity, number>();

function dropBatch(batchId: string): void {
  const entry = batches.get(batchId);
  if (entry?.timer) clearTimeout(entry.timer);
  batches.delete(batchId);
}
function clearBatches(): void { [...batches.keys()].forEach(dropBatch); }
function scheduleExpiry(batchId: string, entry: PendingEntry): void {
  entry.timer = setTimeout(() => {
    if (batches.get(batchId) !== entry) return;
    if (entry.expiresAt <= Date.now()) dropBatch(batchId);
    else scheduleExpiry(batchId, entry);
  }, Math.min(2147483647, Math.max(0, entry.expiresAt - Date.now())));
}

export function activatePendingIdentity(server: string, subject: string, ready: boolean): PendingIdentity {
  if (!identity || identity.server !== server || identity.subject !== subject || identity.ready !== ready) {
    clearBatches();
    identity = Object.freeze({ server, subject, ready });
  }
  return identity;
}
export function retainPendingIdentity(value: PendingIdentity): () => void {
  users.set(value, (users.get(value) ?? 0) + 1);
  return () => {
    const remaining = (users.get(value) ?? 1) - 1;
    if (remaining) users.set(value, remaining); else users.delete(value);
    // Let a route handoff mount its next owner in the same React effect turn.
    queueMicrotask(() => { if (identity === value && !users.has(value)) clearBatches(); });
  };
}
export function clearPendingFiles(scope: PendingFileScope): void { if (scope.identity === identity) dropBatch(scope.batchId); }
export function pendingFiles(scope: PendingFileScope, detail: IngestBatchDetailContract): Map<string, PreparedBatchImage> {
  if (scope.identity !== identity || !identity.ready || scope.batchId !== detail.batch.id) return new Map();
  const entry = batches.get(scope.batchId);
  if (!entry) return new Map();
  if (ingestTerminal(detail) || detail.batch.status !== "collecting" || entry.expiresAt <= Date.now() || entry.owner !== detail.batch.actorId) {
    dropBatch(scope.batchId); return new Map();
  }
  entry.files = matchPendingFiles(detail, [...entry.files.values()]).matched;
  return new Map(entry.files);
}
export function rememberPendingFiles(scope: PendingFileScope, detail: IngestBatchDetailContract, files: readonly PreparedBatchImage[]): PreparedBatchImage[] {
  if (scope.identity !== identity || !identity.ready || scope.batchId !== detail.batch.id) return [...files];
  const matched = matchPendingFiles(detail, files);
  const existing = pendingFiles(scope, detail);
  for (const [id, file] of matched.matched) existing.set(id, file);
  dropBatch(scope.batchId);
  if (existing.size && !ingestTerminal(detail)) {
    const entry = { owner: detail.batch.actorId, expiresAt: Date.parse(detail.batch.expiresAt), files: existing };
    batches.set(scope.batchId, entry); scheduleExpiry(scope.batchId, entry);
  }
  return matched.unmatched;
}
