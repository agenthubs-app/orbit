import type { LiveRecord } from "../../../shared/storage/live-record-store";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { applyLifecycleMigrationChanges, LifecycleMigrationError, lifecycleMigrationHash, lifecycleMigrationRecordHash, parseLifecycleMigrationManifest, planRelationshipLifecycleMigration, type LifecycleMigrationManifest, type LifecycleMigrationPlan } from "./migration-plan";
import { assertLifecycleMigrationReview, parseLifecycleMigrationReview, type LifecycleMigrationReview } from "./migration-review";
import { lifecycleRecordColumns } from "./record-snapshot";
import { normalizeRelationshipLifecycleInstant } from "./transition";

export interface LifecycleMigrationReceipt {
  migrationId: "relationship-lifecycle-v1";
  actorId: string; workspaceId: string; runId: string; operatorId: string;
  sourceHash: string; manifestHash: string; planHash: string;
  changedRecords: number; completedAt: string; replayed: boolean;
}
interface MigrationApplyInput {
  manifest: LifecycleMigrationManifest; review: LifecycleMigrationReview;
  actorId: string; operatorId: string; runId: string; now: string;
}
const sourceCollections = ["contacts", "connections", "tasks", "contact_detail_states"];
const receiptKeys = ["migrationId", "actorId", "workspaceId", "runId", "operatorId", "sourceHash", "manifestHash", "planHash", "changedRecords", "completedAt", "replayed"];

function identity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function snapshotInput(value: MigrationApplyInput, workspaceId: string): MigrationApplyInput {
  lifecycleMigrationHash(value);
  if (!value || typeof value !== "object" || Array.isArray(value) || Reflect.ownKeys(value).length !== 6 || !Reflect.ownKeys(value).every(key => typeof key === "string" && ["manifest", "review", "actorId", "operatorId", "runId", "now"].includes(key))) throw new LifecycleMigrationError("INVALID_INPUT");
  const input = structuredClone(value);
  input.manifest = parseLifecycleMigrationManifest(input.manifest);
  input.review = parseLifecycleMigrationReview(input.review);
  if (![input.actorId, input.operatorId, input.runId].every(identity) || input.manifest.actorId !== input.actorId || input.manifest.workspaceId !== workspaceId) throw new LifecycleMigrationError("INVALID_INPUT");
  try { input.now = normalizeRelationshipLifecycleInstant(input.now, "INVALID_TRANSITION"); }
  catch { throw new LifecycleMigrationError("INVALID_INPUT"); }
  if (input.review.actorId !== input.actorId || input.review.workspaceId !== workspaceId || input.review.reviewedBy !== input.operatorId || Date.parse(input.review.reviewedAt) > Date.parse(input.now)) throw new LifecycleMigrationError("INVALID_REVIEW");
  return input;
}

async function transactionWithRetry<T>(client: TransactionalPostgresClient, operation: (sql: TransactionalSqlExecutor) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await client.transaction(operation); }
    catch (error) {
      const details = error && typeof error === "object" ? error as { code?: unknown; constraint?: unknown } : {};
      const receiptRace = details.code === "23505" && details.constraint === "relationship_lifecycle_migration_receipts_pkey";
      if (attempt >= 2 || (details.code !== "40001" && details.code !== "40P01" && !receiptRace)) throw error;
    }
  }
}

// Complete workspace maintenance snapshot, including deleted and foreign-owned
// rows for ownership-conflict detection. Never expose this through a user API.
async function loadSource(sql: TransactionalSqlExecutor, workspaceId: string, lock: boolean): Promise<readonly LiveRecord[]> {
  const result = await sql.query<LiveRecord>(`select ${lifecycleRecordColumns} from orbit_records where workspace_id = $1 and collection_name = any($2::text[]) order by collection_name, record_id${lock ? " for update" : ""}`, [workspaceId, sourceCollections]);
  return result.rows;
}

function parseStoredReceipt(value: unknown, responseHash: unknown, input: MigrationApplyInput, workspaceId: string): LifecycleMigrationReceipt {
  try {
    if (typeof responseHash !== "string" || !/^[a-f0-9]{64}$/u.test(responseHash) || lifecycleMigrationHash(value) !== responseHash || !value || typeof value !== "object" || Array.isArray(value)) throw 0;
    if (Reflect.ownKeys(value).length !== receiptKeys.length || !Reflect.ownKeys(value).every(key => typeof key === "string" && receiptKeys.includes(key))) throw 0;
    const receipt = value as LifecycleMigrationReceipt;
    if (receipt.migrationId !== "relationship-lifecycle-v1" || receipt.actorId !== input.actorId || receipt.workspaceId !== workspaceId || receipt.runId !== input.runId || receipt.operatorId !== input.operatorId || receipt.sourceHash !== input.review.sourceHash || receipt.manifestHash !== input.review.manifestHash || receipt.planHash !== input.review.planHash || receipt.replayed !== false || !Number.isSafeInteger(receipt.changedRecords) || receipt.changedRecords < 0 || receipt.completedAt !== input.now) throw 0;
    if (normalizeRelationshipLifecycleInstant(receipt.completedAt, "INVALID_TRANSITION") !== receipt.completedAt) throw 0;
    return { ...receipt, replayed: true };
  } catch { throw new LifecycleMigrationError("INVALID_RECEIPT"); }
}

