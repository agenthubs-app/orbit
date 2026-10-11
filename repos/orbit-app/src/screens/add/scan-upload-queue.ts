// R12 review m7: the photos of a new card batch upload outside the page. Leaving the camera
// page (back, another tab) no longer stops the upload: the job lives here, keyed by account +
// batch, uploads what is still waiting, then starts reading (finalize). The camera page and
// the batch page only watch it; the batch page can retry it. Photos stay in memory only while
// the job runs (nothing is written to the device). No React here.
import type { BatchImageNative, PreparedBatchImage } from "../../api/batch-images";
import type { IngestBatchDetailContract } from "../../api/contract/business-card-batch";
import type { AddApi } from "./add-api";

export interface ScanUploadState {
  batchId: string;
  done: number;
  total: number;
  busy: boolean;
  /** Some photos did not go up (or reading could not start): the person can retry. */
  problem: "upload" | null;
  /** Uploaded and finalized: the server is reading. */
  finished: boolean;
}

type UploadApi = Pick<AddApi, "uploadPending" | "finalize">;

interface Job {
  key: string;
  api: UploadApi;
  native: BatchImageNative | undefined;
  detail: IngestBatchDetailContract;
  files: Map<string, PreparedBatchImage>;
  state: ScanUploadState;
  listeners: Set<(state: ScanUploadState) => void>;
  running: Promise<ScanUploadState> | null;
}

const jobs = new Map<string, Job>();

/** One job per account and batch (another account on the same device never sees it). */
export function scanUploadKey(ownerId: string | null, batchId: string): string {
  return JSON.stringify([ownerId ?? "", batchId]);
}

function uploadedCount(detail: IngestBatchDetailContract): number {
  return detail.items.filter((item) => item.status !== "awaiting_upload").length;
}

function publish(job: Job, patch: Partial<ScanUploadState>) {
  job.state = { ...job.state, ...patch };
  for (const listener of job.listeners) listener(job.state);
}

async function pass(job: Job): Promise<ScanUploadState> {
  publish(job, { busy: true, problem: null });
  const result = await job.api.uploadPending(job.detail, job.files, new AbortController().signal, job.native);
  const uploaded = new Map(result.uploaded.map((item) => [item.id, item]));
  job.detail = { ...job.detail, items: job.detail.items.map((item) => uploaded.get(item.id) ?? item) };
  const done = uploadedCount(job.detail);
  if (result.failed.length || job.detail.items.some((item) => item.status === "awaiting_upload")) {
    publish(job, { busy: false, done, problem: "upload" });
    return job.state;
  }
  publish(job, { done });
  const finalized = await job.api.finalize(job.detail.batch.id);
  if (!finalized.ok) {
    publish(job, { busy: false, problem: "upload" });
    return job.state;
  }
  // Reading has started on the server: the photos are no longer needed here.
  job.files.clear();
  publish(job, { busy: false, finished: true });
  return job.state;
}

/** Runs (or re-runs after a problem) the upload of a batch; one run at a time. */
export function runScanUpload(ownerId: string | null, batchId: string): Promise<ScanUploadState> | null {
  const job = jobs.get(scanUploadKey(ownerId, batchId));
  if (!job) return null;
  if (job.state.finished) return Promise.resolve(job.state);
  job.running ??= pass(job)
    .catch(() => {
      publish(job, { busy: false, problem: "upload" });
      return job.state;
    })
    .finally(() => { job.running = null; });
  return job.running;
}

/** Registers the batch just created on the camera page and starts uploading it. */
export function startScanUpload(input: {
  api: UploadApi;
  ownerId: string | null;
  detail: IngestBatchDetailContract;
  files: ReadonlyMap<string, PreparedBatchImage>;
  native?: BatchImageNative | undefined;
}): Promise<ScanUploadState> {
  const batchId = input.detail.batch.id;
  const key = scanUploadKey(input.ownerId, batchId);
  const job: Job = {
    api: input.api,
    detail: input.detail,
    files: new Map(input.files),
    key,
    listeners: jobs.get(key)?.listeners ?? new Set(),
    native: input.native,
    running: null,
    state: { batchId, busy: true, done: uploadedCount(input.detail), finished: false, problem: null, total: input.detail.items.length },
  };
  jobs.set(key, job);
  return runScanUpload(input.ownerId, batchId)!;
}

export function scanUploadState(ownerId: string | null, batchId: string): ScanUploadState | null {
  return jobs.get(scanUploadKey(ownerId, batchId))?.state ?? null;
}

/** Watches a batch's upload; returns the unsubscribe. Leaving the page only stops watching. */
export function subscribeScanUpload(ownerId: string | null, batchId: string, listener: (state: ScanUploadState) => void): () => void {
  const job = jobs.get(scanUploadKey(ownerId, batchId));
  if (!job) return () => undefined;
  job.listeners.add(listener);
  return () => { job.listeners.delete(listener); };
}

/** Forgets a finished job (the batch page calls it once the server is reading). */
export function forgetScanUpload(ownerId: string | null, batchId: string): void {
  const key = scanUploadKey(ownerId, batchId);
  if (jobs.get(key)?.state.finished) jobs.delete(key);
}

/** Tests only. */
export function resetScanUploadsForTests(): void {
  jobs.clear();
}
