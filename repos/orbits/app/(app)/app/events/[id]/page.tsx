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
import {
  loadRegistrationProfileGuideForCurrentTestUser,
  normalizeRegistrationProfileGuideLanguage,
  type RegistrationProfileGuide,
} from "../../../../../features/events/registration-profile-guide";
import { StateView } from "../../../../../shared/ui/state-view";
import {
  eventDetailRouteToOrbitLandingEventView,
  eventDetailRouteToRelationshipContextView,
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
import { eventRegistrationRuntimeService } from "../../../../../features/events/registration/runtime";
import { getOrbitLandingViewModel } from "../../orbit-landing-route-view-model";
import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";

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
  registrationGuide,
  routeModel,
}: {
  eventId: string;
  registrationGuide: RegistrationProfileGuide | null;
  routeModel: AppEventDetailBoundaryModel;
}) {
  const currentEventHref = `/app/events/${encodeURIComponent(eventId)}`;

  if (registrationGuide) {
    return (
      <main
        className="orbit-page"
        data-orbit-real-page="event-detail"
        style={{ background: "var(--bg)", minHeight: "100dvh", padding: 24 }}
      >
        <RegistrationGuideFallbackSummary
          guide={registrationGuide}
          routeModel={routeModel}
        />
        <div style={{ margin: "18px auto 0", maxWidth: 960 }}>
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
        </div>
      </main>
    );
  }

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
      {registrationGuide ? (
        <RegistrationProfileGuidePreview guide={registrationGuide} />
      ) : null}
    </main>
  );
}

function registrationGuideHref(guide: RegistrationProfileGuide): string {
  return `/app/events/${encodeURIComponent(guide.event.id)}/register?language=${guide.languagePreference}`;
}

