import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import { hostEventViewObject, hostNoteText } from "./host-events";
import type {
  HostRosterMatchInput,
  HostRosterMatchResponse,
  HostAdmitOnSiteInput,
  HostCheckInResult,
  HostCheckInScanInput,
  HostCheckInUndoInput,
  HostKioskHeartbeatInput,
  HostKioskHeartbeatResult,
  HostKioskResponse,
  HostKioskRosterResponse,
  HostMatchingGenerateInput,
  HostMatchingOverridesInput,
  HostMatchingPublishInput,
  HostMatchingResponse,
  HostOverviewResponse,
  HostPeopleDecisionInput,
  HostPeopleDecisionResult,
  HostPeopleResponse,
  HostReportResponse,
  HostSetupDraftInput,
  HostSetupHostNoteInput,
  HostSetupPublishInput,
  HostSetupResponse,
} from "../contract/host-console";

// R17 主催 · 运营台各页签. Responses tolerant; request bodies strict.
const count = z.number().int().min(0);
const percent = z.number().min(0).max(100);
const STEPS = ["registration", "generation", "review_groups", "publish", "check_in"] as const;
const MATCHING_STATES = ["none", "generating", "draft", "published"] as const;
const BUCKETS = ["pending", "approved", "waitlisted", "rejected"] as const;

// ─── 概要 ───
export const hostReportSummaryObject = z.object({ checkInRate: percent.nullable(), exchangeRate: percent.nullable(), followupRate: percent.nullable(), checkedIn: count, total: count, exchanges: count.nullable(), asOf: z.string() });

export const hostOverviewResponseObject = z.object({
  event: hostEventViewObject,
  applied: count,
  capacity: count.nullable(),
  matchable: count,
  checkedIn: count,
  arrivalRate: percent.nullable(),
  doorsOpenAt: z.string().nullable(),
  pendingReview: count,
  recommendationRate: percent.nullable(),
  recommendationsPerPerson: count,
  trend: z.array(count).max(60),
  currentStep: tolerantEnum(STEPS, "registration"),
  completedSteps: z.array(z.string()).transform((items) => items.filter((item): item is (typeof STEPS)[number] => (STEPS as readonly string[]).includes(item))),
  todos: readableItems(z.object({ kind: z.enum(["review_pending", "profile_incomplete"]), count, walkInSlots: count.nullable().optional() })),
  matching: z.object({ state: tolerantEnum(MATCHING_STATES, "none"), roundCount: count, tableCount: count, unplaced: count }),
  reportSummary: hostReportSummaryObject.nullable(),
  sample: z.literal(true).optional(),
});
export const hostOverviewResponseSchema = hostOverviewResponseObject as unknown as z.ZodType<HostOverviewResponse>;

// ─── マッチング ───
export const hostMatchingConditionsObject = z.object({
  tableSize: z.number().int().min(2).max(12),
  roundCount: z.number().int().min(1).max(3),
  separateCompanies: z.boolean(),
  avoidPreviousTablemates: z.boolean(),
  investorPerTable: z.boolean(),
});

export const hostMatchingMemberObject = z.object({
  participantId: z.string().min(1),
  name: z.string(),
  initial: z.string().max(4),
  org: z.string().nullable(),
  role: z.string().nullable(),
  standing: z.string().nullable(),
  placedByHost: z.boolean(),
});

export const hostMatchingTableObject = z.object({
  round: z.number().int().min(1),
  table: z.string().min(1),
  theme: z.string().nullable(),
  members: readableItems(hostMatchingMemberObject),
  why: z.string().nullable(),
  absent: count,
});

export const hostMatchingResponseObject = z.object({
  event: hostEventViewObject,
  state: tolerantEnum(MATCHING_STATES, "none"),
  applied: count,
  profileComplete: count,
  minimumApplied: count,
  generationsUsed: count,
  generationsLimit: count,
  conditions: hostMatchingConditionsObject,
  rounds: readableItems(z.object({ index: z.number().int().min(1), startsAt: z.string(), endsAt: z.string() })),
  round: z.number().int().min(1),
  tables: readableItems(hostMatchingTableObject),
  unplaced: readableItems(hostMatchingMemberObject),
  participantCount: count,
  tableCount: count,
  tableSizeMin: count,
  tableSizeMax: count,
  unsatisfiedTables: count,
  generationId: z.string().nullable(),
  overridesVersion: count,
  sample: z.literal(true).optional(),
});
export const hostMatchingResponseSchema = hostMatchingResponseObject as unknown as z.ZodType<HostMatchingResponse>;

