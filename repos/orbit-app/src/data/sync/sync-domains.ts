import type { SyncChangeKind } from "../../api/contract/sync";

/**
 * Sprint 0113: the sync domains this App build knows how to store and read,
 * keyed by the server's domain id. Which of them are synced is decided by the
 * server's lease (its grants), narrowed by the platform whitelist (the browser
 * mirror lists fewer). A granted domain this build does not know is ignored:
 * nothing is stored or pulled for it and the sync does not fail. A new server
 * domain (sprint 0115 on) is added here together with its screens.
 */
export const KNOWN_SYNC_DOMAINS: Readonly<Record<string, SyncChangeKind>> = {
  notes: "note",
  tasks: "task",
  "personal-schedule": "personal_schedule",
  // Sprint 0115: the registered attendee's event day (event detail, live page, calendar).
  "event-registrations": "event_registration",
  "registered-events": "registered_event",
  "event-published-results": "event_published_result",
};

export function kindOfSyncDomain(domainId: string): SyncChangeKind | null {
  return Object.hasOwn(KNOWN_SYNC_DOMAINS, domainId) ? KNOWN_SYNC_DOMAINS[domainId]! : null;
}

export function syncDomainOfKind(kind: SyncChangeKind): string | null {
  return Object.entries(KNOWN_SYNC_DOMAINS).find(([, candidate]) => candidate === kind)?.[0] ?? null;
}
