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
import type { AppEventDetailBoundaryModel } from "../compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import { OrbitRealEventDetail } from "./orbit-real-event-detail";
import { presentOrbitEvent } from "../../orbit-event-presentation";
import { auth } from "../../../../../auth";
import { redirect } from "next/navigation";
import {
  resolveConfiguredCanonicalEventDetailView,
  type CanonicalEventDetailResolution,
} from "../../canonical-event-detail-view";

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
  let resolution: CanonicalEventDetailResolution;
  try {
    resolution = await resolveConfiguredCanonicalEventDetailView({
      actorId: session?.user?.id,
      routeId: id,
    });
  } catch {
    resolution = { state: "unavailable" } as const;
  }

  if (resolution.state === "authentication_required") {
    redirect(
      `/app/account/login?next=${encodeURIComponent(`/app/events/${id}`)}`,
    );
  }

  if (resolution.state === "unavailable") {
    return (
      <>
        <OrbitReferenceStyles />
        <EventDetailRouteStateView
          eventId={id}
          routeModel={{
            description: "Canonical Event Core is temporarily unavailable. No legacy event catalogue was used.",
            evidence: ["event-core-public-catalogue-unavailable"],
            nextStep: "Retry after the event service is restored.",
            recoveryActions: [{ href: `/app/events/${encodeURIComponent(id)}`, label: "Retry current event" }],
            routeState: "failure",
            title: "Event detail temporarily unavailable",
          }}
        />
        <OrbitVisualFreezeRuntime />
      </>
    );
  }

  if (resolution.state === "success") {
    const presentedEvent = presentOrbitEvent(
      resolution.event,
      language,
    );
    const accessibleEvent = {
      ...presentedEvent,
      stats: {
        ...presentedEvent.stats,
        // Attendee names are omitted from the server payload until the current
        // account has an active registration for this exact event.
        attendees: resolution.registered ? presentedEvent.stats.attendees : [],
        authed: Boolean(session?.user?.id),
        youRsvped: resolution.registered,
      },
      youRsvped: resolution.registered,
    };

    return (
      <>
        <OrbitReferenceStyles />
        <OrbitRealEventDetail
          event={localizeOrbitTree(accessibleEvent, language)}
          registrationAvailability={resolution.registrationAvailability}
          workspaceAvailable={resolution.workspaceAvailable}
        />
        <OrbitVisualFreezeRuntime />
      </>
    );
  }

  return (
    <>
      <OrbitReferenceStyles />
      <EventDetailRouteStateView
        eventId={id}
        routeModel={{
          description: "This event is not available to the authenticated account.",
          evidence: [
            resolution.state === "forbidden"
              ? "event-core-access-denied"
              : "event-core-event-not-found",
          ],
          nextStep: "Return to Events and choose an event available to this account.",
          recoveryActions: [{ href: "/app/events", label: "Return to events" }],
          routeState: "empty",
          title: "Event not found",
        }}
      />
      <OrbitVisualFreezeRuntime />
    </>
  );
}
