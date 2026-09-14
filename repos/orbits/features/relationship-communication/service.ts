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
} from "../../shared/contract/relationship-communication";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";

export const RELATIONSHIP_COMMUNICATION_COLLECTIONS = {
  bindings: "relationship_communication_bindings",
  conversations: "relationship_communication_conversations",
  invitations: "relationship_communication_invitations",
  messages: "relationship_communication_messages",
  reads: "relationship_communication_reads",
} as const;

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
  store: LiveRecordStoreLike<Record<string, unknown>>;
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
  listConversations(): Promise<RelationshipConversationListDTO>;
  markConversationRead(
    input: MarkRelationshipConversationReadInput,
  ): Promise<RelationshipReadReceiptDTO>;
  revokeContactBinding(contactId: string): Promise<RelationshipEligibilityDTO>;
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

interface BindingPayload extends Record<string, unknown> {
  bindingId: string;
  contactId: string;
  conversationId: string;
  createdAt: string;
  inviterAccountId: string;
  inviterDisplayName: string;
  kind: "relationship_binding";
  qualificationVersion: string;
  remoteAccountId: string;
  remoteDisplayName: string;
  revokedAt?: string;
  status: "confirmed" | "revoked";
  updatedAt: string;
}

interface ConversationPayload extends Record<string, unknown> {
  bindingId: string;
  contactId: string;
  conversationId: string;
  createdAt: string;
  kind: "relationship_conversation";
  participantAccountIds: [string, string];
  participantDisplayNames: Record<string, string>;
  qualificationVersion: string;
  status: "active" | "revoked";
  updatedAt: string;
}

interface MessagePayload extends Record<string, unknown> {
  body: string;
  conversationId: string;
  deliveryState: "delivered";
  kind: "relationship_message";
  messageId: string;
  qualificationVersion: string;
  requestId: string;
  senderAccountId: string;
  senderDisplayName: string;
  sentAt: string;
}