function RegistrationGuideFallbackSummary({
  guide,
  routeModel,
}: {
  guide: RegistrationProfileGuide;
  routeModel: AppEventDetailBoundaryModel;
}) {
  const isEnglish = guide.languagePreference === "en";

  return (
    <section
      data-orbit-registration-profile-guide-entry="fallback-summary"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        boxShadow: "var(--sh-sm)",
        display: "grid",
        gap: 16,
        margin: "0 auto",
        maxWidth: 960,
        padding: 20,
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <p
          style={{
            color: "var(--accent)",
            fontSize: 12,
            fontWeight: 750,
            letterSpacing: "0.08em",
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          {isEnglish
            ? "Registration profile guide is still available"
            : "报名资料引导仍可继续"}
        </p>
        <h1
          style={{
            color: "var(--ink)",
            fontSize: "2.4rem",
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          {guide.event.title}
        </h1>
        <p
          style={{
            color: "var(--text-2)",
            fontSize: 15,
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          {isEnglish
            ? "The full event workspace is degraded, but this known registerable event still has deterministic profile questions you can review locally."
            : "完整活动工作区暂时降级，但这个已知可报名活动仍有确定的资料问题，可以先在本地查看。"}
        </p>
      </div>
      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
        }}
      >
        {[
          [isEnglish ? "Venue" : "地点", guide.event.venue],
          [isEnglish ? "Topic" : "主题", guide.topic],
          [isEnglish ? "Attendees" : "目标受众", guide.targetAttendees],
          [
            isEnglish ? "Missing profile field" : "待补资料字段",
            guide.currentUser.missingFieldContext
              .map((field) => field.description)
              .join(" / "),
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              display: "grid",
              gap: 4,
              minWidth: 0,
              padding: 12,
            }}
          >
            <span
              style={{
                color: "var(--text-3)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {label}
            </span>
            <span
              style={{
                color: "var(--ink)",
                fontSize: 13.5,
                lineHeight: 1.45,
                overflowWrap: "anywhere",
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <a
          href={registrationGuideHref(guide)}
          style={{
            alignItems: "center",
            background: "var(--accent)",
            borderRadius: 12,
            color: "var(--on-dark)",
            display: "inline-flex",
            fontSize: 14,
            fontWeight: 750,
            justifyContent: "center",
            minHeight: 42,
            padding: "0 16px",
            textDecoration: "none",
          }}
        >
          {isEnglish
            ? "Continue registration profile guide"
            : "继续填写报名资料"}
        </a>
        <span style={{ color: "var(--text-3)", fontSize: 12.5 }}>
          {routeModel.title}
        </span>
      </div>
    </section>
  );
}

function RegistrationProfileGuidePreview({
  guide,
}: {
  guide: RegistrationProfileGuide;
}) {
  const isEnglish = guide.languagePreference === "en";
  const previewQuestions = guide.questions.slice(0, 3);
  const chipStyle = {
    height: "auto",
    lineHeight: 1.35,
    maxWidth: "100%",
    minHeight: 30,
    minWidth: 0,
    overflowWrap: "anywhere",
    paddingBottom: 6,
    paddingTop: 6,
    whiteSpace: "normal",
  } as const;

  return (
    <section
      data-orbit-registration-profile-guide="detail"
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        boxShadow: "var(--sh-sm)",
        display: "grid",
        gap: 14,
        margin: "18px auto 0",
        maxWidth: 960,
        padding: 18,
        width: "calc(100% - 32px)",
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <p
          style={{
            color: "var(--accent)",
            fontSize: 12,
            fontWeight: 750,
            letterSpacing: "0.08em",
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          {isEnglish ? "Registration profile" : "报名资料"}
        </p>
        <h2 className="h-section" style={{ color: "var(--ink)", margin: 0 }}>
          {isEnglish ? "Profile questions for this event" : "这场活动的资料问题"}
        </h2>
        <div style={{ color: "var(--ink)", fontSize: 15, fontWeight: 700 }}>
          {guide.event.title}
        </div>
        <p style={{ color: "var(--text-2)", fontSize: 14.5, lineHeight: 1.55, margin: 0 }}>
          {isEnglish
            ? "Answers are staged locally until you confirm them."
            : "回答会先留在本地，确认前不会写入资料。"}
        </p>
      </div>
      <div
        style={{
          color: "var(--text-3)",
          display: "flex",
          flexWrap: "wrap",
          fontSize: 12.5,
          gap: 8,
        }}
      >
        <span className="chip" style={chipStyle}>{guide.topic}</span>
        <span className="chip" style={chipStyle}>{guide.targetAttendees}</span>
        <span className="chip" style={chipStyle}>
          {isEnglish ? "Missing field" : "待补字段"}:{" "}
          {guide.currentUser.missingFieldContext
            .map((field) => field.description)
            .join(" / ")}
        </span>
      </div>
      <ol style={{ display: "grid", gap: 8, margin: 0, paddingLeft: 22 }}>
        {previewQuestions.map((question) => (
          <li
            key={question.id}
            style={{ color: "var(--text-2)", fontSize: 13.5, lineHeight: 1.45 }}
          >
            {question.prompt}
          </li>
        ))}
      </ol>
      <a
        href={registrationGuideHref(guide)}
        style={{
          alignItems: "center",
          background: "var(--accent)",
          borderRadius: 12,
          color: "var(--on-dark)",
          display: "inline-flex",
          fontSize: 14,
          fontWeight: 700,
          justifyContent: "center",
          maxWidth: "100%",
          minHeight: 42,
          padding: "0 16px",
          textDecoration: "none",
          textAlign: "center",
          whiteSpace: "normal",
          width: "fit-content",
        }}
      >
        {isEnglish
          ? "Continue registration profile guide"
          : "继续填写报名资料"}
      </a>
    </section>
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
  const language = normalizeRegistrationProfileGuideLanguage(
    readSearchParam(query, "language") ?? (await getEventDetailPageLanguage()),
  );
  const catalogueEvent =
    getOrbitLandingViewModel().events.find(
      (event) => event.id === id || event.code === id,
    ) ?? null;

  if (catalogueEvent) {
    const registration = session?.user?.id
      ? await eventRegistrationRuntimeService.get({
          eventId: catalogueEvent.id,
          userId: session.user.id,
        })
      : null;
    const registered = registration?.status === "rsvped";
    const presentedEvent = presentOrbitEvent(catalogueEvent, language);
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
      status,
      stats: {
        ...presentedEvent.stats,
        // Attendee names are omitted from the server payload until the current
        // account has an active registration for this exact event.
        attendees: registered ? presentedEvent.stats.attendees : [],
        authed: Boolean(session?.user?.id),
        youRsvped: registered,
      },
      youRsvped: registered,
    };

    return (
      <>
        <OrbitReferenceStyles />
        <OrbitRealEventDetail
          event={localizeOrbitTree(accessibleEvent, language)}
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
          registrationGuide={null}
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
  const registrationGuideResult =
    await loadRegistrationProfileGuideForCurrentTestUser({
      eventId: id,
      languagePreference: language,
      mode: routeMode,
    });
  const registrationGuide =
    registrationGuideResult.state === "success"
      ? registrationGuideResult.guide
      : null;

  // Only a few events have full seeded detail (roster/readiness/etc.). For the
  // rest, fall back to a basic detail built from the events-list data so every
  // listed event opens a normal page (like the UI branch) instead of the
  // "no event workspace" route-state boundary.
  const detailSuccess = routeModel.routeState === "success";
  const eventsListModel = detailSuccess
    ? null
    : await loadAppEventsRouteViewModel(undefined, session.user.id);
  const fallbackEvent =
    eventsListModel && eventsListModel.state === "success"
      ? eventsRouteToOrbitLandingViewModel(eventsListModel).events.find(
          (event) => event.id === id || event.code === id,
        ) ?? null
      : null;

  return (
    <>
      <OrbitReferenceStyles />
      {detailSuccess ? (
        <>
          <OrbitRealEventDetail
            event={localizeOrbitTree(
              presentOrbitEvent(
                eventDetailRouteToOrbitLandingEventView(routeModel),
                language,
              ),
              language,
            )}
          />
          {registrationGuide ? (
            <RegistrationProfileGuidePreview guide={registrationGuide} />
          ) : null}
        </>
      ) : fallbackEvent ? (
        <OrbitRealEventDetail
          event={localizeOrbitTree(
            presentOrbitEvent(fallbackEvent, language),
            language,
          )}
        />
      ) : (
        <EventDetailRouteStateView
          eventId={id}
          registrationGuide={registrationGuide}
          routeModel={routeModel}
        />
      )}
      <OrbitVisualFreezeRuntime />
    </>
  );
}
