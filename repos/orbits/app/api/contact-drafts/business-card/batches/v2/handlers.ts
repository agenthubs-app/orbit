import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { createConfiguredBusinessCardCloudOcrProvider } from "../../../../../../features/acquisition/business-card-ocr-provider-selection";
import {
  getConfiguredIngestV2,
  ingestNormalizationGate,
} from "../../../../../../features/acquisition/business-card-ingest-v2/configured";
import {
  INGEST_V2_MAX_ITEMS,
  INGEST_V2_MAX_RAW_BYTES,
  IngestConflictError,
  type IngestItemDTO,
  type IngestManifestEntry,
} from "../../../../../../features/acquisition/business-card-ingest-v2/contract";
import type { IngestDerivativeStore } from "../../../../../../features/acquisition/business-card-ingest-v2/derivative-store";
import {
  IngestImageInvalidError,
  isIngestUploadMimeType,
  normalizeIngestImage,
} from "../../../../../../features/acquisition/business-card-ingest-v2/normalization";
import type {
  BusinessCardIngestRepository,
  IngestQueryClient,
} from "../../../../../../features/acquisition/business-card-ingest-v2/repository";
import { createLiveBusinessCardContactWriteService } from "../../../../../../features/contacts/live-contact-write-service";
import { createStorageBusinessCardContactWriteProvider } from "../../../../../../features/contacts/storage/contact-write-live-record-provider";
import { createPostgresLiveRecordStore } from "../../../../../../shared/storage/postgres-live-record-store";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import {
  resolveFeatureMode,
  type FeatureMode,
} from "../../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../_shared/authenticated-actor";

// V2 摄取端点（方案 §二）。复核动作（confirm/retry/skip/manual）在 items/[itemId]/ 下。

export interface IngestV2Runtime {
  repository: BusinessCardIngestRepository;
  store: IngestDerivativeStore;
  workspaceId: string;
  ready: Promise<void>;
}

export interface IngestV2HandlerDeps {
  resolveActor?: ResolveAuthenticatedApiActor;
  runtime?: IngestV2Runtime | null;
  gate?: { run<T>(actorId: string, fn: () => Promise<T>): Promise<T> };
  isOcrProviderConfigured?: () => boolean;
}

