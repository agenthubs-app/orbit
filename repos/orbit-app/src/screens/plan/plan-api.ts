// R23 / R24 / R25: the plan v2 endpoints as the App calls them (generation flow, overview,
// person-type page and their commands; R25 見直し, quota, 達成, next goals, goal edit,
// goal switching and 以前のプラン). Every request carries
// the screen language (`x-orbit-lang`) and `x-orbit-platform: app`, so the `href`s
// come back in App shape (`/plans/flow/<id>`, `/task?seg=plan&plan=<id>`). Answers
// are read through the synced zod schemas; failures become one small union the
// screens map to UI (UI-SPEC「常见错误原因 → 界面」). No AI runs here.
import { useMemo } from "react";
import { z, type ZodType } from "zod";

import type { OrbitApiClient } from "../../api/client";
import type {
  PlanAwardResult,
  PlanCandidateDecisionResult,
  PlanCommandResult,
  PlanConfirmResult,
  PlanIntroDraftResult,
  PlanPendingDecisionResult,
  PlanPersonTypeDetail,
  PlanProposalResult,
  PlanTalkedOfflineRequest,
  PlanTalkedOfflineResult,
  PlanV2Detail,
  PlanDraftView,
  PlanGoalKindResult,
  PlanIntakeBlockRequest,
  PlanIntakeCreateRequest,
  PlanIntakeListResponse,
  PlanIntakeMembersRequest,
  PlanIntakeView,
  PlanV2SummaryResponse,
  PlanDraftManualEditRequest,
  PlanAchievementView,
  PlanGoalEditRequest,
  PlanGoalEditResult,
  PlanLegacyDetail,
  PlanLegacyListResponse,
  PlanNextGoalsResponse,
  PlanOpenResult,
  PlanQuotaResponse,
  PlanReviewView,
} from "../../api/contract/plan-v2";
import { contactsListPath } from "../../api/endpoints";
import {
  planAwardResultSchema,
  planCandidateDecisionResultSchema,
  planCommandResultSchema,
  planIntroDraftResultSchema,
  planPendingDecisionResultSchema,
  planPersonTypeDetailSchema,
  planProposalResultSchema,
  planTalkedOfflineResultSchema,
  planV2DetailSchema,
  planConfirmResultSchema,
  planDraftViewSchema,
  planGoalKindResultSchema,
  planIntakeListResponseSchema,
  planIntakeViewSchema,
  planV2SummaryResponseSchema,
  planAchievementViewSchema,
  planGoalEditResultSchema,
  planLegacyDetailSchema,
  planLegacyListResponseSchema,
  planNextGoalsResponseSchema,
  planOpenResultSchema,
  planQuotaResponseSchema,
  planReviewViewSchema,
} from "../../api/schema/plan-v2";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { planFailureOf, type PlanResult } from "./plan-failure";
import type { ContactCandidate } from "./plan-model";

export type { PlanFailure, PlanResult } from "./plan-failure";

/** `POST …/v2/[planId]/achieve` answers `{ planId, achievedAt }` (no shared schema for it). */
const planAchievedSchema = z.object({ planId: z.string().min(1), achievedAt: z.string().min(1) });
export type PlanAchieved = z.infer<typeof planAchievedSchema>;

const PLANS = "/api/agent/plans";
const segment = (value: string) => encodeURIComponent(value);

