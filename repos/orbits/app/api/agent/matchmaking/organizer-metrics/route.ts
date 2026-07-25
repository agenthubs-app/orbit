import { NextResponse } from "next/server";

import { auth } from "../../../../../auth";
import {
  createConfiguredEventMatchmakingService,
  MatchmakingAccessError,
} from "../../../../../features/events/matchmaking/service";

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in is required." } },
      { status: 401 },
    );
  }
  const eventId = new URL(request.url).searchParams.get("eventId")?.trim();
  if (!eventId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "eventId is required." } },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      data: await createConfiguredEventMatchmakingService().organizerMetrics({
        eventId,
        actorId: session.user.id,
      }),
    });
  } catch (error) {
    if (error instanceof MatchmakingAccessError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 403 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "MATCHMAKING_METRICS_FAILED",
          message: error instanceof Error ? error.message : "Request failed.",
        },
      },
      { status: 409 },
    );
  }
}
