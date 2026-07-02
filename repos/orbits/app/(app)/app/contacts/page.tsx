/**
 * 联系人列表页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable route payload 转成真实联系人 UI。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { StateView } from "../../../../shared/ui/state-view";
import {
  loadAppContactsRouteViewModel,
  type AppContactsRouteStateViewModel,
  type AppContactsSearchParams,
} from "./compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { contactsRouteToOrbitContactsViewModel } from "./compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";
import { OrbitRealCardsList } from "./orbit-real-contacts";

type ContactsRouteState =
  | AppContactsRouteStateViewModel
  | {
      copy: AppContactsRouteStateViewModel["copy"];
      evidenceIds: readonly string[];
      recoveryActions?: readonly { href: string; label: string }[];
    };

function ContactsRouteStateBoundary({
  routeState,
}: {
  routeState: ContactsRouteState;
}) {
  return (
    <div data-orbit-route="app-contacts-route-state">
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow={routeState.copy.eyebrow}
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={(routeState.recoveryActions ?? []).map(
          (action, index) => ({
            id: `contacts-recovery-${index}`,
            label: action.label,
            recoveryCopy: routeState.copy.nextStep,
            href: action.href,
          }),
        )}
        title={routeState.copy.title}
      />
    </div>
  );
}

export default async function AppContactsPage({
  searchParams,
}: {
  searchParams?: Promise<AppContactsSearchParams>;
} = {}) {
  const routeModel = await loadAppContactsRouteViewModel(await searchParams);
  const language =
    routeModel.state === "success" ? await getOrbitServerLanguage() : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-contacts-route">
          <OrbitRealCardsList
            viewModel={localizeOrbitTree(
              contactsRouteToOrbitContactsViewModel(routeModel),
              language ?? "zh",
            )}
          />
        </div>
      ) : (
        <ContactsRouteStateBoundary
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
