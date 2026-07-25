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
        actorId: session.user.id,
        accept: body.accept,
        now: new Date().toISOString(),
      });
    return NextResponse.json({ data: result }, { status: 200 });
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
          code: "MATCHMAKING_RESPONSE_FAILED",
          message: error instanceof Error ? error.message : "Request failed.",
        },
      },
      { status: 409 },
    );
  }
}