export interface PlanApi {
  summary(): Promise<PlanResult<PlanV2SummaryResponse>>;
  listIntakes(): Promise<PlanResult<PlanIntakeListResponse>>;
  goalKind(text: string): Promise<PlanResult<PlanGoalKindResult>>;
  createIntake(body: PlanIntakeCreateRequest): Promise<PlanResult<PlanIntakeView>>;
  getIntake(intakeId: string): Promise<PlanResult<PlanIntakeView>>;
  retryBackground(intakeId: string, idempotencyKey: string): Promise<PlanResult<PlanIntakeView>>;
  confirmBlock(intakeId: string, body: PlanIntakeBlockRequest): Promise<PlanResult<PlanIntakeView>>;
  addMembers(intakeId: string, body: PlanIntakeMembersRequest): Promise<PlanResult<PlanIntakeView>>;
  ladder(intakeId: string, wants: string, idempotencyKey: string): Promise<PlanResult<PlanIntakeView>>;
  questions(intakeId: string, idempotencyKey: string): Promise<PlanResult<PlanIntakeView>>;
  answers(intakeId: string, answers: { questionId: string; values: string[]; text: string | null }[], idempotencyKey: string): Promise<PlanResult<PlanIntakeView>>;
  premise(intakeId: string, key: string, value: string, idempotencyKey: string): Promise<PlanResult<PlanIntakeView>>;
  makeDraft(intakeId: string, idempotencyKey: string): Promise<PlanResult<PlanDraftView>>;
  getDraft(draftId: string): Promise<PlanResult<PlanDraftView>>;
  fix(draftId: string, text: string, idempotencyKey: string): Promise<PlanResult<PlanDraftView>>;
  confirm(draftId: string, idempotencyKey: string): Promise<PlanResult<PlanConfirmResult>>;
  manualEdit(draftId: string, body: PlanDraftManualEditRequest): Promise<PlanResult<PlanConfirmResult>>;
  /** 人脈から選ぶ: the existing contacts list search (id, name, company, role, tags only). */
  searchContacts(query: string): Promise<PlanResult<ContactCandidate[]>>;
  // R24: the overview, the person-type page and their commands (UI-SPEC「接口」).
  overview(planId: string): Promise<PlanResult<PlanV2Detail>>;
  typeDetail(planId: string, itemId: string): Promise<PlanResult<PlanPersonTypeDetail>>;
  award(planId: string, itemId: string, contactId: string, idempotencyKey: string): Promise<PlanResult<PlanAwardResult>>;
  talkedOffline(planId: string, itemId: string, body: PlanTalkedOfflineRequest): Promise<PlanResult<PlanTalkedOfflineResult>>;
  undoAward(planId: string, awardLogId: string, idempotencyKey: string): Promise<PlanResult<PlanCommandResult>>;
  skip(planId: string, itemId: string, idempotencyKey: string): Promise<PlanResult<PlanCommandResult>>;
  unskip(planId: string, itemId: string, idempotencyKey: string): Promise<PlanResult<PlanCommandResult>>;
  completeStep(planId: string, stepKey: string, idempotencyKey: string): Promise<PlanResult<PlanCommandResult>>;
  reopenStep(planId: string, stepKey: string, idempotencyKey: string): Promise<PlanResult<PlanCommandResult>>;
  decideCandidate(planId: string, itemId: string, contactId: string, decision: "accept" | "dismiss", idempotencyKey: string): Promise<PlanResult<PlanCandidateDecisionResult>>;
  proposal(planId: string, itemId: string, contactId: string, slots: readonly string[], idempotencyKey: string): Promise<PlanResult<PlanProposalResult>>;
  introDraft(planId: string, itemId: string, viaContactId: string, idempotencyKey: string): Promise<PlanResult<PlanIntroDraftResult>>;
  acceptPending(id: string, idempotencyKey: string, answered?: readonly number[]): Promise<PlanResult<PlanPendingDecisionResult>>;
  dismissPending(id: string, idempotencyKey: string): Promise<PlanResult<PlanPendingDecisionResult>>;
  // R25: 見直し, quota, 達成, next goals, goal edit, switching, 以前のプラン (UI-SPEC「接口」).
  quota(): Promise<PlanResult<PlanQuotaResponse>>;
  startReview(planId: string, idempotencyKey: string): Promise<PlanResult<PlanReviewView>>;
  currentReview(planId: string): Promise<PlanResult<PlanReviewView>>;
  getReview(draftId: string): Promise<PlanResult<PlanReviewView>>;
  reviewFix(draftId: string, premise: readonly { key: string; value: string }[], text: string | null, idempotencyKey: string): Promise<PlanResult<PlanReviewView>>;
  toggleChange(draftId: string, changeId: string, accepted: boolean, idempotencyKey: string): Promise<PlanResult<PlanReviewView>>;
  openManualEdit(planId: string, idempotencyKey: string): Promise<PlanResult<PlanDraftView>>;
  achieve(planId: string, expectedRevision: number, idempotencyKey: string): Promise<PlanResult<PlanAchieved>>;
  achievement(planId: string): Promise<PlanResult<PlanAchievementView>>;
  nextGoals(planId: string): Promise<PlanResult<PlanNextGoalsResponse>>;
  editGoal(planId: string, body: PlanGoalEditRequest): Promise<PlanResult<PlanGoalEditResult>>;
  openGoal(planId: string): Promise<PlanResult<PlanOpenResult>>;
  legacyList(): Promise<PlanResult<PlanLegacyListResponse>>;
  legacyDetail(planId: string): Promise<PlanResult<PlanLegacyDetail>>;
}

