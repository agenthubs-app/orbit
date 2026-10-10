import { z } from "zod";
import type { AccountDeletionRequestContract, AccountExportContract, AppVersionContract } from "../contract/account";

// R08 contract 11 (owner 乙 / R18).
const instant = z.string().datetime({ offset: true });
export const accountExportSchema = z.object({
  id: z.string().min(1),
  scope: z.array(z.enum(["contacts", "notes", "tasks", "events", "plans"])).min(1),
  status: z.enum(["queued", "running", "ready", "failed", "expired"]),
  requestedAt: instant,
  downloadUrl: z.string().url().optional(),
  expiresAt: instant.optional(),
}).strict() as z.ZodType<AccountExportContract>;

export const accountDeletionRequestSchema = z.object({ requestedAt: instant, purgeAfter: instant, cancelledAt: instant.optional() }).strict()
  .refine((value) => Date.parse(value.purgeAfter) - Date.parse(value.requestedAt) === 30 * 86_400_000, { message: "purgeAfter is 30 days after the request" }) as unknown as z.ZodType<AccountDeletionRequestContract>;

const semver = z.string().regex(/^\d+\.\d+\.\d+$/);
export const appVersionSchema = z.object({ minSupportedAppVersion: semver, latestAppVersion: semver }).strict() as z.ZodType<AppVersionContract>;
