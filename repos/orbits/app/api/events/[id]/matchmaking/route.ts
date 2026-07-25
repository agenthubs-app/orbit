import { NextResponse } from "next/server";

import { auth } from "../../../../../auth";
import { createEventMatchmakingContextService } from "../../../../../features/events/matchmaking/context-service";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

function unauthorized(): Response {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Sign in is required." } },
    { status: 401 },
  );
}

export async function GET(
  _request: Request,
  context: Context,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const { id } = await context.params;
  try {
    return NextResponse.json({
      data: await createEventMatchmakingContextService().view({
        eventId: id,
        actorId: session.user.id,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "EVENT_MATCHMAKING_FAILED",
          message:
            error instanceof Error ? error.message : "Matchmaking failed.",
        },
      },
      { status: 404 },
    );
  }
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as {
    targetParticipantId?: unknown;
  };
  if (
    typeof body.targetParticipantId !== "string" ||
    !body.targetParticipantId.trim()
  ) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "targetParticipantId is required.",
        },
      },
      { status: 400 },
    );
  }
  const { id } = await context.params;
  try {
    const service = createEventMatchmakingContextService();
    await service.createRequest({
      eventId: id,
      actorId: session.user.id,
      targetParticipantId: body.targetParticipantId,
      now: new Date().toISOString(),
    });
    return NextResponse.json(
      {
        data: await service.view({
          eventId: id,
          actorId: session.user.id,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "EVENT_MATCHMAKING_REQUEST_FAILED",
          message:
            error instanceof Error ? error.message : "Matchmaking failed.",
        },
      },
      { status: 409 },
    );
  }
}
