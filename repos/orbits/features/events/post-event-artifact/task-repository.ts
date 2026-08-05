import { randomUUID } from "node:crypto";

import type { LiveRecord, LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import type { AttendeePostEventAiArtifact } from "./contract";
import { ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION } from "./live-record-reader";
import { postEventEvidenceHash } from "./evidence-version";

export interface AttendeePostEventEvidenceSnapshot {
  commitments: readonly string[];
  contactId: string;
  evidenceId: string;
  nextStep: string;
  noteText: string;
  observedAt: string;
  talked: "yes" | "no" | "uncertain";
}

export interface AttendeePostEventAiTaskPayload extends Record<string, unknown> {
  artifact: AttendeePostEventAiArtifact | null;
  attendeeActorId: string;
  attendeeDisplayName?: string;
  attemptCount: number;
  error: { at: string; code: string; retryable: boolean } | null;
  eventId: string;
  evidenceHash: string;
  evidenceSnapshot: readonly AttendeePostEventEvidenceSnapshot[];
  evidenceWhitelist: readonly string[];
  lease: { expiresAt: string; token: string } | null;
  maxAttempts: number;
  model: string;
  nextAttemptAt: string;
  promptVersion: number;
  provenance: {
    generationMethod: "ai-provider";
    model: string;
    promptVersion: number;
    provider: string;
  };
  provider: string;
  requestedAt: string;
  status: "queued" | "running" | "ready" | "failed";
  taskId: string;
  version: number;
}

export interface AttendeePostEventAiTaskRepository {
  claim(input: { leaseMs: number; now: string; workerId: string }): Promise<AttendeePostEventAiTaskPayload | null>;
  complete(input: { artifact: AttendeePostEventAiArtifact; leaseToken: string; now: string; taskId: string }): Promise<boolean>;
  fail(input: { code: string; leaseToken: string; now: string; retryable: boolean; taskId: string }): Promise<boolean>;
  request(input: {
    attendeeActorId: string;
    attendeeDisplayName: string;
    eventId: string;
    evidenceSnapshot: readonly AttendeePostEventEvidenceSnapshot[];
    evidenceWhitelist: readonly string[];
    maxAttempts?: number;
    model: string;
    promptVersion: number;
    provider: string;
    requestedAt: string;
  }): Promise<AttendeePostEventAiTaskPayload>;
}

function recordId(eventId: string, actorId: string, version: number, evidenceHash: string): string {
  return `post-event-ai:${encodeURIComponent(eventId)}:${encodeURIComponent(actorId)}:v${version}:${evidenceHash.slice(0, 16)}`;
}

function payload(value: unknown): AttendeePostEventAiTaskPayload | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AttendeePostEventAiTaskPayload
    : null;
}

