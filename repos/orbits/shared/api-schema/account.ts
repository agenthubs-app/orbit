import { z } from "zod";
import { knownValues, tolerantEnum } from "./tolerant";
import type { AccountDeletionRequestContract, AccountExportContract, AccountExportCreateInput, AppVersionContract } from "../contract/account";

// R08 contract 11 (owner 乙 / R18). Responses tolerant, request bodies strict (see home-layout.ts).
const instant = z.string().datetime({ offset: true });
const scope = z.enum(["contacts", "notes", "tasks", "events", "plans"]);
export const accountExportObject = z.object({
  id: z.string().min(1),
  // Read tolerantly: unknown scopes are skipped, an unknown status reads as "running".
  scope: knownValues(["contacts", "notes", "tasks", "events", "plans"]),
  status: tolerantEnum(["queued", "running", "ready", "failed", "expired"], "running"),
  requestedAt: instant,
  downloadUrl: z.string().url().optional(),
  expiresAt: instant.optional(),
});
export const accountExportSchema = accountExportObject as z.ZodType<AccountExportContract>;

export const accountExportCreateInputObject = z.object({ scope: z.array(scope).min(1).max(5), idempotencyKey: z.string().min(1).max(200) }).strict();
export const accountExportCreateInputSchema = accountExportCreateInputObject as z.ZodType<AccountExportCreateInput>;

export const accountDeletionRequestObject = z.object({ requestedAt: instant, purgeAfter: instant, cancelledAt: instant.optional() });
export const accountDeletionRequestSchema = accountDeletionRequestObject
  .refine((value) => Date.parse(value.purgeAfter) - Date.parse(value.requestedAt) === 30 * 86_400_000, { message: "purgeAfter is 30 days after the request" }) as unknown as z.ZodType<AccountDeletionRequestContract>;

const semver = z.string().regex(/^\d+\.\d+\.\d+$/);
export const appVersionObject = z.object({ minSupportedAppVersion: semver, latestAppVersion: semver });
export const appVersionSchema = appVersionObject as z.ZodType<AppVersionContract>;
