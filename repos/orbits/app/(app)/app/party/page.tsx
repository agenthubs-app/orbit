/**
 * Party 体验页 route adapter。
 *
 * route 只连接 party view model 和真实 party UI，现场交互逻辑不写在这里。
 */
import { StateView } from "../../../../shared/ui/state-view";
import { OrbitRealParty } from "../dashboard/orbit-real-party";
import type { OrbitLanguage } from "../orbit-language-core";
import {
  getOrbitServerLanguage,
  localizeOrbitTree,
} from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  loadAppPartyRouteViewModel,
  type AppPartyRouteStateViewModel,
  type AppPartySearchParams,
} from "./compose-app-party-from-previously-approved-mock-first-capabilities/party-route-view-model";

async function getPartyPageLanguage(): Promise<OrbitLanguage> {
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

function PartyRouteStateBoundary({
  marker = "app-party-route-state",
  routeState,
}: {
  marker?: string;
  routeState: AppPartyRouteStateViewModel;
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

export default async function AppPartyRoutePage({
  searchParams,
}: {
  searchParams?: Promise<AppPartySearchParams>;
} = {}) {
  const routeModel = await loadAppPartyRouteViewModel({
    searchParams: await searchParams,
  });
  const language =
    routeModel.state === "success" ? await getPartyPageLanguage() : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-party-route">
          <OrbitRealParty
            viewModel={localizeOrbitTree(routeModel.party, language)}
          />
        </div>
      ) : (
        <PartyRouteStateBoundary routeState={routeModel.routeState} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
