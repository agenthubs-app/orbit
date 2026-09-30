import { createHash, randomBytes } from "node:crypto";

import type {
  RelationshipConversationDTO,
  RelationshipConversationListDTO,
  RelationshipDeliveryReceiptDTO,
  RelationshipEligibilityDTO,
  RelationshipInvitationDTO,
  RelationshipInvitationPreviewDTO,
  RelationshipMessageDTO,
  RelationshipReadReceiptDTO,
  RelationshipReplyDraftDTO,
} from "../../shared/contract/relationship-communication";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";
import type {
  RelationshipConversationRow,
  RelationshipMessageRow,
  RelationshipMessageStore,
} from "./message-store";

/**
 * Invitations still live in orbit_records. Since sprint 0109 bindings,
 * conversations, messages and read markers live in the three relationship
 * message tables (message-tables.ts); the other four collection names below are
 * only read by the one-time migration (message-migration.ts), never written.
 */
export const RELATIONSHIP_COMMUNICATION_COLLECTIONS = {
  bindings: "relationship_communication_bindings",
  conversations: "relationship_communication_conversations",
  invitations: "relationship_communication_invitations",
  messages: "relationship_communication_messages",
  reads: "relationship_communication_reads",
} as const;

// Reply drafts share the draft collection the relationship inbox already uses;
// one row per (conversation, account), readable only by that account.
export const RELATIONSHIP_REPLY_DRAFT_COLLECTION = "relationshipConversationDrafts";
export const RELATIONSHIP_REPLY_DRAFT_TARGET_TYPE = "relationship_reply_draft";
const REPLY_DRAFT_MAX_LENGTH = 10_000;
/** GET conversations/[id] is bounded (sprint 0109): the newest messages only; older ones page through /messages. */
export const CONVERSATION_MESSAGE_LIMIT = 200;
const INVITATION_LOOKUP_LIMIT = 50;

export interface RelationshipCommunicationActor {
  accountId: string;
  displayName: string;
  email: string;
}

export interface RelationshipCommunicationContact {
  contactId: string;
  displayName: string;
  organization: string;
  recipientEmail?: string;
}

export interface RelationshipCommunicationServiceOptions {
  actor: RelationshipCommunicationActor;
  invitationBaseUrl: string;
  now?: () => string;
  randomToken?: () => string;
  resolveContact: (
    contactId: string,
    accountId: string,
  ) => Promise<RelationshipCommunicationContact | null>;
  /** Invitations and reply drafts. */
  store: LiveRecordStoreLike<Record<string, unknown>>;
  /** Conversations, members and messages (sprint 0109 tables). */
  messages: RelationshipMessageStore;
  workspaceId: string;
}

export interface CreateRelationshipInvitationInput {
  contactId: string;
  recipientEmail: string;
  recipientName: string;
}

export interface AcceptRelationshipInvitationInput {
  confirmed: boolean;
  token: string;
}

export interface SendRelationshipMessageInput {
  body: string;
  conversationId: string;
  qualificationVersion: string;
  requestId: string;
}

export interface SaveRelationshipReplyDraftInput {
  body: unknown;
  conversationId: string;
}

export interface MarkRelationshipConversationReadInput {
  conversationId: string;
  lastReadMessageId: string;
}

export interface RelationshipCommunicationService {
  acceptInvitation(
    input: AcceptRelationshipInvitationInput,
  ): Promise<RelationshipEligibilityDTO>;
  createInvitation(
    input: CreateRelationshipInvitationInput,
  ): Promise<RelationshipInvitationDTO>;
  getConversation(conversationId: string): Promise<RelationshipConversationDTO>;
  getEligibility(contactId: string): Promise<RelationshipEligibilityDTO>;
  getInvitationPreview(token: string): Promise<RelationshipInvitationPreviewDTO>;
  getReplyDraft(conversationId: string): Promise<RelationshipReplyDraftDTO>;
  listConversations(input?: { limit?: number; cursor?: string }): Promise<RelationshipConversationListDTO>;
  markConversationRead(
    input: MarkRelationshipConversationReadInput,
  ): Promise<RelationshipReadReceiptDTO>;
  revokeContactBinding(contactId: string): Promise<RelationshipEligibilityDTO>;
  saveReplyDraft(input: SaveRelationshipReplyDraftInput): Promise<RelationshipReplyDraftDTO>;
  sendMessage(
    input: SendRelationshipMessageInput,
  ): Promise<RelationshipDeliveryReceiptDTO>;
}

