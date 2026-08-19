import type {
  EventAnalyticsRoiMetrics,
  EventAnalyticsRoiSnapshotState,
  EventAnalyticsRoiSourceWatermark,
} from "./contract";
import type {
  EventOperationsPostgresRuntime,
  EventOperationsSqlExecutor,
} from "../event-operations/storage/postgres-client";
import {
  EVENT_ANALYTICS_ROI_FORMULA_HASH,
  EVENT_ANALYTICS_ROI_METRIC_VERSION,
  EVENT_ANALYTICS_ROI_SQL,
  eventAnalyticsLiveRoiFromRow,
} from "./roi";

type Row = Record<string, unknown>;

export interface EventAnalyticsRoiSnapshot {
  metrics: EventAnalyticsRoiMetrics;
  snapshot: EventAnalyticsRoiSnapshotState;
}

export interface EventAnalyticsRoiSnapshotFinalizer {
  finalize(input: {
    eventId: string;
    expectedRevision?: number;
    recomputeReason?: string;
  }): Promise<EventAnalyticsRoiSnapshot>;
  finalizeDue(input?: {
    eventIds?: readonly string[];
    limit?: number;
  }): Promise<{
    finalized: number;
  }>;
}

function requiredScope(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512) {
    throw new Error(`Event analytics snapshot has an invalid ${field}.`);
  }
  return normalized;
}

function object(value: unknown, field: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Event analytics snapshot has an invalid ${field}.`);
  }
  return value as Row;
}

function integer(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Event analytics snapshot has an invalid ${field}.`);
  }
  return parsed;
}

