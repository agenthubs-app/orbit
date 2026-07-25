import { NextResponse } from "next/server";
import { createConfiguredEventMatchmakingService } from "../../../../../../../features/events/matchmaking/service";

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
        slots: proposedSlots,
        now: new Date().toISOString(),
      });
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
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
      slot: body.slot,
      now: new Date().toISOString(),
    });
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
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
