import assert from "node:assert/strict";
import test from "node:test";
import { createAgentActionQueueService } from "../../features/agent/service-factory";
import { createAppBootstrapService } from "../../features/bootstrap/service-factory";
import { createChatConversationMessageService } from "../../features/chat/service-factory";
import { createDashboardAggregateService } from "../../features/dashboard/service-factory";
import { createEventCrudAndImportService } from "../../features/events/service-factory";
import { createFollowupTaskGenerationService } from "../../features/followups/service-factory";
import type { MockRuntimeFixtures } from "../../shared/mock/fixtures";
import { defaultMockFixtures } from "../../shared/mock/fixtures";

function createCoreHybridSeed(): MockRuntimeFixtures {
  const accountId = defaultMockFixtures.accounts[0].id;
  const profileId = defaultMockFixtures.profiles[0].id;
  const generatedAt = "2026-06-30T08:00:00.000Z";

  return {
    ...defaultMockFixtures,
    generatedAt,
    evidence: [
      ...defaultMockFixtures.evidence,
      {
        id: "evidence_hybrid_agent_lab",
        sourceType: "manual",
        sourceId: "source:hybrid:agent-lab",
        summary:
          "Hybrid local remote seed links Mira Ito to agent workflow testing.",
        occurredAt: "2026-06-30T07:30:00.000Z",
        confidence: 0.93,
        createdBy: profileId,
      },
      {
        id: "evidence_hybrid_event_lab",
        sourceType: "event_import",
        sourceId: "event_hybrid_agent_lab",
        summary:
          "Hybrid event seed is available for agent event planning tests.",
        occurredAt: "2026-06-30T07:45:00.000Z",
        confidence: 0.9,
        createdBy: profileId,
      },
    ],
    contacts: [
      ...defaultMockFixtures.contacts,
      {
        id: "contact_hybrid_mira",
        displayName: "Mira Ito",
        organization: "Agent Lab",
        role: "Operator",
        location: "Tokyo",
        profileSnippet:
          "Operator testing hybrid local-remote relationship workflows.",
        primaryEmail: "mira@example.test",
        stage: "needs_follow_up",
        source: {
          type: "manual",
          id: "source:hybrid:mira",
          label: "Hybrid local remote contact seed",
        },
        evidenceIds: ["evidence_hybrid_agent_lab"],
        createdAt: "2026-06-30T07:35:00.000Z",
        updatedAt: generatedAt,
      },
    ],
    connections: [
      ...defaultMockFixtures.connections,
      {
        id: "connection_hybrid_mira",
        accountId,
        contactId: "contact_hybrid_mira",
        stage: "needs_follow_up",
        valueTypes: ["commercial_opportunity", "knowledge_exchange"],
        summary:
          "Mira is validating agent behavior against hybrid local remote data.",
        source: {
          type: "manual",
          id: "source:hybrid:mira-connection",
          label: "Hybrid local remote connection seed",
        },
        evidenceIds: ["evidence_hybrid_agent_lab"],
        createdAt: "2026-06-30T07:36:00.000Z",
        updatedAt: generatedAt,
      },
    ],
    events: [
      ...defaultMockFixtures.events,
      {
        id: "event_hybrid_agent_lab",
        name: "Hybrid Agent Lab",
        location: "Orbit Studio",
        startsAt: "2026-07-01T09:00:00.000Z",
        endsAt: "2026-07-01T10:30:00.000Z",
        source: {
          type: "event_import",
          id: "source:hybrid:event-lab",
          label: "Hybrid local remote event seed",
        },
        evidenceIds: ["evidence_hybrid_event_lab"],
      },
    ],
    tasks: [
      ...defaultMockFixtures.tasks,
      {
        id: "task_hybrid_mira_followup",
        title: "Ask Mira to review the hybrid agent test plan",
        status: "open",
        contactId: "contact_hybrid_mira",
        connectionId: "connection_hybrid_mira",
        dueAt: "2026-07-01T02:00:00.000Z",
        source: {
          type: "agent_action",
          id: "agent_action_hybrid_mira",
          label: "Hybrid local remote task seed",
        },
        evidenceIds: ["evidence_hybrid_agent_lab"],
        createdAt: "2026-06-30T07:40:00.000Z",
        updatedAt: generatedAt,
      },
    ],
    conversations: [
      ...defaultMockFixtures.conversations,
      {
        id: "conversation_hybrid_mira",
        participantContactIds: ["contact_hybrid_mira"],
        channel: "chat",
        source: {
          type: "manual",
          id: "source:hybrid:mira-chat",
          label: "Hybrid local remote chat seed",
        },
        evidenceIds: ["evidence_hybrid_agent_lab"],
        updatedAt: generatedAt,
      },
    ],
    messages: [
      ...defaultMockFixtures.messages,
      {
        id: "message_hybrid_mira_context",
        conversationId: "conversation_hybrid_mira",
        direction: "inbound",
        body: "Please make sure the agent reads the hybrid local remote dataset.",
        occurredAt: "2026-06-30T07:50:00.000Z",
        createdBy: profileId,
        source: {
          type: "manual",
          id: "source:hybrid:mira-chat-message",
          label: "Hybrid local remote chat message seed",
        },
        evidenceIds: ["evidence_hybrid_agent_lab"],
      },
    ],
    agentActions: [
      ...defaultMockFixtures.agentActions,
      {
        id: "agent_action_hybrid_mira",
        type: "draft_message",
        status: "awaiting_confirmation",
        confirmationRequired: true,
        source: {
          type: "agent_action",
          id: "source:hybrid:mira-agent-action",
          label: "Hybrid local remote agent action seed",
        },
        evidenceIds: ["evidence_hybrid_agent_lab"],
        createdAt: "2026-06-30T07:55:00.000Z",
        updatedAt: generatedAt,
      },
    ],
  };
}

