/**
 * 个人 Home 的 events 子页。
 *
 * 与 hub 页共用 live-capable Home route model，只通过 `mode="events"` 切换到活动视图。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import {
  HomeRouteStateBoundary,
  loadAppHomeRouteViewModel,
  type AppHomeSearchParams,
} from "../compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import { OrbitRealHome } from "../orbit-real-home";

interface AppPersonalHomeEventsPageProps {
  searchParams?: Promise<AppHomeSearchParams>;
}

export default async function AppPersonalHomeEventsPage({
  searchParams,
}: AppPersonalHomeEventsPageProps = {}) {
  const routeModel = await loadAppHomeRouteViewModel(await searchParams);
  const language =
    routeModel.state === "success" ? await getOrbitServerLanguage() : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-home-events-route">
          <OrbitRealHome
            mode="events"
            viewModel={localizeOrbitTree(routeModel.home, language ?? "zh")}
          />
        </div>
      ) : (
        <HomeRouteStateBoundary
          marker="app-home-events-route"
          routeState={routeModel.routeState}
        />
      )}
    </>
  );
}
