import { NextResponse } from "next/server";

import {
  createConfiguredCanonicalPublicEventCatalogue,
} from "../../../../../features/events/core/public-catalogue-runtime";
import type {
  CanonicalPublicEventCatalogue,
} from "../../../../../features/events/core/public-catalogue";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";

const PUBLIC_ORGANIZER_NAME = "Orbit";

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
 * `readRecord` resolves Event Core IDs, public codes, and registered aliases;
 * the route intentionally adds no legacy identifier lookup.
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
      const record = await catalogue.readRecord(routeId(id));
      if (!record) {
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
            ...record,
            organizer: PUBLIC_ORGANIZER_NAME,
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
