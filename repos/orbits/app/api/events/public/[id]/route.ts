import { NextResponse } from "next/server";

import {
  publicEventCatalogueRecord,
  readPublicEventCatalogue,
} from "../../../../../features/events/public-catalogue";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";

export const dynamic = "force-dynamic";

interface PublicEventDetailContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: PublicEventDetailContext,
): Promise<Response> {
  const mode = resolveFeatureMode();
  const { id } = await context.params;
  const catalogue = readPublicEventCatalogue();
  const event = catalogue.events.find((candidate) => candidate.id === id);

  if (!event) {
    return NextResponse.json(
      failure(new AppError("NOT_FOUND", "Public event not found.")),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: 404,
      },
    );
  }

  return NextResponse.json(
    success({
      event: {
        ...publicEventCatalogueRecord(event, catalogue.generatedAt),
        organizer: "Orbit",
      },
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    },
  );
}
