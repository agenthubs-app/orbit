import { createHash } from "node:crypto";

import type { EventRegistration } from "../registration/contract";
import { loadEventForRegistration } from "../registration/event-loader";
import { eventRegistrationRuntimeService } from "../registration/runtime";
import type { EventRegistrationService } from "../registration/service";
import {
  createConfiguredEventMatchmakingService,
  type EventMatchmakingService,
  type MatchmakingParticipant,
} from "./service";

export interface EventMatchmakingRecommendationView {
  participantId: string;
  displayName: string;
  organization?: string;
  score: number;
  reasons: readonly string[];
  evidenceIds: readonly string[];
  contactDetailsDisclosed: false;
}

export interface EventMatchmakingRequestView {
  requestId: string;
  direction: "incoming" | "outgoing";
  status:
    | "awaiting_requester_confirmation"
    | "awaiting_target_consent"
    | "accepted"
    | "declined"
    | "scheduling"
    | "scheduled"
    | "met"
    | "followup_recorded";
  otherParticipant: {
    participantId: string;
    displayName: string;
    organization?: string;
  };
  proposedSlots: readonly string[];
  selectedSlot?: string;
  contactDetailsDisclosed: boolean;
}

export interface EventMatchmakingWorkspace {
  eventId: string;
  state: "registration_required" | "no_matches" | "ready";
  recommendations: readonly EventMatchmakingRecommendationView[];
  requests: readonly EventMatchmakingRequestView[];
  manualSchedulingAvailable: true;
  externalCalendarAvailable: false;
  privacyNotice: string;
}

function values(...items: Array<string | undefined>): string[] {
  return items.flatMap((item) =>
    item
      ? item
          .split(/[,，、;/]+/u)
          .map((value) => value.trim())
          .filter(Boolean)
      : [],
  );
}

function participantFor(
  registration: EventRegistration,
): MatchmakingParticipant {
  const answers = registration.participantProfile.answers;
  return {
    participantId: registration.participantProfileId,
    actorId: registration.userId,
    displayName:
      registration.participantProfile.displayName?.trim() ||
      "Event participant",
    organization: answers.positioning,
    domains: values(answers.industry, answers.positioning),
    goals: values(answers.desiredOutcome),
    offers: values(answers.valueOffered, answers.experienceHighlight),
    needs: values(answers.targetAttendees),
    stage: answers.followUpPreference,
    evidenceIds: [
      `evidence:event-registration:${registration.id}`,
      `evidence:participant-profile:${registration.participantProfileId}`,
    ],
  };
}

function organizerPrincipal(input: {
  eventId: string;
  sourceId: string;
  providerRecordId: string;
}): string {
  const subject = createHash("sha256")
    .update(`${input.eventId}\u0000${input.sourceId}\u0000${input.providerRecordId}`)
    .digest("base64url");
  return `event-organizer:${subject}`;
}

function introductionRequestId(input: {
  eventId: string;
  requesterParticipantId: string;
  targetParticipantId: string;
}): string {
  const participantPair = [
    input.requesterParticipantId,
    input.targetParticipantId,
  ].sort();
  const subject = createHash("sha256")
    .update(
      [
        input.eventId,
        ...participantPair,
      ].join("\u0000"),
    )
    .digest("base64url");
  return `intro-request:${subject}`;
}

function publicRequest(
  request: Awaited<ReturnType<EventMatchmakingService["listRequests"]>>[number],
  actorId: string,
  participants: ReadonlyMap<string, MatchmakingParticipant>,
): EventMatchmakingRequestView | null {
  const outgoing = request.requesterActorId === actorId;
  const otherParticipantId = outgoing
    ? request.targetParticipantId
    : request.requesterParticipantId;
  const other = participants.get(otherParticipantId);
  if (!other) return null;
  return {
    requestId: request.requestId,
    direction: outgoing ? "outgoing" : "incoming",
    status: request.status,
    otherParticipant: {
      participantId: other.participantId,
      displayName: other.displayName,
      organization: other.organization,
    },
    proposedSlots: request.proposedSlots,
    selectedSlot: request.selectedSlot,
    contactDetailsDisclosed: request.contactDetailsDisclosed,
  };
}

