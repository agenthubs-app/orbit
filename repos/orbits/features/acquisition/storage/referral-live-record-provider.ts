import { createHash } from "node:crypto";

import type {
  ContactDTO,
  MatchRecommendationDTO,
  NetworkPersonDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import type { ContactAcquisitionDraft } from "../contract";
import {
  isMatchRecommendationType,
  isRelationshipStage,
  isSourceType,
} from "../../../shared/domain/source-types";
import {
  createConfiguredPostgresLiveRecordStore,
} from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import type {
  ContactDraftConfirmationWriteResult,
} from "./contact-draft-live-record-provider";

export interface LiveReferralRecommendationGraph {
  contacts: readonly ContactDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
  networkPeople: readonly NetworkPersonDTO[];
  recommendations: readonly MatchRecommendationDTO[];
}

export type LiveReferralRecommendationProviderResult<TResult> =
  TResult | Promise<TResult>;

export interface LiveReferralRecommendationProvider {
  actorScopeId: string;
  source: string;
  sourceLabel: string;
  readReferralRecommendationGraph: () => LiveReferralRecommendationProviderResult<LiveReferralRecommendationGraph>;
  stageContactDrafts: (
    drafts: readonly ContactAcquisitionDraft[],
  ) => LiveReferralRecommendationProviderResult<readonly ContactAcquisitionDraft[]>;
  confirmContactDraft: (
    draft: ContactAcquisitionDraft,
    updatedAt: string,
  ) => LiveReferralRecommendationProviderResult<ContactDraftConfirmationWriteResult>;
}

export const REFERRAL_LIVE_RECORD_COLLECTIONS = {
  contactDrafts: "contactDrafts",
  contacts: "contacts",
  evidence: "evidence",
  matchRecommendations: "matchRecommendations",
  networkPeople: "networkPeople",
} as const;

export type AtomicReferralContactDraftWriter = (
  records: readonly LiveRecord<Record<string, unknown>>[],
) => Promise<void>;

export type AtomicReferralContactDraftConfirmer = (input: {
  actorId: string;
  draft: ContactAcquisitionDraft;
  updatedAt: string;
  workspaceId: string;
}) => Promise<ContactDraftConfirmationWriteResult>;

export interface StorageReferralRecommendationProviderOptions {
  actorId: string;
  atomicDraftWriter?: AtomicReferralContactDraftWriter;
  atomicDraftConfirmer?: AtomicReferralContactDraftConfirmer;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageReferralRecommendationProviderOptions {
  actorId?: string;
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function actorScopeIdFor(actorId: string): string {
  return createHash("sha256")
    .update(`orbit:referral-contact-draft-actor:${actorId}`)
    .digest("hex")
    .slice(0, 24);
}

function contactDraftFromRecord(
  record: LiveRecord<Record<string, unknown>> | null,
): ContactAcquisitionDraft | null {
  if (!record || !isRecord(record.payload)) {
    return null;
  }

  const payload = record.payload;

  return nonEmptyString(payload.id) &&
    (payload.status === "pending_confirmation" ||
      payload.status === "confirmed") &&
    isRecord(payload.source) &&
    isRecord(payload.confirmation) &&
    Array.isArray(payload.evidence) &&
    isRecord(payload.provenance)
    ? (payload as unknown as ContactAcquisitionDraft)
    : null;
}

function contactDraftRecord(input: {
  actorId: string;
  draft: ContactAcquisitionDraft;
  updatedAt?: string;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  const { actorId, draft, updatedAt, workspaceId } = input;

  return {
    workspaceId,
    collectionName: REFERRAL_LIVE_RECORD_COLLECTIONS.contactDrafts,
    recordId: draft.id,
    userId: actorId,
    sourceType: draft.source.type,
    sourceId: draft.source.id,
    sourceLabel: draft.source.label,
    provider: "orbit-referral-recommendation-live-service",
    providerRecordId: draft.id,
    evidenceIds: draft.provenance.evidenceIds,
    targetType: "contact",
    targetId: draft.id,
    occurredAt: draft.createdAt,
    createdAt: draft.createdAt,
    updatedAt: updatedAt ?? draft.createdAt,
    lifecycleState: "active",
    searchText: [
      draft.displayName,
      draft.organization,
      draft.role,
      draft.relationshipContext,
    ].join(" "),
    payload: draft as unknown as Record<string, unknown>,
  };
}

async function writeDraftRecordsWithRollback(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  records: readonly LiveRecord<Record<string, unknown>>[],
): Promise<void> {
  const previousRecords = await Promise.all(
    records.map((record) =>
      store.getRecord({
        workspaceId: record.workspaceId,
        collectionName: record.collectionName,
        recordId: record.recordId,
        includeDeleted: true,
      }),
    ),
  );

  for (const [index, existing] of previousRecords.entries()) {
    const next = records[index];

    if (
      existing &&
      next &&
      (existing.userId?.trim() || null) !== (next.userId?.trim() || null)
    ) {
      throw new Error(
        `Referral contact draft ${next.recordId} belongs to another actor.`,
      );
    }
  }

  const writtenIndexes: number[] = [];

  try {
    for (const [index, record] of records.entries()) {
      const existing = previousRecords[index];

      if (existing?.lifecycleState === "active") {
        continue;
      }

      await store.upsertRecord(record);
      writtenIndexes.push(index);
    }
  } catch (error) {
    for (const index of [...writtenIndexes].reverse()) {
      const record = records[index];
      const previous = previousRecords[index];

      if (!record) {
        continue;
      }

      if (previous) {
        await store.upsertRecord(previous);
      } else {
        await store.deleteRecord({
          workspaceId: record.workspaceId,
          collectionName: record.collectionName,
          recordId: record.recordId,
          deletedAt: record.updatedAt,
        });
      }
    }

    throw error;
  }
}

function postgresDraftBatchRows(
  records: readonly LiveRecord<Record<string, unknown>>[],
) {
  return records.map((record) => ({
    workspace_id: record.workspaceId,
    collection_name: record.collectionName,
    record_id: record.recordId,
    user_id: record.userId ?? null,
    source_type: record.sourceType,
    source_id: record.sourceId,
    source_label: record.sourceLabel ?? null,
    provider: record.provider ?? null,
    provider_record_id: record.providerRecordId ?? null,
    evidence_ids: [...record.evidenceIds],
    target_type: record.targetType ?? null,
    target_id: record.targetId ?? null,
    occurred_at: record.occurredAt ?? null,
    lifecycle_state: record.lifecycleState,
    search_text: record.searchText ?? "",
    payload: record.payload,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt ?? null,
  }));
}

export function createPostgresReferralContactDraftAtomicWriter(
  client: LiveRecordSqlClient,
): AtomicReferralContactDraftWriter {
  return async (records) => {
    if (records.length === 0) {
      return;
    }

    const result = await client.query<{ record_id: string }>(
      `
        with incoming as materialized (
          select *
          from jsonb_to_recordset($1::jsonb) as row(
            workspace_id text,
            collection_name text,
            record_id text,
            user_id text,
            source_type text,
            source_id text,
            source_label text,
            provider text,
            provider_record_id text,
            evidence_ids jsonb,
            target_type text,
            target_id text,
            occurred_at timestamptz,
            lifecycle_state text,
            search_text text,
            payload jsonb,
            created_at timestamptz,
            updated_at timestamptz,
            deleted_at timestamptz
          )
        ),
        record_locks as materialized (
          select pg_advisory_xact_lock(
            hashtextextended(
              incoming.workspace_id || chr(31) ||
              incoming.collection_name || chr(31) ||
              incoming.record_id,
              0
            )
          )
          from incoming
          order by incoming.workspace_id, incoming.collection_name, incoming.record_id
        ),
        lock_guard as materialized (
          select count(*) as acquired from record_locks
        ),
        ownership_conflicts as materialized (
          select existing.record_id
          from incoming
          cross join lock_guard
          join orbit_records as existing
            on existing.workspace_id = incoming.workspace_id
           and existing.collection_name = incoming.collection_name
           and existing.record_id = incoming.record_id
          where existing.user_id is distinct from incoming.user_id
        )
        insert into orbit_records (
          workspace_id,
          collection_name,
          record_id,
          user_id,
          source_type,
          source_id,
          source_label,
          provider,
          provider_record_id,
          evidence_ids,
          target_type,
          target_id,
          occurred_at,
          lifecycle_state,
          search_text,
          payload,
          created_at,
          updated_at,
          deleted_at
        )
        select
          incoming.workspace_id,
          incoming.collection_name,
          incoming.record_id,
          incoming.user_id,
          incoming.source_type,
          incoming.source_id,
          incoming.source_label,
          incoming.provider,
          incoming.provider_record_id,
          array(
            select jsonb_array_elements_text(incoming.evidence_ids)
          ),
          incoming.target_type,
          incoming.target_id,
          incoming.occurred_at,
          incoming.lifecycle_state,
          incoming.search_text,
          incoming.payload,
          incoming.created_at,
          incoming.updated_at,
          incoming.deleted_at
        from incoming
        where not exists (select 1 from ownership_conflicts)
        on conflict (workspace_id, collection_name, record_id)
        do update set record_id = orbit_records.record_id
        where orbit_records.user_id is not distinct from excluded.user_id
        returning record_id
      `,
      [JSON.stringify(postgresDraftBatchRows(records))],
    );

    if (result.rows.length !== records.length) {
      throw new Error(
        "Referral contact draft batch was rejected because an existing record belongs to another actor.",
      );
    }
  };
}

export function createPostgresReferralContactDraftAtomicConfirmer(
  client: LiveRecordSqlClient,
): AtomicReferralContactDraftConfirmer {
  return async ({ actorId, draft, updatedAt, workspaceId }) => {
    const result = await client.query<{
      payload: Record<string, unknown> | string;
      transition_applied: boolean;
    }>(
      `
        with updated as (
          update orbit_records
          set evidence_ids = $4::text[],
              payload = $5::jsonb,
              updated_at = $6
          where workspace_id = $1
            and collection_name = 'contactDrafts'
            and record_id = $2
            and lifecycle_state <> 'deleted'
            and user_id is not distinct from $3
            and payload->>'status' = 'pending_confirmation'
          returning payload
        )
        select true as transition_applied, payload
        from updated
        union all
        select false as transition_applied, payload
        from orbit_records
        where workspace_id = $1
          and collection_name = 'contactDrafts'
          and record_id = $2
          and lifecycle_state <> 'deleted'
          and user_id is not distinct from $3
          and not exists (select 1 from updated)
        limit 1
      `,
      [
        workspaceId,
        draft.id,
        actorId,
        [...draft.provenance.evidenceIds],
        JSON.stringify(draft),
        updatedAt,
      ],
    );
    const row = result.rows[0];
    const payload =
      typeof row?.payload === "string"
        ? JSON.parse(row.payload) as Record<string, unknown>
        : row?.payload;

    if (!row || !payload) {
      throw new Error(
        `Referral contact draft ${draft.id} could not be confirmed for this actor.`,
      );
    }

    return {
      draft: payload as unknown as ContactAcquisitionDraft,
      transitionApplied: row.transition_applied,
    };
  };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => nonEmptyString(item))
    : [];
}

function evidenceIds(value: unknown): readonly [string, ...string[]] | null {
  const ids = stringArray(value);

  return ids.length > 0 ? [ids[0], ...ids.slice(1)] : null;
}

function sourceReference(
  value: unknown,
): ContactDTO["source"] | MatchRecommendationDTO["source"] | NetworkPersonDTO["source"] | null {
  if (!isRecord(value) || !isSourceType(value.type) || !nonEmptyString(value.id)) {
    return null;
  }

  return {
    type: value.type,
    id: value.id,
    label: optionalString(value.label),
  };
}

function contactFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): ContactDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.displayName) ||
    !isRelationshipStage(payload.stage) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    personId: optionalString(payload.personId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    location: optionalString(payload.location),
    primaryEmail: optionalString(payload.primaryEmail),
    primaryPhone: optionalString(payload.primaryPhone),
    profileSnippet: optionalString(payload.profileSnippet),
    stage: payload.stage,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function networkPersonFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): NetworkPersonDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !(
      payload.personKind === "platform_user" ||
      payload.personKind === "external_contact"
    ) ||
    !nonEmptyString(payload.displayName) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    personKind: payload.personKind,
    platformUserId: optionalString(payload.platformUserId),
    displayName: payload.displayName,
    organization: optionalString(payload.organization),
    role: optionalString(payload.role),
    location: optionalString(payload.location),
    primaryEmail: optionalString(payload.primaryEmail),
    profileSnippet: optionalString(payload.profileSnippet),
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function recommendationFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): MatchRecommendationDTO | null {
  const payload = record.payload;
  const source = sourceReference(payload.source);
  const ids = evidenceIds(payload.evidenceIds);

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.eventId) ||
    !isMatchRecommendationType(payload.recommendationType) ||
    typeof payload.score !== "number" ||
    typeof payload.businessRelevanceScore !== "number" ||
    !nonEmptyString(payload.reason) ||
    !source ||
    !ids ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    eventId: payload.eventId,
    attendeeId: optionalString(payload.attendeeId),
    targetPersonId: optionalString(payload.targetPersonId),
    contactId: optionalString(payload.contactId),
    connectionId: optionalString(payload.connectionId),
    introducedByPersonId: optionalString(payload.introducedByPersonId),
    recommendationType: payload.recommendationType,
    score: payload.score,
    businessRelevanceScore: payload.businessRelevanceScore,
    sharedTopics: stringArray(payload.sharedTopics),
    suggestedActions: stringArray(payload.suggestedActions),
    reason: payload.reason,
    source,
    evidenceIds: ids,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function evidenceFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): RelationshipEvidenceDTO | null {
  const payload = record.payload;

  if (
    !nonEmptyString(payload.id) ||
    !isSourceType(payload.sourceType) ||
    !nonEmptyString(payload.sourceId) ||
    !nonEmptyString(payload.summary) ||
    !nonEmptyString(payload.occurredAt) ||
    typeof payload.confidence !== "number" ||
    !nonEmptyString(payload.createdBy)
  ) {
    return null;
  }

  return {
    id: payload.id,
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    summary: payload.summary,
    occurredAt: payload.occurredAt,
    confidence: payload.confidence,
    createdBy: payload.createdBy,
  };
}

