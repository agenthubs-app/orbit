import type {
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  isRelationshipStage,
  isSourceType,
} from "../../../shared/domain/source-types";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveDatabaseEnv } from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import type { BusinessCardReviewedFields } from "../business-card-review-contract";

export interface LiveBusinessCardReviewGraph {
  contacts: readonly ContactDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
}

export type LiveBusinessCardReviewProviderResult<TResult> =
  TResult | Promise<TResult>;

export interface LiveBusinessCardReviewDraftState {
  draftId: string;
  reviewedFields: BusinessCardReviewedFields;
  reviewedAt: string;
  reviewerLabel: string;
  status: "confirmed" | "reviewed";
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface LiveBusinessCardReviewDraftWriteInput {
  actorId: string;
  draftId: string;
  reviewedFields: BusinessCardReviewedFields;
  reviewedAt: string;
  reviewerLabel: string;
}

export interface LiveBusinessCardReviewDraftWriteResult {
  databaseWriteExecuted: boolean;
  draft: LiveBusinessCardReviewDraftState;
}

export interface LiveBusinessCardReviewDraftConfirmInput {
  actorId: string;
  draftId: string;
  confirmedAt: string;
  confirmedBy: string;
}

export interface LiveBusinessCardReviewDraftConfirmResult {
  draft: LiveBusinessCardReviewDraftState;
  transitionApplied: boolean;
}

export interface LiveBusinessCardReviewProvider {
  source: string;
  sourceLabel: string;
  readBusinessCardReviewGraph: (
    actorId: string,
  ) => LiveBusinessCardReviewProviderResult<LiveBusinessCardReviewGraph>;
  readBusinessCardReviewDraft: (
    actorId: string,
    draftId: string,
  ) => LiveBusinessCardReviewProviderResult<LiveBusinessCardReviewDraftState | null>;
  upsertBusinessCardReviewDraft: (
    input: LiveBusinessCardReviewDraftWriteInput,
  ) => LiveBusinessCardReviewProviderResult<LiveBusinessCardReviewDraftWriteResult>;
  confirmBusinessCardReviewDraft: (
    input: LiveBusinessCardReviewDraftConfirmInput,
  ) => LiveBusinessCardReviewProviderResult<LiveBusinessCardReviewDraftConfirmResult>;
}

export const BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS = {
  contacts: "contacts",
  evidence: "evidence",
  reviewDrafts: "businessCardReviewDrafts",
} as const;

export interface StorageBusinessCardReviewProviderOptions {
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export interface ConfiguredStorageBusinessCardReviewProviderOptions {
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function sourceReference(value: unknown): ContactDTO["source"] | null {
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

function reviewedFieldsFromRecord(
  value: unknown,
): BusinessCardReviewedFields | null {
  if (!isRecord(value)) {
    return null;
  }

  const fields = {
    displayName: value.displayName,
    role: value.role,
    organization: value.organization,
    email: value.email,
    phone: value.phone,
  };

  return Object.values(fields).every(
    (fieldValue) => typeof fieldValue === "string",
  )
    ? (fields as BusinessCardReviewedFields)
    : null;
}

function reviewDraftFromRecord(
  record: LiveRecord<Record<string, unknown>> | null,
  actorId: string,
  draftId: string,
): LiveBusinessCardReviewDraftState | null {
  if (!record || record.userId !== actorId) {
    return null;
  }

  const reviewedFields = reviewedFieldsFromRecord(
    record.payload.reviewedFields,
  );

  if (
    record.payload.draftId !== draftId ||
    !reviewedFields ||
    !nonEmptyString(record.payload.reviewedAt) ||
    !nonEmptyString(record.payload.reviewerLabel)
  ) {
    return null;
  }

  const confirmed =
    record.payload.status === "confirmed" &&
    nonEmptyString(record.payload.confirmedAt) &&
    nonEmptyString(record.payload.confirmedBy);

  return {
    draftId,
    reviewedFields,
    reviewedAt: record.payload.reviewedAt,
    reviewerLabel: record.payload.reviewerLabel,
    status: confirmed ? "confirmed" : "reviewed",
    ...(confirmed
      ? {
          confirmedAt: record.payload.confirmedAt as string,
          confirmedBy: record.payload.confirmedBy as string,
        }
      : {}),
  };
}

function reviewDraftRecordId(actorId: string, draftId: string): string {
  return [
    "business-card-review-draft",
    encodeURIComponent(actorId),
    encodeURIComponent(draftId),
  ].join(":");
}

function sameReviewDraft(
  left: LiveBusinessCardReviewDraftState,
  right: LiveBusinessCardReviewDraftWriteInput,
): boolean {
  return (
    left.draftId === right.draftId &&
    left.reviewerLabel === right.reviewerLabel &&
    left.reviewedFields.displayName === right.reviewedFields.displayName &&
    left.reviewedFields.role === right.reviewedFields.role &&
    left.reviewedFields.organization === right.reviewedFields.organization &&
    left.reviewedFields.email === right.reviewedFields.email &&
    left.reviewedFields.phone === right.reviewedFields.phone
  );
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
): Promise<readonly LiveRecord<Record<string, unknown>>[]> {
  return store.listRecords({
    workspaceId,
    collectionName,
  });
}

export function createStorageBusinessCardReviewProvider({
  source,
  sourceLabel = "Business card review shared live storage",
  store,
  workspaceId,
}: StorageBusinessCardReviewProviderOptions): LiveBusinessCardReviewProvider {
  const confirmationWrites = new Map<
    string,
    Promise<LiveBusinessCardReviewDraftConfirmResult>
  >();

  return {
    source: source ?? `live-record-store:business-card-review:${workspaceId}`,
    sourceLabel,
    async readBusinessCardReviewGraph(
      actorId,
    ): Promise<LiveBusinessCardReviewGraph> {
      const normalizedActorId = actorId.trim();
      const allContactRecords = normalizedActorId
        ? await listCollection(
            store,
            workspaceId,
            BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS.contacts,
          )
        : [];
      const contactRecords = allContactRecords.filter(
        (record) =>
          record.userId === normalizedActorId ||
          record.payload.accountId === normalizedActorId,
      );
      const actorEvidenceIds = Array.from(
        new Set(
          contactRecords.flatMap((record) =>
            Array.isArray(record.payload.evidenceIds)
              ? record.payload.evidenceIds.filter(nonEmptyString)
              : [],
          ),
        ),
      );
      const evidenceRecords =
        actorEvidenceIds.length > 0
          ? await store.listRecords({
              collectionName:
                BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS.evidence,
              recordIds: actorEvidenceIds,
              workspaceId,
            })
          : [];

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
        generatedAt: latestTimestamp([...contactRecords, ...evidenceRecords]),
      };
    },
    async readBusinessCardReviewDraft(
      actorId,
      draftId,
    ): Promise<LiveBusinessCardReviewDraftState | null> {
      const normalizedActorId = actorId.trim();
      const normalizedDraftId = draftId.trim();

      if (!normalizedActorId || !normalizedDraftId) {
        return null;
      }

      const record = await store.getRecord({
        workspaceId,
        collectionName:
          BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS.reviewDrafts,
        recordId: reviewDraftRecordId(
          normalizedActorId,
          normalizedDraftId,
        ),
      });

      return reviewDraftFromRecord(
        record,
        normalizedActorId,
        normalizedDraftId,
      );
    },
    async upsertBusinessCardReviewDraft(
      input,
    ): Promise<LiveBusinessCardReviewDraftWriteResult> {
      const actorId = input.actorId.trim();
      const draftId = input.draftId.trim();

      if (!actorId || !draftId) {
        throw new Error(
          "Business card review draft writes require an actor and draft id.",
        );
      }

      const recordId = reviewDraftRecordId(actorId, draftId);
      const existingRecord = await store.getRecord({
        workspaceId,
        collectionName:
          BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS.reviewDrafts,
        recordId,
      });
      const existingDraft = reviewDraftFromRecord(
        existingRecord,
        actorId,
        draftId,
      );

      if (existingDraft && sameReviewDraft(existingDraft, input)) {
        return {
          databaseWriteExecuted: false,
          draft: existingDraft,
        };
      }

      const saved = await store.upsertRecord({
        workspaceId,
        collectionName:
          BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS.reviewDrafts,
        recordId,
        userId: actorId,
        sourceType: "business_card_ocr",
        sourceId: draftId,
        sourceLabel: "Reviewed business card fields",
        provider: "orbit-business-card-review-live-service",
        providerRecordId: draftId,
        evidenceIds: [],
        targetType: "contact",
        targetId: draftId,
        occurredAt: input.reviewedAt,
        createdAt: existingRecord?.createdAt ?? input.reviewedAt,
        updatedAt: input.reviewedAt,
        lifecycleState: "active",
        searchText: null,
        payload: {
          draftId,
          reviewedFields: input.reviewedFields,
          reviewedAt: input.reviewedAt,
          reviewerLabel: input.reviewerLabel,
          status: existingDraft?.status ?? "reviewed",
          ...(existingDraft?.status === "confirmed"
            ? {
                confirmedAt: existingDraft.confirmedAt,
                confirmedBy: existingDraft.confirmedBy,
              }
            : {}),
        },
      });
      const savedDraft = reviewDraftFromRecord(saved, actorId, draftId);

      if (!savedDraft) {
        throw new Error("Stored business card review draft is invalid.");
      }

      return {
        databaseWriteExecuted: true,
        draft: savedDraft,
      };
    },
    async confirmBusinessCardReviewDraft(
      input,
    ): Promise<LiveBusinessCardReviewDraftConfirmResult> {
      const actorId = input.actorId.trim();
      const draftId = input.draftId.trim();

      if (!actorId || !draftId) {
        throw new Error(
          "Business card review confirmations require an actor and draft id.",
        );
      }

      const recordId = reviewDraftRecordId(actorId, draftId);
      const previous = confirmationWrites.get(recordId) ?? Promise.resolve(null);
      const next = previous.then(
        async (): Promise<LiveBusinessCardReviewDraftConfirmResult> => {
          const existingRecord = await store.getRecord({
            workspaceId,
            collectionName:
              BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS.reviewDrafts,
            recordId,
          });
          const existingDraft = reviewDraftFromRecord(
            existingRecord,
            actorId,
            draftId,
          );

          if (!existingDraft) {
            throw new Error(
              `Business card review draft ${draftId} could not be confirmed for this actor.`,
            );
          }

          if (existingDraft.status === "confirmed") {
            return {
              draft: existingDraft,
              transitionApplied: false,
            };
          }

          const saved = await store.upsertRecord({
            workspaceId,
            collectionName:
              BUSINESS_CARD_REVIEW_LIVE_RECORD_COLLECTIONS.reviewDrafts,
            recordId,
            userId: actorId,
            sourceType: "business_card_ocr",
            sourceId: draftId,
            sourceLabel: "Reviewed business card fields",
            provider: "orbit-business-card-review-live-service",
            providerRecordId: draftId,
            evidenceIds: [],
            targetType: "contact",
            targetId: draftId,
            occurredAt: input.confirmedAt,
            createdAt: existingRecord?.createdAt ?? existingDraft.reviewedAt,
            updatedAt: input.confirmedAt,
            lifecycleState: "active",
            searchText: null,
            payload: {
              draftId,
              reviewedFields: existingDraft.reviewedFields,
              reviewedAt: existingDraft.reviewedAt,
              reviewerLabel: existingDraft.reviewerLabel,
              status: "confirmed",
              confirmedAt: input.confirmedAt,
              confirmedBy: input.confirmedBy,
            },
          });
          const savedDraft = reviewDraftFromRecord(saved, actorId, draftId);

          if (!savedDraft || savedDraft.status !== "confirmed") {
            throw new Error(
              "Stored business card review confirmation is invalid.",
            );
          }

          return {
            draft: savedDraft,
            transitionApplied: true,
          };
        },
      );
      const tracked = next.then(
        (value) => value,
        () => null as never,
      );
      confirmationWrites.set(recordId, tracked as Promise<LiveBusinessCardReviewDraftConfirmResult>);

      try {
        return await next;
      } finally {
        if (confirmationWrites.get(recordId) === tracked) {
          confirmationWrites.delete(recordId);
        }
      }
    },
  };
}

export function createConfiguredStorageBusinessCardReviewProvider({
  env,
  sourceLabel = "Business card review Postgres live storage",
}: ConfiguredStorageBusinessCardReviewProviderOptions = {}): LiveBusinessCardReviewProvider | null {
  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  return createStorageBusinessCardReviewProvider({
    source: `postgres-live-record-store:business-card-review:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });
}
