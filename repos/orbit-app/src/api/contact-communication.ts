import type {
  RelationshipDeliveryReceiptDTO,
  RelationshipInvitationPreviewDTO,
} from "./contract/relationship-communication";
import {
  relationshipCommunicationInvitationsPath,
  relationshipCommunicationMessagesPath,
} from "./endpoints";

export interface RelationshipInvitationRequestInput {
  contactId: string;
  recipientEmail: string;
  recipientName: string;
}

export interface RelationshipMessageDeliveryRequestInput {
  body: string;
  conversationId: string;
  qualificationVersion: string;
  requestId: string;
}

export type RelationshipInvitationRequestResult =
  | {
      success: true;
      request: {
        endpoint: string;
        body: RelationshipInvitationRequestInput;
      };
    }
  | { success: false; error: string };

export type RelationshipMessageDeliveryRequestResult =
  | {
      success: true;
      request: {
        endpoint: string;
        body: Pick<RelationshipMessageDeliveryRequestInput, "body" | "qualificationVersion">;
        headers: { "Idempotency-Key": string };
      };
    }
  | { success: false; error: string };

function cleaned(value: string): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isRelationshipInvitationPreview(value: unknown): value is RelationshipInvitationPreviewDTO {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preview = value as Partial<RelationshipInvitationPreviewDTO>;
  return typeof preview.invitationId === "string" && Boolean(preview.invitationId.trim()) &&
    typeof preview.inviterDisplayName === "string" && typeof preview.recipientName === "string" &&
    typeof preview.expiresAt === "string" && typeof preview.canAccept === "boolean" &&
    ["pending", "accepted", "expired", "revoked"].includes(preview.status ?? "");
}

export function buildRelationshipInvitationRequest(
  input: RelationshipInvitationRequestInput,
): RelationshipInvitationRequestResult {
  const contactId = cleaned(input.contactId);
  const recipientEmail = cleaned(input.recipientEmail).toLowerCase();
  const recipientName = cleaned(input.recipientName);
  if (!contactId) return { success: false, error: "缺少联系人，无法创建邀请链接。" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { success: false, error: "请填写有效的接收邮箱。" };
  }
  if (!recipientName) return { success: false, error: "缺少邀请对象姓名。" };
  return {
    success: true,
    request: {
      body: { contactId, recipientEmail, recipientName },
      endpoint: relationshipCommunicationInvitationsPath(),
    },
  };
}

export function buildRelationshipMessageDeliveryRequest(
  input: RelationshipMessageDeliveryRequestInput,
): RelationshipMessageDeliveryRequestResult {
  const body = cleaned(input.body);
  const conversationId = cleaned(input.conversationId);
  const qualificationVersion = cleaned(input.qualificationVersion);
  const requestId = cleaned(input.requestId);
  if (!conversationId || !qualificationVersion) {
    return { success: false, error: "聊天资格已失效，请刷新后重试。" };
  }
  if (!body) return { success: false, error: "请先输入消息。" };
  if (!requestId) return { success: false, error: "发送请求缺少幂等标识。" };
  return {
    success: true,
    request: {
      body: { body, qualificationVersion },
      endpoint: relationshipCommunicationMessagesPath(conversationId),
      headers: { "Idempotency-Key": requestId },
    },
  };
}

export function relationshipDeliveryReceiptMatches(
  value: unknown,
  expected: Pick<RelationshipMessageDeliveryRequestInput, "body" | "conversationId" | "qualificationVersion"> & {
    senderAccountId: string;
  },
): value is RelationshipDeliveryReceiptDTO {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Partial<RelationshipDeliveryReceiptDTO>;
  const message = receipt.message;
  return (
    receipt.deliveryState === "delivered" &&
    receipt.conversationId === expected.conversationId.trim() &&
    receipt.qualificationVersion === expected.qualificationVersion.trim() &&
    Boolean(message) &&
    message?.deliveryState === "delivered" &&
    message.conversationId === expected.conversationId.trim() &&
    message.body === expected.body.trim() &&
    Boolean(message.messageId) &&
    message.senderAccountId === expected.senderAccountId.trim()
  );
}
