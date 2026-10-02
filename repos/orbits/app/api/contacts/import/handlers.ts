/**
 * W0053：联系人导入 API（`/api/contacts/import/**`）。全部 `resolveAuthenticatedApiActor`，按 actor 隔离（别人的批次 404）。
 * 不放进 `contact-drafts/**`（App 在用的草稿接口契约与行为不变）。
 *
 * - `GET  /api/contacts/import`                 最近导入记录（摘要）
 * - `POST /api/contacts/import`                 上传原始文件体（头：x-orbit-import-kind csv|vcard、x-orbit-import-file-name（URI 编码）、
 *                                               idempotency-key）；超过 5 MB 在读完前 413；→ 批次 + 核对摘要
 * - `GET  /api/contacts/import/events`          可导入的活动（本人已互换的人，按活动分组）
 * - `POST /api/contacts/import/events`          { eventId, idempotencyKey } 导入一场活动
 * - `GET  /api/contacts/import/:id`             批次 + 核对摘要（含待确认的合并清单）
 * - `PATCH /api/contacts/import/:id`            { mapping } 改字段对应 → 重算行与去重
 * - `GET  /api/contacts/import/:id/rows`        ?cursor=<seq>&filter=all|new|duplicates|issues，每页 50
 * - `PATCH /api/contacts/import/:id/rows`       { decisions: [{ seq, decision }] }
 * - `POST /api/contacts/import/:id/commit`      { confirmationIntentId, mergeConfirmations: [{ seq, contactId }] }
 * - `POST /api/contacts/import/:id/cancel`
 */
import { after, NextResponse } from "next/server";

import { ContactImportFileRejected } from "../../../../features/contacts/import/parse/index";
import { CONTACT_IMPORT_MAX_BYTES } from "../../../../features/contacts/import/limits";
import type { ContactImportRowFilter } from "../../../../features/contacts/import/repository";
import { getConfiguredContactImportService } from "../../../../features/contacts/import/runtime";
import { ContactImportError, type ContactImportService } from "../../../../features/contacts/import/service";
import { failure, runtimeBoundaryHeaders, success } from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type AuthenticatedApiActor } from "../../_shared/authenticated-actor";

export interface ContactImportHandlerDeps {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  service?: (schedule: (task: () => Promise<void>) => void) => ContactImportService | null;
  schedule?: (task: () => Promise<void>) => void;
}

type Params = { params: Promise<{ id: string }> };

class UploadTooLarge extends Error {}

const ERROR_STATUS: Record<ContactImportError["code"], { code: AppErrorCode; status: number }> = {
  INTENT_CONFLICT: { code: "CONFLICT", status: 409 },
  INVALID_DECISIONS: { code: "VALIDATION_ERROR", status: 400 },
  INVALID_MAPPING: { code: "VALIDATION_ERROR", status: 400 },
  MERGE_NOT_CONFIRMED: { code: "CONFLICT", status: 409 },
  NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  NOT_REVIEWABLE: { code: "CONFLICT", status: 409 },
  NOTHING_TO_IMPORT: { code: "CONFLICT", status: 409 },
  UNDECIDED_ROWS: { code: "CONFLICT", status: 409 },
};

async function readRawBody(request: Request): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > CONTACT_IMPORT_MAX_BYTES) throw new UploadTooLarge();
  // 不信任 Content-Length：流式读取并执行硬上限（超出立即停止，不读完）。
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > CONTACT_IMPORT_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new UploadTooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

