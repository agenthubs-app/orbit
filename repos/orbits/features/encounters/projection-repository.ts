import { randomUUID } from "node:crypto";

import type { LiveContactDetailState, LiveContactDetailStoredInteraction, LiveContactDetailStoredNote } from "../contacts/live-service";
import type { EventOperationsPostgresRuntime, EventOperationsSqlExecutor } from "../events/event-operations/storage/postgres-client";
import type { HumanEncounterRecord } from "./service";

type Row = Record<string, unknown>;

export interface HumanEncounterProjectionClaim {
  encounter: HumanEncounterRecord;
  leaseToken: string;
}

export interface HumanEncounterProjectionRepository {
  claim(input: { leaseMilliseconds: number; limit: number; now: string; workerId: string }): Promise<readonly HumanEncounterProjectionClaim[]>;
  complete(input: {
    afterContactWrite?: () => Promise<void>;
    claim: HumanEncounterProjectionClaim;
    interaction: LiveContactDetailStoredInteraction;
    note: LiveContactDetailStoredNote;
    now: string;
  }): Promise<"completed" | "lease_lost">;
  fail(input: { claim: HumanEncounterProjectionClaim; error: string; now: string }): Promise<"failed" | "retry" | "lease_lost">;
}

function payload(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") throw new Error("Encounter projection payload is invalid.");
  return parsed as Record<string, unknown>;
}

function encounterFrom(value: unknown): HumanEncounterRecord {
  const parsed = payload(value) as Partial<HumanEncounterRecord>;
  if (typeof parsed.encounterId !== "string" || typeof parsed.actorId !== "string" || typeof parsed.contactId !== "string") throw new Error("Encounter projection source is invalid.");
  return parsed as HumanEncounterRecord;
}

function detailStateFrom(value: unknown, actorId: string, contactId: string): LiveContactDetailState | null {
  if (!value) return null;
  const parsed = payload(value);
  if (parsed.actorId !== actorId || parsed.contactId !== contactId || !Array.isArray(parsed.notes)) return null;
  return parsed as unknown as LiveContactDetailState;
}

function detailRecordId(actorId: string, contactId: string): string {
  return `contact-detail:${encodeURIComponent(actorId)}:${encodeURIComponent(contactId)}`;
}

async function writeContactDetail(input: {
  existingCreatedAt: string | null;
  runtime: EventOperationsPostgresRuntime;
  state: LiveContactDetailState;
  transaction: EventOperationsSqlExecutor;
}): Promise<void> {
  const recordId = detailRecordId(input.state.actorId, input.state.contactId);
  await input.transaction.query(`
    insert into orbit_records (
      workspace_id, collection_name, record_id, user_id, source_type,
      source_id, source_label, provider, provider_record_id, evidence_ids,
      target_type, target_id, occurred_at, lifecycle_state, search_text,
      payload, created_at, updated_at, deleted_at
    ) values (
      $1, 'contact_detail_states', $2, $3, 'manual', $4,
      'Human encounter transactional projector', 'human-encounter-projector', $5, '{}',
      'contact', $5, $6, 'active', $7, $8::jsonb, coalesce($9::timestamptz, $6), $6, null
    )
    on conflict (workspace_id, collection_name, record_id) do update set
      user_id = excluded.user_id,
      source_type = excluded.source_type,
      source_id = excluded.source_id,
      source_label = excluded.source_label,
      provider = excluded.provider,
      provider_record_id = excluded.provider_record_id,
      target_type = excluded.target_type,
      target_id = excluded.target_id,
      occurred_at = excluded.occurred_at,
      lifecycle_state = 'active',
      search_text = excluded.search_text,
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      deleted_at = null
  `, [
    input.runtime.workspaceId,
    recordId,
    input.state.actorId,
    `contact-detail:${input.state.contactId}`,
    input.state.contactId,
    input.state.updatedAt,
    [input.state.status, ...input.state.tags, ...input.state.notes.map((note) => note.body), input.state.lastInteraction?.summary ?? ""].join(" "),
    JSON.stringify(input.state),
    input.existingCreatedAt,
  ]);
}