export function createEventMatchmakingContextService(input: {
  matchmaking?: EventMatchmakingService;
  registrationService?: Pick<EventRegistrationService, "list">;
  loadEvent?: typeof loadEventForRegistration;
} = {}) {
  const matchmaking =
    input.matchmaking ?? createConfiguredEventMatchmakingService();
  const registrationService =
    input.registrationService ?? eventRegistrationRuntimeService;
  const loadEvent = input.loadEvent ?? loadEventForRegistration;

  async function registrations(eventId: string) {
    return (await registrationService.list({ eventId })).filter(
      (registration) => registration.status === "rsvped",
    );
  }

  async function resolve(input: { eventId: string; actorId: string }) {
    const [event, eventRegistrations] = await Promise.all([
      loadEvent(input.eventId),
      registrations(input.eventId),
    ]);
    if (!event) throw new Error("Event not found.");
    const participants = eventRegistrations.map(participantFor);
    const byParticipantId = new Map(
      participants.map((participant) => [participant.participantId, participant]),
    );
    const requester = participants.find(
      (participant) => participant.actorId === input.actorId,
    );
    return {
      event,
      participants,
      byParticipantId,
      requester,
      organizerActorId: organizerPrincipal({
        eventId: event.id,
        sourceId: event.sourceMetadata.id,
        providerRecordId: event.sourceMetadata.providerRecordId,
      }),
    };
  }

  return {
    async view(input: {
      eventId: string;
      actorId: string;
    }): Promise<EventMatchmakingWorkspace> {
      const context = await resolve(input);
      if (!context.requester) {
        return {
          eventId: context.event.id,
          state: "registration_required",
          recommendations: [],
          requests: [],
          manualSchedulingAvailable: true,
          externalCalendarAvailable: false,
          privacyNotice:
            "报名后才会进入撮合；双方同意前不会披露联系方式。",
        };
      }
      const recommendations = matchmaking.rank({
        eventId: context.event.id,
        requester: context.requester,
        candidates: context.participants,
        limit: 3,
      });
      const requests = (
        await matchmaking.listRequests({
          eventId: context.event.id,
          actorId: input.actorId,
        })
      ).flatMap((request) => {
        const view = publicRequest(
          request,
          input.actorId,
          context.byParticipantId,
        );
        return view ? [view] : [];
      });
      return {
        eventId: context.event.id,
        state:
          recommendations.length > 0 || requests.length > 0
            ? "ready"
            : "no_matches",
        recommendations,
        requests,
        manualSchedulingAvailable: true,
        externalCalendarAvailable: false,
        privacyNotice:
          "只展示最多 3 位可解释候选；双方同意前不会披露联系方式，也不会自动发送消息。",
      };
    },
    async createRequest(input: {
      eventId: string;
      actorId: string;
      targetParticipantId: string;
      now: string;
    }) {
      const context = await resolve(input);
      if (!context.requester) {
        throw new Error("Register for the event before requesting an introduction.");
      }
      const ranked = matchmaking.rank({
        eventId: context.event.id,
        requester: context.requester,
        candidates: context.participants,
        limit: 3,
      });
      if (
        !ranked.some(
          (candidate) =>
            candidate.participantId === input.targetParticipantId,
        )
      ) {
        throw new Error("The selected participant is not an eligible match.");
      }
      const target = context.byParticipantId.get(input.targetParticipantId);
      if (!target) throw new Error("Matchmaking participant not found.");
      const existingRequest = (
        await matchmaking.listRequests({
          eventId: context.event.id,
          actorId: input.actorId,
        })
      ).find(
        (request) =>
          [request.requesterParticipantId, request.targetParticipantId].includes(
            context.requester!.participantId,
          ) &&
          [request.requesterParticipantId, request.targetParticipantId].includes(
            target.participantId,
          ),
      );
      if (existingRequest) return existingRequest;
      return matchmaking.createIntroductionRequest({
        requestId: introductionRequestId({
          eventId: context.event.id,
          requesterParticipantId: context.requester.participantId,
          targetParticipantId: target.participantId,
        }),
        eventId: context.event.id,
        actorId: input.actorId,
        requesterParticipantId: context.requester.participantId,
        requesterActorId: context.requester.actorId,
        targetParticipantId: target.participantId,
        targetActorId: target.actorId,
        organizerActorId: context.organizerActorId,
        now: input.now,
      });
    },
  };
}
