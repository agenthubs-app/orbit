import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { createEventCrudAndImportService } from "../../../../../../features/events/service-factory";
import { OrbitReferenceStyles } from "../../../orbit-reference-styles";
import { EventOperationsAdminWorkspace } from "./event-operations-admin-workspace";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function AppEventOperationsAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id: routeId }, session] = await Promise.all([params, auth()]);
  const eventId = routeEventId(routeId);
  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(`/app/events/${eventId}/operations`)}`);
  }

  const eventResult = await createEventCrudAndImportService().getEvent({
    actorId: session.user.id,
    eventId,
  });

  if (eventResult.success === false) {
    return (
      <>
        <OrbitReferenceStyles />
        <main data-orbit-real-page="event-operations-admin-denied" style={{ margin: "0 auto", maxWidth: 760, padding: 40 }}>
          <div className="eyebrow">EVENT OPERATIONS</div>
          <h1 className="h-display">Organizer access required</h1>
          <p>This workspace is available only through an event record owned by the authenticated account.</p>
          <a className="btn btn-primary" href="/app/events">Return to events</a>
        </main>
      </>
    );
  }

  return (
    <>
      <OrbitReferenceStyles />
      <EventOperationsAdminWorkspace
        event={{
          endsAt: eventResult.data.event.endsAt,
          id: eventResult.data.event.id,
          startsAt: eventResult.data.event.startsAt,
          title: eventResult.data.event.title,
        }}
      />
    </>
  );
}
