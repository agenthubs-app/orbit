import { z } from "zod";
import { tolerantEnum } from "./tolerant";
import type { InviteCodeContract, InviteCodeCreateInput, InviteCodePreview, InviteCodeRedeemResult } from "../contract/invite-codes";

// R08 contract 4 (owner 甲 / R15). Responses tolerant, request bodies strict (see home-layout.ts).
const code = z.string().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
const sharedFields = { displayName: z.string().min(1).max(80), organization: z.string().max(120).optional(), role: z.string().max(80).optional() };
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

export const inviteCodePreviewObject = z.object({ code, expiresAt: z.string().datetime({ offset: true }), shared, sample: z.literal(true).optional() });
export const inviteCodePreviewSchema = inviteCodePreviewObject as z.ZodType<InviteCodePreview>;

// An unknown outcome reads as "connected" (the person is in your contacts either way).
export const inviteCodeRedeemResultObject = z.object({ outcome: tolerantEnum(["connected", "merged", "already_connected"], "connected"), contactId: z.string().min(1) });
export const inviteCodeRedeemResultSchema = inviteCodeRedeemResultObject as z.ZodType<InviteCodeRedeemResult>;

export const inviteCodeCreateInputObject = z.object({ shared: z.object(sharedFields).strict(), maxUses: z.number().int().min(1).max(10), idempotencyKey: z.string().min(1).max(200) }).strict();
export const inviteCodeCreateInputSchema = inviteCodeCreateInputObject as z.ZodType<InviteCodeCreateInput>;
