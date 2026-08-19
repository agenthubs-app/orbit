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
import { loadEventForRegistration } from "../../../../../features/events/registration/event-loader";
import { generateEventRegistrationQuestions } from "../../../../../features/events/registration/question-generator";
import { eventRegistrationRuntimeService } from "../../../../../features/events/registration/runtime";
import type { EventRegistrationService } from "../../../../../features/events/registration/service";
import type { ResolveEventAdmissionRegistrationControl } from "../../../../../features/events/admission/registration-control";

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
  getPublishedQuestionSet?: (
    eventId: string,
  ) => Promise<EventExperiencePublishedQuestionSet | null>;
  loadEvent?: typeof loadEventForRegistration;
  now?: () => Date;
  registrationService?: EventRegistrationService;
  resolveAdmissionControl?: ResolveEventAdmissionRegistrationControl;
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
    const event = await loadEvent(id, actor.id);
    if (!event) {
      return errorResponse(
        new AppError("NOT_FOUND", "The event could not be found."),
        404,
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const shouldGenerateQuestions = searchParams.get("questions") !== "false";
    const publishedQuestionSet = shouldGenerateQuestions
      ? await getPublishedQuestionSet(event.id)
      : null;
    const registration = await registrationService.get({
      eventId: event.id,
      userId: actor.id,
    });
    const questionSet = shouldGenerateQuestions
      ? await generateEventRegistrationQuestions({
          event,
          language: searchParams.get("language") === "en" ? "en" : "zh",
          publishedQuestionSet,
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

    return NextResponse.json(success({ questionSet, registration }), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
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

    return NextResponse.json(success(registration), {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    });
  }

  return { GET, POST };
}
