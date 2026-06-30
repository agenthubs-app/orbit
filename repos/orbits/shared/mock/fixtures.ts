/**
 * 全局 mock fixture 注册表。
 *
 * 这里把账户、profile、活动、联系人、证据、任务、Agent 动作和权限等 seed 数据
 * 汇总为一个 `MockRuntimeFixtures`。共享 mock runtime 会基于它 clone 状态，
 * 让各 capability 在没有 live provider 时也能使用同一组 source-backed 数据。
 */
import type {
  AccountDTO,
  AgentActionDTO,
  AiAnalysisDTO,
  ConnectionDTO,
  ContactDTO,
  ConversationDTO,
  DashboardDTO,
  EventParticipantIntentDTO,
  EventDTO,
  InteractionMemoryDTO,
  IsoDateTimeString,
  MatchRecommendationDTO,
  MessageDTO,
  NotificationDTO,
  OrbitId,
  PermissionStateDTO,
  RecommendationTestRecordDTO,
  RelationshipEvidenceDTO,
  TaskDTO,
  UserProfileDTO,
} from "../domain/contracts";
import type { SourceReferenceDTO } from "../domain/source-types";
import { generatedRelationshipFixtures } from "./generated-relationship-fixtures";

export const MOCK_FIXTURE_COLLECTION_NAMES = [
  // collection 名称同时用于 reset/registry 展示和 state store 的统一遍历。
  "accounts",
  "profiles",
  "events",
  "attendees",
  "contacts",
  "connections",
  "evidence",
  "tasks",
  "conversations",
  "messages",
  "dashboards",
  "agentActions",
  "permissions",
  "notifications",
  "eventParticipantIntents",
  "aiAnalyses",
  "matchRecommendations",
  "interactionMemories",
  "recommendationTests",
] as const;

export type MockFixtureCollectionName =
  (typeof MOCK_FIXTURE_COLLECTION_NAMES)[number];