type Method = "get" | "post" | "patch" | "delete";

export function createPlanApi(client: OrbitApiClient, language: string): PlanApi {
  const headers = { "x-orbit-lang": language, "x-orbit-platform": "app" };
  async function call<T>(method: Method, path: string, schema: ZodType<T>, body?: unknown): Promise<PlanResult<T>> {
    const result = await client[method]<unknown>(path, body === undefined ? { headers } : { body, headers });
    if (!result.success) return { failure: planFailureOf(result), ok: false };
    const parsed = schema.safeParse(result.data);
    if (!parsed.success) return { failure: { kind: "other", message: "", reason: "INVALID_RESPONSE" }, ok: false };
    return { data: parsed.data, ok: true, status: result.status };
  }
  const intake = (id: string, rest = "") => `${PLANS}/intakes/${segment(id)}${rest}`;
  const draft = (id: string, rest = "") => `${PLANS}/drafts/${segment(id)}${rest}`;
  const plan = (id: string, rest = "") => `${PLANS}/v2/${segment(id)}${rest}`;
  const type = (id: string, itemId: string, rest = "") => `${PLANS}/v2/${segment(id)}/types/${segment(itemId)}${rest}`;
  const pending = (id: string, rest: string) => `${PLANS}/v2/pending/${segment(id)}${rest}`;
  return {
    achieve: (id, expectedRevision, idempotencyKey) => call("post", plan(id, "/achieve"), planAchievedSchema, { expectedRevision, idempotencyKey }),
    achievement: (id) => call("get", plan(id, "/achievement"), planAchievementViewSchema),
    currentReview: (id) => call("get", plan(id, "/reviews/current"), planReviewViewSchema),
    editGoal: (id, body) => call("patch", plan(id, "/goal"), planGoalEditResultSchema, body),
    getReview: (id) => call("get", draft(id, "/review"), planReviewViewSchema),
    legacyDetail: (id) => call("get", `${PLANS}/legacy/${segment(id)}`, planLegacyDetailSchema),
    legacyList: () => call("get", `${PLANS}/legacy`, planLegacyListResponseSchema),
    nextGoals: (id) => call("get", plan(id, "/next-goals"), planNextGoalsResponseSchema),
    openGoal: (id) => call("post", plan(id, "/open"), planOpenResultSchema, {}),
    openManualEdit: (id, idempotencyKey) => call("post", plan(id, "/manual-edit"), planDraftViewSchema, { idempotencyKey }),
    quota: () => call("get", `${PLANS}/v2/quota`, planQuotaResponseSchema),
    reviewFix: (id, premise, text, idempotencyKey) => call("post", draft(id, "/review/fix"), planReviewViewSchema, { idempotencyKey, premise, text }),
    startReview: (id, idempotencyKey) => call("post", plan(id, "/reviews"), planReviewViewSchema, { idempotencyKey }),
    toggleChange: (id, changeId, accepted, idempotencyKey) => call("post", draft(id, `/changes/${segment(changeId)}/toggle`), planReviewViewSchema, { accepted, idempotencyKey }),
    acceptPending: (id, idempotencyKey, answered) => call("post", pending(id, "/accept"), planPendingDecisionResultSchema, answered ? { answered, idempotencyKey } : { idempotencyKey }),
    award: (id, itemId, contactId, idempotencyKey) => call("post", type(id, itemId, "/awards"), planAwardResultSchema, { basis: "talked", contactId, idempotencyKey }),
    completeStep: (id, stepKey, idempotencyKey) => call("post", plan(id, `/steps/${segment(stepKey)}/complete`), planCommandResultSchema, { idempotencyKey }),
    decideCandidate: (id, itemId, contactId, decision, idempotencyKey) => call("post", type(id, itemId, `/candidates/${segment(contactId)}/decision`), planCandidateDecisionResultSchema, { decision, idempotencyKey }),
    dismissPending: (id, idempotencyKey) => call("post", pending(id, "/dismiss"), planPendingDecisionResultSchema, { idempotencyKey }),
    introDraft: (id, itemId, viaContactId, idempotencyKey) => call("post", type(id, itemId, "/intro-drafts"), planIntroDraftResultSchema, { idempotencyKey, viaContactId }),
    overview: (id) => call("get", plan(id), planV2DetailSchema),
    proposal: (id, itemId, contactId, slots, idempotencyKey) => call("post", type(id, itemId, "/proposals"), planProposalResultSchema, { contactId, idempotencyKey, slots }),
    reopenStep: (id, stepKey, idempotencyKey) => call("delete", plan(id, `/steps/${segment(stepKey)}/complete`), planCommandResultSchema, { idempotencyKey }),
    skip: (id, itemId, idempotencyKey) => call("post", type(id, itemId, "/skip"), planCommandResultSchema, { idempotencyKey }),
    talkedOffline: (id, itemId, body) => call("post", type(id, itemId, "/talked-offline"), planTalkedOfflineResultSchema, body),
    typeDetail: (id, itemId) => call("get", type(id, itemId), planPersonTypeDetailSchema),
    undoAward: (id, awardLogId, idempotencyKey) => call("post", plan(id, `/awards/${segment(awardLogId)}/undo`), planCommandResultSchema, { idempotencyKey }),
    unskip: (id, itemId, idempotencyKey) => call("delete", type(id, itemId, "/skip"), planCommandResultSchema, { idempotencyKey }),
    addMembers: (id, body) => call("post", intake(id, "/members"), planIntakeViewSchema, body),
    answers: (id, answers, idempotencyKey) => call("post", intake(id, "/answers"), planIntakeViewSchema, { answers, idempotencyKey }),
    confirm: (id, idempotencyKey) => call("post", draft(id, "/confirm"), planConfirmResultSchema, { idempotencyKey }),
    confirmBlock: (id, body) => call("patch", intake(id), planIntakeViewSchema, body),
    createIntake: (body) => call("post", `${PLANS}/intakes`, planIntakeViewSchema, body),
    fix: (id, text, idempotencyKey) => call("post", draft(id, "/fix"), planDraftViewSchema, { idempotencyKey, text }),
    getDraft: (id) => call("get", draft(id), planDraftViewSchema),
    getIntake: (id) => call("get", intake(id), planIntakeViewSchema),
    goalKind: (text) => call("post", `${PLANS}/goal-kind`, planGoalKindResultSchema, { text }),
    ladder: (id, wants, idempotencyKey) => call("post", intake(id, "/ladder"), planIntakeViewSchema, { idempotencyKey, wants }),
    listIntakes: () => call("get", `${PLANS}/intakes`, planIntakeListResponseSchema),
    makeDraft: (id, idempotencyKey) => call("post", intake(id, "/draft"), planDraftViewSchema, { idempotencyKey }),
    manualEdit: (id, body) => call("post", draft(id, "/manual-edit"), planConfirmResultSchema, body),
    premise: (id, key, value, idempotencyKey) => call("patch", intake(id, "/premise"), planIntakeViewSchema, { idempotencyKey, key, value }),
    questions: (id, idempotencyKey) => call("post", intake(id, "/questions"), planIntakeViewSchema, { idempotencyKey }),
    retryBackground: (id, idempotencyKey) => call("post", intake(id, "/background"), planIntakeViewSchema, { idempotencyKey }),
    async searchContacts(query) {
      const result = await client.get<unknown>(contactsListPath({ query }), { headers });
      if (!result.success) return { failure: planFailureOf(result), ok: false };
      return { data: contactCandidatesOf(result.data), ok: true, status: result.status };
    },
    summary: () => call("get", `${PLANS}/v2/summary`, planV2SummaryResponseSchema),
  };
}

/** Reads only what the picker shows (id, name, company, role, tags) from the contacts list answer. */
export function contactCandidatesOf(data: unknown): ContactCandidate[] {
  const contacts = (data as { contacts?: unknown } | null)?.contacts;
  if (!Array.isArray(contacts)) return [];
  return contacts.flatMap((item) => {
    const record = item as Record<string, unknown> | null;
    if (!record || typeof record.id !== "string" || typeof record.displayName !== "string") return [];
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return [{
      id: record.id,
      name: record.displayName,
      organization: text(record.organization),
      role: text(record.role),
      tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : [],
    }];
  });
}

export function usePlanApi(): PlanApi {
  const client = useOrbitApiClient();
  const { language } = useOrbitLocale();
  return useMemo(() => createPlanApi(client, language), [client, language]);
}
