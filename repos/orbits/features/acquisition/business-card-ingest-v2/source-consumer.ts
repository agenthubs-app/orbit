import type { CardUploadSource } from "../storage/business-card-upload-sources";
import { createCardUploadSourceRepository } from "../storage/business-card-upload-sources";
import { IngestConflictError } from "./contract";
import type { IngestDerivativeStore } from "./derivative-store";
import { normalizeIngestImage } from "./normalization";
import type { BusinessCardIngestRepository, IngestQueryClient } from "./repository";

export function createIngestV2SourceConsumer({ sources, read, repository, store, gate, publish }: {
  sources: ReturnType<typeof createCardUploadSourceRepository>;
  read(actorId: string, source: CardUploadSource): Promise<Buffer>;
  /** Unqueued repository: publishing must follow the outer transaction commit. */
  repository: BusinessCardIngestRepository;
  /** Configured store must journal derivative writes before uploading bytes. */
  store: IngestDerivativeStore;
  gate: { run<T>(actorId: string, operation: () => Promise<T>): Promise<T> };
  publish(): Promise<void>;
}) {
  return async function consume(input: {
    actorId: string; sourceId: string; batchId: string; itemId: string;
    operation: "upload" | "replace"; expectedVersion?: number;
  }) {
    if (!["upload", "replace"].includes(input.operation) ||
        (input.operation === "replace" && (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion! <= 0))) {
      throw new IngestConflictError("VERSION_CONFLICT", "A current version is required for replacement.");
    }
    const receipt = JSON.stringify({ pipeline: "v2", batchId: input.batchId, itemId: input.itemId,
      operation: input.operation, expectedVersion: input.operation === "replace" ? input.expectedVersion : null });
    const target = async () => {
      const detail = await repository.getBatch({ actorId: input.actorId, batchId: input.batchId });
      const item = detail?.items.find((candidate) => candidate.id === input.itemId);
      if (!item) throw new IngestConflictError("BATCH_GONE", "Upload target not found.");
      return item;
    };
    const item = await target();
    const claim = await sources.claim(input.actorId, [input.sourceId]);
    if (claim.state === "consumed") {
      if (claim.targetRef !== receipt) throw new IngestConflictError("CONTENT_MISMATCH", "Upload source was used for another target.");
      await publish();
      return { item: await target(), reused: true };
    }
    try {
      const source = claim.sources[0];
      if (source.pipeline !== "v2") throw new IngestConflictError("CONTENT_MISMATCH", "Upload source belongs to another pipeline.");
      if (input.operation === "upload" && (source.digest !== item.clientDigest || source.byteSize !== item.rawSize || source.mimeType !== item.rawMimeType)) {
        throw new IngestConflictError("CONTENT_MISMATCH", "Upload source does not match the manifest.");
      }
      const stored = await gate.run(input.actorId, async () => {
        const bytes = await read(input.actorId, source);
        const normalized = await normalizeIngestImage({ bytes, declaredMimeType: source.mimeType });
        return store.put(normalized.jpegBytes);
      });
      await sources.consume({ actorId: input.actorId, ids: [input.sourceId], leaseKey: claim.leaseKey,
        async writeTarget(connection) {
          const transactionClient: IngestQueryClient = { async query(sql, values) {
            return connection.query(sql, values ? [...values] : undefined);
          } };
          const common = { actorId: input.actorId, batchId: input.batchId, itemId: input.itemId,
            imageDigest: source.digest, derivativeObjectKey: stored.objectKey, derivativeSize: stored.size, transactionClient };
          if (input.operation === "replace") {
            await repository.swapDerivative({ ...common, expectedVersion: input.expectedVersion! });
          } else await repository.markItemUploaded(common);
          return receipt;
        },
      });
      await publish();
      return { item: await target(), reused: false };
    } catch (error) {
      // A failed send/read can follow a successful commit. Never delete the
      // derivative on this ambiguous path; its durable write journal owns GC.
      await sources.release(input.actorId, [input.sourceId], claim.leaseKey).catch(() => {});
      throw error;
    }
  };
}
