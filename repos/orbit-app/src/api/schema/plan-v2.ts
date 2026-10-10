import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type {
  PlanAwardRequest,
  PlanAwardResult,
  PlanCommandResult,
  PlanGoalListResponse,
  PlanOpenResult,
  PlanSkipRequest,
  PlanStepRequest,
  PlanUndoRequest,
  PlanV2Detail,
  PlanV2SummaryResponse,
  PlanConfirmResult,
  PlanDraftFixRequest,
  PlanDraftManualEditRequest,
  PlanDraftView,
  PlanFlowStepRequest,
  PlanGoalKindRequest,
  PlanGoalKindResult,
  PlanIntakeAnswersRequest,
  PlanIntakeBlockRequest,
  PlanIntakeCreateRequest,
  PlanIntakeLadderRequest,
  PlanIntakeListResponse,
  PlanIntakeMembersRequest,
  PlanIntakePremiseRequest,
  PlanIntakeView,
} from "../contract/plan-v2";

// R22 plan v2.2 (owner 甲). Responses are read tolerantly (README rule 10): unknown keys
// dropped, an unknown goal kind reads as "unknown" (the UI then shows only the goal text),
// list items that cannot be read are skipped. Request bodies stay strict.
// The *Object exports are the uncast schemas for the TS ⇔ zod parity check.
const GOAL_KINDS = ["launch", "fundraising", "sales", "hiring", "partnership", "career", "unknown"] as const;
const goalKind = tolerantEnum(GOAL_KINDS, "unknown");
const count = z.number().int().min(0);

const segment = z.object({
  key: z.string().min(1),
  shortLabel: z.string(),
  emoji: z.string(),
  allocation: count.max(100),
  earned: count,
  overflow: count,
  skipped: z.boolean(),
});

export const planScoreViewObject = z.object({
  total: count,
  talked: count,
  skipped: count,
  overflow: count,
  remainingToFull: count.max(100),
  todayDelta: z.number().int(),
  segments: readableItems(segment),
});

const homeSummary = z.object({
  planId: z.string().min(1),
  goal: z.string().min(1),
  goalKind,
  score: planScoreViewObject,
  todayChance: z.object({ label: z.string().min(1), points: count, href: z.string().min(1) }).nullable().optional(),
  sample: z.literal(true).optional(),
});

const goalItem = z.object({
  planId: z.string().min(1),
  goal: z.string().min(1),
  goalKind,
  // 决定目标落在「进行中」还是「完了」：未知值整条跳过，不猜（通用规则 10）。
  status: z.enum(["active", "achieved"]),
  total: count,
  talkedPeople: count,
  lastOpenedAt: z.string().nullable().optional(),
  sample: z.literal(true).optional(),
});

export const planV2SummaryResponseObject = z.object({
  current: homeSummary.nullable(),
  goals: readableItems(goalItem),
});
export const planV2SummaryResponseSchema = planV2SummaryResponseObject as z.ZodType<PlanV2SummaryResponse>;

// 依据的种类决定「?」里怎么显示：未知种类的依据整条跳过。
const basis = z.object({ kind: z.enum(["premise", "landscape", "record", "template"]), ref: z.string(), label: z.string() });
const step = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  doneCriteria: z.string(),
  why: z.string().nullable(),
  personTypeKeys: z.array(z.string()),
  completedAt: z.string().nullable().optional(),
});
const personType = z.object({
  itemId: z.string().min(1),
  key: z.string().min(1),
  slot: z.string().min(1),
  shortLabelId: z.string().min(1),
  shortLabel: z.string().min(1),
  emoji: z.string(),
  roleSituation: z.string(),
  allocation: count.max(100),
  targetCount: z.number().int().min(1).max(5),
  why: z.string(),
  questions: z.array(z.string()),
  countRule: z.string(),
  recognizeHints: z.array(z.string()),
  persona: z.string().nullable().optional(),
  opener: z.string().nullable().optional(),
  introRoutes: readableItems(z.object({ viaContactId: z.string().min(1), why: z.string() })),
  skipped: z.boolean(),
});
export const planV2ContentObject = z.object({
  diagnosis: z.string(),
  conclusion: z.string(),
  flow: z.array(z.object({ emoji: z.string(), label: z.string(), note: z.string() })).optional(),
  steps: readableItems(step),
  personTypes: readableItems(personType),
  event: z.object({ allocation: count.max(100), targetCount: z.number().int().min(1).max(10) }),
  citations: readableItems(z.object({ id: z.string().min(1), version: z.number().int().min(1) })),
  allocationReasons: z.array(z.string()),
  basis: readableItems(basis),
  sample: z.literal(true).optional(),
});

const premiseRow = z.object({
  key: z.string().min(1),
  label: z.string(),
  value: z.string(),
  // 出处标签：未知来源的前提行整条跳过，不冒充「背景」。
  source: z.enum(["background", "q1", "q2", "q3", "q4", "q5", "record"]),
  guessed: z.boolean(),
});

