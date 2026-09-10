import type { ConnectionStage } from "../../../shared/domain/source-types";
import type { LiveRecord } from "../../../shared/storage/live-record-store";
import type { TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";
import { LifecycleMigrationError, lifecycleMigrationHash, lifecycleMigrationRecordHash } from "./migration-plan";
import { assessRelationshipLifecycleMigration } from "./migration-preflight";
import { normalizeRelationshipLifecycleInstant } from "./transition";
import { lifecycleRecordColumns } from "./record-snapshot";

export interface CanonicalContactLifecycleView {
  contactId: string; connectionId: string; connectionVersion: number;
  relationshipStage: ConnectionStage; status: ConnectionStage;
  activeGoal: string | null;
  nextFollowup: null | { taskId: string; taskVersion: number; title: string;
    dueAt: string; timeStatus: "future" | "today" | "overdue" };
}
interface ReadScope { actorId: string; workspaceId: string; now: string; timeZone: string }
function identity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function lexical(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function readScope(input: ReadScope) {
  try {
    const { actorId, workspaceId, timeZone } = input;
    if (!identity(actorId) || !identity(workspaceId) || !identity(timeZone)) throw 0;
    const now = normalizeRelationshipLifecycleInstant(input.now, "INVALID_TRANSITION");
    const calendar = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    return { actorId, workspaceId, now, timeZone, calendar };
  } catch { throw new LifecycleMigrationError("INVALID_INPUT"); }
}

export function projectCanonicalContactLifecycles(input: ReadScope & { records: readonly LiveRecord[] }): readonly CanonicalContactLifecycleView[] {
  const { actorId, workspaceId, now, calendar } = readScope(input);
  try {
    if (!Array.isArray(input.records)) throw 0;
    lifecycleMigrationHash(input.records);
    const scoped = input.records.filter(row => row.workspaceId === workspaceId && ["contacts", "connections", "tasks"].includes(row.collectionName));
    const physical = new Set<string>();
    for (const row of scoped) {
      lifecycleMigrationRecordHash(row);
      const key = JSON.stringify([row.collectionName, row.recordId]);
      if (physical.has(key)) throw 0;
      physical.add(key);
    }
    if (!assessRelationshipLifecycleMigration({ actorId, workspaceId, records: input.records }).readyForCutover) throw 0;
    const visible = scoped.filter(row => row.lifecycleState !== "deleted");
    const connections = visible.filter(row => row.collectionName === "connections" && row.userId === actorId);
    const connectionIds = new Set(connections.map(row => row.recordId));
    const contactIds = new Set(connections.map(row => String(row.payload.contactId)));
    // The preflight checks outgoing references; also reject another actor's
    // Connection pointing at a private Contact in this graph.
    if (visible.some(row => row.collectionName === "connections" && row.userId !== actorId && object(row.payload) && typeof row.payload.contactId === "string" && contactIds.has(row.payload.contactId))) throw 0;
    const nextByConnection = new Map<string, { row: LiveRecord; dueAt: string; instant: number }>();
    for (const row of visible) {
      if (row.collectionName !== "tasks" || row.userId !== actorId || !object(row.payload) || typeof row.payload.connectionId !== "string" || !connectionIds.has(row.payload.connectionId) || row.payload.dueAt === undefined) continue;
      const payload = row.payload;
      if (typeof payload.title !== "string" || !payload.title.trim() || typeof payload.status !== "string" || !["open", "scheduled", "completed", "dismissed"].includes(payload.status)) throw 0;
      const dueAt = normalizeRelationshipLifecycleInstant(payload.dueAt, "INVALID_TASK");
      if (dueAt !== payload.dueAt) throw 0;
      normalizeRelationshipLifecycleInstant(payload.createdAt, "INVALID_TASK");
      normalizeRelationshipLifecycleInstant(payload.updatedAt, "INVALID_TASK");
      if (payload.status !== "open" && payload.status !== "scheduled") continue;
      const instant = Date.parse(dueAt);
      const previous = nextByConnection.get(payload.connectionId as string);
      if (!previous || instant < previous.instant || (instant === previous.instant && lexical(row.recordId, previous.row.recordId) < 0)) nextByConnection.set(payload.connectionId as string, { row, dueAt, instant });
    }
    const clock = Date.parse(now);
    const today = calendar.format(clock);
    return connections.sort((left, right) => lexical(String(left.payload.contactId), String(right.payload.contactId))).map(row => {
      const next = nextByConnection.get(row.recordId);
      const stage = row.payload.stage as ConnectionStage;
      return {
        contactId: row.payload.contactId as string, connectionId: row.recordId,
        connectionVersion: row.payload.version as number, relationshipStage: stage, status: stage,
        activeGoal: row.payload.activeGoal == null ? null : row.payload.activeGoal as string,
        nextFollowup: next ? { taskId: next.row.recordId, taskVersion: next.row.payload.version as number, title: next.row.payload.title as string, dueAt: next.dueAt, timeStatus: next.instant < clock ? "overdue" : calendar.format(next.instant) === today ? "today" : "future" } : null,
      };
    });
  } catch { throw new LifecycleMigrationError("INCONSISTENT_STATE"); }
}

export async function readCanonicalContactLifecycles(input: ReadScope & { client: TransactionalPostgresClient }): Promise<readonly CanonicalContactLifecycleView[]> {
  const { actorId, workspaceId, now, timeZone } = readScope(input);
  const client = input.client;
  return client.transaction(async sql => {
    const connections = await sql.query<LiveRecord>(`select ${lifecycleRecordColumns} from orbit_records where workspace_id = $1 and collection_name = 'connections' and user_id = $2 and lifecycle_state <> 'deleted' order by record_id`, [workspaceId, actorId]);
    const contactIds: string[] = [];
    const connectionIds: string[] = [];
    for (const row of connections.rows) {
      if (row.workspaceId !== workspaceId || row.userId !== actorId || row.collectionName !== "connections" || !identity(row.recordId) || !object(row.payload) || row.payload.accountId !== actorId || !identity(row.payload.contactId)) throw new LifecycleMigrationError("INCONSISTENT_STATE");
      connectionIds.push(row.recordId);
      contactIds.push(row.payload.contactId);
    }
    const contacts = await sql.query<LiveRecord>(`select ${lifecycleRecordColumns} from orbit_records where workspace_id = $1 and collection_name = 'contacts' and user_id = $2 and record_id = any($3::text[]) and lifecycle_state <> 'deleted' order by record_id`, [workspaceId, actorId, contactIds]);
    const tasks = await sql.query<LiveRecord>(`select ${lifecycleRecordColumns} from orbit_records where workspace_id = $1 and collection_name = 'tasks' and user_id = $2 and payload ->> 'connectionId' = any($3::text[]) and lifecycle_state <> 'deleted' order by record_id`, [workspaceId, actorId, connectionIds]);
    // Only a boolean crosses SQL for unowned/orphan references. Never fetch a
    // foreign payload to explain a consistency error to a user-facing reader.
    const check = await sql.query<{ inconsistent: boolean }>(`select exists (
      select 1 from orbit_records r where r.workspace_id = $1 and r.lifecycle_state <> 'deleted' and (
        (r.collection_name = 'contacts' and r.user_id = $2 and not (r.record_id = any($3::text[])))
        or (r.collection_name = 'connections' and r.user_id is distinct from $2 and (r.payload ->> 'accountId' = $2 or r.payload ->> 'contactId' = any($3::text[])))
        or (r.collection_name = 'tasks' and (
          (r.user_id is distinct from $2 and r.payload ->> 'connectionId' = any($4::text[]))
          or (r.user_id = $2 and (
            jsonb_typeof(r.payload) is distinct from 'object'
            or ((r.payload ? 'connectionId' or r.payload ? 'relationshipPurpose') and (
              jsonb_typeof(r.payload -> 'connectionId') is distinct from 'string'
              or not (coalesce(r.payload ->> 'connectionId', '') = any($4::text[]))
            ))
          ))
        ))
      )
    ) as inconsistent`, [workspaceId, actorId, contactIds, connectionIds]);
    if (check.rows.length !== 1 || check.rows[0].inconsistent !== false) throw new LifecycleMigrationError("INCONSISTENT_STATE");
    return projectCanonicalContactLifecycles({ actorId, workspaceId, now, timeZone, records: [...connections.rows, ...contacts.rows, ...tasks.rows] });
  });
}
