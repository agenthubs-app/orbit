import { z } from "zod";

import { INDUSTRY_IDS } from "../domain/industries";
import { ORBIT_LANGUAGES } from "../domain/language";

const nonEmptyString = z.string().trim().min(1);
const stringList = z.array(z.string());
const finiteNumber = z.number().finite();
const percentage = finiteNumber.min(0).max(100);

const dashboardActivitySchema = z
  .object({
    activityId: nonEmptyString,
    type: z.enum(["new_contact", "high_value", "followup_due", "dormant"]),
    label: nonEmptyString,
    occurredAt: nonEmptyString,
    sourceLabel: nonEmptyString,
    evidenceIds: stringList,
  })
  .passthrough();

const dashboardAggregateSchema = z
  .object({
    state: z.enum(["success", "empty", "pending"]),
    relationshipAssetTotals: z
      .object({
        contacts: finiteNumber,
        connections: finiteNumber,
        evidenceBackedRelationships: finiteNumber,
        eventsRepresented: finiteNumber,
      })
      .passthrough(),
    newContacts: z
      .object({
        count: finiteNumber,
        windowLabel: z.string(),
        contacts: z.array(z.unknown()),
      })
      .passthrough(),
    highValueCount: finiteNumber,
    highValueRelationships: z.array(z.unknown()),
    pendingFollowups: z
      .object({ count: finiteNumber, tasks: z.array(z.unknown()) })
      .passthrough(),
    dormantContacts: z
      .object({ count: finiteNumber, contacts: z.array(z.unknown()) })
      .passthrough(),
    recentActivity: z.array(dashboardActivitySchema),
    summary: z.string(),
    nextAction: z.string(),
  })
  .passthrough();

const dashboardSummarySchema = z
  .object({
    state: z.enum(["success", "empty", "pending"]),
    metrics: z.array(
      z
        .object({
          id: z.enum([
            "relationship-assets",
            "new-contacts",
            "high-value",
            "pending-followups",
            "dormant-contacts",
          ]),
          label: nonEmptyString,
          value: finiteNumber,
          evidenceIds: stringList,
        })
        .passthrough(),
    ),
    recentActivity: z.array(dashboardActivitySchema),
    summary: z.string(),
    nextAction: z.string(),
  })
  .passthrough();

const opportunityActionSchema = z
  .object({
    kind: z.enum(["open_contact", "open_contacts", "open_pipeline"]),
    label: nonEmptyString,
    contactId: z.string().optional(),
  })
  .passthrough();

const opportunityBriefSchema = z
  .object({
    ruleVersion: z.literal("opportunity-brief-v1"),
    type: z.enum(["follow_up", "coverage_gap", "relationship_risk", "referral_path"]),
    title: nonEmptyString,
    judgment: nonEmptyString,
    evidence: stringList,
    steps: stringList,
    primaryAction: opportunityActionSchema,
    secondaryAction: opportunityActionSchema.optional(),
    evaluatedAt: nonEmptyString,
    evidenceIds: stringList,
    priority: z
      .object({
        total: finiteNumber,
        urgency: finiteNumber,
        relationshipValue: finiteNumber,
        goalRelevance: finiteNumber,
        evidenceCompleteness: finiteNumber,
        dormantRisk: finiteNumber,
      })
      .passthrough(),
  })
  .passthrough();

const dashboardOpportunitiesSchema = z
  .object({
    state: z.enum(["success", "empty", "pending"]),
    highPriorityOpportunities: z.array(
      z
        .object({
          opportunityId: nonEmptyString,
          contactId: nonEmptyString,
          contactName: nonEmptyString,
          organization: z.string(),
          title: nonEmptyString,
          priority: z.enum(["high", "medium"]),
          priorityScore: finiteNumber,
          currentGoalId: z.string(),
          reason: z.string(),
          suggestedAction: z.string(),
          dueLabel: z.string(),
          evidenceIds: stringList,
          actionBrief: opportunityBriefSchema.optional(),
        })
        .passthrough(),
    ),
    dormantHighValueContacts: z.array(
      z
        .object({
          contactId: nonEmptyString,
          contactName: nonEmptyString,
          organization: z.string(),
          valueType: z.enum(["commercial_opportunity", "strategic_fit", "referral_path"]),
          valueScore: finiteNumber,
          lastTouchpointDays: finiteNumber,
          lastTouchpointLabel: z.string(),
          reason: z.string(),
          suggestedAction: z.string(),
          evidenceIds: stringList,
        })
        .passthrough(),
    ),
    currentGoalMatches: z.array(z.unknown()),
    suggestedContactReasons: z.array(z.unknown()),
    summary: z.string(),
    nextAction: z.string(),
  })
  .passthrough();

const structureBucketSchema = z
  .object({
    bucketId: nonEmptyString,
    label: nonEmptyString,
    contactCount: finiteNumber.nonnegative(),
    percentage,
    evidenceIds: stringList,
    missingData: z.boolean(),
    primaryIndustryId: z.enum(INDUSTRY_IDS).optional(),
  })
  .passthrough();

