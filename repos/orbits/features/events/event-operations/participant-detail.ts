import type {
  EventContactRequest,
  EventOperationsParticipant,
  EventOperationsPublishedResult,
  EventOperationsTable,
} from "./contract";
import type { EventOperationsRepository } from "./repository";
import type {
  EventOperationsAttendeeWorkspace,
  EventOperationsService,
} from "./service";
import {
  createConfiguredEventProfileResponseReader,
  type EventProfileResponseReader,
  type EventProfileResponseVersion,
} from "./profile-response-reader";
import {
  EVENT_PROFILE_FIELD_LABELS,
  type EventProfileResponseSnapshot,
} from "../registration/interview-response-contract";
import { profileResponsesForParticipantDetail } from "./profile-response-policy";

export interface EventParticipantDetailResponseView {
  answer: string;
  answeredAt: string | null;
  fieldKey: string;
  label: { en: string; zh: string };
  prompt: string | null;
  questionSource: "ai_adaptive" | "legacy_unknown";
}

export interface EventParticipantPlacementView {
  groupingRationale: string | null;
  icebreakers: readonly string[];
  roundNumber: 1 | 2;
  seat: string;
  tableNumber: number;
  theme: string;
}

export interface EventParticipantDetailView {
  company: string | null;
  contactRequest: {
    contactId: string | null;
    direction: "incoming" | "outgoing" | null;
    requestId: string | null;
    revision: number | null;
    status:
      | "none"
      | "awaiting_target_consent"
      | "accepted"
      | "declined"
      | "withdrawn";
  };
  displayName: string;
  industry: string | null;
  participantId: string;
  placements: readonly EventParticipantPlacementView[];
  profileCompleteness: EventOperationsParticipant["profileCompleteness"];
  profileVersion: number | null;
  recommendation: {
    icebreakers: readonly string[];
    memberHint: string;
    reasons: readonly string[];
    score: number;
  } | null;
  responses: readonly EventParticipantDetailResponseView[];
  role: string | null;
  sourceContext: "current_profile" | "published_generation";
  topics: readonly string[];
}

export interface EventParticipantDetailService {
  get(input: {
    eventId: string;
    targetParticipantId: string;
    viewerActorId: string;
  }): Promise<EventParticipantDetailView | null>;
}

function contactRequestFor(
  workspace: EventOperationsAttendeeWorkspace,
  participantId: string,
): EventContactRequest | null {
  return (
    workspace.contactRequests.find(
      (request) =>
        request.requesterParticipantId === participantId ||
        request.targetParticipantId === participantId,
    ) ?? null
  );
}

function placementFor(
  table: EventOperationsTable,
  roundNumber: 1 | 2,
  targetParticipantId: string,
  viewerParticipantId: string,
): EventParticipantPlacementView | null {
  const target = table.members.find(
    (member) => member.participantId === targetParticipantId,
  );
  if (!target) return null;
  const sharesTable = table.members.some(
    (member) => member.participantId === viewerParticipantId,
  );
  return {
    groupingRationale: table.memberRationales[targetParticipantId] ?? null,
    icebreakers: sharesTable ? [...table.icebreakers] : [],
    roundNumber,
    seat: target.seat,
    tableNumber: table.tableNumber,
    theme: table.theme,
  };
}

function placementsFor(
  published: EventOperationsPublishedResult | null,
  targetParticipantId: string,
  viewerParticipantId: string,
): readonly EventParticipantPlacementView[] {
  if (!published) return [];
  return [
    ...published.grouping.roundOne.flatMap((table) => {
      const placement = placementFor(
        table,
        1,
        targetParticipantId,
        viewerParticipantId,
      );
      return placement ? [placement] : [];
    }),
    ...published.grouping.roundTwo.flatMap((table) => {
      const placement = placementFor(
        table,
        2,
        targetParticipantId,
        viewerParticipantId,
      );
      return placement ? [placement] : [];
    }),
  ];
}

