import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createAsyncRelationshipConversationService } from "../../features/chat/service-factory";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("async conversation service returns source-backed relationship correspondence context", async () => {
  const service = createAsyncRelationshipConversationService("mock");
  const result = await service.getCorrespondenceWorkspace({
    conversationId: "conversation_demo_aoba",
    userId: "test-user-orbit",
  });

  if (result.success === false) {
    assert.fail(result.error.message);
  }

  const workspace = result.data;

  assert.equal(workspace.currentUser.userId, "test-user-orbit");
  assert.equal(workspace.inbox.conversations.length >= 2, true);
  assert.equal(workspace.selectedThread.conversationId, "conversation_demo_aoba");
  assert.equal(workspace.selectedThread.correspondenceMode, "asynchronous");
  assert.equal(workspace.selectedThread.realtimeTransportEnabled, false);
  assert.equal(workspace.selectedThread.messages[0].deliveryState, "received_snapshot");
  assert.match(workspace.selectedThread.messages[0].body, /Yoyogi climate founder breakfast/i);
  assert.deepEqual(workspace.selectedThread.sourceContextLabels, [
    "Yoyogi climate founder breakfast",
    "Aoba follow-up task",
  ]);
  assert.equal(workspace.contact.contactId, "contact_demo_aoba");
  assert.equal(workspace.connection.connectionId, "connection_demo_aoba");
  assert.equal(workspace.event.eventId, "event_yoyogi_climate_breakfast");
  assert.equal(workspace.schedule.windows.length >= 1, true);
  assert.equal(workspace.followUpTask.taskId, "task_demo_aoba_recap");
  assert.match(workspace.draftReply.body, /recap/i);
  assert.equal(workspace.draftReply.externalSendStatus, "not_requested");
  assert.equal(workspace.nextActions.length >= 1, true);
  assert.equal(workspace.nextActions[0].actionId, "stage_reply_aoba_recap");
  assert.equal(
    workspace.nextActions[0].stageHref,
    "/app/chat?action=stage-reply&conversation=conversation_demo_aoba",
  );
  assert.deepEqual(workspace.sideEffects, {
    calendarEntryCreated: false,
    externalMessageSent: false,
    networkRequestMade: false,
    notificationDelivered: false,
    savedRecordCreated: false,
  });
});

test("async conversation action staging never sends or saves external side effects", async () => {
  const service = createAsyncRelationshipConversationService("mock");
  const result = await service.stageConversationAction({
    actionId: "stage_reply_aoba_recap",
    conversationId: "conversation_demo_aoba",
    userId: "test-user-orbit",
  });

  if (result.success === false) {
    assert.fail(result.error.message);
  }

  assert.equal(result.data.stage.actionId, "stage_reply_aoba_recap");
  assert.equal(result.data.stage.status, "staged_local_preview");
  assert.match(result.data.stage.previewBody, /Aoba/i);
  assert.match(
    result.data.stage.noSideEffectStatement,
    /No external message, notification, calendar entry, saved record, or network side effect occurred/i,
  );
  assert.deepEqual(result.data.sideEffects, {
    calendarEntryCreated: false,
    externalMessageSent: false,
    networkRequestMade: false,
    notificationDelivered: false,
    savedRecordCreated: false,
  });
});

test("async conversation service returns a visible not-found envelope for invalid conversation ids", async () => {
  const service = createAsyncRelationshipConversationService("mock");
  const result = await service.getCorrespondenceWorkspace({
    conversationId: "does_not_exist",
    userId: "test-user-orbit",
  });

  if (result.success === true) {
    assert.fail("Expected invalid conversation id to return a failure envelope.");
  }

  assert.equal(result.error.code, "ASYNC_CONVERSATION_NOT_FOUND");
  assert.equal(result.error.appCode, "NOT_FOUND");
  assert.match(
    result.error.recovery,
    /Choose a conversation from the relationship inbox/i,
  );
  assert.deepEqual(result.error.evidenceIds, [
    "evidence:conversation:async-not-found",
  ]);
});

test("async conversation implementation stays inside the no-realtime no-send boundary", () => {
  for (const path of [
    "features/chat/contract.ts",
    "features/chat/service.ts",
    "features/chat/mock-service.ts",
    "features/chat/service-factory.ts",
  ]) {
    const contents = source(path);

    assert.doesNotMatch(contents, /\bfetch\s*\(/);
    assert.doesNotMatch(contents, /WebSocket|EventSource|XMLHttpRequest/);
    assert.doesNotMatch(contents, /sendgrid|postmark|gmail|twilio|calendar\.google/i);
  }
});
