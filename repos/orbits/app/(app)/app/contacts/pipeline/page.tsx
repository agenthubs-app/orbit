/**
 * 联系人导入 pipeline 页 route adapter。
 *
 * 这里只连接 live-capable contacts route model 和 pipeline UI，草稿处理逻辑留在联系人组件层。
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
import { OrbitRealCardsPipeline } from "../orbit-real-contacts";

interface AppContactsPipelinePageProps {
  searchParams?: Promise<AppContactsSearchParams>;
}

export default async function AppContactsPipelinePage({
  searchParams,
}: AppContactsPipelinePageProps = {}) {
  const routeModel = await loadAppContactsRouteViewModel(await searchParams);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-contacts-pipeline-route">
          <OrbitRealCardsPipeline
            viewModel={contactsRouteToOrbitContactsViewModel(routeModel.payload)}
          />
        </div>
      ) : (
        <ContactsSubrouteStateBoundary
          marker="app-contacts-pipeline-route"
          routeModel={routeModel}
        />
      )}
    </>
  );
}
