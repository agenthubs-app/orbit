// R18a owner: C line; consumers: Web account and App me (sync:contract).
import { z } from "zod";
import type { ProfileCardCompletenessContract, ProfilePublicFieldsContract } from "../contract/profile";
import { knownValues, tolerantEnum } from "./tolerant";

export const profilePublicFieldsObject = z.object({
  companyRole: z.boolean(), offeringSeeking: z.boolean(), intro: z.boolean(),
});
export const profilePublicFieldsSchema = profilePublicFieldsObject as z.ZodType<ProfilePublicFieldsContract>;
// The existing PUT body remains permissive; only its new nested field is strict.
export const profilePublicFieldsWriteSchema = profilePublicFieldsObject.strict();

export const profileCardCompletenessObject = z.object({
  score: z.number().int().min(0).max(100),
  items: z.array(z.object({ key: z.string(), weight: z.number().finite().min(0), done: z.boolean() })),
});
export const profileCardCompletenessSchema = profileCardCompletenessObject as z.ZodType<ProfileCardCompletenessContract>;

const fields = ["displayName", "headline", "relationshipGoal", "homeMarket", "targetRelationshipTypes", "preferredIntroChannels"] as const;
const industry = { primaryIndustryId: z.string().nullable().optional(), secondaryIndustryId: z.string().nullable().optional() };
export const accountProfileObject = z.object({
  id: z.string().min(1), displayName: z.string(), headline: z.string(), organization: z.string(), role: z.string(),
  homeMarket: z.string(), relationshipGoal: z.string(), targetRelationshipTypes: z.array(z.string()),
  preferredFollowUpWindow: z.string(), preferredLanguage: tolerantEnum(["ja", "zh", "en"], "ja"), preferredIntroChannels: z.array(z.string()),
  ...industry,
  birthDate: z.string().nullable().optional(),
  publicFields: profilePublicFieldsObject.optional(),
  handles: z.object({ email: z.string().optional(), phone: z.string().optional(), wechatId: z.string().optional(), lineId: z.string().optional(), website: z.string().optional(), linkedinUrl: z.string().optional(), xHandle: z.string().optional() }).optional(),
  industry: z.string().optional(), seniorityLevel: z.string().optional(), bio: z.string().optional(),
  offering: z.array(z.string()).optional(), seeking: z.array(z.string()).optional(), topics: z.array(z.string()).optional(),
  spokenLanguages: z.array(z.string()).optional(), updatedAt: z.string(),
});
export const profileAccountObject = z.object({
  state: tolerantEnum(["success", "empty", "pending"], "pending"),
  profile: accountProfileObject.nullable(),
  completeness: z.object({
    score: z.number().int().min(0).max(100), status: tolerantEnum(["not-started", "action-needed", "ready"], "action-needed"),
    completedFields: knownValues(fields), missingFields: knownValues(fields),
    nextBestField: z.string().nullable(), card: profileCardCompletenessObject.optional(),
  }),
  editor: z.object({ canSave: z.boolean(), lastSavedAt: z.string().nullable(), dirtyFields: knownValues(fields), validationMessages: z.array(z.string()) }),
  mutationId: z.string().optional(), nextAction: z.string(), sample: z.literal(true).optional(),
});
export const profileAccountSchema = profileAccountObject;
