/**
 * 平台管理页 route adapter。
 *
 * 这里生成平台级 view model 并交给真实平台组件；route 本身不包含管理业务逻辑。
 */
import { StateView } from "../../../../shared/ui/state-view";
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import {
  loadAppAdminPlatformRouteViewModel,
  type AppAdminPlatformRouteStateViewModel,
} from "../admin/compose-app-admin-platform-from-previously-approved-mock-first-capabilities/admin-platform-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";

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

export default async function PlatformPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fplatform");
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
    surface: "platform",
  });

  return (
    <>
      <OrbitReferenceStyles />
      <PlatformRouteStateBoundary routeState={routeModel.routeState} />
      <OrbitVisualFreezeRuntime />
    </>
  );
}
