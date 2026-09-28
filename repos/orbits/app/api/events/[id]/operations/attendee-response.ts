import type { EventOperationsRelationshipGraph } from "../../../../../features/events/event-operations/contract";
import {
  publicContactRequest,
  publicParticipant,
  publicRecommendations,
  publicTable,
} from "../../../../../features/events/event-operations/attendee-public";
import type { EventOperationsAttendeeWorkspace } from "../../../../../features/events/event-operations/service";

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
    recommendations: publicRecommendations(workspace.recommendations),
    resultsState: workspace.resultsState,
    roundOneTable: publicTable(workspace.roundOneTable),
    roundTwoTable: publicTable(workspace.roundTwoTable),
  };
}
