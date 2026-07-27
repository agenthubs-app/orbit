import { auth } from "../../../../auth";
import { eventRegistrationRuntimeService } from "../../../../features/events/registration/runtime";
import { getOrbitServerLanguage, localizeOrbitTree } from "../orbit-language-server";
import { applyOrbitEventPresentation } from "../orbit-event-presentation";
import {
  getOrbitLandingViewModel,
  type OrbitLandingEventView,
} from "../orbit-landing-route-view-model";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { OrbitRealExploreClient } from "./orbit-real-explore-client";

interface AppEventsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] : value;
}

function publicListEvent(
  event: OrbitLandingEventView,
  authenticated: boolean,
  registered: boolean,
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
    status,
    stats: {
      ...event.stats,
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
}: AppEventsPageProps = {}) {
  const [session, language, query] = await Promise.all([
    auth(),
    getOrbitServerLanguage(),
    searchParams,
  ]);
  const catalogue = getOrbitLandingViewModel();
  const registrations = session?.user?.id
    ? await Promise.all(
        catalogue.events.map((event) =>
          eventRegistrationRuntimeService.get({
            eventId: event.id,
            userId: session.user.id,
          }),
        ),
      )
    : catalogue.events.map(() => null);
  const presentedCatalogue = applyOrbitEventPresentation(catalogue, language);
  const events =
    readSearchParam(query, "scenario") === "empty"
      ? []
      : presentedCatalogue.events.map((event, index) =>
          publicListEvent(
            event,
            Boolean(session?.user?.id),
            registrations[index]?.status === "rsvped",
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
        <OrbitRealExploreClient viewModel={viewModel} />
      </div>
    </>
  );
}
