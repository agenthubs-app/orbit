/**
 * 联系人关系图页 route adapter。
 *
 * 复用 live-capable contacts route model，图谱渲染和关系布局由 `OrbitRealCardsGraph` 负责。
 */
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import {
  ContactsSubrouteStateBoundary,
  contactsRouteToOrbitContactsViewModel,
} from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-subroute-route-adapter";
import {
  loadAppContactsRouteViewModel,
  type AppContactsSearchParams,
} from "../compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { OrbitRealCardsGraph } from "../orbit-real-contacts";
import { auth } from "../../../../../auth";
import { redirect } from "next/navigation";

interface AppContactsGraphPageProps {
  searchParams?: Promise<AppContactsSearchParams>;
}

export default async function AppContactsGraphPage({
  searchParams,
}: AppContactsGraphPageProps = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fcontacts%2Fgraph");
  }

  const routeModel = await loadAppContactsRouteViewModel(
    await searchParams,
    session.user.id,
  );

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-contacts-graph-route">
          <OrbitRealCardsGraph
            viewModel={contactsRouteToOrbitContactsViewModel(routeModel.payload)}
          />
        </div>
      ) : (
        <ContactsSubrouteStateBoundary
          marker="app-contacts-graph-route"
          routeModel={routeModel}
        />
      )}
    </>
  );
}