const dashboardDistributionsSchema = z
  .object({
    state: z.enum(["success", "empty", "pending"]),
    industryDistribution: z.array(
      z
        .object({
          bucketId: nonEmptyString,
          label: nonEmptyString,
          contactCount: finiteNumber.nonnegative(),
          percentage,
          topOrganizations: stringList,
          evidenceIds: stringList,
        })
        .passthrough(),
    ),
    valueTypeDistribution: z.array(
      z
        .object({
          valueType: z.enum([
            "commercial_opportunity",
            "strategic_fit",
            "referral_path",
            "investor_access",
          ]),
          label: nonEmptyString,
          relationshipCount: finiteNumber.nonnegative(),
          percentage,
          evidenceIds: stringList,
        })
        .passthrough(),
    ),
    relationshipStrengthDistribution: z.array(
      z
        .object({
          strength: z.enum(["strong", "warm", "weak"]),
          relationshipCount: finiteNumber.nonnegative(),
          percentage,
          followupRisk: z.enum(["low", "moderate", "high"]),
          evidenceIds: stringList,
        })
        .passthrough(),
    ),
    structureDistributions: z.object({
      industry: z.array(structureBucketSchema),
      location: z.array(structureBucketSchema),
      role: z.array(structureBucketSchema),
      relationship: z.array(structureBucketSchema),
    }),
    summary: z.string(),
    nextAction: z.string(),
  })
  .passthrough();

const dashboardGapsSchema = z
  .object({
    state: z.enum(["success", "empty", "pending"]),
    coverageScore: percentage,
    gaps: z.array(
      z
        .object({
          gapId: nonEmptyString,
          label: nonEmptyString,
          severity: z.enum(["high", "medium", "low"]),
          currentCount: finiteNumber.nonnegative(),
          targetCount: finiteNumber.nonnegative(),
          recommendedAction: z.string(),
          evidenceIds: stringList,
        })
        .passthrough(),
    ),
    summary: z.string(),
    nextAction: z.string(),
  })
  .passthrough();

const manualProfileSchema = z
  .object({
    id: nonEmptyString,
    displayName: nonEmptyString,
    headline: z.string(),
    organization: z.string(),
    role: z.string(),
    homeMarket: z.string(),
    relationshipGoal: z.string(),
    targetRelationshipTypes: stringList,
    preferredFollowUpWindow: z.string(),
    preferredLanguage: z.enum(ORBIT_LANGUAGES),
    preferredIntroChannels: stringList,
    updatedAt: nonEmptyString,
  })
  .passthrough();

const profilePayloadSchema = z
  .object({
    state: z.enum(["success", "empty", "pending"]),
    profile: manualProfileSchema.nullable(),
    completeness: z
      .object({
        score: percentage,
        status: z.enum(["not-started", "action-needed", "ready"]),
        completedFields: stringList,
        missingFields: stringList,
        nextBestField: z.string().nullable(),
      })
      .passthrough(),
    editor: z
      .object({
        canSave: z.boolean(),
        lastSavedAt: z.string().nullable(),
        dirtyFields: stringList,
        validationMessages: stringList,
      })
      .passthrough(),
    nextAction: z.string(),
  })
  .passthrough();

const contactSourceSchema = z
  .object({
    type: z.enum([
      "manual",
      "business_card_ocr",
      "qr_scan",
      "event_import",
      "external_contacts",
      "email_signal",
      "calendar_signal",
      "referral",
    ]),
    id: nonEmptyString,
    label: nonEmptyString,
    evidenceId: nonEmptyString,
  })
  .passthrough();

const contactListItemSchema = z
  .object({
    id: nonEmptyString,
    displayName: nonEmptyString,
    role: z.string(),
    organization: z.string(),
    location: z.string(),
    profileSnippet: z.string(),
    relationshipContext: z.string(),
    lastInteractionAt: z.string(),
    nextAction: z.string(),
    source: contactSourceSchema,
    evidence: z.array(z.unknown()),
    tags: stringList,
    value: z
      .object({
        score: finiteNumber,
        valueTypes: z.array(
          z.enum([
            "strategic_fit",
            "commercial_opportunity",
            "knowledge_exchange",
            "referral_path",
            "community_context",
          ]),
        ),
        rationale: z.string(),
        evidenceIds: stringList,
      })
      .passthrough(),
    status: z.enum(["active", "needs_follow_up", "nurture", "archived"]),
    primaryIndustryId: z.enum(INDUSTRY_IDS).optional(),
    primaryIndustryLabel: z.string().optional(),
  })
  .passthrough();

const contactsPayloadSchema = z
  .object({
    state: z.enum(["success", "empty", "pending"]),
    query: z.string(),
    appliedFilters: z.object({}).passthrough(),
    availableFilters: z.object({}).passthrough(),
    contacts: z.array(contactListItemSchema),
    summary: z.string(),
    nextAction: z.string(),
  })
  .passthrough();

export const mobileContactsDashboardSectionSchemas = {
  aggregate: dashboardAggregateSchema,
  summary: dashboardSummarySchema,
  opportunities: dashboardOpportunitiesSchema,
  gaps: dashboardGapsSchema,
  distributions: dashboardDistributionsSchema,
  profile: profilePayloadSchema,
  contacts: contactsPayloadSchema,
} as const;

export const MOBILE_CONTACTS_DASHBOARD_OPTIONAL_SECTIONS = [
  "summary",
  "opportunities",
  "gaps",
  "distributions",
  "profile",
  "contacts",
] as const;

export const mobileContactsDashboardPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: nonEmptyString,
  aggregate: dashboardAggregateSchema,
  summary: dashboardSummarySchema.nullable(),
  opportunities: dashboardOpportunitiesSchema.nullable(),
  gaps: dashboardGapsSchema.nullable(),
  distributions: dashboardDistributionsSchema.nullable(),
  profile: profilePayloadSchema.nullable(),
  contacts: contactsPayloadSchema.nullable(),
  unavailableSections: z.array(z.enum(MOBILE_CONTACTS_DASHBOARD_OPTIONAL_SECTIONS)),
});

export type MobileContactsDashboardPayload = z.infer<
  typeof mobileContactsDashboardPayloadSchema
>;

export type MobileContactsDashboardOptionalSection =
  (typeof MOBILE_CONTACTS_DASHBOARD_OPTIONAL_SECTIONS)[number];
