/**
 * 个人 Home hub 页 route adapter。
 *
 * 负责组合 live-capable route payload，实际 hub 布局由 `OrbitRealHome` 渲染。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  HomeRouteStateBoundary,
  loadAppHomeRouteViewModel,
  type AppHomeSearchParams,
} from "./compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import { OrbitRealHome } from "./orbit-real-home";

interface AppPersonalHomePageProps {
  searchParams?: Promise<AppHomeSearchParams>;
}

export default async function AppPersonalHomePage({
  searchParams,
}: AppPersonalHomePageProps = {}) {
  const routeModel = await loadAppHomeRouteViewModel(await searchParams);
  const language =
    routeModel.state === "success" ? await getOrbitServerLanguage() : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-home-route">
          <OrbitRealHome
            mode="hub"
            viewModel={localizeOrbitTree(routeModel.home, language ?? "zh")}
          />
        </div>
      ) : (
        <HomeRouteStateBoundary
          marker="app-home-route"
          routeState={routeModel.routeState}
        />
      )}
    </>
  );
}
