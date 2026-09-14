import { z } from "zod";
import { homeDateView, homeFollowupsToView, homeScheduleToView, homeTasksToView } from "../view-models/home-dashboard";
import type { ScheduleItemContract } from "./contract/tasks";
import type { ManualProfileContract } from "./contract/profile";
import { validateIndustrySelection } from "./domain/industries";

// This page validates its existing HTTP responses locally. These schemas are
// not shared generated contracts and do not add server capabilities.
const fields = z.enum(["displayName", "headline", "relationshipGoal", "homeMarket", "targetRelationshipTypes", "preferredIntroChannels"]);
const timestamp = z.iso.datetime({ offset: true });
export const profileDetailSchema = z.object({
  state: z.enum(["success", "empty", "pending"]),
  profile: z.object({
    id: z.string().trim().min(1), displayName: z.string(), headline: z.string(), organization: z.string(), role: z.string(),
    homeMarket: z.string(), relationshipGoal: z.string(), targetRelationshipTypes: z.array(z.string()),
    preferredFollowUpWindow: z.string(), preferredLanguage: z.enum(["zh", "en", "ja"]), preferredIntroChannels: z.array(z.string()),
    primaryIndustryId: z.string().nullable().optional(), secondaryIndustryId: z.string().nullable().optional(),
    industry: z.string().optional(), bio: z.string().optional(), offering: z.array(z.string()).optional(), seeking: z.array(z.string()).optional(), topics: z.array(z.string()).optional(), updatedAt: timestamp
  }).passthrough().refine(profile => validateIndustrySelection(profile).valid).nullable(),
  completeness: z.object({ score: z.number().int().min(0).max(100), status: z.enum(["not-started", "action-needed", "ready"]), completedFields: z.array(fields), missingFields: z.array(fields), nextBestField: fields.nullable() }),
  editor: z.object({ canSave: z.boolean(), lastSavedAt: timestamp.nullable(), dirtyFields: z.array(fields), validationMessages: z.array(z.string()) }),
  nextAction: z.string()
}).passthrough().refine(data => (data.state === "empty") === (data.profile === null));
export type ProfileDetail = z.infer<typeof profileDetailSchema>;

export type ProfileSaveRequest = Partial<Omit<ManualProfileContract, "id" | "updatedAt">> & { displayName: string };
export function profileSaveReceiptSchema(profileId: string | null, request: ProfileSaveRequest) {
  return profileDetailSchema.refine(data => data.state === "success" && data.profile !== null
    && (profileId === null || data.profile.id === profileId)
    && data.editor.lastSavedAt !== null && data.editor.lastSavedAt === data.profile.updatedAt
    && Object.entries(request).every(([field, value]) => JSON.stringify(data.profile?.[field]) === JSON.stringify(value)));
}

const identifier = z.string().trim().min(1);
const signalField = z.enum(["headline", "homeMarket", "relationshipGoal", "targetRelationshipTypes", "preferredFollowUpWindow", "preferredIntroChannels"]);
const signalValue = z.union([z.string(), z.array(z.string())]);
const signalSource = z.enum(["chat", "activity", "contact"]);
const signalProvenance = z.object({ source: z.string(), sourceLabel: z.string(), evidenceIds: z.array(z.string()), collectedAt: timestamp,
  privacy: z.enum(["actor-scoped-profile-signals", "demo-profile-signals-only"]), generationMethod: z.enum(["fixture", "rule-based-signal-match"]) });
const suggestionSchema = z.object({
  id: identifier, sourceKind: signalSource, sourceLabel: z.string(), targetProfileField: signalField, currentValue: signalValue, suggestedValue: signalValue,
  rationale: z.string(), confidence: z.enum(["high", "medium", "low"]), status: z.enum(["pending", "accepted", "dismissed"]), createdAt: timestamp,
  evidence: z.array(z.object({ evidenceId: identifier, sourceKind: signalSource, sourceLabel: z.string(), excerpt: z.string(), collectedAt: timestamp })), provenance: signalProvenance
}).refine(suggestion => ["targetRelationshipTypes", "preferredIntroChannels"].includes(suggestion.targetProfileField)
  ? Array.isArray(suggestion.suggestedValue) : typeof suggestion.suggestedValue === "string");
