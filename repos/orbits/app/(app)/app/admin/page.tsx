/**
 * 管理后台首页 route adapter。
 *
 * 负责本地化 admin view model，并挂载管理员工作台组件。
 */
import { StateView } from "../../../../shared/ui/state-view";
import type { OrbitLanguage } from "../orbit-language-core";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  loadAppAdminPlatformRouteViewModel,
  type AppAdminPlatformRouteStateViewModel,
  type AppAdminPlatformSearchParams,
} from "./compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model";
import { OrbitRealAdminWorkspace } from "./orbit-real-admin";

async function getAdminPageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return "zh";
    }

    throw error;
  }
}

function AdminRouteStateBoundary({
  marker = "app-admin-route-state",
  routeState,
}: {
  marker?: string;
  routeState: AppAdminPlatformRouteStateViewModel;
}) {
  return (
    <div data-orbit-route={marker}>
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow={routeState.copy.eyebrow}
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={routeState.recoveryActions.map((action) => ({
          id: action.id,
          label: action.label,
          recoveryCopy: action.recoveryCopy,
          href: action.href,
        }))}
        title={routeState.copy.title}
      />
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<AppAdminPlatformSearchParams>;
} = {}) {
  const routeModel = await loadAppAdminPlatformRouteViewModel({
    searchParams: await searchParams,
    surface: "admin",
  });
  const language =
    routeModel.state === "success" ? await getAdminPageLanguage() : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-admin-route">
          <OrbitRealAdminWorkspace
            viewModel={localizeOrbitTree(routeModel.admin, language)}
          />
        </div>
      ) : (
        <AdminRouteStateBoundary routeState={routeModel.routeState} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
