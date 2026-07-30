/** Legacy invite-code adapter into the canonical event registration workspace. */
import { redirect } from "next/navigation";
import { StateView } from "../../../../shared/ui/state-view";
import {
  loadAppRegisterRouteViewModel,
  type AppRegisterRouteStateViewModel,
  type AppRegisterSearchParams,
} from "./compose-app-register-from-previously-approved-mock-first-capabilities/register-route-view-model";

function RegisterRouteStateBoundary({
  routeState,
}: {
  routeState: AppRegisterRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-register-route-state">
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

export default async function AppRegisterPage({
  searchParams,
}: {
  searchParams: Promise<AppRegisterSearchParams>;
}) {
  const query = await searchParams;
  const routeModel = await loadAppRegisterRouteViewModel({
    code: Array.isArray(query.code) ? query.code[0] : query.code,
  });

  if (routeModel.state === "success") {
    const destination = new URLSearchParams();
    const language = Array.isArray(query.language)
      ? query.language[0]
      : query.language;

    if (language) destination.set("language", language);

    const suffix = destination.size > 0 ? `?${destination.toString()}` : "";
    redirect(
      `/app/events/${encodeURIComponent(routeModel.register.event.id)}/register${suffix}#`,
    );
  }

  return <RegisterRouteStateBoundary routeState={routeModel.routeState} />;
}
