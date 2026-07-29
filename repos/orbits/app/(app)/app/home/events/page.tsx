/**
 * 个人 Home 的 events 子页。
 *
 * 与 hub 页共用 live-capable Home route model，只通过 `mode="events"` 切换到活动视图。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../../orbit-language-server";
import { presentOrbitEvents } from "../../orbit-event-presentation";
import { auth } from "../../../../../auth";
import { redirect } from "next/navigation";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import {
  HomeRouteStateBoundary,
  loadAppHomeRouteViewModel,
} from "../compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model";
import { OrbitRealHome } from "../orbit-real-home";

export default async function AppPersonalHomeEventsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fhome%2Fevents");
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
        <div data-orbit-route="app-home-events-route">
          <OrbitRealHome
            mode="events"
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
          marker="app-home-events-route"
          routeState={routeModel.routeState}
        />
      )}
    </>
  );
}
