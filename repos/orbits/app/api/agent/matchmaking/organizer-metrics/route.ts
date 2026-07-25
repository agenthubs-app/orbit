import { NextResponse } from "next/server";

import { createConfiguredEventMatchmakingService } from "../../../../../features/events/matchmaking/service";

export async function GET(request: Request): Promise<Response> {
  const eventId = new URL(request.url).searchParams.get("eventId")?.trim();
  if (!eventId) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "eventId is required." } },
      { status: 400 },
    );
  }
  return NextResponse.json({
    data:
      await createConfiguredEventMatchmakingService().organizerMetrics(eventId),
  });
}
