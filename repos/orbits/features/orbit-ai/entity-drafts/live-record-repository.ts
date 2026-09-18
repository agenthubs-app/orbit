import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import {
  ENTITY_DRAFT_KINDS,
  ENTITY_DRAFT_STATES,
  type EntityDraft,
  type EntityDraftSourceRef,
} from "./contract";
import type { EntityDraftRepository } from "./service";

/**
 * Sprint 0085: drafts as live records.
 *
 * `targetId` carries "pending" or "settled" so the one draft still awaiting
 * confirmation can be fetched by an indexed, bounded query. Scanning a
 * conversation's whole draft history to find it would be an unbounded read, and
 * 0071–0078 spent four sprints removing those.
 */

export const ENTITY_DRAFT_COLLECTION = "agent_entity_drafts";
const TARGET_TYPE = "agent_entity_draft";
const PENDING = "pending";
const SETTLED = "settled";

/** More than one pending draft per conversation is a bug, not a state to tolerate. */
const PENDING_READ_LIMIT = 2;

function targetFor(state: EntityDraft["state"]): string {
  return state === "pending_confirmation" ? PENDING : SETTLED;
}

function toRecord(
  draft: EntityDraft,
  workspaceId: string,
): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: ENTITY_DRAFT_COLLECTION,
    createdAt: draft.createdAt,
    evidenceIds: draft.sourceRefs.map((ref) => `${ref.kind}:${ref.id}`),
    lifecycleState: "active",
    payload: {
      conversationId: draft.conversationId,
      createdAt: draft.createdAt,
      draftId: draft.draftId,
      fields: draft.fields,
      kind: draft.kind,
      revision: draft.revision,
      sourceRefs: draft.sourceRefs,
      state: draft.state,
      updatedAt: draft.updatedAt,
      ...(draft.createdRecordId ? { createdRecordId: draft.createdRecordId } : {}),
      ...(draft.failureReason ? { failureReason: draft.failureReason } : {}),
    },
    recordId: draft.draftId,
    sourceId: draft.conversationId,
    sourceLabel: "Orbit agent entity draft",
    sourceType: "agent",
    targetId: targetFor(draft.state),
    targetType: TARGET_TYPE,
    updatedAt: draft.updatedAt,
    userId: draft.actorId,
    workspaceId,
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFields(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const fields: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const item = text(raw);
    if (!item) return null;
    fields[key] = item;
  }
  // A draft with nothing in it is not confirmable; the proposal schema already
  // refuses to create one, so a stored row like this is corrupt, not empty.
  return Object.keys(fields).length > 0 ? fields : null;
}

function readSourceRefs(value: unknown): readonly EntityDraftSourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const id = text(record.id);
    const kind = text(record.kind);
    return id && kind ? [{ id, kind } as EntityDraftSourceRef] : [];
  });
}

/**
 * A row that cannot be read back as a draft is skipped rather than guessed at:
 * a half-understood draft is exactly the thing a user might confirm by mistake.
 */
export function entityDraftFromRecord(
  record: LiveRecord<Record<string, unknown>>,
): EntityDraft | null {
  const payload = record.payload;
  const draftId = text(payload.draftId);
  const conversationId = text(payload.conversationId);
  const actorId = text(record.userId);
  const fields = readFields(payload.fields);
  const kind = ENTITY_DRAFT_KINDS.find((item) => item === payload.kind);
  const state = ENTITY_DRAFT_STATES.find((item) => item === payload.state);
  const revision = typeof payload.revision === "number" && Number.isInteger(payload.revision)
    ? payload.revision
    : null;
  if (!draftId || !conversationId || !actorId || !fields || !kind || !state || !revision) {
    return null;
  }
  return {
    actorId,
    conversationId,
    createdAt: text(payload.createdAt) ?? record.createdAt,
    draftId,
    fields,
    kind,
    revision,
    sourceRefs: readSourceRefs(payload.sourceRefs),
    state,
    updatedAt: text(payload.updatedAt) ?? record.updatedAt,
    ...(text(payload.createdRecordId) ? { createdRecordId: text(payload.createdRecordId)! } : {}),
    ...(text(payload.failureReason) ? { failureReason: text(payload.failureReason)! } : {}),
  };
}

export function createLiveRecordEntityDraftRepository(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): EntityDraftRepository {
  return {
    async findPending({ actorId, conversationId }) {
      const rows = await input.store.listRecords({
        collectionName: ENTITY_DRAFT_COLLECTION,
        limit: PENDING_READ_LIMIT,
        sourceId: conversationId,
        targetId: PENDING,
        targetType: TARGET_TYPE,
        userId: actorId,
        workspaceId: input.workspaceId,
      });
      for (const row of rows) {
        const draft = entityDraftFromRecord(row);
        if (draft?.state === "pending_confirmation") return draft;
      }
      return null;
    },

    async get({ actorId, draftId }) {
      const row = await input.store.getRecord({
        collectionName: ENTITY_DRAFT_COLLECTION,
        recordId: draftId,
        userId: actorId,
        workspaceId: input.workspaceId,
      });
      if (!row) return null;
      const draft = entityDraftFromRecord(row);
      return draft && draft.actorId === actorId ? draft : null;
    },

    async save(draft) {
      await input.store.upsertRecord(toRecord(draft, input.workspaceId));
    },
  };
}
