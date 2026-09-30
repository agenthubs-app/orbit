import type {
  EventContactRequest,
  EventOperationsParticipant,
  EventOperationsParticipantRecommendations,
  EventOperationsTable,
} from "./contract";

/**
 * The attendee-visible projections of event operations data: the privacy
 * boundary shared by `GET /api/events/:id/operations` (sprint 0107) and the
 * device sync of results published to an attendee (sprint 0115). Only these
 * fields are copied, so a field added to the domain types cannot leak by
 * serialization.
 */
export function publicParticipant(participant: EventOperationsParticipant) {
  return {
    company: participant.company,
    displayName: participant.displayName,
    experienceHighlight: participant.experienceHighlight,
    industry: participant.industry,
    languages: [...participant.languages],
    needs: [...participant.needs],
    offers: [...participant.offers],
    participantId: participant.participantId,
    role: participant.role,
    topics: [...participant.topics],
  };
}

export function publicContactRequest(request: EventContactRequest) {
  return {
    contactId: request.contactId,
    requestId: request.requestId,
    revision: request.revision,
    requesterParticipantId: request.requesterParticipantId,
    status: request.status,
    targetParticipantId: request.targetParticipantId,
    withdrawnAt: request.withdrawnAt,
  };
}

export function publicTable(table: EventOperationsTable | null) {
  if (!table) return null;
  return {
    icebreakers: [...table.icebreakers],
    memberPrompts: Object.fromEntries(
      Object.entries(table.memberPrompts).map(([participantId, prompts]) => [
        participantId,
        [...prompts],
      ]),
    ),
    memberRationales: { ...table.memberRationales },
    members: table.members.map((member) => ({ ...member })),
    rationale: table.rationale,
    tableNumber: table.tableNumber,
    theme: table.theme,
  };
}

export function publicRecommendations(recommendations: EventOperationsParticipantRecommendations | null) {
  return recommendations
    ? {
        noMatchReason: recommendations.noMatchReason,
        recommendations: recommendations.recommendations.map((recommendation) => ({
          icebreakers: [...recommendation.icebreakers],
          memberHint: recommendation.memberHint,
          reasons: [...recommendation.reasons],
          score: recommendation.score,
          targetParticipantId: recommendation.targetParticipantId,
        })),
        sourceParticipantId: recommendations.sourceParticipantId,
      }
    : null;
}

/** The participant's own table in one round of a published grouping. */
export function tableForParticipant(
  round: readonly EventOperationsTable[],
  participantId: string,
): EventOperationsTable | null {
  return round.find((table) => table.members.some((member) => member.participantId === participantId)) ?? null;
}