function currentMode(): FeatureMode {
  return resolveFeatureMode(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
}

function resolveRuntime(deps: IngestV2HandlerDeps): IngestV2Runtime | null {
  if (deps.runtime !== undefined) {
    return deps.runtime;
  }
  const configured = getConfiguredIngestV2();
  if (!configured) {
    return null;
  }
  return {
    repository: configured.repository,
    store: configured.store,
    workspaceId: configured.workspaceId,
    ready: configured.ready,
  };
}

function jsonError(error: AppError, mode: FeatureMode): Response {
  return NextResponse.json(failure(error), {
    headers: runtimeBoundaryHeaders(mode),
    status: getHttpStatusForAppErrorCode(error.code),
  });
}

function serviceUnavailable(mode: FeatureMode): Response {
  return jsonError(
    new AppError(
      "SERVICE_UNAVAILABLE",
      "Business-card batch import requires a configured live database.",
    ),
    mode,
  );
}

function mapIngestError(error: unknown, mode: FeatureMode): Response {
  if (error instanceof IngestImageInvalidError) {
    return jsonError(
      new AppError("VALIDATION_ERROR", `IMAGE_INVALID:${error.reason}: ${error.message}`),
      mode,
    );
  }
  if (error instanceof IngestConflictError) {
    switch (error.code) {
      case "BATCH_GONE":
        return jsonError(new AppError("NOT_FOUND", error.message), mode);
      case "EMPTY_BATCH":
      case "AWAITING_UPLOADS":
        return NextResponse.json(
          failure(new AppError("VALIDATION_ERROR", `${error.code}: ${error.message}`), {
            detail: JSON.stringify(error.detail ?? null),
          }),
          { headers: runtimeBoundaryHeaders(mode), status: 400 },
        );
      default:
        return jsonError(new AppError("CONFLICT", `${error.code}: ${error.message}`), mode);
    }
  }
  throw error;
}

async function withAuthedRuntime(
  deps: IngestV2HandlerDeps,
  fn: (context: {
    actorId: string;
    runtime: IngestV2Runtime;
    mode: FeatureMode;
  }) => Promise<Response>,
): Promise<Response> {
  const mode = currentMode();
  const resolveActor = deps.resolveActor ?? resolveAuthenticatedApiActor;
  const actor = await resolveActor();
  if (!actor) {
    return authenticatedApiActorRequiredResponse(mode);
  }
  const runtime = resolveRuntime(deps);
  if (!runtime) {
    return serviceUnavailable(mode);
  }
  await runtime.ready;
  try {
    return await fn({ actorId: actor.id, runtime, mode });
  } catch (error) {
    return mapIngestError(error, mode);
  }
}

function parseManifest(payload: unknown): IngestManifestEntry[] {
  if (typeof payload !== "object" || payload === null) {
    throw new IngestConflictError("EMPTY_BATCH", "request body must be a JSON object");
  }
  const manifest = (payload as { manifest?: unknown }).manifest;
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new IngestConflictError("EMPTY_BATCH", "manifest must be a non-empty array");
  }
  if (manifest.length > INGEST_V2_MAX_ITEMS) {
    throw new IngestConflictError(
      "IDEMPOTENCY_CONFLICT",
      `manifest exceeds ${INGEST_V2_MAX_ITEMS} items`,
    );
  }
  return manifest.map((entry, index) => {
    const record = entry as Record<string, unknown>;
    const fileName = typeof record.fileName === "string" ? record.fileName.trim() : "";
    const mimeType = typeof record.mimeType === "string" ? record.mimeType.trim() : "";
    const rawSize = Number(record.rawSize);
    const seq = Number(record.seq);
    const clientDigest =
      typeof record.clientDigest === "string" ? record.clientDigest.trim() : "";
    if (
      !fileName ||
      !mimeType ||
      !Number.isInteger(rawSize) ||
      rawSize <= 0 ||
      rawSize > INGEST_V2_MAX_RAW_BYTES ||
      !Number.isInteger(seq) ||
      seq <= 0 ||
      !/^sha256:[0-9a-f]{64}$/.test(clientDigest)
    ) {
      throw new IngestConflictError(
        "EMPTY_BATCH",
        `manifest entry ${index} is invalid (fileName/mimeType/rawSize/seq/clientDigest)`,
      );
    }
    if (!isIngestUploadMimeType(mimeType)) {
      throw new IngestConflictError(
        "EMPTY_BATCH",
        `manifest entry ${index} has unsupported mimeType ${mimeType}`,
      );
    }
    return { fileName, mimeType, rawSize, seq, clientDigest };
  });
}

