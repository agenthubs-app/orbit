import { NextResponse } from "next/server";
import { auth } from "../../../../../../../auth";
import {
  createConfiguredEventMatchmakingService,
  MatchmakingAccessError,
} from "../../../../../../../features/events/matchmaking/service";

interface Context {
  params: Promise<{ id: string }>;
}

function slots(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .filter((item) => Number.isFinite(Date.parse(item)))
        .slice(0, 5)
    : [];
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
    slots?: unknown;
  };
  const proposedSlots = slots(body.slots);
  if (proposedSlots.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "At least one valid ISO time slot is required.",
        },
      },
      { status: 400 },
    );
  }
  try {
    const result =
      await createConfiguredEventMatchmakingService().proposeSlots({
        requestId: id,
        actorId: session.user.id,
        slots: proposedSlots,
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
          code: "MATCHMAKING_SLOTS_FAILED",
          message: error instanceof Error ? error.message : "Request failed.",
        },
      },
      { status: 409 },
    );
  }
}

export async function PATCH(
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
    slot?: unknown;
  };
  if (
    typeof body.slot !== "string" ||
    !Number.isFinite(Date.parse(body.slot))
  ) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "A valid proposed slot is required.",
        },
      },
      { status: 400 },
    );
  }
  try {
    const result = await createConfiguredEventMatchmakingService().selectSlot({
      requestId: id,
      actorId: session.user.id,
      slot: body.slot,
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
          code: "MATCHMAKING_SLOT_SELECTION_FAILED",
          message: error instanceof Error ? error.message : "Request failed.",
        },
      },
      { status: 409 },
    );
  }
}
