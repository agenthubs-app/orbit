import { NextResponse } from "next/server";

import { createConfiguredEntityDraftService } from "../../../../features/orbit-ai/entity-drafts/service-factory";
import type {
  EntityDraft,
  EntityDraftFields,
} from "../../../../features/orbit-ai/entity-drafts/contract";
import type { EntityDraftService } from "../../../../features/orbit-ai/entity-drafts/service";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";

/**
 * Sprint 0085: the only way a drafted record becomes a real one.
 *
 * Confirming is a user action, so it is an authenticated request with the draft
 * id in the path — not something a model can reach by emitting the right words.
 */

export interface EntityDraftRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  serviceFor?: (actorId: string) => EntityDraftService | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFields(value: unknown): EntityDraftFields | null {
  if (!isRecord(value)) return null;
  const fields: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string" || !raw.trim() || raw.length > 2000) return null;
    fields[key.trim()] = raw.trim();
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/** The card renders this; it never needs the actor id back. */
export function entityDraftView(draft: EntityDraft) {
  return {
    createdAt: draft.createdAt,
    draftId: draft.draftId,
    fields: draft.fields,
    kind: draft.kind,
    revision: draft.revision,
    sourceRefs: draft.sourceRefs,
    state: draft.state,
    updatedAt: draft.updatedAt,
    ...(draft.createdRecordId ? { createdRecordId: draft.createdRecordId } : {}),
    ...(draft.failureReason ? { failureReason: draft.failureReason } : {}),
  };
}

function json(mode: ReturnType<typeof resolveFeatureMode>, body: unknown, status: number) {
  return NextResponse.json(body, { headers: runtimeBoundaryHeaders(mode), status });
}

function refused(
  mode: ReturnType<typeof resolveFeatureMode>,
  code: "NOT_FOUND" | "VALIDATION_ERROR" | "SERVICE_UNAVAILABLE",
  message: string,
  context?: Readonly<Record<string, string>>,
) {
  return json(
    mode,
    failure(new AppError(code, message), { mode, ...context }),
    getHttpStatusForAppErrorCode(code),
  );
}

export function createEntityDraftRouteHandlers(
  dependencies: EntityDraftRouteDependencies = {},
) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const serviceFor = dependencies.serviceFor ?? createConfiguredEntityDraftService;

  async function withService(
    run: (service: EntityDraftService, actorId: string) => Promise<Response>,
  ): Promise<Response> {
    const mode = resolveFeatureMode();
    const actor = await resolveActor();
    if (!actor) return authenticatedApiActorRequiredResponse(mode);
    const service = serviceFor(actor.id);
    if (!service) {
      return refused(mode, "SERVICE_UNAVAILABLE", "Entity draft storage is not configured.");
    }
    return run(service, actor.id);
  }

  return {
    /** The draft this conversation is waiting on, so a reopened chat still shows its card. */
    async GET(request: Request): Promise<Response> {
      return withService(async (service, actorId) => {
        const mode = resolveFeatureMode();
        const conversationId = new URL(request.url).searchParams.get("conversationId")?.trim();
        if (!conversationId) {
          return refused(mode, "VALIDATION_ERROR", "conversationId is required.");
        }
        const pending = await service.pending({ actorId, conversationId });
        return json(mode, success({ draft: pending ? entityDraftView(pending) : null }), 200);
      });
    },

    async POST(request: Request, draftId: string): Promise<Response> {
      return withService(async (service, actorId) => {
        const mode = resolveFeatureMode();
        const body: unknown = await request.json().catch(() => null);
        const action = isRecord(body) ? body.action : null;
        const now = new Date().toISOString();

        if (action === "cancel") {
          const cancelled = await service.cancel({ actorId, draftId, now });
          return cancelled
            ? json(mode, success({ draft: entityDraftView(cancelled) }), 200)
            : refused(mode, "NOT_FOUND", "There is no draft awaiting confirmation.");
        }

        if (action === "revise") {
          const fields = readFields(isRecord(body) ? body.fields : null);
          if (!fields) return refused(mode, "VALIDATION_ERROR", "fields must be non-empty text.");
          const revised = await service.revise({ actorId, draftId, fields, now });
          return revised
            ? json(mode, success({ draft: entityDraftView(revised) }), 200)
            : refused(mode, "NOT_FOUND", "There is no draft awaiting confirmation.");
        }

        if (action !== "confirm") {
          return refused(mode, "VALIDATION_ERROR", "action must be confirm, revise or cancel.");
        }

        const outcome = await service.confirm({ actorId, draftId, now });
        if (outcome.kind === "created") {
          return json(mode, success({ draft: entityDraftView(outcome.draft) }), 200);
        }
        if (outcome.kind === "not_pending") {
          return refused(mode, "NOT_FOUND", "There is no draft awaiting confirmation.");
        }
        if (outcome.kind === "unsupported") {
          return refused(
            mode, "SERVICE_UNAVAILABLE",
            `Creating a ${outcome.draft.kind} is not available yet.`,
            { entityDraftKind: outcome.draft.kind },
          );
        }
        // A refused write keeps the draft confirmable, so the card can show the
        // reason and offer a retry. It still answers with a failure status: a
        // 200 here would let a client that only reads the status believe the
        // record exists.
        return json(
          mode,
          failure(
            new AppError("SERVICE_UNAVAILABLE", outcome.reason),
            {
              entityDraftId: outcome.draft.draftId,
              entityDraftKind: outcome.draft.kind,
              entityDraftState: outcome.draft.state,
              entityDraftWriteFailed: "true",
              mode,
            },
          ),
          getHttpStatusForAppErrorCode("SERVICE_UNAVAILABLE"),
        );
      });
    },
  };
}
