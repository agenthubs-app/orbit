import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type {
  HostCenterResponse,
  HostCenterSummary,
  HostDesktopLinkResult,
  HostEventSlugResolveResult,
  HostEventCancelInput,
  HostEventArchiveInput,
  HostEventCodeReissueInput,
  HostEventInput,
  HostEventPublishInput,
  HostEventUpdateInput,
  HostEventView,
  HostEventWriteResult,
} from "../contract/host-events";

// R17 主催. Responses tolerant (README rule 10): an unknown status reads as `upcoming`, an unknown role as
// `read_only_analyst` (the least privileged), an unknown row note as `none`. Request bodies are strict.

const ROLES = ["owner", "manager", "operations", "check_in", "reviewer", "read_only_analyst"] as const;
const STATUSES = ["draft", "upcoming", "live", "ended", "cancelled", "archived"] as const;
const FEE_KINDS = ["free", "amount", "pay_at_door", "external_link"] as const;
const instant = z.string().datetime({ offset: true });
const count = z.number().int().min(0);

export const hostRowNoteObject = z.object({
  kind: tolerantEnum(["check_in_open", "matching_missing", "review_pending", "followup", "draft", "cancelled", "archived", "none"], "none"),
  count: count.nullable().optional(),
  rate: z.number().min(0).max(100).nullable().optional(),
  at: z.string().nullable().optional(),
});

export const hostCenterEventRowObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  emoji: z.string().nullable(),
  status: tolerantEnum(STATUSES, "upcoming"),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  venue: z.string().nullable(),
  applied: count,
  capacity: count.nullable(),
  matched: count.nullable(),
  checkedIn: count.nullable(),
  note: hostRowNoteObject,
  action: tolerantEnum(["open_check_in", "open_console"], "open_console"),
  role: tolerantEnum(ROLES, "read_only_analyst"),
});

export const hostCenterKpiObject = z.object({
  upcoming: count,
  upcomingThisMonth: count,
  appliedThisMonth: count,
  appliedDeltaVsLastMonth: z.number().int().nullable(),
  averageCheckInRate: z.number().min(0).max(100).nullable(),
  followupRate: z.number().min(0).max(100).nullable(),
  followupEndedCount: count,
});

export const hostTodoItemObject = z.object({
  kind: z.enum(["review_pending", "matching_missing", "profile_incomplete", "publish_form", "generate_matching", "publish_matching", "open_check_in"]),
  eventId: z.string().min(1),
  eventTitle: z.string(),
  count: count.nullable().optional(),
  daysLeft: z.number().int().nullable().optional(),
});

export const hostNextStepObject = z.object({
  kind: z.enum(["publish_form", "review_pending", "generate_matching", "publish_matching", "open_check_in", "send_followup"]),
  done: z.boolean(),
  doneAt: z.string().nullable().optional(),
  count: count.nullable().optional(),
  threshold: count.nullable().optional(),
});

export const hostNextStepsObject = z.object({
  eventId: z.string().min(1),
  eventTitle: z.string(),
  steps: readableItems(hostNextStepObject),
});

export const hostCenterSummaryObject = z.object({ eventCount: count, appliedThisMonth: count, activeCount: count });
export const hostCenterSummarySchema = hostCenterSummaryObject as z.ZodType<HostCenterSummary>;

export const hostCenterSpotlightObject = z.object({
  eventId: z.string().min(1),
  startsAt: z.string().nullable(),
  applied: count,
  capacity: count.nullable(),
  pendingReview: count,
  cohosts: count,
});

export const hostCenterResponseObject = z.object({
  summary: hostCenterSummaryObject,
  kpi: hostCenterKpiObject.nullable(),
  todo: readableItems(hostTodoItemObject),
  next: hostNextStepsObject.nullable(),
  spotlight: hostCenterSpotlightObject.nullable(),
  filterCounts: z.object({ all: count, upcoming: count, live: count, ended: count, inactive: count }),
  events: readableItems(hostCenterEventRowObject),
  page: z.number().int().min(1),
  pageCount: z.number().int().min(1),
  sample: z.literal(true).optional(),
});
export const hostCenterResponseSchema = hostCenterResponseObject as unknown as z.ZodType<HostCenterResponse>;

export const hostCohostAvatarObject = z.object({ actorId: z.string().min(1), name: z.string(), initial: z.string().max(4) });

export const hostEventViewObject = z.object({
  eventId: z.string().min(1),
  lifecycle: tolerantEnum(["draft", "published", "cancelled", "archived"], "draft"),
  status: tolerantEnum(STATUSES, "upcoming"),
  title: z.string(),
  emoji: z.string().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  timezone: z.string(),
  venueName: z.string().nullable(),
  venueArea: z.string().nullable(),
  online: z.boolean(),
  feeKind: tolerantEnum(FEE_KINDS, "free"),
  feeAmountYen: count.nullable(),
  feeUrl: z.string().nullable(),
  capacity: count.nullable(),
  description: z.string().nullable(),
  organizerProfileId: z.string().nullable(),
  organizerName: z.string().nullable(),
  organizerEmoji: z.string().nullable(),
  organizerSlug: z.string().nullable(),
  publicSlug: z.string().nullable(),
  participationCode: z.string().nullable(),
  admissionMode: tolerantEnum(["first_come", "review"], "review"),
  registrationClosesAt: z.string().nullable(),
  followerCount: count,
  appliedCount: count,
  approvedCount: count,
  waitlistedCount: count,
  cohostCount: count,
  cohosts: readableItems(hostCohostAvatarObject),
  myRole: tolerantEnum(ROLES, "read_only_analyst"),
  capabilities: z.array(z.string()),
  cancelledAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  version: z.number().int().min(1),
  sample: z.literal(true).optional(),
});
export const hostEventViewSchema = hostEventViewObject as unknown as z.ZodType<HostEventView>;

