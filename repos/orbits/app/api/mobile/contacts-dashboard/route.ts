import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import {
  resolveFeatureMode,
  type FeatureMode,
} from "../../../../shared/config/feature-mode";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../shared/errors/app-error";
import {
  createConfiguredMobileContactsDashboardService,
  type MobileContactsDashboardService,
} from "../../../../features/mobile/contacts-dashboard-service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

export const dynamic = "force-dynamic";

export interface MobileContactsDashboardRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  resolveMode?: () => FeatureMode;
  createService?: (mode: FeatureMode) => MobileContactsDashboardService;
}

export function createMobileContactsDashboardGetHandler(
  dependencies: MobileContactsDashboardRouteDependencies = {},
) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const resolveMode = dependencies.resolveMode ?? resolveFeatureMode;
  const createService =
    dependencies.createService ?? createConfiguredMobileContactsDashboardService;

  return async function GET(_request: Request): Promise<Response> {
    const mode = resolveMode();
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const result = await createService(mode).getDashboard({ actorId: actor.id });
    if (result.success) {
      return NextResponse.json(success(result.data), {
        headers: runtimeBoundaryHeaders(mode),
        status: 200,
      });
    }

    const contractMismatch =
      result.error.code === "MOBILE_CONTACTS_DASHBOARD_CONTRACT_MISMATCH";
    const appError = contractMismatch
      ? new AppError("INTERNAL_ERROR", "The mobile dashboard contract is invalid.")
      : new AppError(
          "SERVICE_UNAVAILABLE",
          "The mobile contacts dashboard is temporarily unavailable.",
        );

    return NextResponse.json(
      failure(appError, {
        mobileContactsDashboardErrorCode: result.error.code,
        mode,
        section: result.error.section,
      }),
      {
        headers: runtimeBoundaryHeaders(mode),
        status: getHttpStatusForAppErrorCode(appError.code),
      },
    );
  };
}

export const GET = createMobileContactsDashboardGetHandler();
