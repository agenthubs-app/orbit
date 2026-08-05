import { NextResponse } from "next/server";

import {
  EVENT_ADMISSION_MODES,
  EventAdmissionError,
  type ConfigureEventAdmissionPolicyInput,
  type EventAdmissionPolicy,
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

export interface EventAdmissionPolicyRouteContext {
  params: Promise<{ id: string }>;
}

export interface EventAdmissionPolicyHandlerDependencies
  extends EventCapabilityAccessDependencies {
  createService?: () => EventAdmissionService | null;
}

export interface EventAdmissionPolicyReadView {
  policy: EventAdmissionPolicy | null;
  policyVersion: number;
}

function serviceFor(
  dependencies: EventAdmissionPolicyHandlerDependencies,
): EventAdmissionService {
  const service = (
    dependencies.createService ?? createConfiguredEventAdmissionService
  )();
  if (!service) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Admission policy is temporarily unavailable.",
    );
  }
  return service;
}

function policyReadView(
  policy: EventAdmissionPolicy | null,
): EventAdmissionPolicyReadView {
  return {
    policy,
    policyVersion: policy?.policyVersion ?? 0,
  };
}

function policyErrorToAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (!(error instanceof EventAdmissionError)) {
    return new AppError(
      "INTERNAL_ERROR",
      "The admission policy request failed.",
      { cause: error },
    );
  }
  if (error.code === "FORBIDDEN") {
    return new AppError("FORBIDDEN", "Admission policy access is denied.", {
      cause: error,
    });
  }
  if (error.code === "NOT_CONFIGURED") {
    return new AppError(
      "CONFLICT",
      "Configure the event operations schedule before activating admission policy.",
      { cause: error },
    );
  }
  if (error.code === "ACTIVATION_BLOCKED") {
    return new AppError(
      "CONFLICT",
      "Complete the Event Operations schedule and legacy registration migration before activating admission policy.",
      { cause: error },
    );
  }
  if (error.code === "VERSION_CONFLICT") {
    return new AppError(
      "CONFLICT",
      "Admission policy changed. Refresh and try again.",
      { cause: error },
    );
  }
  if (
    error.code === "CAPACITY_FULL" ||
    error.code === "INVALID_TRANSITION" ||
    error.code === "WINDOW_CLOSED"
  ) {
    return new AppError("CONFLICT", "Admission policy cannot be saved now.", {
      cause: error,
    });
  }
  return new AppError(
    "SERVICE_UNAVAILABLE",
    "Admission policy data is temporarily unavailable.",
    { cause: error },
  );
}

function errorResponse(
  error: unknown,
  mode: Parameters<typeof runtimeBoundaryHeaders>[0],
): Response {
  const appError = policyErrorToAppError(error);
  return NextResponse.json(
    failure(appError, {
      boundary: "runtime",
      privacy: "event-policy-and-actor-scoped",
      service: "event-admission-policy",
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: getHttpStatusForAppErrorCode(appError.code),
    },
  );
}

function validationError(): AppError {
  return new AppError(
    "VALIDATION_ERROR",
    "Admission policy request is invalid.",
  );
}

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== "string" || !value) throw validationError();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw validationError();
  }
  return value;
}

async function exactPolicyBody(
  request: Request,
): Promise<Omit<ConfigureEventAdmissionPolicyInput, "eventId">> {
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") throw validationError();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw validationError();
  }
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  ) {
    throw validationError();
  }
  const keys = Reflect.ownKeys(raw);
  const expectedKeys = [
    "admissionMode",
    "capacity",
    "expectedPolicyVersion",
    "profileEditDeadlineAt",
    "registrationClosesAt",
    "registrationOpensAt",
    "waitlistEnabled",
  ] as const;
  if (
    keys.length !== expectedKeys.length ||
    !expectedKeys.every((key) => keys.includes(key))
  ) {
    throw validationError();
  }
  const body = raw as Record<string, unknown>;
  const value = (key: (typeof expectedKeys)[number]) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(body, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw validationError();
    }
    return descriptor.value;
  };

  const admissionMode = value("admissionMode");
  const capacity = value("capacity");
  const expectedPolicyVersion = value("expectedPolicyVersion");
  const registrationOpensAt = canonicalTimestamp(value("registrationOpensAt"));
  const registrationClosesAt = canonicalTimestamp(value("registrationClosesAt"));
  const profileEditDeadlineAt = canonicalTimestamp(
    value("profileEditDeadlineAt"),
  );
  const waitlistEnabled = value("waitlistEnabled");

  if (
    !EVENT_ADMISSION_MODES.includes(admissionMode as never) ||
    (capacity !== null &&
      (typeof capacity !== "number" ||
        !Number.isSafeInteger(capacity) ||
        capacity < 0)) ||
    typeof expectedPolicyVersion !== "number" ||
    !Number.isSafeInteger(expectedPolicyVersion) ||
    expectedPolicyVersion < 0 ||
    typeof waitlistEnabled !== "boolean" ||
    Date.parse(registrationOpensAt) >= Date.parse(registrationClosesAt) ||
    Date.parse(profileEditDeadlineAt) < Date.parse(registrationOpensAt) ||
    Date.parse(profileEditDeadlineAt) > Date.parse(registrationClosesAt)
  ) {
    throw validationError();
  }

  const normalizedCapacity = capacity === null ? null : capacity as number;
  const normalizedExpectedPolicyVersion = expectedPolicyVersion as number;

  return {
    admissionMode: admissionMode as ConfigureEventAdmissionPolicyInput["admissionMode"],
    capacity: normalizedCapacity,
    expectedPolicyVersion: normalizedExpectedPolicyVersion,
    profileEditDeadlineAt,
    registrationClosesAt,
    registrationOpensAt,
    waitlistEnabled,
  };
}

export function createEventAdmissionPolicyGetHandler(
  dependencies: EventAdmissionPolicyHandlerDependencies = {},
) {
  return withEventCapabilityAccess<EventAdmissionPolicyRouteContext>(
    "admission.read",
    async function getAdmissionPolicy(_request, _context, access) {
      try {
        const policy = await serviceFor(dependencies).getPolicy(access.eventId);
        return NextResponse.json(success(policyReadView(policy)), {
          headers: runtimeBoundaryHeaders(access.mode),
        });
      } catch (error) {
        return errorResponse(error, access.mode);
      }
    },
    dependencies,
  );
}

export function createEventAdmissionPolicyPutHandler(
  dependencies: EventAdmissionPolicyHandlerDependencies = {},
) {
  return withEventCapabilityAccess<EventAdmissionPolicyRouteContext>(
    "operations.configure",
    async function putAdmissionPolicy(request, _context, access) {
      try {
        const input = await exactPolicyBody(request);
        const policy = await serviceFor(dependencies).configurePolicy(
          access.actor.id,
          { ...input, eventId: access.eventId },
        );
        return NextResponse.json(success(policyReadView(policy)), {
          headers: runtimeBoundaryHeaders(access.mode),
        });
      } catch (error) {
        return errorResponse(error, access.mode);
      }
    },
    dependencies,
  );
}
