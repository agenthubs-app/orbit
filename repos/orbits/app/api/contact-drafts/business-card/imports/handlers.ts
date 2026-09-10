import { getConfiguredV1Preparation } from "../../../../../features/acquisition/business-card-v1-preparation/configured";
import { publicV1PreparationJob } from "../../../../../features/acquisition/business-card-v1-preparation/public-job";
import type { createV1PreparationRepository } from "../../../../../features/acquisition/business-card-v1-preparation/repository";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../_shared/authenticated-actor";
import { getConfiguredCardUploadSources } from "../../../../../features/acquisition/storage/business-card-upload-source-runtime";
import { CardUploadSourceError } from "../../../../../features/acquisition/storage/business-card-upload-source-error";
import { createNormalizationGate } from "../../../../../features/acquisition/business-card-ingest-v2/normalization";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const headers = { "cache-control": "no-store" };
const failure = (status: number, code: string) => Response.json({ error: { code } }, { status, headers });
type Jobs = Pick<ReturnType<typeof createV1PreparationRepository>, "admit" | "get" | "list" | "cancel">;
type Context = { params: Promise<{ id: string }> };
const verificationGate = createNormalizationGate({ globalLimit: 1 });

// 500 source UUIDs need about 20 KiB. This endpoint carries references only;
// image/PDF bytes go directly to object storage using the upload token route.
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
      if (size > 32 * 1024) throw new Error("Metadata too large.");
      chunks.push(next.value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid metadata.");
    complete = true; return body as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function repositoryFailure(cause: unknown): Response {
  const message = cause instanceof Error ? cause.message : "";
  if (["Preparation job not found.", "Preparation source not found.", "Upload source not found."].includes(message)) return failure(404, "IMPORT_NOT_FOUND");
  if (message === "Preparation source is expired.") return failure(410, "IMPORT_SOURCE_EXPIRED");
  if (["Preparation request conflicts with an existing import.", "Preparation source is unavailable.", "Preparation already created a batch."].includes(message)) {
    return failure(409, "IMPORT_CONFLICT");
  }
  return failure(503, "IMPORT_UNAVAILABLE");
}

export function createV1ImportHandlers({ resolveActor = resolveAuthenticatedApiActor, configured = getConfiguredV1Preparation,
  sourcesConfigured = getConfiguredCardUploadSources }: {
  resolveActor?: ResolveAuthenticatedApiActor;
  configured?: () => Promise<{ jobs: Jobs } | null>;
  sourcesConfigured?: typeof getConfiguredCardUploadSources;
} = {}) {
  async function authenticate(request: Request, mutation: boolean) {
    if (new URL(request.url).search) return failure(400, "INVALID_IMPORT_REQUEST");
    if (mutation && request.headers.get("origin") !== new URL(request.url).origin) return failure(403, "IMPORT_ORIGIN_FORBIDDEN");
    return await resolveActor() ?? failure(401, "UNAUTHORIZED");
  }
  return {
    async verifySource(request: Request): Promise<Response> {
      try {
        const actor = await authenticate(request, true); if (actor instanceof Response) return actor;
        let body: Record<string, unknown>;
        try { body = await metadata(request); } catch { return failure(400, "INVALID_IMPORT_REQUEST"); }
        if (Object.keys(body).join(",") !== "sourceId" || typeof body.sourceId !== "string" || !UUID.test(body.sourceId)) {
          return failure(400, "INVALID_IMPORT_REQUEST");
        }
        const sourceId = body.sourceId;
        const runtime = await sourcesConfigured(); if (!runtime) return failure(503, "IMPORT_UNAVAILABLE");
        return await verificationGate.run(actor.id, async () => {
          const claim = await runtime.repository.claim(actor.id, [sourceId]);
          if (claim.state !== "claimed") return failure(409, "IMPORT_SOURCE_USED");
          try {
            if (claim.sources[0].pipeline !== "v1") return failure(409, "IMPORT_SOURCE_USED");
            // Verify the actual size and digest on our private, server-generated
            // path. Decoding and page creation remain the worker's responsibility.
            await runtime.read(actor.id, claim.sources[0]);
            return Response.json({ data: { sourceId, verified: true } }, { headers });
          } finally { await runtime.repository.release(actor.id, [sourceId], claim.leaseKey); }
        });
      } catch (cause) {
        if (cause instanceof CardUploadSourceError) return failure(cause.code === "UPLOAD_SOURCE_EXPIRED" ? 410 : 404, cause.code);
        return repositoryFailure(cause);
      }
    },
    async create(request: Request): Promise<Response> {
      try {
        const actor = await authenticate(request, true); if (actor instanceof Response) return actor;
        let body: Record<string, unknown>;
        try { body = await metadata(request); } catch { return failure(400, "INVALID_IMPORT_REQUEST"); }
        if (Object.keys(body).sort().join(",") !== "requestKey,sourceIds" ||
            typeof body.requestKey !== "string" || !UUID.test(body.requestKey) || !Array.isArray(body.sourceIds) ||
            !body.sourceIds.length || body.sourceIds.length > 500 ||
            body.sourceIds.some((id) => typeof id !== "string" || !UUID.test(id)) || new Set(body.sourceIds).size !== body.sourceIds.length) {
          return failure(400, "INVALID_IMPORT_REQUEST");
        }
        const runtime = await configured(); if (!runtime) return failure(503, "IMPORT_UNAVAILABLE");
        const job = await runtime.jobs.admit({ actorId: actor.id, requestKey: body.requestKey, sourceIds: body.sourceIds as string[] });
        return Response.json({ data: { job: publicV1PreparationJob(job) } }, { status: 202, headers });
      } catch (cause) { return repositoryFailure(cause); }
    },
    async list(request: Request): Promise<Response> {
      try {
        const actor = await authenticate(request, false); if (actor instanceof Response) return actor;
        const runtime = await configured(); if (!runtime) return failure(503, "IMPORT_UNAVAILABLE");
        return Response.json({ data: { jobs: (await runtime.jobs.list(actor.id)).map(publicV1PreparationJob) } }, { headers });
      } catch (cause) { return repositoryFailure(cause); }
    },
    async get(request: Request, context: Context): Promise<Response> {
      try {
        const actor = await authenticate(request, false); if (actor instanceof Response) return actor;
        const { id } = await context.params; if (!UUID.test(id)) return failure(404, "IMPORT_NOT_FOUND");
        const runtime = await configured(); if (!runtime) return failure(503, "IMPORT_UNAVAILABLE");
        return Response.json({ data: { job: publicV1PreparationJob(await runtime.jobs.get(actor.id, id)) } }, { headers });
      } catch (cause) { return repositoryFailure(cause); }
    },
    async cancel(request: Request, context: Context): Promise<Response> {
      try {
        const actor = await authenticate(request, true); if (actor instanceof Response) return actor;
        const { id } = await context.params; if (!UUID.test(id)) return failure(404, "IMPORT_NOT_FOUND");
        try { if (Object.keys(await metadata(request)).length) return failure(400, "INVALID_IMPORT_REQUEST"); }
        catch { return failure(400, "INVALID_IMPORT_REQUEST"); }
        const runtime = await configured(); if (!runtime) return failure(503, "IMPORT_UNAVAILABLE");
        return Response.json({ data: { job: publicV1PreparationJob(await runtime.jobs.cancel(actor.id, id)) } }, { headers });
      } catch (cause) { return repositoryFailure(cause); }
    },
  };
}
