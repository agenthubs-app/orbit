import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../../shared/errors/app-error";
import { createOrbitAgentChatSessionProvider } from "../../../../../../features/orbit-ai/storage/orbit-agent-chat-session-provider-factory";

export const dynamic = "force-dynamic";

interface OrbitAgentChatSessionRouteContext {
  params: Promise<{
    id: string;
  }>;
}

function responseForError(error: unknown, status?: number): Response {
  const appError =
    error instanceof AppError
      ? error
      : new AppError("INTERNAL_ERROR", "Unable to read Orbit Agent chat session.", {
          cause: error,
        });

  return NextResponse.json(failure(appError), {
    headers: runtimeBoundaryHeaders(resolveFeatureMode()),
    status: status ?? getHttpStatusForAppErrorCode(appError.code),
  });
}

export async function GET(
  _request: Request,
  context: OrbitAgentChatSessionRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const provider = createOrbitAgentChatSessionProvider(mode);

  if (!provider) {
    return NextResponse.json(
      success({
        session: null,
        storage: { configured: false, persisted: false },
      }),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      },
    );
  }

  try {
    const session = await provider.getSession(id);

    if (!session) {
      return responseForError(
        new AppError("NOT_FOUND", "Orbit Agent chat session was not found."),
      );
    }

    return NextResponse.json(
      success({
        session,
        storage: { configured: true, persisted: true, source: provider.source },
      }),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      },
    );
  } catch (error) {
    return responseForError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: OrbitAgentChatSessionRouteContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const provider = createOrbitAgentChatSessionProvider(mode);

  if (!provider) {
    return NextResponse.json(
      success({
        deleted: false,
        storage: { configured: false, persisted: false },
      }),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      },
    );
  }

  try {
    const deleted = await provider.deleteSession(id);

    return NextResponse.json(
      success({
        deleted,
        storage: { configured: true, persisted: true, source: provider.source },
      }),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      },
    );
  } catch (error) {
    return responseForError(error);
  }
}
