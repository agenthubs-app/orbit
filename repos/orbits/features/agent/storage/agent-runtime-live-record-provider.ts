import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import type {
  AgentActionRecord,
  AgentAnalyticsEvent,
  AgentExecutionReceipt,
  AgentOutboxEvent,
  AgentRun,
  AgentRunDetail,
  AgentRunStep,
} from "../runtime/contract";
import type { AgentRuntimeRepository } from "../runtime/repository";

const OUTBOX_LEASE_TIMEOUT_MS = 15 * 60_000;

/**
 * Sprint 0103 (AI trace A3): every step, action, outbox and receipt row carries
 * its run in the record envelope (target_type/target_id, indexed by
 * orbit_records_target_idx), so one run is read exactly instead of listing the
 * actor's whole history and filtering in memory.
 */
export const AGENT_RUN_TARGET_TYPE = "agent_run";
/** Rows one run may hold across steps, actions, outbox and receipts. */
export const AGENT_RUN_CHILD_READ_LIMIT = 500;
/** Newest actions the Agent ledger lists; older ones age out (A4 retention is 1 year). */
export const AGENT_ACTION_LIST_LIMIT = 500;
/** Store-only (mock, no SQL client) outbox scan; live claims go through SQL. */
const STORE_OUTBOX_SCAN_LIMIT = 1000;

/**
 * Backfills the run target on rows written before 0103: agent runtime child
 * rows (in the actor subspaces) and AI request records. Idempotent; it only
 * updates rows whose target is still empty. Deletes nothing.
 */
export const AGENT_RUN_TARGET_BACKFILL_SQL = `
  update orbit_records
     set target_type = '${AGENT_RUN_TARGET_TYPE}',
         target_id = case
           when collection_name = 'orbit_agent_chat_requests' then payload->'result'->'data'->>'runId'
           else payload->'entity'->>'runId'
         end
   where target_id is null
     and (
       (collection_name in ('agentRunSteps', 'agentActionsV2', 'agentOutbox', 'agentExecutionReceipts')
         and coalesce(payload->'entity'->>'runId', '') <> '')
       or (collection_name = 'orbit_agent_chat_requests'
         and coalesce(payload->'result'->'data'->>'runId', '') <> '')
     )
`;

export const AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS = {
  runs: "agentRuns",
  runSteps: "agentRunSteps",
  actions: "agentActionsV2",
  outbox: "agentOutbox",
  receipts: "agentExecutionReceipts",
  analytics: "agentAnalyticsEvents",
} as const;

/** Collections that make up a run detail; only these carry the run target. */
const RUN_CHILD_COLLECTIONS: ReadonlySet<string> = new Set([
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runSteps,
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions,
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox,
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.receipts,
]);

interface AgentRuntimePayload extends Record<string, unknown> {
  entity: unknown;
}

export interface StorageAgentRuntimeRepositoryOptions {
  store: LiveRecordStoreLike<AgentRuntimePayload>;
  workspaceId: string;
  sqlClient?: LiveRecordSqlClient;
}

export interface ConfiguredAgentRuntimeRepositoryOptions {
  env?: LiveDatabaseEnv;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown, key: string): string | null {
  return isRecord(value) && typeof value[key] === "string"
    ? (value[key] as string)
    : null;
}

function entityFromRecord<TEntity>(
  record: LiveRecord<AgentRuntimePayload>,
  idKey: string,
): TEntity | null {
  const entity = record.payload.entity;
  return stringField(entity, idKey) ? (entity as TEntity) : null;
}

function recordFor(
  workspaceId: string,
  collectionName: string,
  recordId: string,
  entity: Record<string, unknown>,
  now: string,
): LiveRecord<AgentRuntimePayload> {
  const existingCreatedAt =
    typeof entity.createdAt === "string" ? entity.createdAt : now;
  const updatedAt =
    typeof entity.updatedAt === "string" ? entity.updatedAt : now;
  const runId =
    RUN_CHILD_COLLECTIONS.has(collectionName) &&
    typeof entity.runId === "string" &&
    entity.runId
      ? entity.runId
      : null;
  const evidenceIds = Array.isArray(entity.evidenceIds)
    ? entity.evidenceIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  return {
    workspaceId,
    collectionName,
    recordId,
    sourceType: "agent_action",
    sourceId: recordId,
    sourceLabel: `Orbit Agent ${collectionName}`,
    evidenceIds,
    ...(runId ? { targetType: AGENT_RUN_TARGET_TYPE, targetId: runId } : {}),
    lifecycleState: "active",
    searchText: JSON.stringify(entity),
    payload: { entity },
    createdAt: existingCreatedAt,
    updatedAt,
  };
}

function entities<TEntity>(
  records: readonly LiveRecord<AgentRuntimePayload>[],
  idKey: string,
): TEntity[] {
  return records.flatMap((record) => {
    const entity = entityFromRecord<TEntity>(record, idKey);
    return entity ? [entity] : [];
  });
}