async function readRawBody(request: Request): Promise<Buffer> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > INGEST_V2_MAX_RAW_BYTES) {
    throw new IngestImageInvalidError(
      "RAW_TOO_LARGE",
      `content-length ${declared} exceeds the ${INGEST_V2_MAX_RAW_BYTES} byte limit`,
    );
  }
  // 不信任 Content-Length：流式读取并执行硬字节上限（方案 §二）。
  const reader = request.body?.getReader();
  if (!reader) {
    throw new IngestImageInvalidError("DECODE_FAILED", "request body is empty");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > INGEST_V2_MAX_RAW_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new IngestImageInvalidError(
        "RAW_TOO_LARGE",
        `upload exceeds the ${INGEST_V2_MAX_RAW_BYTES} byte limit`,
      );
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function sha256Digest(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function normalizeAndStore(
  deps: IngestV2HandlerDeps,
  runtime: IngestV2Runtime,
  actorId: string,
  bytes: Buffer,
  declaredMimeType: string,
): Promise<{ objectKey: string; size: number }> {
  const gate = deps.gate ?? ingestNormalizationGate;
  const normalized = await gate.run(actorId, () =>
    normalizeIngestImage({ bytes, declaredMimeType }),
  );
  // 先写对象、后做 DB 事务；DB 失败由调用方尽力删除（方案 §二）。
  return runtime.store.put(normalized.jpegBytes);
}

async function removeUnreferencedUpload(
  runtime: IngestV2Runtime,
  actorId: string,
  batchId: string,
  itemId: string,
  objectKey: string,
): Promise<void> {
  // An error may occur after the repository commits (for example, dispatch).
  // Preserve the object unless a fresh read proves it is not the saved image.
  try {
    const detail = await runtime.repository.getBatch({ actorId, batchId });
    const item = detail?.items.find((candidate) => candidate.id === itemId);
    if (item?.derivativeObjectKey !== objectKey) await runtime.store.delete(objectKey);
  } catch {
    // An unavailable database cannot prove that deleting the image is safe.
  }
}

export function createIngestV2CollectionHandlers(deps: IngestV2HandlerDeps = {}) {
  return {
    async GET(): Promise<Response> {
      return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
        const batches = await runtime.repository.listBatches({ actorId });
        return NextResponse.json(success({ batches }), {
          headers: runtimeBoundaryHeaders(mode),
        });
      });
    },
    async POST(request: Request): Promise<Response> {
      return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
        const payload = (await request.json().catch(() => null)) as {
          idempotencyKey?: unknown;
        } | null;
        const idempotencyKey =
          typeof payload?.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
        if (!idempotencyKey) {
          return jsonError(
            new AppError("VALIDATION_ERROR", "idempotencyKey is required"),
            mode,
          );
        }
        const manifest = parseManifest(payload);
        const created = await runtime.repository.createBatch({
          actorId,
          idempotencyKey,
          manifest,
        });
        return NextResponse.json(
          success({ batch: created.batch, items: created.items, reused: created.reused }),
          { headers: runtimeBoundaryHeaders(mode), status: created.reused ? 200 : 201 },
        );
      });
    },
  };
}

export function createIngestV2BatchDetailHandler(deps: IngestV2HandlerDeps = {}) {
  return async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
      const { id } = await context.params;
      const view = new URL(request.url).searchParams.get("view");
      if (view === "summary") {
        const summary = await runtime.repository.getBatchSummary({ actorId, batchId: id });
        if (!summary) {
          return jsonError(new AppError("NOT_FOUND", `batch ${id} was not found`), mode);
        }
        return NextResponse.json(success(summary), {
          headers: runtimeBoundaryHeaders(mode),
        });
      }
      const detail = await runtime.repository.getBatch({ actorId, batchId: id });
      if (!detail) {
        return jsonError(new AppError("NOT_FOUND", `batch ${id} was not found`), mode);
      }
      return NextResponse.json(success(detail), {
        headers: runtimeBoundaryHeaders(mode),
      });
    });
  };
}

