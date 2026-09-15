import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS,
  type AccountLanguagePreferenceService,
} from "../../../../features/account-language/contract";
import { createConfiguredAccountLanguagePreferenceService } from "../../../../features/account-language/service-factory";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

export interface AccountLanguagePreferenceRouteDependencies {
  createService?: () => AccountLanguagePreferenceService | null;
  resolveActor?: ResolveAuthenticatedApiActor;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function serviceUnavailable(mode: ReturnType<typeof resolveFeatureMode>): Response {
  const definition = ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS.LANGUAGE_PREFERENCE_STORE_UNCONFIGURED;
  return NextResponse.json(
    failure(new AppError(definition.appCode, definition.message)),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(definition.appCode),
    },
  );
}

function resultResponse(
  result: Awaited<ReturnType<AccountLanguagePreferenceService["read"]>>
    | Awaited<ReturnType<AccountLanguagePreferenceService["save"]>>,
  mode: ReturnType<typeof resolveFeatureMode>,
): Response {
  if (result.success === true) {
    return NextResponse.json(success(result.data), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  }
  return NextResponse.json(
    failure(new AppError(result.error.appCode, result.error.message)),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(result.error.appCode),
    },
  );
}

export function createAccountLanguagePreferenceRouteHandlers(
  dependencies: AccountLanguagePreferenceRouteDependencies = {},
) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const createService = dependencies.createService ?? createConfiguredAccountLanguagePreferenceService;
  return {
    async GET(_request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);
      const service = createService();
      if (!service) return serviceUnavailable(mode);
      return resultResponse(await service.read({ actorId: actor.id }), mode);
    },
    async PUT(request: Request): Promise<Response> {
      const mode = resolveFeatureMode();
      const actor = await resolveActor();
      if (!actor) return authenticatedApiActorRequiredResponse(mode);
      const service = createService();
      if (!service) return serviceUnavailable(mode);
      return resultResponse(await service.save({
        actorId: actor.id,
        input: await readBody(request),
      }), mode);
    },
  };
}
