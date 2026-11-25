import { NextResponse } from "next/server";

import {
  ProfileOnboardingProgressError,
  type ProfileOnboardingProgressCommand,
  type ProfileOnboardingProgressService,
} from "../../../../features/profile/onboarding-progress";
import { resolveProfileOnboardingProgressService } from "../../../../features/profile/onboarding-progress-factory";
import { recordSignupFunnel } from "../../../../features/signup-funnel/record";
import { isSampleWrite } from "../../../../features/guide/sample-write";
import { failure, runtimeBoundaryHeaders, success } from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode, toAppError } from "../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type AuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

// 三步引导：①＝确认 1；②＝确认 2、3；③＝确认 4、5，再 finish。
const FUNNEL_STEP = { 1: "onboarding_step1", 3: "onboarding_step2", 5: "onboarding_step3" } as const;

function funnelStep(command: ProfileOnboardingProgressCommand) {
  if (command.action === "finish") return "onboarding_finished" as const;
  return command.action === "confirm" ? FUNNEL_STEP[command.screen as keyof typeof FUNNEL_STEP] ?? null : null;
}

const ALLOWED = new Set(["action", "screen", "expectedRevision", "mutationId"]);

function parseCommand(body: unknown): ProfileOnboardingProgressCommand {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("VALIDATION_ERROR", "Expected a command object.");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !ALLOWED.has(key))) throw new AppError("VALIDATION_ERROR", "Unknown command field.");
  if (typeof input.mutationId !== "string" || !input.mutationId.trim() || input.mutationId.length > 128 ||
      !(input.expectedRevision === null || typeof input.expectedRevision === "string")) {
    throw new AppError("VALIDATION_ERROR", "A mutation id and expected revision are required.");
  }
  const expectedRevision = input.expectedRevision as string | null;
  if (input.action === "confirm" && [1, 2, 3, 4, 5].includes(input.screen as number)) {
    return { action: "confirm", screen: input.screen as 1 | 2 | 3 | 4 | 5, expectedRevision, mutationId: input.mutationId };
  }
  if ((input.action === "initialize" || input.action === "defer" || input.action === "finish") && !("screen" in input)) {
    return { action: input.action, expectedRevision, mutationId: input.mutationId };
  }
  throw new AppError("VALIDATION_ERROR", "Invalid profile onboarding action or screen.");
}

export function createProfileOnboardingProgressRouteHandlers(dependencies: {
  resolveActor?: () => Promise<AuthenticatedApiActor | null>;
  serviceForActor?: (actorId: string) => ProfileOnboardingProgressService | null;
} = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const serviceForActor = dependencies.serviceForActor ?? resolveProfileOnboardingProgressService;
  async function run(operation: (service: ProfileOnboardingProgressService) => Promise<unknown>, request?: Request, done?: (actor: AuthenticatedApiActor) => void) {
    const mode = resolveFeatureMode();
    const headers = runtimeBoundaryHeaders(mode);
    try {
      const actor = await resolveActor();
      if (!actor?.id) return authenticatedApiActorRequiredResponse(mode);
      if (request && isSampleWrite(request, actor.id)) {
        return NextResponse.json(failure(new AppError("FORBIDDEN", "SAMPLE_READ_ONLY"), { reason: "SAMPLE_READ_ONLY" }), { headers, status: 403 });
      }
      const service = serviceForActor(actor.id);
      if (!service) throw new AppError("SERVICE_UNAVAILABLE", "Profile onboarding progress is unavailable.");
      const data = await operation(service);
      done?.(actor);
      return NextResponse.json(success(data), { headers, status: 200 });
    } catch (error) {
      const appError = error instanceof ProfileOnboardingProgressError
        ? new AppError(error.code === "REVISION_CONFLICT" || error.code === "MUTATION_CONFLICT" ? "CONFLICT" :
          error.code === "STORAGE_UNAVAILABLE" ? "SERVICE_UNAVAILABLE" : "VALIDATION_ERROR", error.message)
        : toAppError(error);
      return NextResponse.json(failure(appError), { headers, status: getHttpStatusForAppErrorCode(appError.code) });
    }
  }
  return {
    GET: () => run((service) => service.get()),
    POST: async (request: Request) => {
      let command: ProfileOnboardingProgressCommand | null = null;
      let invalid: unknown;
      try {
        command = parseCommand(await request.json());
      } catch (error) {
        invalid = error instanceof SyntaxError ? new AppError("VALIDATION_ERROR", "Request body must be JSON.") : error;
      }
      // Authentication always wins over a malformed body.
      return run((service) => {
        if (!command) throw invalid;
        return service.apply(command);
      }, request, (actor) => {
        const name = command ? funnelStep(command) : null;
        const userId = actor.userId;
        if (!name || !userId) return;
        const client = request.headers.get("x-orbit-platform") === "app" ? "app" : null;
        recordSignupFunnel((funnel) => funnel.step({ userId, name, client }));
      });
    },
  };
}