export function createIngestV2UploadHandler(deps: IngestV2HandlerDeps = {}) {
  return async function PUT(
    request: Request,
    context: { params: Promise<{ id: string; itemId: string }> },
  ): Promise<Response> {
    return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
      const { id, itemId } = await context.params;
      const declaredMimeType = request.headers.get("content-type")?.trim() ?? "";
      const bytes = await readRawBody(request);
      const digest = sha256Digest(bytes);

      // 服务端重算 digest 与 manifest 声明比对（完整性；方案 §二）。
      const detail = await runtime.repository.getBatch({ actorId, batchId: id });
      if (!detail) {
        return jsonError(new AppError("NOT_FOUND", `batch ${id} was not found`), mode);
      }
      const item = detail.items.find((candidate) => candidate.id === itemId);
      if (!item) {
        return jsonError(new AppError("NOT_FOUND", `item ${itemId} was not found`), mode);
      }
      if (item.status === "uploaded" && item.imageDigest === digest) {
        return NextResponse.json(success({ item, alreadyUploaded: true }), {
          headers: runtimeBoundaryHeaders(mode),
        });
      }
      if (item.clientDigest !== digest) {
        return jsonError(
          new AppError(
            "VALIDATION_ERROR",
            "DIGEST_MISMATCH: uploaded bytes do not match the manifest clientDigest",
          ),
          mode,
        );
      }

      const stored = await normalizeAndStore(deps, runtime, actorId, bytes, declaredMimeType);
      try {
        const result = await runtime.repository.markItemUploaded({
          actorId,
          batchId: id,
          itemId,
          imageDigest: digest,
          derivativeObjectKey: stored.objectKey,
          derivativeSize: stored.size,
        });
        if (result.alreadyUploaded) {
          await runtime.store.delete(stored.objectKey).catch(() => undefined);
        }
        return NextResponse.json(
          success({ item: result.item, alreadyUploaded: result.alreadyUploaded }),
          { headers: runtimeBoundaryHeaders(mode) },
        );
      } catch (error) {
        await removeUnreferencedUpload(runtime, actorId, id, itemId, stored.objectKey);
        throw error;
      }
    });
  };
}

export function createIngestV2ReplaceHandler(deps: IngestV2HandlerDeps = {}) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ id: string; itemId: string }> },
  ): Promise<Response> {
    return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
      const { id, itemId } = await context.params;
      const expectedVersion = Number(request.headers.get("if-match") ?? "");
      if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
        return jsonError(
          new AppError("VALIDATION_ERROR", "If-Match header must carry the item version"),
          mode,
        );
      }
      const declaredMimeType = request.headers.get("content-type")?.trim() ?? "";
      const bytes = await readRawBody(request);
      const digest = sha256Digest(bytes);
      const stored = await normalizeAndStore(deps, runtime, actorId, bytes, declaredMimeType);
      try {
        const item = await runtime.repository.swapDerivative({
          actorId,
          batchId: id,
          itemId,
          expectedVersion,
          imageDigest: digest,
          derivativeObjectKey: stored.objectKey,
          derivativeSize: stored.size,
        });
        return NextResponse.json(success({ item }), {
          headers: runtimeBoundaryHeaders(mode),
        });
      } catch (error) {
        await removeUnreferencedUpload(runtime, actorId, id, itemId, stored.objectKey);
        throw error;
      }
    });
  };
}

export function createIngestV2ExcludeHandler(deps: IngestV2HandlerDeps = {}) {
  return async function POST(
    _request: Request,
    context: { params: Promise<{ id: string; itemId: string }> },
  ): Promise<Response> {
    return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
      const { id, itemId } = await context.params;
      const item = await runtime.repository.excludeItem({ actorId, batchId: id, itemId });
      return NextResponse.json(success({ item }), {
        headers: runtimeBoundaryHeaders(mode),
      });
    });
  };
}

export function createIngestV2FinalizeHandler(deps: IngestV2HandlerDeps = {}) {
  return async function POST(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
      const { id } = await context.params;
      // finalize 顺序（方案 §四）：先幂等返回，再对 collecting 做 provider 预检。
      const existing = await runtime.repository.getBatch({ actorId, batchId: id });
      if (!existing) {
        return jsonError(new AppError("NOT_FOUND", `batch ${id} was not found`), mode);
      }
      if (existing.batch.status === "collecting") {
        const configured =
          deps.isOcrProviderConfigured?.() ??
          createConfiguredBusinessCardCloudOcrProvider() !== null;
        if (!configured) {
          return jsonError(
            new AppError(
              "SERVICE_UNAVAILABLE",
              "PROVIDER_UNAVAILABLE: no OCR provider is configured; the batch stays collecting",
            ),
            mode,
          );
        }
      }
      const result = await runtime.repository.finalizeBatch({ actorId, batchId: id });
      return NextResponse.json(
        success({ batch: result.batch, alreadyFinalized: result.alreadyFinalized }),
        { headers: runtimeBoundaryHeaders(mode) },
      );
    });
  };
}

