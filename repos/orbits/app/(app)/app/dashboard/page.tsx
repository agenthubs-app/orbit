/**
 * Dashboard route adapter.
 *
 * The dashboard is a relationship-analysis surface. It must authenticate
 * before composing its aggregate, distribution, opportunity, and provenance
 * services; `/app/party` remains a separate event workspace.
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../auth";
import { StateView } from "../../../../shared/ui/state-view";
import {
  getOrbitServerLanguage,
  localizeOrbitTree,
} from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  loadAppDashboardRouteViewModel,
  type AppDashboardRouteStateViewModel,
  type AppDashboardSearchParams,
} from "./compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-route-view-model";
import { dashboardRouteToOrbitDashboardViewModel } from "./compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-view-model-adapter";
import { OrbitRealDashboard } from "./orbit-real-dashboard";

function DashboardRouteStateBoundary({
  routeState,
}: {
  routeState: AppDashboardRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-dashboard-route-state">
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow="Dashboard"
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={routeState.recoveryActions.map((action, index) => ({
          href: action.href,
          id: `dashboard-recovery-${index}`,
          label: action.label,
          recoveryCopy: routeState.copy.nextStep,
        }))}
        title={routeState.copy.title}
      />
    </div>
  );
}

export default async function AppDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<AppDashboardSearchParams>;
} = {}) {
  const session = await auth();
  const actorId = session?.user?.id;
  if (!actorId) {
    redirect("/app/account/login?next=%2Fapp%2Fdashboard");
  }

  const routeModel = await loadAppDashboardRouteViewModel(
    await searchParams,
    { actorId },
  );
  const language =
    routeModel.state === "success" ? await getOrbitServerLanguage() : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-dashboard-route">
          <OrbitRealDashboard
            viewModel={localizeOrbitTree(
              dashboardRouteToOrbitDashboardViewModel(routeModel),
              language ?? "zh",
            )}
          />
        </div>
      ) : (
        <DashboardRouteStateBoundary routeState={routeModel.routeState} />
      )}
    </>
  );
}
