import { NextResponse } from "next/server";

import {
  createConfiguredCanonicalPublicEventCatalogue,
} from "../../../../features/events/core/public-catalogue-runtime";
import type {
  CanonicalPublicEventCatalogue,
} from "../../../../features/events/core/public-catalogue";
import { canonicalPublicOrganizerLabel } from "../../../../features/events/core/public-organizer-identity";
import { failure, runtimeBoundaryHeaders, success } from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { AppError } from "../../../../shared/errors/app-error";

export interface PublicEventsRouteDependencies {
  createCatalogue?: () => CanonicalPublicEventCatalogue | null;
}

function unavailableResponse(mode: ReturnType<typeof resolveFeatureMode>, cause?: unknown): Response {
  return NextResponse.json(
    failure(
      new AppError(
        "SERVICE_UNAVAILABLE",
        "Canonical public event catalogue is temporarily unavailable.",
        { cause },
      ),
    ),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: 503,
    },
  );
}

/** Reads the API-compatible records in one canonical batch. */
export function createPublicEventsGetHandler(
  dependencies: PublicEventsRouteDependencies = {},
) {
  return async function publicEventsGetHandler(): Promise<Response> {
    const mode = resolveFeatureMode();
    try {
      const catalogue = (
        dependencies.createCatalogue ?? createConfiguredCanonicalPublicEventCatalogue
      )();
      if (!catalogue) return unavailableResponse(mode);

      const snapshot = await catalogue.readRecords();
      const events = snapshot.records.map((record) => {
        const code = snapshot.publicCodes[record.id];
        const organizerId = snapshot.organizerIds[record.id];
        if (
          typeof code !== "string" ||
          !code.trim() ||
          typeof organizerId !== "string" ||
          !organizerId.trim()
        ) {
          throw new Error(
            "Canonical public catalogue snapshot is inconsistent.",
          );
        }
        return Object.freeze({
          ...record,
          code,
          organizer: canonicalPublicOrganizerLabel(organizerId),
        });
      });

      return NextResponse.json(
        success({
          events,
          generatedAt: snapshot.generatedAt,
          organizer: null,
        }),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: 200,
        },
      );
    } catch (cause) {
      // A malformed or unavailable Event Core is never substituted with the
      // legacy fixture catalogue. Keep its details outside the public envelope.
      return unavailableResponse(mode, cause);
    }
  };
}
