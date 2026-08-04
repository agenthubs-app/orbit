import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { OrbitReferenceStyles } from "../../../../orbit-reference-styles";
import { LimitedCheckInRoster } from "./limited-check-in-roster";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function EventOperationsCheckInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id: routeId }, session] = await Promise.all([params, auth()]);
  const eventId = routeEventId(routeId);
  const pathname = `/app/events/${encodeURIComponent(eventId)}/operations/check-in`;
  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(pathname)}`);
  }

  return (
    <>
      <OrbitReferenceStyles />
      <LimitedCheckInRoster eventId={eventId} />
    </>
  );
}
