import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { requireEventCapability } from "../../../../../../../features/events/event-access/guard";
import { createConfiguredEventAccessService } from "../../../../../../../features/events/event-access/runtime";
import { OrbitReferenceStyles } from "../../../../orbit-reference-styles";
import { EventRoleManagementWorkspace } from "./event-role-management-workspace";

function routeEventId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function EventRoleManagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id: routeId }, session] = await Promise.all([params, auth()]);
  const eventId = routeEventId(routeId);
  if (!session?.user?.id) {
    redirect(
      `/app/account/login?next=${encodeURIComponent(`/app/events/${eventId}/operations/roles`)}`,
    );
  }

  const accessService = createConfiguredEventAccessService();
  let allowed = false;
  if (accessService) {
    try {
      await requireEventCapability({
        actorId: session.user.id,
        capability: "roles.manage",
        eventId,
        service: accessService,
      });
      allowed = true;
    } catch {
      allowed = false;
    }
  }

  if (!allowed) {
    return (
      <>
        <OrbitReferenceStyles />
        <main data-orbit-real-page="event-role-management-denied" style={{ margin: "0 auto", maxWidth: 760, padding: 40 }}>
          <div className="eyebrow">EVENT ROLE ACCESS</div>
          <h1 className="h-display">活动角色管理需要负责人权限</h1>
          <p>只有 Event Core 中的当前活动负责人可以查看或变更当前活动角色。</p>
          <a className="btn btn-primary" href="/app/events/center">返回运营活动中心</a>
        </main>
      </>
    );
  }

  return (
    <>
      <OrbitReferenceStyles />
      <EventRoleManagementWorkspace eventId={eventId} />
    </>
  );
}
