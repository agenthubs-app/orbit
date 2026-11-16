export type RelationshipEligibilityStatus =
  | "unregistered"
  | "pending"
  | "conflict"
  | "confirmed"
  | "revoked"
  | "expired"
  | "forbidden";

export interface RelationshipRemoteAccountDTO {
  accountId: string;
  displayName: string;
}

export interface RelationshipEligibilityDTO {
  contactId: string;
  status: RelationshipEligibilityStatus;
  canInvite: boolean;
  canSend: boolean;
  /** QA-C4: connected by invite code and no conversation yet — "Message" opens one (POST /conversations/start). */
  canStart?: boolean;
  /**
   * R39 (contact-reach D1): a meeting proposal can be sent to this contact — an
   * accepted bilateral event exchange or a live invite-code connection. A person
   * reached only through an email invitation can be messaged but never receives
   * a proposal (false). Absent in responses from before R39 (read as false).
   */
  canProposeMeeting?: boolean;
  /**
   * R39 (D2b): the ongoing meeting with this person (not cancelled/completed),
   * shown instead of new candidate times; null when there is none. Only set
   * when `canProposeMeeting` is true.
   */
  activeAppointmentId?: string | null;
  qualificationVersion?: string;
  expiresAt?: string;
  conversationId?: string;
  remoteAccount?: RelationshipRemoteAccountDTO;
}

export interface RelationshipInvitationDTO extends RelationshipEligibilityDTO {
  invitationId: string;
  invitationUrl: string;
  token: string;
  recipientEmail: string;
  recipientName: string;
  externalSendRequested: false;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipInvitationPreviewDTO {
  invitationId: string;
  inviterDisplayName: string;
  recipientName: string;
  expiresAt: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  canAccept: boolean;
}

export interface RelationshipMessageDTO {
  messageId: string;
  conversationId: string;
  senderAccountId: string;
  senderDisplayName: string;
  body: string;
  sentAt: string;
  deliveryState: "delivered";
  /**
   * R39 (D2/D3): the appointment created together with this message (a message
   * sent with a meeting proposal); null otherwise. Absent in responses and
   * stored rows from before R39 (read as null).
   */
  appointmentId?: string | null;
}

export interface RelationshipConversationDTO {
  conversationId: string;
  contactId: string;
  participantAccountIds: readonly [string, string];
  participantDisplayNames: Readonly<Record<string, string>>;
  qualificationVersion: string;
  status: "active" | "revoked";
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  lastReadMessageId?: string;
  messages: readonly RelationshipMessageDTO[];
}

export interface RelationshipConversationListDTO {
  nextCursor?: string | null;
  unreadTotal?: number;
  conversations: readonly RelationshipConversationDTO[];
  refreshedAt: string;
}

/** Lightweight badge response; never contains conversation or message content. */
export interface RelationshipUnreadSummaryDTO {
  actorId: string;
  unreadTotal: number;
  refreshedAt: string;
}

/** A list preview never contains a messages array. Names/body are bounded previews. */
export interface RelationshipConversationSummaryDTO extends Omit<RelationshipConversationDTO, "messages" | "lastReadMessageId"> {
  lastMessage: (Pick<RelationshipMessageDTO, "messageId" | "senderAccountId" | "sentAt"> & { bodyPreview: string }) | null;
}
export interface RelationshipConversationSummaryPageDTO {
  actorId: string;
  items: RelationshipConversationSummaryDTO[];
  nextCursor: string | null;
  hasMore: boolean;
  asOf: string;
}
export interface RelationshipMessagePageDTO {
  actorId: string;
  conversation: Omit<RelationshipConversationDTO, "messages" | "unreadCount" | "lastReadMessageId">;
  items: RelationshipMessageDTO[];
  nextCursor: string | null;
  newestCursor: string | null;
  hasMore: boolean;
  direction: "older" | "newer";
  asOf: string;
}

/**
 * R39 (D2): POST /api/relationship-communication/conversations/{id}/messages.
 * `Idempotency-Key` header (preferred) or `requestId`; `proposal` (optional) is
 * the initial-proposal structure and creates the appointment atomically with
 * the message.
 */
export interface RelationshipMessageSendRequestDTO {
  body: string;
  qualificationVersion: string;
  requestId?: string;
  retireDraftThrough?: string | null;
  proposal?: {
    candidateTimes: readonly { startsAtUtc: string }[];
    durationMinutes: number;
    medium:
      | { kind: "in_person"; location: string }
      | { kind: "video"; provider: "google_meet" | "other"; joinUrl: string | null }
      | { kind: "phone"; phoneHint: string | null };
    note: string;
    timezone: string;
  };
}

export interface RelationshipDeliveryReceiptDTO {
  conversationId: string;
  message: RelationshipMessageDTO;
  deliveryState: "delivered";
  qualificationVersion: string;
}

export interface RelationshipReadReceiptDTO {
  conversationId: string;
  lastReadMessageId: string;
  readAt: string;
}

/**
 * A participant's private, unsent reply draft for one relationship conversation.
 * Each account only ever reads its own draft; `updatedAt` is null when none is saved.
 */
export interface RelationshipReplyDraftDTO {
  body: string;
  conversationId: string;
  updatedAt: string | null;
}
