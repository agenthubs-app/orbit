import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { requireEventCapability } from "../../../../../../features/events/event-access/guard";
import { createConfiguredEventAccessService } from "../../../../../../features/events/event-access/runtime";
import { createConfiguredEventCoreService } from "../../../../../../features/events/core/runtime";
import { AccountTopNav } from "../../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../../orbit-reference-styles";
import { OpsConsole } from "../../ops-0918/ops-console";
import { opsConsoleTab } from "../../ops-0918/ops-model";
import { loadEventOperationsPageEvent } from "./event-operations-page-event";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function AppEventOperationsAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const [{ id: routeId }, session] = await Promise.all([params, auth()]);
  const query = searchParams ? await searchParams : {};
  const tab = opsConsoleTab(query.tab);
  const eventId = routeEventId(routeId);
  if (!session?.user?.id) {
    redirect(`/app/account/login?next=${encodeURIComponent(`/app/events/${eventId}/operations`)}`);
  }

  const accessService = createConfiguredEventAccessService();
  const eventCore = createConfiguredEventCoreService();
  let canonicalEventId: string | null = null;
  if (eventCore) {
    try {
      canonicalEventId = (await eventCore.getEvent(eventId))?.eventId ?? null;
    } catch {
      canonicalEventId = null;
    }
  }
  let accessGranted = false;
  if (accessService && canonicalEventId) {
    try {
      await requireEventCapability({
        actorId: session.user.id,
        capability: "operations.read_sensitive",
        eventId: canonicalEventId,
        service: accessService,
      });
      accessGranted = true;
    } catch {
      accessGranted = false;
    }
  }
  let canManageRoles = false;
  if (accessGranted && accessService) {
    try {
      await requireEventCapability({
        actorId: session.user.id,
        capability: "roles.manage",
        eventId: canonicalEventId!,
        service: accessService,
      });
      canManageRoles = true;
    } catch {
      canManageRoles = false;
    }
  }
  const pageEvent = accessGranted
    ? await loadEventOperationsPageEvent(
        canonicalEventId!,
        eventCore,
      )
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
      {/* 顶栏样式限定在 [data-orbit-real-page] 祖先下（orbit-reference-styles.tsx），外层容器必须带该属性。 */}
      <div data-orbit-real-page="ops-0918">
        <AccountTopNav active="events" />
        <OpsConsole
          canManageRoles={canManageRoles}
          event={pageEvent ?? {
            endsAt: "",
            id: eventId,
            startsAt: "",
            title: eventId,
          }}
          tab={tab}
        />
      </div>
    </>
  );
}
