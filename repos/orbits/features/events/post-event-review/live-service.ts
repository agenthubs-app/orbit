import {
  POST_EVENT_REVIEW_ERROR_DEFINITIONS,
  type ConfirmPostEventContactsInput,
  type ConfirmedPostEventContact,
  type PostEventContactReviewService,
  type PostEventReviewConfirmPayload,
  type PostEventReviewConfirmResult,
  type PostEventReviewErrorCode,
  type PostEventReviewFailure,
  type PostEventReviewInput,
  type PostEventReviewPayload,
  type PostEventReviewResult,
} from "./contract";
import type { EventCapabilityRecordProvider } from "../storage/event-work-record-provider";

export interface LivePostEventContactReviewServiceOptions {
  now?: () => string;
  provider?:
    | EventCapabilityRecordProvider<
        PostEventReviewPayload | PostEventReviewConfirmPayload
      >
    | null;
}

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function normalizeEventId(eventId?: string | null): string {
  return eventId?.trim() ?? "";
}

function failure(
  code: PostEventReviewErrorCode,
  input: {
    collectedAt: string;
    provider?: EventCapabilityRecordProvider<object> | null;
  },
): PostEventReviewFailure {
  const definition = POST_EVENT_REVIEW_ERROR_DEFINITIONS[code];
  const evidenceIds = [`evidence:${code.toLowerCase()}`];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: {
        source: input.provider?.source ?? "live-store:post-event-review:unconfigured",
        sourceLabel:
          input.provider?.sourceLabel ?? "Unconfigured post-event review store",
        evidenceIds,
        collectedAt: input.collectedAt,
        privacy: "demo-post-event-review-only",
        generationMethod: "live-store-query",
        aiProviderRequested: false,
        externalNetworkRequested: false,
        liveDatabaseReadExecuted: false,
        liveDatabaseWriteExecuted: false,
        batchPersistenceExecuted: false,
        calendarProviderRequested: false,
        emailProviderRequested: false,
        notificationDelivered: false,
      },
      evidenceIds,
    },
  };
}

function isReviewPayload(
  payload: PostEventReviewPayload | PostEventReviewConfirmPayload,
): payload is PostEventReviewPayload {
  return "contacts" in payload;
}

function withLiveRead(
  payload: PostEventReviewPayload,
  input: {
    collectedAt: string;
    provider: EventCapabilityRecordProvider<object>;
  },
): PostEventReviewPayload {
  return {
    ...payload,
    event: {
      ...payload.event,
      liveDatabaseReadExecuted: true,
    },
    provenance: {
      ...payload.provenance,
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
      collectedAt: input.collectedAt,
      generationMethod: "live-store-query",
      liveDatabaseReadExecuted: true,
    },
  };
}

function confirmedContactsFor(
  payload: PostEventReviewPayload,
  contactDraftIds: readonly string[],
): readonly ConfirmedPostEventContact[] {
  const requestedIds =
    contactDraftIds.length > 0 ? new Set(contactDraftIds) : null;

  return payload.contacts
    .filter(
      (contact) => requestedIds === null || requestedIds.has(contact.contactDraftId),
    )
    .map((contact) => ({
      contactId: `contact:post-event:${contact.contactDraftId.replace(/[^a-z0-9]+/gi, "-")}`,
      contactDraftId: contact.contactDraftId,
      displayName: contact.displayName,
      tags: contact.tags.map((tag) => tag.label),
      followUpSuggestion: contact.followUpSuggestion,
      source: contact.source,
      evidenceIds: contact.evidenceIds,
      batchPersistenceExecuted: true,
      liveDatabaseWriteExecuted: true,
      notificationDelivered: false,
      externalMessageSendRequested: false,
    }));
}

export function createLivePostEventContactReviewService({
  now = () => new Date().toISOString(),
  provider,
}: LivePostEventContactReviewServiceOptions = {}): PostEventContactReviewService {
  async function loadReview(eventId: string): Promise<PostEventReviewPayload | null> {
    const payload = provider ? await provider.getPayload(eventId) : null;

    return payload && isReviewPayload(payload) ? payload : null;
  }

  return {
    async getPostEventReview(input = {}): Promise<PostEventReviewResult> {
      const collectedAt = now();
      const eventId = normalizeEventId(input.eventId);

      if (!eventId) {
        return failure("POST_EVENT_REVIEW_EVENT_ID_REQUIRED", {
          collectedAt,
          provider,
        });
      }

      if (!provider) {
        return failure("POST_EVENT_REVIEW_LIVE_STORE_UNCONFIGURED", {
          collectedAt,
          provider,
        });
      }

      const payload = await loadReview(eventId);

      if (!payload) {
        return failure("POST_EVENT_REVIEW_EVENT_NOT_FOUND", {
          collectedAt,
          provider,
        });
      }

      return {
        success: true,
        data: clonePayload(
          withLiveRead(payload, {
            collectedAt,
            provider,
          }),
        ),
      };
    },
    async confirmPostEventContacts(
      input = {},
    ): Promise<PostEventReviewConfirmResult> {
      const collectedAt = now();
      const eventId = normalizeEventId(input.eventId);

      if (!eventId) {
        return failure("POST_EVENT_REVIEW_EVENT_ID_REQUIRED", {
          collectedAt,
          provider,
        });
      }

      if (!provider) {
        return failure("POST_EVENT_REVIEW_LIVE_STORE_UNCONFIGURED", {
          collectedAt,
          provider,
        });
      }

      const payload = await loadReview(eventId);

      if (!payload) {
        return failure("POST_EVENT_REVIEW_EVENT_NOT_FOUND", {
          collectedAt,
          provider,
        });
      }

      const confirmedContacts = confirmedContactsFor(
        payload,
        input.contactDraftIds ?? [],
      );

      if (confirmedContacts.length === 0) {
        return failure("POST_EVENT_REVIEW_EMPTY", {
          collectedAt,
          provider,
        });
      }

      const data: PostEventReviewConfirmPayload = {
        state: "confirmed",
        event: {
          ...payload.event,
          liveDatabaseReadExecuted: true,
        },
        eventId,
        reviewId: payload.reviewId,
        confirmedContacts,
        summary: "Live storage confirmed selected post-event contact drafts.",
        provenance: {
          ...payload.provenance,
          source: provider.source,
          sourceLabel: provider.sourceLabel,
          collectedAt,
          generationMethod: "live-store-confirmation",
          liveDatabaseReadExecuted: true,
          liveDatabaseWriteExecuted: true,
          batchPersistenceExecuted: true,
        },
        nextAction:
          "Review confirmed contacts before any formal Contacts write or follow-up send.",
      };

      await provider.upsertPayload(
        eventId,
        {
          ...payload,
          provenance: data.provenance,
        },
        {
          evidenceIds: data.provenance.evidenceIds,
        },
      );

      return {
        success: true,
        data: clonePayload(data),
      };
    },
  };
}
