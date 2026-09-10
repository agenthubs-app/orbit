import type { V1PreparationJob } from "./repository";

/** Browser progress deliberately excludes leases, source paths and page bytes. */
export interface PublicV1PreparationJob {
  id: string;
  state: V1PreparationJob["state"];
  sourceCount: number;
  completedSources: number;
  preparedPages: number;
  currentSourcePage: number | null;
  currentSourcePageCount: number | null;
  errorCode: "SOURCE_UNAVAILABLE" | "PDF_INVALID" | "IMAGE_INVALID" | "BATCH_TOO_LARGE" | "SOURCE_EXPIRED" | null;
  retryAt: string | null;
  batchId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export function publicV1PreparationJob(job: V1PreparationJob): PublicV1PreparationJob {
  const active = ["pending", "processing", "ready"].includes(job.state);
  const codes: readonly string[] = ["SOURCE_UNAVAILABLE", "PDF_INVALID", "IMAGE_INVALID", "BATCH_TOO_LARGE", "SOURCE_EXPIRED"];
  return {
    id: job.id, state: job.state, sourceCount: job.sourceIds.length,
    completedSources: job.nextSource, preparedPages: job.pages.length,
    currentSourcePage: job.nextSource < job.sourceIds.length ? job.nextPage : null,
    currentSourcePageCount: job.sourcePageCount,
    errorCode: job.state === "completed" || job.state === "cancelled" ? null :
      codes.includes(job.errorCode ?? "") ? job.errorCode as PublicV1PreparationJob["errorCode"] : null,
    retryAt: active && job.failures > 0 ? job.nextAttemptAt : null,
    batchId: job.state === "completed" ? job.targetId : null,
    createdAt: job.createdAt, updatedAt: job.updatedAt, expiresAt: job.expiresAt,
  };
}
