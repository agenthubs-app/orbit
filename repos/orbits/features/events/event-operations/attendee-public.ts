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

/**
 * `includeI18n`（2026-11-22 三语）：离线同步把三种语言都带上，App 按界面语言挑；
 * 在线接口先按查看者语言换好文字（text-language.ts），不带 i18n。只在发布结果有三语时才出现。
 */
export function publicTable(table: EventOperationsTable | null, options: { includeI18n?: boolean } = {}) {
  if (!table) return null;
  return {
    ...(options.includeI18n && table.i18n ? { i18n: JSON.parse(JSON.stringify(table.i18n)) as NonNullable<EventOperationsTable["i18n"]> } : {}),
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

export function publicRecommendations(recommendations: EventOperationsParticipantRecommendations | null, options: { includeI18n?: boolean } = {}) {
  return recommendations
    ? {
        noMatchReason: recommendations.noMatchReason,
        ...(options.includeI18n && recommendations.noMatchReasonI18n ? { noMatchReasonI18n: { ...recommendations.noMatchReasonI18n } } : {}),
        recommendations: recommendations.recommendations.map((recommendation) => ({
          ...(options.includeI18n && recommendation.i18n ? { i18n: JSON.parse(JSON.stringify(recommendation.i18n)) as NonNullable<typeof recommendation.i18n> } : {}),
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