export const profileSuggestionsSchema = z.object({
  state: z.enum(["success", "empty", "pending"]), suggestions: z.array(suggestionSchema), summary: z.string(), provenance: signalProvenance, nextAction: z.string()
}).refine(data => new Set(data.suggestions.map(item => item.id)).size === data.suggestions.length
  && (data.state !== "empty" || data.suggestions.length === 0));
export type ProfileSuggestions = z.infer<typeof profileSuggestionsSchema>;
export type ProfileSuggestion = z.infer<typeof suggestionSchema>;
const profilePatchSchema = z.object({
  headline: z.string().optional(), homeMarket: z.string().optional(), relationshipGoal: z.string().optional(),
  targetRelationshipTypes: z.array(z.string()).optional(), preferredFollowUpWindow: z.string().optional(), preferredIntroChannels: z.array(z.string()).optional()
}).strict();
const acceptedSuggestionSchema = z.object({
  state: z.literal("accepted"), acceptedSuggestion: suggestionSchema, profilePatch: profilePatchSchema, appliedFields: z.array(signalField),
  acceptedAt: timestamp, provenance: signalProvenance, nextAction: z.string()
});
export type AcceptedProfileSuggestion = z.infer<typeof acceptedSuggestionSchema>;
export function profileSuggestionReceiptSchema(suggestion: ProfileSuggestion) {
  return acceptedSuggestionSchema.refine(data => data.acceptedSuggestion.id === suggestion.id
    && data.acceptedSuggestion.status === "accepted" && data.acceptedSuggestion.targetProfileField === suggestion.targetProfileField
    && JSON.stringify(data.acceptedSuggestion.suggestedValue) === JSON.stringify(suggestion.suggestedValue)
    && data.appliedFields.length === 1 && data.appliedFields[0] === suggestion.targetProfileField
    && Object.keys(data.profilePatch).length === 1
    && JSON.stringify(data.profilePatch[suggestion.targetProfileField]) === JSON.stringify(suggestion.suggestedValue));
}

const documentKind = z.enum(["business-card", "resume"]);
const extractionSchema = z.object({
  state: z.enum(["success", "empty", "pending"]), kind: documentKind,
  draft: z.object({
    id: identifier, kind: documentKind, displayName: z.string(), headline: z.string(), organization: z.string(), role: z.string(),
    email: z.string().optional(), phone: z.string().optional(), website: z.string().optional(),
    homeMarket: z.string(), relationshipGoal: z.string(), targetRelationshipTypes: z.array(z.string()), preferredFollowUpWindow: z.string(), preferredIntroChannels: z.array(z.string()),
    confidence: z.enum(["high", "medium", "low"]), extractedAt: timestamp,
    evidence: z.array(z.object({ field: z.string(), value: z.string(), evidenceId: identifier, excerpt: z.string() })), suggestedProfileFields: profilePatchSchema
  }).nullable(), confidenceSummary: z.string(),
  provenance: z.object({ source: z.string(), sourceLabel: z.string(), evidenceIds: z.array(z.string()), collectedAt: timestamp,
    privacy: z.enum(["demo-profile-document-only", "live-profile-document-policy-only"]), extractionMethod: z.enum(["fixture", "rule-based-text-match", "live-policy-no-op"]) }), nextAction: z.string()
}).refine(data => data.state === "empty" ? data.draft === null : data.state !== "success" || data.draft !== null);
export type ProfileExtraction = z.infer<typeof extractionSchema>;
export function profileExtractionReceiptSchema(kind: "business-card" | "resume") {
  return extractionSchema.refine(data => data.kind === kind && (data.draft === null || data.draft.kind === kind));
}

export function profileContactsCount(data: unknown): number | null {
  return homeFollowupsToView(data) === null ? null : (data as { contacts: unknown[] }).contacts.length;
}

export function profileTodayTasksCount(data: unknown, now = new Date()): number | null {
  return homeTasksToView(data, homeDateView(now).selectedDateKey, now)?.length ?? null;
}

export function profileUpcomingScheduleCount(data: unknown, now = new Date()): number | null {
  if (homeScheduleToView(data, homeDateView(now).selectedDateKey, now) === null) return null;
  const items = (data as { scheduleItems: ScheduleItemContract[] }).scheduleItems;
  if (items.some(item => !["relationship", "meeting", "event", "work", "personal", "other"].includes(item.category))) return null;
  return items.filter(item => item.state !== "cancelled" && Date.parse(item.startsAt) > now.getTime()).length;
}
