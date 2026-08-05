import { NextResponse } from "next/server";

import {
  createConfiguredCanonicalPublicEventCatalogue,
} from "../../../../features/events/core/public-catalogue-runtime";
import type {
  CanonicalPublicEventCatalogue,
} from "../../../../features/events/core/public-catalogue";
import { failure, runtimeBoundaryHeaders, success } from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { AppError } from "../../../../shared/errors/app-error";

const PUBLIC_ORGANIZER_NAME = "Orbit";

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

/**
 * The list deliberately materializes each record through `readRecord`, so
 * its event fields retain the existing public API shape while every value
 * remains sourced from the canonical Event Core catalogue.
 */
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

      const snapshot = await catalogue.read();
      const events = await Promise.all(
        snapshot.events.map(async (event) => {
          const record = await catalogue.readRecord(event.id);
          const code = snapshot.publicCodes[event.id];
          if (
            !record ||
            record.id !== event.id ||
            typeof code !== "string" ||
            !code.trim()
          ) {
            throw new Error("Canonical public catalogue snapshot is inconsistent.");
          }
          return Object.freeze({
            ...record,
            code,
            organizer: PUBLIC_ORGANIZER_NAME,
          });
        }),
      );

      return NextResponse.json(
        success({
          events,
          generatedAt: snapshot.generatedAt,
          organizer: { name: PUBLIC_ORGANIZER_NAME },
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
