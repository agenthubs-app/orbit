import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { OrbitReferenceStyles } from "../../../orbit-reference-styles";
import { PublicTopNav } from "../../../orbit-public-shell";
import { EventAnalyticsRoute } from "./event-analytics-route";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function EventAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id: routeId }, session] = await Promise.all([params, auth()]);
  const eventId = routeEventId(routeId);
  if (!session?.user?.id) {
    redirect(
      `/app/account/login?next=${encodeURIComponent(
        `/app/events/${eventId}/analytics`,
      )}`,
    );
  }

  return (
    <>
      <OrbitReferenceStyles />
      <PublicTopNav active="events" />
      <EventAnalyticsRoute eventId={eventId} />
    </>
  );
}