interface InvitationPayload extends Record<string, unknown> {
  acceptedAt?: string;
  acceptedByAccountId?: string;
  contactId: string;
  createdAt: string;
  expiresAt: string;
  invitationId: string;
  inviterAccountId: string;
  inviterDisplayName: string;
  kind: "relationship_invitation";
  recipientEmail: string;
  recipientName: string;
  status: "pending" | "accepted" | "revoked";
  tokenHash: string;
  updatedAt: string;
}

function required(value: string, label: string, max = 512): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function normalizedEmail(value: string): string {
  const email = required(value, "Recipient email", 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Recipient email is invalid.");
  }
  return email;
}

function digest(...values: string[]): string {
  return createHash("sha256").update(values.join("\u0000")).digest("hex");
}

function record<TPayload extends Record<string, unknown>>(input: {
  collectionName: string;
  payload: TPayload;
  recordId: string;
  targetId: string;
  timestamp: string;
  userId?: string;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: input.collectionName,
    createdAt:
      typeof input.payload.createdAt === "string"
        ? input.payload.createdAt
        : input.timestamp,
    evidenceIds: [`evidence:${input.recordId}`],
    lifecycleState: "active",
    occurredAt: input.timestamp,
    payload: input.payload,
    provider: "orbit-relationship-communication",
    providerRecordId: input.recordId,
    recordId: input.recordId,
    searchText: input.targetId,
    sourceId: input.recordId,
    sourceLabel: "Orbit relationship communication",
    sourceType: "system",
    targetId: input.targetId,
    targetType: "conversation",
    updatedAt: input.timestamp,
    userId: input.userId,
    workspaceId: input.workspaceId,
  };
}

function isPayload<TKind extends string>(
  value: LiveRecord<Record<string, unknown>> | null,
  kind: TKind,
): value is LiveRecord<Record<string, unknown>> & {
  payload: Record<string, unknown> & { kind: TKind };
} {
  return value?.payload.kind === kind;
}

function invitationFrom(
  value: LiveRecord<Record<string, unknown>> | null,
): InvitationPayload | null {
  if (!isPayload(value, "relationship_invitation")) return null;
  return value.payload as InvitationPayload;
}





function invitationRecordId(token: string): string {
  return `relationship-invitation:${digest(token)}`;
}

function bindingRecordId(inviterAccountId: string, contactId: string): string {
  return `relationship-binding:${digest(inviterAccountId, contactId)}`;
}

function conversationRecordId(
  inviterAccountId: string,
  remoteAccountId: string,
  contactId: string,
): string {
  return `relationship-conversation:${digest(
    inviterAccountId,
    remoteAccountId,
    contactId,
  )}`;
}

function messageRecordId(
  conversationId: string,
  senderAccountId: string,
  requestId: string,
): string {
  return `relationship-message:${digest(conversationId, senderAccountId, requestId)}`;
}

function replyDraftRecordId(conversationId: string, accountId: string): string {
  return `relationship-reply-draft:${digest(conversationId, accountId)}`;
}


function qualificationVersion(bindingId: string, status: string, updatedAt: string): string {
  return `qv_${digest(bindingId, status, updatedAt).slice(0, 32)}`;
}

function participants(conversation: RelationshipConversationRow): readonly [string, string] {
  return [conversation.inviterAccountId, conversation.inviteeAccountId];
}

function displayNames(conversation: RelationshipConversationRow): Record<string, string> {
  return Object.fromEntries(participants(conversation).map((id) => [id, conversation.members.find((member) => member.accountId === id)?.displayName ?? ""]));
}

function messageDto(message: RelationshipMessageRow): RelationshipMessageDTO {
  return {
    body: message.body,
    conversationId: message.conversationId,
    deliveryState: "delivered",
    messageId: message.messageId,
    senderAccountId: message.senderAccountId,
    senderDisplayName: message.senderDisplayName,
    sentAt: message.sentAt,
  };
}

