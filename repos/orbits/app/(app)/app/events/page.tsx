/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
import { StateView } from "../../../../shared/ui/state-view";
import { AppEventsCommandCenter } from "./compose-app-events-from-previously-approved-mock-first-capabilities/events-command-center";

export const metadata = {
  title: "Events | Orbit",
  description:
    "Compose sourced events, event value recommendations, attendee recommendations, and readiness in Orbit.",
};

type AppEventsSearchParams = Record<string, string | string[] | undefined>;

interface EventsPageProps {
  searchParams?: AppEventsSearchParams | Promise<AppEventsSearchParams>;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue> | undefined,
): value is Promise<TValue> {
  return Boolean(value && typeof (value as Promise<TValue>).then === "function");
}

function LegacyEventsStateBoundary() {
  return (
    <StateView
      description="Events will collect who is attending, why they matter, and what would make a good introduction."
      emptyState="No event roster, goals, readiness notes, or attendee evidence is loaded."
      evidence={[
        "No roster is loaded.",
        "Goals and readiness notes are empty.",
      ]}
      eyebrow="Events"
      guardrail="Events can frame preparation work, but it cannot import attendees yet."
      nextStep="Add an event source after roster import is available."
      purpose="Prepare event context, attendee sources, and goals."
      title="Events"
    />
  );
}

function renderEventsPage(searchParams: AppEventsSearchParams | undefined) {
  return <AppEventsCommandCenter searchParams={searchParams} />;
}

export default function EventsPage({ searchParams }: EventsPageProps = {}) {
  if (searchParams === undefined) {
    return <LegacyEventsStateBoundary />;
  }

  if (isPromiseLike(searchParams)) {
    return searchParams.then((resolvedSearchParams) =>
      renderEventsPage(resolvedSearchParams),
    );
  }

  return renderEventsPage(searchParams);
}