export const hostEventChangePreviewObject = z.object({
  timeChanged: z.boolean(),
  venueChanged: z.boolean(),
  beforeStartsAt: z.string().nullable(),
  afterStartsAt: z.string().nullable(),
  beforeVenue: z.string().nullable(),
  afterVenue: z.string().nullable(),
  approvedCount: count,
  waitlistedCount: count,
});

export const hostEventWriteResultObject = z.object({
  event: hostEventViewObject,
  changePreview: hostEventChangePreviewObject.nullable(),
  notified: count,
});
export const hostEventWriteResultSchema = hostEventWriteResultObject as unknown as z.ZodType<HostEventWriteResult>;

export const hostDesktopLinkResultObject = z.object({ sent: z.literal(true), href: z.string() });
export const hostDesktopLinkResultSchema = hostDesktopLinkResultObject as z.ZodType<HostDesktopLinkResult>;

export const hostEventSlugResolveResultObject = z.object({ eventId: z.string().min(1), slug: z.string().min(1) });
export const hostEventSlugResolveResultSchema = hostEventSlugResolveResultObject as z.ZodType<HostEventSlugResolveResult>;

// ─── requests (strict) ───
const title = z.string().trim().min(1).max(80);
const emoji = z.string().trim().min(1).max(8).nullable();
const venueText = z.string().trim().max(80).nullable();
const yen = z.number().int().min(0).max(10_000_000).nullable();
const url = z.string().trim().url().max(500).refine((value) => /^https:\/\//u.test(value), "https only").nullable();
const capacity = z.number().int().min(1).max(10_000).nullable();
const description = z.string().trim().max(200).nullable();
const profileId = z.string().trim().min(1).max(200);

export const hostEventInputObject = z.object({
  title,
  emoji: emoji.optional(),
  startsAt: instant,
  endsAt: instant,
  timezone: z.string().trim().min(1).max(64).optional(),
  venueName: venueText.optional(),
  venueArea: venueText.optional(),
  online: z.boolean().optional(),
  feeKind: z.enum(FEE_KINDS),
  feeAmountYen: yen.optional(),
  feeUrl: url.optional(),
  capacity: capacity.optional(),
  description: description.optional(),
  organizerProfileId: profileId,
  templateId: z.enum(["mixer", "study", "roundtable"]).nullable().optional(),
}).strict();
export const hostEventInputSchema = hostEventInputObject as unknown as z.ZodType<HostEventInput>;

export const hostEventUpdateInputObject = z.object({
  expectedVersion: z.number().int().min(1),
  title: title.optional(),
  emoji: emoji.optional(),
  startsAt: instant.optional(),
  endsAt: instant.optional(),
  venueName: venueText.optional(),
  venueArea: venueText.optional(),
  online: z.boolean().optional(),
  feeKind: z.enum(FEE_KINDS).optional(),
  feeAmountYen: yen.optional(),
  feeUrl: url.optional(),
  capacity: capacity.optional(),
  description: description.optional(),
  organizerProfileId: profileId.optional(),
  notify: z.boolean().optional(),
}).strict();
export const hostEventUpdateInputSchema = hostEventUpdateInputObject as unknown as z.ZodType<HostEventUpdateInput>;

export const hostEventPublishInputObject = z.object({ expectedVersion: z.number().int().min(1) }).strict();
export const hostEventPublishInputSchema = hostEventPublishInputObject as z.ZodType<HostEventPublishInput>;

/** ≤140 字、不能带链接（A10 / §2.10）。 */
export const hostNoteText = z.string().trim().max(140).refine((value) => !/(https?:\/\/|www\.|[a-z0-9-]+\.(com|jp|net|org|io|app|co)\b)/iu.test(value), "no links");

export const hostEventCancelInputObject = z.object({ expectedVersion: z.number().int().min(1), hostNote: hostNoteText.nullable().optional() }).strict();
export const hostEventCancelInputSchema = hostEventCancelInputObject as unknown as z.ZodType<HostEventCancelInput>;

export const hostEventCodeReissueInputObject = z.object({ expectedVersion: z.number().int().min(1) }).strict();
export const hostEventCodeReissueInputSchema = hostEventCodeReissueInputObject as z.ZodType<HostEventCodeReissueInput>;

export const hostEventArchiveInputObject = z.object({ expectedVersion: z.number().int().min(1), archived: z.boolean() }).strict();
export const hostEventArchiveInputSchema = hostEventArchiveInputObject as z.ZodType<HostEventArchiveInput>;
