import { NextResponse } from "next/server";

import { resolveAuthenticatedApiActor, type AuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { createProfileIntroDraftService, type ProfileIntroDraftResult, type ProfileIntroDraftServiceOptions } from "../../../../features/profile/intro-draft-service";
import { resolveProfileIntroQuota } from "../../../../features/profile/intro-onboarding-quota-factory";
import { resolveProfileOnboardingProgressService } from "../../../../features/profile/onboarding-progress-factory";
import { isSampleWrite } from "../../../../features/guide/sample-write";
import type { ProfileIntroQuotaService } from "../../../../features/profile/intro-onboarding-quota";
import type { ProfileOnboardingProgressService } from "../../../../features/profile/onboarding-progress";

export const dynamic = "force-dynamic";
// One action can make up to three 45-second model attempts.
export const maxDuration = 180;

type Language = "zh" | "en" | "ja";
const error = (status: number, code: string, message: string) => NextResponse.json({ success: false, error: { code, message } }, { status });
function resultStatus(result: ProfileIntroDraftResult): number {
  if (result.success === true) return 200;
  return result.error.code === "PROFILE_REQUIRED" ? 409 : result.error.code === "MODEL_API_KEY_MISSING" ? 503 : 422;
}

export function createProfileIntroDraftHandler(dependencies: {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  flowForActor?: (actorId: string) => ProfileOnboardingProgressService | null;
  quotaForActor?: (actorId: string) => ProfileIntroQuotaService | null;
  createDraftService?: (options: ProfileIntroDraftServiceOptions) => ReturnType<typeof createProfileIntroDraftService>;
} = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const flowForActor = dependencies.flowForActor ?? resolveProfileOnboardingProgressService;
  const quotaForActor = dependencies.quotaForActor ?? resolveProfileIntroQuota;
  const createDraftService = dependencies.createDraftService ?? createProfileIntroDraftService;
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
        const direct = await createDraftService({}).createDraft({ actorId: actor.id, language });
        return NextResponse.json(direct, { status: resultStatus(direct) });
      }
      if (typeof key !== "string" && flow.finishedAt) {
        const direct = await createDraftService({}).createDraft({ actorId: actor.id, language });
        return NextResponse.json(direct, { status: resultStatus(direct) });
      }
      if (typeof key !== "string") return error(400, "VALIDATION_ERROR", "An idempotency key is required during onboarding.");
      const quota = quotaForActor(actor.id);
      if (!quota) return error(503, "SERVICE_UNAVAILABLE", "Intro draft quota is unavailable.");
      const reservation = await quota.reserve(key, language);
      if (reservation.kind === "limit") return error(409, "INTRO_LIMIT_REACHED", "Three introduction drafts have already been generated. You can write your own.");
      if (reservation.kind === "busy") return error(409, "INTRO_REQUEST_IN_PROGRESS", "This draft request is still running.");
      if (reservation.kind === "success" || reservation.kind === "failure") {
        return NextResponse.json(reservation.result, { status: resultStatus(reservation.result) });
      }
      let result;
      try {
        result = await createDraftService({ beforeModelCall: () => quota.noteModelCall(key) }).createDraft({ actorId: actor.id, language });
      } catch {
        result = { success: false as const, error: { code: "MODEL_REQUEST_FAILED" as const, message: "The draft could not be generated. Start a new request to retry." } };
      }
      const persisted = await quota.complete(key, result);
      return NextResponse.json(persisted, { status: resultStatus(persisted) });
    } catch (caught) {
      if (caught instanceof Error && caught.message === "MUTATION_CONFLICT") return error(409, "IDEMPOTENCY_CONFLICT", "This request key was already used for a different draft.");
      return error(503, "SERVICE_UNAVAILABLE", "The draft request could not be saved. Please retry later.");
    }
  };
}

export const POST = createProfileIntroDraftHandler();
