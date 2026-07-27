import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { StateView } from "../../../../shared/ui/state-view";
import {
  loadAppEventsRouteViewModel,
  type AppEventsRouteStateViewModel,
  type AppEventsSearchParams,
} from "./compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { eventsRouteToOrbitLandingViewModel } from "./compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter";
import { OrbitRealExploreClient } from "./orbit-real-explore-client";
import { applyOrbitEventPresentation } from "../orbit-event-presentation";
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";

interface AppEventsPageProps {
  searchParams?: Promise<AppEventsSearchParams>;
}

function EventsRouteStateBoundary({
  routeState,
}: {
  routeState: AppEventsRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-events-route-state">
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={routeState.evidence.map((item) => item.id)}
        eyebrow="Events"
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={routeState.recoveryActions.map((action, index) => ({
          id: `events-recovery-${index}`,
          label: action.label,
          recoveryCopy: routeState.copy.nextStep,
          href: action.href,
        }))}
        title={routeState.copy.title}
      />
    </div>
  );
}

export default async function AppEventsPage({
  searchParams,
}: AppEventsPageProps = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fevents");
  }

  const routeModel = await loadAppEventsRouteViewModel(
    await searchParams,
    session.user.id,
  );
  const language =
    routeModel.state === "success" ? await getOrbitServerLanguage() : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-events-route">
          <OrbitRealExploreClient
            viewModel={localizeOrbitTree(
              applyOrbitEventPresentation(
                eventsRouteToOrbitLandingViewModel(routeModel),
                language ?? "zh",
              ),
              language ?? "zh",
            )}
          />
        </div>
      ) : (
        <EventsRouteStateBoundary routeState={routeModel.routeState} />
      )}
    </>
  );
}