function publicResponses(
  version: EventProfileResponseVersion | null,
  viewerOwnsTarget: boolean,
): readonly EventParticipantDetailResponseView[] {
  if (!version) return [];
  return profileResponsesForParticipantDetail(version.responses, {
    viewerOwnsTarget,
  }).map((response: EventProfileResponseSnapshot) => ({
    answer: response.answer.displayText,
    answeredAt:
      response.questionSource === "legacy_unknown" ? null : response.answeredAt,
    fieldKey: response.field,
    label:
      response.question?.fieldLabel ??
      EVENT_PROFILE_FIELD_LABELS[response.field],
    prompt: response.question?.prompt ?? null,
    questionSource: response.questionSource,
  }));
}

function contactView(
  workspace: EventOperationsAttendeeWorkspace,
  participantId: string,
): EventParticipantDetailView["contactRequest"] {
  const request = contactRequestFor(workspace, participantId);
  return request
    ? {
        contactId: request.contactId,
        direction:
          request.requesterParticipantId === workspace.me.participantId
            ? "outgoing"
            : "incoming",
        requestId: request.requestId,
        revision: request.revision,
        status: request.status,
      }
    : {
        contactId: null,
        direction: null,
        requestId: null,
        revision: null,
        status: "none",
      };
}

function visibleParticipantFields(
  version: EventProfileResponseVersion | null,
  viewerOwnsTarget: boolean,
): {
  fields: ReadonlySet<string> | null;
  topics: readonly string[] | null;
} {
  if (!version) return { fields: null, topics: null };
  const responses = profileResponsesForParticipantDetail(version.responses, {
    viewerOwnsTarget,
  });
  const fields = new Set(responses.map((response) => response.field));
  const topics = responses
    .filter(
      (response) =>
        response.field === "industry" || response.field === "desiredOutcome",
    )
    .flatMap((response) =>
      response.answer.displayText
        .split(/[,，、;/|]+/u)
        .map((value) => value.trim())
        .filter(Boolean),
    );
  return { fields, topics: [...new Set(topics)] };
}

export function createEventParticipantDetailService(input: {
  operationsService: Pick<EventOperationsService, "attendeeWorkspace">;
  repository: Pick<EventOperationsRepository, "getPublishedResultForAttendee">;
  responseReader?: EventProfileResponseReader | null;
}): EventParticipantDetailService {
  const responseReader =
    input.responseReader === undefined
      ? createConfiguredEventProfileResponseReader()
      : input.responseReader;
  return {
    async get({ eventId, targetParticipantId, viewerActorId }) {
      const workspace = await input.operationsService.attendeeWorkspace({
        actorId: viewerActorId,
        eventId,
      });
      const participant = workspace.directory.find(
        (value) => value.participantId === targetParticipantId,
      );
      if (!participant) return null;
      const published =
        workspace.resultsState === "ready"
          ? await input.repository.getPublishedResultForAttendee(eventId)
          : null;
      const responseVersion = responseReader
        ? await responseReader.read({
            eventId,
            generationId: published?.generationId ?? null,
            participantId: participant.participantId,
          })
        : null;
      const recommendation = workspace.recommendations?.recommendations.find(
        (value) => value.targetParticipantId === participant.participantId,
      );
      const viewerOwnsTarget =
        participant.participantId === workspace.me.participantId;
      const visible = visibleParticipantFields(
        responseVersion,
        viewerOwnsTarget,
      );
      const canSeeField = (field: string) =>
        visible.fields === null || visible.fields.has(field);
      return {
        company: canSeeField("positioning") ? participant.company : null,
        contactRequest: contactView(workspace, participant.participantId),
        displayName: participant.displayName,
        industry: canSeeField("industry") ? participant.industry : null,
        participantId: participant.participantId,
        placements: placementsFor(
          published,
          participant.participantId,
          workspace.me.participantId,
        ),
        profileCompleteness: participant.profileCompleteness,
        profileVersion: responseVersion?.profileVersion ?? null,
        recommendation: recommendation
          ? {
              icebreakers: [...recommendation.icebreakers],
              memberHint: recommendation.memberHint,
              reasons: [...recommendation.reasons],
              score: recommendation.score,
            }
          : null,
        responses: publicResponses(
          responseVersion,
          viewerOwnsTarget,
        ),
        role: canSeeField("positioning") ? participant.role : null,
        sourceContext: published
          ? "published_generation"
          : "current_profile",
        topics: visible.topics ?? [...participant.topics],
      };
    },
  };
}
