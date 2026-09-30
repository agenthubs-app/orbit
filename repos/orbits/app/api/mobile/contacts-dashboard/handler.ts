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
  mobileContactsDashboardDeclaresRoleCounts,
  mobileContactsDashboardRequestsAnalysisView,
} from "../../../../shared/api-schema/mobile-contacts-dashboard";
import {
  createConfiguredMobileContactsDashboardService,
  type MobileContactsDashboardService,
} from "../../../../features/mobile/contacts-dashboard-service";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

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

  return async function GET(request: Request): Promise<Response> {
    const mode = resolveMode();
    const actor = await resolveActor();

    if (!actor) {
      return authenticatedApiActorRequiredResponse(mode);
    }

    const searchParams = new URL(request.url).searchParams;
    const service = createService(mode);
    // Sprint 0117: the App computes every section on the device and asks only
    // for the AI report and its profile (?view=analysis).
    if (mobileContactsDashboardRequestsAnalysisView(searchParams) && service.getAnalysisOverview) {
      const overview = await service.getAnalysisOverview({ actorId: actor.id });
      if (overview.success === true) {
        return NextResponse.json(success(overview.data), { headers: runtimeBoundaryHeaders(mode), status: 200 });
      }
      const appError = new AppError("SERVICE_UNAVAILABLE", "The contacts analysis report is temporarily unavailable.");
      return NextResponse.json(
        failure(appError, { mobileContactsDashboardErrorCode: overview.error.code, mode, section: "analysis" }),
        { headers: runtimeBoundaryHeaders(mode), status: getHttpStatusForAppErrorCode(appError.code) },
      );
    }
    // Clients that do not declare roleCounts (App builds before 0121) keep the
    // original full contacts list, so their role ratios stay correct.
    const contactsScope = mobileContactsDashboardDeclaresRoleCounts(searchParams)
      ? "referenced"
      : "all";
    const result = await service.getDashboard({ actorId: actor.id, contactsScope });
    if (result.success === true) {
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
