import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import {
  chatPrivacyControlsFailureContext,
  chatPrivacyControlsFailureToAppError,
  type ChatAnalysisOptInInput,
  type ChatPrivacyControlsResult,
} from "../../../../../features/chat/privacy-contract";
import { createChatPrivacyControlsService } from "../../../../../features/chat/service-factory";

export const dynamic = "force-dynamic";

type BodyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is BodyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function readEnabled(
  body: BodyRecord,
  searchParams: URLSearchParams,
): boolean | null {
  if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
    return readBoolean(body.enabled);
  }

  const queryEnabled = searchParams.get("enabled");

  if (queryEnabled !== null) {
    return readBoolean(queryEnabled);
  }

  return false;
}

async function readBody(request: Request): Promise<BodyRecord> {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    const bodyText = await request.text();

    if (!bodyText.trim()) {
      return {};
    }

    if (contentType.includes("application/json")) {
      const body = JSON.parse(bodyText) as unknown;

      return isRecord(body) ? body : {};
    }

    return Object.fromEntries(new URLSearchParams(bodyText));
  } catch {
    return {};
  }
}

async function readInput(request: Request): Promise<ChatAnalysisOptInInput> {
  const searchParams = new URL(request.url).searchParams;
  const body = await readBody(request);
  const enabled = readEnabled(body, searchParams);

  return {
    conversationId: searchParams.get("conversationId"),
    enabled,
    scenario: searchParams.get("scenario") ?? String(body.scenario ?? ""),
  };
}

function responseForResult(
  result: ChatPrivacyControlsResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = chatPrivacyControlsFailureToAppError(result);

    return NextResponse.json(
      failure(appError, chatPrivacyControlsFailureContext(result, mode)),
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
}

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const service = createChatPrivacyControlsService();
  const result = service.setAnalysisOptIn(await readInput(request));

  return responseForResult(result, mode);
}
