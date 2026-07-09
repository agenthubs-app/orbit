import assert from "node:assert/strict";
import test from "node:test";

import { toInboxPanelViewModel } from "../../app/(app)/app/inbox/inbox-panel-view-model";
import type { AsyncConversationWorkspacePayload } from "../../features/chat/contract";

test("relationship inbox API returns a correspondence workspace envelope", async () => {
  const route = await import("../../app/api/chat/relationship-inbox/route");
  const response = await route.GET(
    new Request("https://orbit.local/api/chat/relationship-inbox"),
  );
  const body = (await response.json()) as {
    success: boolean;
    data: AsyncConversationWorkspacePayload;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  // 收件箱 = 邮件式列表；每条含 subject/preview；选中线程含 subject + 消息流。
  assert.ok(body.data.inbox.conversations.length > 0);
  assert.ok(body.data.selectedThread.subject.length > 0);
  assert.ok(body.data.selectedThread.messages.length > 0);
  // 发送边界：所有外部副作用为 false。
  assert.equal(body.data.sideEffects.externalMessageSent, false);
  assert.equal(body.data.sideEffects.notificationDelivered, false);
  assert.equal(body.data.sideEffects.networkRequestMade, false);
  assert.equal(body.data.draftReply.externalSendStatus, "not_requested");
});

test("relationship inbox selects a specific thread when conversationId is supplied", async () => {
  const route = await import("../../app/api/chat/relationship-inbox/route");
  const listResponse = await route.GET(
    new Request("https://orbit.local/api/chat/relationship-inbox"),
  );
  const list = (await listResponse.json()) as {
    data: AsyncConversationWorkspacePayload;
  };
  const targetId =
    list.data.inbox.conversations[0]?.conversationId ?? "";

  const detailResponse = await route.GET(
    new Request(
      `https://orbit.local/api/chat/relationship-inbox?conversationId=${encodeURIComponent(targetId)}`,
    ),
  );
  const detail = (await detailResponse.json()) as {
    data: AsyncConversationWorkspacePayload;
  };

  assert.equal(detailResponse.status, 200);
  assert.equal(detail.data.selectedThread.conversationId, targetId);
});

test("inbox panel view model maps the workspace payload to UI-neutral structure", async () => {
  const route = await import("../../app/api/chat/relationship-inbox/route");
  const response = await route.GET(
    new Request("https://orbit.local/api/chat/relationship-inbox"),
  );
  const body = (await response.json()) as {
    data: AsyncConversationWorkspacePayload;
  };

  const viewModel = toInboxPanelViewModel(body.data);

  assert.ok(viewModel.title.length > 0);
  assert.ok(viewModel.threads.length > 0);
  const firstThread = viewModel.threads[0];
  assert.ok(firstThread.participantName.length > 0);
  assert.ok(firstThread.subject.length > 0);
  assert.equal(typeof firstThread.unreadCount, "number");

  assert.ok(viewModel.selected);
  // fromMe 由 senderRole 派生：至少存在一方消息，且布尔化正确。
  assert.ok(viewModel.selected.messages.length > 0);
  for (const message of viewModel.selected.messages) {
    assert.equal(typeof message.fromMe, "boolean");
  }
  // 发送边界透传给 UI。
  assert.equal(viewModel.selected.externalSendStatus, "not_requested");
  assert.equal(viewModel.selected.noExternalSideEffect, true);
});

test("chat writing-assist rewrite returns a review-only suggestion (no external send)", async () => {
  const route = await import("../../app/api/chat/assist/rewrite/route");
  const response = await route.POST(
    new Request("https://orbit.local/api/chat/assist/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: "conversation_001",
        participantName: "Test Contact",
        organization: "Test Org",
        sourceText: "hey wanna meet",
      }),
    }),
  );
  const body = (await response.json()) as {
    success: boolean;
    data: {
      assists: {
        suggestedText: string;
        sendActionRequiresConfirmation: boolean;
        externalSendRequested: boolean;
        aiProviderRequested: boolean;
      }[];
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.data.assists.length > 0);
  const suggestion = body.data.assists[0];
  assert.ok(suggestion.suggestedText.length > 0);
  // 发送边界：草稿需确认，未请求外部发送或 AI provider。
  assert.equal(suggestion.sendActionRequiresConfirmation, true);
  assert.equal(suggestion.externalSendRequested, false);
  assert.equal(suggestion.aiProviderRequested, false);
});