export function createIngestV2CancelHandler(deps: IngestV2HandlerDeps = {}) {
  return async function POST(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
      const { id } = await context.params;
      const batch = await runtime.repository.cancelBatch({ actorId, batchId: id });
      return NextResponse.json(success({ batch }), {
        headers: runtimeBoundaryHeaders(mode),
      });
    });
  };
}

// ---- 复核动作（方案 §五）----------------------------------------------------

class DuplicateReviewSignal extends Error {
  constructor(public readonly duplicateContactId: string) {
    super("duplicate review required");
  }
}

class ContactWriteRejected extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 把确认事务的 client 包装成 record store，让联系人写入与 item 转换同事务。 */
function buildTxContactService(client: IngestQueryClient, workspaceId: string) {
  const txStore = createPostgresLiveRecordStore({
    client: {
      async query(text: string, values?: readonly unknown[]) {
        const result = await client.query(text, values);
        return { rows: result.rows as never[] };
      },
    },
  });
  const provider = createStorageBusinessCardContactWriteProvider({
    store: txStore,
    workspaceId,
  });
  return createLiveBusinessCardContactWriteService({ provider });
}

// P2 质量基准的最小起步：记录用户在复核页改了哪些字段（与 OCR 结果对比）。
// 只进服务端日志，不入库——正式落库需要 schema/migration，另行提案。
function editedReviewFields(
  extraction: NonNullable<IngestItemDTO["extraction"]>,
  body: Record<string, unknown>,
): readonly string[] {
  const edited: string[] = [];
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const displayName = text(body.displayName);
  if (
    displayName &&
    displayName !== (extraction.fullName ?? "").trim() &&
    displayName !== (extraction.nativeFullName ?? "").trim()
  ) {
    edited.push("displayName");
  }
  if (text(body.organization) !== (extraction.organization ?? "").trim()) {
    edited.push("organization");
  }
  if (text(body.role) !== (extraction.title ?? "").trim()) {
    edited.push("role");
  }
  const email = text(body.email).toLowerCase();
  if (email && !extraction.emails.some((item) => item.value.toLowerCase() === email)) {
    edited.push("email");
  }
  const phoneDigits = text(body.phone).replace(/\D/g, "");
  if (
    phoneDigits &&
    !extraction.contactPoints.some((point) => point.value.replace(/\D/g, "") === phoneDigits)
  ) {
    edited.push("phone");
  }
  return edited;
}

