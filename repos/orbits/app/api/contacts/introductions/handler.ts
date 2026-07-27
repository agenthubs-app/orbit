import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
  toAppError,
} from "../../../../shared/errors/app-error";
import {
  createConfiguredContactIntroductionRepository,
  isContactIntroductionInput,
  type ContactIntroductionRepository,
} from "../../../../features/contacts/introduction-records";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

interface IntroductionHandlerDependencies {
  repository?: ContactIntroductionRepository | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

function errorResponse(error: unknown): Response {
  const mode = resolveFeatureMode();
  const appError = toAppError(error);

  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      mode,
      privacy: "actor-scoped-contact-introductions",
      provenance: "Contact introduction repository",
      service: "contact-introductions",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
}

function repositoryOrThrow(
  repository: ContactIntroductionRepository | null | undefined,
): ContactIntroductionRepository {
  const resolved =
    repository === undefined
      ? createConfiguredContactIntroductionRepository()
      : repository;

  if (!resolved) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Contact introduction storage is not configured.",
    );
  }

  return resolved;
}

export function createContactIntroductionsGetHandler(
  dependencies: IntroductionHandlerDependencies = {},
) {
  return async function GET(): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (
      dependencies.resolveActor ?? resolveAuthenticatedApiActor
    )();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    try {
      const introductions = await repositoryOrThrow(
        dependencies.repository,
      ).list(actor.id);
      return NextResponse.json(success({ introductions }), {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function createContactIntroductionsPostHandler(
  dependencies: IntroductionHandlerDependencies = {},
) {
  return async function POST(request: Request): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await (
      dependencies.resolveActor ?? resolveAuthenticatedApiActor
    )();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);

    try {
      const body = (await request.json()) as unknown;
      if (!isContactIntroductionInput(body)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "A JSON introduction payload is required.",
        );
      }

      const introduction = await repositoryOrThrow(
        dependencies.repository,
      ).create(actor.id, body);
      return NextResponse.json(success({ introduction }), {
        headers: runtimeBoundaryHeaders(mode),
        status: 201,
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
