import { auth } from "../../../../auth";
import { createConfiguredCanonicalPublicEventCatalogue } from "../../../../features/events/core/public-catalogue-runtime";
import {
  readRuntimeEventRegistrationStates,
} from "../../../../features/events/registration/runtime";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { applyOrbitEventPresentation } from "../orbit-event-presentation";
import {
  getOrbitLandingViewModelFromCatalogue,
  type OrbitLandingEventView,
} from "../orbit-landing-route-view-model";
import { AccountTopNav } from "../orbit-account-shell";
import { PublicTopNav } from "../orbit-public-shell";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { EventsList } from "./events-0918/events-list";

function publicListEvent(
  event: OrbitLandingEventView,
  authenticated: boolean,
  registered: boolean,
  canonicalParticipantCount: number | null,
): OrbitLandingEventView {
  const startsAt = new Date(event.startsAt).getTime();
  const endsAt = new Date(event.endsAt).getTime();
  const now = Date.now();
  const status: OrbitLandingEventView["status"] =
    Number.isFinite(endsAt) && endsAt < now
      ? "ended"
      : Number.isFinite(startsAt) && startsAt <= now
        ? "active"
        : "upcoming";

  return {
    ...event,
    // Enrolled events use canonical active memberships. Non-enrolled catalogue
    // items retain their source-backed public roster aggregate.
    participantCount: canonicalParticipantCount ?? event.participantCount,
    status,
    stats: {
      ...event.stats,
      count: canonicalParticipantCount ?? event.stats.count,
      // The catalogue may show a truthful aggregate count, but names are not
      // part of the public list payload.
      attendees: [],
      authed: authenticated,
      youRsvped: registered,
    },
    youRsvped: registered,
  };
}

export default async function AppEventsPage({
  searchParams,
}: {
  searchParams?: Promise<{ scope?: string | string[] }>;
}) {
  const [session, language, resolvedSearchParams] = await Promise.all([
    auth(),
    getOrbitServerLanguage(),
    searchParams ??
      Promise.resolve<{ scope?: string | string[] }>({}),
  ]);
  const canonicalCatalogue = createConfiguredCanonicalPublicEventCatalogue();
  if (!canonicalCatalogue) {
    throw new Error("Canonical Event Core catalogue is not configured.");
  }
  const catalogue = getOrbitLandingViewModelFromCatalogue(
    await canonicalCatalogue.read(),
  );
  const eventIds = catalogue.events.map((event) => event.id);
  const registrationStates = await readRuntimeEventRegistrationStates({
    eventIds,
    userId: session?.user?.id,
  });
  const presentedCatalogue = applyOrbitEventPresentation(catalogue, language);
  const events = presentedCatalogue.events.map((event) =>
    publicListEvent(
      event,
      Boolean(session?.user?.id),
      registrationStates[event.id]?.registered ?? false,
      event.participantCount,
    ),
  );
  const viewModel = localizeOrbitTree(
    {
      account: {
        fullName: session?.user?.name?.trim() || "Orbit",
      },
      connections: [],
      events,
    },
    language,
  );

  const authenticated = Boolean(session?.user?.id);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      {/* 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。
          公开页：未登录用 PublicTopNav（AccountTopNav 会挂收件箱触发器并请求 /api/notifications → 401）。 */}
      <div data-orbit-real-page="events-0918" data-orbit-route="app-events-public-catalogue">
        {authenticated ? <AccountTopNav active="events" /> : <PublicTopNav active="events" />}
        <EventsList
          initialScope={
            resolvedSearchParams.scope === "registered" ||
            resolvedSearchParams.scope === "upcoming" ||
            resolvedSearchParams.scope === "active" ||
            resolvedSearchParams.scope === "ended"
              ? resolvedSearchParams.scope
              : "all"
          }
          registrationAvailabilityByEventId={Object.fromEntries(
            Object.entries(registrationStates).map(([eventId, state]) => [
              eventId,
              state.availability,
            ]),
          )}
          viewModel={viewModel}
        />
      </div>
    </>
  );
}
