import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  businessCardScanOcrFailureContext,
  businessCardScanOcrFailureToAppError,
  type BusinessCardScanOcrInput,
} from "../../../../../features/acquisition/business-card-contract";
import { resolveBusinessCardUploadMimeType } from "../../../../../features/acquisition/business-card-image-normalization";
import { createBusinessCardScanOcrService } from "../../../../../features/acquisition/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../../_shared/authenticated-actor";

type BusinessCardScanRequestInput = Omit<BusinessCardScanOcrInput, "actorId">;

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

async function readBusinessCardScanInput(
  request: Request,
  scenario: string | null,
): Promise<BusinessCardScanRequestInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    const image = formData.get("image");

    if (image instanceof File) {
      return {
        scenario,
        imageBase64: Buffer.from(await image.arrayBuffer()).toString("base64"),
        imageName: image.name,
        imageSizeBytes: image.size,
        mimeType: resolveBusinessCardUploadMimeType({
          declaredType: image.type,
          fileName: image.name,
        }),
      };
    }

    return {
      scenario,
      imageText: readFormText(formData, "imageText"),
      imageName: readFormText(formData, "imageName"),
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
    imageBase64:
      typeof body.imageBase64 === "string" ? body.imageBase64 : undefined,
    imageText: typeof body.imageText === "string" ? body.imageText : undefined,
    imageName: typeof body.imageName === "string" ? body.imageName : undefined,
    imageSizeBytes:
      typeof body.imageSizeBytes === "number"
        ? body.imageSizeBytes
        : undefined,
    mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined,
  };
}

export function createBusinessCardScanHandler(
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

    const scanService = createBusinessCardScanOcrService(mode);
    const scenario = new URL(request.url).searchParams.get("scenario");
    const result = await scanService.scanBusinessCard({
      ...(await readBusinessCardScanInput(request, scenario)),
      actorId: actor.id,
    });

    if (result.success === false) {
      const appError = businessCardScanOcrFailureToAppError(result);

      return NextResponse.json(
        failure(appError, businessCardScanOcrFailureContext(result, mode)),
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
