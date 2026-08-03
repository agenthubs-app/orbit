import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type EventParticipantProfileAnswers,
  type EventRegistration,
} from "../registration/contract";
import type {
  EventOperationsConfiguration,
  EventOperationsParticipant,
} from "./contract";

export function normalizeEventParticipantAnswers(
  value?: EventParticipantProfileAnswers | null,
): EventParticipantProfileAnswers {
  const answers: EventParticipantProfileAnswers = {};
  for (const field of EVENT_PARTICIPANT_PROFILE_FIELDS) {
    const answer = value?.[field];
    if (typeof answer === "string" && answer.trim()) {
      answers[field] = answer.trim().slice(0, 1_000);
    }
  }
  return answers;
}

export function eventParticipantAnswersEqual(
  left: EventParticipantProfileAnswers,
  right: EventParticipantProfileAnswers,
): boolean {
  return EVENT_PARTICIPANT_PROFILE_FIELDS.every(
    (field) => left[field] === right[field],
  );
}

function values(...items: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      items.flatMap((item) =>
        item
          ? item
              .split(/[,，、;/|]+/u)
              .map((value) => value.trim())
              .filter(Boolean)
          : [],
      ),
    ),
  );
}

function splitPositioning(value?: string): {
  company: string | null;
  role: string | null;
  seniority: string | null;
} {
  const normalized = value?.trim() ?? "";
  if (!normalized) return { company: null, role: null, seniority: null };
  const [role, company] = normalized.split(/\s+(?:@|at|·|＠)\s+/u, 2);
  return company
    ? { company: company.trim(), role: role.trim(), seniority: null }
    : { company: normalized, role: null, seniority: null };
}

export function eventOperationsParticipantFromRegistration(
  registration: EventRegistration,
  configuration: Pick<EventOperationsConfiguration, "profileEditDeadlineAt">,
): EventOperationsParticipant {
  const answers = registration.participantProfile.answers;
  const positioning = splitPositioning(answers.positioning);
  const answeredFields = Object.values(answers).filter(
    (answer) => typeof answer === "string" && answer.trim().length > 0,
  ).length;
  const languages = values(answers.followUpPreference).filter((value) =>
    /^(?:ja|jp|japanese|日本語|en|english|英文|zh|cn|chinese|中文)$/iu.test(
      value,
    ),
  );

  return {
    actorId: registration.userId,
    company: positioning.company,
    displayName:
      registration.participantProfile.displayName?.trim() ||
      "Event participant",
    energyStyle: answers.energyStyle?.trim() || null,
    evidenceIds: [
      `evidence:event-registration:${registration.id}`,
      `evidence:participant-profile:${registration.participantProfileId}`,
    ],
    experienceHighlight: answers.experienceHighlight?.trim() || null,
    industry: answers.industry?.trim() || null,
    languages,
    lateRegistration:
      Date.parse(registration.registeredAt) >=
      Date.parse(configuration.profileEditDeadlineAt),
    needs: values(answers.targetAttendees, answers.desiredOutcome),
    offers: values(answers.valueOffered, answers.experienceHighlight),
    participantId: registration.participantProfileId,
    profileCompleteness:
      answeredFields >= 6
        ? "complete"
        : answeredFields >= 3
          ? "partial"
          : "minimal",
    role: positioning.role,
    seniority: positioning.seniority,
    topics: values(answers.industry, answers.desiredOutcome),
  };
}
