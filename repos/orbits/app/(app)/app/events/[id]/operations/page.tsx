import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { requireEventCapability } from "../../../../../../features/events/event-access/guard";
import { createConfiguredEventAccessService } from "../../../../../../features/events/event-access/runtime";
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

  const accessService = createConfiguredEventAccessService();
  let accessGranted = false;
  if (accessService) {
    try {
      await requireEventCapability({
        actorId: session.user.id,
        capability: "operations.read_sensitive",
        eventId,
        service: accessService,
      });
      accessGranted = true;
    } catch {
      accessGranted = false;
    }
  }
  const ownedEvent = accessGranted
    ? await createEventCrudAndImportService().getEvent({
        actorId: session.user.id,
        eventId,
      })
    : null;

  if (!accessGranted) {
    return (
      <>
        <OrbitReferenceStyles />
        <main data-orbit-real-page="event-operations-admin-denied" style={{ margin: "0 auto", maxWidth: 760, padding: 40 }}>
          <div className="eyebrow">EVENT OPERATIONS</div>
          <h1 className="h-display">Event operations access required</h1>
          <p>This workspace requires an active per-event operations assignment.</p>
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
          endsAt:
            ownedEvent?.success === true ? ownedEvent.data.event.endsAt : "",
          id: eventId,
          startsAt:
            ownedEvent?.success === true ? ownedEvent.data.event.startsAt : "",
          title:
            ownedEvent?.success === true ? ownedEvent.data.event.title : eventId,
        }}
      />
    </>
  );
}
