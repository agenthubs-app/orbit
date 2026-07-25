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
    accept?: unknown;
  };
  if (typeof body.accept !== "boolean") {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "accept must be a boolean.",
        },
      },
      { status: 400 },
    );
  }
  try {
    const result =
      await createConfiguredEventMatchmakingService().respondToIntroduction({
        requestId: id,
        accept: body.accept,
        now: new Date().toISOString(),
      });
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "MATCHMAKING_RESPONSE_FAILED",
          message: error instanceof Error ? error.message : "Request failed.",
        },
      },
      { status: 409 },
    );
  }
}
