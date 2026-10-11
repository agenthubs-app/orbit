import { z } from "zod";
import { knownValues, readableItems, tolerantEnum } from "./tolerant";
import type {
  InviteCodeContract, InviteCodeCreateInput, InviteCodeHistoryItem, InviteCodeHistoryResponse, InviteCodePreview, InviteCodeRedeemInput, InviteCodeRedeemResult,
  InviteConnectionView, InviteSharedFieldKey, InviteShareUpdateInput, InviteUnlinkInput, InviteUnlinkResult,
} from "../contract/invite-codes";

// R08 contract 4 (owner 甲 / R15). Responses tolerant, request bodies strict (see home-layout.ts).
const code = z.string().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
const sharedFields = {
  displayName: z.string().min(1).max(80), organization: z.string().max(120).optional(), role: z.string().max(80).optional(),
  // R15：服务端按键从资料读出的值（预览永远不含 email / phone）。
  offering: z.array(z.string().max(200)).max(20).optional(), seeking: z.array(z.string().max(200)).max(20).optional(),
  email: z.string().max(254).optional(), phone: z.string().max(40).optional(),
};
const shared = z.object(sharedFields);

export const inviteCodeObject = z.object({
  code,
  link: z.string().url(),
  maxUses: z.number().int().min(1).max(10),
  usedCount: z.number().int().min(0),
  expiresAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).optional(),
  shared,
  sample: z.literal(true).optional(),
});
export const inviteCodeSchema = inviteCodeObject.refine((value) => value.usedCount <= value.maxUses, { message: "usedCount within maxUses" }) as unknown as z.ZodType<InviteCodeContract>;

export const inviteCodePreviewObject = z.object({
  code, expiresAt: z.string().datetime({ offset: true }), shared, sample: z.literal(true).optional(),
  // R15：未知状态按 expired 读（保守：不让人以为码还能用）。
  status: tolerantEnum(["active", "expired", "full"], "expired").optional(),
  inviterAlreadyConnected: z.boolean().optional(),
  isOwnCode: z.boolean().optional(),
});
export const inviteCodePreviewSchema = inviteCodePreviewObject as z.ZodType<InviteCodePreview>;

// An unknown outcome reads as "connected" (the person is in your contacts either way).
export const inviteCodeRedeemResultObject = z.object({ outcome: tolerantEnum(["connected", "merged", "already_connected"], "connected"), contactId: z.string().min(1), peer: shared.optional() });
export const inviteCodeRedeemResultSchema = inviteCodeRedeemResultObject as z.ZodType<InviteCodeRedeemResult>;

// R15：请求里的共享项目——每项在枚举里、不重复、最多 5 个（名字总是共享，不在里面）。
export const INVITE_SHARED_FIELD_KEY_VALUES = ["organization", "offering", "seeking", "email", "phone"] as const satisfies readonly InviteSharedFieldKey[];
const sharedKeysInput = z.array(z.enum(INVITE_SHARED_FIELD_KEY_VALUES)).max(5).refine((keys) => new Set(keys).size === keys.length, { message: "sharedKeys must not repeat" });
const idempotencyKey = z.string().min(1).max(200);

export const inviteCodeCreateInputObject = z.object({ shared: z.object(sharedFields).strict(), maxUses: z.number().int().min(1).max(10), idempotencyKey, sharedKeys: sharedKeysInput.optional() }).strict();
export const inviteCodeCreateInputSchema = inviteCodeCreateInputObject as z.ZodType<InviteCodeCreateInput>;

// ── R15（DESIGN §4.2）
export const inviteCodeRedeemInputObject = z.object({ idempotencyKey, sharedKeys: sharedKeysInput }).strict();
export const inviteCodeRedeemInputSchema = inviteCodeRedeemInputObject as z.ZodType<InviteCodeRedeemInput>;

const datetime = z.string().datetime({ offset: true });
const historyJoined = z.object({ contactId: z.string().min(1), displayName: z.string().min(1), joinedAt: datetime });
// 未知状态按 expired 读；一个加入的人读不出不影响其余。
export const inviteCodeHistoryItemObject = z.object({
  code,
  createdAt: datetime,
  expiresAt: datetime,
  status: tolerantEnum(["active", "expired", "revoked", "superseded", "full"], "expired"),
  usedCount: z.number().int().min(0),
  maxUses: z.number().int().min(1).max(10),
  joined: readableItems(historyJoined),
  sample: z.literal(true).optional(),
});
export const inviteCodeHistoryItemSchema = inviteCodeHistoryItemObject as unknown as z.ZodType<InviteCodeHistoryItem>;
export const inviteCodeHistoryResponseObject = z.object({ items: readableItems(inviteCodeHistoryItemObject) });
export const inviteCodeHistoryResponseSchema = inviteCodeHistoryResponseObject as unknown as z.ZodType<InviteCodeHistoryResponse>;

// 未知的项目键跳过（服务端以后加项目时旧客户端照常读）。
export const inviteConnectionViewObject = z.object({
  contactId: z.string().min(1),
  connectedAt: datetime,
  via: z.object({ code }),
  sharedByMe: knownValues(INVITE_SHARED_FIELD_KEY_VALUES),
  sharedByPeer: knownValues(INVITE_SHARED_FIELD_KEY_VALUES),
  pausedFields: knownValues(INVITE_SHARED_FIELD_KEY_VALUES),
  sample: z.literal(true).optional(),
});
export const inviteConnectionViewSchema = inviteConnectionViewObject as unknown as z.ZodType<InviteConnectionView>;

export const inviteShareUpdateInputObject = z.object({ sharedKeys: sharedKeysInput, idempotencyKey }).strict();
export const inviteShareUpdateInputSchema = inviteShareUpdateInputObject as z.ZodType<InviteShareUpdateInput>;
export const inviteUnlinkInputObject = z.object({ keepAsContact: z.boolean(), idempotencyKey }).strict();
export const inviteUnlinkInputSchema = inviteUnlinkInputObject as z.ZodType<InviteUnlinkInput>;
export const inviteUnlinkResultObject = z.object({ outcome: tolerantEnum(["unlinked"], "unlinked"), keptContactId: z.string().min(1).optional() });
export const inviteUnlinkResultSchema = inviteUnlinkResultObject as z.ZodType<InviteUnlinkResult>;