export const hostMatchingOverridesInputObject = z.object({
  generationId: z.string().trim().min(1).max(200),
  expectedVersion: z.number().int().min(0),
  moves: z.array(z.object({ participantId: z.string().trim().min(1).max(200), round: z.number().int().min(1).max(3), toTable: z.string().trim().min(1).max(4).nullable() }).strict()).max(500),
}).strict();
export const hostMatchingOverridesInputSchema = hostMatchingOverridesInputObject as unknown as z.ZodType<HostMatchingOverridesInput>;

export const hostMatchingGenerateInputObject = z.object({
  conditions: hostMatchingConditionsObject.strict(),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();
export const hostMatchingGenerateInputSchema = hostMatchingGenerateInputObject as unknown as z.ZodType<HostMatchingGenerateInput>;

export const hostMatchingPublishInputObject = z.object({ generationId: z.string().trim().min(1).max(200), overridesVersion: z.number().int().min(0), notifyCohosts: z.boolean().optional() }).strict();
export const hostMatchingPublishInputSchema = hostMatchingPublishInputObject as z.ZodType<HostMatchingPublishInput>;

// ─── 参加者 ───
export const hostPeopleRowObject = z.object({
  actorId: z.string().min(1),
  name: z.string(),
  initial: z.string().max(4),
  org: z.string().nullable(),
  role: z.string().nullable(),
  answer: z.string().nullable(),
  profileScore: z.number().int().min(0).max(100),
  profileIncomplete: z.boolean(),
  attendCount: count,
  status: z.enum(BUCKETS),
  applicationVersion: z.number().int().min(1),
});

export const hostPeopleResponseObject = z.object({
  event: hostEventViewObject,
  bucket: tolerantEnum(BUCKETS, "pending"),
  counts: z.object({ pending: count, approved: count, waitlisted: count, rejected: count }),
  capacity: count.nullable(),
  remaining: count.nullable(),
  answerLabel: z.string().nullable(),
  rows: readableItems(hostPeopleRowObject),
  more: count,
  nextCursor: z.string().nullable(),
  applyPath: z.string().nullable(),
  questionCount: count,
  sample: z.literal(true).optional(),
});
export const hostPeopleResponseSchema = hostPeopleResponseObject as unknown as z.ZodType<HostPeopleResponse>;

export const hostPeopleDecisionInputObject = z.object({ decision: z.enum(["approve", "waitlist", "reject"]), expectedVersion: z.number().int().min(1) }).strict();
export const hostPeopleDecisionInputSchema = hostPeopleDecisionInputObject as z.ZodType<HostPeopleDecisionInput>;

export const hostPeopleDecisionResultObject = z.object({
  actorId: z.string().min(1),
  status: tolerantEnum(BUCKETS, "pending"),
  applicationVersion: z.number().int().min(1),
  receptionNumber: z.string().nullable(),
  notified: count,
});
export const hostPeopleDecisionResultSchema = hostPeopleDecisionResultObject as unknown as z.ZodType<HostPeopleDecisionResult>;

// ─── 受付 ───
const KIOSK_STATUSES = ["not_arrived", "checked_in", "waitlisted"] as const;
export const hostKioskRowObject = z.object({
  participantId: z.string().min(1),
  actorId: z.string().min(1),
  name: z.string(),
  initial: z.string().max(4),
  kana: z.string().nullable(),
  org: z.string().nullable(),
  role: z.string().nullable(),
  status: z.enum(KIOSK_STATUSES),
  checkedInAt: z.string().nullable(),
  table: z.string().nullable(),
  receptionNumber: z.string().nullable(),
  undoable: z.boolean(),
});
export const hostKioskRecentObject = z.object({
  participantId: z.string().min(1),
  name: z.string(),
  initial: z.string().max(4),
  org: z.string().nullable(),
  at: z.string(),
  table: z.string().nullable(),
  receptionNumber: z.string().nullable(),
});

export const hostKioskResponseObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  venue: z.string().nullable(),
  staffName: z.string(),
  staffRole: z.string(),
  now: z.string(),
  doorsOpenAt: z.string().nullable(),
  checkedIn: count,
  total: count,
  rate: percent,
  rows: readableItems(hostKioskRowObject),
  recent: readableItems(hostKioskRecentObject),
  devices: count,
  canWalkIn: z.boolean(),
  overCapacity: z.boolean(),
  approved: count.optional(),
  capacity: count.nullable().optional(),
  cacheUntil: z.string(),
  sample: z.literal(true).optional(),
});
export const hostKioskResponseSchema = hostKioskResponseObject as unknown as z.ZodType<HostKioskResponse>;

