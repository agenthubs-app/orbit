import { createHash } from "node:crypto";
import type { RelationshipInitializationInput, RelationshipInitializationRead, RelationshipLifecycleSnapshotDTO } from "../../../shared/contract/relationship-lifecycle";
import { relationshipInitializationSchema } from "../../../shared/api-schema/relationship-initialization";
import { relationshipLifecycleSnapshotSchema } from "../../../shared/api-schema/relationship-lifecycle";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { RelationshipLifecycleError } from "./contract";
import { createPostgresRelationshipLifecycleRepository } from "./postgres-repository";
import { normalizeRelationshipLifecycleInstant } from "./transition";

interface Row { record_id: string; collection_name: string; user_id: string; payload: Record<string, unknown> }
interface Acquisition { connection: Row; contact: Row; connectionId: string; pending: boolean; revision: string }
export interface RelationshipInitializationService {
  read(actorId: string, contactId: string): Promise<RelationshipInitializationRead>;
  initialize(actorId: string, contactId: string, input: RelationshipInitializationInput): Promise<{ snapshot: RelationshipLifecycleSnapshotDTO; replayed: boolean }>;
}
function hash(value: unknown): string {
  const ordered = (item: unknown): unknown => Array.isArray(item) ? item.map(ordered) : item && typeof item === "object"
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, ordered(entry)])) : item;
  return createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
}
function fail(code: "NOT_FOUND" | "CONFLICT" | "INVALID_TRANSITION" | "INVALID_TASK" | "IDEMPOTENCY_CONFLICT"): never {
  throw new RelationshipLifecycleError(code, "Unable to initialize this relationship with the supplied choice.");
}
function version(value: unknown): number {
  if (value === undefined) return 0; // Only for the verified, untouched historical exchange writer.
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) >= Number.MAX_SAFE_INTEGER) return fail("CONFLICT");
  return value as number;
}
function identity(value: string): void {
  if (!value || value.trim() !== value || value.length > 256 || value.includes("\0")) fail("NOT_FOUND");
}
function verifiedSnapshot(value: unknown, actorId: string, contactId: string, connectionId: string): RelationshipLifecycleSnapshotDTO {
  const parsed = relationshipLifecycleSnapshotSchema.safeParse(value);
  if (!parsed.success) fail("INVALID_TRANSITION");
  const snapshot = parsed.data as RelationshipLifecycleSnapshotDTO;
  const c = snapshot.connection;
  if (c.actorId !== actorId || c.contactId !== contactId || c.connectionId !== connectionId
    || snapshot.tasks.some(t => t.actorId !== actorId || t.contactId !== contactId || t.connectionId !== connectionId)
    || new Set(snapshot.tasks.map(t => t.taskId)).size !== snapshot.tasks.length) fail("INVALID_TRANSITION");
  const open = snapshot.tasks.filter(t => t.status === "open" || t.status === "scheduled");
  if ((c.stage === "active" && !c.activeGoal?.trim()) || (c.stage === "archived" && open.length)
    || ((c.stage === "needs_follow_up" || c.stage === "nurture") && !open.some(t => t.purpose === (c.stage === "nurture" ? "maintenance" : "follow_up")))) fail("INVALID_TRANSITION");
  return snapshot;
}
async function load(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string, contactId: string): Promise<Acquisition> {
  identity(actorId); identity(contactId);
  // A prefix or source label is never proof of consent. The immutable accepted
  // request and this owner's relationship side are the authority.
  const sides = await sql.query<{ connection_id: string }>(`select s.connection_id from event_ops_relationship_sides s
    join event_ops_relationship_pairs p on p.workspace_id = s.workspace_id and p.relationship_pair_id = s.relationship_pair_id
    join event_ops_contact_requests r on r.workspace_id = p.workspace_id and r.request_id = p.request_id
    where s.workspace_id = $1 and s.owner_actor_id = $2 and s.contact_id = $3
      and r.status = 'accepted' and r.relationship_pair_id = s.relationship_pair_id`, [workspaceId, actorId, contactId]);
  if (sides.rows.length !== 1) fail("NOT_FOUND");
  const connectionId = sides.rows[0].connection_id;
  const rows = await sql.query<Row>(`select record_id, collection_name, user_id, payload from orbit_records
    where workspace_id = $1 and user_id = $2 and lifecycle_state <> 'deleted'
      and ((collection_name = 'connections' and record_id = $3) or (collection_name = 'contacts' and record_id = $4))
    order by collection_name for update`, [workspaceId, actorId, connectionId, contactId]);
  const connection = rows.rows.find(row => row.collection_name === "connections");
  const contact = rows.rows.find(row => row.collection_name === "contacts");
  if (!connection || !contact) fail("NOT_FOUND");
  for (const row of [connection, contact]) {
    if (row.user_id !== actorId || row.payload?.id !== row.record_id) fail("NOT_FOUND");
    version(row.payload.version);
  }
  const c = connection.payload;
  if (c.accountId !== actorId || c.contactId !== contactId) fail("NOT_FOUND");
  const markedPending = c.lifecycleInitialization === "pending" && c.stage === "captured"
    && contact.payload.lifecycleInitialization === "pending" && contact.payload.stage === "captured"
    && version(c.version) > 0 && version(contact.payload.version) > 0;
  // Narrow compatibility path for the old accepted-exchange defect. Never
  // reinitialize an edited, versioned or task-bearing canonical relationship.
  const legacyPending = c.lifecycleInitialization === undefined && c.stage === "active" && c.activeGoal == null
    && c.version === undefined && contact.payload.version === undefined && contact.payload.lifecycleInitialization === undefined && contact.payload.stage === "active";
  const pending = markedPending || legacyPending;
  if (pending) {
    if (c.activeGoal != null) fail("INVALID_TRANSITION");
    const tasks = await sql.query(`select record_id from orbit_records where workspace_id = $1 and collection_name = 'tasks'
      and user_id = $2 and payload ->> 'connectionId' = $3 and lifecycle_state <> 'deleted' for update`, [workspaceId, actorId, connectionId]);
    if (tasks.rows.length) fail("INVALID_TRANSITION");
  } else if (c.lifecycleInitialization === "pending") fail("INVALID_TRANSITION");
  return { connection, contact, connectionId, pending, revision: hash({ workspaceId, actorId, contactId, connection: c, contact: contact.payload }) };
}
function canonicalRepository(sql: TransactionalSqlExecutor, workspaceId: string) {
  return createPostgresRelationshipLifecycleRepository({ workspaceId, client: { ...sql, transaction: operation => operation(sql), close: async () => {} } });
}
async function retry<T>(client: TransactionalPostgresClient, operation: (sql: TransactionalSqlExecutor) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await client.transaction(operation); }
    catch (error) {
      const e = error as { code?: string; constraint?: string };
      const race = e.code === "23505" && e.constraint === "relationship_lifecycle_command_receipts_pkey";
      if (attempt >= 2 || (!race && e.code !== "40001" && e.code !== "40P01")) throw error;
    }
  }
}
export function createRelationshipInitializationService({ client, workspaceId, now = () => new Date().toISOString() }: {
  client: TransactionalPostgresClient; workspaceId: string; now?: () => string;
}): RelationshipInitializationService {
  identity(workspaceId);
  return {
    read: (actorId, contactId) => retry(client, async sql => {
      const acquisition = await load(sql, workspaceId, actorId, contactId);
      if (acquisition.pending) return { state: "pending", revision: acquisition.revision, connectionId: acquisition.connectionId };
      const snapshot = await canonicalRepository(sql, workspaceId).read(actorId, acquisition.connectionId);
      if (!snapshot) fail("NOT_FOUND");
      if (version(acquisition.contact.payload.version) < 1 || version(acquisition.connection.payload.version) < 1) fail("INVALID_TRANSITION");
      return { state: "initialized", snapshot: verifiedSnapshot(snapshot, actorId, contactId, acquisition.connectionId) };
    }),
    async initialize(actorId, contactId, rawInput) {
      const parsed = relationshipInitializationSchema.safeParse(rawInput);
      if (!parsed.success) fail("INVALID_TRANSITION");
      const input = parsed.data;
      const { idempotencyKey, ...body } = input;
      const requestHash = hash({ actorId, contactId, ...body });
      const timestamp = normalizeRelationshipLifecycleInstant(now(), "INVALID_TRANSITION");
      return retry(client, async sql => {
        const acquisition = await load(sql, workspaceId, actorId, contactId);
        const { connectionId, connection, contact } = acquisition;
        const receipt = (await sql.query<{ command: string; request_hash: string; response_snapshot: unknown }>(
          "select command, request_hash, response_snapshot from relationship_lifecycle_command_receipts where workspace_id = $1 and actor_id = $2 and idempotency_key = $3", [workspaceId, actorId, idempotencyKey])).rows[0];
        if (receipt) {
          if (receipt.command !== "initialize_relationship" || receipt.request_hash !== requestHash) fail("IDEMPOTENCY_CONFLICT");
          const snapshot = verifiedSnapshot(receipt.response_snapshot, actorId, contactId, connectionId);
          return { snapshot, replayed: true };
        }
        if (!acquisition.pending || acquisition.revision !== input.expectedRevision) fail("CONFLICT");
        const { choice } = input;
        const source = { type: "manual", id: idempotencyKey };
        const auditId = `lifecycle-initialize:${hash({ workspaceId, actorId, idempotencyKey })}`;
        const snapshot: RelationshipLifecycleSnapshotDTO = {
          connection: { actorId, connectionId, contactId, stage: choice.stage, activeGoal: choice.stage === "active" ? choice.activeGoal : null,
            version: version(connection.payload.version) + 1, createdAt: normalizeRelationshipLifecycleInstant(connection.payload.createdAt, "INVALID_TRANSITION"), updatedAt: timestamp },
          tasks: [],
        };
        if (choice.stage === "needs_follow_up" || choice.stage === "nurture") {
          const next = choice.nextTask;
          snapshot.tasks.push({ actorId, connectionId, contactId, taskId: next.taskId, title: next.title,
            dueAt: normalizeRelationshipLifecycleInstant(next.dueAt, "INVALID_TASK"), purpose: choice.stage === "nurture" ? "maintenance" : "follow_up",
            status: "open", version: 1, createdAt: timestamp, updatedAt: timestamp });
        }
        // Both owner-scoped projections advance in the same transaction. All
        // private profile data and event evidence remain untouched.
        for (const row of [connection, contact]) {
          const patch = { stage: choice.stage, version: version(row.payload.version) + 1, lifecycleInitialization: "ready", updatedAt: timestamp,
            ...(row === connection ? { activeGoal: snapshot.connection.activeGoal } : {}) };
          const updated = await sql.query(`update orbit_records set payload = payload || $5::jsonb, updated_at = $6
            where workspace_id = $1 and user_id = $2 and collection_name = $3 and record_id = $4 and lifecycle_state <> 'deleted' returning record_id`,
          [workspaceId, actorId, row.collection_name, row.record_id, patch, timestamp]);
          if (updated.rows.length !== 1) fail("CONFLICT");
        }
        const insert = async (collection: string, id: string, payload: unknown, evidenceIds: string[] = []) => {
          await sql.query(`insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, evidence_ids, created_at, updated_at)
            values ($1,$2,$3,$4,'manual',$5,$6,$7,$8,$8)`, [workspaceId, collection, id, actorId, idempotencyKey, payload, evidenceIds, timestamp]);
        };
        for (const task of snapshot.tasks) {
          const evidenceId = `evidence:${auditId}`;
          await insert("evidence", evidenceId, { id: evidenceId, sourceType: "manual", sourceId: idempotencyKey, createdBy: actorId, occurredAt: timestamp, summary: `用户确认关系下一步：${task.title}`, confidence: 1 });
          try {
            await insert("tasks", task.taskId, { id: task.taskId, accountId: actorId, connectionId, contactId, title: task.title, dueAt: task.dueAt,
              relationshipPurpose: task.purpose, status: task.status, version: task.version, createdAt: timestamp, updatedAt: timestamp, source, evidenceIds: [evidenceId] }, [evidenceId]);
          } catch (error) { if ((error as { code?: string }).code === "23505") fail("INVALID_TASK"); throw error; }
        }
        await insert("relationship_lifecycle_audits", auditId, { auditId, actorId, connectionId, command: "initialize_relationship", fromStage: null,
          toStage: choice.stage, taskIds: snapshot.tasks.map(t => t.taskId), source, occurredAt: timestamp });
        await sql.query("insert into relationship_lifecycle_command_receipts (workspace_id, actor_id, idempotency_key, command, request_hash, response_snapshot, created_at) values ($1,$2,$3,'initialize_relationship',$4,$5,$6)",
          [workspaceId, actorId, idempotencyKey, requestHash, snapshot, timestamp]);
        const stored = await canonicalRepository(sql, workspaceId).read(actorId, connectionId);
        if (hash(verifiedSnapshot(stored, actorId, contactId, connectionId)) !== hash(snapshot)) fail("CONFLICT");
        const after = await load(sql, workspaceId, actorId, contactId);
        if (after.pending || after.contact.payload.stage !== choice.stage || after.contact.payload.version !== version(contact.payload.version) + 1
          || after.contact.payload.lifecycleInitialization !== "ready" || after.connection.payload.lifecycleInitialization !== "ready") fail("CONFLICT");
        return { snapshot, replayed: false };
      });
    },
  };
}
