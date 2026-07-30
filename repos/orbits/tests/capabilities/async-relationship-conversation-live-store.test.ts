import assert from "node:assert/strict";
import test from "node:test";

import { createLiveAsyncRelationshipConversationService } from "../../features/chat/live-async-service";
import {
  createConfiguredStorageAsyncRelationshipConversationProvider,
  createStorageAsyncRelationshipConversationProvider,
} from "../../features/chat/storage/async-relationship-conversation-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("live relationship inbox persists reviewed drafts and reads them back for the same actor only", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageAsyncRelationshipConversationProvider({
    createId: () => "draft-001",
    store,
    workspaceId: "workspace:async-inbox-live",
  });
  const service = createLiveAsyncRelationshipConversationService({ provider });

  const empty = await service.getCorrespondenceWorkspace({
    actorDisplayName: "测试用户",
    actorId: "actor:a",
  });

  assert.equal(empty.success, true);
  if (!empty.success) return;
  assert.equal(empty.data.state, "empty");
  assert.deepEqual(empty.data.inbox.conversations, []);

  const created = await service.createConversationFromDraft({
    actorDisplayName: "测试用户",
    actorId: "actor:a",
    body: "林玫你好，想继续讨论你提到的硬科技项目筛选标准。",
    contactId: "contact:lin-mei",
    organization: "港湾创投",
    participantName: "林玫",
    sourceLabel: "联系人详情页 AI 草稿复核",
    stagedAt: "2026-07-28T05:00:00.000Z",
    subject: "硬科技项目后续交流",
  });

  assert.equal(created.success, true);
  if (!created.success) return;
  assert.equal(created.data.state, "saved_draft_created");
  assert.equal(created.data.sideEffects.savedRecordCreated, true);
  assert.equal(created.data.sideEffects.externalMessageSent, false);
  assert.equal(created.data.sideEffects.notificationDelivered, false);
  assert.equal(created.data.sideEffects.calendarEntryCreated, false);
  assert.equal(created.data.sideEffects.networkRequestMade, false);

  // Recreate both provider and service around the same durable store to prove
  // that the result is not process-local service state.
  const reloadedService = createLiveAsyncRelationshipConversationService({
    provider: createStorageAsyncRelationshipConversationProvider({
      createId: () => "unused",
      store,
      workspaceId: "workspace:async-inbox-live",
    }),
  });
  const ownerWorkspace = await reloadedService.getCorrespondenceWorkspace({
    actorDisplayName: "测试用户",
    actorId: "actor:a",
    conversationId: created.data.thread.conversationId,
  });
  const otherWorkspace = await reloadedService.getCorrespondenceWorkspace({
    actorDisplayName: "其他用户",
    actorId: "actor:b",
  });

  assert.equal(ownerWorkspace.success, true);
  if (!ownerWorkspace.success) return;
  assert.equal(ownerWorkspace.data.state, "success");
  if (ownerWorkspace.data.state !== "success") return;
  assert.equal(
    ownerWorkspace.data.selectedThread.conversationId,
    created.data.thread.conversationId,
  );
  assert.equal(ownerWorkspace.data.contact.displayName, "林玫");
  assert.match(
    ownerWorkspace.data.selectedThread.messages[0]?.body ?? "",
    /硬科技项目筛选标准/,
  );
  assert.equal(
    ownerWorkspace.data.provenance.privacy,
    "actor-scoped-live-relationship-correspondence",
  );

  assert.equal(otherWorkspace.success, true);
  if (!otherWorkspace.success) return;
  assert.equal(otherWorkspace.data.state, "empty");
  assert.deepEqual(otherWorkspace.data.inbox.conversations, []);
});

test("live relationship inbox fails closed without actor or configured storage", async () => {
  const unconfigured = createLiveAsyncRelationshipConversationService();
  const missingStore = await unconfigured.getCorrespondenceWorkspace({
    actorId: "actor:a",
  });
  const provider = createStorageAsyncRelationshipConversationProvider({
    store: createMemoryLiveRecordStore(),
    workspaceId: "workspace:async-inbox-actor-guard",
  });
  const guarded = createLiveAsyncRelationshipConversationService({ provider });
  const missingActor = await guarded.getCorrespondenceWorkspace();

  assert.equal(missingStore.success, false);
  if (!missingStore.success) {
    assert.equal(
      missingStore.error.code,
      "ASYNC_CONVERSATION_LIVE_STORE_UNCONFIGURED",
    );
  }
  assert.equal(missingActor.success, false);
  if (!missingActor.success) {
    assert.equal(missingActor.error.code, "ASYNC_CONVERSATION_ACTOR_REQUIRED");
  }
});

test("live relationship inbox replays one request id without creating a duplicate draft", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  let generatedIds = 0;
  const provider = createStorageAsyncRelationshipConversationProvider({
    createId: () => `generated-${++generatedIds}`,
    store,
    workspaceId: "workspace:async-inbox-idempotency",
  });
  const service = createLiveAsyncRelationshipConversationService({ provider });
  const input = {
    actorDisplayName: "测试用户",
    actorId: "actor:a",
    body: "第一次确认的正文。",
    contactId: "contact:lin-mei",
    organization: "港湾创投",
    participantName: "林玫",
    requestId: "request:stable:001",
    sourceLabel: "联系人详情页草稿",
    stagedAt: "2026-07-29T05:00:00.000Z",
    subject: "第一次确认的主题",
  };

  const first = await service.createConversationFromDraft(input);
  const replay = await service.createConversationFromDraft({
    ...input,
    body: "重放时被篡改的正文不应覆盖第一次确认。",
    stagedAt: "2026-07-29T05:01:00.000Z",
    subject: "重放时被篡改的主题",
  });
  const workspace = await service.getCorrespondenceWorkspace({
    actorId: "actor:a",
  });

  assert.equal(first.success, true);
  assert.equal(replay.success, true);
  if (!first.success || !replay.success || !workspace.success) return;
  assert.equal(first.data.thread.conversationId, replay.data.thread.conversationId);
  assert.equal(replay.data.thread.subject, "第一次确认的主题");
  assert.equal(workspace.data.inbox.conversations.length, 1);
  assert.equal(generatedIds, 0, "requestId-backed drafts must not use random identity");
});

test("configured relationship inbox cache is isolated by database connection and stable within one database", () => {
  const shared = {
    ORBIT_WORKSPACE_ID: "workspace:async-inbox-cache-isolation",
  };
  const primaryEnv = {
    ...shared,
    ORBIT_DATABASE_URL:
      "postgresql://orbit_test:orbit_test@127.0.0.1:5432/orbit_primary",
  };
  const secondaryEnv = {
    ...shared,
    ORBIT_DATABASE_URL:
      "postgresql://orbit_test:orbit_test@127.0.0.1:5432/orbit_secondary",
  };

  const primary = createConfiguredStorageAsyncRelationshipConversationProvider({
    env: primaryEnv,
  });
  const primaryAgain =
    createConfiguredStorageAsyncRelationshipConversationProvider({
      env: primaryEnv,
    });
  const secondary =
    createConfiguredStorageAsyncRelationshipConversationProvider({
      env: secondaryEnv,
    });

  assert.ok(primary);
  assert.equal(primaryAgain, primary);
  assert.ok(secondary);
  assert.notEqual(secondary, primary);
});
