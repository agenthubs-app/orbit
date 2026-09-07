import { isConnectionStage } from "../../../shared/domain/source-types";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { RelationshipLifecycleError, type RelationshipLifecycleSnapshot, type RelationshipLifecycleTask } from "./contract";
import { applyLifecycleMutationPlan, validateLifecycleMutationInput, type RelationshipLifecycleRepository } from "./repository";
import { normalizeRelationshipLifecycleInstant } from "./transition";

interface RecordRow {
  workspace_id: string;
  collection_name: string;
  record_id: string;
  user_id: string;
  payload: Record<string, unknown>;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new RelationshipLifecycleError("INVALID_TRANSITION", "Stored lifecycle field is invalid.");
  return value;
}

function recordVersion(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new RelationshipLifecycleError("CONFLICT", "Stored lifecycle version is invalid.");
  return value;
}

function assertOwner(row: RecordRow, workspaceId: string, actorId: string): void {
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) throw new RelationshipLifecycleError("INVALID_TRANSITION", "Stored record payload is malformed.");
  if (row.workspace_id !== workspaceId || row.user_id !== actorId || row.payload.id !== row.record_id) {
    throw new RelationshipLifecycleError("FORBIDDEN", "Stored record ownership is inconsistent.");
  }
}

function receiptObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RelationshipLifecycleError("INVALID_TRANSITION", "Stored receipt is malformed.");
  return value as Record<string, unknown>;
}

function receiptDate(value: unknown): string {
  return normalizeRelationshipLifecycleInstant(value, "INVALID_TRANSITION");
}

function receiptVersion(value: unknown): number {
  if (value === undefined) throw new RelationshipLifecycleError("CONFLICT", "Stored receipt version is missing.");
  return recordVersion(value);
}

function parseReceiptSnapshot(value: unknown, actorId: string, connectionId: string): RelationshipLifecycleSnapshot {
  const snapshot = receiptObject(value);
  const connection = receiptObject(snapshot.connection);
  if (connection.actorId !== actorId || connection.connectionId !== connectionId) throw new RelationshipLifecycleError("IDEMPOTENCY_CONFLICT", "Receipt belongs to another command identity.");
  const contactId = requiredString(connection.contactId);
  if (!isConnectionStage(connection.stage) || !Array.isArray(snapshot.tasks)) throw new RelationshipLifecycleError("INVALID_TRANSITION", "Stored receipt stage or tasks are invalid.");
  const tasks: RelationshipLifecycleTask[] = snapshot.tasks.map((value) => {
    const task = receiptObject(value);
    if (task.actorId !== actorId || task.connectionId !== connectionId || task.contactId !== contactId) throw new RelationshipLifecycleError("FORBIDDEN", "Receipt task belongs to another relationship.");
    if ((task.purpose !== "follow_up" && task.purpose !== "maintenance") || (task.status !== "open" && task.status !== "scheduled" && task.status !== "completed" && task.status !== "dismissed")) throw new RelationshipLifecycleError("INVALID_TASK", "Stored receipt task is invalid.");
    return { actorId, connectionId, contactId, taskId: requiredString(task.taskId), title: requiredString(task.title), status: task.status, purpose: task.purpose, dueAt: receiptDate(task.dueAt), createdAt: receiptDate(task.createdAt), updatedAt: receiptDate(task.updatedAt), version: receiptVersion(task.version) };
  });
  if (new Set(tasks.map(({ taskId }) => taskId)).size !== tasks.length) throw new RelationshipLifecycleError("INVALID_TASK", "Stored receipt contains duplicate tasks.");
  return {
    connection: { actorId, connectionId, contactId, stage: connection.stage, activeGoal: connection.activeGoal === null ? null : requiredString(connection.activeGoal), createdAt: receiptDate(connection.createdAt), updatedAt: receiptDate(connection.updatedAt), version: receiptVersion(connection.version) },
    tasks,
  };
}

