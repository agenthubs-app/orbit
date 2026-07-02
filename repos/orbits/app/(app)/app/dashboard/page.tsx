/**
 * Dashboard 页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable dashboard payload 转成真实产品仪表盘。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { StateView } from "../../../../shared/ui/state-view";
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
          id: `dashboard-recovery-${index}`,
          label: action.label,
          recoveryCopy: routeState.copy.nextStep,
          href: action.href,
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
  const routeModel = await loadAppDashboardRouteViewModel(await searchParams);
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
