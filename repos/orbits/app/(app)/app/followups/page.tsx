/**
 * 跟进日程页 route adapter。
 *
 * route 只负责挂载样式/runtime，并把 live-capable route payload 转成真实日程 UI。
 */
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { StateView } from "../../../../shared/ui/state-view";
import {
  loadAppFollowupsRouteViewModel,
  type AppFollowupsRouteStateViewModel,
  type AppFollowupsSearchParams,
} from "./compose-app-followups-from-previously-approved-mock-first-capabilities/followups-route-view-model";
import { followupsRouteToOrbitScheduleViewModel } from "./compose-app-followups-from-previously-approved-mock-first-capabilities/followups-view-model-adapter";
import { OrbitRealSchedule } from "./orbit-real-schedule";

function FollowupsRouteStateBoundary({
  routeState,
}: {
  routeState: AppFollowupsRouteStateViewModel;
}) {
  return (
    <div data-orbit-route="app-followups-route-state">
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={Array.from(routeState.evidenceIds)}
        eyebrow="Follow-ups"
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={routeState.recoveryActions.map((action, index) => ({
          id: `followups-recovery-${index}`,
          label: action.label,
          recoveryCopy: routeState.copy.nextStep,
          href: action.href,
        }))}
        title={routeState.copy.title}
      />
    </div>
  );
}

export default async function AppFollowupsPage({
  searchParams,
}: {
  searchParams?: Promise<AppFollowupsSearchParams>;
} = {}) {
  const routeModel = await loadAppFollowupsRouteViewModel(await searchParams);
  const language =
    routeModel.state === "success" ? await getOrbitServerLanguage() : null;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {routeModel.state === "success" ? (
        <div data-orbit-route="app-followups-route">
          <OrbitRealSchedule
            viewModel={localizeOrbitTree(
              followupsRouteToOrbitScheduleViewModel(routeModel),
              language ?? "zh",
            )}
          />
        </div>
      ) : (
        <FollowupsRouteStateBoundary routeState={routeModel.routeState} />
      )}
    </>
  );
}