async function loadSnapshot(sql: TransactionalSqlExecutor, workspaceId: string, actorId: string, connectionId: string): Promise<RelationshipLifecycleSnapshot | null> {
  const records = await sql.query<RecordRow>("select * from orbit_records where workspace_id = $1 and collection_name = 'connections' and record_id = $2 and user_id = $3 and lifecycle_state <> 'deleted' for update", [workspaceId, connectionId, actorId]);
  const row = records.rows[0];
  if (!row) return null;
  assertOwner(row, workspaceId, actorId);
  const payload = row.payload;
  if (payload.accountId !== actorId) throw new RelationshipLifecycleError("FORBIDDEN", "Connection actor does not match record owner.");
  if (!isConnectionStage(payload.stage)) throw new RelationshipLifecycleError("INVALID_TRANSITION", "Connection requires stage migration.");
  const contactId = requiredString(payload.contactId);
  const contacts = await sql.query<RecordRow>("select * from orbit_records where workspace_id = $1 and collection_name = 'contacts' and record_id = $2 and user_id = $3 and lifecycle_state <> 'deleted' for update", [workspaceId, contactId, actorId]);
  if (!contacts.rows[0]) throw new RelationshipLifecycleError("FORBIDDEN", "Referenced contact is not owned by the actor.");
  assertOwner(contacts.rows[0], workspaceId, actorId);
  const taskRecords = await sql.query<RecordRow>("select * from orbit_records where workspace_id = $1 and collection_name = 'tasks' and user_id = $2 and payload ->> 'connectionId' = $3 and lifecycle_state <> 'deleted' order by record_id for update", [workspaceId, actorId, connectionId]);
  const tasks: RelationshipLifecycleTask[] = [];
  for (const taskRow of taskRecords.rows) {
    assertOwner(taskRow, workspaceId, actorId);
    const task = taskRow.payload;
    // General tasks are not relationship obligations and remain untouched.
    if (task.relationshipPurpose === undefined) continue;
    if (task.connectionId !== connectionId || task.contactId !== contactId) throw new RelationshipLifecycleError("FORBIDDEN", "Task contact identity is missing or belongs to another relationship.");
    if ((task.relationshipPurpose !== "follow_up" && task.relationshipPurpose !== "maintenance") || (task.status !== "open" && task.status !== "scheduled" && task.status !== "completed" && task.status !== "dismissed") || typeof task.dueAt !== "string" || !Number.isFinite(Date.parse(task.dueAt))) {
      throw new RelationshipLifecycleError("INVALID_TASK", "Stored relationship task is invalid.");
    }
    tasks.push({ actorId, connectionId, contactId, taskId: taskRow.record_id, title: requiredString(task.title), dueAt: normalizeRelationshipLifecycleInstant(task.dueAt, "INVALID_TASK"), purpose: task.relationshipPurpose, status: task.status, createdAt: receiptDate(task.createdAt), updatedAt: receiptDate(task.updatedAt), version: recordVersion(task.version) });
  }
  return {
    connection: { actorId, connectionId, contactId, stage: payload.stage, activeGoal: payload.activeGoal == null ? null : requiredString(payload.activeGoal), version: recordVersion(payload.version), createdAt: receiptDate(payload.createdAt), updatedAt: receiptDate(payload.updatedAt) },
    tasks,
  };
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
}

// SERIALIZABLE failures must restart the entire transaction, including receipt lookup.
async function transactionWithRetry<T>(client: TransactionalPostgresClient, operation: (sql: TransactionalSqlExecutor) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.transaction(operation);
    } catch (error) {
      const code = errorCode(error);
      const receiptRace = code === "23505" && error !== null && typeof error === "object" && "constraint" in error && error.constraint === "relationship_lifecycle_command_receipts_pkey";
      if (attempt >= 2 || (code !== "40001" && code !== "40P01" && !receiptRace)) throw error;
    }
  }
}