export const hostKioskRosterResponseObject = z.object({ eventId: z.string().min(1), cacheUntil: z.string(), rows: readableItems(hostKioskRowObject), sample: z.literal(true).optional() });
export const hostKioskRosterResponseSchema = hostKioskRosterResponseObject as unknown as z.ZodType<HostKioskRosterResponse>;

const idempotencyKey = z.string().trim().min(8).max(200);
export const hostCheckInScanInputObject = z.object({ payload: z.string().trim().min(1).max(600), idempotencyKey }).strict();
export const hostCheckInScanInputSchema = hostCheckInScanInputObject as z.ZodType<HostCheckInScanInput>;
export const hostAdmitOnSiteInputObject = z.object({ idempotencyKey, confirmOverCapacity: z.boolean().optional() }).strict();
export const hostAdmitOnSiteInputSchema = hostAdmitOnSiteInputObject as z.ZodType<HostAdmitOnSiteInput>;
export const hostCheckInUndoInputObject = z.object({ idempotencyKey }).strict();
export const hostCheckInUndoInputSchema = hostCheckInUndoInputObject as z.ZodType<HostCheckInUndoInput>;

export const hostCheckInResultObject = z.object({
  participantId: z.string().min(1),
  status: tolerantEnum(KIOSK_STATUSES, "not_arrived"),
  checkedInAt: z.string().nullable(),
  receptionNumber: z.string().nullable(),
  table: z.string().nullable(),
  name: z.string(),
  duplicate: z.boolean(),
  overCapacity: z.boolean(),
});
export const hostCheckInResultSchema = hostCheckInResultObject as unknown as z.ZodType<HostCheckInResult>;

export const hostKioskHeartbeatInputObject = z.object({ deviceId: z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/u) }).strict();
export const hostKioskHeartbeatInputSchema = hostKioskHeartbeatInputObject as z.ZodType<HostKioskHeartbeatInput>;
export const hostKioskHeartbeatResultObject = z.object({ devices: count });
export const hostKioskHeartbeatResultSchema = hostKioskHeartbeatResultObject as z.ZodType<HostKioskHeartbeatResult>;

// ─── 申込設定 ───
const QUESTION_KINDS = ["single", "multiple", "free"] as const;
const NOTICE_TEMPLATE_KINDS = ["admission_approved", "admission_rejected", "admission_waitlisted", "admission_promoted", "matching_published", "profile_incomplete"] as const;
export const hostSetupQuestionObject = z.object({
  id: z.string().min(1),
  prompt: z.string(),
  kind: tolerantEnum(QUESTION_KINDS, "free"),
  required: z.boolean(),
  options: z.array(z.string()).max(12),
});

export const hostSetupResponseObject = z.object({
  event: hostEventViewObject,
  formPublished: z.boolean(),
  description: z.string(),
  questions: readableItems(hostSetupQuestionObject),
  capacity: count.nullable(),
  registrationClosesAt: z.string().nullable(),
  admissionMode: tolerantEnum(["first_come", "review"], "review"),
  applyPath: z.string().nullable(),
  unpublishedChanges: count,
  savedAt: z.string().nullable(),
  suggestion: z.object({ count, basisTitle: z.string().nullable(), basisCount: count, questions: readableItems(hostSetupQuestionObject) }).nullable(),
  notices: readableItems(z.object({ kind: z.enum(NOTICE_TEMPLATE_KINDS), text: z.string() })),
  hostNote: z.string().nullable(),
  revision: count,
  sample: z.literal(true).optional(),
});
export const hostSetupResponseSchema = hostSetupResponseObject as unknown as z.ZodType<HostSetupResponse>;