export function createAttendeePostEventAiTaskRepository(input: {
  client?: LiveRecordSqlClient;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): AttendeePostEventAiTaskRepository {
  async function recordsFor(eventId: string, actorId: string): Promise<readonly LiveRecord<Record<string, unknown>>[]> {
    return input.store.listRecords({
      collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION,
      lifecycleState: "active",
      targetId: eventId,
      targetType: "event",
      userId: actorId,
      workspaceId: input.workspaceId,
    });
  }

  return {
    async request(value) {
      const existingRecords = await recordsFor(value.eventId, value.attendeeActorId);
      const existingTasks = existingRecords.map((record) => payload(record.payload)).filter((task): task is AttendeePostEventAiTaskPayload => Boolean(task));
      const evidenceHash = postEventEvidenceHash(value.evidenceSnapshot, value.evidenceWhitelist);
      const matching = existingTasks
        .filter((task) =>
          task.evidenceHash === evidenceHash &&
          task.attendeeDisplayName === value.attendeeDisplayName &&
          task.model === value.model &&
          task.promptVersion === value.promptVersion &&
          task.provider === value.provider
        )
        .sort((left, right) => right.version - left.version)[0];
      if (matching && (matching.status === "ready" || matching.status === "running" || matching.status === "queued")) {
        return matching;
      }
      const version = Math.max(0, ...existingTasks.map((task) => Number.isSafeInteger(task.version) ? task.version : 1)) + 1;
      const taskId = recordId(value.eventId, value.attendeeActorId, version, evidenceHash);
      const maxAttempts = Math.max(1, Math.min(8, Math.floor(value.maxAttempts ?? 4)));
      const next: AttendeePostEventAiTaskPayload = {
        ...value,
        artifact: null,
        attemptCount: 0,
        error: null,
        evidenceHash,
        lease: null,
        maxAttempts,
        nextAttemptAt: value.requestedAt,
        provenance: {
          generationMethod: "ai-provider",
          model: value.model,
          promptVersion: value.promptVersion,
          provider: value.provider,
        },
        status: "queued",
        taskId,
        version,
      };
      await input.store.upsertRecord({
        collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION,
        createdAt: value.requestedAt,
        evidenceIds: next.evidenceWhitelist,
        lifecycleState: "active",
        occurredAt: value.requestedAt,
        payload: next,
        provider: value.provider,
        providerRecordId: taskId,
        recordId: taskId,
        searchText: "attendee post-event ai artifact",
        sourceId: `source:post-event-ai:${value.eventId}:${value.attendeeActorId}`,
        sourceLabel: "Attendee-scoped post-event AI artifact",
        sourceType: "event_import",
        targetId: value.eventId,
        targetType: "event",
        updatedAt: value.requestedAt,
        userId: value.attendeeActorId,
        workspaceId: input.workspaceId,
      });
      return next;
    },
    async claim(value) {
      const token = `${value.workerId}:${randomUUID()}`;
      const expiresAt = new Date(Date.parse(value.now) + value.leaseMs).toISOString();
      if (input.client) {
        await input.client.query(`update orbit_records set payload = jsonb_set(jsonb_set(payload, '{status}', '"queued"'::jsonb), '{lease}', 'null'::jsonb), updated_at = $3
          where workspace_id = $1 and collection_name = $2 and payload ->> 'status' = 'running'
            and (payload #>> '{lease,expiresAt}')::timestamptz < $3::timestamptz`, [input.workspaceId, ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, value.now]);
        const result = await input.client.query<{ payload: Record<string, unknown> }>(`with candidate as (
          select record_id from orbit_records
          where workspace_id = $1 and collection_name = $2 and lifecycle_state = 'active'
            and payload ->> 'status' = 'queued'
            and (payload ->> 'nextAttemptAt')::timestamptz <= $3::timestamptz
            and (payload ->> 'attemptCount')::integer < (payload ->> 'maxAttempts')::integer
          order by (payload ->> 'nextAttemptAt')::timestamptz, record_id
          for update skip locked limit 1
        ) update orbit_records item set
          payload = jsonb_set(jsonb_set(jsonb_set(item.payload, '{status}', '"running"'::jsonb), '{attemptCount}', to_jsonb((item.payload ->> 'attemptCount')::integer + 1)), '{lease}', $4::jsonb),
          updated_at = $3::timestamptz
        from candidate where item.workspace_id = $1 and item.collection_name = $2 and item.record_id = candidate.record_id
        returning item.payload`, [input.workspaceId, ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, value.now, JSON.stringify({ expiresAt, token })]);
        return payload(result.rows[0]?.payload) ?? null;
      }
      const records = await input.store.listRecords({ collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, lifecycleState: "active", workspaceId: input.workspaceId });
      const candidate = records.map((record) => ({ record, task: payload(record.payload) })).filter((candidate): candidate is { record: LiveRecord<Record<string, unknown>>; task: AttendeePostEventAiTaskPayload } => Boolean(candidate.task)).find((candidate) => candidate.task.status === "queued" && candidate.task.nextAttemptAt <= value.now && candidate.task.attemptCount < candidate.task.maxAttempts);
      if (!candidate) return null;
      const task = { ...candidate.task, attemptCount: candidate.task.attemptCount + 1, lease: { expiresAt, token }, status: "running" as const };
      await input.store.upsertRecord({ ...candidate.record, payload: task, updatedAt: value.now });
      return task;
    },
    async complete(value) {
      const record = await input.store.getRecord({ collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, recordId: value.taskId, workspaceId: input.workspaceId });
      const task = payload(record?.payload);
      if (!record || !task || task.status !== "running" || task.lease?.token !== value.leaseToken) return false;
      const next: AttendeePostEventAiTaskPayload = { ...task, artifact: value.artifact, error: null, lease: null, status: "ready" };
      if (input.client) {
        const result = await input.client.query<{ record_id: string }>(`update orbit_records set payload = $7::jsonb, evidence_ids = $6::text[], updated_at = $5::timestamptz
          where workspace_id = $1 and collection_name = $2 and record_id = $3
            and payload ->> 'status' = 'running' and payload #>> '{lease,token}' = $4
          returning record_id`, [input.workspaceId, ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, record.recordId, value.leaseToken, value.now, [...value.artifact.evidenceIds], JSON.stringify(next)]);
        return result.rows.length === 1;
      }
      await input.store.upsertRecord({ ...record, evidenceIds: value.artifact.evidenceIds, payload: next, updatedAt: value.now });
      return true;
    },
    async fail(value) {
      const record = await input.store.getRecord({ collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, recordId: value.taskId, workspaceId: input.workspaceId });
      const task = payload(record?.payload);
      if (!record || !task || task.status !== "running" || task.lease?.token !== value.leaseToken) return false;
      const retry = value.retryable && task.attemptCount < task.maxAttempts;
      const next: AttendeePostEventAiTaskPayload = {
        ...task,
        error: { at: value.now, code: value.code, retryable: retry },
        lease: null,
        nextAttemptAt: retry ? new Date(Date.parse(value.now) + Math.min(300_000, 2 ** task.attemptCount * 1_000)).toISOString() : task.nextAttemptAt,
        status: retry ? "queued" : "failed",
      };
      if (input.client) {
        const result = await input.client.query<{ record_id: string }>(`update orbit_records set payload = $6::jsonb, updated_at = $5::timestamptz
          where workspace_id = $1 and collection_name = $2 and record_id = $3
            and payload ->> 'status' = 'running' and payload #>> '{lease,token}' = $4
          returning record_id`, [input.workspaceId, ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION, record.recordId, value.leaseToken, value.now, JSON.stringify(next)]);
        return result.rows.length === 1;
      }
      await input.store.upsertRecord({ ...record, payload: next, updatedAt: value.now });
      return true;
    },
  };
}