export const planV2DetailObject = z.object({
  planId: z.string().min(1),
  revision: z.number().int().min(1),
  goal: z.string().min(1),
  goalKind,
  purposeText: z.string().nullable(),
  startsOn: z.string().min(1),
  premise: readableItems(premiseRow),
  content: planV2ContentObject,
  score: planScoreViewObject,
  quota: z.object({
    reviewLeftThisMonth: count,
    reviewMonthlyLimit: count,
    manualEditAvailable: z.boolean(),
    activeGoals: count,
    activeGoalLimit: count,
  }),
  achievedAt: z.string().nullable(),
  sample: z.literal(true).optional(),
});
export const planV2DetailSchema = planV2DetailObject as z.ZodType<PlanV2Detail>;

const idempotencyKey = z.string().min(1).max(200);

export const planAwardRequestObject = z.object({
  contactId: z.string().min(1).max(200).optional(),
  anonymous: z.literal(true).optional(),
  at: z.string().datetime({ offset: true }).optional(),
  basis: z.enum(["talked", "self_report"]),
  idempotencyKey,
}).strict().refine((body) => (body.contactId ? !body.anonymous : body.anonymous === true), { message: "either a contact or anonymous" });
export const planAwardRequestSchema = planAwardRequestObject as unknown as z.ZodType<PlanAwardRequest>;

export const planAwardResultObject = z.object({
  awardLogId: z.string().nullable(),
  points: count,
  part: tolerantEnum(["base", "overflow", "none"], "none"),
  // 没加分的原因只影响说明文字：读不懂就当没有原因（不猜成某一种）。
  reason: z.enum(["skipped", "anonymous_over_target", "already_counted"]).optional().catch(undefined),
  score: planScoreViewObject,
  replayed: z.boolean(),
});
export const planAwardResultSchema = planAwardResultObject as z.ZodType<PlanAwardResult>;

export const planUndoRequestObject = z.object({ idempotencyKey }).strict();
export const planUndoRequestSchema = planUndoRequestObject as z.ZodType<PlanUndoRequest>;
export const planSkipRequestObject = z.object({ idempotencyKey }).strict();
export const planSkipRequestSchema = planSkipRequestObject as z.ZodType<PlanSkipRequest>;
export const planStepRequestObject = z.object({ idempotencyKey }).strict();
export const planStepRequestSchema = planStepRequestObject as z.ZodType<PlanStepRequest>;

export const planCommandResultObject = z.object({
  score: planScoreViewObject,
  replayed: z.boolean(),
  completedAt: z.string().nullable().optional(),
});
export const planCommandResultSchema = planCommandResultObject as z.ZodType<PlanCommandResult>;

/** `GET /api/agent/plans/v2`：目标列表（R25 的目标下拉也读它）。 */
export const planGoalListResponseObject = z.object({ goals: readableItems(goalItem) });
export const planGoalListResponseSchema = planGoalListResponseObject as z.ZodType<PlanGoalListResponse>;

/** `POST /api/agent/plans/v2/[planId]/open`：记下最近打开。 */
export const planOpenResultObject = z.object({ planId: z.string().min(1) });
export const planOpenResultSchema = planOpenResultObject as z.ZodType<PlanOpenResult>;

/* ------------------------------------------------------------------ */
/* R23 生成流程                                                         */
/* ------------------------------------------------------------------ */

const STRICT_GOAL_KINDS = ["launch", "fundraising", "sales", "hiring", "partnership", "career"] as const;
// 流程状态决定显示哪一段：未知状态读不懂就整条（列表项）跳过；单个流程读不懂时整页报错由界面兜底。
const intakeStatus = z.enum(["drafting", "background", "questions", "premise", "drafted", "planned", "abandoned"]);
const aiStep = z.object({
  state: tolerantEnum(["none", "done", "failed", "fallback"], "none"),
  limit: z.enum(["daily", "monthly"]).nullable().optional().catch(null),
  retryOn: z.string().nullable().optional(),
});
const member = z.object({
  memberId: z.string().min(1),
  name: z.string().min(1),
  headline: z.string().nullable(),
  source: tolerantEnum(["profile", "network", "manual"], "manual"),
  relation: z.enum(["cofounder", "employee", "contractor", "advisor"]).nullable().catch(null),
  contactId: z.string().nullable(),
  capabilities: z.array(z.string()),
  otherCapabilities: z.array(z.string()),
  isSelf: z.boolean(),
  basis: z.string().nullable().optional(),
});
const block = <T extends z.ZodTypeAny>(value: T) => z.object({ value, confirmedAt: z.string().nullable() });
const premiseRows = readableItems(premiseRow);

