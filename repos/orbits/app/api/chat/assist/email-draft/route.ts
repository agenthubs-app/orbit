import { NextResponse } from "next/server";

import { resolveAuthenticatedApiActor } from "../../../_shared/authenticated-actor";
import { createAiEmailDraftService } from "../../../../../features/chat/ai-email-draft-service";

export const dynamic = "force-dynamic";

function readString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

export async function POST(request: Request): Promise<Response> {
  const actor = await resolveAuthenticatedApiActor();

  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ACTOR_REQUIRED",
          message: "Sign in before generating an AI email draft.",
        },
      },
      { status: 401 },
    );
  }

  let body: Record<string, unknown> = {};

  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid JSON is handled as an empty request and fails closed in the service.
  }

  const result = await createAiEmailDraftService().createDraft({
    actorId: actor.id,
    contactId: readString(body.contactId),
    language: readString(body.language),
    organization: readString(body.organization),
    purpose: readString(body.purpose),
    recipientName: readString(body.recipientName),
  });
  const status =
    result.success === true
      ? 200
      : result.error.code === "CONTACT_NOT_FOUND"
        ? 404
        : 422;

  return NextResponse.json(result, {
    status,
  });
}