export interface EventAttendeeDTO {
  id: OrbitId;
  eventId: OrbitId;
  contactId?: OrbitId;
  displayName: string;
  organization?: string;
  role?: string;
  status: "imported" | "reviewed" | "skipped";
  source: SourceReferenceDTO;
  evidenceIds: readonly [OrbitId, ...OrbitId[]];
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface MockRuntimeFixtures {
  id: OrbitId;
  label: string;
  description: string;
  generatedAt: IsoDateTimeString;
  accounts: AccountDTO[];
  profiles: UserProfileDTO[];
  events: EventDTO[];
  attendees: EventAttendeeDTO[];
  eventParticipantIntents: EventParticipantIntentDTO[];
  contacts: ContactDTO[];
  connections: ConnectionDTO[];
  aiAnalyses: AiAnalysisDTO[];
  matchRecommendations: MatchRecommendationDTO[];
  interactionMemories: InteractionMemoryDTO[];
  recommendationTests: RecommendationTestRecordDTO[];
  evidence: RelationshipEvidenceDTO[];
  tasks: TaskDTO[];
  conversations: ConversationDTO[];
  messages: MessageDTO[];
  dashboards: DashboardDTO[];
  agentActions: AgentActionDTO[];
  permissions: PermissionStateDTO[];
  notifications: NotificationDTO[];
}

const accountId = "account_orbit_demo";
const profileId = "profile_ari_kato";
const eventId = "event_orbit_summit_2026";
const attendeeMinaId = "attendee_mina_tanaka";
const attendeeNiaId = "attendee_nia_patel";
const contactMinaId = "contact_mina_tanaka";
const contactNiaId = "contact_nia_patel";
const connectionMinaId = "connection_mina_tanaka";
const connectionNiaId = "connection_nia_patel";
const conversationMinaId = "conversation_mina_followup";
const matchRecommendationMinaId = "match_recommendation_mina_operator_intro";

const generatedAt = "2026-06-24T12:00:00.000Z";
const eventSource: SourceReferenceDTO = {
  type: "event_import",
  id: eventId,
  label: "Orbit Summit founder roster",
};
const agentSource: SourceReferenceDTO = {
  type: "agent_action",
  id: "agent_action_draft_mina_intro",
  label: "Mock agent follow-up recommendation",
};
const systemSource: SourceReferenceDTO = {
  type: "system",
  id: "mock_runtime_seed",
  label: "Sprint 6 mock runtime seed",
};

export const legacyDefaultMockFixtures: MockRuntimeFixtures = {
  // 默认 fixture 描述一套完整关系图：活动导入 -> 参会者 -> 联系人 -> 证据 -> Agent 建议。
  id: "mock_fixture_default",
  label: "Default Orbit relationship graph",
  description:
    "Source-backed seed data for the mock capability runtime before live providers exist.",
  generatedAt,
  accounts: [
    {
      id: accountId,
      name: "Orbit Demo Workspace",
      createdAt: "2026-06-20T09:00:00.000Z",
      updatedAt: generatedAt,
    },
  ],
  profiles: [
    {
      id: profileId,
      accountId,
      displayName: "Ari Kato",
      role: "Founder",
      timezone: "Asia/Tokyo",
      createdAt: "2026-06-20T09:05:00.000Z",
      updatedAt: generatedAt,
    },
  ],
  evidence: [
    {
      id: "evidence_event_roster",
      sourceType: "event_import",
      sourceId: eventId,
      summary: "Imported the Orbit Summit founder roster for post-event review.",
      occurredAt: "2026-06-24T09:00:00.000Z",
      confidence: 0.96,
      createdBy: profileId,
    },
    {
      id: "evidence_mina_badge",
      sourceType: "qr_scan",
      sourceId: `${eventId}/${attendeeMinaId}/badge`,
      summary: "Badge scan identified Mina Tanaka from Northstar Labs.",
      occurredAt: "2026-06-24T10:15:00.000Z",
      confidence: 0.9,
      createdBy: profileId,
    },
    {
      id: "evidence_nia_referral",
      sourceType: "referral",
      sourceId: `${eventId}/${attendeeNiaId}/intro`,
      summary: "Nia Patel offered to introduce Ari to operators in her community.",
      occurredAt: "2026-06-24T10:32:00.000Z",
      confidence: 0.86,
      createdBy: profileId,
    },
    {
      id: "evidence_mina_email",
      sourceType: "email_signal",
      sourceId: "email_thread_mina_followup",
      summary: "Mina replied with a request for a hiring-market operator intro.",
      occurredAt: "2026-06-24T11:20:00.000Z",
      confidence: 0.88,
      createdBy: profileId,
    },
    {
      id: "evidence_mina_roundtable_note",
      sourceType: "manual",
      sourceId: `${eventId}/${attendeeMinaId}/roundtable-note`,
      summary:
        "Roundtable note: Mina can share marketplace hiring lessons and prefers Japanese follow-up.",
      occurredAt: "2026-06-24T10:28:00.000Z",
      confidence: 0.84,
      createdBy: profileId,
    },
    {
      id: "evidence_nia_community_note",
      sourceType: "manual",
      sourceId: `${eventId}/${attendeeNiaId}/community-note`,
      summary:
        "Event note: Nia offered community context but should not receive a sales intro recommendation.",
      occurredAt: "2026-06-24T10:38:00.000Z",
      confidence: 0.8,
      createdBy: profileId,
    },
    {
      id: "evidence_dirty_roster_duplicate",
      sourceType: "event_import",
      sourceId: `${eventId}/dirty-row/duplicate-mina`,
      summary:
        "Recommendation test fixture for a duplicate attendee row with partial organization text.",
      occurredAt: "2026-06-24T09:05:00.000Z",
      confidence: 0.74,
      createdBy: profileId,
    },
    {
      id: "evidence_agent_recommendation",
      sourceType: "agent_action",
      sourceId: "agent_action_draft_mina_intro",
      summary: "Mock agent suggested drafting a warm intro but requiring confirmation.",
      occurredAt: "2026-06-24T11:35:00.000Z",
      confidence: 0.82,
      createdBy: profileId,
    },
    {
      id: "evidence_permission_stage",
      sourceType: "system",
      sourceId: "permission_email_signals",
      summary: "Email signal permission remains staged in mock mode.",
      occurredAt: "2026-06-24T11:40:00.000Z",
      confidence: 1,
      createdBy: profileId,
    },
  ],
  events: [
    {
      id: eventId,
      name: "Orbit Summit Founder Roundtable",
      location: "Tokyo Midtown",
      startsAt: "2026-06-24T09:00:00.000Z",
      endsAt: "2026-06-24T12:30:00.000Z",
      source: eventSource,
      evidenceIds: ["evidence_event_roster"],
    },
  ],
  attendees: [
    {
      id: attendeeMinaId,
      eventId,
      contactId: contactMinaId,
      displayName: "Mina Tanaka",
      organization: "Northstar Labs",
      role: "Founder",
      status: "reviewed",
      source: eventSource,
      evidenceIds: ["evidence_event_roster", "evidence_mina_badge"],
      createdAt: "2026-06-24T10:16:00.000Z",
      updatedAt: generatedAt,
    },
    {
      id: attendeeNiaId,
      eventId,
      contactId: contactNiaId,
      displayName: "Nia Patel",
      organization: "Civic Operators Guild",
      role: "Community lead",
      status: "imported",
      source: eventSource,
      evidenceIds: ["evidence_event_roster", "evidence_nia_referral"],
      createdAt: "2026-06-24T10:33:00.000Z",
      updatedAt: generatedAt,
    },
  ],
  eventParticipantIntents: [
    {
      id: "event_intent_mina_tanaka_orbit_summit",
      eventId,
      attendeeId: attendeeMinaId,
      contactId: contactMinaId,
      lookingFor: [
        "operator intros for hiring marketplaces",
        "Japan go-to-market context",
      ],
      canOffer: [
        "marketplace product lessons",
        "founder hiring experiments",
      ],
      preferredLanguage: "ja",
      confidence: 0.86,
      source: {
        type: "manual",
        id: `${eventId}/${attendeeMinaId}/roundtable-note`,
        label: "Orbit Summit roundtable note",
      },
      evidenceIds: ["evidence_mina_roundtable_note", "evidence_mina_email"],
      createdAt: "2026-06-24T10:30:00.000Z",
      updatedAt: generatedAt,
    },
    {
      id: "event_intent_nia_patel_orbit_summit",
      eventId,
      attendeeId: attendeeNiaId,
      contactId: contactNiaId,
      lookingFor: ["operator community signal exchange"],
      canOffer: [
        "community-led referral context",
        "warm introductions to civic operators",
      ],
      preferredLanguage: "en",
      confidence: 0.81,
      source: {
        type: "manual",
        id: `${eventId}/${attendeeNiaId}/community-note`,
        label: "Orbit Summit community note",
      },
      evidenceIds: ["evidence_nia_referral", "evidence_nia_community_note"],
      createdAt: "2026-06-24T10:39:00.000Z",
      updatedAt: generatedAt,
    },
  ],
  contacts: [
    {
      id: contactMinaId,
      displayName: "Mina Tanaka",
      organization: "Northstar Labs",
      role: "Founder",
      primaryEmail: "mina@example.test",
      stage: "needs_follow_up",
      source: {
        type: "qr_scan",
        id: `${eventId}/${attendeeMinaId}/badge`,
        label: "Orbit Summit badge scan",
      },
      evidenceIds: ["evidence_mina_badge", "evidence_mina_email"],
      createdAt: "2026-06-24T10:16:00.000Z",
      updatedAt: generatedAt,
    },
    {
      id: contactNiaId,
      displayName: "Nia Patel",
      organization: "Civic Operators Guild",
      role: "Community lead",
      primaryEmail: "nia@example.test",
      stage: "active",
      source: {
        type: "referral",
        id: `${eventId}/${attendeeNiaId}/intro`,
        label: "Orbit Summit referral note",
      },
      evidenceIds: ["evidence_nia_referral"],
      createdAt: "2026-06-24T10:34:00.000Z",
      updatedAt: generatedAt,
    },
  ],
  connections: [
    {
      id: connectionMinaId,
      accountId,
      contactId: contactMinaId,
      stage: "needs_follow_up",
      valueTypes: ["commercial_opportunity", "knowledge_exchange"],
      summary:
        "Mina is exploring hiring-market operator intros after the Orbit Summit roundtable.",
      relationshipStrength: 78,
      trustLevel: "warm",
      businessRelevanceScore: 84,
      sharedTopics: [
        "hiring marketplaces",
        "operator introductions",
        "Tokyo founder community",
      ],
      suggestedActions: [
        "draft warm intro to marketplace operator",
        "schedule post-event follow-up within 24 hours",
      ],
      source: {
        type: "email_signal",
        id: "email_thread_mina_followup",
        label: "Mock email signal",
      },
      evidenceIds: ["evidence_mina_badge", "evidence_mina_email"],
      createdAt: "2026-06-24T11:25:00.000Z",
      updatedAt: generatedAt,
    },
    {
      id: connectionNiaId,
      accountId,
      contactId: contactNiaId,
      stage: "active",
      valueTypes: ["referral_path", "community_context"],
      summary:
        "Nia can provide community context and warm introductions for operator referrals.",
      relationshipStrength: 64,
      trustLevel: "emerging",
      businessRelevanceScore: 72,
      sharedTopics: [
        "operator communities",
        "referral paths",
        "civic technology",
      ],
      suggestedActions: [
        "capture community context",
        "ask permission before requesting a sales introduction",
      ],
      source: {
        type: "referral",
        id: `${eventId}/${attendeeNiaId}/intro`,
        label: "Referral context",
      },
      evidenceIds: ["evidence_nia_referral"],
      createdAt: "2026-06-24T10:45:00.000Z",
      updatedAt: generatedAt,
    },
  ],
  aiAnalyses: [
    {
      id: "ai_analysis_mina_event_intent",
      analysisType: "event_intent",
      target: {
        type: "attendee",
        id: attendeeMinaId,
      },
      resultJson: {
        extractedSignals: [
          "operator intros for hiring marketplaces",
          "Japan go-to-market context",
          "prefers Japanese follow-up",
        ],
        rejectedFields: {
          personalityLabel: "Too subjective for a top-level query field.",
        },
      },
      confidence: 0.86,
      source: {
        type: "agent_action",
        id: "agent_action_draft_mina_intro",
        label: "Mock semantic intent extraction",
      },
      evidenceIds: ["evidence_mina_roundtable_note", "evidence_mina_email"],
      createdAt: "2026-06-24T11:34:00.000Z",
    },
    {
      id: "ai_analysis_mina_relationship_profile",
      analysisType: "relationship_profile",
      target: {
        type: "connection",
        id: connectionMinaId,
      },
      resultJson: {
        rationale:
          "Mina's explicit follow-up request plus badge context justify a warm but not trusted relationship.",
        scoringInputs: {
          recency: "same-day",
          evidenceCount: 3,
          directAsk: true,
        },
      },
      confidence: 0.82,
      source: agentSource,
      evidenceIds: [
        "evidence_mina_badge",
        "evidence_mina_roundtable_note",
        "evidence_mina_email",
      ],
      createdAt: "2026-06-24T11:35:00.000Z",
    },
  ],
  matchRecommendations: [
    {
      id: matchRecommendationMinaId,
      eventId,
      attendeeId: attendeeMinaId,
      contactId: contactMinaId,
      connectionId: connectionMinaId,
      recommendationType: "warm_intro",
      score: 91,
      businessRelevanceScore: 84,
      sharedTopics: [
        "hiring marketplaces",
        "operator introductions",
        "Tokyo founder community",
      ],
      suggestedActions: [
        "draft warm intro to marketplace operator",
        "schedule post-event follow-up within 24 hours",
      ],
      reason:
        "Mina made a direct operator-intro ask and has enough evidence to justify a confirmation-gated draft.",
      source: agentSource,
      evidenceIds: ["evidence_mina_email", "evidence_agent_recommendation"],
      createdAt: "2026-06-24T11:36:00.000Z",
      updatedAt: generatedAt,
    },
  ],
  interactionMemories: [
    {
      id: "interaction_memory_mina_intro_request",
      contactId: contactMinaId,
      connectionId: connectionMinaId,
      conversationId: conversationMinaId,
      messageId: "message_mina_intro_request",
      memoryType: "follow_up_request",
      summary:
        "Mina asked for an operator intro related to hiring marketplaces after the summit.",
      occurredAt: "2026-06-24T11:20:00.000Z",
      confidence: 0.88,
      source: {
        type: "email_signal",
        id: "email_thread_mina_followup/message_1",
        label: "Mock email signal message",
      },
      evidenceIds: ["evidence_mina_email"],
      createdAt: "2026-06-24T11:21:00.000Z",
    },
  ],
  recommendationTests: [
    {
      id: "recommendation_test_golden_mina_intro",
      caseType: "golden_match",
      eventId,
      attendeeId: attendeeMinaId,
      contactId: contactMinaId,
      connectionId: connectionMinaId,
      recommendationId: matchRecommendationMinaId,
      expectedOutcome: "recommend",
      reason:
        "Direct ask, warm relationship strength, and source-backed business relevance should produce a recommendation.",
      confidence: 0.93,
      source: systemSource,
      evidenceIds: ["evidence_mina_email", "evidence_agent_recommendation"],
      createdAt: generatedAt,
    },
    {
      id: "recommendation_test_negative_nia_sales_intro",
      caseType: "negative_case",
      eventId,
      attendeeId: attendeeNiaId,
      contactId: contactNiaId,
      connectionId: connectionNiaId,
      expectedOutcome: "suppress",
      reason:
        "Nia offered community context, not a sales-path ask, so an immediate sales intro should be suppressed.",
      confidence: 0.79,
      source: systemSource,
      evidenceIds: ["evidence_nia_referral", "evidence_nia_community_note"],
      createdAt: generatedAt,
    },
    {
      id: "recommendation_test_dirty_duplicate_mina_row",
      caseType: "dirty_data",
      eventId,
      attendeeId: attendeeMinaId,
      contactId: contactMinaId,
      expectedOutcome: "manual_review",
      reason:
        "Duplicate attendee-like input should be reviewed instead of creating a second recommendation target.",
      confidence: 0.74,
      source: {
        type: "event_import",
        id: `${eventId}/dirty-row/duplicate-mina`,
        label: "Dirty roster row fixture",
      },
      evidenceIds: ["evidence_dirty_roster_duplicate"],
      createdAt: generatedAt,
    },
  ],
  tasks: [
    {
      id: "task_mina_intro_draft",
      title: "Draft Mina's hiring-market intro",
      status: "open",
      contactId: contactMinaId,
      connectionId: connectionMinaId,
      dueAt: "2026-06-25T02:00:00.000Z",
      source: agentSource,
      evidenceIds: ["evidence_mina_email", "evidence_agent_recommendation"],
      createdAt: "2026-06-24T11:36:00.000Z",
      updatedAt: generatedAt,
    },
  ],
  conversations: [
    {
      id: conversationMinaId,
      participantContactIds: [contactMinaId],
      channel: "email",
      source: {
        type: "email_signal",
        id: "email_thread_mina_followup",
        label: "Mock email thread",
      },
      evidenceIds: ["evidence_mina_email"],
      updatedAt: generatedAt,
    },
  ],
  messages: [
    {
      id: "message_mina_intro_request",
      conversationId: conversationMinaId,
      direction: "inbound",
      body: "Could you introduce me to an operator who understands hiring marketplaces?",
      occurredAt: "2026-06-24T11:20:00.000Z",
      createdBy: profileId,
      source: {
        type: "email_signal",
        id: "email_thread_mina_followup/message_1",
        label: "Mock email signal message",
      },
      evidenceIds: ["evidence_mina_email"],
    },
  ],
  dashboards: [
    {
      id: "dashboard_today",
      accountId,
      generatedAt,
      items: [
        {
          id: "dashboard_item_mina_followup",
          title: "Mina Tanaka needs a sourced intro draft",
          summary:
            "Email signal and badge evidence point to one follow-up before the relationship cools.",
          valueType: "commercial_opportunity",
          source: agentSource,
          evidenceIds: ["evidence_mina_email", "evidence_agent_recommendation"],
        },
        {
          id: "dashboard_item_nia_referral",
          title: "Nia Patel can help with community context",
          summary:
            "Referral evidence links Nia to operator introductions after the event.",
          valueType: "referral_path",
          source: {
            type: "referral",
            id: `${eventId}/${attendeeNiaId}/intro`,
            label: "Referral context",
          },
          evidenceIds: ["evidence_nia_referral"],
        },
      ],
      source: agentSource,
      evidenceIds: ["evidence_mina_email", "evidence_agent_recommendation"],
    },
  ],
  agentActions: [
    {
      id: "agent_action_draft_mina_intro",
      type: "draft_message",
      status: "awaiting_confirmation",
      confirmationRequired: true,
      source: agentSource,
      evidenceIds: ["evidence_mina_email", "evidence_agent_recommendation"],
      createdAt: "2026-06-24T11:35:00.000Z",
      updatedAt: generatedAt,
    },
  ],
  permissions: [
    {
      id: "permission_email_signals",
      capability: "email_signals",
      state: "requested",
      updatedAt: generatedAt,
      source: systemSource,
      evidenceIds: ["evidence_permission_stage"],
    },
  ],
  notifications: [
    {
      id: "notification_mina_followup",
      channel: "in_app",
      title: "Review Mina's intro draft",
      body: "A mock agent action is waiting for confirmation before any external send.",
      status: "pending",
      scheduledFor: "2026-06-24T12:30:00.000Z",
      source: agentSource,
      evidenceIds: ["evidence_agent_recommendation"],
      createdAt: "2026-06-24T11:37:00.000Z",
    },
  ],
};

function withGeneratedTaskConnectionIds(
  fixtures: MockRuntimeFixtures,
): MockRuntimeFixtures {
  const fallbackAccountId = fixtures.accounts[0]?.id ?? "account_orbit_generated";
  const contactsById = new Map(
    fixtures.contacts.map((contact) => [contact.id, contact]),
  );
  const connectionsByContactId = new Map(
    fixtures.connections.map((connection) => [
      connection.contactId,
      connection.id,
    ]),
  );
  const synthesizedConnections: ConnectionDTO[] = [];

  // Generated follow-up tasks are task-first records; keep the exported graph
  // source-consistent by materializing the relationship edge they depend on.
  const tasks = fixtures.tasks.map((task) => {
    if (task.connectionId || !task.contactId) {
      return task;
    }

    const connectionId =
      connectionsByContactId.get(task.contactId) ??
      `connection_for_${task.id}`;

    if (!connectionsByContactId.has(task.contactId)) {
      const contact = contactsById.get(task.contactId);

      synthesizedConnections.push({
        id: connectionId,
        accountId: fallbackAccountId,
        contactId: task.contactId,
        stage: task.status === "completed" ? "active" : "needs_follow_up",
        valueTypes: ["commercial_opportunity"],
        summary: contact
          ? `Generated follow-up task relationship for ${contact.displayName}.`
          : `Generated follow-up task relationship for ${task.contactId}.`,
        relationshipStrength: 50,
        trustLevel: "emerging",
        businessRelevanceScore: 50,
        sharedTopics: ["generated follow-up"],
        suggestedActions: [task.title],
        source: task.source,
        evidenceIds: task.evidenceIds,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
      connectionsByContactId.set(task.contactId, connectionId);
    }

    return { ...task, connectionId };
  });

  return {
    ...fixtures,
    connections: [
      ...fixtures.connections,
      ...synthesizedConnections,
    ],
    tasks,
  };
}

export const defaultMockFixtures: MockRuntimeFixtures =
  withGeneratedTaskConnectionIds(generatedRelationshipFixtures);
