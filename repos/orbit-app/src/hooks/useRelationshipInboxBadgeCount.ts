import { ORBIT_API_ENDPOINTS, relationshipInboxPath } from "../api/endpoints";
import { useApiResource } from "./useApiResource";
import {
  relationshipAlertsToView,
  relationshipInboxBadgeCount,
  relationshipInboxToView
} from "../view-models/relationship-inbox";

export function useRelationshipInboxBadgeCount(scopeKey?: string): number | undefined {
  const inboxState = useApiResource<unknown>(
    relationshipInboxPath(),
    () => false,
    scopeKey === undefined ? {} : { scopeKey }
  );
  const notificationsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.notifications,
    () => false,
    scopeKey === undefined ? {} : { scopeKey }
  );

  if (
    inboxState.kind !== "success" &&
    notificationsState.kind !== "success"
  ) {
    return undefined;
  }

  const inbox =
    inboxState.kind === "success"
      ? relationshipInboxToView(inboxState.data)
      : relationshipInboxToView(null);
  const alerts = relationshipAlertsToView(
    notificationsState.kind === "success" ? notificationsState.data : null
  );
  const count = relationshipInboxBadgeCount(inbox, alerts);

  return count > 0 ? Math.min(count, 99) : undefined;
}
