/**
 * 介绍与引荐页 route adapter。
 *
 * 这里只把 live-capable contacts route model 接到 intros 视图，具体推荐/引荐 UI 在真实组件中。
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
import { OrbitRealCardsIntros } from "../orbit-real-contacts";

interface AppContactsIntrosPageProps {
  searchParams?: Promise<AppContactsSearchParams>;
}

export default async function AppContactsIntrosPage({
  searchParams,
}: AppContactsIntrosPageProps = {}) {
  const routeModel = await loadAppContactsRouteViewModel(await searchParams);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-contacts-intros-route">
          <OrbitRealCardsIntros
            viewModel={contactsRouteToOrbitContactsViewModel(routeModel.payload)}
          />
        </div>
      ) : (
        <ContactsSubrouteStateBoundary
          marker="app-contacts-intros-route"
          routeModel={routeModel}
        />
      )}
    </>
  );
}