function createConfirmLikeHandler(
  deps: IngestV2HandlerDeps,
  allowFrom: readonly ["extracted"] | readonly ["terminal_failed"],
) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ id: string; itemId: string }> },
  ): Promise<Response> {
    return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
      const { id, itemId } = await context.params;
      const parsedBody: unknown = await request.json().catch(() => ({}));
      const body = isRecord(parsedBody) ? parsedBody : {};

      const detail = await runtime.repository.getBatch({ actorId, batchId: id });
      const item = detail?.items.find((entry) => entry.id === itemId);
      if (!item) {
        return jsonError(new AppError("NOT_FOUND", `item ${itemId} was not found`), mode);
      }

      try {
        const confirmed = await runtime.repository.confirmItem({
          actorId,
          batchId: id,
          itemId,
          allowFrom,
          async createContact(client) {
            const contacts = buildTxContactService(client, runtime.workspaceId);
            const result = await contacts.confirmBusinessCardContact({
              actorId,
              actorLabel: actorId,
              allowDuplicate: body.allowDuplicate === true,
              confirmed: true,
              displayName: textField(body.displayName),
              draftId: itemId,
              email: textField(body.email),
              evidenceIds: [`evidence:business-card-batch:${itemId}`],
              imageDigest: item.imageDigest ?? itemId,
              notes: textField(body.notes),
              organization: textField(body.organization),
              phone: textField(body.phone),
              relationshipContext: textField(body.relationshipContext),
              role: textField(body.role),
            });
            if (result.success === false) {
              throw new ContactWriteRejected(result.error.message);
            }
            if (result.data.state === "duplicate_review") {
              throw new DuplicateReviewSignal(result.data.duplicateContactId ?? "");
            }
            return result.data.contactId;
          },
        });
        if (item.extraction) {
          const edited = editedReviewFields(item.extraction, body);
          if (edited.length > 0) {
            console.info(
              "[ingest-v2] review edits",
              JSON.stringify({ batchId: id, edited, itemId }),
            );
          }
        }
        return NextResponse.json(
          success({
            contactId: confirmed.confirmedContactId,
            item: confirmed,
            state: "created",
          }),
          { headers: runtimeBoundaryHeaders(mode) },
        );
      } catch (error) {
        if (error instanceof DuplicateReviewSignal) {
          return NextResponse.json(
            success({
              duplicateContactId: error.duplicateContactId,
              state: "duplicate_review",
            }),
            { headers: runtimeBoundaryHeaders(mode) },
          );
        }
        if (error instanceof ContactWriteRejected) {
          return jsonError(new AppError("VALIDATION_ERROR", error.message), mode);
        }
        throw error;
      }
    });
  };
}

export function createIngestV2ConfirmHandler(deps: IngestV2HandlerDeps = {}) {
  return createConfirmLikeHandler(deps, ["extracted"] as const);
}

/** 手工录入（方案 §五）：与确认同构，从 terminal_failed 进入 confirmed。 */
export function createIngestV2ManualEntryHandler(deps: IngestV2HandlerDeps = {}) {
  return createConfirmLikeHandler(deps, ["terminal_failed"] as const);
}

export function createIngestV2SkipHandler(deps: IngestV2HandlerDeps = {}) {
  return async function POST(
    _request: Request,
    context: { params: Promise<{ id: string; itemId: string }> },
  ): Promise<Response> {
    return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
      const { id, itemId } = await context.params;
      const item = await runtime.repository.skipItem({ actorId, batchId: id, itemId });
      return NextResponse.json(success({ item }), {
        headers: runtimeBoundaryHeaders(mode),
      });
    });
  };
}

export function createIngestV2RetryHandler(deps: IngestV2HandlerDeps = {}) {
  return async function POST(
    _request: Request,
    context: { params: Promise<{ id: string; itemId: string }> },
  ): Promise<Response> {
    return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
      const { id, itemId } = await context.params;
      const item = await runtime.repository.retryItem({ actorId, batchId: id, itemId });
      return NextResponse.json(success({ item }), {
        headers: runtimeBoundaryHeaders(mode),
      });
    });
  };
}

export function createIngestV2ImageHandler(deps: IngestV2HandlerDeps = {}) {
  return async function GET(
    _request: Request,
    context: { params: Promise<{ id: string; itemId: string }> },
  ): Promise<Response> {
    return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
      const { id, itemId } = await context.params;
      const detail = await runtime.repository.getBatch({ actorId, batchId: id });
      const item = detail?.items.find((candidate) => candidate.id === itemId);
      if (!item?.derivativeObjectKey) {
        return jsonError(new AppError("NOT_FOUND", "image is not available"), mode);
      }
      const bytes = await runtime.store.get(item.derivativeObjectKey);
      if (!bytes) {
        return jsonError(new AppError("NOT_FOUND", "image is not available"), mode);
      }
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Cache-Control": "private, max-age=0",
          "Content-Type": "image/jpeg",
          ...Object.fromEntries(new Headers(runtimeBoundaryHeaders(mode)).entries()),
        },
      });
    });
  };
}
