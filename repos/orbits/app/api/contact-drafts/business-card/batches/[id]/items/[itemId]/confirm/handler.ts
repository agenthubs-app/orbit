import { NextResponse } from "next/server";

import {
  createConfiguredBusinessCardBatchService,
  type BusinessCardBatchService,
} from "../../../../../../../../../features/acquisition/business-card-batch-service";
import { createBusinessCardContactWriteService } from "../../../../../../../../../features/contacts/service-factory";
import type { BusinessCardContactWriteService } from "../../../../../../../../../features/contacts/contact-write-contract";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../../../../../_shared/authenticated-actor";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function createConfirmLikeHandler(
  allowFailed: boolean,
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  batchService: BusinessCardBatchService | null = createConfiguredBusinessCardBatchService(),
  writeService: BusinessCardContactWriteService | null = null,
) {
  return async function POST(request: Request, context: RouteContext): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    function errorResponse(error: AppError): Response {
      return NextResponse.json(failure(error), {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(error.code),
      });
    }

    if (!batchService) {
      return errorResponse(
        new AppError(
          "SERVICE_UNAVAILABLE",
          "Business-card batch import requires a configured live database.",
        ),
      );
    }

    const { id, itemId } = await context.params;
    const parsedBody: unknown = await request.json().catch(() => ({}));
    const body = isRecord(parsedBody) ? parsedBody : {};
    let result;
    try {
      result = await batchService.confirmContact({
        actorId: actor.id, actorLabel: actor.name ?? actor.id, batchId: id, itemId,
        allowFailed,
        now: new Date().toISOString(),
        // Non-live modes retain their disabled provider; explicit test injection
        // is supported without changing the production transaction binding.
        writeService: writeService ?? (mode === "live" ? undefined : createBusinessCardContactWriteService(mode)),
        fields: { allowDuplicate: body.allowDuplicate === true, displayName: text(body.displayName),
          email: text(body.email), notes: text(body.notes), organization: text(body.organization),
          phone: text(body.phone), relationshipContext: text(body.relationshipContext), role: text(body.role) },
      });
    } catch (error) {
      return errorResponse(error instanceof AppError ? error : new AppError("SERVICE_UNAVAILABLE", "Card confirmation is unavailable. Refresh the batch and retry."));
    }

    if (result.success === false) {
      return errorResponse(new AppError("VALIDATION_ERROR", result.error.message));
    }

    if (result.data.state === "duplicate_review") {
      return NextResponse.json(
        success({
          duplicateContactId: result.data.duplicateContactId,
          state: result.data.state,
        }),
        { headers: runtimeBoundaryHeaders(mode), status: 200 },
      );
    }

    return NextResponse.json(
      success({ contactId: result.data.contactId, state: result.data.state }),
      { headers: runtimeBoundaryHeaders(mode), status: 200 },
    );
  };
}

export function createBusinessCardBatchItemConfirmHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  batchService: BusinessCardBatchService | null = createConfiguredBusinessCardBatchService(),
  writeService: BusinessCardContactWriteService | null = null,
) {
  return createConfirmLikeHandler(false, resolveActor, batchService, writeService);
}

export function createBusinessCardBatchItemManualEntryHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
  batchService: BusinessCardBatchService | null = createConfiguredBusinessCardBatchService(),
  writeService: BusinessCardContactWriteService | null = null,
) {
  return createConfirmLikeHandler(true, resolveActor, batchService, writeService);
}
