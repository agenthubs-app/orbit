/**
 * 组织者公开页 route adapter。
 *
 * 从动态 slug 读取组织者活动，交给公开页组件渲染。
 */
import { StateView } from "../../../../../shared/ui/state-view";
import type { OrbitLanguage } from "../../orbit-language-core";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { presentOrbitEvents } from "../../orbit-event-presentation";
import { OrbitRealOrganizerPublic } from "../orbit-real-organizer-public";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import {
  loadAppOrganizerPublicRouteViewModel,
  presentAppOrganizerPublicRouteState,
  type AppOrganizerPublicRouteStateViewModel,
} from "../compose-app-organizer-public-from-previously-approved-mock-first-capabilities/organizer-public-route-view-model";

async function getOrganizerPageLanguage(): Promise<OrbitLanguage> {
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

function OrganizerPublicRouteStateBoundary({
  routeState,
}: {
  routeState: AppOrganizerPublicRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-organizer-public-route-state">
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

export default async function AppOrganizerPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const routeModel = await loadAppOrganizerPublicRouteViewModel({
    slug,
  });
  const language = await getOrganizerPageLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-organizer-public-route">
          <OrbitRealOrganizerPublic
            language={language}
            viewModel={localizeOrbitTree(
              {
                ...routeModel.organizer,
                events: presentOrbitEvents(routeModel.organizer.events, language),
              },
              language,
            )}
          />
        </div>
      ) : (
        <OrganizerPublicRouteStateBoundary
          routeState={presentAppOrganizerPublicRouteState(
            routeModel.routeState,
            language,
          )}
        />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
