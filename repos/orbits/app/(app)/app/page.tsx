/**
 * `/app` 的入口页。
 *
 * 这是登录后网页端的主页入口，和 `/app/home` 共用 live-capable Home route model。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "./orbit-language-server";
import { OrbitReferenceStyles } from "./orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "./orbit-visual-freeze-runtime";
import {
  HomeRouteStateBoundary,
  loadAppHomeRouteViewModel,
  type AppHomeSearchParams,
} from "./home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import { OrbitRealHome } from "./home/orbit-real-home";

interface AppHomePageProps {
  searchParams?: Promise<AppHomeSearchParams>;
}

export default async function AppHomePage({
  searchParams,
}: AppHomePageProps = {}) {
  const routeModel = await loadAppHomeRouteViewModel(await searchParams);
  const language =
    routeModel.state === "success" ? await getOrbitServerLanguage() : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-root-home-route">
          <OrbitRealHome
            mode="hub"
            viewModel={localizeOrbitTree(routeModel.home, language ?? "zh")}
          />
        </div>
      ) : (
        <HomeRouteStateBoundary
          marker="app-root-home-route"
          routeState={routeModel.routeState}
        />
      )}
    </>
  );
}
