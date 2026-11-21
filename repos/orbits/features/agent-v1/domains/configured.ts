/**
 * The graph's record access on the product data path (agent-design AG05): the configured Postgres
 * record store (the same connection the product uses — the local eval database in the eval), the
 * canonical event repository, a cursor key derived from the deployment's secret, and the eval's deny
 * list (empty outside the eval). Null when no database is configured.
 */
import { createHash } from "node:crypto";

import { createPostgresEventCoreRepositoryFromRuntime } from "../../events/core/storage/postgres-repository";
import { createConfiguredEventOperationsPostgresRuntime } from "../../events/event-operations/storage/postgres-client";
import { createPostgresCanonicalRegistrationMethods } from "../../events/event-operations/storage/canonical-registration-repository";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { AgentRecordAccess } from "../graph/deps";
import { emitTrace, evalDeniedReads } from "../observability/trace";
import { createDomainRegistry, readMaxPages } from "./registry";
import { ownEventsOf } from "./event/read";
import { createPostgresRecordSource, type RecordSource } from "./source";
import { parseRef, type DomainKind } from "./types";
import { createStoreContactAccess } from "./contact/access";
import { createPrivateEventService } from "../../events/private-events/service";
import { createAttendanceService } from "../../events/attendance-notes/service";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";

export const AUTHORIZATION_EPOCH = "agent-v1:1";

const COLLECTION_OF: Record<Exclude<DomainKind, "event">, string> = {
  contact: "contacts",
  memo: "notes",
  schedule: "personal_schedule_items",
  todo: "tasks",
};

/** 32 bytes for the read cursor's HMAC, derived from the deployment's secret (never the secret itself). */
export function cursorKeyOf(secret: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(`orbit-agent-v1-read-cursor\u0000${secret}`).digest());
}

/**
 * agent-design AG20b (TRIAGE R21): the deployment's secret for the read cursor, as a key — or null when none of at least
 * 32 bytes is configured. Then there are no record reads at all (fails closed), never a cursor sealed with an empty key
 * (the same rule as the task pages' READ_CURSOR_SECRET_MISSING).
 */
export function readCursorKey(): Uint8Array | null {
  const secret = process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  return Buffer.byteLength(secret) >= 32 ? cursorKeyOf(secret) : null;
}

/** Which typed refs the account may read now: the deny list, then an existence check (ids only). */
export async function visibleRefs(source: RecordSource, scope: { accountId: string; workspaceId: string }, refs: readonly string[], denied: ReadonlySet<string>): Promise<Set<string>> {
  const out = new Set<string>();
  const checks: { collection: string; id: string; ref: string }[] = [];
  for (const ref of refs) {
    const parsed = parseRef(ref);
    if (!parsed || denied.has(parsed.id)) continue;
    if (parsed.kind === "event") {
      // AG11: the account's own «我去过» notes and private events are checked like their other records.
      if (parsed.id.startsWith("attendance:")) checks.push({ collection: "event_attendance_notes", id: parsed.id, ref });
      else if (parsed.id.startsWith("private_event:")) checks.push({ collection: "private_events", id: parsed.id, ref });
      else out.add(ref);
      continue;
    }
    checks.push({ collection: COLLECTION_OF[parsed.kind], id: parsed.id, ref });
  }
  if (checks.length) {
    const existing = await source.existing(scope, checks);
    for (const check of checks) if (existing.has(`${check.collection}:${check.id}`)) out.add(check.ref);
  }
  return out;
}

export function configuredRecordAccess(): AgentRecordAccess | null {
  const cursorKey = readCursorKey();
  if (!cursorKey) {
    emitTrace({ error: "READ_CURSOR_SECRET_MISSING", type: "read.error", where: "domains.configured" });
    return null;
  }
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  const source = createPostgresRecordSource(configured.client);
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  const repository = runtime ? createPostgresEventCoreRepositoryFromRuntime(runtime) : null;
  const registrations = runtime ? createPostgresCanonicalRegistrationMethods(runtime) : null;
  const byIds = async (ids: readonly string[]) => (repository?.listEventsByIds ? repository.listEventsByIds(ids) : []);
  const workspaceId = configured.workspaceId;
  // AG13: private events, «我去过» and the records linking to an event (the reverse lookups go by index).
  const attendance = createAttendanceService({ store: configured.store, workspaceId });
  const privateEvents = createPrivateEventService({ client: createConfiguredTransactionalPostgresRuntime()?.client ?? null, store: configured.store, workspaceId });
  // AG11: an @ of a private event or a «我去过» note is read by its id (the account's own only).
  const events = { byIds, own: ownEventsOf({ attendance, byIds, privateEvents }) };
  const reader = createDomainRegistry({ cursorKey, denied: evalDeniedReads, events, now: () => new Date().toISOString(), source });
  return {
    // AG12: contact writes read the account's contacts from the same store (duplicates, restore, import review).
    contacts: createStoreContactAccess({ store: configured.store, workspaceId }),
    attendance,
    privateEvents,
    // AG08: the events of the deployment for ranking (functions node keeps those the account may see).
    listEvents: async () => (repository ? repository.listEvents() : []),
    eventsByIds: byIds,
    // Hotfix 2026-11-20 part 2: the published events the user is registered for (not cancelled).
    registeredEventIds: async (actorId) => (registrations ? (await registrations.listPublishedCanonicalRegistrationStatusesForUser(actorId)).filter((item) => item.status !== "cancelled").map((item) => item.eventId) : []),
    deniedReads: evalDeniedReads,
    maxPages: readMaxPages(),
    reader,
    scope: (actorId) => ({ accountId: actorId, authorizationEpoch: AUTHORIZATION_EPOCH, workspaceId }),
    source,
    visible: (actorId, refs) => visibleRefs(source, { accountId: actorId, workspaceId }, refs, evalDeniedReads()),
  };
}