function latestTimestamp(
  records: readonly LiveRecord<Record<string, unknown>>[],
): string {
  return (
    records
      .map((record) => record.updatedAt)
      .filter(nonEmptyString)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

async function listCollection(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  workspaceId: string,
  collectionName: string,
  actorId?: string,
): Promise<readonly LiveRecord<Record<string, unknown>>[]> {
  const records = await store.listRecords({
    workspaceId,
    collectionName,
  });
  const normalizedActorId = actorId?.trim();

  if (!normalizedActorId) {
    return records;
  }

  return records.filter(
    (record) =>
      record.userId === normalizedActorId ||
      record.payload.accountId === normalizedActorId ||
      record.payload.actorId === normalizedActorId ||
      record.payload.ownerId === normalizedActorId,
  );
}

export function createStorageReferralRecommendationProvider({
  actorId,
  atomicDraftWriter,
  atomicDraftConfirmer,
  source,
  sourceLabel = "Referral recommendation shared live storage",
  store,
  workspaceId,
}: StorageReferralRecommendationProviderOptions): LiveReferralRecommendationProvider {
  const normalizedActorId = actorId.trim();

  if (!normalizedActorId) {
    throw new Error(
      "Referral recommendation live storage requires an authenticated actor id.",
    );
  }

  const writeAtomically =
    atomicDraftWriter ??
    ((records: readonly LiveRecord<Record<string, unknown>>[]) =>
      writeDraftRecordsWithRollback(store, records));
  const confirmationWrites = new Map<
    string,
    Promise<ContactDraftConfirmationWriteResult>
  >();

  return {
    actorScopeId: actorScopeIdFor(normalizedActorId),
    source: source ?? `live-record-store:referral-recommendations:${workspaceId}`,
    sourceLabel,
    async readReferralRecommendationGraph(): Promise<LiveReferralRecommendationGraph> {
      const [
        contactRecords,
        evidenceRecords,
        personRecords,
        recommendationRecords,
      ] = await Promise.all([
        listCollection(store, workspaceId, REFERRAL_LIVE_RECORD_COLLECTIONS.contacts, normalizedActorId),
        listCollection(store, workspaceId, REFERRAL_LIVE_RECORD_COLLECTIONS.evidence, normalizedActorId),
        listCollection(store, workspaceId, REFERRAL_LIVE_RECORD_COLLECTIONS.networkPeople, normalizedActorId),
        listCollection(store, workspaceId, REFERRAL_LIVE_RECORD_COLLECTIONS.matchRecommendations, normalizedActorId),
      ]);

      return {
        contacts: contactRecords
          .map(contactFromRecord)
          .filter((contact): contact is ContactDTO => contact !== null),
        evidence: evidenceRecords
          .map(evidenceFromRecord)
          .filter(
            (evidence): evidence is RelationshipEvidenceDTO =>
              evidence !== null,
          ),
        generatedAt: latestTimestamp([
          ...contactRecords,
          ...evidenceRecords,
          ...personRecords,
          ...recommendationRecords,
        ]),
        networkPeople: personRecords
          .map(networkPersonFromRecord)
          .filter(
            (person): person is NetworkPersonDTO => person !== null,
          ),
        recommendations: recommendationRecords
          .map(recommendationFromRecord)
          .filter(
            (recommendation): recommendation is MatchRecommendationDTO =>
              recommendation !== null,
          ),
      };
    },
    async stageContactDrafts(
      drafts: readonly ContactAcquisitionDraft[],
    ): Promise<readonly ContactAcquisitionDraft[]> {
      if (drafts.length === 0) {
        return [];
      }

      const records = drafts.map((draft) =>
        contactDraftRecord({
          actorId: normalizedActorId,
          draft,
          workspaceId,
        }),
      );
      const uniqueRecordIds = new Set(records.map((record) => record.recordId));

      if (uniqueRecordIds.size !== records.length) {
        throw new Error(
          "Referral recommendations produced duplicate actor-scoped draft ids.",
        );
      }

      await writeAtomically(records);

      const storedDrafts = await Promise.all(
        records.map(async (record) => {
          const stored = await store.getRecord({
            workspaceId,
            collectionName: record.collectionName,
            recordId: record.recordId,
          });

          if ((stored?.userId?.trim() || null) !== normalizedActorId) {
            throw new Error(
              `Referral contact draft ${record.recordId} was not stored for the authenticated actor.`,
            );
          }

          const storedDraft = contactDraftFromRecord(stored);

          if (!storedDraft) {
            throw new Error(
              `Referral contact draft ${record.recordId} could not be read back after staging.`,
            );
          }

          return storedDraft;
        }),
      );

      return storedDrafts;
    },
    async confirmContactDraft(
      draft: ContactAcquisitionDraft,
      updatedAt: string,
    ): Promise<ContactDraftConfirmationWriteResult> {
      if (atomicDraftConfirmer) {
        return atomicDraftConfirmer({
          actorId: normalizedActorId,
          draft,
          updatedAt,
          workspaceId,
        });
      }

      const previous = confirmationWrites.get(draft.id) ??
        Promise.resolve({
          draft,
          transitionApplied: false,
        });
      const next = previous.then(async () => {
        const existingRecord = await store.getRecord({
          workspaceId,
          collectionName: REFERRAL_LIVE_RECORD_COLLECTIONS.contactDrafts,
          recordId: draft.id,
        });

        if (
          existingRecord &&
          (existingRecord.userId?.trim() || null) !== normalizedActorId
        ) {
          throw new Error(
            `Referral contact draft ${draft.id} could not be confirmed for this actor.`,
          );
        }

        const existingDraft = contactDraftFromRecord(existingRecord);

        if (existingDraft?.status === "confirmed") {
          return {
            draft: existingDraft,
            transitionApplied: false,
          };
        }

        const saved = await store.upsertRecord(
          contactDraftRecord({
            actorId: normalizedActorId,
            draft,
            updatedAt,
            workspaceId,
          }),
        );

        return {
          draft: contactDraftFromRecord(saved) ?? draft,
          transitionApplied: true,
        };
      });
      confirmationWrites.set(draft.id, next);

      try {
        return await next;
      } finally {
        if (confirmationWrites.get(draft.id) === next) {
          confirmationWrites.delete(draft.id);
        }
      }
    },
  };
}

export function createConfiguredStorageReferralRecommendationProvider({
  actorId,
  env,
  sourceLabel = "Referral recommendation Postgres live storage",
}: ConfiguredStorageReferralRecommendationProviderOptions = {}): LiveReferralRecommendationProvider | null {
  const normalizedActorId = actorId?.trim();

  if (!normalizedActorId) {
    return null;
  }

  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  return createStorageReferralRecommendationProvider({
    actorId: normalizedActorId,
    atomicDraftWriter: createPostgresReferralContactDraftAtomicWriter(
      configuredStore.client,
    ),
    atomicDraftConfirmer: createPostgresReferralContactDraftAtomicConfirmer(
      configuredStore.client,
    ),
    source: `postgres-live-record-store:referral-recommendations:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