function text(value: unknown, max = 200): string | null {
  return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const parsed: unknown = await request.json().catch(() => null);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

export function createContactImportHandlers(dependencies: ContactImportHandlerDeps = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const schedule = dependencies.schedule ?? ((task: () => Promise<void>) => after(task));
  const resolveService = dependencies.service ?? ((scheduler) => getConfiguredContactImportService({ schedule: scheduler }));

  async function run(fn: (input: { actorId: string; service: ContactImportService; headers: HeadersInit }) => Promise<Response>): Promise<Response> {
    const mode = resolveFeatureMode();
    const headers = runtimeBoundaryHeaders(mode);
    const actor = await resolveActor();
    if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
    const service = resolveService(schedule);
    const fail = (error: AppError, status: number, context?: Record<string, string>) => NextResponse.json(failure(error, context), { headers, status });
    if (!service) return fail(new AppError("SERVICE_UNAVAILABLE", "Contact import requires a configured live database."), 503);
    try {
      return await fn({ actorId: actor.id, headers, service });
    } catch (error) {
      if (error instanceof UploadTooLarge) {
        return fail(new AppError("VALIDATION_ERROR", `The file is larger than ${CONTACT_IMPORT_MAX_BYTES / 1024 / 1024} MB. Split it and try again.`), 413, { reason: "too_large" });
      }
      if (error instanceof ContactImportFileRejected) {
        return fail(new AppError("VALIDATION_ERROR", error.message), error.reason === "too_many_rows" || error.reason === "too_large" ? 413 : 400, { reason: error.reason });
      }
      if (error instanceof ContactImportError) {
        const mapped = ERROR_STATUS[error.code];
        const context: Record<string, string> = { reason: error.code };
        for (const [key, value] of Object.entries(error.detail ?? {})) context[key] = String(value);
        return fail(new AppError(mapped.code, error.message), mapped.status, context);
      }
      if (isUndefinedTable(error)) return fail(new AppError("SERVICE_UNAVAILABLE", "Contact import is not set up yet."), 503);
      throw error;
    }
  }

  const ok = (data: unknown, headers: HeadersInit, status = 200) => NextResponse.json(success(data), { headers, status });
  const batchId = async (context: Params) => decodeURIComponent((await context.params).id ?? "").trim();

  return {
    list: () => run(async ({ actorId, headers, service }) => ok({ batches: await service.listBatches(actorId) }, headers)),

    upload: (request: Request) => run(async ({ actorId, headers, service }) => {
      const kind = request.headers.get("x-orbit-import-kind");
      if (kind !== "csv" && kind !== "vcard") throw new ContactImportError("INVALID_MAPPING", "x-orbit-import-kind must be csv or vcard.");
      const idempotencyKey = text(request.headers.get("idempotency-key"));
      if (!idempotencyKey) throw new ContactImportError("INVALID_MAPPING", "idempotency-key header is required.");
      let fileName = "";
      try {
        fileName = decodeURIComponent(request.headers.get("x-orbit-import-file-name") ?? "").slice(0, 300);
      } catch {
        fileName = "";
      }
      const bytes = await readRawBody(request);
      const result = await service.upload({ actorId, bytes, fileName, idempotencyKey, kind });
      return ok(result, headers, result.replayed ? 200 : 201);
    }),

    events: () => run(async ({ actorId, headers, service }) => ok({ events: await service.listImportableEvents(actorId) }, headers)),

    importEvent: (request: Request) => run(async ({ actorId, headers, service }) => {
      const body = await jsonBody(request);
      const eventId = text(body.eventId);
      const idempotencyKey = text(body.idempotencyKey);
      if (!eventId || !idempotencyKey) throw new ContactImportError("INVALID_MAPPING", "eventId and idempotencyKey are required.");
      const result = await service.importEvent({ actorId, eventId, idempotencyKey });
      return ok(result, headers, result.replayed ? 200 : 201);
    }),

    get: (_request: Request, context: Params) => run(async ({ actorId, headers, service }) => ok({ batch: await service.getBatch(actorId, await batchId(context)) }, headers)),

    remap: (request: Request, context: Params) => run(async ({ actorId, headers, service }) => {
      const body = await jsonBody(request);
      return ok({ batch: await service.remap(actorId, await batchId(context), body.mapping) }, headers);
    }),

    rows: (request: Request, context: Params) => run(async ({ actorId, headers, service }) => {
      const url = new URL(request.url);
      const cursor = Number(url.searchParams.get("cursor") ?? "0");
      const filterParam = url.searchParams.get("filter");
      const filter: ContactImportRowFilter = filterParam === "new" || filterParam === "duplicates" || filterParam === "issues" ? filterParam : "all";
      return ok(await service.listRows(actorId, await batchId(context), { afterSeq: Number.isInteger(cursor) && cursor > 0 ? cursor : 0, filter }), headers);
    }),

    decide: (request: Request, context: Params) => run(async ({ actorId, headers, service }) => {
      const body = await jsonBody(request);
      const decisions = Array.isArray(body.decisions) ? body.decisions : null;
      if (!decisions || decisions.length > 2000) throw new ContactImportError("INVALID_DECISIONS", "decisions must be an array.");
      const parsed = decisions.map((entry) => {
        const record = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
        return { decision: record.decision as "create" | "merge" | "skip", seq: Number(record.seq) };
      });
      return ok(await service.setDecisions(actorId, await batchId(context), parsed), headers);
    }),

    commit: (request: Request, context: Params) => run(async ({ actorId, headers, service }) => {
      const body = await jsonBody(request);
      const confirmationIntentId = text(body.confirmationIntentId);
      const confirmations = Array.isArray(body.mergeConfirmations) ? body.mergeConfirmations : null;
      if (!confirmationIntentId || !confirmations || confirmations.length > 2000) {
        throw new ContactImportError("INVALID_DECISIONS", "confirmationIntentId and mergeConfirmations are required.");
      }
      const mergeConfirmations = confirmations.flatMap((entry) => {
        const record = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
        const seq = Number(record.seq);
        const contactId = text(record.contactId, 512);
        return Number.isInteger(seq) && seq > 0 && contactId ? [{ contactId, seq }] : [];
      });
      if (mergeConfirmations.length !== confirmations.length) throw new ContactImportError("INVALID_DECISIONS", "mergeConfirmations must be [{ seq, contactId }].");
      return ok(await service.commit(actorId, await batchId(context), { confirmationIntentId, mergeConfirmations }), headers);
    }),

    cancel: (_request: Request, context: Params) => run(async ({ actorId, headers, service }) => ok({ batch: await service.cancel(actorId, await batchId(context)) }, headers)),
  };
}
