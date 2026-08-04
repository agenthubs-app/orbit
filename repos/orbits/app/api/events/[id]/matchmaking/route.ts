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
  _request: Request,
  _context: Context,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  return NextResponse.json(
    {
      error: {
        code: "LEGACY_MATCHMAKING_READ_ONLY",
        message:
          "Legacy matchmaking writes are gone. Use event operations contact requests.",
      },
    },
    { status: 410 },
  );
}
