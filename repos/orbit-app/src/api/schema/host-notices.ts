import { z } from "zod";
import { knownValues, tolerantEnum } from "./tolerant";
import type { HostNoticePreview, HostNoticePreviewInput, HostNoticeSendInput, HostNoticeSendResult } from "../contract/host-notices";

// R17 定型通知. Only the three host-sendable kinds are accepted in requests.
const SENDABLE = ["event_cancelled", "event_changed", "profile_incomplete"] as const;

export const hostNoticePreviewInputObject = z.object({ kind: z.enum(SENDABLE) }).strict();
export const hostNoticePreviewInputSchema = hostNoticePreviewInputObject as z.ZodType<HostNoticePreviewInput>;

export const hostNoticePreviewObject = z.object({
  kind: tolerantEnum(SENDABLE, "profile_incomplete"),
  recipients: z.number().int().min(0),
  channels: knownValues(["inbox", "email"]),
  title: z.string(),
  body: z.string(),
  hostNote: z.string().nullable(),
  remainingSends: z.number().int().min(0),
  sample: z.literal(true).optional(),
});
export const hostNoticePreviewSchema = hostNoticePreviewObject as unknown as z.ZodType<HostNoticePreview>;

export const hostNoticeSendInputObject = z.object({ kind: z.enum(SENDABLE), idempotencyKey: z.string().trim().min(8).max(200) }).strict();
export const hostNoticeSendInputSchema = hostNoticeSendInputObject as z.ZodType<HostNoticeSendInput>;

export const hostNoticeSendResultObject = z.object({ kind: tolerantEnum(SENDABLE, "profile_incomplete"), queued: z.number().int().min(0), skipped: z.number().int().min(0) });
export const hostNoticeSendResultSchema = hostNoticeSendResultObject as unknown as z.ZodType<HostNoticeSendResult>;