export function createPostgresLifecycleMigrationRepository({ client, workspaceId }: { client: TransactionalPostgresClient; workspaceId: string }): {
  dryRun(manifest: LifecycleMigrationManifest): Promise<LifecycleMigrationPlan>;
  apply(input: MigrationApplyInput): Promise<LifecycleMigrationReceipt>;
} {
  if (!identity(workspaceId)) throw new LifecycleMigrationError("INVALID_INPUT");
  return {
    async dryRun(value) {
      const manifest = parseLifecycleMigrationManifest(value);
      if (manifest.workspaceId !== workspaceId) throw new LifecycleMigrationError("INVALID_MANIFEST");
      return transactionWithRetry(client, async sql => planRelationshipLifecycleMigration({ manifest, records: await loadSource(sql, workspaceId, false) }));
    },
    async apply(value) {
      const input = snapshotInput(value, workspaceId);
      // The explicit execution clock is part of the command. Replays resend the
      // original command and receipt; they are not a fresh-read readiness check.
      const requestHash = lifecycleMigrationHash({ migrationId: "relationship-lifecycle-v1", workspaceId, ...input });
      return transactionWithRetry(client, async sql => {
        const receipts = await sql.query<{ request_hash: unknown; response_hash: unknown; response_receipt: unknown }>("select request_hash, response_hash, response_receipt from relationship_lifecycle_migration_receipts where workspace_id=$1 and actor_id=$2 and run_id=$3", [workspaceId, input.actorId, input.runId]);
        if (receipts.rows.length > 1) throw new LifecycleMigrationError("INVALID_RECEIPT");
        const stored = receipts.rows[0];
        if (stored) {
          if (stored.request_hash !== requestHash) throw new LifecycleMigrationError("CONFLICT");
          return parseStoredReceipt(stored.response_receipt, stored.response_hash, input, workspaceId);
        }
        const records = await loadSource(sql, workspaceId, true);
        const plan = planRelationshipLifecycleMigration({ manifest: input.manifest, records });
        assertLifecycleMigrationReview({ ...input, plan, workspaceId });
        const projected = applyLifecycleMigrationChanges(records, plan.changes);
        const originals = new Map(records.map(row => [JSON.stringify([row.collectionName, row.recordId]), row]));
        for (const change of plan.changes) {
          const original = originals.get(JSON.stringify([change.collectionName, change.recordId]));
          if (!original || lifecycleMigrationRecordHash(original) !== change.beforeHash) throw new LifecycleMigrationError("CONFLICT");
          const result = await sql.query<LiveRecord>(`update orbit_records set payload=payload || $4::jsonb, user_id=$5 where workspace_id=$1 and collection_name=$2 and record_id=$3 and user_id is not distinct from $6 and lifecycle_state <> 'deleted' returning ${lifecycleRecordColumns}`, [workspaceId, change.collectionName, change.recordId, change.payload, change.owner ?? original.userId ?? null, original.userId ?? null]);
          if (result.rows.length !== 1 || lifecycleMigrationRecordHash(result.rows[0]) !== change.afterHash) throw new LifecycleMigrationError("CONFLICT");
        }
        const receipt: LifecycleMigrationReceipt = { migrationId: "relationship-lifecycle-v1", actorId: input.actorId, workspaceId, runId: input.runId, operatorId: input.operatorId, sourceHash: plan.sourceHash, manifestHash: plan.manifestHash, planHash: plan.planHash, changedRecords: plan.changes.length, completedAt: input.now, replayed: false };
        const auditId = `lifecycle-migration:${lifecycleMigrationHash([workspaceId, input.actorId, input.runId])}`;
        const audit = { schemaVersion: 1, ...receipt, reviewedBy: input.review.reviewedBy, reviewedAt: input.review.reviewedAt, changes: plan.changes.map(change => ({ collectionName: change.collectionName, recordId: change.recordId, fields: [...(change.owner === undefined ? [] : ["userId"]), ...Object.keys(change.payload).map(key => `payload.${key}`)].sort() })) };
        await sql.query("insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at) values ($1,'relationship_lifecycle_migration_audits',$2,$3,'manual','relationship-lifecycle-v1',$4,$5,$5)", [workspaceId, auditId, input.actorId, audit, input.now]);
        await sql.query("insert into relationship_lifecycle_migration_receipts (workspace_id,actor_id,run_id,request_hash,response_hash,response_receipt,created_at) values ($1,$2,$3,$4,$5,$6,$7)", [workspaceId, input.actorId, input.runId, requestHash, lifecycleMigrationHash(receipt), receipt, input.now]);
        // Include audit/receipt trigger effects in the final exact-state check.
        const persisted = await loadSource(sql, workspaceId, false);
        const after = planRelationshipLifecycleMigration({ manifest: { ...input.manifest, ownerRepairs: [] }, records: persisted });
        if (lifecycleMigrationHash(persisted) !== lifecycleMigrationHash(projected) || !after.applyEligible || after.changes.length !== 0) throw new LifecycleMigrationError("CONFLICT");
        return receipt;
      });
    },
  };
}
