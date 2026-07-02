export const ORBIT_API_ENDPOINTS = {
  bootstrap: "/api/app/bootstrap",
  contacts: "/api/contacts",
  conversations: "/api/ai/conversations",
  events: "/api/events",
  health: "/api/health",
  profile: "/api/profile",
  tasks: "/api/tasks"
} as const;

function detailPath(collectionPath: string, id: string): string {
  return `${collectionPath}/${encodeURIComponent(id)}`;
}

export function eventDetailPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.events, id);
}

export function contactDetailPath(id: string): string {
  return detailPath(ORBIT_API_ENDPOINTS.contacts, id);
}
