import { NextResponse } from "next/server";

import { createConfiguredEventMatchmakingService } from "../../../../../../../features/events/matchmaking/service";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
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
        outcome: body.outcome,
        now: new Date().toISOString(),
      }),
    });
  } catch (error) {
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
