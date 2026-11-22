import type { EventOperationsRelationshipGraph } from "../../../../../features/events/event-operations/contract";
import {
  publicContactRequest,
  publicParticipant,
  publicRecommendations,
  publicTable,
} from "../../../../../features/events/event-operations/attendee-public";
import type { EventOperationsAttendeeWorkspace } from "../../../../../features/events/event-operations/service";
import {
  participantRecommendationsIn,
  tableIn,
} from "../../../../../features/events/event-operations/text-language";
import type { EventOperationsTextLanguage } from "../../../../../features/events/event-operations/contract";

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
  language: EventOperationsTextLanguage = "zh",
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
    // AI 文字按查看者语言（2026-11-22 三语）；旧发布结果没有三语时原样返回。
    recommendations: publicRecommendations(workspace.recommendations ? participantRecommendationsIn(workspace.recommendations, language) : null),
    resultsState: workspace.resultsState,
    roundOneTable: publicTable(workspace.roundOneTable ? tableIn(workspace.roundOneTable, language) : null),
    roundTwoTable: publicTable(workspace.roundTwoTable ? tableIn(workspace.roundTwoTable, language) : null),
  };
}
