import { NextResponse } from "next/server";

import { auth } from "../../../../../../../auth";
import {
  createConfiguredEventMatchmakingService,
  MatchmakingAccessError,
} from "../../../../../../../features/events/matchmaking/service";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in is required." } },
      { status: 401 },
    );
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    outcome?: unknown;
  };
  if (body.outcome !== "met" && body.outcome !== "followup_recorded") {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "outcome must be met or followup_recorded.",
        },
      },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      data: await createConfiguredEventMatchmakingService().recordOutcome({
        requestId: id,
        actorId: session.user.id,
        outcome: body.outcome,
        now: new Date().toISOString(),
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
          code: "MATCHMAKING_OUTCOME_FAILED",
          message:
            error instanceof Error ? error.message : "Outcome update failed.",
        },
      },
      { status: 409 },
    );
  }
}
