import type {
  AccountDTO,
  AgentActionDTO,
  ConnectionDTO,
  ContactDTO,
  ConversationDTO,
  DashboardDTO,
  EventDTO,
  IsoDateTimeString,
  MessageDTO,
  NotificationDTO,
  OrbitId,
  PermissionStateDTO,
  RelationshipEvidenceDTO,
  TaskDTO,
  UserProfileDTO,
} from "../domain/contracts";
import type { SourceReferenceDTO } from "../domain/source-types";

export const MOCK_FIXTURE_COLLECTION_NAMES = [
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
  contacts: ContactDTO[];
  connections: ConnectionDTO[];
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

export const defaultMockFixtures: MockRuntimeFixtures = {
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
