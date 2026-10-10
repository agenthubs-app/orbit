// R23: the plan v2 generation endpoints as the App calls them. Every request carries
// the screen language (`x-orbit-lang`) and `x-orbit-platform: app`, so the `href`s
// come back in App shape (`/plans/flow/<id>`, `/task?seg=plan&plan=<id>`). Answers
// are read through the synced zod schemas; failures become one small union the
// screens map to UI (UI-SPEC「常见错误原因 → 界面」). No AI runs here.
import { useMemo } from "react";
import type { ZodType } from "zod";

import type { OrbitApiClient } from "../../api/client";
import type {
  PlanConfirmResult,
  PlanDraftView,
  PlanGoalKindResult,
  PlanIntakeBlockRequest,
  PlanIntakeCreateRequest,
  PlanIntakeListResponse,
  PlanIntakeMembersRequest,
  PlanIntakeView,
  PlanV2SummaryResponse,
  PlanDraftManualEditRequest,
} from "../../api/contract/plan-v2";
import { contactsListPath } from "../../api/endpoints";
import {
  planConfirmResultSchema,
  planDraftViewSchema,
  planGoalKindResultSchema,
  planIntakeListResponseSchema,
  planIntakeViewSchema,
  planV2SummaryResponseSchema,
} from "../../api/schema/plan-v2";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { planFailureOf, type PlanResult } from "./plan-failure";
import type { ContactCandidate } from "./plan-model";

export type { PlanFailure, PlanResult } from "./plan-failure";

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
}

type Method = "get" | "post" | "patch";

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
  return {
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
