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
  type IngestCardFieldSources,
  type IngestManifestEntry,
} from "../../../../../../features/acquisition/business-card-ingest-v2/contract";
import type { IngestDerivativeStore } from "../../../../../../features/acquisition/business-card-ingest-v2/derivative-store";
import { reviewedEnrichmentValues } from "../../../../../../features/acquisition/business-card-ingest-v2/review-enrichment";
import {
  IngestImageInvalidError,
  isIngestUploadMimeType,
  normalizeIngestImage,
} from "../../../../../../features/acquisition/business-card-ingest-v2/normalization";
import type {
  BusinessCardIngestRepository,
  IngestQueryClient,
} from "../../../../../../features/acquisition/business-card-ingest-v2/repository";
import {
  ContactMergeRejected,
  findContactCandidate,
  listActorContactRecords,
  mergeCardIntoContact,
  type CardContactFields,
  type ContactCandidate,
} from "../../../../../../features/contacts/business-card-contact-match";
import { createLiveBusinessCardContactWriteService } from "../../../../../../features/contacts/live-contact-write-service";
import { createStorageBusinessCardContactWriteProvider } from "../../../../../../features/contacts/storage/contact-write-live-record-provider";
import { createPostgresLiveRecordStore } from "../../../../../../shared/storage/postgres-live-record-store";
import { ingestCardConfirmationInputSchema } from "../../../../../../shared/api-schema/business-card-batch";
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
  attributionCardsFromItems,
  resolveEventAttribution,
  type EventAttributionSource,
} from "../../../../../../features/plans/event-attribution";
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

/**
 * W0015 活动归属：确认时服务端按名片扫描时间重算本人的候选活动（`source`），核实后把计划里的
 * 这场活动标为已参加（`markAttended`）。缺省用 live 实现（按需加载，不在模块加载时连库）。
 */
export interface IngestEventAttributionDeps {
  source: () => Promise<EventAttributionSource | null>;
  markAttended: (input: { actorId: string; eventId: string }) => Promise<void>;
}

export interface IngestV2HandlerDeps {
  resolveActor?: ResolveAuthenticatedApiActor;
  runtime?: IngestV2Runtime | null;
  gate?: { run<T>(actorId: string, fn: () => Promise<T>): Promise<T> };
  isOcrProviderConfigured?: () => boolean;
  eventAttribution?: IngestEventAttributionDeps;
}