test("inbox thread detail carries participant + draft reply for the composer", async () => {
  const route = await import("../../app/api/chat/relationship-inbox/route");
  const response = await route.GET(
    new Request("https://orbit.local/api/chat/relationship-inbox"),
  );
  const body = (await response.json()) as {
    data: AsyncConversationWorkspacePayload;
  };
  const viewModel = toInboxPanelViewModel(body.data);

  assert.ok(viewModel.selected);
  // composer 需要的字段：participantName / organization / draftReplyBody。
  assert.ok(viewModel.selected.participantName.length > 0);
  assert.equal(typeof viewModel.selected.organization, "string");
  assert.ok(viewModel.selected.draftReplyBody.length > 0);
});

test("relationship inbox POST creates a staged thread from a draft with no side effects", async () => {
  const route = await import("../../app/api/chat/relationship-inbox/route");
  const response = await route.POST(
    new Request("https://orbit.local/api/chat/relationship-inbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        participantName: "曾伟",
        organization: "味道餐饮",
        subject: "餐饮项目合作",
        body: "曾伟你好，想聊聊我们在餐饮项目上的合作机会。",
      }),
    }),
  );
  const body = (await response.json()) as {
    success: boolean;
    data: {
      state: string;
      thread: { subject: string; messages: { body: string; senderRole: string }[] };
      inboxItem: { subject: string; participantName: string };
      sideEffects: Record<string, boolean>;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.state, "staged_created");
  assert.equal(body.data.thread.subject, "餐饮项目合作");
  assert.equal(body.data.thread.messages.length, 1);
  assert.equal(body.data.thread.messages[0].senderRole, "orbit_user");
  assert.match(body.data.thread.messages[0].body, /合作机会/);
  assert.equal(body.data.inboxItem.participantName, "曾伟");
  // 发送边界：draft→thread 创建不发送、不通知、不落库、不联网。
  assert.equal(body.data.sideEffects.externalMessageSent, false);
  assert.equal(body.data.sideEffects.notificationDelivered, false);
  assert.equal(body.data.sideEffects.savedRecordCreated, false);
  assert.equal(body.data.sideEffects.networkRequestMade, false);
});

test("relationship inbox POST fails closed when subject or body is missing", async () => {
  const route = await import("../../app/api/chat/relationship-inbox/route");
  const response = await route.POST(
    new Request("https://orbit.local/api/chat/relationship-inbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantName: "曾伟" }),
    }),
  );
  const body = (await response.json()) as {
    success: boolean;
    error: { context?: { asyncConversationErrorCode?: string } };
  };

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(
    body.error.context?.asyncConversationErrorCode,
    "ASYNC_CONVERSATION_DRAFT_CONTEXT_REQUIRED",
  );
});

test("message draft generator produces a review-only first draft (no external send)", async () => {
  const route = await import("../../app/api/message-drafts/route");
  const response = await route.POST(
    new Request("https://orbit.local/api/message-drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draftKind: "follow_up",
        channel: "email",
        recipientName: "曾伟",
        organization: "味道餐饮",
      }),
    }),
  );
  const body = (await response.json()) as {
    success: boolean;
    data: { drafts: { subject: string; body: string; sendActionRequiresConfirmation: boolean; externalSendRequested: boolean }[] };
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.data.drafts.length > 0);
  assert.ok(body.data.drafts[0].subject.length > 0);
  assert.ok(body.data.drafts[0].body.length > 0);
  assert.equal(body.data.drafts[0].sendActionRequiresConfirmation, true);
  assert.equal(body.data.drafts[0].externalSendRequested, false);
});