async function listBounded<TEntity>(
  store: LiveRecordStoreLike<AgentRuntimePayload>,
  workspaceId: string,
  collectionName: string,
  idKey: string,
  limit: number,
): Promise<TEntity[]> {
  const records = await store.listRecords({ limit, collectionName, workspaceId });
  if (records.length >= limit) {
    console.warn(JSON.stringify({ event: "agent_runtime_list_limit_reached", collectionName, limit }));
  }
  return entities<TEntity>(records, idKey);
}

/** Every step, action, outbox and receipt row of one run, by its envelope target. */
async function runChildRecords(
  store: LiveRecordStoreLike<AgentRuntimePayload>,
  workspaceId: string,
  runId: string,
  collectionName?: string,
): Promise<readonly LiveRecord<AgentRuntimePayload>[]> {
  const records = await store.listRecords({
    workspaceId,
    ...(collectionName ? { collectionName } : {}),
    targetType: AGENT_RUN_TARGET_TYPE,
    targetId: runId,
    limit: AGENT_RUN_CHILD_READ_LIMIT,
  });
  if (records.length >= AGENT_RUN_CHILD_READ_LIMIT) {
    console.warn(JSON.stringify({ event: "agent_run_child_read_limit_reached", runId, limit: AGENT_RUN_CHILD_READ_LIMIT }));
  }
  return records;
}

async function get<TEntity>(
  store: LiveRecordStoreLike<AgentRuntimePayload>,
  workspaceId: string,
  collectionName: string,
  recordId: string,
  idKey: string,
): Promise<TEntity | null> {
  const record = await store.getRecord({
    collectionName,
    recordId,
    workspaceId,
  });

  return record ? entityFromRecord<TEntity>(record, idKey) : null;
}