export const planIntakeViewObject = z.object({
  intakeId: z.string().min(1),
  status: intakeStatus,
  source: tolerantEnum(["task", "onboarding", "next_goal", "iorbit"], "task"),
  goal: z.string().min(1),
  goalKind,
  href: z.string().min(1),
  // 「読んでいるもの」只是说明：未知种类整条跳过。
  reading: readableItems(z.object({ kind: z.enum(["profile", "goal", "network", "capabilities"]), detail: z.string() })),
  background: z.object({
    me: block(z.object({
      name: z.string(),
      headline: z.string().nullable(),
      stance: z.enum(["owner", "cofounder", "employee", "individual"]).nullable().catch(null),
      wants: z.string(),
    })),
    team: block(z.object({ mode: tolerantEnum(["solo", "team"], "team"), members: readableItems(member) })),
    purpose: block(z.object({
      rungs: readableItems(z.object({ level: z.number().int().min(1).max(4), text: z.string() })),
      suggestedLevel: z.number().int().min(1).max(4).nullable(),
      reason: z.string().nullable(),
      selectedLevel: z.number().int().min(1).max(4).nullable(),
    })),
  }),
  questions: readableItems(z.object({
    id: z.string().min(1),
    why: z.string(),
    guess: z.object({ values: z.array(z.string()), text: z.string().nullable() }).nullable(),
  })).nullable(),
  answers: readableItems(z.object({ questionId: z.string().min(1), values: z.array(z.string()), text: z.string().nullable(), guessed: z.boolean() })).nullable(),
  premise: premiseRows.nullable(),
  premiseVersion: count,
  draftId: z.string().nullable(),
  planId: z.string().nullable(),
  aiSteps: z.object({ background: aiStep, ladder: aiStep, questions: aiStep, members: aiStep, draft: aiStep }),
  limits: z.object({ ladderLeft: count, newGoalsLeftThisMonth: count }),
  updatedAt: z.string().min(1),
});
export const planIntakeViewSchema = planIntakeViewObject as unknown as z.ZodType<PlanIntakeView>;

export const planIntakeListResponseObject = z.object({
  intakes: readableItems(z.object({
    intakeId: z.string().min(1),
    goal: z.string().min(1),
    goalKind,
    status: intakeStatus,
    href: z.string().min(1),
    updatedAt: z.string().min(1),
  })),
  newGoalsLeftThisMonth: count,
  activeGoals: count,
  activeGoalLimit: count,
});
export const planIntakeListResponseSchema = planIntakeListResponseObject as z.ZodType<PlanIntakeListResponse>;

const draftChange = z.object({ path: z.string().min(1), label: z.string(), before: z.string().nullable(), after: z.string().nullable(), reason: z.string().nullable().optional() });
// 草稿里的人物类型还没有条目：`itemId` = 类型 key。
export const planDraftViewObject = z.object({
  draftId: z.string().min(1),
  kind: z.enum(["initial", "review"]),
  status: z.enum(["open", "confirmed", "discarded"]),
  intakeId: z.string().nullable(),
  planId: z.string().nullable(),
  goal: z.string().min(1),
  goalKind,
  purposeText: z.string().nullable(),
  premise: premiseRows,
  content: planV2ContentObject,
  originContent: planV2ContentObject,
  citations: readableItems(z.object({
    id: z.string().min(1),
    version: z.number().int().min(1),
    title: z.string(),
    summary: z.string(),
    sourceLabel: z.string(),
    sourceUrl: z.string(),
    sourcePublishedOn: z.string(),
    updatedOn: z.string(),
  })),
  aiFixUsed: count.max(3),
  aiFixLimit: count,
  manualEditAvailable: z.boolean(),
  turns: readableItems(z.object({
    n: z.number().int().min(1),
    input: z.string(),
    changes: readableItems(draftChange),
    unchanged: z.array(z.string()),
    noChangeReason: z.string().nullable(),
    at: z.string(),
  })),
  fix: aiStep,
  revision: z.string().min(1),
  updatedAt: z.string().min(1),
});
export const planDraftViewSchema = planDraftViewObject as unknown as z.ZodType<PlanDraftView>;

export const planConfirmResultObject = z.object({
  planId: z.string().min(1),
  href: z.string().min(1),
  archivedV1PlanId: z.string().nullable(),
  replayed: z.boolean(),
});
export const planConfirmResultSchema = planConfirmResultObject as z.ZodType<PlanConfirmResult>;

export const planGoalKindResultObject = z.object({ goalKind: z.enum(STRICT_GOAL_KINDS), source: z.enum(["ai", "rule"]) });
export const planGoalKindResultSchema = planGoalKindResultObject as z.ZodType<PlanGoalKindResult>;

