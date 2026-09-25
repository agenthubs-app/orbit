/**
 * 联系人列表页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable route payload 转成真实联系人 UI。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { StateView } from "../../../../shared/ui/state-view";
import {
  loadAppContactsRouteViewModel,
  type AppContactsRouteStateViewModel,
  type AppContactsSearchParams,
} from "./compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { contactsRouteToOrbitContactsViewModel } from "./compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter";
import { applyOrbitContactsPresentation } from "../orbit-contacts-presentation";
import { AccountTopNav } from "../orbit-account-shell";
import { NetworkAll } from "./network-0918/network-all";
import { NetworkCards } from "./network-0918/network-cards";
import { loadContactCardRoute } from "./contact-card-route-service";

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
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fcontacts");
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }

  const params = await searchParams;
  const cards = await loadContactCardRoute(params ?? {}, actor);
  if (cards) return <>
    <OrbitReferenceStyles /><OrbitVisualFreezeRuntime />
    <div data-orbit-real-page="network" data-orbit-route="app-contacts-route">
      <AccountTopNav active="cards" />
      {cards.state === "ready" ? <NetworkCards key={`${actor.id}:${cards.view.params}`} view={cards.view} />
        : <section role="alert"><p>{cards.message}</p><a href="/app/contacts">清除筛选并返回第一页 / First page</a></section>}
    </div>
  </>;
  const routeModel = await loadAppContactsRouteViewModel(
    params,
    actor.id,
  );
  const language =
    routeModel.state === "success" ? await getOrbitServerLanguage() : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        // 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。
        <div data-orbit-real-page="network" data-orbit-route="app-contacts-route">
          <AccountTopNav active="cards" />
          <NetworkAll
            viewModel={localizeOrbitTree(
              applyOrbitContactsPresentation(
                contactsRouteToOrbitContactsViewModel(routeModel),
                language ?? "zh",
              ),
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
