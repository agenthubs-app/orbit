/**
 * The graph's record access on the product data path (agent-design AG05): the configured Postgres
 * record store (the same connection the product uses — the local eval database in the eval), the
 * canonical event repository, a cursor key derived from the deployment's secret, and the eval's deny
 * list (empty outside the eval). Null when no database is configured.
 */
import { createHash } from "node:crypto";

import { createPostgresEventCoreRepositoryFromRuntime } from "../../events/core/storage/postgres-repository";
import { createConfiguredEventOperationsPostgresRuntime } from "../../events/event-operations/storage/postgres-client";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { AgentRecordAccess } from "../graph/deps";
import { evalDeniedReads } from "../observability/trace";
import { createDomainRegistry, readMaxPages } from "./registry";
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

/** Which typed refs the account may read now: the deny list, then an existence check (ids only). */
export async function visibleRefs(source: RecordSource, scope: { accountId: string; workspaceId: string }, refs: readonly string[], denied: ReadonlySet<string>): Promise<Set<string>> {
  const out = new Set<string>();
  const checks: { collection: string; id: string; ref: string }[] = [];
  for (const ref of refs) {
    const parsed = parseRef(ref);
    if (!parsed || denied.has(parsed.id)) continue;
    if (parsed.kind === "event") {
      out.add(ref);
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
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  const source = createPostgresRecordSource(configured.client);
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  const repository = runtime ? createPostgresEventCoreRepositoryFromRuntime(runtime) : null;
  const events = { async byIds(ids: readonly string[]) { return repository?.listEventsByIds ? repository.listEventsByIds(ids) : []; } };
  const secret = process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  const reader = createDomainRegistry({ cursorKey: cursorKeyOf(secret), denied: evalDeniedReads, events, now: () => new Date().toISOString(), source });
  const workspaceId = configured.workspaceId;
  return {
    // AG12: contact writes read the account's contacts from the same store (duplicates, restore, import review).
    contacts: createStoreContactAccess({ store: configured.store, workspaceId }),
    // AG13: private events, «我去过» and the records linking to an event (the reverse lookups go by index).
    attendance: createAttendanceService({ store: configured.store, workspaceId }),
    privateEvents: createPrivateEventService({ client: createConfiguredTransactionalPostgresRuntime()?.client ?? null, store: configured.store, workspaceId }),
    // AG08: the events of the deployment for ranking (functions node keeps those the account may see).
    listEvents: async () => (repository ? repository.listEvents() : []),
    maxPages: readMaxPages(),
    reader,
    scope: (actorId) => ({ accountId: actorId, authorizationEpoch: AUTHORIZATION_EPOCH, workspaceId }),
    source,
    visible: (actorId, refs) => visibleRefs(source, { accountId: actorId, workspaceId }, refs, evalDeniedReads()),
  };
}
