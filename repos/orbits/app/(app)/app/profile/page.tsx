import { redirect } from "next/navigation";

import { auth } from "../../../../auth";
import { StateView } from "../../../../shared/ui/state-view";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  loadAppProfileRouteViewModel,
  type AppProfileRouteStateViewModel,
  type AppProfileSearchParams,
} from "./compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { profileRouteToOrbitProfileViewModel } from "./compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";
import { OrbitRealProfile } from "./orbit-real-profile";

type ProfileRouteState =
  | AppProfileRouteStateViewModel
  | {
      copy: AppProfileRouteStateViewModel["copy"];
      evidenceIds: readonly string[];
      recoveryActions?: readonly AppProfileRouteStateViewModel["recoveryActions"][number][];
    };

function ProfileRouteStateBoundary({
  routeState,
}: {
  routeState: ProfileRouteState;
}) {
  return (
    <div data-orbit-route="app-profile-route-state">
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow={routeState.copy.eyebrow}
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={(routeState.recoveryActions ?? []).map((action) => ({
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

export default async function AppProfilePage({
  searchParams,
}: {
  searchParams?: Promise<AppProfileSearchParams>;
} = {}) {
  // 个人资料是登录后的页面:未登录跳登录页,带回跳地址。
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fprofile");
  }

  const routeModel = await loadAppProfileRouteViewModel(await searchParams, {
    displayName:
      session.user.name?.trim() ||
      session.user.email?.trim() ||
      "Orbit member",
    email: session.user.email,
    id: session.user.id,
  });
  const language =
    routeModel.state === "success" ? await getOrbitServerLanguage() : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <OrbitRealProfile
          viewModel={localizeOrbitTree(
            profileRouteToOrbitProfileViewModel(routeModel),
            language ?? "zh",
          )}
        />
      ) : (
        <ProfileRouteStateBoundary
          routeState={
            routeModel.state === "route-state"
              ? routeModel.routeState
              : {
                  copy: routeModel.failure,
                  evidenceIds: routeModel.failure.evidenceIds,
                }
          }
        />
      )}
    </>
  );
}
