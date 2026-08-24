import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { StateView } from "../../../../../shared/ui/state-view";
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { applyOrbitContactsPresentation } from "../../orbit-contacts-presentation";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import {
  loadAppContactsRouteViewModel,
  type AppContactsRouteStateViewModel,
} from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { contactsRouteToOrbitContactsViewModel } from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";
import { OrbitRealCardsDashboard } from "../orbit-real-cards-dashboard";

function DashboardRouteState({
  routeState,
}: {
  routeState: AppContactsRouteStateViewModel;
}) {
  return (
    <StateView
      description={routeState.copy.description}
      emptyState={routeState.copy.emptyState}
      evidence={Array.from(routeState.evidenceIds)}
      eyebrow={routeState.copy.eyebrow}
      guardrail={routeState.copy.guardrail}
      nextStep={routeState.copy.nextStep}
      purpose={routeState.copy.purpose}
      recoveryActions={routeState.recoveryActions.map((action, index) => ({
        href: action.href,
        id: `contacts-dashboard-recovery-${index}`,
        label: action.label,
        recoveryCopy: routeState.copy.nextStep,
      }))}
      title={routeState.copy.title}
    />
  );
}

export default async function AppContactsDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fcontacts%2Fdashboard");
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }

  const [language, routeModel] = await Promise.all([
    getOrbitServerLanguage(),
    loadAppContactsRouteViewModel(undefined, actor.id),
  ]);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <OrbitRealCardsDashboard
          viewModel={localizeOrbitTree(
            applyOrbitContactsPresentation(
              contactsRouteToOrbitContactsViewModel(routeModel),
              language,
            ),
            language,
          )}
        />
      ) : (
        <DashboardRouteState
          routeState={
            routeModel.state === "route-state"
              ? routeModel.routeState
              : {
                  copy: routeModel.failure,
                  evidenceIds: routeModel.failure.evidenceIds,
                  recoveryActions: [
                    { href: "/app/contacts/dashboard", label: "Reload dashboard" },
                  ],
                  scenario: "failure",
                }
          }
        />
      )}
    </>
  );
}
