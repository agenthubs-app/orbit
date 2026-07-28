import type {
  AsyncConversationCreateFromDraftInput,
  AsyncConversationCreateResult,
  AsyncConversationFailure,
  AsyncConversationInput,
  AsyncConversationNoSideEffects,
  AsyncConversationProvenance,
  AsyncConversationStageActionInput,
  AsyncConversationStageResult,
  AsyncConversationWorkspacePayload,
  AsyncConversationWorkspaceResult,
} from "./contract";
import type { AsyncRelationshipConversationService } from "./service";
import type {
  LiveAsyncRelationshipConversationProvider,
  StoredAsyncRelationshipThread,
} from "./storage/async-relationship-conversation-live-record-provider";

export interface LiveAsyncRelationshipConversationServiceOptions {
  provider?: LiveAsyncRelationshipConversationProvider | null;
}

const readSideEffects: AsyncConversationNoSideEffects = {
  calendarEntryCreated: false,
  externalMessageSent: false,
  networkRequestMade: false,
  notificationDelivered: false,
  savedRecordCreated: false,
};

function trimmed(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function failure(
  code: AsyncConversationFailure["error"]["code"],
): AsyncConversationFailure {
  const definitions: Record<
    AsyncConversationFailure["error"]["code"],
    Omit<AsyncConversationFailure["error"], "code" | "evidenceIds">
  > = {
    ASYNC_CONVERSATION_ACTION_NOT_FOUND: {
      appCode: "NOT_FOUND",
      message:
        "No actor-scoped relationship conversation action matches the selected thread.",
      recovery:
        "Reload the selected thread before staging another local preview.",
    },
    ASYNC_CONVERSATION_ACTOR_REQUIRED: {
      appCode: "UNAUTHORIZED",
      message:
        "An authenticated actor is required for live relationship conversations.",
      recovery:
        "Sign in before reading or saving relationship conversation records.",
    },
    ASYNC_CONVERSATION_DRAFT_CONTEXT_REQUIRED: {
      appCode: "VALIDATION_ERROR",
      message:
        "A participant, subject, and body are required before saving a relationship draft thread.",
      recovery:
        "Choose a contact and provide a draft subject and body before saving.",
    },
    ASYNC_CONVERSATION_LIVE_STORE_UNCONFIGURED: {
      appCode: "SERVICE_UNAVAILABLE",
      message:
        "The live relationship conversation store is not configured.",
      recovery:
        "Configure the Orbit live database before using the relationship inbox.",
    },
    ASYNC_CONVERSATION_NOT_FOUND: {
      appCode: "NOT_FOUND",
      message:
        "No actor-scoped relationship conversation matches the selected id.",
      recovery:
        "Choose a conversation from the current account's relationship inbox.",
    },
  };

  return {
    success: false,
    error: {
      code,
      evidenceIds: ["evidence:async-relationship-conversation:failure"],
      ...definitions[code],
    },
  };
}

function provenance(
  provider: LiveAsyncRelationshipConversationProvider,
  evidenceIds: readonly string[],
): AsyncConversationProvenance {
  return {
    evidenceIds:
      evidenceIds.length > 0
        ? [...new Set(evidenceIds)]
        : ["evidence:async-relationship-conversation:empty"],
    generatedBy: "live-async-conversation-service",
    privacy: "actor-scoped-live-relationship-correspondence",
    source: provider.source,
    sourceLabel: provider.sourceLabel,
  };
}

function inboxItem(thread: StoredAsyncRelationshipThread) {
  const latest = thread.messages[thread.messages.length - 1];

  return {
    contactId: thread.contactId,
    conversationId: thread.conversationId,
    lastCorrespondenceAt: thread.updatedAt,
    nextActionLabel: "复核关系上下文后再决定是否外发",
    organization: thread.organization,
    participantName: thread.participantName,
    preview: latest?.body ?? "",
    sourceContextLabels: thread.sourceContextLabels,
    subject: thread.subject,
    unreadCount: latest?.senderRole === "contact" ? 1 : 0,
  };
}

function workspacePayload(input: {
  actorDisplayName: string;
  actorId: string;
  conversationId?: string | null;
  provider: LiveAsyncRelationshipConversationProvider;
  threads: readonly StoredAsyncRelationshipThread[];
}): AsyncConversationWorkspacePayload | AsyncConversationFailure {
  const currentUser = {
    displayName: input.actorDisplayName || "我",
    timezone: "Asia/Tokyo",
    userId: input.actorId,
  };
  const inbox = {
    conversations: input.threads.map(inboxItem),
    title: "关系收件箱",
  };

  if (input.threads.length === 0) {
    return {
      state: "empty",
      connection: null,
      contact: null,
      currentUser,
      draftReply: null,
      event: null,
      followUpTask: null,
      inbox,
      nextActions: [],
      provenance: provenance(input.provider, []),
      schedule: null,
      selectedThread: null,
      sideEffects: readSideEffects,
    };
  }

  const requestedId = trimmed(input.conversationId);
  const selected = requestedId
    ? input.threads.find((thread) => thread.conversationId === requestedId)
    : input.threads[0];

  if (!selected) {
    return failure("ASYNC_CONVERSATION_NOT_FOUND");
  }

  return {
    state: "success",
    connection: {
      connectionId: `connection:${selected.contactId}`,
      contactId: selected.contactId,
      evidenceIds: selected.evidenceIds,
      relationshipReason: selected.relationshipSummary,
      relationshipStage: "active",
      sourceContextLabel:
        selected.sourceContextLabels[0] ?? input.provider.sourceLabel,
    },
    contact: {
      contactId: selected.contactId,
      displayName: selected.participantName,
      organization: selected.organization,
      role: "",
      sourceContextLabel:
        selected.sourceContextLabels[0] ?? input.provider.sourceLabel,
    },
    currentUser,
    draftReply: {
      body: "",
      draftId: `draft-reply:${selected.conversationId}`,
      evidenceIds: selected.evidenceIds,
      externalSendStatus: "not_requested",
      sourceContextLabel:
        selected.sourceContextLabels[0] ?? input.provider.sourceLabel,
      tone: "待用户起草",
    },
    event: null,
    followUpTask: null,
    inbox,
    nextActions: [],
    provenance: provenance(input.provider, selected.evidenceIds),
    schedule: null,
    selectedThread: {
      conversationId: selected.conversationId,
      correspondenceMode: "asynchronous",
      messages: selected.messages.map((message) => ({
        body: message.body,
        deliveryState:
          message.senderRole === "contact"
            ? "received_snapshot"
            : "local_draft_snapshot",
        evidenceIds: message.evidenceIds,
        messageId: message.messageId,
        occurredAt: message.occurredAt,
        senderName: message.senderName,
        senderRole: message.senderRole,
        sourceContextLabel: message.sourceContextLabel,
      })),
      realtimeTransportEnabled: false,
      sourceContextLabels: selected.sourceContextLabels,
      subject: selected.subject,
      summary: selected.relationshipSummary,
      threadId: `thread:${selected.conversationId}`,
    },
    sideEffects: readSideEffects,
  };
}

export function createLiveAsyncRelationshipConversationService({
  provider = null,
}: LiveAsyncRelationshipConversationServiceOptions = {}): AsyncRelationshipConversationService {
  return {
    async createConversationFromDraft(
      input: AsyncConversationCreateFromDraftInput,
    ): Promise<AsyncConversationCreateResult> {
      if (!provider) {
        return failure("ASYNC_CONVERSATION_LIVE_STORE_UNCONFIGURED");
      }

      const actorId = trimmed(input.actorId);
      const participantName = trimmed(input.participantName);
      const subject = trimmed(input.subject);
      const body = trimmed(input.body);

      if (!actorId) {
        return failure("ASYNC_CONVERSATION_ACTOR_REQUIRED");
      }

      if (!participantName || !subject || !body) {
        return failure("ASYNC_CONVERSATION_DRAFT_CONTEXT_REQUIRED");
      }

      const stagedAt =
        trimmed(input.stagedAt) &&
        Number.isFinite(Date.parse(trimmed(input.stagedAt)))
          ? new Date(trimmed(input.stagedAt)).toISOString()
          : new Date().toISOString();
      const sourceLabel =
        trimmed(input.sourceLabel) || "Orbit 内部关系草稿";
      const stored = await provider.saveDraftThread({
        actorDisplayName: trimmed(input.actorDisplayName) || "我",
        actorId,
        body,
        contactId:
          trimmed(input.contactId) ||
          `contact:draft:${participantName.normalize("NFKC")}`,
        organization: trimmed(input.organization),
        participantName,
        sourceLabel,
        stagedAt,
        subject,
      });
      const firstMessage = stored.messages[0];
      const savedSideEffects: AsyncConversationNoSideEffects = {
        ...readSideEffects,
        savedRecordCreated: true,
      };

      return {
        success: true,
        data: {
          inboxItem: inboxItem(stored),
          noSideEffectStatement:
            "Orbit 已保存内部草稿记录；没有发送外部消息、通知或日历写入。",
          provenance: provenance(provider, stored.evidenceIds),
          sideEffects: savedSideEffects,
          state: "saved_draft_created",
          thread: {
            conversationId: stored.conversationId,
            correspondenceMode: "asynchronous",
            messages: firstMessage
              ? [
                  {
                    body: firstMessage.body,
                    deliveryState: "local_draft_snapshot",
                    evidenceIds: firstMessage.evidenceIds,
                    messageId: firstMessage.messageId,
                    occurredAt: firstMessage.occurredAt,
                    senderName: firstMessage.senderName,
                    senderRole: "orbit_user",
                    sourceContextLabel: firstMessage.sourceContextLabel,
                  },
                ]
              : [],
            realtimeTransportEnabled: false,
            sourceContextLabels: stored.sourceContextLabels,
            subject: stored.subject,
            summary: stored.relationshipSummary,
            threadId: `thread:${stored.conversationId}`,
          },
        },
      };
    },

    async getCorrespondenceWorkspace(
      input: AsyncConversationInput = {},
    ): Promise<AsyncConversationWorkspaceResult> {
      if (!provider) {
        return failure("ASYNC_CONVERSATION_LIVE_STORE_UNCONFIGURED");
      }

      const actorId = trimmed(input.actorId ?? input.userId);

      if (!actorId) {
        return failure("ASYNC_CONVERSATION_ACTOR_REQUIRED");
      }

      const threads = await provider.readThreads(actorId);
      const payload = workspacePayload({
        actorDisplayName: trimmed(input.actorDisplayName) || "我",
        actorId,
        conversationId: input.conversationId,
        provider,
        threads,
      });

      return "success" in payload ? payload : { success: true, data: payload };
    },

    async stageConversationAction(
      input: AsyncConversationStageActionInput,
    ): Promise<AsyncConversationStageResult> {
      if (!provider) {
        return failure("ASYNC_CONVERSATION_LIVE_STORE_UNCONFIGURED");
      }

      const actorId = trimmed(input.actorId ?? input.userId);
      const conversationId = trimmed(input.conversationId);
      const actionId = trimmed(input.actionId);

      if (!actorId) {
        return failure("ASYNC_CONVERSATION_ACTOR_REQUIRED");
      }

      if (!conversationId || !actionId) {
        return failure("ASYNC_CONVERSATION_ACTION_NOT_FOUND");
      }

      const thread = (await provider.readThreads(actorId)).find(
        (candidate) => candidate.conversationId === conversationId,
      );

      if (!thread) {
        return failure("ASYNC_CONVERSATION_NOT_FOUND");
      }

      const sourceContextLabel =
        thread.sourceContextLabels[0] ?? provider.sourceLabel;

      return {
        success: true,
        data: {
          draftReply: {
            body: "",
            draftId: `draft-reply:${conversationId}`,
            evidenceIds: thread.evidenceIds,
            externalSendStatus: "not_requested",
            sourceContextLabel,
            tone: "待用户起草",
          },
          nextAction: {
            actionId,
            description: "只生成本地复核状态，不执行任何外部操作。",
            eventId: "",
            followUpTaskId: "",
            scheduleWindowId: "",
            sourceContextLabel,
            stageHref: `/app/chat?conversationId=${encodeURIComponent(conversationId)}`,
            title: "复核关系草稿",
          },
          provenance: provenance(provider, thread.evidenceIds),
          sideEffects: readSideEffects,
          stage: {
            actionId,
            conversationId,
            noSideEffectStatement:
              "没有发送外部消息、通知或创建日历记录。",
            previewBody: "",
            sourceContextLabel,
            stagedAt: new Date().toISOString(),
            status: "staged_local_preview",
          },
          state: "staged",
        },
      };
    },
  };
}