export const liveIngestEventAttribution: IngestEventAttributionDeps = {
  async markAttended(input) {
    const runtime = await import("../../../../../../features/plans/event-attribution-runtime");
    await runtime.markPlanEventAttendedForActor(input);
  },
  async source() {
    const runtime = await import("../../../../../../features/plans/event-attribution-runtime");
    return runtime.createConfiguredEventAttributionSource();
  },
};

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
  const parsed = manifest.map((entry, index) => {
    const record = entry as Record<string, unknown>;
    const fileName = typeof record.fileName === "string" ? record.fileName.trim() : "";
    const mimeType = typeof record.mimeType === "string" ? record.mimeType.trim() : "";
    const rawSize = Number(record.rawSize);
    const seq = Number(record.seq);
    const clientDigest =
      typeof record.clientDigest === "string" ? record.clientDigest.trim() : "";
    const hasCardId = Object.hasOwn(record, "cardId");
    const hasSide = Object.hasOwn(record, "side");
    const cardId = hasCardId && typeof record.cardId === "string" ? record.cardId.trim() : `legacy:${seq}`;
    const side = hasSide ? record.side : "front";
    if (
      !fileName ||
      !mimeType ||
      !Number.isInteger(rawSize) ||
      rawSize <= 0 ||
      rawSize > INGEST_V2_MAX_RAW_BYTES ||
      !Number.isInteger(seq) ||
      seq <= 0 ||
      !/^sha256:[0-9a-f]{64}$/.test(clientDigest) ||
      hasCardId !== hasSide ||
      !cardId ||
      (side !== "front" && side !== "back")
    ) {
      throw new IngestConflictError(
        "EMPTY_BATCH",
        `manifest entry ${index} is invalid (cardId/side/fileName/mimeType/rawSize/seq/clientDigest)`,
      );
    }
    if (!isIngestUploadMimeType(mimeType)) {
      throw new IngestConflictError(
        "EMPTY_BATCH",
        `manifest entry ${index} has unsupported mimeType ${mimeType}`,
      );
    }
    return { cardId, side: side as IngestManifestEntry["side"], legacyIdentity: !hasCardId, fileName, mimeType, rawSize, seq, clientDigest };
  });
  if (new Set(parsed.map(entry => entry.legacyIdentity)).size > 1) {
    throw new IngestConflictError("IDEMPOTENCY_CONFLICT", "legacy and explicit card identities cannot be mixed in one manifest");
  }
  const cards = new Map<string, IngestManifestEntry[]>();
  parsed.forEach(entry => cards.set(entry.cardId, [...(cards.get(entry.cardId) ?? []), entry]));
  for (const [cardId, entries] of cards) {
    if (entries.filter(entry => entry.side === "front").length !== 1 || entries.filter(entry => entry.side === "back").length > 1) {
      throw new IngestConflictError("IDEMPOTENCY_CONFLICT", `card ${cardId} must have one front and at most one back`);
    }
  }
  return parsed;
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
      // W0021：今日要事数待确认只要分组与状态列（`IngestBatchCardStates`），不读识别结果等大字段。
      if (view === "cards") {
        const states = await runtime.repository.getBatchCardStates({ actorId, batchId: id });
        if (!states) {
          return jsonError(new AppError("NOT_FOUND", `batch ${id} was not found`), mode);
        }
        return NextResponse.json(success(states), {
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

/**
 * 最后一张照片传完即在服务端开始识别：用户上传后离开页面（新用户引导「先完成设置」、关掉标签页）
 * 也不会卡在「待开始识别」。finalizeBatch 自带批次锁与幂等分支，并发/重复调用安全；
 * 任何失败都不影响本次上传的响应（客户端或下一张上传会再试）。
 */
async function finalizeWhenAllUploaded(
  deps: IngestV2HandlerDeps,
  runtime: Parameters<Parameters<typeof withAuthedRuntime>[1]>[0]["runtime"],
  actorId: string,
  batchId: string,
): Promise<void> {
  try {
    // 与手动 finalize 同一道预检：没有 OCR provider 时批次保持 collecting。
    const configured = deps.isOcrProviderConfigured?.() ?? createConfiguredBusinessCardCloudOcrProvider() !== null;
    if (!configured) return;
    const detail = await runtime.repository.getBatch({ actorId, batchId });
    if (!detail || detail.batch.status !== "collecting") return;
    const awaiting = detail.items.some((item) => item.status === "awaiting_upload");
    const uploaded = detail.items.some((item) => item.status === "uploaded");
    if (awaiting || !uploaded) return;
    await runtime.repository.finalizeBatch({ actorId, batchId });
  } catch {
    // 并发 finalize / 批次已变更：交给后续上传或客户端重试。
  }
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
      // 同字节重传幂等：包括最后一张传完后批次已自动开始识别（item 已进入 queued/processing/…）。
      if (item.status !== "awaiting_upload" && item.status !== "excluded" && item.imageDigest === digest) {
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
        await finalizeWhenAllUploaded(deps, runtime, actorId, id);
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
  constructor(
    public readonly duplicateContactId: string,
    public readonly candidate: ContactCandidate | null = null,
  ) {
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

function confirmationFingerprint(body: {
  confirmationIntentId: string;
  expectedCardItems: readonly { itemId: string; version: number; imageDigest: string }[];
  fieldSources: IngestCardFieldSources;
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  address?: string;
  mergeIntoContactId?: string;
  relationshipContext: string;
  notes: string;
  allowDuplicate?: boolean;
  primaryIndustryId?: string | null;
  secondaryIndustryId?: string | null;
  seniorityLevel?: string | null;
  regionCountryCode?: string | null;
  regionCity?: string | null;
  metEventId?: string | null;
}): string {
  // 地址、合并目标、行业、来源活动（W0015）、职级与地区（W0045）是后加的字段：
  // 为空时不进规范化对象，旧确认的指纹保持不变、可安全重放。
  const address = body.address?.trim() ? { address: body.address } : {};
  const merge = body.mergeIntoContactId ? { mergeIntoContactId: body.mergeIntoContactId } : {};
  const metEvent = body.metEventId ? { metEventId: body.metEventId } : {};
  const industry = {
    ...(body.primaryIndustryId ? { primaryIndustryId: body.primaryIndustryId } : {}),
    ...(body.secondaryIndustryId ? { secondaryIndustryId: body.secondaryIndustryId } : {}),
  };
  const enrichment = {
    ...(body.seniorityLevel ? { seniorityLevel: body.seniorityLevel } : {}),
    ...(body.regionCountryCode ? { regionCountryCode: body.regionCountryCode } : {}),
    ...(body.regionCity ? { regionCity: body.regionCity } : {}),
  };
  const canonical = {
    ...address,
    allowDuplicate: body.allowDuplicate === true,
    confirmationIntentId: body.confirmationIntentId,
    displayName: body.displayName,
    email: body.email,
    expectedCardItems: [...body.expectedCardItems].sort((a, b) => a.itemId.localeCompare(b.itemId)),
    fieldSources: Object.fromEntries(Object.entries(body.fieldSources).sort(([a], [b]) => a.localeCompare(b))),
    ...industry,
    ...merge,
    ...metEvent,
    notes: body.notes,
    ...enrichment,
    organization: body.organization,
    phone: body.phone,
    relationshipContext: body.relationshipContext,
    role: body.role,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function recordStoreFor(client: IngestQueryClient) {
  return createPostgresLiveRecordStore<Record<string, unknown>>({
    client: {
      async query(text: string, values?: readonly unknown[]) {
        const result = await client.query(text, values);
        return { rows: result.rows as never[] };
      },
    },
  });
}

/** 把确认事务的 client 包装成 record store，让联系人写入与 item 转换同事务。 */
function buildTxContactService(client: IngestQueryClient, workspaceId: string) {
  const txStore = recordStoreFor(client);
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
  allowFrom: readonly ("extracted" | "terminal_failed")[],
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
      const cardItems = detail!.items.filter((entry) => entry.cardId === item.cardId).sort((a, b) => a.seq - b.seq);
      const legacyFields = {
        displayName: textField(body.displayName),
        organization: textField(body.organization),
        role: textField(body.role),
        email: textField(body.email),
        phone: textField(body.phone),
        relationshipContext: textField(body.relationshipContext),
        notes: textField(body.notes),
        allowDuplicate: body.allowDuplicate === true,
      };
      const legacySeed = createHash("sha256").update(JSON.stringify(legacyFields)).digest("hex");
      const hasConfirmationMetadata = Object.hasOwn(body, "confirmationIntentId") || Object.hasOwn(body, "expectedCardItems") || Object.hasOwn(body, "fieldSources");
      if (!hasConfirmationMetadata && (cardItems.length !== 1 || item.cardIdentityExplicit !== false)) {
        return jsonError(new AppError("VALIDATION_ERROR", "Card confirmation metadata is required for explicit card identities."), mode);
      }
      const candidate = hasConfirmationMetadata
        ? body
        : {
            ...legacyFields,
            confirmationIntentId: `legacy:${item.cardId}:${legacySeed}`,
            expectedCardItems: cardItems.map((entry) => ({ itemId: entry.id, version: entry.version, imageDigest: entry.imageDigest ?? entry.clientDigest })),
            fieldSources: { displayName: item.id, organization: item.id, role: item.id, email: item.id, phone: item.id },
          };
      const confirmation = ingestCardConfirmationInputSchema.safeParse(candidate);
      if (!confirmation.success) {
        return jsonError(new AppError("VALIDATION_ERROR", "Card confirmation intent, source versions, or field provenance is invalid."), mode);
      }
      // W0015：「在该活动认识」。客户端只提交活动 id；服务端按这张名片的扫描时间（条目 createdAt）
      // 重算本人的候选，不一致就拒绝且不写库。字段不进共享 schema（Web 独有，App 契约不变）。
      const rawMetEventId = body.metEventId;
      if (rawMetEventId !== undefined && rawMetEventId !== null && (typeof rawMetEventId !== "string" || !rawMetEventId.trim() || rawMetEventId.length > 200)) {
        return jsonError(new AppError("VALIDATION_ERROR", "metEventId must be a non-empty string."), mode);
      }
      let metEvent: { eventId: string; title: string } | null = null;
      if (typeof rawMetEventId === "string") {
        const attribution = deps.eventAttribution ?? liveIngestEventAttribution;
        const source = await attribution.source();
        const resolved = source
          ? await resolveEventAttribution(source, { cards: attributionCardsFromItems(cardItems), userId: actorId })
          : null;
        const event = resolved?.byCard[item.cardId] === rawMetEventId.trim()
          ? resolved.events.find((entry) => entry.eventId === rawMetEventId.trim()) ?? null
          : null;
        if (!event) {
          return jsonError(new AppError("CONFLICT", "EVENT_ATTRIBUTION_REJECTED: this card was not scanned during that registered event."), mode);
        }
        metEvent = { eventId: event.eventId, title: event.title };
      }
      // W0045：行业／职级／地区的来源由服务端比较提交值与该卡识别结果判定；客户端不传来源（schema 已剥掉多余键）。
      const reviewed = reviewedEnrichmentValues(confirmation.data, cardItems.map((entry) => entry.extraction));
      if (!reviewed.ok) {
        return jsonError(new AppError("VALIDATION_ERROR", "Card confirmation seniority or region is invalid."), mode);
      }
      const enrichment = { values: reviewed.values };
      let merged = false;
      try {
        const confirmed = await runtime.repository.confirmCard({
          actorId,
          batchId: id,
          itemId,
          allowFrom,
          confirmationIntentId: confirmation.data.confirmationIntentId,
          confirmationFingerprint: confirmationFingerprint({ ...confirmation.data, metEventId: metEvent?.eventId ?? null }),
          expectedItems: confirmation.data.expectedCardItems,
          fieldSources: confirmation.data.fieldSources,
          async createContact(client) {
            const evidenceIds = cardItems.map((entry) => `evidence:business-card-batch:${entry.id}:${entry.side}`);
            const card: CardContactFields = {
              address: confirmation.data.address ?? "",
              displayName: confirmation.data.displayName,
              email: confirmation.data.email,
              organization: confirmation.data.organization,
              phone: confirmation.data.phone,
              role: confirmation.data.role,
            };
            const industry = {
              primaryIndustryId: confirmation.data.primaryIndustryId ?? null,
              secondaryIndustryId: confirmation.data.secondaryIndustryId ?? null,
            };
            const store = recordStoreFor(client);
            const mergeInto = async (contactId: string) => {
              merged = true;
              return mergeCardIntoContact({
                actorId,
                card,
                cardNotes: confirmation.data.notes,
                contactId,
                enrichment,
                evidenceIds,
                industry,
                metEvent,
                store,
                workspaceId: runtime.workspaceId,
              });
            };
            // 用户选了「已有联系人，合并」。
            if (confirmation.data.mergeIntoContactId) return mergeInto(confirmation.data.mergeIntoContactId);
            if (confirmation.data.allowDuplicate !== true) {
              const candidate = findContactCandidate(
                await listActorContactRecords(store, runtime.workspaceId, actorId),
                actorId,
                card,
              );
              // 所有字段都与已有联系人一致：就是这个人，直接并入，不新建也不再询问。
              if (candidate?.identical) return mergeInto(candidate.contactId);
              if (candidate) throw new DuplicateReviewSignal(candidate.contactId, candidate);
            }
            const contacts = buildTxContactService(client, runtime.workspaceId);
            const result = await contacts.confirmBusinessCardContact({
              ...(confirmation.data.address?.trim() ? { location: confirmation.data.address } : {}),
              actorId,
              actorLabel: actorId,
              allowDuplicate: confirmation.data.allowDuplicate === true,
              confirmed: true,
              displayName: confirmation.data.displayName,
              draftId: `business-card-batch:${id}:${item.cardId}`,
              email: confirmation.data.email,
              evidenceIds,
              imageDigest: createHash("sha256").update(cardItems.map((entry) => entry.imageDigest ?? entry.id).join("\n")).digest("hex"),
              notes: confirmation.data.notes,
              organization: confirmation.data.organization,
              phone: confirmation.data.phone,
              ...industry,
              enrichment,
              metEvent,
              relationshipContext: confirmation.data.relationshipContext,
              role: confirmation.data.role,
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
        for (const source of cardItems) if (source.extraction) {
          const edited = editedReviewFields(source.extraction, body);
          if (edited.length > 0) {
            console.info(
              "[ingest-v2] review edits",
              JSON.stringify({ batchId: id, cardId: item.cardId, edited, itemId: source.id }),
            );
          }
        }
        if (metEvent) {
          // 联系人已随确认提交（主数据）；计划写入另走计划库的事务，幂等（已参加是终态）。这里只是尽力而为：
          // 失败或计划服务未配置时，`plan-event-attendance` 维护任务按联系人上的 metEventId 对账补上。
          await (deps.eventAttribution ?? liveIngestEventAttribution)
            .markAttended({ actorId, eventId: metEvent.eventId })
            .catch((error: unknown) => {
              console.warn("[ingest-v2] event attribution plan update failed", error instanceof Error ? error.message : error);
            });
        }
        const confirmedItem = confirmed.items.find((entry) => entry.id === itemId) ?? confirmed.items[0]!;
        return NextResponse.json(
          success({
            contactId: confirmedItem.confirmedContactId,
            item: confirmedItem,
            items: confirmed.items,
            merged,
            metEventId: metEvent?.eventId ?? null,
            replayed: confirmed.replayed,
            state: "created",
          }),
          { headers: runtimeBoundaryHeaders(mode) },
        );
      } catch (error) {
        if (error instanceof DuplicateReviewSignal) {
          return NextResponse.json(
            success({
              candidate: error.candidate,
              duplicateContactId: error.duplicateContactId,
              state: "duplicate_review",
            }),
            { headers: runtimeBoundaryHeaders(mode) },
          );
        }
        if (error instanceof ContactWriteRejected) {
          return jsonError(new AppError("VALIDATION_ERROR", error.message), mode);
        }
        if (error instanceof ContactMergeRejected) {
          return jsonError(new AppError("CONFLICT", error.message), mode);
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
  return createConfirmLikeHandler(deps, ["extracted", "terminal_failed"] as const);
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

// ---- 复核页：查「可能是同一个联系人」-----------------------------------------

function cardFieldsFrom(value: unknown): CardContactFields | null {
  if (!isRecord(value)) return null;
  return {
    address: textField(value.address),
    displayName: textField(value.displayName),
    email: textField(value.email),
    organization: textField(value.organization),
    phone: textField(value.phone),
    role: textField(value.role),
  };
}

/**
 * POST { cards: [{ cardId, fields }] } → { matches: { [cardId]: candidate | null } }。
 * 字段取复核页当前草稿（用户可能改过），只在本人名下的联系人里找；只读，不改任何数据。
 */
export function createIngestV2DuplicateCandidatesHandler(deps: IngestV2HandlerDeps = {}) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    return withAuthedRuntime(deps, async ({ actorId, runtime, mode }) => {
      const { id } = await context.params;
      const detail = await runtime.repository.getBatch({ actorId, batchId: id });
      if (!detail) return jsonError(new AppError("NOT_FOUND", `batch ${id} was not found`), mode);
      const parsed: unknown = await request.json().catch(() => null);
      const cards = isRecord(parsed) && Array.isArray(parsed.cards) ? parsed.cards : null;
      if (!cards || cards.length > INGEST_V2_MAX_ITEMS) {
        return jsonError(new AppError("VALIDATION_ERROR", "cards must be an array of at most one batch."), mode);
      }
      const requests = cards.flatMap((entry) => {
        const fields = isRecord(entry) ? cardFieldsFrom(entry.fields) : null;
        const cardId = isRecord(entry) ? textField(entry.cardId) : "";
        return fields && cardId ? [{ cardId, fields }] : [];
      });
      const matches: Record<string, ContactCandidate | null> = {};
      if (requests.length && runtime.repository.withReadClient) {
        const records = await runtime.repository.withReadClient((client) =>
          listActorContactRecords(recordStoreFor(client), runtime.workspaceId, actorId),
        );
        for (const { cardId, fields } of requests) matches[cardId] = findContactCandidate(records, actorId, fields);
      }
      return NextResponse.json(success({ matches }), { headers: runtimeBoundaryHeaders(mode) });
    });
  };
}
