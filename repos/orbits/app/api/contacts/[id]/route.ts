import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  contactDetailTagStatusFailureContext,
  contactDetailTagStatusFailureToAppError,
  type ContactDetailLastInteractionInput,
  type ContactDetailNoteInput,
  type ContactDetailTagStatusResult,
  type ContactDetailUpdateInput,
} from "../../../../features/contacts/detail-contract";
import { createContactDetailTagStatusService } from "../../../../features/contacts/service-factory";

export const dynamic = "force-dynamic";

interface ContactDetailRouteContext {
  params: Promise<{
    id: string;
  }>;
}

type PatchBody = {
  addTags?: readonly string[];
  lastInteraction?: ContactDetailLastInteractionInput;
  note?: ContactDetailNoteInput | string;
  removeTags?: readonly string[];
  scenario?: string;
  status?: string;
  tags?: readonly string[];
};

type PatchBodyResult =
  | {
      success: true;
      body: PatchBody;
    }
  | {
      success: false;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringList(value: unknown): readonly string[] | undefined {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readNote(value: unknown): ContactDetailNoteInput | string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value) || typeof value.body !== "string") {
    return undefined;
  }

  return {
    body: value.body,
    authorLabel:
      typeof value.authorLabel === "string" ? value.authorLabel : undefined,
  };
}

function readLastInteraction(
  value: unknown,
): ContactDetailLastInteractionInput | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    channel: typeof value.channel === "string" ? value.channel : undefined,
    occurredAt:
      typeof value.occurredAt === "string" ? value.occurredAt : undefined,
    summary: typeof value.summary === "string" ? value.summary : undefined,
  };
}

async function readPatchBody(request: Request): Promise<PatchBodyResult> {
  try {
    const body: unknown = await request.json();

    if (!isRecord(body)) {
      return {
        success: true,
        body: {},
      };
    }

    return {
      success: true,
      body: {
        addTags: readStringList(body.addTags ?? body.addTag),
        lastInteraction: readLastInteraction(body.lastInteraction),
        note: readNote(body.note),
        removeTags: readStringList(body.removeTags ?? body.removeTag),
        scenario:
          typeof body.scenario === "string" ? body.scenario : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        tags: readStringList(body.tags ?? body.tag),
      },
    };
  } catch {
    return {
      success: false,
    };
  }
}

function responseForResult(
  result: ContactDetailTagStatusResult,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === false) {
    const appError = contactDetailTagStatusFailureToAppError(result);

    return NextResponse.json(
      failure(appError, contactDetailTagStatusFailureContext(result, mode)),
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

export async function GET(
  request: Request,
  context: ContactDetailRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const scenario = new URL(request.url).searchParams.get("scenario");
  const contactDetailService = createContactDetailTagStatusService();
  const result = contactDetailService.getContactDetail({
    contactId: id,
    scenario,
  });

  return responseForResult(result, mode);
}

export async function PATCH(
  request: Request,
  context: ContactDetailRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const patchBody = await readPatchBody(request);
  const contactDetailService = createContactDetailTagStatusService();

  if (!patchBody.success) {
    return responseForResult(contactDetailService.invalidPatchBody(), mode);
  }

  const { body } = patchBody;
  const input: ContactDetailUpdateInput = {
    addTags: body.addTags,
    contactId: id,
    lastInteraction: body.lastInteraction,
    note: body.note,
    removeTags: body.removeTags,
    scenario: searchParams.get("scenario") ?? body.scenario,
    status: body.status,
    tags: body.tags,
  };
  const result = contactDetailService.updateContactDetail(input);

  return responseForResult(result, mode);
}