export function createPostgresHumanEncounterProjectionRepository(runtime: EventOperationsPostgresRuntime): HumanEncounterProjectionRepository {
  return {
    async claim(input) {
      return runtime.client.transaction(async (transaction) => {
        const candidates = await transaction.query<Row>(`
          select record_id, payload
          from orbit_records
          where workspace_id = $1 and collection_name = 'human_encounters'
            and lifecycle_state <> 'deleted'
            and (
              (coalesce(payload #>> '{projection,status}', 'pending') = 'pending'
                and coalesce((payload #>> '{projection,availableAt}')::timestamptz, '-infinity'::timestamptz) <= $2::timestamptz)
              or
              (payload #>> '{projection,status}' = 'processing'
                and coalesce((payload #>> '{projection,leaseExpiresAt}')::timestamptz, '-infinity'::timestamptz) <= $2::timestamptz)
            )
          order by coalesce((payload #>> '{projection,availableAt}')::timestamptz, created_at), created_at, record_id
          for update skip locked
          limit $3
        `, [runtime.workspaceId, input.now, input.limit]);
        const claims: HumanEncounterProjectionClaim[] = [];
        for (const row of candidates.rows) {
          const encounter = encounterFrom(row.payload);
          const leaseToken = `${input.workerId}:${randomUUID()}`;
          const leaseExpiresAt = new Date(Date.parse(input.now) + input.leaseMilliseconds).toISOString();
          const claimed: HumanEncounterRecord = {
            ...encounter,
            projection: {
              attempts: encounter.projection.attempts + 1,
              availableAt: encounter.projection.availableAt || input.now,
              lastError: encounter.projection.lastError,
              leaseExpiresAt,
              leaseToken,
              status: "processing",
            },
          };
          const updated = await transaction.query(`update orbit_records set payload = $4::jsonb, updated_at = $5
            where workspace_id = $1 and collection_name = 'human_encounters' and record_id = $2
              and payload = $3::jsonb`, [runtime.workspaceId, String(row.record_id), JSON.stringify(payload(row.payload)), JSON.stringify(claimed), input.now]);
          if (updated.rowCount === 1) claims.push({ encounter: claimed, leaseToken });
        }
        return claims;
      }, { isolation: "read committed" });
    },

    async complete(input) {
      return runtime.client.transaction(async (transaction) => {
        const encounter = input.claim.encounter;
        const source = await transaction.query<Row>(`select payload from orbit_records
          where workspace_id = $1 and collection_name = 'human_encounters' and record_id = $2
          for update`, [runtime.workspaceId, encounter.encounterId]);
        const currentEncounter = source.rows[0] ? encounterFrom(source.rows[0].payload) : null;
        if (!currentEncounter || currentEncounter.projection.status !== "processing" || currentEncounter.projection.leaseToken !== input.claim.leaseToken) return "lease_lost" as const;

        const contactRecordId = detailRecordId(encounter.actorId, encounter.contactId);
        await transaction.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`human-encounter-contact:${runtime.workspaceId}:${contactRecordId}`]);
        const detail = await transaction.query<Row>(`select payload, created_at from orbit_records
          where workspace_id = $1 and collection_name = 'contact_detail_states' and record_id = $2
          for update`, [runtime.workspaceId, contactRecordId]);
        const currentState = detailStateFrom(detail.rows[0]?.payload, encounter.actorId, encounter.contactId);
        const notes = [...(currentState?.notes ?? []).filter((note) => note.noteId !== input.note.noteId), input.note]
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.noteId.localeCompare(right.noteId));
        const currentInteraction = currentState?.lastInteraction;
        const lastInteraction = !currentInteraction || currentInteraction.occurredAt <= input.interaction.occurredAt ? input.interaction : currentInteraction;
        const state: LiveContactDetailState = {
          actorId: encounter.actorId,
          contactId: encounter.contactId,
          lastInteraction,
          notes,
          status: currentState?.status ?? "needs_follow_up",
          tags: currentState?.tags ?? [],
          updatedAt: input.now,
        };
        await writeContactDetail({ existingCreatedAt: detail.rows[0]?.created_at ? new Date(String(detail.rows[0].created_at)).toISOString() : null, runtime, state, transaction });
        await input.afterContactWrite?.();
        const completed: HumanEncounterRecord = {
          ...currentEncounter,
          projection: { ...currentEncounter.projection, lastError: null, leaseExpiresAt: null, leaseToken: null, status: "completed" },
        };
        const result = await transaction.query(`update orbit_records set payload = $5::jsonb, updated_at = $4
          where workspace_id = $1 and collection_name = 'human_encounters' and record_id = $2
            and payload #>> '{projection,leaseToken}' = $3`, [runtime.workspaceId, encounter.encounterId, input.claim.leaseToken, input.now, JSON.stringify(completed)]);
        return result.rowCount === 1 ? "completed" as const : "lease_lost" as const;
      }, { isolation: "read committed" });
    },

    async fail(input) {
      return runtime.client.transaction(async (transaction) => {
        const source = await transaction.query<Row>(`select payload from orbit_records
          where workspace_id = $1 and collection_name = 'human_encounters' and record_id = $2
          for update`, [runtime.workspaceId, input.claim.encounter.encounterId]);
        const encounter = source.rows[0] ? encounterFrom(source.rows[0].payload) : null;
        if (!encounter || encounter.projection.status !== "processing" || encounter.projection.leaseToken !== input.claim.leaseToken) return "lease_lost" as const;
        const terminal = encounter.projection.attempts >= 10;
        const availableAt = terminal ? encounter.projection.availableAt : new Date(Date.parse(input.now) + Math.min(300_000, 1_000 * 2 ** encounter.projection.attempts)).toISOString();
        const failed: HumanEncounterRecord = {
          ...encounter,
          projection: { ...encounter.projection, availableAt, lastError: input.error, leaseExpiresAt: null, leaseToken: null, status: terminal ? "failed" : "pending" },
        };
        const result = await transaction.query(`update orbit_records set payload = $5::jsonb, updated_at = $4
          where workspace_id = $1 and collection_name = 'human_encounters' and record_id = $2
            and payload #>> '{projection,leaseToken}' = $3`, [runtime.workspaceId, encounter.encounterId, input.claim.leaseToken, input.now, JSON.stringify(failed)]);
        if (result.rowCount !== 1) return "lease_lost" as const;
        return terminal ? "failed" as const : "retry" as const;
      }, { isolation: "read committed" });
    },
  };
}
