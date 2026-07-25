import { NextResponse } from "next/server";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../shared/errors/app-error";
import {
  normalizeOrbitAgentChatSessionSnapshot,
  type OrbitAgentChatSessionProvider,
} from "../../../../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { createOrbitAgentChatSessionProvider } from "../../../../../features/orbit-ai/storage/orbit-agent-chat-session-provider-factory";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  try {
    const body = (await request.json()) as unknown;

    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function responseForError(error: unknown, status?: number): Response {
  const appError =
    error instanceof AppError
      ? error
      : new AppError("INTERNAL_ERROR", "Unable to persist Orbit Agent chat sessions.", {
          cause: error,
        });

  return NextResponse.json(failure(appError), {
    headers: runtimeBoundaryHeaders(resolveFeatureMode()),
    status: status ?? getHttpStatusForAppErrorCode(appError.code),
  });
}

function sessionProvider(
  mode: ReturnType<typeof resolveFeatureMode>,
): OrbitAgentChatSessionProvider | null {
  return createOrbitAgentChatSessionProvider(mode);
}

export async function GET(): Promise<Response> {
  const mode = resolveFeatureMode();
  const provider = sessionProvider(mode);

  if (!provider) {
    return NextResponse.json(
      success({
        sessions: [],
        storage: { configured: false, persisted: false },
      }),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      },
    );
  }

  try {
    const sessions = await provider.listSessions();

    return NextResponse.json(
      success({
        sessions,
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

export async function POST(request: Request): Promise<Response> {
  const mode = resolveFeatureMode();
  const body = await readJsonBody(request);
  const session = normalizeOrbitAgentChatSessionSnapshot(
    isRecord(body.session) ? body.session : body,
  );

  if (!session) {
    return responseForError(
      new AppError(
        "VALIDATION_ERROR",
        "A valid Orbit Agent chat session is required.",
      ),
    );
  }

  const provider = sessionProvider(mode);

  if (!provider) {
    return NextResponse.json(
      success({
        session,
        storage: { configured: false, persisted: false },
      }),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      },
    );
  }

  try {
    const savedSession = await provider.upsertSession(session);

    return NextResponse.json(
      success({
        session: savedSession,
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