function addSevenDays(timestamp: string): string {
  return new Date(Date.parse(timestamp) + 7 * 24 * 60 * 60 * 1000).toISOString();
}



export function createRelationshipCommunicationService({
  actor,
  invitationBaseUrl,
  messages,
  now = () => new Date().toISOString(),
  randomToken = () => randomBytes(32).toString("base64url"),
  resolveContact,
  store,
  workspaceId,
}: RelationshipCommunicationServiceOptions): RelationshipCommunicationService {
  const accountId = required(actor.accountId, "Account");
  const displayName = required(actor.displayName, "Display name");
  const email = normalizedEmail(actor.email);
  const baseUrl = required(invitationBaseUrl, "Invitation base URL", 2048).replace(/\/$/, "");
  const scopedWorkspaceId = required(workspaceId, "Workspace");
  if (messages.workspaceId !== scopedWorkspaceId) throw new Error("Relationship message storage belongs to another workspace.");

  async function contactOwnedByActor(contactIdInput: string) {
    const contactId = required(contactIdInput, "Contact");
    const contact = await resolveContact(contactId, accountId);
    if (!contact || contact.contactId !== contactId) {
      throw new Error("This contact is not available to the signed-in account.");
    }
    return contact;
  }

  async function invitationForIntendedAccount(tokenInput: string): Promise<InvitationPayload> {
    const token = required(tokenInput, "Invitation token", 1024);
    const invitation = invitationFrom(
      await store.getRecord({
        collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.invitations,
        recordId: invitationRecordId(token),
        workspaceId: scopedWorkspaceId,
      }),
    );
    if (!invitation || invitation.tokenHash !== digest(token)) {
      throw new Error("This invitation is not available.");
    }
    if (invitation.inviterAccountId === accountId) {
      throw new Error("The inviter cannot accept their own invitation.");
    }
    if (invitation.recipientEmail !== email) {
      throw new Error("This invitation belongs to the intended account email.");
    }
    return invitation;
  }

  /** The conversation row when the actor is an active member of an active conversation. */
  async function visibleConversation(conversationIdInput: string): Promise<RelationshipConversationRow> {
    const conversationId = required(conversationIdInput, "Conversation");
    const conversation = await messages.conversation(conversationId);
    const member = conversation?.members.find((item) => item.accountId === accountId);
    if (!conversation || conversation.status !== "active" || member?.state !== "active" || conversation.members.length !== 2) {
      throw new Error("This conversation is not available to the signed-in account.");
    }
    return conversation;
  }

  async function conversationSnapshot(conversation: RelationshipConversationRow): Promise<RelationshipConversationDTO> {
    const member = conversation.members.find((item) => item.accountId === accountId)!;
    const history = await messages.recentMessages(conversation.conversationId, CONVERSATION_MESSAGE_LIMIT);
    const lastReadMessageId = member.readSeq > 0
      ? history.find((item) => item.seq === member.readSeq)?.messageId
        ?? (await messages.messageIdAtSeq(conversation.conversationId, member.readSeq)) ?? undefined
      : undefined;
    return {
      contactId: conversation.inviterContactId,
      conversationId: conversation.conversationId,
      createdAt: conversation.createdAt,
      lastReadMessageId,
      messages: history.map(messageDto),
      participantAccountIds: participants(conversation),
      participantDisplayNames: displayNames(conversation),
      qualificationVersion: conversation.qualificationVersion,
      status: "active",
      unreadCount: member.unreadCount,
      updatedAt: conversation.lastMessageAt,
    };
  }

  // A delivered reply is no longer a draft (Sprint 0122, Codex 104-C). The send
  // request itself retires the sender's draft saved up to the delivery time, so a
  // lost client-side clear cannot restore sent text, and text saved after the
  // send (another device, a retried request) is never erased. A failure here
  // fails the request; retrying with the same request id is idempotent.
  async function retireReplyDraftSentBy(conversationId: string, sentAt: string): Promise<void> {
    const recordId = replyDraftRecordId(conversationId, accountId);
    const stored = await store.getRecord({
      workspaceId: scopedWorkspaceId,
      collectionName: RELATIONSHIP_REPLY_DRAFT_COLLECTION,
      recordId,
      userId: accountId,
    });
    const payload = stored?.payload;
    if (!payload || payload.accountId !== accountId || payload.conversationId !== conversationId) return;
    if (typeof payload.body !== "string" || !payload.body || typeof payload.updatedAt !== "string") return;
    if (Date.parse(payload.updatedAt) > Date.parse(sentAt)) return;
    await store.upsertRecord({
      ...record({
        collectionName: RELATIONSHIP_REPLY_DRAFT_COLLECTION,
        payload: { ...payload, body: "", updatedAt: sentAt },
        recordId,
        targetId: conversationId,
        timestamp: sentAt,
        userId: accountId,
        workspaceId: scopedWorkspaceId,
      }),
      searchText: "",
      sourceLabel: "Orbit relationship reply draft",
      targetType: RELATIONSHIP_REPLY_DRAFT_TARGET_TYPE,
    });
  }

  return {
    async getEligibility(contactIdInput) {
      const contact = await contactOwnedByActor(contactIdInput);
      const conversation = await messages.conversationForInviterContact(accountId, contact.contactId);
      if (conversation) {
        const remote = conversation.members.find((item) => item.accountId === conversation.inviteeAccountId);
        return {
          canInvite: conversation.status === "revoked",
          canSend: conversation.status === "active",
          contactId: contact.contactId,
          conversationId: conversation.conversationId,
          qualificationVersion: conversation.qualificationVersion,
          remoteAccount: {
            accountId: conversation.inviteeAccountId,
            displayName: remote?.displayName ?? "",
          },
          status: conversation.status === "active" ? "confirmed" : "revoked",
        };
      }
      // Bounded: this actor's invitations to this one contact, newest first.
      const invitations = await store.listRecords({
        limit: INVITATION_LOOKUP_LIMIT,
        collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.invitations,
        targetId: contact.contactId,
        userId: accountId,
        workspaceId: scopedWorkspaceId,
      });
      const pending = invitations
        .map((item) => invitationFrom(item))
        .filter(
          (item): item is InvitationPayload =>
            Boolean(item && item.contactId === contact.contactId && item.status === "pending"),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      if (pending) {
        const expired = Date.parse(pending.expiresAt) <= Date.parse(now());
        return {
          canInvite: expired,
          canSend: false,
          contactId: contact.contactId,
          expiresAt: pending.expiresAt,
          status: expired ? "expired" : "pending",
        };
      }
      return {
        canInvite: true,
        canSend: false,
        contactId: contact.contactId,
        status: "unregistered",
      };
    },

    async getInvitationPreview(tokenInput) {
      const invitation = await invitationForIntendedAccount(tokenInput);
      const expired = Date.parse(invitation.expiresAt) <= Date.parse(now());
      const status = expired && invitation.status === "pending" ? "expired" : invitation.status;
      return {
        canAccept: status === "pending",
        expiresAt: invitation.expiresAt,
        invitationId: invitation.invitationId,
        inviterDisplayName: invitation.inviterDisplayName,
        recipientName: invitation.recipientName,
        status,
      };
    },

    async createInvitation(input) {
      const contact = await contactOwnedByActor(input.contactId);
      const recipientEmail = normalizedEmail(input.recipientEmail);
      const recipientName = required(input.recipientName, "Recipient name");
      const token = required(randomToken(), "Invitation token", 1024);
      const createdAt = now();
      const invitationId = invitationRecordId(token);
      const payload: InvitationPayload = {
        contactId: contact.contactId,
        createdAt,
        expiresAt: addSevenDays(createdAt),
        invitationId,
        inviterAccountId: accountId,
        inviterDisplayName: displayName,
        kind: "relationship_invitation",
        recipientEmail,
        recipientName,
        status: "pending",
        tokenHash: digest(token),
        updatedAt: createdAt,
      };
      await store.upsertRecord(
        record({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.invitations,
          payload,
          recordId: invitationId,
          targetId: contact.contactId,
          timestamp: createdAt,
          userId: accountId,
          workspaceId: scopedWorkspaceId,
        }),
      );
      return {
        canInvite: false,
        canSend: false,
        contactId: contact.contactId,
        createdAt,
        expiresAt: payload.expiresAt,
        externalSendRequested: false,
        invitationId,
        invitationUrl: `${baseUrl}/${encodeURIComponent(token)}`,
        recipientEmail,
        recipientName,
        status: "pending",
        token,
        updatedAt: createdAt,
      };
    },

    async acceptInvitation(input) {
      if (!input.confirmed) {
        throw new Error("Explicit invitation confirmation is required.");
      }
      const invitation = await invitationForIntendedAccount(input.token);
      if (Date.parse(invitation.expiresAt) <= Date.parse(now())) {
        throw new Error("This invitation has expired.");
      }
      if (
        invitation.status === "accepted" &&
        invitation.acceptedByAccountId !== accountId
      ) {
        throw new Error("This invitation is already bound to another account.");
      }
      if (invitation.status === "revoked") {
        throw new Error("This invitation has been revoked.");
      }
      const acceptedAt = invitation.acceptedAt ?? now();
      const bindingId = bindingRecordId(invitation.inviterAccountId, invitation.contactId);
      // One transaction creates the conversation and both member rows; replaying
      // an acceptance returns the stored conversation, a different account or a
      // revoked conversation for the same (inviter, contact) is a conflict.
      const conversation = await messages.createConversation({
        conversationId: conversationRecordId(invitation.inviterAccountId, accountId, invitation.contactId),
        createdAt: acceptedAt,
        inviteeAccountId: accountId,
        inviteeDisplayName: displayName,
        inviterAccountId: invitation.inviterAccountId,
        inviterContactId: invitation.contactId,
        inviterDisplayName: invitation.inviterDisplayName,
        qualificationVersion: qualificationVersion(bindingId, "confirmed", acceptedAt),
      });
      const acceptedInvitation: InvitationPayload = {
        ...invitation,
        acceptedAt,
        acceptedByAccountId: accountId,
        status: "accepted",
        updatedAt: acceptedAt,
      };
      await store.upsertRecord(
        record({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.invitations,
          payload: acceptedInvitation,
          recordId: invitation.invitationId,
          targetId: invitation.contactId,
          timestamp: acceptedAt,
          userId: invitation.inviterAccountId,
          workspaceId: scopedWorkspaceId,
        }),
      );
      return {
        canInvite: false,
        canSend: true,
        contactId: conversation.inviterContactId,
        conversationId: conversation.conversationId,
        qualificationVersion: conversation.qualificationVersion,
        remoteAccount: {
          accountId: invitation.inviterAccountId,
          displayName: invitation.inviterDisplayName,
        },
        status: "confirmed",
      };
    },

    async revokeContactBinding(contactIdInput) {
      const contact = await contactOwnedByActor(contactIdInput);
      const conversation = await messages.conversationForInviterContact(accountId, contact.contactId);
      if (!conversation) {
        throw new Error("No confirmed eligibility exists for this contact.");
      }
      if (conversation.status === "revoked") {
        return {
          canInvite: true,
          canSend: false,
          contactId: conversation.inviterContactId,
          conversationId: conversation.conversationId,
          qualificationVersion: conversation.qualificationVersion,
          status: "revoked",
        };
      }
      const revokedAt = now();
      const version = qualificationVersion(bindingRecordId(accountId, contact.contactId), "revoked", revokedAt);
      await messages.revoke({ conversationId: conversation.conversationId, qualificationVersion: version, revokedAt, revokedByAccountId: accountId });
      const remote = conversation.members.find((item) => item.accountId === conversation.inviteeAccountId);
      return {
        canInvite: true,
        canSend: false,
        contactId: conversation.inviterContactId,
        conversationId: conversation.conversationId,
        qualificationVersion: version,
        remoteAccount: {
          accountId: conversation.inviteeAccountId,
          displayName: remote?.displayName ?? "",
        },
        status: "revoked",
      };
    },

    async listConversations(input = {}) {
      const limit = input.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid conversation page limit");
      let after: { at: string; id: string } | null = null;
      if (input.cursor) {
        try {
          const decoded = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
          if (!Array.isArray(decoded) || decoded.length !== 3 || decoded[0] !== accountId || !Number.isFinite(Date.parse(decoded[1])) || typeof decoded[2] !== "string") throw new Error();
          after = { at: decoded[1], id: decoded[2] };
        } catch { throw new Error("Invalid conversation cursor"); }
      }
      const ids = await messages.memberConversationIds(accountId, limit + 1, after);
      const page: RelationshipConversationDTO[] = [];
      for (const id of ids.slice(0, limit)) {
        const conversation = await messages.conversation(id);
        if (conversation) page.push(await conversationSnapshot(conversation));
      }
      const last = page.at(-1);
      return {
        conversations: page,
        nextCursor: ids.length > limit && last ? Buffer.from(JSON.stringify([accountId, last.updatedAt, last.conversationId])).toString("base64url") : null,
        unreadTotal: await messages.unreadTotal(accountId),
        refreshedAt: now(),
      };
    },

    async getConversation(conversationIdInput) {
      return conversationSnapshot(await visibleConversation(conversationIdInput));
    },

    async sendMessage(input) {
      const conversationId = required(input.conversationId, "Conversation");
      const body = required(input.body, "Message body", 10_000);
      const requestId = required(input.requestId, "Request id");
      const requestedVersion = required(input.qualificationVersion, "Qualification version");
      const { message } = await messages.send({
        body,
        conversationId,
        messageId: messageRecordId(conversationId, accountId, requestId),
        now,
        qualificationVersion: requestedVersion,
        requestId,
        senderAccountId: accountId,
        senderDisplayName: displayName,
      });
      await retireReplyDraftSentBy(conversationId, message.sentAt);
      return {
        conversationId,
        deliveryState: "delivered",
        message: messageDto(message),
        qualificationVersion: requestedVersion,
      };
    },

    async getReplyDraft(conversationIdInput) {
      const conversation = await visibleConversation(conversationIdInput);
      const stored = await store.getRecord({
        workspaceId: scopedWorkspaceId,
        collectionName: RELATIONSHIP_REPLY_DRAFT_COLLECTION,
        recordId: replyDraftRecordId(conversation.conversationId, accountId),
        userId: accountId,
      });
      const payload = stored?.payload;
      const owned = payload && payload.accountId === accountId && payload.conversationId === conversation.conversationId;
      return {
        body: owned && typeof payload.body === "string" ? payload.body : "",
        conversationId: conversation.conversationId,
        updatedAt: owned && typeof payload.updatedAt === "string" ? payload.updatedAt : null,
      };
    },

    async saveReplyDraft(input) {
      if (typeof input.body !== "string" || input.body.length > REPLY_DRAFT_MAX_LENGTH) {
        throw new Error("Draft body must be text of at most 10000 characters.");
      }
      const conversation = await visibleConversation(input.conversationId);
      const updatedAt = now();
      const payload = {
        accountId,
        body: input.body,
        conversationId: conversation.conversationId,
        kind: "relationship_reply_draft",
        updatedAt,
      };
      await store.upsertRecord({
        ...record({
          collectionName: RELATIONSHIP_REPLY_DRAFT_COLLECTION,
          payload,
          recordId: replyDraftRecordId(conversation.conversationId, accountId),
          targetId: conversation.conversationId,
          timestamp: updatedAt,
          userId: accountId,
          workspaceId: scopedWorkspaceId,
        }),
        searchText: "",
        sourceLabel: "Orbit relationship reply draft",
        targetType: RELATIONSHIP_REPLY_DRAFT_TARGET_TYPE,
      });
      return { body: input.body, conversationId: conversation.conversationId, updatedAt };
    },

    async markConversationRead(input) {
      const conversationId = required(input.conversationId, "Conversation");
      const readAt = now();
      await messages.markRead({ accountId, conversationId, messageId: input.lastReadMessageId, now: readAt });
      return {
        conversationId,
        lastReadMessageId: input.lastReadMessageId.trim(),
        readAt,
      };
    },
  };
}