test("core agent-facing services read the same hybrid local remote database seed", () => {
  const previousSeed = process.env.ORBIT_LOCAL_REMOTE_DATABASE_SEED_JSON;
  const previousMode = process.env.ORBIT_MODULE_MODE;

  try {
    process.env.ORBIT_MODULE_MODE = "hybrid";
    process.env.ORBIT_LOCAL_REMOTE_DATABASE_SEED_JSON = JSON.stringify(
      createCoreHybridSeed(),
    );

    const events = createEventCrudAndImportService().listEvents();
    const tasks = createFollowupTaskGenerationService().listTasks();
    const dashboard = createDashboardAggregateService().getDashboardAggregate();
    const actions = createAgentActionQueueService().listActions();
    const bootstrap = createAppBootstrapService().getAppBootstrap();
    const conversations =
      createChatConversationMessageService().listConversations();
    const thread = createChatConversationMessageService().getMessageThread({
      conversationId: "conversation_hybrid_mira",
    });

    assert.equal(events.success, true);
    assert.equal(tasks.success, true);
    assert.equal(dashboard.success, true);
    assert.equal(actions.success, true);
    assert.equal(bootstrap.success, true);
    assert.equal(conversations.success, true);
    assert.equal(thread.success, true);

    assert.ok(
      events.data.events.some((event) => event.title === "Hybrid Agent Lab"),
    );
    assert.ok(
      tasks.data.tasks.some(
        (task) => task.taskId === "task_hybrid_mira_followup",
      ),
    );
    assert.equal(
      dashboard.data.relationshipAssetTotals.eventsRepresented,
      defaultMockFixtures.events.length + 1,
    );
    assert.ok(
      actions.data.actions.some(
        (action) => action.actionId === "agent_action_hybrid_mira",
      ),
    );
    assert.ok(
      bootstrap.data.pendingTasks.some(
        (task) => task.taskId === "task_hybrid_mira_followup",
      ),
    );
    assert.ok(
      conversations.data.conversations.some(
        (conversation) =>
          conversation.conversationId === "conversation_hybrid_mira",
      ),
    );
    assert.ok(
      thread.data.messages.some(
        (message) =>
          message.body ===
          "Please make sure the agent reads the hybrid local remote dataset.",
      ),
    );

    assert.equal(events.data.provenance.source.includes("local-remote-store"), true);
    assert.equal(tasks.data.provenance.source.includes("local-remote-store"), true);
    assert.equal(
      dashboard.data.provenance.source.includes("local-remote-store"),
      true,
    );
    assert.equal(actions.data.provenance.source.includes("local-remote-store"), true);
    assert.equal(
      bootstrap.data.provenance.source.includes("local-remote-store"),
      true,
    );
    assert.equal(
      conversations.data.provenance.source.includes("local-remote-store"),
      true,
    );
  } finally {
    if (previousSeed === undefined) {
      delete process.env.ORBIT_LOCAL_REMOTE_DATABASE_SEED_JSON;
    } else {
      process.env.ORBIT_LOCAL_REMOTE_DATABASE_SEED_JSON = previousSeed;
    }

    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }
  }
});
