import { NextResponse } from "next/server";

import {
  EVENT_ADMISSION_REVIEW_BUCKETS,
  EventAdmissionError,
  type EventAdmissionReviewBucket,
  type EventAdmissionReviewCursor,
} from "../../../../../../features/events/admission/contract";
import { createConfiguredEventAdmissionService } from "../../../../../../features/events/admission/runtime";
import type { EventAdmissionService } from "../../../../../../features/events/admission/service";
import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../../shared/api/envelope";
import {
  AppError,
  getHttpStatusForAppErrorCode,
} from "../../../../../../shared/errors/app-error";
import {
  withEventCapabilityAccess,
  type EventCapabilityAccessDependencies,
} from "../../event-capability-access";

export interface EventAdmissionReviewRouteContext {
  params: Promise<{ id: string }>;
}

export interface EventAdmissionReviewDetailRouteContext {
  params: Promise<{ actorId: string; id: string }>;
}

export interface EventAdmissionReviewHandlerDependencies
  extends EventCapabilityAccessDependencies {
  createService?: () => EventAdmissionService | null;
}

function serviceFor(
  dependencies: EventAdmissionReviewHandlerDependencies,
): EventAdmissionService {
  const service = (
    dependencies.createService ?? createConfiguredEventAdmissionService
  )();
  if (!service) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Admission review is temporarily unavailable.",
    );
  }
  return service;
}

function admissionErrorToAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (!(error instanceof EventAdmissionError)) {
    return new AppError("INTERNAL_ERROR", "Admission review failed.", {
      cause: error,
    });
  }
  switch (error.code) {
    case "FORBIDDEN":
      return new AppError("FORBIDDEN", "Admission review access is denied.", {
        cause: error,
      });
    case "NOT_CONFIGURED":
      return new AppError("NOT_FOUND", "Admission review is not configured.", {
        cause: error,
      });
    case "CAPACITY_FULL":
    case "ACTIVATION_BLOCKED":
    case "INVALID_TRANSITION":
    case "VERSION_CONFLICT":
    case "WINDOW_CLOSED":
      return new AppError("CONFLICT", error.message, { cause: error });
    case "DATA_INVALID":
      return new AppError(
        "SERVICE_UNAVAILABLE",
        "Admission review data is temporarily unavailable.",
        { cause: error },
      );
  }
}

function errorResponse(error: unknown, mode: Parameters<typeof runtimeBoundaryHeaders>[0]) {
  const appError = admissionErrorToAppError(error);
  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      privacy: "reviewer-and-event-scoped",
      service: "event-admission-review",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
}

function validationError(): AppError {
  return new AppError("VALIDATION_ERROR", "Admission review request is invalid.");
}

function exactSearchParams(
  request: Request,
): { bucket: EventAdmissionReviewBucket; cursor: EventAdmissionReviewCursor | null; limit: number } {
  const params = new URL(request.url).searchParams;
  const allowed = new Set(["cursor", "limit", "view"]);
  if (
    [...params.keys()].some((key) => !allowed.has(key)) ||
    [...allowed].some((key) => params.getAll(key).length > 1)
  ) throw validationError();
  const rawBucket = params.get("view") ?? "pending";
  if (!EVENT_ADMISSION_REVIEW_BUCKETS.includes(rawBucket as EventAdmissionReviewBucket)) {
    throw validationError();
  }
  const rawLimit = params.get("limit") ?? "30";
  if (!/^\d{1,3}$/u.test(rawLimit)) throw validationError();
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw validationError();
  }
  const rawCursor = params.get("cursor");
  let cursor: EventAdmissionReviewCursor | null = null;
  if (rawCursor) {
    try {
      const decoded: unknown = JSON.parse(
        Buffer.from(rawCursor, "base64url").toString("utf8"),
      );
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        throw validationError();
      }
      const keys = Reflect.ownKeys(decoded);
      const value = decoded as Record<string, unknown>;
      if (
        keys.length !== 2 ||
        !keys.includes("actorId") ||
        !keys.includes("timestamp") ||
        typeof value.actorId !== "string" ||
        !value.actorId.trim() ||
        typeof value.timestamp !== "string" ||
        !Number.isFinite(Date.parse(value.timestamp))
      ) throw validationError();
      cursor = {
        actorId: value.actorId.trim(),
        timestamp: new Date(value.timestamp).toISOString(),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw validationError();
    }
  }
  return {
    bucket: rawBucket as EventAdmissionReviewBucket,
    cursor,
    limit,
  };
}

