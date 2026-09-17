import { NextResponse } from "next/server";

import {
  failure,
  runtimeBoundaryHeaders,
  success,
} from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { AppError } from "../../../../../shared/errors/app-error";
import type {
  EventParticipantProfileAnswers,
  EventParticipantProfileField,
  EventRegistrationAction,
} from "../../../../../features/events/registration/contract";
import type { EventExperiencePublishedQuestionSet } from "../../../../../features/events/experience/contract";
import { createConfiguredEventExperienceService } from "../../../../../features/events/experience/runtime";
import {
  answersFromProfileResponses,
  legacyResponsesFromAnswers,
  missingCoreProfileFields,
  type EventInterviewResponseSubmission,
  type EventProfileResponseSnapshot,
} from "../../../../../features/events/registration/interview-response-contract";
import {
  InterviewQuestionTokenError,
  verifyInterviewResponseSubmissions,
} from "../../../../../features/events/registration/interview-question-token.server";
import { EventRegistrationWindowError } from "../../../../../features/events/registration/deadline-gated-service";
import { PortraitError, type PortraitSnapshot } from "../../../../../features/events/registration/portrait/contract";
import { createEventRegistrationPortraitRuntime } from "../../../../../features/events/registration/portrait/runtime";
import { attachPortraitQuestionProofs } from "../../../../../features/events/registration/portrait/question-proofs";
import { portraitErrorResponse } from "./portrait/route-handlers";
import { loadEventForRegistration } from "../../../../../features/events/registration/event-loader";
import { generateEventRegistrationQuestions } from "../../../../../features/events/registration/question-generator";
import { eventRegistrationRuntimeService } from "../../../../../features/events/registration/runtime";
import { resolveEventRegistrationEligibility } from "../../../../../features/events/registration/eligibility";
import type { EventRegistrationService } from "../../../../../features/events/registration/service";
import type {
  ResolveEventAdmissionRegistrationControl,
  ResolveEventAdmissionRegistrationState,
} from "../../../../../features/events/admission/registration-control";
import type { EventRegistrationAvailability } from "../../../../../features/events/registration/deadline-gated-service";

interface EventRegistrationRouteContext {
  params: Promise<{ id: string }>;
}

