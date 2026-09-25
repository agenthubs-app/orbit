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
