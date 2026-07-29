import { NextResponse } from "next/server";
import {
  publicEventCatalogueRecord,
  readPublicEventCatalogue,
} from "../../../../features/events/public-catalogue";
import { success, runtimeBoundaryHeaders } from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";

export const dynamic = "force-dynamic";

function publicEventCode(eventId: string): string {
  return eventId
    .replace(/^event_/u, "evt_")
    .replace(/[^a-z0-9]+/giu, "")
    .toUpperCase();
}

export async function GET(): Promise<Response> {
  const mode = resolveFeatureMode();
  const catalogue = readPublicEventCatalogue();
  const organizerName = "Orbit";
  const events = catalogue.events.map((event) => ({
    ...publicEventCatalogueRecord(event, catalogue.generatedAt),
    code: publicEventCode(event.id),
    organizer: organizerName,
  }));

  return NextResponse.json(
    success({
      events,
      generatedAt: catalogue.generatedAt,
      organizer: {
        name: organizerName,
      },
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    },
  );
}
