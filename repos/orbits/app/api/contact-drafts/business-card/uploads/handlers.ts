import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getConfiguredCardUploadSources } from "../../../../../features/acquisition/storage/business-card-upload-source-runtime";
import { getConfiguredIngestV2SourceConsumer } from "../../../../../features/acquisition/business-card-ingest-v2/configured-source-consumer";
import { IngestConflictError } from "../../../../../features/acquisition/business-card-ingest-v2/contract";
import { IngestImageInvalidError } from "../../../../../features/acquisition/business-card-ingest-v2/normalization";
import { CardUploadSourceError } from "../../../../../features/acquisition/storage/business-card-upload-source-error";
import { usesPrivateBusinessCardBlob } from "../../../../../features/acquisition/storage/business-card-private-blob-store";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../_shared/authenticated-actor";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const headers = { "cache-control": "no-store" };
const error = (status: number, code: string) => Response.json({ error: { code } }, { status, headers });

async function metadata(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !request.body) throw new Error("Invalid metadata.");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Metadata timeout.")), 10_000); });
  let complete = false;
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const next = await Promise.race([reader.read(), deadline]);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 16 * 1024) throw new Error("Metadata too large.");
      chunks.push(next.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid metadata.");
    complete = true;
    return value as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createCardUploadHandlers({
  resolveActor = resolveAuthenticatedApiActor,
  configured = getConfiguredCardUploadSources,
  issue = handleUpload,
  consumeV2 = getConfiguredIngestV2SourceConsumer,
  privateUploads = usesPrivateBusinessCardBlob,
}: {
  resolveActor?: ResolveAuthenticatedApiActor;
  configured?: typeof getConfiguredCardUploadSources;
  issue?: typeof handleUpload;
  consumeV2?: typeof getConfiguredIngestV2SourceConsumer;
  privateUploads?: () => boolean;
} = {}) {
  async function authenticate(request: Request) {
    // These cookie-authenticated mutations are initiated only by our own UI.
    if (request.headers.get("origin") !== new URL(request.url).origin) return error(403, "UPLOAD_ORIGIN_FORBIDDEN");
    const actor = await resolveActor();
    return actor ?? error(401, "UNAUTHORIZED");
  }

  async function reserve(request: Request): Promise<Response> {
    try {
      const actor = await authenticate(request); if (actor instanceof Response) return actor;
      let body: Record<string, unknown>;
      try { body = await metadata(request); } catch { return error(400, "INVALID_UPLOAD_METADATA"); }
      if (Object.keys(body).sort().join(",") !== "byteSize,digest,fileName,mimeType,pipeline,requestKey" ||
          typeof body.requestKey !== "string" || !UUID.test(body.requestKey) ||
          (body.pipeline !== "v1" && body.pipeline !== "v2") || typeof body.fileName !== "string" ||
          typeof body.mimeType !== "string" || typeof body.byteSize !== "number" || typeof body.digest !== "string") {
        return error(400, "INVALID_UPLOAD_METADATA");
      }
      const runtime = await configured(); if (!runtime) return error(503, "UPLOAD_UNAVAILABLE");
      const source = await runtime.repository.reserve({ actorId: actor.id,
        requestKey: body.requestKey, pipeline: body.pipeline, fileName: body.fileName,
        mimeType: body.mimeType, byteSize: body.byteSize, digest: body.digest,
      });
      return Response.json({ data: { source } }, { status: 201, headers });
    } catch (cause) {
      if (cause instanceof CardUploadSourceError) return error(410, cause.code);
      return error(503, "UPLOAD_RESERVATION_UNAVAILABLE");
    }
  }

  async function token(request: Request): Promise<Response> {
    try {
      const actor = await authenticate(request); if (actor instanceof Response) return actor;
      let body: Record<string, unknown>;
      try { body = await metadata(request); } catch { return error(400, "INVALID_UPLOAD_METADATA"); }
      const payload = body.payload as Record<string, unknown> | undefined;
      // No completion callback is requested: only verified consumption of the
      // private object can create a target. Reject unsolicited callback events.
      if (body.type !== "blob.generate-client-token" || !payload || Array.isArray(payload) ||
          typeof payload.pathname !== "string" || payload.pathname.length > 300 ||
          typeof payload.clientPayload !== "string" || !UUID.test(payload.clientPayload) ||
          typeof payload.multipart !== "boolean") return error(400, "INVALID_UPLOAD_TOKEN_REQUEST");
      const runtime = await configured(); if (!runtime) return error(503, "UPLOAD_UNAVAILABLE");
      const constraints = await runtime.repository.authorize(actor.id, payload.clientPayload, payload.pathname);
      const result = await issue({ request, body: body as unknown as HandleUploadBody,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          if (pathname !== payload.pathname || clientPayload !== payload.clientPayload) throw new Error("Upload authorization mismatch.");
          return constraints;
        },
      });
      return Response.json(result, { headers });
    } catch { return error(503, "UPLOAD_TOKEN_UNAVAILABLE"); }
  }
  async function consume(request: Request): Promise<Response> {
    try {
      const actor = await authenticate(request); if (actor instanceof Response) return actor;
      let body: Record<string, unknown>;
      try { body = await metadata(request); } catch { return error(400, "INVALID_UPLOAD_METADATA"); }
      if (typeof body.sourceId !== "string" || !UUID.test(body.sourceId) ||
          typeof body.batchId !== "string" || !body.batchId.trim() || body.batchId.length > 100 ||
          typeof body.itemId !== "string" || !body.itemId.trim() || body.itemId.length > 100 ||
          (body.operation !== "upload" && body.operation !== "replace") ||
          Object.keys(body).some((key) => !["sourceId", "batchId", "itemId", "operation", "expectedVersion"].includes(key)) ||
          (body.operation === "replace" && (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1))) {
        return error(400, "INVALID_UPLOAD_METADATA");
      }
      const consumer = await consumeV2(); if (!consumer) return error(503, "UPLOAD_UNAVAILABLE");
      const result = await consumer({ actorId: actor.id, sourceId: body.sourceId,
        batchId: body.batchId, itemId: body.itemId, operation: body.operation,
        expectedVersion: body.operation === "replace" ? Number(body.expectedVersion) : undefined,
      });
      return Response.json({ data: result }, { headers });
    } catch (cause) {
      if (cause instanceof CardUploadSourceError) return error(cause.code === "UPLOAD_SOURCE_EXPIRED" ? 410 : 404, cause.code);
      if (cause instanceof IngestConflictError) return error(cause.code === "BATCH_GONE" ? 404 : 409, cause.code);
      if (cause instanceof IngestImageInvalidError) return error(400, "IMAGE_INVALID");
      return error(503, "UPLOAD_CONSUMPTION_UNAVAILABLE");
    }
  }
  async function mode(): Promise<Response> {
    try {
      if (!await resolveActor()) return error(401, "UNAUTHORIZED");
      return Response.json({ data: { directUpload: privateUploads() } }, { headers });
    } catch { return error(503, "UPLOAD_UNAVAILABLE"); }
  }
  return { reserve, token, consume, mode };
}
