import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationPayloadToChatView,
  conversationsToSummaries,
  proactiveTurnPayloadToChatView
} from "../src/view-models/conversations";

test("conversationPayloadToChatView maps assistant reply messages and proposed tool intents", () => {
  const view = conversationPayloadToChatView({
    activeConversationId: "conversation-1",
    assistantMessage: "You should prepare three warm intros.",
    messages: [
      {
        content: "Who should I meet tomorrow?",
        createdAt: "2026-07-03T10:00:00.000Z",
        messageId: "message-1",
        role: "user"
      },
      {
        content: "You should prepare three warm intros.",
        createdAt: "2026-07-03T10:01:00.000Z",
        messageId: "message-2",
        role: "assistant"
      }
    ],
    proposedToolIntents: [
      {
        intentId: "intent-1",
        label: "Find relevant people",
        reason: "The event has attendees in your target market.",
        requiresUserConfirmation: true
      }
    ]
  });

  assert.deepEqual(view, {
    activeConversationId: "conversation-1",
    assistantMessage: "You should prepare three warm intros.",
    messages: [
      {
        content: "Who should I meet tomorrow?",
        createdAt: "2026-07-03T10:00:00.000Z",
        id: "message-1",
        role: "user"
      },
      {
        content: "You should prepare three warm intros.",
        createdAt: "2026-07-03T10:01:00.000Z",
        id: "message-2",
        role: "assistant"
      }
    ],
    proposedToolIntents: [
      {
        id: "intent-1",
        label: "Find relevant people",
        reason: "The event has attendees in your target market.",
        requiresUserConfirmation: true
      }
    ]
  });
});

test("conversationPayloadToChatView uses safe defaults for empty payloads", () => {
  assert.deepEqual(conversationPayloadToChatView({}), {
    activeConversationId: null,
    assistantMessage: "",
    messages: [],
    proposedToolIntents: []
  });
});

test("proactiveTurnPayloadToChatView maps in-chat proactive turns", () => {
  const view = proactiveTurnPayloadToChatView({
    message: {
      content:
        "Orbit needs attention: Daniel follow-up is due. The sourced draft is ready for review.",
      conversationId: "live-orbit-ai-proactive-conversation",
      createdAt: "2026-07-02T09:00:00.000Z",
      deliverySurface: "orbit_ai_chat",
      messageId: "proactive-live-message:signal-followup-daniel",
      role: "assistant",
      sourceSignalId: "signal-followup-daniel",
      turnKind: "proactive"
    },
    provenance: {
      generationMethod: "live-policy-proactive-turn"
    },
    suggestedActions: [
      {
        actionId: "review-followup",
        label: "Review follow-up",
        requiresConfirmation: true,
        targetSurface: "orbit_ai_chat"
      }
    ]
  });

  assert.deepEqual(view, {
    activeConversationId: "live-orbit-ai-proactive-conversation",
    assistantMessage:
      "Orbit needs attention: Daniel follow-up is due. The sourced draft is ready for review.",
    messages: [
      {
        content:
          "Orbit needs attention: Daniel follow-up is due. The sourced draft is ready for review.",
        createdAt: "2026-07-02T09:00:00.000Z",
        id: "proactive-live-message:signal-followup-daniel",
        role: "assistant"
      }
    ],
    proposedToolIntents: [
      {
        id: "review-followup",
        label: "Review follow-up",
        reason: "Suggested by Orbit AI.",
        requiresUserConfirmation: true
      }
    ]
  });
});

test("conversationsToSummaries hides implementation labels in titles", () => {
  const summaries = conversationsToSummaries({
    conversations: [
      {
        conversationId: "conversation-1",
        lastMessagePreview:
          "Orbit Agent is ready for a natural-language request.",
        title: "Orbit Agent live conversation"
      }
    ]
  });

  assert.deepEqual(summaries, [
    {
      id: "conversation-1",
      preview: "Orbit AI is ready for a natural-language request.",
      title: "Orbit AI conversation"
    }
  ]);
});