function encodedCursor(cursor: EventAdmissionReviewCursor | null): string | null {
  return cursor
    ? Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
    : null;
}

async function exactDecisionBody(request: Request): Promise<{
  decision: "approve" | "reject";
  expectedApplicationVersion: number;
}> {
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw validationError();
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw validationError();
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw validationError();
  }
  const keys = Reflect.ownKeys(raw);
  const body = raw as Record<string, unknown>;
  if (
    keys.length !== 2 ||
    !keys.includes("decision") ||
    !keys.includes("expectedApplicationVersion") ||
    (body.decision !== "approve" && body.decision !== "reject") ||
    typeof body.expectedApplicationVersion !== "number" ||
    !Number.isSafeInteger(body.expectedApplicationVersion) ||
    body.expectedApplicationVersion < 1
  ) throw validationError();
  return {
    decision: body.decision,
    expectedApplicationVersion: body.expectedApplicationVersion,
  };
}

function exactActorId(value: string): string {
  const actorId = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u.test(actorId)) {
    throw validationError();
  }
  return actorId;
}

export function createEventAdmissionReviewListGetHandler(
  dependencies: EventAdmissionReviewHandlerDependencies = {},
) {
  return withEventCapabilityAccess<EventAdmissionReviewRouteContext>(
    "admission.read",
    async function getAdmissionReviewList(request, _context, access) {
      try {
        const query = exactSearchParams(request);
        const page = await serviceFor(dependencies).listApplications(
          access.actor.id,
          { ...query, eventId: access.eventId },
        );
        return NextResponse.json(success({
          ...page,
          nextCursor: encodedCursor(page.nextCursor),
          view: query.bucket,
        }), { headers: runtimeBoundaryHeaders(access.mode) });
      } catch (error) {
        return errorResponse(error, access.mode);
      }
    },
    dependencies,
  );
}

export function createEventAdmissionReviewDetailGetHandler(
  dependencies: EventAdmissionReviewHandlerDependencies = {},
) {
  return withEventCapabilityAccess<EventAdmissionReviewDetailRouteContext>(
    "admission.read",
    async function getAdmissionReviewDetail(_request, context, access) {
      try {
        const actorId = exactActorId((await context.params).actorId);
        const application = await serviceFor(dependencies).getApplicationForReview(
          access.actor.id,
          access.eventId,
          actorId,
        );
        if (!application) {
          throw new AppError("NOT_FOUND", "Admission application was not found.");
        }
        return NextResponse.json(success(application), {
          headers: runtimeBoundaryHeaders(access.mode),
        });
      } catch (error) {
        return errorResponse(error, access.mode);
      }
    },
    dependencies,
  );
}

export function createEventAdmissionReviewDecisionPostHandler(
  dependencies: EventAdmissionReviewHandlerDependencies = {},
) {
  return withEventCapabilityAccess<EventAdmissionReviewDetailRouteContext>(
    "admission.decide",
    async function decideAdmissionApplication(request, context, access) {
      try {
        const actorId = exactActorId((await context.params).actorId);
        const body = await exactDecisionBody(request);
        const application = await serviceFor(dependencies).decideApplication(
          access.actor.id,
          {
            actorId,
            decision: body.decision,
            eventId: access.eventId,
            expectedApplicationVersion: body.expectedApplicationVersion,
          },
        );
        return NextResponse.json(success(application), {
          headers: runtimeBoundaryHeaders(access.mode),
        });
      } catch (error) {
        return errorResponse(error, access.mode);
      }
    },
    dependencies,
  );
}
