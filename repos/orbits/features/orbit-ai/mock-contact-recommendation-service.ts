import { defaultMockFixtures } from "../../shared/mock/fixtures";
import {
  createOrbitAiRelationshipRecommendationService,
  inferOrbitAiContactRecommendationConcepts,
  type OrbitAiContactRecommendationCandidateProfile,
  type OrbitAiContactRecommendationSignalProfile,
  type OrbitAiRelationshipRecommendationService,
} from "./contact-recommendation-service";

function compactEvidence(value: string, maxLength = 260): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized;
}

/**
 * Explicit mock boundary: adapt the generated fixture graph into the
 * recommendation engine's domain-neutral candidate contract.
 */
export function createMockOrbitAiContactRecommendationCandidates(): readonly OrbitAiContactRecommendationCandidateProfile[] {
  return defaultMockFixtures.contacts.map((contact) => {
    const connections = defaultMockFixtures.connections
      .filter((connection) => connection.contactId === contact.id)
      .sort(
        (left, right) =>
          (right.businessRelevanceScore ?? 0) -
            (left.businessRelevanceScore ?? 0) ||
          (right.relationshipStrength ?? 0) -
            (left.relationshipStrength ?? 0),
      );
    const primaryConnection = connections[0];
    const conversations = defaultMockFixtures.conversations.filter(
      (conversation) =>
        conversation.participantContactIds.includes(contact.id),
    );
    const conversationIds = new Set(
      conversations.map((conversation) => conversation.id),
    );
    const messages = defaultMockFixtures.messages.filter((message) =>
      conversationIds.has(message.conversationId),
    );
    const attendees = defaultMockFixtures.attendees.filter(
      (attendee) => attendee.contactId === contact.id,
    );
    const attendeeIds = new Set(attendees.map((attendee) => attendee.id));
    const eventIntents = defaultMockFixtures.eventParticipantIntents.filter(
      (intent) =>
        intent.contactId === contact.id || attendeeIds.has(intent.attendeeId),
    );
    const eventIds = new Set([
      ...attendees.map((attendee) => attendee.eventId),
      ...eventIntents.map((intent) => intent.eventId),
    ]);
    const events = defaultMockFixtures.events.filter((event) =>
      eventIds.has(event.id),
    );
    const tasks = defaultMockFixtures.tasks.filter(
      (task) => task.contactId === contact.id,
    );
    const signals: OrbitAiContactRecommendationSignalProfile[] = [];

    const addSignal = (input: {
      evidenceId: string | undefined;
      privacy: OrbitAiContactRecommendationSignalProfile["privacy"];
      signal: OrbitAiContactRecommendationSignalProfile["signal"];
      snippet?: string;
      sourceLabel: string;
      text: string;
    }) => {
      const concepts = inferOrbitAiContactRecommendationConcepts(input.text);

      if (!input.evidenceId || concepts.length === 0) {
        return;
      }

      signals.push({
        concepts,
        evidenceId: input.evidenceId,
        privacy: input.privacy,
        signal: input.signal,
        snippet: compactEvidence(input.snippet ?? input.text),
        sourceLabel: input.sourceLabel,
      });
    };

    addSignal({
      evidenceId: contact.evidenceIds[0],
      privacy: "public",
      signal: "profile",
      sourceLabel: contact.source.label ?? "联系人档案",
      text: [
        contact.displayName,
        contact.organization,
        contact.role,
        contact.profileSnippet,
      ]
        .filter(Boolean)
        .join(" "),
      snippet: contact.profileSnippet,
    });
    addSignal({
      evidenceId: primaryConnection?.evidenceIds[0],
      privacy: "relationship",
      signal: "relationship",
      sourceLabel:
        primaryConnection?.source.label ?? "已记录的人脉关系",
      text: [
        primaryConnection?.summary,
        ...(primaryConnection?.sharedTopics ?? []),
        ...(primaryConnection?.suggestedActions ?? []),
      ]
        .filter(Boolean)
        .join(" "),
      snippet: [
        primaryConnection?.summary,
        primaryConnection?.suggestedActions[0],
      ]
        .filter(Boolean)
        .join(" 下一步："),
    });
    addSignal({
      evidenceId:
        eventIntents[0]?.evidenceIds[0] ?? attendees[0]?.evidenceIds[0],
      privacy: "public",
      signal: "event",
      sourceLabel: "活动参与与意向记录",
      text: [
        ...events.map((event) => event.name),
        ...eventIntents.flatMap((intent) => [
          ...intent.lookingFor,
          ...intent.canOffer,
        ]),
      ].join(" "),
      snippet: [
        events[0]?.name,
        eventIntents[0]?.lookingFor[0],
        eventIntents[0]?.canOffer[0],
      ]
        .filter(Boolean)
        .join("；"),
    });
    addSignal({
      evidenceId: messages[0]?.evidenceIds[0],
      privacy: "private",
      signal: "conversation",
      sourceLabel: messages[0]?.source.label ?? "已保存聊天",
      text: messages.map((message) => message.body).join(" "),
      snippet: messages
        .slice(-2)
        .map((message) => message.body)
        .join(" "),
    });
    addSignal({
      evidenceId: tasks[0]?.evidenceIds[0],
      privacy: "private",
      signal: "follow_up",
      sourceLabel: tasks[0]?.source.label ?? "跟进队列",
      text: tasks.map((task) => task.title).join(" "),
    });

    const relationshipStrength =
      primaryConnection?.relationshipStrength ?? 0;

    return {
      contactId: contact.id,
      displayName: contact.displayName,
      organization: contact.organization ?? "",
      prominence: Math.min(
        9,
        Math.round((primaryConnection?.businessRelevanceScore ?? 0) / 12),
      ),
      recommendedAction:
        primaryConnection?.suggestedActions[0] ??
        "先复核已有互动证据，再决定是否继续跟进。",
      relationStrength:
        relationshipStrength >= 70
          ? "strong"
          : relationshipStrength >= 45
            ? "medium"
            : "weak",
      role: contact.role ?? "",
      signals,
    };
  });
}

export function createMockOrbitAiRelationshipRecommendationService(): OrbitAiRelationshipRecommendationService {
  return createOrbitAiRelationshipRecommendationService({
    candidates: createMockOrbitAiContactRecommendationCandidates(),
  });
}
