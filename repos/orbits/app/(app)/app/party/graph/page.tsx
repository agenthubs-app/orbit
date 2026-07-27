/**
 * Party 关系图页 route adapter。
 *
 * 负责本地化 party view model，并把图谱视图交给 `OrbitRealPartyGraph`。
 */
import { StateView } from "../../../../../shared/ui/state-view";
import { OrbitRealPartyGraph } from "../../dashboard/orbit-real-party";
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

async function getPartyGraphPageLanguage(): Promise<OrbitLanguage> {
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

function PartyGraphRouteStateBoundary({
  routeState,
}: {
  routeState: AppPartyRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-party-graph-route-state">
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

export default async function AppPartyGraphPage({
  searchParams,
}: {
  searchParams?: Promise<AppPartySearchParams>;
} = {}) {
  const routeModel = await loadAppPartyRouteViewModel({
    searchParams: await searchParams,
  });
  const language =
    routeModel.state === "success" ? await getPartyGraphPageLanguage() : "zh";

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-party-graph-route">
          <OrbitRealPartyGraph
            viewModel={localizeOrbitTree(routeModel.party, language)}
          />
        </div>
      ) : (
        <PartyGraphRouteStateBoundary routeState={routeModel.routeState} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
