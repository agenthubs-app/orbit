import { NextResponse } from "next/server";

import {
  createConfiguredCanonicalPublicEventCatalogue,
} from "../../../../../features/events/core/public-catalogue-runtime";
import type {
  CanonicalPublicEventCatalogue,
} from "../../../../../features/events/core/public-catalogue";
import { canonicalPublicOrganizerLabel } from "../../../../../features/events/core/public-organizer-identity";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";

export interface PublicEventDetailContext {
  params: Promise<{ id: string }>;
}

export interface PublicEventDetailRouteDependencies {
  createCatalogue?: () => CanonicalPublicEventCatalogue | null;
}

function routeId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
 * `readRecordEntry` resolves Event Core IDs, public codes, registered aliases,
 * and the canonical owner used for the opaque public organizer identity. The
 * route intentionally adds no legacy identifier lookup.
 */
export function createPublicEventDetailGetHandler(
  dependencies: PublicEventDetailRouteDependencies = {},
) {
  return async function publicEventDetailGetHandler(
    _request: Request,
    context: PublicEventDetailContext,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    try {
      const catalogue = (
        dependencies.createCatalogue ?? createConfiguredCanonicalPublicEventCatalogue
      )();
      if (!catalogue) return unavailableResponse(mode);

      const { id } = await context.params;
      const entry = await catalogue.readRecordEntry(routeId(id));
      if (!entry) {
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
            ...entry.record,
            organizer: canonicalPublicOrganizerLabel(entry.organizerId),
          },
        }),
        {
          headers: runtimeBoundaryHeaders(mode),
          status: 200,
        },
      );
    } catch (cause) {
      // Never disclose Event Core internals or substitute fixture data when a
      // canonical read fails.
      return unavailableResponse(mode, cause);
    }
  };
}
