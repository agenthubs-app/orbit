/**
 * Party check-in 页 route adapter。
 *
 * 这是现场签到 UI 的入口，route 负责 live-capable party context，
 * 组件只渲染签到交互。
 */
import { StateView } from "../../../../../shared/ui/state-view";
import { OrbitRealPartyCheckin } from "../../dashboard/orbit-real-party";
import type { OrbitLanguage } from "../../orbit-language-core";
import {
  getOrbitServerLanguage,
  localizeOrbitTree,
} from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import {
  loadAppPartyRouteViewModel,
  type AppPartyRouteStateViewModel,
  type AppPartySearchParams,
} from "../compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model";

async function getPartyCheckinPageLanguage(): Promise<OrbitLanguage> {
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

function PartyCheckinRouteStateBoundary({
  routeState,
}: {
  routeState: AppPartyRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-party-checkin-route-state">
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

export default async function AppPartyCheckinPage({
  searchParams,
}: {
  searchParams?: Promise<AppPartySearchParams>;
} = {}) {
  const routeModel = await loadAppPartyRouteViewModel({
    searchParams: await searchParams,
  });
  const language =
    routeModel.state === "success" ? await getPartyCheckinPageLanguage() : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-party-checkin-route">
          <OrbitRealPartyCheckin
            viewModel={localizeOrbitTree(routeModel.party, language)}
          />
        </div>
      ) : (
        <PartyCheckinRouteStateBoundary routeState={routeModel.routeState} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
