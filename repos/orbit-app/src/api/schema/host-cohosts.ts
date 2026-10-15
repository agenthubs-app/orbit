import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type {
  HostCheckInEventsResponse,
  HostCohostAcceptResult,
  HostCohostInviteInput,
  HostCohostInvitePreview,
  HostCohostInviteResult,
  HostCohostRemoveInput,
  HostCohostRoleInput,
  HostCohostsResponse,
} from "../contract/host-cohosts";

// R17 共同運営者. An unknown role reads as `read_only_analyst` (least privileged); history items with an unknown action are skipped.
const COHOST_ROLES = ["manager", "check_in", "read_only_analyst"] as const;
const MEMBER_ROLES = ["owner", ...COHOST_ROLES] as const;

export const hostCohostMemberObject = z.object({
  actorId: z.string().min(1),
  name: z.string(),
  initial: z.string().max(4),
  org: z.string().nullable(),
  role: tolerantEnum(MEMBER_ROLES, "read_only_analyst"),
  isMe: z.boolean(),
  revision: z.number().int().min(0),
});
export const hostCohostInviteObject = z.object({
  inviteId: z.string().min(1),
  role: tolerantEnum(COHOST_ROLES, "read_only_analyst"),
  inviteeLabel: z.string().nullable(),
  expiresAt: z.string(),
});
export const hostCohostHistoryItemObject = z.object({
  at: z.string(),
  subjectName: z.string(),
  action: z.enum(["granted", "changed", "revoked", "invited"]),
  role: tolerantEnum(MEMBER_ROLES, "read_only_analyst").nullable(),
  reason: z.string(),
  byName: z.string(),
});
export const hostCohostsResponseObject = z.object({
  eventId: z.string().min(1),
  eventTitle: z.string(),
  members: readableItems(hostCohostMemberObject),
  invites: readableItems(hostCohostInviteObject),
  history: readableItems(hostCohostHistoryItemObject),
  canManage: z.boolean(),
  sample: z.literal(true).optional(),
});
export const hostCohostsResponseSchema = hostCohostsResponseObject as unknown as z.ZodType<HostCohostsResponse>;

export const hostCohostInviteInputObject = z.object({
  role: z.enum(COHOST_ROLES),
  target: z.string().trim().max(254).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();
export const hostCohostInviteInputSchema = hostCohostInviteInputObject as z.ZodType<HostCohostInviteInput>;

export const hostCohostInviteResultObject = z.object({ inviteId: z.string().min(1), link: z.string(), shortCode: z.string(), expiresAt: z.string() });
export const hostCohostInviteResultSchema = hostCohostInviteResultObject as z.ZodType<HostCohostInviteResult>;

const reason = z.string().trim().min(1).max(100);
export const hostCohostRoleInputObject = z.object({ role: z.enum(COHOST_ROLES), reason, expectedRevision: z.number().int().min(0) }).strict();
export const hostCohostRoleInputSchema = hostCohostRoleInputObject as z.ZodType<HostCohostRoleInput>;
export const hostCohostRemoveInputObject = z.object({ reason, expectedRevision: z.number().int().min(0) }).strict();
export const hostCohostRemoveInputSchema = hostCohostRemoveInputObject as z.ZodType<HostCohostRemoveInput>;

export const hostCohostInvitePreviewObject = z.object({
  valid: z.boolean(),
  eventId: z.string().nullable(),
  eventTitle: z.string().nullable(),
  organizerName: z.string().nullable(),
  inviterName: z.string().nullable(),
  role: tolerantEnum(COHOST_ROLES, "read_only_analyst").nullable(),
  expiresAt: z.string().nullable(),
  sample: z.literal(true).optional(),
});
export const hostCohostInvitePreviewSchema = hostCohostInvitePreviewObject as unknown as z.ZodType<HostCohostInvitePreview>;

export const hostCohostAcceptResultObject = z.object({ eventId: z.string().min(1), role: tolerantEnum(COHOST_ROLES, "read_only_analyst"), href: z.string() });
export const hostCohostAcceptResultSchema = hostCohostAcceptResultObject as unknown as z.ZodType<HostCohostAcceptResult>;

export const hostCheckInEventsResponseObject = z.object({
  events: readableItems(z.object({ eventId: z.string().min(1), title: z.string(), emoji: z.string().nullable(), startsAt: z.string().nullable(), venue: z.string().nullable() })),
  sample: z.literal(true).optional(),
});
export const hostCheckInEventsResponseSchema = hostCheckInEventsResponseObject as unknown as z.ZodType<HostCheckInEventsResponse>;