function isoTimestamp(value: unknown, field: string): string {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Event analytics snapshot has an invalid ${field}.`);
  }
  return new Date(parsed).toISOString();
}

function nullableTimestamp(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : isoTimestamp(value, field);
}

function storedRate(value: unknown, field: string) {
  const rate = object(value, field);
  const numerator = integer(rate.numerator, `${field}.numerator`);
  const denominator = integer(rate.denominator, `${field}.denominator`);
  const expectedValue = denominator === 0 ? null : numerator / denominator;
  if (rate.value !== expectedValue) {
    throw new Error(`Event analytics snapshot has an invalid ${field}.value.`);
  }
  return { denominator, numerator, value: expectedValue };
}

function storedMetrics(value: unknown): EventAnalyticsRoiMetrics {
  const metrics = object(value, "metrics");
  const coverage = object(metrics.attributionCoverage, "attributionCoverage");
  const mutual = object(metrics.mutualConnections, "mutualConnections");
  const completed = integer(
    metrics.completedAttributedAgentOperations,
    "completedAttributedAgentOperations",
  );
  const stronglyAttributed = integer(
    coverage.stronglyAttributedCompletedOperations,
    "stronglyAttributedCompletedOperations",
  );
  if (completed !== stronglyAttributed) {
    throw new Error("Event analytics snapshot completed action totals disagree.");
  }
  const checkedInParticipants = integer(
    metrics.checkedInParticipants,
    "checkedInParticipants",
  );
  const effectiveConnectionParticipants = integer(
    metrics.effectiveConnectionParticipants,
    "effectiveConnectionParticipants",
  );
  const effectiveConnectionRate = storedRate(
    metrics.effectiveConnectionRate,
    "effectiveConnectionRate",
  );
  if (
    effectiveConnectionRate.numerator !== effectiveConnectionParticipants ||
    effectiveConnectionRate.denominator !== checkedInParticipants
  ) {
    throw new Error("Event analytics snapshot effective connection rate disagrees.");
  }
  const strongActions = object(metrics.strongActions, "strongActions");
  const declared = integer(
    coverage.declaredCompletedOperations,
    "declaredCompletedOperations",
  );
  const coverageRate = storedRate(coverage.rate, "attributionCoverage.rate");
  if (
    coverageRate.numerator !== stronglyAttributed ||
    coverageRate.denominator !== declared
  ) {
    throw new Error("Event analytics snapshot attribution coverage disagrees.");
  }
  const distinctConnectedCheckIns = integer(
    mutual.distinctConnectedCheckIns,
    "distinctConnectedCheckIns",
  );
  const participationRate = storedRate(
    mutual.participationRate,
    "mutualConnections.participationRate",
  );
  if (participationRate.numerator !== distinctConnectedCheckIns) {
    throw new Error("Event analytics snapshot participation rate disagrees.");
  }
  return {
    attributionCoverage: {
      declaredCompletedOperations: declared,
      stronglyAttributedCompletedOperations: stronglyAttributed,
      rate: coverageRate,
    },
    checkedInParticipants,
    completedAttributedAgentOperations: completed,
    effectiveConnectionPairs: integer(
      metrics.effectiveConnectionPairs,
      "effectiveConnectionPairs",
    ),
    effectiveConnectionParticipants,
    effectiveConnectionRate,
    mutualConnections: {
      acceptedRelationshipPairs: integer(
        mutual.acceptedRelationshipPairs,
        "acceptedRelationshipPairs",
      ),
      mutuallyCheckedInPairs: integer(
        mutual.mutuallyCheckedInPairs,
        "mutuallyCheckedInPairs",
      ),
      distinctConnectedCheckIns,
      participationRate,
    },
    strongActions: {
      appointments: integer(strongActions.appointments, "strongActions.appointments"),
      followupReminders: integer(
        strongActions.followupReminders,
        "strongActions.followupReminders",
      ),
      humanEncounterNotes: integer(
        strongActions.humanEncounterNotes,
        "strongActions.humanEncounterNotes",
      ),
      messageDrafts: integer(
        strongActions.messageDrafts,
        "strongActions.messageDrafts",
      ),
    },
  };
}

function storedWatermark(value: unknown): EventAnalyticsRoiSourceWatermark {
  const watermark = object(value, "sourceWatermark");
  return {
    appointmentCount: integer(watermark.appointmentCount, "appointmentCount"),
    appointmentUpdatedAt: nullableTimestamp(
      watermark.appointmentUpdatedAt,
      "appointmentUpdatedAt",
    ),
    checkInCount: integer(watermark.checkInCount, "checkInCount"),
    checkInRevision: integer(watermark.checkInRevision, "checkInRevision"),
    completedAgentReceiptCount: integer(
      watermark.completedAgentReceiptCount,
      "completedAgentReceiptCount",
    ),
    completedAgentReceiptUpdatedAt: nullableTimestamp(
      watermark.completedAgentReceiptUpdatedAt,
      "completedAgentReceiptUpdatedAt",
    ),
    configurationVersion: integer(
      watermark.configurationVersion,
      "configurationVersion",
    ),
    membershipCount: integer(watermark.membershipCount, "membershipCount"),
    membershipRevision: integer(
      watermark.membershipRevision,
      "membershipRevision",
    ),
    relationshipPairCount: integer(
      watermark.relationshipPairCount,
      "relationshipPairCount",
    ),
    relationshipAcceptedAt: nullableTimestamp(
      watermark.relationshipAcceptedAt,
      "relationshipAcceptedAt",
    ),
  };
}

const READ_SNAPSHOT_SQL = `
  select
    snapshot.metric_version,
    snapshot.revision::text as revision,
    snapshot.formula_hash,
    snapshot.window_ends_at,
    snapshot.finalized_at,
    snapshot.source_watermark,
    snapshot.metrics
  from event_analytics_roi_snapshot_heads head
  join event_analytics_roi_snapshots snapshot
    on snapshot.workspace_id = head.workspace_id
    and snapshot.event_id = head.event_id
    and snapshot.metric_version = head.metric_version
    and snapshot.revision = head.revision
  where head.workspace_id = $1
    and head.event_id = $2
    and head.metric_version = $3
`;

function snapshotFromRow(row: Row): EventAnalyticsRoiSnapshot {
  if (
    row.metric_version !== EVENT_ANALYTICS_ROI_METRIC_VERSION ||
    row.formula_hash !== EVENT_ANALYTICS_ROI_FORMULA_HASH
  ) {
    throw new Error("Event analytics snapshot formula identity is invalid.");
  }
  return {
    metrics: storedMetrics(row.metrics),
    snapshot: {
      finalizedAt: isoTimestamp(row.finalized_at, "finalizedAt"),
      formulaHash: EVENT_ANALYTICS_ROI_FORMULA_HASH,
      metricVersion: EVENT_ANALYTICS_ROI_METRIC_VERSION,
      revision: integer(row.revision, "revision"),
      sourceWatermark: storedWatermark(row.source_watermark),
      status: "finalized",
      windowEndsAt: isoTimestamp(row.window_ends_at, "windowEndsAt"),
    },
  };
}

export async function readEventAnalyticsRoiSnapshot(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
  eventId: string,
): Promise<EventAnalyticsRoiSnapshot | null> {
  const result = await executor.query<Row>(READ_SNAPSHOT_SQL, [
    workspaceId,
    eventId,
    EVENT_ANALYTICS_ROI_METRIC_VERSION,
  ]);
  return result.rows[0] ? snapshotFromRow(result.rows[0]) : null;
}

const READ_DUE_EVENTS_SQL = `
  select
    configuration_head.event_id,
    statement_timestamp() as db_now
  from event_ops_configuration_heads configuration_head
  join event_ops_configurations configuration
    on configuration.workspace_id = configuration_head.workspace_id
    and configuration.event_id = configuration_head.event_id
    and configuration.configuration_version =
      configuration_head.configuration_version
  join event_ops_events event_row
    on event_row.workspace_id = configuration_head.workspace_id
    and event_row.event_id = configuration_head.event_id
    and event_row.lifecycle_state_v2 = 'published'
  left join event_analytics_roi_snapshot_heads snapshot_head
    on snapshot_head.workspace_id = configuration_head.workspace_id
    and snapshot_head.event_id = configuration_head.event_id
    and snapshot_head.metric_version = $2
  where configuration_head.workspace_id = $1
    and ($4::text[] is null or configuration_head.event_id = any($4::text[]))
    and configuration.event_ends_at + interval '7 days' <= statement_timestamp()
    and snapshot_head.event_id is null
  order by configuration.event_ends_at, configuration_head.event_id
  limit $3
  for update of configuration_head skip locked
`;

async function finalizeSnapshot(
  transaction: EventOperationsSqlExecutor,
  input: {
    eventId: string;
    expectedRevision?: number;
    finalizedAt: string;
    recomputeReason: string | null;
    runtime: EventOperationsPostgresRuntime;
  },
): Promise<{ created: boolean; value: EventAnalyticsRoiSnapshot }> {
  await transaction.query(
    "select pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`orbit:event-analytics-snapshot:${input.runtime.workspaceId}:${input.eventId}`],
  );
  const current = await readEventAnalyticsRoiSnapshot(
    transaction,
    input.runtime.workspaceId,
    input.eventId,
  );
  if (current && !input.recomputeReason) {
    return { created: false, value: current };
  }
  if (current && input.expectedRevision !== current.snapshot.revision) {
    throw new Error(
      `Event analytics snapshot revision conflict: expected ${input.expectedRevision ?? "none"}, current ${current.snapshot.revision}.`,
    );
  }
  if (!current && input.recomputeReason) {
    throw new Error("Event analytics cannot recompute before an initial snapshot exists.");
  }

  const liveResult = await transaction.query<Row>(EVENT_ANALYTICS_ROI_SQL, [
    input.runtime.workspaceId,
    input.eventId,
  ]);
  const liveRow = liveResult.rows[0];
  if (!liveRow) {
    throw new Error("Event analytics ROI requires a canonical event configuration.");
  }
  const live = eventAnalyticsLiveRoiFromRow(liveRow);
  const finalizedAt = isoTimestamp(input.finalizedAt, "finalizedAt");
  if (Date.parse(finalizedAt) < Date.parse(live.windowEndsAt)) {
    throw new Error(
      "Event analytics ROI snapshot is not eligible until seven days after the event ends.",
    );
  }

  const previousRevision = current?.snapshot.revision ?? null;
  const revision = (previousRevision ?? 0) + 1;
  await transaction.query(`
    insert into event_analytics_roi_snapshots (
      workspace_id, event_id, metric_version, revision, formula_hash,
      window_ends_at, finalized_at, source_watermark, metrics,
      previous_revision, recompute_reason
    ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
  `, [
    input.runtime.workspaceId,
    input.eventId,
    EVENT_ANALYTICS_ROI_METRIC_VERSION,
    revision,
    EVENT_ANALYTICS_ROI_FORMULA_HASH,
    live.windowEndsAt,
    finalizedAt,
    JSON.stringify(live.sourceWatermark),
    JSON.stringify(live.metrics),
    previousRevision,
    input.recomputeReason,
  ]);
  await transaction.query(`
    insert into event_analytics_roi_snapshot_heads (
      workspace_id, event_id, metric_version, revision, updated_at
    ) values ($1, $2, $3, $4, $5)
    on conflict (workspace_id, event_id, metric_version) do update set
      revision = excluded.revision,
      updated_at = excluded.updated_at
  `, [
    input.runtime.workspaceId,
    input.eventId,
    EVENT_ANALYTICS_ROI_METRIC_VERSION,
    revision,
    finalizedAt,
  ]);

  const stored = await readEventAnalyticsRoiSnapshot(
    transaction,
    input.runtime.workspaceId,
    input.eventId,
  );
  if (!stored) {
    throw new Error("Event analytics ROI snapshot write was not visible.");
  }
  return { created: true, value: stored };
}

export function createEventAnalyticsRoiSnapshotFinalizer(input: {
  now?: () => string;
  runtime: EventOperationsPostgresRuntime;
}): EventAnalyticsRoiSnapshotFinalizer {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    async finalize({
      eventId: requestedEventId,
      expectedRevision,
      recomputeReason: requestedRecomputeReason,
    }) {
      const eventId = requiredScope(requestedEventId, "eventId");
      const recomputeReason = requestedRecomputeReason?.trim() || null;
      if (requestedRecomputeReason !== undefined && !recomputeReason) {
        throw new Error("Event analytics recompute reason must not be empty.");
      }

      return input.runtime.client.transaction(async (transaction) => {
        const finalized = await finalizeSnapshot(transaction, {
          eventId,
          expectedRevision,
          finalizedAt: now(),
          recomputeReason,
          runtime: input.runtime,
        });
        return finalized.value;
      }, { isolation: "serializable" });
    },

    async finalizeDue({ eventIds, limit = 50 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("Event analytics finalizeDue limit must be an integer from 1 to 100.");
      }
      const exactEventIds = eventIds === undefined
        ? null
        : [...new Set(eventIds.map((eventId) => requiredScope(eventId, "eventId")))];
      return input.runtime.client.transaction(async (transaction) => {
        const due = await transaction.query<{
          db_now: Date | string;
          event_id: string;
        }>(READ_DUE_EVENTS_SQL, [
          input.runtime.workspaceId,
          EVENT_ANALYTICS_ROI_METRIC_VERSION,
          limit,
          exactEventIds,
        ]);
        let finalized = 0;
        for (const row of due.rows) {
          const eventId = requiredScope(row.event_id, "eventId");
          const result = await finalizeSnapshot(transaction, {
            eventId,
            finalizedAt: isoTimestamp(row.db_now, "dbNow"),
            recomputeReason: null,
            runtime: input.runtime,
          });
          if (result.created) finalized += 1;
        }
        return { finalized };
      }, {
        // After waiting for the per-event advisory lock, the snapshot lookup
        // must see a concurrent explicit finalizer's commit and return
        // idempotently instead of replaying an older transaction snapshot.
        isolation: "read committed",
      });
    },
  };
}
