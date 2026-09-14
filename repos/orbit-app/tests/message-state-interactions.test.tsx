import assert from "node:assert/strict";
import test from "node:test";
import {
  MESSAGE_STATE_FOREGROUND_REFRESH_MS,
  emitMessageStateInvalidation,
  relationshipConversationListToInbox,
  relationshipConversationToThread,
  relationshipReadReceiptMatches,
  relationshipReadTarget,
  subscribeMessageStateInvalidation,
} from "../src/api/message-state";

const at = "2026-09-15T00:00:00.000Z";

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: "conversation:one",
    contactId: "contact:one",
    participantAccountIds: ["actor:one", "actor:two"],
    participantDisplayNames: {
      "actor:one": "林晓宇",
      "actor:two": "曾伟",
    },
    qualificationVersion: "qualification:one",
    status: "active",
    createdAt: at,
    updatedAt: at,
    unreadCount: 1,
    messages: [
      {
        messageId: "message:one",
        conversationId: "conversation:one",
        senderAccountId: "actor:two",
        senderDisplayName: "曾伟",
        body: "周四见面，带上资料。",
        sentAt: at,
        deliveryState: "delivered",
      },
    ],
    ...overrides,
  };
}

test("real relationship conversations become an actor-scoped inbox", () => {
  const view = relationshipConversationListToInbox({
    conversations: [conversation()],
    refreshedAt: at,
  }, "actor:one");

  assert.ok(view);
  assert.equal(view.conversations.length, 1);
  assert.deepEqual(view.conversations[0], {
    contactId: "contact:one",
    id: "conversation:one",
    lastAt: "2026/09/15 09:00",
    name: "曾伟",
    nextAction: "查看新消息",
    organization: "",
    preview: "周四见面，带上资料。",
    sourceLabels: ["已验证联系人"],
    subject: "与曾伟的对话",
    unreadCount: 1,
    unreadLabel: "1 条新消息",
  });
  assert.equal(view.summary, "1 段对话 · 1 条未读消息");
});

for (const invalid of [
  { conversations: [conversation(), conversation()], refreshedAt: at },
  { conversations: [conversation({ participantAccountIds: ["actor:two", "actor:three"] })], refreshedAt: at },
  { conversations: [conversation({ status: "revoked" })], refreshedAt: at },
  { conversations: [conversation({ messages: [{ ...conversation().messages[0], conversationId: "conversation:other" }] })], refreshedAt: at },
  { conversations: [conversation({ messages: [{ ...conversation().messages[0], deliveryState: "pending" }] })], refreshedAt: at },
  { conversations: [conversation()], refreshedAt: "not-a-date" },
]) test(`foreign, revoked or malformed server content fails closed: ${JSON.stringify(invalid)}`, () => {
  assert.equal(relationshipConversationListToInbox(invalid, "actor:one"), null);
});

test("thread mapping preserves authoritative ids and marks only the remote delivered tail as read", () => {
  const raw = conversation();
  const detail = relationshipConversationToThread(raw, "actor:one");
  assert.ok(detail);
  assert.equal(detail.conversationId, "conversation:one");
  assert.equal(detail.participantName, "曾伟");
  assert.deepEqual(detail.messages.map(message => ({ id: message.id, fromMe: message.fromMe, body: message.body })), [
    { id: "message:one", fromMe: false, body: "周四见面，带上资料。" },
  ]);
  assert.deepEqual(relationshipReadTarget(raw, "actor:one"), {
    conversationId: "conversation:one",
    lastReadMessageId: "message:one",
  });
  assert.equal(relationshipReadTarget(conversation({ unreadCount: 0 }), "actor:one"), null);
});

test("read state changes only for an exact receipt with a server timestamp", () => {
  const expected = { conversationId: "conversation:one", lastReadMessageId: "message:one" };
  const receipt = { ...expected, readAt: at };
  assert.equal(relationshipReadReceiptMatches(receipt, expected), true);
  assert.equal(relationshipReadReceiptMatches({ ...receipt, conversationId: "conversation:other" }, expected), false);
  assert.equal(relationshipReadReceiptMatches({ ...receipt, lastReadMessageId: "message:other" }, expected), false);
  assert.equal(relationshipReadReceiptMatches({ ...receipt, readAt: "not-a-date" }, expected), false);
});

test("foreground refresh is bounded and state invalidation carries no private payload", () => {
  assert.equal(MESSAGE_STATE_FOREGROUND_REFRESH_MS, 15_000);
  let calls = 0;
  const unsubscribe = subscribeMessageStateInvalidation(() => { calls += 1; });
  emitMessageStateInvalidation();
  assert.equal(calls, 1);
  unsubscribe();
  emitMessageStateInvalidation();
  assert.equal(calls, 1);
});
