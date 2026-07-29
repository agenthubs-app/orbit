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

export const AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS = {
  runs: "agentRuns",
  runSteps: "agentRunSteps",
  actions: "agentActionsV2",
  outbox: "agentOutbox",
  receipts: "agentExecutionReceipts",
  analytics: "agentAnalyticsEvents",
} as const;

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
    lifecycleState: "active",
    searchText: JSON.stringify(entity),
    payload: { entity },
    createdAt: existingCreatedAt,
    updatedAt,
  };
}

async function list<TEntity>(
  store: LiveRecordStoreLike<AgentRuntimePayload>,
  workspaceId: string,
  collectionName: string,
  idKey: string,
): Promise<TEntity[]> {
  const records = await store.listRecords({ collectionName, workspaceId });
  return records.flatMap((record) => {
    const entity = entityFromRecord<TEntity>(record, idKey);
    return entity ? [entity] : [];
  });
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
    const events = await list<AgentOutboxEvent>(
      store,
      workspaceId,
      AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox,
      "outboxId",
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

      const [steps, actions, outbox, receipts] = await Promise.all([
        list<AgentRunStep>(
          store,
          workspaceId,
          AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runSteps,
          "stepId",
        ),
        list<AgentActionRecord>(
          store,
          workspaceId,
          AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions,
          "actionId",
        ),
        list<AgentOutboxEvent>(
          store,
          workspaceId,
          AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox,
          "outboxId",
        ),
        list<AgentExecutionReceipt>(
          store,
          workspaceId,
          AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.receipts,
          "receiptId",
        ),
      ]);

      return {
        run,
        steps: steps.filter((step) => step.runId === runId),
        actions: actions.filter((action) => action.runId === runId),
        outbox: outbox.filter((event) => event.runId === runId),
        receipts: receipts.filter((receipt) => receipt.runId === runId),
      };
    },
    async listActions(input = {}) {
      const actions = await list<AgentActionRecord>(
        store,
        workspaceId,
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions,
        "actionId",
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
    async getReceiptByIdempotencyKey(idempotencyKey) {
      const receipts = await list<AgentExecutionReceipt>(
        store,
        workspaceId,
        AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.receipts,
        "receiptId",
      );

      return (
        receipts.find(
          (receipt) =>
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
