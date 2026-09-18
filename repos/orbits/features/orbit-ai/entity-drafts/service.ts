import {
  entityDraftIdempotencyKey,
  parseEntityDraftProposal,
  type EntityDraft,
  type EntityDraftFields,
  type EntityDraftKind,
  type EntityDraftProposal,
} from "./contract";

/**
 * Sprint 0085: the confirm → write → read-back path, held by code.
 *
 * The model reaches this file only through `propose`, and `propose` never
 * writes. The only edge that touches a domain record is `confirm`, and it is
 * called from a user action.
 */

export interface EntityDraftRepository {
  /** The one draft in this conversation still awaiting confirmation, if any. */
  findPending: (input: {
    actorId: string;
    conversationId: string;
  }) => Promise<EntityDraft | null>;
  get: (input: { actorId: string; draftId: string }) => Promise<EntityDraft | null>;
  save: (draft: EntityDraft) => Promise<void>;
}

export interface EntityDraftWriteResult {
  recordId: string;
}

/**
 * One per entity kind. It receives an already-confirmed draft and the
 * idempotency key, writes through the domain service, and reports the id it
 * can read back. Throwing is a failure the card shows and the user can retry.
 */
export interface EntityDraftWriteAdapter {
  kind: EntityDraftKind;
  write: (input: {
    actorId: string;
    draft: EntityDraft;
    idempotencyKey: string;
    now: string;
  }) => Promise<EntityDraftWriteResult>;
}

export type EntityDraftConfirmOutcome =
  | { kind: "created"; draft: EntityDraft }
  | { kind: "failed"; draft: EntityDraft; reason: string }
  | { kind: "unsupported"; draft: EntityDraft }
  | { kind: "not_pending"; draft: EntityDraft | null };

export interface EntityDraftService {
  propose: (input: {
    actorId: string;
    conversationId: string;
    draftId: string;
    now: string;
    proposal: unknown;
  }) => Promise<EntityDraft | null>;
  revise: (input: {
    actorId: string;
    draftId: string;
    fields: EntityDraftFields;
    now: string;
  }) => Promise<EntityDraft | null>;
  confirm: (input: {
    actorId: string;
    draftId: string;
    now: string;
  }) => Promise<EntityDraftConfirmOutcome>;
  cancel: (input: {
    actorId: string;
    draftId: string;
    now: string;
  }) => Promise<EntityDraft | null>;
  pending: (input: {
    actorId: string;
    conversationId: string;
  }) => Promise<EntityDraft | null>;
}

export function createEntityDraftService(input: {
  adapters: readonly EntityDraftWriteAdapter[];
  repository: EntityDraftRepository;
}): EntityDraftService {
  const adapters = new Map(input.adapters.map((adapter) => [adapter.kind, adapter]));

  async function supersedePending(
    actorId: string,
    conversationId: string,
    now: string,
  ): Promise<void> {
    const existing = await input.repository.findPending({ actorId, conversationId });
    if (!existing) return;
    await input.repository.save({ ...existing, state: "superseded", updatedAt: now });
  }

  return {
    async propose(request) {
      const proposal: EntityDraftProposal | null = parseEntityDraftProposal(request.proposal);
      if (!proposal) return null;
      // Replace before inserting: two pending drafts would make "确认" ambiguous.
      await supersedePending(request.actorId, request.conversationId, request.now);
      const draft: EntityDraft = {
        actorId: request.actorId,
        conversationId: request.conversationId,
        createdAt: request.now,
        draftId: request.draftId,
        fields: proposal.fields,
        kind: proposal.kind,
        revision: 1,
        sourceRefs: proposal.sourceRefs,
        state: "pending_confirmation",
        updatedAt: request.now,
      };
      await input.repository.save(draft);
      return draft;
    },

    async revise(request) {
      const draft = await input.repository.get({
        actorId: request.actorId,
        draftId: request.draftId,
      });
      if (!draft || draft.state !== "pending_confirmation") return null;
      const fields = { ...draft.fields, ...request.fields };
      // A new revision means a new idempotency key, so the edited version is a
      // write of its own rather than a duplicate of the one before it.
      const revised: EntityDraft = {
        ...draft,
        fields,
        revision: draft.revision + 1,
        updatedAt: request.now,
      };
      await input.repository.save(revised);
      return revised;
    },

    async confirm(request) {
      const draft = await input.repository.get({
        actorId: request.actorId,
        draftId: request.draftId,
      });
      if (!draft || draft.state !== "pending_confirmation") {
        return { draft, kind: "not_pending" };
      }
      const adapter = adapters.get(draft.kind);
      if (!adapter) return { draft, kind: "unsupported" };

      try {
        const written = await adapter.write({
          actorId: request.actorId,
          draft,
          idempotencyKey: entityDraftIdempotencyKey(draft),
          now: request.now,
        });
        const created: EntityDraft = {
          ...draft,
          createdRecordId: written.recordId,
          state: "created",
          updatedAt: request.now,
        };
        await input.repository.save(created);
        return { draft: created, kind: "created" };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "写入未成功";
        // Stay pending, not failed-and-gone: the user can fix a field and
        // confirm again without the model having to re-draft it.
        const failed: EntityDraft = {
          ...draft,
          failureReason: reason,
          state: "pending_confirmation",
          updatedAt: request.now,
        };
        await input.repository.save(failed);
        return { draft: failed, kind: "failed", reason };
      }
    },

    async cancel(request) {
      const draft = await input.repository.get({
        actorId: request.actorId,
        draftId: request.draftId,
      });
      if (!draft || draft.state !== "pending_confirmation") return null;
      const cancelled: EntityDraft = { ...draft, state: "cancelled", updatedAt: request.now };
      await input.repository.save(cancelled);
      return cancelled;
    },

    pending(request) {
      return input.repository.findPending(request);
    },
  };
}
