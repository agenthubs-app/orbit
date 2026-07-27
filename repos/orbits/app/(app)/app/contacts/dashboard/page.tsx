import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
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

  const [language, routeModel] = await Promise.all([
    getOrbitServerLanguage(),
    loadAppContactsRouteViewModel(undefined, session.user.id),
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