interface ReadPayload extends Record<string, unknown> {
  accountId: string;
  conversationId: string;
  kind: "relationship_read";
  lastReadMessageId: string;
  readAt: string;
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

function bindingFrom(
  value: LiveRecord<Record<string, unknown>> | null,
): BindingPayload | null {
  if (!isPayload(value, "relationship_binding")) return null;
  return value.payload as BindingPayload;
}

function conversationFrom(
  value: LiveRecord<Record<string, unknown>> | null,
): ConversationPayload | null {
  if (!isPayload(value, "relationship_conversation")) return null;
  return value.payload as ConversationPayload;
}

function messageFrom(
  value: LiveRecord<Record<string, unknown>>,
): MessagePayload | null {
  return value.payload.kind === "relationship_message"
    ? (value.payload as MessagePayload)
    : null;
}

function readFrom(
  value: LiveRecord<Record<string, unknown>> | null,
): ReadPayload | null {
  if (!isPayload(value, "relationship_read")) return null;
  return value.payload as ReadPayload;
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

function readRecordId(conversationId: string, accountId: string): string {
  return `relationship-read:${digest(conversationId, accountId)}`;
}

function qualificationVersion(bindingId: string, status: string, updatedAt: string): string {
  return `qv_${digest(bindingId, status, updatedAt).slice(0, 32)}`;
}

function addSevenDays(timestamp: string): string {
  return new Date(Date.parse(timestamp) + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function hasParticipant(conversation: ConversationPayload, accountId: string): boolean {
  return conversation.participantAccountIds.includes(accountId);
}

function messageDto(payload: MessagePayload): RelationshipMessageDTO {
  return {
    body: payload.body,
    conversationId: payload.conversationId,
    deliveryState: "delivered",
    messageId: payload.messageId,
    senderAccountId: payload.senderAccountId,
    senderDisplayName: payload.senderDisplayName,
    sentAt: payload.sentAt,
  };
}

export function createRelationshipCommunicationService({
  actor,
  invitationBaseUrl,
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

  async function contactOwnedByActor(contactIdInput: string) {
    const contactId = required(contactIdInput, "Contact");
    const contact = await resolveContact(contactId, accountId);
    if (!contact || contact.contactId !== contactId) {
      throw new Error("This contact is not available to the signed-in account.");
    }
    return contact;
  }

  async function bindingForContact(contactId: string): Promise<BindingPayload | null> {
    return bindingFrom(
      await store.getRecord({
        collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.bindings,
        recordId: bindingRecordId(accountId, contactId),
        workspaceId: scopedWorkspaceId,
      }),
    );
  }

  async function messagesFor(conversationId: string): Promise<MessagePayload[]> {
    const records = await store.listRecords({
      collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.messages,
      targetId: conversationId,
      workspaceId: scopedWorkspaceId,
    });
    return records
      .flatMap((item) => {
        const payload = messageFrom(item);
        return payload && payload.conversationId === conversationId ? [payload] : [];
      })
      .sort(
        (left, right) =>
          left.sentAt.localeCompare(right.sentAt) ||
          left.messageId.localeCompare(right.messageId),
      );
  }

  async function currentBindingForConversation(
    conversation: ConversationPayload,
  ): Promise<BindingPayload | null> {
    const binding = bindingFrom(
      await store.getRecord({
        collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.bindings,
        recordId: conversation.bindingId,
        workspaceId: scopedWorkspaceId,
      }),
    );
    if (
      !binding ||
      binding.status !== "confirmed" ||
      conversation.status !== "active" ||
      binding.contactId !== conversation.contactId ||
      binding.conversationId !== conversation.conversationId ||
      binding.qualificationVersion !== conversation.qualificationVersion ||
      !conversation.participantAccountIds.includes(binding.inviterAccountId) ||
      !conversation.participantAccountIds.includes(binding.remoteAccountId)
    ) {
      return null;
    }
    return binding;
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

  async function conversationSnapshot(
    payload: ConversationPayload,
  ): Promise<RelationshipConversationDTO> {
    const messages = await messagesFor(payload.conversationId);
    const read = readFrom(
      await store.getRecord({
        collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.reads,
        recordId: readRecordId(payload.conversationId, accountId),
        workspaceId: scopedWorkspaceId,
      }),
    );
    const readIndex = read
      ? messages.findIndex((item) => item.messageId === read.lastReadMessageId)
      : -1;
    const unreadCount = messages.filter(
      (item, index) => item.senderAccountId !== accountId && index > readIndex,
    ).length;
    return {
      contactId: payload.contactId,
      conversationId: payload.conversationId,
      createdAt: payload.createdAt,
      lastReadMessageId: read?.lastReadMessageId,
      messages: messages.map(messageDto),
      participantAccountIds: payload.participantAccountIds,
      participantDisplayNames: payload.participantDisplayNames,
      qualificationVersion: payload.qualificationVersion,
      status: payload.status,
      unreadCount,
      updatedAt: payload.updatedAt,
    };
  }

  async function conversationDto(payload: ConversationPayload): Promise<RelationshipConversationDTO> {
    if (
      !hasParticipant(payload, accountId) ||
      !(await currentBindingForConversation(payload))
    ) {
      throw new Error("This conversation is not available to the signed-in account.");
    }
    return conversationSnapshot(payload);
  }

  return {
    async getEligibility(contactIdInput) {
      const contact = await contactOwnedByActor(contactIdInput);
      const binding = await bindingForContact(contact.contactId);
      if (binding) {
        return {
          canInvite: binding.status === "revoked",
          canSend: binding.status === "confirmed",
          contactId: contact.contactId,
          conversationId: binding.conversationId,
          qualificationVersion: binding.qualificationVersion,
          remoteAccount: {
            accountId: binding.remoteAccountId,
            displayName: binding.remoteDisplayName,
          },
          status: binding.status,
        };
      }
      const invitations = await store.listRecords({
        collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.invitations,
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
      const bindingId = bindingRecordId(
        invitation.inviterAccountId,
        invitation.contactId,
      );
      const conversationId = conversationRecordId(
        invitation.inviterAccountId,
        accountId,
        invitation.contactId,
      );
      const version = qualificationVersion(bindingId, "confirmed", acceptedAt);
      const existingBinding = bindingFrom(
        await store.getRecord({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.bindings,
          recordId: bindingId,
          workspaceId: scopedWorkspaceId,
        }),
      );
      if (
        existingBinding &&
        (existingBinding.remoteAccountId !== accountId ||
          existingBinding.status === "revoked")
      ) {
        throw new Error("This contact identity has a conflicting binding.");
      }
      const binding: BindingPayload = existingBinding ?? {
        bindingId,
        contactId: invitation.contactId,
        conversationId,
        createdAt: acceptedAt,
        inviterAccountId: invitation.inviterAccountId,
        inviterDisplayName: invitation.inviterDisplayName,
        kind: "relationship_binding",
        qualificationVersion: version,
        remoteAccountId: accountId,
        remoteDisplayName: displayName,
        status: "confirmed",
        updatedAt: acceptedAt,
      };
      const conversation: ConversationPayload = {
        bindingId,
        contactId: invitation.contactId,
        conversationId,
        createdAt: binding.createdAt,
        kind: "relationship_conversation",
        participantAccountIds: [invitation.inviterAccountId, accountId],
        participantDisplayNames: {
          [invitation.inviterAccountId]: invitation.inviterDisplayName,
          [accountId]: displayName,
        },
        qualificationVersion: binding.qualificationVersion,
        status: "active",
        updatedAt: binding.updatedAt,
      };
      await store.upsertRecord(
        record({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.bindings,
          payload: binding,
          recordId: bindingId,
          targetId: invitation.contactId,
          timestamp: binding.updatedAt,
          userId: invitation.inviterAccountId,
          workspaceId: scopedWorkspaceId,
        }),
      );
      await store.upsertRecord(
        record({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations,
          payload: conversation,
          recordId: conversationId,
          targetId: conversationId,
          timestamp: conversation.updatedAt,
          workspaceId: scopedWorkspaceId,
        }),
      );
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
        contactId: binding.contactId,
        conversationId,
        qualificationVersion: binding.qualificationVersion,
        remoteAccount: {
          accountId: invitation.inviterAccountId,
          displayName: invitation.inviterDisplayName,
        },
        status: "confirmed",
      };
    },

    async revokeContactBinding(contactIdInput) {
      const contact = await contactOwnedByActor(contactIdInput);
      const binding = await bindingForContact(contact.contactId);
      if (!binding) {
        throw new Error("No confirmed eligibility exists for this contact.");
      }
      if (binding.status === "revoked") {
        return {
          canInvite: true,
          canSend: false,
          contactId: binding.contactId,
          conversationId: binding.conversationId,
          qualificationVersion: binding.qualificationVersion,
          status: "revoked",
        };
      }
      const revokedAt = now();
      const version = qualificationVersion(binding.bindingId, "revoked", revokedAt);
      const revoked: BindingPayload = {
        ...binding,
        qualificationVersion: version,
        revokedAt,
        status: "revoked",
        updatedAt: revokedAt,
      };
      await store.upsertRecord(
        record({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.bindings,
          payload: revoked,
          recordId: binding.bindingId,
          targetId: binding.contactId,
          timestamp: revokedAt,
          userId: accountId,
          workspaceId: scopedWorkspaceId,
        }),
      );
      const conversation = conversationFrom(
        await store.getRecord({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations,
          recordId: binding.conversationId,
          workspaceId: scopedWorkspaceId,
        }),
      );
      if (conversation) {
        await store.upsertRecord(
          record({
            collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations,
            payload: {
              ...conversation,
              qualificationVersion: version,
              status: "revoked",
              updatedAt: revokedAt,
            },
            recordId: conversation.conversationId,
            targetId: conversation.conversationId,
            timestamp: revokedAt,
            workspaceId: scopedWorkspaceId,
          }),
        );
      }
      return {
        canInvite: true,
        canSend: false,
        contactId: revoked.contactId,
        conversationId: revoked.conversationId,
        qualificationVersion: version,
        remoteAccount: {
          accountId: revoked.remoteAccountId,
          displayName: revoked.remoteDisplayName,
        },
        status: "revoked",
      };
    },

    async listConversations() {
      const records = await store.listRecords({
        collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations,
        workspaceId: scopedWorkspaceId,
      });
      const candidates = await Promise.all(
        records.map(async (item) => {
          const payload = conversationFrom(item);
          if (
            !payload ||
            !hasParticipant(payload, accountId) ||
            !(await currentBindingForConversation(payload))
          ) {
            return null;
          }
          return conversationSnapshot(payload);
        }),
      );
      const conversations = candidates.filter(
        (item): item is RelationshipConversationDTO => item !== null,
      );
      return {
        conversations: conversations.sort(
          (left, right) => right.updatedAt.localeCompare(left.updatedAt),
        ),
        refreshedAt: now(),
      };
    },

    async getConversation(conversationIdInput) {
      const conversationId = required(conversationIdInput, "Conversation");
      const payload = conversationFrom(
        await store.getRecord({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations,
          recordId: conversationId,
          workspaceId: scopedWorkspaceId,
        }),
      );
      if (!payload || !hasParticipant(payload, accountId)) {
        throw new Error("This conversation is not available to the signed-in account.");
      }
      return conversationDto(payload);
    },

    async sendMessage(input) {
      const conversationId = required(input.conversationId, "Conversation");
      const body = required(input.body, "Message body", 10_000);
      const requestId = required(input.requestId, "Request id");
      const requestedVersion = required(input.qualificationVersion, "Qualification version");
      const conversation = conversationFrom(
        await store.getRecord({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations,
          recordId: conversationId,
          workspaceId: scopedWorkspaceId,
        }),
      );
      if (!conversation || !hasParticipant(conversation, accountId)) {
        throw new Error("This conversation is not available to the signed-in account.");
      }
      const binding = await currentBindingForConversation(conversation);
      if (!binding) {
        throw new Error("Message eligibility has been revoked.");
      }
      if (
        binding.qualificationVersion !== requestedVersion ||
        conversation.qualificationVersion !== requestedVersion
      ) {
        throw new Error("Message eligibility is stale; refresh before retrying.");
      }
      const messageId = messageRecordId(conversationId, accountId, requestId);
      const existing = messageFrom(
        (await store.getRecord({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.messages,
          recordId: messageId,
          workspaceId: scopedWorkspaceId,
        })) ?? ({ payload: {} } as LiveRecord<Record<string, unknown>>),
      );
      if (existing) {
        if (
          existing.body !== body ||
          existing.senderAccountId !== accountId ||
          existing.qualificationVersion !== requestedVersion
        ) {
          throw new Error("This request id was already used for a different message.");
        }
        return {
          conversationId,
          deliveryState: "delivered",
          message: messageDto(existing),
          qualificationVersion: requestedVersion,
        };
      }
      const sentAt = now();
      const message: MessagePayload = {
        body,
        conversationId,
        deliveryState: "delivered",
        kind: "relationship_message",
        messageId,
        qualificationVersion: requestedVersion,
        requestId,
        senderAccountId: accountId,
        senderDisplayName: displayName,
        sentAt,
      };
      await store.upsertRecord(
        record({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.messages,
          payload: message,
          recordId: messageId,
          targetId: conversationId,
          timestamp: sentAt,
          workspaceId: scopedWorkspaceId,
        }),
      );
      const persisted = messageFrom(
        await store.getRecord({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.messages,
          recordId: messageId,
          workspaceId: scopedWorkspaceId,
        }),
      );
      if (
        !persisted ||
        persisted.conversationId !== conversationId ||
        persisted.senderAccountId !== accountId
      ) {
        throw new Error("The message could not be confirmed as delivered.");
      }
      await store.upsertRecord(
        record({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.conversations,
          payload: { ...conversation, updatedAt: sentAt },
          recordId: conversationId,
          targetId: conversationId,
          timestamp: sentAt,
          workspaceId: scopedWorkspaceId,
        }),
      );
      return {
        conversationId,
        deliveryState: "delivered",
        message: messageDto(persisted),
        qualificationVersion: requestedVersion,
      };
    },

    async markConversationRead(input) {
      const conversation = await this.getConversation(input.conversationId);
      const lastReadMessageId = required(input.lastReadMessageId, "Last read message");
      if (!conversation.messages.some((item) => item.messageId === lastReadMessageId)) {
        throw new Error("The last read message is not available in this conversation.");
      }
      const readAt = now();
      const payload: ReadPayload = {
        accountId,
        conversationId: conversation.conversationId,
        kind: "relationship_read",
        lastReadMessageId,
        readAt,
      };
      await store.upsertRecord(
        record({
          collectionName: RELATIONSHIP_COMMUNICATION_COLLECTIONS.reads,
          payload,
          recordId: readRecordId(conversation.conversationId, accountId),
          targetId: conversation.conversationId,
          timestamp: readAt,
          userId: accountId,
          workspaceId: scopedWorkspaceId,
        }),
      );
      return {
        conversationId: conversation.conversationId,
        lastReadMessageId,
        readAt,
      };
    },
  };
}
