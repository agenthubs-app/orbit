import { z } from "zod";
import { knownValues, tolerantEnum } from "./tolerant";
import type { AccountDeletionCreateInput, AccountDeletionRequestContract, AccountExportContract, AccountExportCreateInput, AppVersionContract } from "../contract/account";

// R08 contract 11 (owner 乙 / R18). Responses tolerant, request bodies strict (see home-layout.ts).
const instant = z.string().datetime({ offset: true });
const scope = z.enum(["contacts", "notes", "tasks", "events", "plans"]);
export const accountExportObject = z.object({
  id: z.string().min(1),
  // Read tolerantly: unknown scopes are skipped, an unknown status reads as "running".
  scope: knownValues(["contacts", "notes", "tasks", "events", "plans"]),
  status: tolerantEnum(["queued", "running", "ready", "failed", "expired"], "running"),
  requestedAt: instant,
  mode: tolerantEnum(["selected", "all-json"], "selected").optional(),
  contactsFormat: tolerantEnum(["csv", "vcard"], "csv").optional(),
  completedItems: z.number().int().nonnegative().optional(),
  totalItems: z.number().int().positive().optional(),
  readyAt: instant.optional(),
  fileName: z.string().min(1).optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  downloadUrl: z.string().url().optional(),
  expiresAt: instant.optional(),
});
export const accountExportSchema = accountExportObject as z.ZodType<AccountExportContract>;

export const accountExportCreateInputObject = z.object({
  scope: z.array(scope).min(1).max(5),
  idempotencyKey: z.string().min(1).max(200),
  mode: z.enum(["selected", "all-json"]).optional(),
  contactsFormat: z.enum(["csv", "vcard"]).optional(),
}).strict().superRefine((value, context) => {
  if (new Set(value.scope).size !== value.scope.length) context.addIssue({ code: "custom", message: "scope contains duplicates" });
  if (value.mode === "all-json" && (value.scope.length !== 5 || value.contactsFormat !== undefined)) context.addIssue({ code: "custom", message: "all-json requires all five scopes without a contact format" });
  if (value.contactsFormat && !value.scope.includes("contacts")) context.addIssue({ code: "custom", message: "contactsFormat requires contacts" });
});
export const accountExportCreateInputSchema = accountExportCreateInputObject as z.ZodType<AccountExportCreateInput>;

export const accountDeletionCreateInputSchema = z.object({ reauthReceipt: z.string().min(1).max(512), confirmed: z.literal(true) }).strict() as z.ZodType<AccountDeletionCreateInput>;

export const accountDeletionRequestObject = z.object({ requestedAt: instant, purgeAfter: instant, cancelledAt: instant.optional(), status: tolerantEnum(["pending", "purging", "deleted", "cancelled"], "pending").optional() });
export const accountDeletionRequestSchema = accountDeletionRequestObject
  .refine((value) => Date.parse(value.purgeAfter) - Date.parse(value.requestedAt) === 30 * 86_400_000, { message: "purgeAfter is 30 days after the request" }) as unknown as z.ZodType<AccountDeletionRequestContract>;

const semver = z.string().regex(/^\d+\.\d+\.\d+$/);
export const appVersionObject = z.object({
  minSupportedAppVersion: semver,
  latestAppVersion: semver,
  enforceMinimum: z.boolean().optional(),
  maintenance: z.object({ active: z.boolean(), until: instant.optional() }).optional(),
  webBuildId: z.string().min(1).optional(),
});
export const appVersionSchema = appVersionObject as z.ZodType<AppVersionContract>;
