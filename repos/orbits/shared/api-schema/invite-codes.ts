import { z } from "zod";
import type { InviteCodeContract, InviteCodePreview, InviteCodeRedeemResult } from "../contract/invite-codes";

// R08 contract 4 (owner 甲 / R15).
const code = z.string().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
const shared = z.object({ displayName: z.string().min(1).max(80), organization: z.string().max(120).optional(), role: z.string().max(80).optional() }).strict();

export const inviteCodeSchema = z.object({
  code,
  link: z.string().url(),
  maxUses: z.number().int().min(1).max(10),
  usedCount: z.number().int().min(0),
  expiresAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  revokedAt: z.string().datetime({ offset: true }).optional(),
  shared,
}).strict().refine((value) => value.usedCount <= value.maxUses, { message: "usedCount within maxUses" }) as unknown as z.ZodType<InviteCodeContract>;

export const inviteCodePreviewSchema = z.object({ code, expiresAt: z.string().datetime({ offset: true }), shared }).strict() as z.ZodType<InviteCodePreview>;

export const inviteCodeRedeemResultSchema = z.object({ outcome: z.enum(["connected", "merged", "already_connected"]), contactId: z.string().min(1) }).strict() as z.ZodType<InviteCodeRedeemResult>;