const questionInput = z.object({
  id: z.string().trim().min(1).max(64),
  prompt: z.string().trim().min(1).max(120),
  kind: z.enum(QUESTION_KINDS),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(60)).max(12),
}).strict();
export const hostSetupDraftInputObject = z.object({
  expectedRevision: z.number().int().min(0),
  description: z.string().trim().max(200),
  questions: z.array(questionInput).max(5),
  capacity: z.number().int().min(1).max(10_000).nullable(),
  registrationClosesAt: z.string().datetime({ offset: true }).nullable(),
  admissionMode: z.enum(["first_come", "review"]),
}).strict();
export const hostSetupDraftInputSchema = hostSetupDraftInputObject as unknown as z.ZodType<HostSetupDraftInput>;

export const hostSetupPublishInputObject = z.object({ expectedRevision: z.number().int().min(0) }).strict();
export const hostSetupPublishInputSchema = hostSetupPublishInputObject as z.ZodType<HostSetupPublishInput>;
export const hostSetupHostNoteInputObject = z.object({ hostNote: hostNoteText.nullable() }).strict();
export const hostSetupHostNoteInputSchema = hostSetupHostNoteInputObject as unknown as z.ZodType<HostSetupHostNoteInput>;

// ─── レポート ───
const reportPerson = z.object({
  name: z.string(),
  initial: z.string().max(4),
  org: z.string().nullable(),
  role: z.string().nullable(),
  table: z.string().nullable(),
  standing: z.string().nullable(),
  contactId: z.string().nullable(),
});
export const hostReportAllObject = z.object({
  state: tolerantEnum(["before", "after"], "before"),
  applied: count,
  capacity: count.nullable(),
  daysToStart: z.number().int().nullable(),
  daysSincePublish: z.number().int().nullable(),
  daysPublishToEvent: z.number().int().nullable(),
  trend: z.array(count).max(120),
  trendLabels: z.array(z.string()).max(12),
  trendMarks: z.array(z.object({ index: count, label: z.string().max(40) })).max(12).optional(),
  checkInRate: percent.nullable(),
  checkedIn: count.nullable(),
  exchanges: count.nullable(),
  exchangesPerPerson: z.number().min(0).nullable(),
  exchangeRate: percent.nullable(),
  followups: count.nullable(),
  followupRate: percent.nullable(),
  followupWindowDays: count,
  funnel: z.object({ exchanged: count.nullable(), drafted: count.nullable(), followed: count.nullable(), meetings: count.nullable() }),
  tables: readableItems(z.object({ round: z.number().int().min(1), table: z.string(), exchanges: count.nullable() })),
  tableNote: z.string().nullable(),
  standingQuestion: z.string().nullable(),
  standing: readableItems(z.object({ label: z.string(), percent: percent.nullable() })),
  suppressedBelow: count,
});
export const hostReportMineObject = z.object({
  met: count,
  exchanged: count,
  followed: count,
  followTotal: count,
  contributionLabel: z.string().nullable(),
  contributionDelta: z.number().int().nullable(),
  contributionScore: z.number().int().nullable(),
  contributionHave: count.nullable(),
  contributionTarget: count.nullable(),
  contributionGoal: z.string().nullable(),
  contributionDetail: z.string().nullable(),
  unfollowed: readableItems(reportPerson),
  daysSinceExchange: z.number().int().nullable(),
  logSuggestion: z.string().nullable(),
});
export const hostReportResponseObject = z.object({
  event: hostEventViewObject,
  view: tolerantEnum(["all", "mine"], "all"),
  all: hostReportAllObject.nullable(),
  mine: hostReportMineObject.nullable(),
  sample: z.literal(true).optional(),
});
export const hostReportResponseSchema = hostReportResponseObject as unknown as z.ZodType<HostReportResponse>;

// R17-11 名簿照合
export const hostRosterMatchInputObject = z.object({ emailHashes: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).min(1).max(5000) }).strict();
export const hostRosterMatchInputSchema = hostRosterMatchInputObject as unknown as z.ZodType<HostRosterMatchInput>;
export const hostRosterMatchResponseObject = z.object({
  eventId: z.string().min(1),
  results: readableItems(z.object({ emailHash: z.string(), status: tolerantEnum(["applied", "registered", "unregistered"] as const, "unregistered") })),
  counts: z.object({ applied: count, registered: count, unregistered: count }),
  sample: z.literal(true).optional(),
});
export const hostRosterMatchResponseSchema = hostRosterMatchResponseObject as unknown as z.ZodType<HostRosterMatchResponse>;
