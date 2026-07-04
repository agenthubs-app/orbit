/**
 * 平台管理页 route adapter。
 *
 * 这里生成平台级 view model 并交给真实平台组件；route 本身不包含管理业务逻辑。
 */
import { StateView } from "../../../../shared/ui/state-view";
import {
  loadAppAdminPlatformRouteViewModel,
  type AppAdminPlatformRouteStateViewModel,
  type AppAdminPlatformSearchParams,
} from "../admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model";
import type { OrbitLanguage } from "../orbit-language-core";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealPlatform } from "./orbit-real-platform";

async function getPlatformPageLanguage(): Promise<OrbitLanguage> {
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

function PlatformRouteStateBoundary({
  routeState,
}: {
  routeState: AppAdminPlatformRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-platform-route-state">
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

export default async function PlatformPage({
  searchParams,
}: {
  searchParams?: Promise<AppAdminPlatformSearchParams>;
} = {}) {
  const routeModel = await loadAppAdminPlatformRouteViewModel({
    searchParams: await searchParams,
    surface: "platform",
  });
  const language =
    routeModel.state === "success" ? await getPlatformPageLanguage() : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-platform-route">
          <OrbitRealPlatform
            viewModel={localizeOrbitTree(routeModel.platform, language)}
          />
        </div>
      ) : (
        <PlatformRouteStateBoundary routeState={routeModel.routeState} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