export function createPostgresRelationshipLifecycleRepository({ client, workspaceId }: { client: TransactionalPostgresClient; workspaceId: string }): RelationshipLifecycleRepository {
  if (!workspaceId?.trim()) throw new Error("A lifecycle workspace is required.");
  return {
    read: (actorId, connectionId) => transactionWithRetry(client, (sql) => loadSnapshot(sql, workspaceId, actorId, connectionId)),
    async mutate(input, operation) {
      input = { ...input };
      validateLifecycleMutationInput(input);
      return transactionWithRetry(client, async (sql) => {
        const receipts = await sql.query<{ command: string; request_hash: string; response_snapshot: unknown }>("select command, request_hash, response_snapshot from relationship_lifecycle_command_receipts where workspace_id = $1 and actor_id = $2 and idempotency_key = $3", [workspaceId, input.actorId, input.idempotencyKey]);
        const receipt = receipts.rows[0];
        if (receipt) {
          if (receipt.command !== input.command || receipt.request_hash !== input.requestHash) {
            throw new RelationshipLifecycleError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for another command.");
          }
          return { snapshot: parseReceiptSnapshot(receipt.response_snapshot, input.actorId, input.connectionId), replayed: true };
        }
        const before = await loadSnapshot(sql, workspaceId, input.actorId, input.connectionId);
        if (!before) throw new RelationshipLifecycleError("NOT_FOUND", "Connection not found.");
        if (before.connection.version !== input.expectedVersion) throw new RelationshipLifecycleError("CONFLICT", "Connection version has changed.");
        // SQL awaits must not expose the validated plan to callback-owned mutation.
        const plan = structuredClone(operation(structuredClone(before)));
        const snapshot = applyLifecycleMutationPlan(input, before, plan);
        const connection = snapshot.connection;
        const updated = await sql.query("update orbit_records set payload = payload || $4::jsonb, updated_at = $5 where workspace_id = $1 and collection_name = 'connections' and record_id = $2 and user_id = $3 and coalesce((payload ->> 'version')::bigint, 1) = $6 returning record_id", [workspaceId, input.connectionId, input.actorId, { stage: connection.stage, activeGoal: connection.activeGoal, version: connection.version, updatedAt: connection.updatedAt }, connection.updatedAt, input.expectedVersion]);
        if (updated.rows.length !== 1) throw new RelationshipLifecycleError("CONFLICT", "Connection version has changed.");
        for (const task of [...plan.upsertTasks, ...plan.dismissTasks]) {
          const payload = { id: task.taskId, connectionId: task.connectionId, contactId: task.contactId, title: task.title, status: task.status, dueAt: task.dueAt, relationshipPurpose: task.purpose, version: task.version, createdAt: task.createdAt, updatedAt: task.updatedAt };
          const previous = before.tasks.find(({ taskId }) => taskId === task.taskId);
          if (previous) {
            const result = await sql.query("update orbit_records set payload = payload || $4::jsonb, updated_at = $5 where workspace_id = $1 and collection_name = 'tasks' and record_id = $2 and user_id = $3 and payload ->> 'connectionId' = $6 and coalesce((payload ->> 'version')::bigint, 1) = $7 returning record_id", [workspaceId, task.taskId, input.actorId, payload, task.updatedAt, input.connectionId, previous.version]);
            if (result.rows.length !== 1) throw new RelationshipLifecycleError("CONFLICT", "Task version has changed.");
          } else {
            try {
              await sql.query("insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'tasks', $2, $3, $4, $5, $6, $7, $8)", [workspaceId, task.taskId, input.actorId, plan.audit.source.type, plan.audit.source.id, { ...payload, source: plan.audit.source, evidenceIds: [] }, task.createdAt, task.updatedAt]);
            } catch (error) {
              if (errorCode(error) === "23505") throw new RelationshipLifecycleError("INVALID_TASK", "Task identifier already exists.");
              throw error;
            }
          }
        }
        const audit = plan.audit;
        await sql.query("insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at) values ($1, 'relationship_lifecycle_audits', $2, $3, $4, $5, $6, $7, $7)", [workspaceId, audit.auditId, input.actorId, audit.source.type, audit.source.id, audit, audit.occurredAt]);
        await sql.query("insert into relationship_lifecycle_command_receipts (workspace_id, actor_id, idempotency_key, command, request_hash, response_snapshot, created_at) values ($1, $2, $3, $4, $5, $6, $7)", [workspaceId, input.actorId, input.idempotencyKey, input.command, input.requestHash, snapshot, audit.occurredAt]);
        return { snapshot, replayed: false };
      });
    },
  };
}