type RegistrationActor = { id: string; name?: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readRegistrationPayload(
  request: Request,
  input: {
    actorId: string;
    eventId: string;
    requiredFields?: readonly EventParticipantProfileField[];
  },
): Promise<{
  answers: EventParticipantProfileAnswers;
  expectedRegistrationVersion?: string | null;
  intent?: Extract<EventRegistrationAction, "reactivate" | "register" | "update">;
  interviewResponses: readonly EventProfileResponseSnapshot[];
  questionSetHash?: string;
  questionSetVersion?: number;
}> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_CORE_FIELDS_REQUIRED",
      "The two required event-registration answers must be submitted as JSON.",
    );
  }

  try {
    const body = (await request.json()) as unknown;
    if (!isRecord(body)) {
      throw new InterviewQuestionTokenError(
        "INTERVIEW_CORE_FIELDS_REQUIRED",
        "The two required event-registration answers are missing.",
      );
    }
    const intent = body.intent;
    const expectedRegistrationVersion = body.expectedRegistrationVersion;
    if (expectedRegistrationVersion !== undefined && expectedRegistrationVersion !== null &&
      (typeof expectedRegistrationVersion !== "string" || !Number.isFinite(Date.parse(expectedRegistrationVersion)))) {
      throw new InterviewQuestionTokenError("INTERVIEW_QUESTION_TOKEN_INVALID", "The registration version is invalid.");
    }
    const versionPrecondition = expectedRegistrationVersion === undefined ? {} : { expectedRegistrationVersion: expectedRegistrationVersion as string | null };
    if (
      intent !== undefined &&
      intent !== "register" &&
      intent !== "reactivate" &&
      intent !== "update"
    ) {
      throw new InterviewQuestionTokenError(
        "INTERVIEW_QUESTION_TOKEN_INVALID",
        "The registration action intent is invalid.",
      );
    }
    const normalizedIntent = intent as
      | "reactivate"
      | "register"
      | "update"
      | undefined;
    if (Array.isArray(body.responses)) {
      const submissions = body.responses.flatMap((value) => {
        if (
          !isRecord(value) ||
          typeof value.answer !== "string" ||
          typeof value.questionToken !== "string"
        ) {
          return [];
        }
        return [
          {
            answer: value.answer,
            questionToken: value.questionToken,
          } satisfies EventInterviewResponseSubmission,
        ];
      });
      if (submissions.length !== body.responses.length) {
        throw new InterviewQuestionTokenError(
          "INTERVIEW_QUESTION_TOKEN_INVALID",
          "Every interview response must include a question token and answer.",
        );
      }
      const interviewResponses = verifyInterviewResponseSubmissions({
        actorId: input.actorId,
        eventId: input.eventId,
        responses: submissions,
      });
      // 分层报名：定位预填与详情页速答是用户自述但未经签名问答的回答，向导
      // 会随签名 responses 一并提交 answers。已验证的签名回答始终优先；普通
      // answers 只补齐签名回答未覆盖的字段，以 legacy(participant) 快照落库，
      // 绝不覆盖任何已验证字段。
      const verifiedFields = new Set<string>(
        interviewResponses.map((response) => response.field),
      );
      // 未知字段名交给 legacyResponsesFromAnswers 按字段白名单过滤；与签名
      // 回答同样执行 NFC 规范化和 1000 字符上限，防止未签名路径写入超长
      // 快照。
      const seededAnswers: Record<string, string> = {};
      if (isRecord(body.answers)) {
        for (const [field, value] of Object.entries(body.answers)) {
          if (typeof value === "string" && value.trim() && !verifiedFields.has(field)) {
            seededAnswers[field] = value.normalize("NFC").trim().slice(0, 1_000);
          }
        }
      }
      const mergedResponses = [
        ...legacyResponsesFromAnswers(seededAnswers, new Date().toISOString()),
        ...interviewResponses,
      ];
      const missingRequired = missingRequiredProfileFields(
        mergedResponses,
        input.requiredFields,
      );
      if (missingRequired.length > 0) {
        throw new InterviewQuestionTokenError(
          "INTERVIEW_CORE_FIELDS_REQUIRED",
          `Required event profile fields are still unanswered: ${missingRequired.join(", ")}.`,
        );
      }
      return {
        answers: answersFromProfileResponses(mergedResponses),
        ...versionPrecondition,
        ...(normalizedIntent ? { intent: normalizedIntent } : {}),
        interviewResponses: mergedResponses,
        ...questionSetMetadata(body),
      };
    }
    const answers = isRecord(body.answers)
      ? (body.answers as EventParticipantProfileAnswers)
      : {};
    const answerSnapshots = legacyResponsesFromAnswers(
      answers,
      new Date().toISOString(),
    );
    const missingRequired = missingRequiredProfileFields(
      answerSnapshots,
      input.requiredFields,
    );
    if (missingRequired.length > 0) {
      throw new InterviewQuestionTokenError(
        "INTERVIEW_CORE_FIELDS_REQUIRED",
        `Required event-registration answers are still missing: ${missingRequired.join(", ")}.`,
      );
    }
    return {
      answers: answersFromProfileResponses(answerSnapshots),
      ...versionPrecondition,
      ...(normalizedIntent ? { intent: normalizedIntent } : {}),
      interviewResponses: answerSnapshots,
      ...questionSetMetadata(body),
    };
  } catch (error) {
    if (error instanceof InterviewQuestionTokenError) throw error;
    throw new InterviewQuestionTokenError(
      "INTERVIEW_QUESTION_TOKEN_INVALID",
      "The event-registration payload is not valid JSON.",
    );
  }
}

function missingRequiredProfileFields(
  responses: readonly Pick<EventProfileResponseSnapshot, "field">[],
  requiredFields?: readonly EventParticipantProfileField[],
): readonly EventParticipantProfileField[] {
  const answered = new Set(responses.map((response) => response.field));
  const required = requiredFields ?? missingCoreProfileFields(responses);
  return required.filter((field) => !answered.has(field));
}