// ---- 请求（严格） ----
const goalText = z.string().trim().min(1).max(2000);
const capabilityIds = z.array(z.string().min(1).max(60)).max(20);
const otherCapabilities = z.array(z.string().trim().min(1).max(60)).max(10);
const relation = z.enum(["cofounder", "employee", "contractor", "advisor"]);

export const planGoalKindRequestObject = z.object({ text: goalText }).strict();
export const planGoalKindRequestSchema = planGoalKindRequestObject as z.ZodType<PlanGoalKindRequest>;

export const planIntakeCreateRequestObject = z.object({
  goalText,
  goalKind: z.enum(STRICT_GOAL_KINDS),
  source: z.enum(["task", "onboarding", "next_goal", "iorbit"]),
  idempotencyKey,
}).strict();
export const planIntakeCreateRequestSchema = planIntakeCreateRequestObject as z.ZodType<PlanIntakeCreateRequest>;

export const planIntakeBlockRequestObject = z.object({
  block: z.enum(["me", "team", "purpose"]),
  me: z.object({ stance: z.enum(["owner", "cofounder", "employee", "individual"]), wants: z.string().trim().min(1).max(300) }).strict().optional(),
  team: z.object({
    mode: z.enum(["solo", "team"]),
    members: z.array(z.object({ memberId: z.string().min(1).max(120), capabilities: capabilityIds, otherCapabilities, relation: relation.nullable() }).strict()).min(1).max(12),
  }).strict().optional(),
  purpose: z.object({ selectedLevel: z.number().int().min(1).max(4) }).strict().optional(),
  expectedUpdatedAt: z.string().min(1).max(64),
  idempotencyKey,
}).strict().refine((body) => Boolean(body[body.block]), { message: "the confirmed block must carry its value" });
export const planIntakeBlockRequestSchema = planIntakeBlockRequestObject as unknown as z.ZodType<PlanIntakeBlockRequest>;

export const planIntakeMembersRequestObject = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("network"), contactIds: z.array(z.string().min(1).max(200)).min(1).max(5), idempotencyKey }).strict(),
  z.object({
    mode: z.literal("manual"),
    name: z.string().trim().min(1).max(80),
    relation,
    capabilities: capabilityIds,
    otherCapabilities,
    alsoAddToNetwork: z.boolean(),
    idempotencyKey,
  }).strict(),
]);
export const planIntakeMembersRequestSchema = planIntakeMembersRequestObject as z.ZodType<PlanIntakeMembersRequest>;

export const planIntakeLadderRequestObject = z.object({ wants: z.string().trim().min(1).max(300), idempotencyKey }).strict();
export const planIntakeLadderRequestSchema = planIntakeLadderRequestObject as z.ZodType<PlanIntakeLadderRequest>;

export const planFlowStepRequestObject = z.object({ idempotencyKey }).strict();
export const planFlowStepRequestSchema = planFlowStepRequestObject as z.ZodType<PlanFlowStepRequest>;

export const planIntakeAnswersRequestObject = z.object({
  answers: z.array(z.object({
    questionId: z.string().min(1).max(10),
    values: z.array(z.string().min(1).max(60)).max(8),
    text: z.string().trim().max(300).nullable(),
  }).strict()).max(5),
  idempotencyKey,
}).strict();
export const planIntakeAnswersRequestSchema = planIntakeAnswersRequestObject as z.ZodType<PlanIntakeAnswersRequest>;

export const planIntakePremiseRequestObject = z.object({ key: z.string().min(1).max(40), value: z.string().trim().min(1).max(300), idempotencyKey }).strict();
export const planIntakePremiseRequestSchema = planIntakePremiseRequestObject as z.ZodType<PlanIntakePremiseRequest>;

export const planDraftFixRequestObject = z.object({ text: z.string().trim().min(1).max(1000), idempotencyKey }).strict();
export const planDraftFixRequestSchema = planDraftFixRequestObject as z.ZodType<PlanDraftFixRequest>;

export const planDraftManualEditRequestObject = z.object({
  expectedRevision: z.string().min(1).max(64),
  steps: z.array(z.object({
    key: z.string().min(1).max(40).nullable(),
    title: z.string().trim().min(1).max(120),
    doneCriteria: z.string().trim().max(300),
    personTypeKeys: z.array(z.string().min(1).max(40)).max(10),
  }).strict()).min(1).max(7),
  personTypes: z.array(z.object({
    key: z.string().min(1).max(40).nullable(),
    slot: z.string().min(1).max(40).optional(),
    targetCount: z.number().int().min(1).max(5),
    allocation: z.number().int().min(0).max(100),
  }).strict()).min(1).max(8),
  event: z.object({ targetCount: z.number().int().min(1).max(10), allocation: z.number().int().min(0).max(100) }).strict(),
  idempotencyKey,
}).strict();
export const planDraftManualEditRequestSchema = planDraftManualEditRequestObject as z.ZodType<PlanDraftManualEditRequest>;
