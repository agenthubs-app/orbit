/**
 * 活动详情页 route adapter。
 *
 * 从动态路由参数读取 event id，并通过 route-level capability service
 * 组合活动详情、名单、推荐、readiness 和后续动作上下文。
 */
import {
  getOrbitServerLanguage,
  localizeOrbitTree,
} from "../../orbit-language-server";
import type { OrbitLanguage } from "../../orbit-language-core";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { StateView } from "../../../../../shared/ui/state-view";
import { eventDetailRouteToOrbitLandingEventView } from "../compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
import {
  loadAppEventDetailRoute,
  type AppEventDetailBoundaryModel,
} from "../compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import { OrbitRealEventDetail } from "./orbit-real-event-detail";

export type AppEventDetailPageSearchParams = Record<
  string,
  string | string[] | undefined
>;

function readSearchParam(
  searchParams: AppEventDetailPageSearchParams | undefined,
  key: string,
): string | undefined {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] : value;
}

async function getEventDetailPageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return "zh";
    }

    throw error;
  }
}

function EventDetailRouteStateView({
  routeModel,
}: {
  routeModel: AppEventDetailBoundaryModel;
}) {
  return (
    <main
      className="orbit-page"
      data-orbit-real-page="event-detail"
      style={{ background: "var(--bg)", minHeight: "100dvh", padding: 24 }}
    >
      <StateView
        description={routeModel.description}
        emptyState={routeModel.description}
        evidence={Array.from(routeModel.evidence)}
        eyebrow="Event detail"
        guardrail="No event detail, attendee roster, recommendations, readiness, want-connect, encounter-note, post-event review, notification, message, calendar, AI, or external provider work is executed from this failed route state."
        nextStep={routeModel.nextStep}
        recoveryActions={routeModel.recoveryActions.map((action, index) => ({
          href: action.href,
          id: `event-detail-recovery-${index}`,
          label: action.label,
          recoveryCopy: routeModel.nextStep,
        }))}
        title={routeModel.title}
      />
    </main>
  );
}

export default async function AppEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<AppEventDetailPageSearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const language = await getEventDetailPageLanguage();
  const routeModel = await loadAppEventDetailRoute({
    action: readSearchParam(query, "action"),
    eventId: id,
    mode: readSearchParam(query, "mode"),
    scenario: readSearchParam(query, "scenario"),
    targetContactId: readSearchParam(query, "targetContactId"),
  });

  return (
    <>
      <OrbitReferenceStyles />
      {routeModel.routeState === "success" ? (
        <OrbitRealEventDetail
          event={localizeOrbitTree(
            eventDetailRouteToOrbitLandingEventView(routeModel),
            language,
          )}
        />
      ) : (
        <EventDetailRouteStateView routeModel={routeModel} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