function questionSetMetadata(body: Record<string, unknown>): {
  questionSetHash?: string;
  questionSetVersion?: number;
} {
  const version = body.questionSetVersion;
  const hash = body.questionSetHash;
  if (version === undefined && hash === undefined) return {};
  if (
    (version !== undefined &&
      (typeof version !== "number" ||
        !Number.isSafeInteger(version) ||
        version < 1)) ||
    (hash !== undefined &&
      (typeof hash !== "string" || !/^[a-f0-9]{64}$/u.test(hash)))
  ) {
    throw new InterviewQuestionTokenError(
      "INTERVIEW_QUESTION_TOKEN_INVALID",
      "The published question-set identity is invalid.",
    );
  }
  return {
    questionSetHash: typeof hash === "string" ? hash : undefined,
    questionSetVersion: typeof version === "number" ? version : undefined,
  };
}

function errorResponse(error: AppError, status: number): Response {
  const mode = resolveFeatureMode();
  return NextResponse.json(failure(error), {
    headers: runtimeBoundaryHeaders(mode),
    status,
  });
}

export function createEventRegistrationRouteHandlers(input: {
  getPortraitProofSource?: (eventId: string, actorId: string) => Promise<{ workspaceId: string; snapshot: PortraitSnapshot }>;
  readRegistrationWindow?: (eventId: string) => Promise<import("../../../../../features/events/registration/deadline-gated-service").EventRegistrationWindowState>;
  getPublishedQuestionSet?: (
    eventId: string,
  ) => Promise<EventExperiencePublishedQuestionSet | null>;
  loadEvent?: typeof loadEventForRegistration;
  now?: () => Date;
  readRegistrationAvailability?: (
    eventId: string,
  ) => Promise<EventRegistrationAvailability>;
  registrationService?: EventRegistrationService;
  resolveAdmissionControl?: ResolveEventAdmissionRegistrationControl;
  resolveAdmissionState?: ResolveEventAdmissionRegistrationState;
  resolveActor: () => Promise<RegistrationActor | null>;
}) {
  const registrationService =
    input.registrationService ?? eventRegistrationRuntimeService;
  const loadEvent = input.loadEvent ?? loadEventForRegistration;
  const getPublishedQuestionSet =
    input.getPublishedQuestionSet ??
    (async (eventId: string) =>
      (await createConfiguredEventExperienceService())?.getPublishedQuestionSet(
        eventId,
      ) ?? null);
  const readRegistrationAvailability =
    input.readRegistrationAvailability ?? (async () => "open" as const);
  const resolveAdmissionState =
    input.resolveAdmissionState ?? (async () => ({ state: "legacy" as const }));
  async function GET(
    request: Request,
    context: EventRegistrationRouteContext,
  ): Promise<Response> {
    const actor = await input.resolveActor();
    if (!actor?.id) {
      return NextResponse.json(
        failure(new AppError("UNAUTHORIZED", "Sign in is required.")),
        { status: 401 },
      );
    }

    const mode = resolveFeatureMode();
    const { id } = await context.params;
    try {
      const event = await loadEvent(id, actor.id);
      if (!event) {
        return errorResponse(
          new AppError("NOT_FOUND", "The event could not be found."),
          404,
        );
      }

      const searchParams = new URL(request.url).searchParams;
      const questionsRequested = searchParams.get("questions") !== "false";
      const [registration, admissionState] =
        await Promise.all([
          registrationService.get({ eventId: event.id, userId: actor.id }),
          resolveAdmissionState(actor.id, event.id),
        ]);
      if (admissionState.state === "unavailable") {
        throw new Error("Event admission state is unavailable.");
      }
      const registrationWindow =
        admissionState.state === "legacy"
          ? input.readRegistrationWindow
            ? await input.readRegistrationWindow(event.id)
            : { availability: await readRegistrationAvailability(event.id) }
          : { availability: "open" as const };
      const activeRegistrationCount =
        admissionState.state === "admission" &&
        admissionState.policy.capacity !== null
          ? (await registrationService.list({ eventId: event.id })).filter(
              (value) => value.status === "rsvped",
            ).length
          : null;
      const evaluatedAt = (input.now?.() ?? new Date()).toISOString();
      const eligibility = resolveEventRegistrationEligibility({
        ...(admissionState.state === "admission"
          ? {
              admission: {
                activeRegistrationCount,
                application: admissionState.application,
                policy: admissionState.policy,
              },
            }
          : {}),
        evaluatedAt,
        event,
        legacyAvailability: registrationWindow.availability,
        ...("blockingReason" in registrationWindow ? { blockingReason: registrationWindow.blockingReason } : {}),
        registration,
      });
      const shouldGenerateQuestions = questionsRequested && eligibility.allowedActions.some(action =>
        action === "register" || action === "reactivate" || action === "update" || action === "apply");
      const publishedQuestionSet = shouldGenerateQuestions ? await getPublishedQuestionSet(event.id) : null;
      let questionSet = shouldGenerateQuestions
        ? await generateEventRegistrationQuestions({
            event,
            language: searchParams.get("language") === "en" ? "en" : "zh",
            publishedQuestionSet,
            allowModelGeneration: searchParams.get("portraitProofs") !== "true",
          })
        : {
            provenance: {
              aiProviderRequested: false,
              externalNetworkRequested: false,
              fallbackReason: "QUESTIONS_NOT_REQUESTED",
              generationMethod: "deterministic-not-requested" as const,
              model: null,
              provider: null,
            },
            questions: [],
          };

      if (shouldGenerateQuestions && searchParams.get("portraitProofs") === "true") {
        const source = input.getPortraitProofSource
          ? await input.getPortraitProofSource(event.id, actor.id)
          : await (async () => {
              const runtime = createEventRegistrationPortraitRuntime();
              if (!runtime) throw new PortraitError(503, "PORTRAIT_STORAGE_UNAVAILABLE", "Durable portrait proof storage is unavailable.");
              const { snapshot } = await runtime.repository.readSources({ actorId: actor.id, eventId: event.id });
              return { workspaceId: runtime.workspaceId, snapshot };
            })();
        questionSet = attachPortraitQuestionProofs({ ...source, actorId: actor.id, eventId: event.id, registrationVersion: registration?.updatedAt ?? null, questionSet, language: searchParams.get("language") === "en" ? "en" : "zh", now: () => Date.parse(evaluatedAt) });
      }

      return NextResponse.json(
        success({ eligibility, questionSet, registration }),
        { headers: runtimeBoundaryHeaders(mode), status: 200 },
      );
    } catch (error) {
      if (error instanceof PortraitError) return portraitErrorResponse(error, mode);
      if (error instanceof AppError) {
        return errorResponse(error, error.code === "NOT_FOUND" ? 404 : 503);
      }
      return errorResponse(
        new AppError(
          "SERVICE_UNAVAILABLE",
          "The current registration state could not be verified. No registration action is available until this page is refreshed.",
        ),
        503,
      );
    }
  }

  async function POST(
    request: Request,
    context: EventRegistrationRouteContext,
  ): Promise<Response> {
    const actor = await input.resolveActor();
    if (!actor?.id) {
      return NextResponse.json(
        failure(new AppError("UNAUTHORIZED", "Sign in is required.")),
        { status: 401 },
      );
    }

    const mode = resolveFeatureMode();
    const { id } = await context.params;
    const event = await loadEvent(id, actor.id);
    if (!event) {
      return errorResponse(
        new AppError("NOT_FOUND", "The event could not be found."),
        404,
      );
    }
    if (!["confirmed", "imported"].includes(event.status)) {
      return errorResponse(
        new AppError("CONFLICT", "This event is not open for registration."),
        409,
      );
    }
    const startsAtMs = Date.parse(event.startsAt);
    const nowMs = (input.now?.() ?? new Date()).getTime();
    if (!Number.isFinite(startsAtMs) || nowMs >= startsAtMs) {
      return errorResponse(
        new AppError("CONFLICT", "Registration closes when the event starts."),
        409,
      );
    }

    const admissionControl = input.resolveAdmissionControl
      ? await input.resolveAdmissionControl(actor.id, event.id)
      : "legacy";
    if (admissionControl === "admission") {
      return errorResponse(
        new AppError(
          "CONFLICT",
          "This event uses the admission application flow; direct registration is disabled.",
        ),
        409,
      );
    }
    if (admissionControl === "unavailable") {
      return errorResponse(
        new AppError(
          "SERVICE_UNAVAILABLE",
          "The event admission state is temporarily unavailable; no registration was changed.",
        ),
        503,
      );
    }

    let registration;
    let registrationAction: Extract<
      EventRegistrationAction,
      "reactivate" | "register" | "update"
    > = "register";
    try {
      const publishedQuestionSet = await getPublishedQuestionSet(event.id);
      const requiredFields = publishedQuestionSet
        ? publishedQuestionSet.questions
            .filter((question) => question.required)
            .map((question) => question.participantProfileField)
        : undefined;
      const payload = await readRegistrationPayload(request, {
        actorId: actor.id,
        eventId: event.id,
        requiredFields,
      });
      const existing = await registrationService.get({
        eventId: event.id,
        userId: actor.id,
      });
      if (payload.expectedRegistrationVersion !== undefined && payload.expectedRegistrationVersion !== (existing?.updatedAt ?? null)) {
        throw new AppError("CONFLICT", "The registration changed. Reload its status before trying again.");
      }
      registrationAction =
        payload.intent ??
        (existing?.status === "cancelled"
          ? "reactivate"
          : existing?.status === "rsvped"
            ? "update"
            : "register");
      const intentMatchesCurrentState =
        (registrationAction === "register" && existing?.status !== "cancelled") ||
        (registrationAction === "update" && existing?.status === "rsvped") ||
        (registrationAction === "reactivate" &&
          (existing?.status === "cancelled" || existing?.status === "rsvped"));
      if (!intentMatchesCurrentState) {
        throw new AppError(
          "CONFLICT",
          "The registration changed before this action could be applied. Refresh before trying again.",
        );
      }
      if (
        publishedQuestionSet &&
        ((payload.questionSetVersion !== undefined &&
          payload.questionSetVersion !== publishedQuestionSet.questionSetVersion) ||
          (payload.questionSetHash !== undefined &&
            payload.questionSetHash !== publishedQuestionSet.hash) ||
          (publishedQuestionSet.track === "v2" &&
            (payload.questionSetVersion !== publishedQuestionSet.questionSetVersion ||
              payload.questionSetHash !== publishedQuestionSet.hash)))
      ) {
        throw new AppError(
          "CONFLICT",
          "The registration questions changed. Refresh the form before submitting.",
        );
      }
      registration = await registrationService.register({
        answers: payload.answers,
        displayName: actor.name,
        eventId: event.id,
        interviewResponses: [...payload.interviewResponses],
        questionSetHash: publishedQuestionSet?.hash,
        questionSetVersion: publishedQuestionSet?.questionSetVersion,
        userId: actor.id,
      });
    } catch (error) {
      if (error instanceof InterviewQuestionTokenError) {
        return errorResponse(
          new AppError("VALIDATION_ERROR", error.message),
          422,
        );
      }
      if (error instanceof EventRegistrationWindowError) {
        const unavailable = [
          "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
          "EVENT_REGISTRATION_WINDOW_INVALID",
        ].includes(error.code);
        return errorResponse(
          new AppError(
            unavailable ? "SERVICE_UNAVAILABLE" : "CONFLICT",
            error.message,
          ),
          unavailable ? 503 : 409,
        );
      }
      if (error instanceof AppError) {
        return errorResponse(error, error.code === "CONFLICT" ? 409 : 422);
      }
      throw error;
    }

    return NextResponse.json(success({
      ...registration,
      mutationReceipt: {
        action: registrationAction,
        actorId: actor.id,
        eventId: registration.eventId,
        recordId: registration.id,
        registrationVersion: registration.updatedAt,
      },
    }), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  }

  return { GET, POST };
}
