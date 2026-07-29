/**
 * 管理后台活动页 route adapter。
 *
 * 复用 admin view model，只把渲染目标切换到活动管理组件。
 */
import { StateView } from "../../../../../shared/ui/state-view";
import { auth } from "../../../../../auth";
import { redirect } from "next/navigation";
import type { OrbitLanguage } from "../../orbit-language-core";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import {
  loadAppAdminPlatformRouteViewModel,
  type AppAdminPlatformRouteStateViewModel,
} from "../compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model";
import { OrbitRealAdminEvents } from "../orbit-real-admin-events";

async function getAdminEventsPageLanguage(): Promise<OrbitLanguage> {
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

function AdminEventsRouteStateBoundary({
  routeState,
}: {
  routeState: AppAdminPlatformRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-admin-events-route-state">
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

export default async function AdminEventsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fadmin%2Fevents");
  }

  const routeModel = await loadAppAdminPlatformRouteViewModel({
    actor: {
      displayName:
        session.user.name?.trim() ||
        session.user.email?.trim() ||
        "Orbit admin",
      email: session.user.email,
      id: session.user.id,
    },
    surface: "admin",
  });
  const language =
    routeModel.state === "success" ? await getAdminEventsPageLanguage() : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-admin-events-route">
          <OrbitRealAdminEvents
            viewModel={localizeOrbitTree(routeModel.admin, language)}
          />
        </div>
      ) : (
        <AdminEventsRouteStateBoundary routeState={routeModel.routeState} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
