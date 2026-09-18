import type { AdaptiveInterviewTurn } from "../../../../../../features/events/registration/adaptive-interview-service";
import type { EventParticipantProfileAnswers } from "../../../../../../features/events/registration/contract";
import {
  EVENT_ADMISSION_APPLICATION_STATUSES,
  type EventAdmissionApplication,
} from "../../../../../../features/events/admission/contract";

// 报名工作区的纯模型：问卷转写、准入回执核对、状态卡判定。与工作区组件分离，供新 UI 直接消费。

export type RegistrationLanguage = "en" | "zh";

export function registrationCopy(language: RegistrationLanguage, value: { en: string; zh: string }): string {
  return language === "en" ? value.en : value.zh;
}

export function registrationFieldLabel(
  language: RegistrationLanguage,
  field: AdaptiveInterviewTurn["field"],
): string {
  const labels: Record<AdaptiveInterviewTurn["field"], { en: string; zh: string }> = {
    desiredOutcome: { en: "Outcome", zh: "期待结果" },
    energyStyle: { en: "Social energy", zh: "社交能量" },
    experienceHighlight: { en: "Experience", zh: "经验亮点" },
    followUpPreference: { en: "Follow-up", zh: "后续方式" },
    industry: { en: "Industry", zh: "行业" },
    positioning: { en: "Positioning", zh: "定位" },
    targetAttendees: { en: "Who to meet", zh: "想认识" },
    valueOffered: { en: "What you offer", zh: "能提供" },
  };

  return registrationCopy(language, labels[field]);
}

export function answersFromTranscript(
  transcript: readonly AdaptiveInterviewTurn[],
): EventParticipantProfileAnswers {
  return Object.fromEntries(
    transcript.map((turn) => [turn.field, turn.answer]),
  ) as EventParticipantProfileAnswers;
}

export function transcriptFromAnswers(
  answers: EventParticipantProfileAnswers,
): AdaptiveInterviewTurn[] {
  return Object.entries(answers)
    .filter(
      (entry): entry is [AdaptiveInterviewTurn["field"], string] =>
        typeof entry[1] === "string" && entry[1].trim().length > 0,
    )
    .map(([field, answer]) => ({ answer, field, prompt: field }));
}

export type StatusCardApplication = EventAdmissionApplication & {
  status: "pending_review" | "rejected" | "waitlisted" | "withdrawn";
};

export type AdmissionApplicationReceiptExpectation = {
  actorId: string;
  applicationVersion?: number;
  eventId: string;
  status?: EventAdmissionApplication["status"];
};

function isAdmissionApplicationStatus(
  value: unknown,
): value is EventAdmissionApplication["status"] {
  return (
    typeof value === "string" &&
    (EVENT_ADMISSION_APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

export function matchesAdmissionApplicationReceipt(
  value: unknown,
  expectation: AdmissionApplicationReceiptExpectation,
): value is EventAdmissionApplication {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<EventAdmissionApplication>;
  return (
    candidate.actorId === expectation.actorId &&
    candidate.eventId === expectation.eventId &&
    typeof candidate.applicationVersion === "number" &&
    Number.isSafeInteger(candidate.applicationVersion) &&
    candidate.applicationVersion >= 1 &&
    isAdmissionApplicationStatus(candidate.status) &&
    (expectation.applicationVersion === undefined ||
      candidate.applicationVersion === expectation.applicationVersion) &&
    (expectation.status === undefined || candidate.status === expectation.status)
  );
}

export function isStatusCardApplication(
  application: EventAdmissionApplication | null,
): application is StatusCardApplication {
  return Boolean(
    application &&
      ["pending_review", "rejected", "waitlisted", "withdrawn"].includes(
        application.status,
      ),
  );
}
