/**
 * 个人 Home hub 页 route adapter。
 *
 * 负责组合 live-capable route payload，实际 hub 布局由 `OrbitRealHome` 渲染。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { presentOrbitEvents } from "../orbit-event-presentation";
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import {
  HomeRouteStateBoundary,
  loadAppHomeRouteViewModel,
} from "./compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import { OrbitRealHome } from "./orbit-real-home";

export default async function AppPersonalHomePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fhome");
  }

  const routeModel = await loadAppHomeRouteViewModel(undefined, {
    displayName:
      session.user.name?.trim() ||
      session.user.email?.trim() ||
      "Orbit member",
    email: session.user.email,
    id: session.user.id,
  });
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
            viewModel={localizeOrbitTree(
              {
                ...routeModel.home,
                events: presentOrbitEvents(routeModel.home.events, language ?? "zh"),
              },
              language ?? "zh",
            )}
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
