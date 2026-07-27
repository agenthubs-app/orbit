import { NextResponse } from "next/server";

import {
  qrScanConnectFailureContext,
  qrScanConnectFailureToAppError,
  type QrScanConnectInput,
} from "../../../../../features/acquisition/qr-contract";
import { createQrScanConnectServiceForActor } from "../../../../../features/acquisition/service-factory";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFormText(
  formData: FormData,
  fieldName: string,
): string | undefined {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : undefined;
}

async function readQrScanInput(
  request: Request,
  scenario: string | null,
): Promise<QrScanConnectInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();

    return {
      scenario,
      qrText: readFormText(formData, "qrText"),
      scanLabel: readFormText(formData, "scanLabel"),
    };
  }

  if (!contentType.includes("application/json")) {
    return { scenario };
  }

  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return { scenario };
  }

  const parsedBody: unknown = JSON.parse(rawBody);
  const body = isRecord(parsedBody) ? parsedBody : {};

  return {
    scenario,
    qrText: typeof body.qrText === "string" ? body.qrText : undefined,
    scanLabel:
      typeof body.scanLabel === "string" ? body.scanLabel : undefined,
  };
}

export function createQrScanPostHandler(
  resolveActor: ResolveAuthenticatedApiActor = resolveAuthenticatedApiActor,
) {
  return async function POST(request: Request): Promise<Response> {
    const mode = resolveFeatureMode(
      process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
    );
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const scanService = createQrScanConnectServiceForActor(actor.id, mode);
    const scenario = new URL(request.url).searchParams.get("scenario");
    const result = await scanService.scanQrCode(
      await readQrScanInput(request, scenario),
    );

    if (result.success === false) {
      const appError = qrScanConnectFailureToAppError(result);

      return NextResponse.json(
        failure(appError, qrScanConnectFailureContext(result, mode)),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: getHttpStatusForAppErrorCode(appError.code),
        },
      );
    }

    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  };
}
