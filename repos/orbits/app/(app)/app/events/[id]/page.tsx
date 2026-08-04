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
import {
  normalizeOrbitLanguage,
  type OrbitLanguage,
} from "../../orbit-language-core";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { StateView } from "../../../../../shared/ui/state-view";
import {
  eventDetailRouteToOrbitLandingEventView,
} from "../compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter";
import {
  loadAppEventDetailRoute,
  type AppEventDetailBoundaryModel,
} from "../compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import { OrbitRealEventDetail } from "./orbit-real-event-detail";
import { presentOrbitEvent } from "../../orbit-event-presentation";
import { loadAppEventsRouteViewModel } from "../compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { eventsRouteToOrbitLandingViewModel } from "../compose-app-events-from-previously-approved-mock-first-capabilities/events-view-model-adapter";
import { auth } from "../../../../../auth";
import { redirect } from "next/navigation";
import { createEventCrudAndImportService } from "../../../../../features/events/service-factory";
import { getOrbitLandingViewModel } from "../../orbit-landing-route-view-model";
import { getOrbitRegisteredEventViewModel } from "../../orbit-registered-event-route-view-model";
import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import { readEventOperationsCatalogueSummary } from "../../../../../features/events/event-operations/catalogue-summary";

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

function eventRouteId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
  eventId,
  routeModel,
}: {
  eventId: string;
  routeModel: AppEventDetailBoundaryModel;
}) {
  const currentEventHref = `/app/events/${encodeURIComponent(eventId)}`;

  return (
    <main
      className="orbit-page"
      data-orbit-real-page="event-detail"
      style={{ background: "var(--bg)", minHeight: "100dvh", padding: 24 }}
    >
      <h1
        style={{
          color: "var(--ink)",
          fontSize: "2.5rem",
          lineHeight: 1,
          margin: "0 auto 18px",
          maxWidth: 960,
        }}
      >
        {routeModel.title}
      </h1>
      <StateView
        description={routeModel.description}
        emptyState={routeModel.description}
        evidence={Array.from(routeModel.evidence)}
        eyebrow="Event detail"
        guardrail="No event detail, attendee roster, recommendations, readiness, want-connect, encounter-note, post-event review, notification, message, calendar, AI, or external provider work is executed from this failed route state."
        nextStep={routeModel.nextStep}
        recoveryActions={routeModel.recoveryActions.map((action, index) => ({
          href:
            action.label.toLowerCase().includes("retry") ||
            action.label.toLowerCase().includes("current")
              ? currentEventHref
              : action.href,
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
  const [{ id: routeId }, query, session] = await Promise.all([
    params,
    searchParams,
    auth(),
  ]);
  const id = eventRouteId(routeId);
  const language = normalizeOrbitLanguage(
    readSearchParam(query, "language") ?? (await getEventDetailPageLanguage()),
  );
  const catalogueEvent =
    getOrbitLandingViewModel().events.find(
      (event) => event.id === id || event.code === id,
    ) ?? null;

  if (catalogueEvent) {
    const [registeredEvent, operationSummary] = await Promise.all([
      session?.user?.id
        ? getOrbitRegisteredEventViewModel({
            actorId: session.user.id,
            eventId: catalogueEvent.id,
          })
        : Promise.resolve(null),
      readEventOperationsCatalogueSummary(catalogueEvent.id),
    ]);
    const registered = Boolean(registeredEvent);
    const presentedEvent = presentOrbitEvent(
      registeredEvent ?? catalogueEvent,
      language,
    );
    const startsAt = new Date(presentedEvent.startsAt).getTime();
    const endsAt = new Date(presentedEvent.endsAt).getTime();
    const now = Date.now();
    const status: OrbitLandingEventView["status"] =
      Number.isFinite(endsAt) && endsAt < now
        ? "ended"
        : Number.isFinite(startsAt) && startsAt <= now
          ? "active"
          : "upcoming";
    const accessibleEvent = {
      ...presentedEvent,
      participantCount:
        operationSummary?.activeRegistrationCount ??
        presentedEvent.participantCount,
      status,
      stats: {
        ...presentedEvent.stats,
        // Attendee names are omitted from the server payload until the current
        // account has an active registration for this exact event.
        attendees: registered ? presentedEvent.stats.attendees : [],
        authed: Boolean(session?.user?.id),
        count:
          operationSummary?.activeRegistrationCount ??
          presentedEvent.stats.count,
        youRsvped: registered,
      },
      youRsvped: registered,
    };

    return (
      <>
        <OrbitReferenceStyles />
        <OrbitRealEventDetail
          event={localizeOrbitTree(accessibleEvent, language)}
          workspaceAvailable={operationSummary !== null}
        />
        <OrbitVisualFreezeRuntime />
      </>
    );
  }

  if (!session?.user?.id) {
    redirect(
      `/app/account/login?next=${encodeURIComponent(`/app/events/${id}`)}`,
    );
  }

  const ownedEventResult = await createEventCrudAndImportService().getEvent({
    actorId: session.user.id,
    eventId: id,
  });

  if (ownedEventResult.success === false) {
    return (
      <>
        <OrbitReferenceStyles />
        <EventDetailRouteStateView
          eventId={id}
          routeModel={{
            description:
              "This event is not available to the authenticated account.",
            evidence: ownedEventResult.error.evidenceIds,
            nextStep: "Return to Events and choose an event owned by this account.",
            recoveryActions: [
              { href: "/app/events", label: "Return to events" },
            ],
            routeState: "empty",
            title: "Event not found",
          }}
        />
        <OrbitVisualFreezeRuntime />
      </>
    );
  }

  // Production route mode comes from server configuration. Query parameters
  // must not switch an authenticated account onto demo capability fixtures.
  const routeMode = undefined;
  const routeModel = await loadAppEventDetailRoute({
    actorId: session.user.id,
    eventId: id,
    mode: routeMode,
  });

  // Only a few events have full seeded detail (roster/readiness/etc.). For the
  // rest, fall back to a basic detail built from the events-list data so every
  // listed event opens a normal page (like the UI branch) instead of the
  // "no event workspace" route-state boundary.
  const detailSuccess = routeModel.routeState === "success";
  const eventsListModel = detailSuccess
    ? null
    : await loadAppEventsRouteViewModel(session.user.id);
  const fallbackEvent =
    eventsListModel && eventsListModel.state === "success"
      ? eventsRouteToOrbitLandingViewModel(eventsListModel).events.find(
          (event) => event.id === id || event.code === id,
        ) ?? null
      : null;

  return (
    <>
      <OrbitReferenceStyles />
      <div style={{ margin: "16px auto 0", maxWidth: 1120, padding: "0 20px" }}>
        <a
          className="btn btn-primary"
          href={`/app/events/${encodeURIComponent(id)}/operations`}
        >
          Open organizer operations
        </a>
      </div>
      {detailSuccess ? (
        <OrbitRealEventDetail
          event={localizeOrbitTree(
            presentOrbitEvent(
              eventDetailRouteToOrbitLandingEventView(routeModel),
              language,
            ),
            language,
          )}
        />
      ) : fallbackEvent ? (
        <OrbitRealEventDetail
          event={localizeOrbitTree(
            presentOrbitEvent(fallbackEvent, language),
            language,
          )}
        />
      ) : (
        <EventDetailRouteStateView eventId={id} routeModel={routeModel} />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
