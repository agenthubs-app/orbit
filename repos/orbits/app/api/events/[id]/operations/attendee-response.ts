import type {
  EventContactRequest,
  EventOperationsParticipant,
  EventOperationsRelationshipGraph,
  EventOperationsTable,
} from "../../../../../features/events/event-operations/contract";
import type { EventOperationsAttendeeWorkspace } from "../../../../../features/events/event-operations/service";

function publicParticipant(participant: EventOperationsParticipant) {
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

function publicContactRequest(request: EventContactRequest) {
  return {
    contactId: request.contactId,
    requestId: request.requestId,
    requesterParticipantId: request.requesterParticipantId,
    status: request.status,
    targetParticipantId: request.targetParticipantId,
  };
}

function publicTable(table: EventOperationsTable | null) {
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

function publicGraph(graph: EventOperationsRelationshipGraph | null) {
  if (!graph) return null;
  return {
    edges: graph.edges.map((edge) => ({ ...edge })),
    nodes: graph.nodes.map((node) => ({ ...node })),
  };
}

/**
 * The service workspace is an internal aggregate. This mapper is the API's
 * privacy boundary: only attendee-visible fields are copied into the response,
 * so newly-added repository or domain fields cannot leak by serialization.
 */
export function toAttendeeOperationsResponse(
  workspace: EventOperationsAttendeeWorkspace,
) {
  return {
    checkIn: workspace.checkIn
      ? {
          checkedInAt: workspace.checkIn.checkedInAt,
          participantId: workspace.checkIn.participantId,
        }
      : null,
    checkInAvailable: workspace.checkInAvailable,
    configuration: {
      checkInOpensAt: workspace.configuration.checkInOpensAt,
      eventEndsAt: workspace.configuration.eventEndsAt,
      eventId: workspace.configuration.eventId,
      eventStartsAt: workspace.configuration.eventStartsAt,
      profileEditDeadlineAt: workspace.configuration.profileEditDeadlineAt,
      resultsAvailableAt: workspace.configuration.resultsAvailableAt,
      roundOneStartsAt: workspace.configuration.roundOneStartsAt,
      roundTwoStartsAt: workspace.configuration.roundTwoStartsAt,
    },
    contactRequests: workspace.contactRequests.map(publicContactRequest),
    directory: workspace.directory.map(publicParticipant),
    eventId: workspace.eventId,
    graph: publicGraph(workspace.graph),
    me: publicParticipant(workspace.me),
    profileEditable: workspace.profileEditable,
    recommendations: workspace.recommendations
      ? {
          noMatchReason: workspace.recommendations.noMatchReason,
          recommendations: workspace.recommendations.recommendations.map(
            (recommendation) => ({
              icebreakers: [...recommendation.icebreakers],
              memberHint: recommendation.memberHint,
              reasons: [...recommendation.reasons],
              score: recommendation.score,
              targetParticipantId: recommendation.targetParticipantId,
            }),
          ),
          sourceParticipantId: workspace.recommendations.sourceParticipantId,
        }
      : null,
    resultsState: workspace.resultsState,
    roundOneTable: publicTable(workspace.roundOneTable),
    roundTwoTable: publicTable(workspace.roundTwoTable),
  };
}
