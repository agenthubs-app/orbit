import { auth } from "../../../../auth";
import { createConfiguredCanonicalPublicEventCatalogue } from "../../../../features/events/core/public-catalogue-runtime";
import {
  listRuntimeEventRegistrationsForUser,
  readRuntimeEventRegistrationAvailability,
} from "../../../../features/events/registration/runtime";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { applyOrbitEventPresentation } from "../orbit-event-presentation";
import {
  getOrbitLandingViewModelFromCatalogue,
  type OrbitLandingEventView,
} from "../orbit-landing-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealExploreClient } from "./orbit-real-explore-client";

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
  const [registrations, availabilityEntries] = await Promise.all([
    session?.user?.id
      ? listRuntimeEventRegistrationsForUser({
        eventIds,
        userId: session.user.id,
      })
      : Promise.resolve([]),
    Promise.all(
      eventIds.map(async (eventId) => [
        eventId,
        await readRuntimeEventRegistrationAvailability(eventId),
      ] as const),
    ),
  ]);
  const registrationsByEventId = new Map(
    registrations.map((registration) => [registration.eventId, registration]),
  );
  const presentedCatalogue = applyOrbitEventPresentation(catalogue, language);
  const events = presentedCatalogue.events.map((event) =>
    publicListEvent(
      event,
      Boolean(session?.user?.id),
      registrationsByEventId.get(event.id)?.status === "rsvped",
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

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <div data-orbit-route="app-events-public-catalogue">
        <OrbitRealExploreClient
          initialScope={
            resolvedSearchParams.scope === "registered" ||
            resolvedSearchParams.scope === "upcoming" ||
            resolvedSearchParams.scope === "active" ||
            resolvedSearchParams.scope === "ended"
              ? resolvedSearchParams.scope
              : "all"
          }
          registrationAvailabilityByEventId={Object.fromEntries(availabilityEntries)}
          viewModel={viewModel}
        />
      </div>
    </>
  );
}
