import assert from "node:assert/strict";
import test from "node:test";
import { createLiveChatConversationMessageService } from "../../features/chat/live-service";
import { createLiveRelationshipStageAndProfileService } from "../../features/connections/live-profile-service";
import { createMockOrbitAiContactRecommendationCandidates } from "../../features/orbit-ai/mock-contact-recommendation-service";
import { defaultMockFixtures } from "../../shared/mock/fixtures";

test("relationship profile and chat accept connections without an optional suggested action", async () => {
  const connections = defaultMockFixtures.connections.map(({ suggestedActions: _unused, ...connection }) => connection);
  const graph = { ...defaultMockFixtures, connections, generatedAt: "2026-09-17T00:00:00.000Z", profileId: defaultMockFixtures.profiles[0]!.id };
  const profile = createLiveRelationshipStageAndProfileService({ provider: {
    source: "test", sourceLabel: "Test", readConnectionEvidenceGraph: () => graph,
  } });
  const result = await profile.updateProfile({ connectionId: connections[0]!.id });
  assert.equal(result.success, true);
  assert.equal(result.data.profile?.databaseWriteExecuted, false);
  const chat = createLiveChatConversationMessageService({ provider: {
    source: "test", sourceLabel: "Test", readChatGraph: () => graph,
    appendMessage: () => { throw new Error("Read must not write"); },
  } });
  const conversations = await chat.listConversations();
  assert.equal(conversations.success, true);
  assert.ok(conversations.data.conversations.length > 0);
  assert.ok(connections.every(connection => !("suggestedActions" in connection)), "read must not invent a persisted next step");
});

test("mock recommendation adapter accepts omitted suggested actions without mutating fixtures", () => {
  const descriptors = defaultMockFixtures.connections.map(connection => Object.getOwnPropertyDescriptor(connection, "suggestedActions"));
  try {
    for (const connection of defaultMockFixtures.connections) Reflect.deleteProperty(connection, "suggestedActions");
    assert.equal(createMockOrbitAiContactRecommendationCandidates().length, defaultMockFixtures.contacts.length);
    assert.ok(defaultMockFixtures.connections.every(connection => !("suggestedActions" in connection)));
  } finally {
    defaultMockFixtures.connections.forEach((connection, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(connection, "suggestedActions", descriptor);
    });
  }
});
