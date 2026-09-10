import { createHash, randomUUID } from "node:crypto";
import type { createV1PreparationRepository } from "./repository";
import type { CardUploadSource, createCardUploadSourceRepository } from "../storage/business-card-upload-sources";
import type { BusinessCardBatchImageStore } from "../storage/business-card-batch-image-store";
import { IngestImageInvalidError, normalizeIngestImage } from "../business-card-ingest-v2/normalization";
import { BUSINESS_CARD_BATCH_MAX_ITEMS } from "../business-card-batch-contract";

export function createV1PreparationWorker({ jobs, sources, read, images, finalize, gate, pageLimit = 5 }: {
  jobs: ReturnType<typeof createV1PreparationRepository>;
  sources: ReturnType<typeof createCardUploadSourceRepository>;
  read(actorId: string, source: CardUploadSource): Promise<Buffer>;
  /** This store journals every new image path before uploading its bytes. */
  images: BusinessCardBatchImageStore;
  finalize(actorId: string, jobId: string): Promise<string>;
  gate: { run<T>(actorId: string, operation: () => Promise<T>): Promise<T> };
  pageLimit?: number;
}) {
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 20) throw new Error("Invalid preparation page limit.");
  return {
    async runOnce(): Promise<{ claimed: number }> {
      await jobs.expire();
      const ready = await jobs.nextReady();
      if (ready) {
        try { await finalize(ready.actorId, ready.id); }
        catch { await jobs.deferReady(ready.id); }
        return { claimed: 1 };
      }
      const job = await jobs.claim();
      if (!job) return { claimed: 0 };
      const sourceId = job.sourceIds[job.nextSource];
      let sourceLease: string | undefined;
      try {
        await gate.run(job.actorId, async () => {
          const claim = await sources.claim(job.actorId, [sourceId]);
          if (claim.state !== "claimed") throw new Error("Preparation source is already consumed.");
          sourceLease = claim.leaseKey;
          const source = claim.sources[0];
          if (source.pipeline !== "v1") throw new Error("Preparation source pipeline does not match.");
          const bytes = await read(job.actorId, source);
          const accept = async (jpegBytes: Buffer, page: number, pageCount: number, digest: string) => {
            const current = await jobs.get(job.actorId, job.id);
            if (current.state !== "processing" || current.leaseKey !== job.leaseKey) throw new Error("Preparation lease changed.");
            // A fresh identity per attempt prevents a late upload from replacing
            // a newer worker's committed image. Unaccepted writes belong to GC.
            const itemId = randomUUID();
            const imagePath = await images.save(job.id, itemId, jpegBytes);
            await jobs.checkpoint({ jobId: job.id, leaseKey: job.leaseKey!, sourceId, page, pageCount,
              itemId, imagePath, imageDigest: digest });
          };
          if (source.mimeType === "application/pdf") {
            const { renderBusinessCardPdfPageRange } = await import("../business-card-pdf-pagination");
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120_000);
            try {
              await renderBusinessCardPdfPageRange({ pdfBytes: bytes, firstPage: job.nextPage, pageLimit,
                maxPages: BUSINESS_CARD_BATCH_MAX_ITEMS - (job.pages.length - (job.nextPage - 1)), signal: controller.signal,
                acceptPage: ({ jpegBytes, page, pageCount }) => accept(jpegBytes, page, pageCount,
                  `sha256:${createHash("sha256").update(jpegBytes).digest("hex")}`),
              });
            } finally { clearTimeout(timeout); }
          } else {
            const normalized = await normalizeIngestImage({ bytes, declaredMimeType: source.mimeType });
            await accept(normalized.jpegBytes, 1, 1, source.digest);
          }
        });
        // Release the raw-source lease before a later tick can finalize all
        // originals. A killed process leaves both leases to expire naturally.
        if (sourceLease) await sources.release(job.actorId, [sourceId], sourceLease);
        const current = await jobs.get(job.actorId, job.id);
        if (current.state === "processing" && current.leaseKey === job.leaseKey) await jobs.release(job.id, job.leaseKey!);
        return { claimed: 1 };
      } catch (error) {
        if (sourceLease) await sources.release(job.actorId, [sourceId], sourceLease).catch(() => {});
        const current = await jobs.get(job.actorId, job.id);
        // Cancellation, completion of the last page, or takeover wins against
        // this worker's late result. Never overwrite those states with failure.
        if (current.state !== "processing" || current.leaseKey !== job.leaseKey) return { claimed: 1 };
        const message = error instanceof Error ? error.message : "";
        const code = error instanceof IngestImageInvalidError ? "IMAGE_INVALID" :
          message === "BUSINESS_CARD_BATCH_TOO_LARGE" ? "BATCH_TOO_LARGE" :
          ["BUSINESS_CARD_PDF_UNREADABLE", "BUSINESS_CARD_PDF_INVALID_RANGE"].includes(message) ? "PDF_INVALID" : "SOURCE_UNAVAILABLE";
        await jobs.fail(job.id, job.leaseKey!, code, code === "SOURCE_UNAVAILABLE");
        return { claimed: 1 };
      }
    },
  };
}
