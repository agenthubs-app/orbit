import { NextResponse } from "next/server";

import { resolveAuthenticatedApiActor, type AuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { createProfileIntroDraftService, type ProfileIntroDraftResult, type ProfileIntroDraftServiceOptions } from "../../../../features/profile/intro-draft-service";
import { resolveProfileIntroQuota } from "../../../../features/profile/intro-onboarding-quota-factory";
import { resolveProfileOnboardingProgressService } from "../../../../features/profile/onboarding-progress-factory";
import { isSampleWrite } from "../../../../features/guide/sample-write";
import type { ProfileIntroQuotaService } from "../../../../features/profile/intro-onboarding-quota";
import type { ProfileOnboardingProgressService } from "../../../../features/profile/onboarding-progress";
import type { AiQuotaGate } from "../../../../features/ai-quota/gate";
import { aiMonthlyLimitResponse, configuredDraftAssistLedger, createDraftAssistRunner } from "../../../../features/ai-quota/draft-assist";

type Language = "zh" | "en" | "ja";
const error = (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { status });
function resultStatus(result: ProfileIntroDraftResult): number {
  if (result.success === true) return 200;
  return result.error.code === "PROFILE_REQUIRED" ? 409 : result.error.code === "MODEL_REQUEST_FAILED" ? 503 : 422;
}

function publicResult(result: ProfileIntroDraftResult): ProfileIntroDraftResult {
  if (result.success === true) return result;
  if (result.error.code === "ACTOR_REQUIRED") return { success: false, error: { code: "ACTOR_REQUIRED", message: "Sign in before generating an introduction." } };
  if (result.error.code === "PROFILE_REQUIRED") return { success: false, error: { code: "PROFILE_REQUIRED", message: "Save your name and basic profile before generating an introduction." } };
  return { success: false, error: { code: "MODEL_REQUEST_FAILED", message: "The introduction could not be generated. Please retry later." } };
}

function draftResponse(result: ProfileIntroDraftResult): Response {
  const safe = publicResult(result);
  return NextResponse.json(safe, { status: resultStatus(safe) });
}

export function createProfileIntroDraftHandler(dependencies: {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  flowForActor?: (actorId: string) => ProfileOnboardingProgressService | null;
  quotaForActor?: (actorId: string) => ProfileIntroQuotaService | null;
  createDraftService?: (options: ProfileIntroDraftServiceOptions) => ReturnType<typeof createProfileIntroDraftService>;
  /** 2026-11-27 隐藏月上限：草稿类共用的 AI 账本（draft_assist）；null = 不记账。 */
  draftLedger?: () => AiQuotaGate | null;
} = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const flowForActor = dependencies.flowForActor ?? resolveProfileOnboardingProgressService;
  const quotaForActor = dependencies.quotaForActor ?? resolveProfileIntroQuota;
  const createDraftService = dependencies.createDraftService ?? createProfileIntroDraftService;
  const draftLedger = dependencies.draftLedger ?? configuredDraftAssistLedger;
  /** One generation = one draft_assist operation; `limited` = the monthly fuse kept the model call off. */
  async function generate(actorId: string, language: Language, options: ProfileIntroDraftServiceOptions = {}): Promise<{ result: ProfileIntroDraftResult; limited: { cap: number | null; retryOn: string | null } | null }> {
    const ledgered = createDraftAssistRunner({ actorId, gate: draftLedger(), kind: "intro" });
    try {
      const result = await createDraftService({ ...options, runModel: ledgered.run }).createDraft({ actorId, language });
      await ledgered.finish(result.success === true ? "succeeded" : "failed");
      return { limited: ledgered.refusal() === "quota" ? ledgered.quotaDetail() ?? { cap: null, retryOn: null } : null, result };
    } catch (caught) {
      await ledgered.finish("failed");
      throw caught;
    }
  }
  return async function POST(request: Request): Promise<Response> {
    const actor = await resolveActor();
    if (!actor?.id) return error(401, "ACTOR_REQUIRED", "Sign in before generating an introduction.");
    if (isSampleWrite(request, actor.id)) return error(403, "SAMPLE_READ_ONLY", "Sample data cannot generate an introduction.");
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return error(400, "VALIDATION_ERROR", "Expected a request object.");
      body = parsed as Record<string, unknown>;
    } catch {
      return error(400, "VALIDATION_ERROR", "Request body must be JSON.");
    }
    if (Object.keys(body).some((key) => key !== "language" && key !== "idempotencyKey")) return error(400, "VALIDATION_ERROR", "Unknown intro draft field.");
    if (body.language !== undefined && body.language !== "zh" && body.language !== "en" && body.language !== "ja") return error(400, "VALIDATION_ERROR", "Unsupported draft language.");
    const language = (body.language ?? "zh") as Language;
    const key = body.idempotencyKey;
    if (key !== undefined && (typeof key !== "string" || !key.trim() || key.length > 128)) return error(400, "VALIDATION_ERROR", "Invalid idempotency key.");
    try {
      const flowService = flowForActor(actor.id);
      if (!flowService) return error(503, "SERVICE_UNAVAILABLE", "Onboarding progress is unavailable.");
      const flow = await flowService.get();
      if (!flow) {
        // Existing accounts without a first onboarding flow keep the settings draft path.
        const direct = await generate(actor.id, language);
        return direct.limited ? aiMonthlyLimitResponse(direct.limited) : draftResponse(direct.result);
      }
      if (typeof key !== "string" && flow.finishedAt) {
        const direct = await generate(actor.id, language);
        return direct.limited ? aiMonthlyLimitResponse(direct.limited) : draftResponse(direct.result);
      }
      if (typeof key !== "string") return error(400, "VALIDATION_ERROR", "An idempotency key is required during onboarding.");
      const quota = quotaForActor(actor.id);
      if (!quota) return error(503, "SERVICE_UNAVAILABLE", "Intro draft quota is unavailable.");
      const reservation = await quota.reserve(key, language);
      if (reservation.kind === "limit") return error(409, "INTRO_LIMIT_REACHED", "Three introduction drafts have already been generated. You can write your own.");
      if (reservation.kind === "busy") return error(409, "INTRO_REQUEST_IN_PROGRESS", "This draft request is still running.");
      if (reservation.kind === "success" || reservation.kind === "failure") {
        return draftResponse(reservation.result);
      }
      let result: ProfileIntroDraftResult;
      let limited: { cap: number | null; retryOn: string | null } | null = null;
      try {
        ({ limited, result } = await generate(actor.id, language, { beforeModelCall: () => quota.noteModelCall(key) }));
      } catch {
        result = { success: false as const, error: { code: "MODEL_REQUEST_FAILED" as const, message: "The draft could not be generated. Start a new request to retry." } };
      }
      const persisted = await quota.complete(key, result);
      // 隐藏月上限：这次没有调用模型；记下失败（不占引导的 3 次），回月上限的 429（客户端换新键再试）。
      return limited ? aiMonthlyLimitResponse(limited) : draftResponse(persisted);
    } catch (caught) {
      if (caught instanceof Error && caught.message === "MUTATION_CONFLICT") return error(409, "IDEMPOTENCY_CONFLICT", "This request key was already used for a different draft.");
      return error(503, "SERVICE_UNAVAILABLE", "The draft request could not be saved. Please retry later.");
    }
  };
}