export function createStorageAgentRuntimeRepository({
  store,
  workspaceId,
  sqlClient,
}: StorageAgentRuntimeRepositoryOptions): AgentRuntimeRepository {
  let claimQueue: Promise<void> = Promise.resolve();

  async function save(
    collectionName: string,
    recordId: string,
    entity: Record<string, unknown>,
  ): Promise<void> {
    await store.upsertRecord(
      recordFor(
        workspaceId,
        collectionName,
        recordId,
        entity,
        new Date().toISOString(),
      ),
    );
  }

  async function claimWithStore(input: {
    now: string;
    limit: number;
    workerId: string;
    actionId?: string;
  }): Promise<AgentOutboxEvent[]> {
    const leaseExpiredBefore = new Date(
      Date.parse(input.now) - OUTBOX_LEASE_TIMEOUT_MS,
    ).toISOString();
    const events = await listBounded<AgentOutboxEvent>(
      store,
      workspaceId,
      AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox,
      "outboxId",
      STORE_OUTBOX_SCAN_LIMIT,
    );
    const claimed = events
      .filter(
        (event) =>
          ((event.status === "pending" ||
            event.status === "retry_scheduled") ||
            (event.status === "processing" &&
              Boolean(event.leasedAt) &&
              event.leasedAt! <= leaseExpiredBefore)) &&
          event.availableAt <= input.now &&
          (!input.actionId || event.actionId === input.actionId),
      )
      .sort((left, right) =>
        left.availableAt.localeCompare(right.availableAt),
      )
      .slice(0, Math.max(0, input.limit))
      .map((event) => ({
        ...event,
        status: "processing" as const,
        attempt: event.attempt + 1,
        leasedAt: input.now,
        leaseOwner: input.workerId,
        updatedAt: input.now,
      }));
    for (const event of claimed) {
      await save(
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox,
        event.outboxId,
        event as unknown as Record<string, unknown>,
      );
    }
    return claimed;
  }

  return {
    async getRun(runId): Promise<AgentRunDetail | null> {
      const run = await get<AgentRun>(
        store,
        workspaceId,
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runs,
        runId,
        "runId",
      );
      if (!run) return null;

      const children = await runChildRecords(store, workspaceId, runId);
      const inCollection = (collectionName: string) =>
        children.filter((record) => record.collectionName === collectionName);
      const steps = entities<AgentRunStep>(inCollection(AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runSteps), "stepId");
      const actions = entities<AgentActionRecord>(inCollection(AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions), "actionId");
      const outbox = entities<AgentOutboxEvent>(inCollection(AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox), "outboxId");
      const receipts = entities<AgentExecutionReceipt>(inCollection(AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.receipts), "receiptId");

      return {
        run,
        steps: steps.filter((step) => step.runId === runId),
        actions: actions.filter((action) => action.runId === runId),
        outbox: outbox.filter((event) => event.runId === runId),
        receipts: receipts.filter((receipt) => receipt.runId === runId),
      };
    },
    async listActions(input = {}) {
      const actions = await listBounded<AgentActionRecord>(
        store,
        workspaceId,
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions,
        "actionId",
        AGENT_ACTION_LIST_LIMIT,
      );

      return actions
        .filter(
          (action) =>
            (!input.status || action.status === input.status) &&
            (!input.workflowKey ||
              action.workflowKey === input.workflowKey) &&
            (!input.createdAfter ||
              action.createdAt >= input.createdAfter) &&
            (!input.createdBefore ||
              action.createdAt <= input.createdBefore),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    getAction: (actionId) =>
      get<AgentActionRecord>(
        store,
        workspaceId,
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions,
        actionId,
        "actionId",
      ),
    saveRun: (run) =>
      save(
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runs,
        run.runId,
        run as unknown as Record<string, unknown>,
      ),
    saveRunStep: (step) =>
      save(
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runSteps,
        step.stepId,
        step as unknown as Record<string, unknown>,
      ),
    saveAction: (action) =>
      save(
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions,
        action.actionId,
        action as unknown as Record<string, unknown>,
      ),
    async approveActionWithOutbox(action, events) {
      // Persist intent events first. The worker requires the action itself to be
      // approved, so an interrupted write can leave only harmless orphan events;
      // it can never execute an unconfirmed action.
      for (const event of events) {
        await save(
          AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox,
          event.outboxId,
          event as unknown as Record<string, unknown>,
        );
      }
      await save(
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions,
        action.actionId,
        action as unknown as Record<string, unknown>,
      );
    },
    saveOutbox: (event) =>
      save(
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox,
        event.outboxId,
        event as unknown as Record<string, unknown>,
      ),
    saveReceipt: (receipt) =>
      save(
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.receipts,
        receipt.receiptId,
        receipt as unknown as Record<string, unknown>,
      ),
    saveAnalyticsEvent: (event) =>
      save(
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.analytics,
        event.eventId,
        event as unknown as Record<string, unknown>,
      ),
    async claimReadyOutbox(input) {
      if (sqlClient) {
        const leaseExpiredBefore = new Date(
          Date.parse(input.now) - OUTBOX_LEASE_TIMEOUT_MS,
        ).toISOString();
        const result = await sqlClient.query<{
          payload: AgentRuntimePayload | string;
        }>(
          `
            with ready as (
              select record_id
              from orbit_records
              where workspace_id = $1
                and collection_name = $2
                and lifecycle_state <> 'deleted'
                and (
                  payload->'entity'->>'status' in ('pending', 'retry_scheduled')
                  or (
                    payload->'entity'->>'status' = 'processing'
                    and (payload->'entity'->>'leasedAt')::timestamptz <= $7::timestamptz
                  )
                )
                and (payload->'entity'->>'availableAt')::timestamptz <= $3::timestamptz
                and ($6::text is null or payload->'entity'->>'actionId' = $6)
              order by (payload->'entity'->>'availableAt')::timestamptz asc
              for update skip locked
              limit $4
            )
            update orbit_records as records
            set payload = jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          records.payload,
                          '{entity,status}',
                          '"processing"'::jsonb
                        ),
                        '{entity,attempt}',
                        to_jsonb(coalesce((records.payload->'entity'->>'attempt')::int, 0) + 1)
                      ),
                      '{entity,leasedAt}',
                      to_jsonb($3::text)
                    ),
                    '{entity,leaseOwner}',
                    to_jsonb($5::text)
                  ),
                  '{entity,updatedAt}',
                  to_jsonb($3::text)
                ),
                updated_at = $3::timestamptz
            from ready
            where records.workspace_id = $1
              and records.collection_name = $2
              and records.record_id = ready.record_id
            returning records.payload
          `,
          [
            workspaceId,
            AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox,
            input.now,
            Math.max(0, input.limit),
            input.workerId,
            input.actionId ?? null,
            leaseExpiredBefore,
          ],
        );
        return result.rows.flatMap((row) => {
          const payload =
            typeof row.payload === "string"
              ? (JSON.parse(row.payload) as AgentRuntimePayload)
              : row.payload;
          const entity = payload.entity;
          return stringField(entity, "outboxId")
            ? [entity as AgentOutboxEvent]
            : [];
        });
      }

      const claimed = claimQueue.then(
        () => claimWithStore(input),
        () => claimWithStore(input),
      );
      claimQueue = claimed.then(
        () => undefined,
        () => undefined,
      );
      return claimed;
    },
    async getReceiptByIdempotencyKey(idempotencyKey, runId) {
      const receipts = entities<AgentExecutionReceipt>(
        await runChildRecords(
          store,
          workspaceId,
          runId,
          AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.receipts,
        ),
        "receiptId",
      );

      return (
        receipts.find(
          (receipt) =>
            receipt.runId === runId &&
            receipt.idempotencyKey === idempotencyKey &&
            (receipt.status === "completed" ||
              receipt.status === "undone"),
        ) ?? null
      );
    },
  };
}

export function createConfiguredAgentRuntimeRepository({
  env,
}: ConfiguredAgentRuntimeRepositoryOptions = {}): AgentRuntimeRepository | null {
  const configured =
    createConfiguredPostgresLiveRecordStore<AgentRuntimePayload>({ env });

  return configured
    ? createStorageAgentRuntimeRepository({
        sqlClient: configured.client,
        store: configured.store,
        workspaceId: configured.workspaceId,
      })
    : null;
}
